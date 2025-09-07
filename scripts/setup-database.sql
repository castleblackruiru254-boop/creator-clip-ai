-- Production Database Setup Script
-- This script creates all necessary tables, functions, and policies for the Creator Clip AI application

-- ============================
-- Core Tables Setup
-- ============================

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
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  billing_customer_id TEXT,
  billing_subscription_id TEXT,
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'cancelled', 'past_due', 'unpaid')),
  subscription_current_period_end TIMESTAMPTZ,
  preferences JSONB DEFAULT '{}'
);

-- Create projects table if it doesn't exist
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

-- Create clips table if it doesn't exist
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

-- Create subtitles table if it doesn't exist
CREATE TABLE IF NOT EXISTS subtitles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clip_id UUID NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  start_time NUMERIC NOT NULL,
  end_time NUMERIC NOT NULL,
  text TEXT NOT NULL,
  confidence NUMERIC DEFAULT 1.0,
  speaker_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create processing_queue table if it doesn't exist (from migration)
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

-- Create user_clips table for freemium tracking
CREATE TABLE IF NOT EXISTS user_clips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicate entries
  UNIQUE(user_id, clip_id)
);

-- ============================
-- Functions and Triggers Setup
-- ============================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clips_updated_at ON clips;
CREATE TRIGGER update_clips_updated_at
  BEFORE UPDATE ON clips
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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

-- Function to get user active subscription
CREATE OR REPLACE FUNCTION get_user_active_subscription(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  status TEXT,
  credits_remaining INTEGER,
  subscription_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.subscription_tier,
    p.subscription_status,
    p.credits_remaining,
    p.subscription_current_period_end
  FROM profiles p
  WHERE p.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user active jobs
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
    -- Estimate completion time based on current progress
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

-- ============================
-- Indexes for Performance
-- ============================

-- Primary indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription ON profiles(subscription_tier, subscription_status);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_user_created ON projects(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
CREATE INDEX IF NOT EXISTS idx_clips_platform ON clips(platform);
CREATE INDEX IF NOT EXISTS idx_clips_ai_score ON clips(ai_score DESC);

CREATE INDEX IF NOT EXISTS idx_subtitles_clip_id ON subtitles(clip_id);
CREATE INDEX IF NOT EXISTS idx_subtitles_timing ON subtitles(clip_id, start_time);

CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_user_id ON processing_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_queue_priority ON processing_queue(priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_user_clips_user_id ON user_clips(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clips_created_at ON user_clips(user_id, created_at DESC);

-- ============================
-- Row Level Security (RLS)
-- ============================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtitles ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clips ENABLE ROW LEVEL SECURITY;

-- Profiles policies
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

DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;
CREATE POLICY "Users can delete their own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

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

DROP POLICY IF EXISTS "Users can update their own clips" ON clips;
CREATE POLICY "Users can update their own clips" ON clips
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = clips.project_id 
      AND projects.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own clips" ON clips;
CREATE POLICY "Users can delete their own clips" ON clips
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = clips.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- Subtitles policies
DROP POLICY IF EXISTS "Users can view subtitles for their clips" ON subtitles;
CREATE POLICY "Users can view subtitles for their clips" ON subtitles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clips 
      JOIN projects ON projects.id = clips.project_id
      WHERE clips.id = subtitles.clip_id 
      AND projects.user_id = auth.uid()
    )
  );

-- Processing queue policies
DROP POLICY IF EXISTS "Users can view their own jobs" ON processing_queue;
CREATE POLICY "Users can view their own jobs" ON processing_queue
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own jobs" ON processing_queue;
CREATE POLICY "Users can insert their own jobs" ON processing_queue
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own jobs" ON processing_queue;
CREATE POLICY "Users can update their own jobs" ON processing_queue
  FOR UPDATE USING (user_id = auth.uid());

-- User clips policies (for usage tracking)
DROP POLICY IF EXISTS "Users can view their own clip usage" ON user_clips;
CREATE POLICY "Users can view their own clip usage" ON user_clips
  FOR SELECT USING (user_id = auth.uid());

-- Service role policies (for Edge Functions)
DROP POLICY IF EXISTS "Service role can access all profiles" ON profiles;
CREATE POLICY "Service role can access all profiles" ON profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can access all projects" ON projects;
CREATE POLICY "Service role can access all projects" ON projects
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can access all clips" ON clips;
CREATE POLICY "Service role can access all clips" ON clips
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can access all subtitles" ON subtitles;
CREATE POLICY "Service role can access all subtitles" ON subtitles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can access all jobs" ON processing_queue;
CREATE POLICY "Service role can access all jobs" ON processing_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role can access all user clips" ON user_clips;
CREATE POLICY "Service role can access all user clips" ON user_clips
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================
-- Storage Buckets Setup
-- ============================

-- Insert storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('video-uploads', 'video-uploads', false, 2147483648, ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']), -- 2GB limit
  ('processed-clips', 'processed-clips', true, 524288000, ARRAY['video/mp4', 'video/webm']), -- 500MB limit
  ('thumbnails', 'thumbnails', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']), -- 10MB limit
  ('temp-files', 'temp-files', false, 1073741824, ARRAY['video/*', 'audio/*', 'application/json']) -- 1GB limit
ON CONFLICT (id) DO NOTHING;

-- ============================
-- Final Grants and Permissions
-- ============================

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant storage permissions
GRANT ALL ON storage.buckets TO authenticated;
GRANT ALL ON storage.objects TO authenticated;

-- Grant service role full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================
-- Data Validation
-- ============================

-- Add constraints for data integrity
ALTER TABLE profiles 
  ADD CONSTRAINT check_subscription_tier_valid 
  CHECK (subscription_tier IN ('free', 'pro', 'enterprise'))
  NOT VALID;

ALTER TABLE profiles 
  ADD CONSTRAINT check_credits_non_negative 
  CHECK (credits_remaining >= 0)
  NOT VALID;

ALTER TABLE clips 
  ADD CONSTRAINT check_times_valid 
  CHECK (start_time >= 0 AND end_time > start_time AND duration > 0)
  NOT VALID;

ALTER TABLE clips 
  ADD CONSTRAINT check_ai_score_range 
  CHECK (ai_score >= 0 AND ai_score <= 1)
  NOT VALID;

-- Validate constraints
ALTER TABLE profiles VALIDATE CONSTRAINT check_subscription_tier_valid;
ALTER TABLE profiles VALIDATE CONSTRAINT check_credits_non_negative;
ALTER TABLE clips VALIDATE CONSTRAINT check_times_valid;
ALTER TABLE clips VALIDATE CONSTRAINT check_ai_score_range;

-- Success message
SELECT 'Database setup completed successfully! All tables, functions, and policies are now ready for production.' as status;
