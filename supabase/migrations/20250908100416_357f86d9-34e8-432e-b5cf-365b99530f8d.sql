-- Fix production security issues and ensure authentication is production-ready

-- 1. Fix function search paths for security
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 2. Add RLS policies for user_clips table (which currently has RLS enabled but no policies)
CREATE POLICY "Users can view their own clips" ON public.user_clips
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clips" ON public.user_clips  
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clips" ON public.user_clips
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clips" ON public.user_clips
FOR DELETE USING (auth.uid() = user_user);

-- 3. Create a function to safely update user last_sign_in (to prevent the trigger error)
CREATE OR REPLACE FUNCTION public.update_user_last_sign_in()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only update if profiles table exists and user has a profile
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'profiles' AND table_schema = 'public'
  ) THEN
    UPDATE public.profiles 
    SET updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Create trigger to update last sign in safely
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW 
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.update_user_last_sign_in();

-- 5. Ensure all existing users have profiles
INSERT INTO public.profiles (id, email, full_name)
SELECT 
    au.id, 
    au.email, 
    COALESCE(
        au.raw_user_meta_data->>'full_name',
        au.raw_user_meta_data->>'name',
        SPLIT_PART(au.email, '@', 1)
    )
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

-- 6. Create comprehensive indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processing_queue_user_status ON public.processing_queue(user_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clips_project_status ON public.clips(project_id, status);