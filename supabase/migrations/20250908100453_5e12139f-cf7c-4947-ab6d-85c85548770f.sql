-- Fix production security issues and ensure authentication is production-ready (corrected)

-- 1. Fix function search paths for security 
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 2. Add RLS policies for user_clips table (fixed typo)
CREATE POLICY "Users can view their own clips" ON public.user_clips
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clips" ON public.user_clips  
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clips" ON public.user_clips
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clips" ON public.user_clips
FOR DELETE USING (auth.uid() = user_id);

-- 3. Create a function to safely handle auth events
CREATE OR REPLACE FUNCTION public.update_user_last_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update profiles table when user signs in
  UPDATE public.profiles 
  SET updated_at = NOW()
  WHERE id = NEW.id;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If any error occurs, just return NEW to not block auth
  RETURN NEW;
END;
$$;

-- 4. Create trigger to update last activity safely
DROP TRIGGER IF EXISTS on_auth_user_activity ON auth.users;
CREATE TRIGGER on_auth_user_activity
  AFTER UPDATE ON auth.users
  FOR EACH ROW 
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.update_user_last_activity();

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

-- 6. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON public.projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_processing_queue_user_status ON public.processing_queue(user_id, status);