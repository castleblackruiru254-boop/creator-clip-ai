-- CLEAN EMERGENCY FIX (handles existing objects)
-- This version won't give "already exists" errors

-- 1. Create profiles table (with conflict handling)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  credits_remaining INTEGER DEFAULT 10 CHECK (credits_remaining >= 0),
  total_projects INTEGER DEFAULT 0,
  total_clips INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create processing_queue table
CREATE TABLE IF NOT EXISTS processing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('process_video', 'generate_clip', 'generate_subtitles')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  payload JSONB NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (safe to run multiple times)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

-- 5. Drop and recreate policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
DROP POLICY IF EXISTS "Users can view their own jobs" ON processing_queue;

-- Now create the policies
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view their own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own jobs" ON processing_queue
  FOR SELECT USING (user_id = auth.uid());

-- 6. Create/recreate the user profile function
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = NEW.email,
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', profiles.full_name),
    last_activity_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create/recreate trigger
DROP TRIGGER IF EXISTS create_user_profile_trigger ON auth.users;
CREATE TRIGGER create_user_profile_trigger
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- 8. Create/recreate RPC function
CREATE OR REPLACE FUNCTION get_user_active_jobs(p_user_id UUID)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  job_status TEXT,
  job_progress INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pq.id as job_id,
    pq.type as job_type,
    pq.status as job_status,
    pq.progress as job_progress,
    pq.created_at
  FROM processing_queue pq
  WHERE pq.user_id = p_user_id
    AND pq.status IN ('pending', 'processing')
  ORDER BY pq.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Grant permissions (safe to run multiple times)
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON processing_queue TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_jobs(UUID) TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 10. Create storage buckets (with conflict handling)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('videos', 'videos', false, 2147483648, ARRAY['video/mp4', 'video/webm', 'video/quicktime']),
  ('thumbnails', 'thumbnails', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Final verification query
SELECT 
  'SUCCESS: Database setup completed!' as status,
  (SELECT COUNT(*) FROM pg_tables WHERE tablename IN ('profiles', 'projects', 'processing_queue')) as tables_created,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name IN ('create_user_profile', 'get_user_active_jobs')) as functions_created;
