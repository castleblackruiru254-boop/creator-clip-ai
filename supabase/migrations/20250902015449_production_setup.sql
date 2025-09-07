-- Production setup: Real-time, indexes, constraints, and utility functions

-- Set replica identity to full for real-time updates
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.clips REPLICA IDENTITY FULL;
ALTER TABLE public.subtitles REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Add tables to supabase_realtime publication for real-time functionality
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subtitles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id_created_at ON public.projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_project_id_created_at ON public.clips(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_status ON public.clips(status);
CREATE INDEX IF NOT EXISTS idx_subtitles_clip_id ON public.subtitles(clip_id);

-- Add data integrity constraints
ALTER TABLE public.projects 
  DROP CONSTRAINT IF EXISTS check_status_valid CASCADE;
ALTER TABLE public.projects 
  ADD CONSTRAINT check_status_valid 
  CHECK (status IN ('draft', 'processing', 'completed', 'failed', 'paused'));

ALTER TABLE public.clips 
  DROP CONSTRAINT IF EXISTS check_status_valid CASCADE;
ALTER TABLE public.clips 
  ADD CONSTRAINT check_status_valid 
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE public.clips 
  DROP CONSTRAINT IF EXISTS check_times_valid CASCADE;
ALTER TABLE public.clips 
  ADD CONSTRAINT check_times_valid 
  CHECK (start_time >= 0 AND end_time > start_time AND duration > 0);

ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS check_subscription_tier_valid CASCADE;
ALTER TABLE public.profiles 
  ADD CONSTRAINT check_subscription_tier_valid 
  CHECK (subscription_tier IN ('free', 'pro', 'enterprise'));

ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS check_credits_non_negative CASCADE;
ALTER TABLE public.profiles 
  ADD CONSTRAINT check_credits_non_negative 
  CHECK (credits_remaining >= 0);

-- Drop existing triggers if they exist and recreate
DROP TRIGGER IF EXISTS update_clips_updated_at ON public.clips;
CREATE TRIGGER update_clips_updated_at
  BEFORE UPDATE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Utility functions for production use
CREATE OR REPLACE FUNCTION public.get_user_project_count(user_uuid UUID)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER 
  FROM public.projects 
  WHERE user_id = user_uuid;
$$;

CREATE OR REPLACE FUNCTION public.get_user_clips_count(user_uuid UUID)
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER 
  FROM public.clips c
  JOIN public.projects p ON c.project_id = p.id
  WHERE p.user_id = user_uuid;
$$;





 
 
 
