-- EMERGENCY DATABASE FIX
-- Copy and paste this entire script into your Supabase SQL Editor and run it
-- This will fix the "Database error granting user" and 500 authentication errors

-- 1. Create profiles table first (this is causing the auth 500 error)
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

-- 2. Create projects table (for health checks)
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

-- 3. Create processing_queue table (for the 404 errors)
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

-- 4. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

-- 5. Create basic RLS policies
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

-- 6. Create the user profile creation function (CRITICAL for auth)
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

-- 7. Create trigger for automatic profile creation
DROP TRIGGER IF EXISTS create_user_profile_trigger ON auth.users;
CREATE TRIGGER create_user_profile_trigger
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- 8. Create the RPC function for active jobs
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

-- 9. Grant necessary permissions
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON processing_queue TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_jobs(UUID) TO authenticated;

-- 10. Service role permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 11. Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('videos', 'videos', false, 2147483648, ARRAY['video/mp4', 'video/webm', 'video/quicktime']),
  ('thumbnails', 'thumbnails', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Success message
SELECT 'EMERGENCY FIX COMPLETED! Authentication should now work.' as status;
