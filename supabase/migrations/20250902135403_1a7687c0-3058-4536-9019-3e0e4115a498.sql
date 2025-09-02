-- Enable real-time for all tables and fix production issues

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

-- Add indexes for better performance on frequently queried columns
CREATE INDEX IF NOT EXISTS idx_projects_user_id_created_at ON public.projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_project_id_created_at ON public.clips(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_status ON public.clips(status);
CREATE INDEX IF NOT EXISTS idx_subtitles_clip_id ON public.subtitles(clip_id);

-- Add constraints to ensure data integrity
ALTER TABLE public.projects 
  ADD CONSTRAINT check_status_valid 
  CHECK (status IN ('draft', 'processing', 'completed', 'failed', 'paused'));

ALTER TABLE public.clips 
  ADD CONSTRAINT check_status_valid 
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE public.clips 
  ADD CONSTRAINT check_times_valid 
  CHECK (start_time >= 0 AND end_time > start_time AND duration > 0);

ALTER TABLE public.profiles 
  ADD CONSTRAINT check_subscription_tier_valid 
  CHECK (subscription_tier IN ('free', 'pro', 'enterprise'));

ALTER TABLE public.profiles 
  ADD CONSTRAINT check_credits_non_negative 
  CHECK (credits_remaining >= 0);

-- Add updated_at triggers for all tables
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clips_updated_at
  BEFORE UPDATE ON public.clips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add function to clean up old temp uploads (housekeeping)
CREATE OR REPLACE FUNCTION public.cleanup_old_temp_uploads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This would be called by a scheduled function to clean up temp files older than 24 hours
  -- Implementation would use storage API to delete old files
  -- For now, just a placeholder that logs the cleanup attempt
  RAISE NOTICE 'Cleanup function called at %', now();
END;
$$;

-- Add function to get user's project count (useful for limits)
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

-- Add function to get user's total clips count
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