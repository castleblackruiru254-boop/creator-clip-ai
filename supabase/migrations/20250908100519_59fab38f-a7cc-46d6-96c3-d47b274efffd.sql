-- Fix remaining function search path security warnings
ALTER FUNCTION public.get_user_project_count(uuid) SET search_path = public;
ALTER FUNCTION public.get_user_clips_count(uuid) SET search_path = public;

-- Ensure all functions have proper search path
ALTER FUNCTION public.create_user_profile() SET search_path = public;
ALTER FUNCTION public.get_user_active_jobs(uuid) SET search_path = public;