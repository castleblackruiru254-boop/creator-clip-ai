-- Quick Database Setup for Creator Clip AI
-- Run this in your Supabase SQL Editor to resolve the 404 errors

-- Create processing_queue table (this is causing the 404 errors)
CREATE TABLE IF NOT EXISTS processing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('process_video', 'generate_clip', 'generate_subtitles')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  payload JSONB NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

-- Create profiles table if it doesn't exist
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

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  video_title TEXT,
  video_duration INTEGER,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  total_clips INTEGER DEFAULT 0,
  completed_clips INTEGER DEFAULT 0,
  processing_job_id UUID,
  metadata JSONB DEFAULT '{}'
);

-- Create clips table
CREATE TABLE IF NOT EXISTS clips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time NUMERIC NOT NULL CHECK (start_time >= 0),
  end_time NUMERIC NOT NULL CHECK (end_time > start_time),
  duration NUMERIC NOT NULL CHECK (duration > 0),
  video_url TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  platform TEXT DEFAULT 'all' CHECK (platform IN ('tiktok', 'youtube_shorts', 'instagram_reels', 'all')),
  ai_score NUMERIC DEFAULT 0.5 CHECK (ai_score >= 0 AND ai_score <= 1),
  keywords TEXT[],
  viral_factors JSONB DEFAULT '[]',
  processing_job_id UUID,
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  file_size BIGINT,
  resolution TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_clips table for usage tracking
CREATE TABLE IF NOT EXISTS user_clips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, clip_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_user_id ON processing_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_queue_priority ON processing_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
CREATE INDEX IF NOT EXISTS idx_user_clips_user_id ON user_clips(user_id);

-- Enable Row Level Security
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clips ENABLE ROW LEVEL SECURITY;

-- RLS Policies for processing_queue
DROP POLICY IF EXISTS "Users can view their own jobs" ON processing_queue;
CREATE POLICY "Users can view their own jobs" ON processing_queue
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own jobs" ON processing_queue;
CREATE POLICY "Users can insert their own jobs" ON processing_queue
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own jobs" ON processing_queue;
CREATE POLICY "Users can update their own jobs" ON processing_queue
  FOR UPDATE USING (user_id = auth.uid());

-- Service role policies
DROP POLICY IF EXISTS "Service role can access all jobs" ON processing_queue;
CREATE POLICY "Service role can access all jobs" ON processing_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects policies
DROP POLICY IF EXISTS "Users can view their own projects" ON projects;
CREATE POLICY "Users can view their own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
CREATE POLICY "Users can update their own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

-- Clips policies
DROP POLICY IF EXISTS "Users can view their own clips" ON clips;
CREATE POLICY "Users can view their own clips" ON clips
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = clips.project_id 
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert clips for their projects" ON clips;
CREATE POLICY "Users can insert clips for their projects" ON clips
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = clips.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- Function to get user active jobs (this is causing the RPC 404 error)
CREATE OR REPLACE FUNCTION get_user_active_jobs(p_user_id UUID)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  job_status TEXT,
  job_progress INTEGER,
  created_at TIMESTAMPTZ,
  estimated_completion TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pq.id as job_id,
    pq.type as job_type,
    pq.status as job_status,
    pq.progress as job_progress,
    pq.created_at,
    CASE 
      WHEN pq.status = 'processing' AND pq.progress > 10 THEN
        pq.started_at + (
          (NOW() - pq.started_at) * (100.0 / GREATEST(pq.progress, 1))
        )::INTERVAL
      ELSE NULL
    END as estimated_completion
  FROM processing_queue pq
  WHERE pq.user_id = p_user_id
    AND pq.status IN ('pending', 'processing')
  ORDER BY pq.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create user profile on signup
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

-- Trigger for user profile creation
DROP TRIGGER IF EXISTS create_user_profile_trigger ON auth.users;
CREATE TRIGGER create_user_profile_trigger
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- Grant permissions
GRANT ALL ON processing_queue TO authenticated;
GRANT ALL ON profiles TO authenticated;
GRANT ALL ON projects TO authenticated;
GRANT ALL ON clips TO authenticated;
GRANT ALL ON user_clips TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_jobs(UUID) TO authenticated;

-- Service role permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Success message
SELECT 'Database setup completed! The 404 errors should now be resolved.' as status;
