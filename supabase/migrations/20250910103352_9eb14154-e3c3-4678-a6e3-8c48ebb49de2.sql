-- Fix critical security issue: Remove anon access to profiles table
-- and clean up duplicate policies

-- Drop existing problematic policies
DROP POLICY IF EXISTS "profiles select own" ON public.profiles;
DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own" ON public.profiles;
DROP POLICY IF EXISTS "profiles delete own" ON public.profiles;

-- Drop duplicate service role policies  
DROP POLICY IF EXISTS "Profiles service_role update all" ON public.profiles;
DROP POLICY IF EXISTS "profiles service_role update all" ON public.profiles;
DROP POLICY IF EXISTS "profiles service_role select all" ON public.profiles;
DROP POLICY IF EXISTS "profiles service_role delete all" ON public.profiles;
DROP POLICY IF EXISTS "Service role can update" ON public.profiles;

-- Create secure, non-duplicate policies (authenticated users only)
CREATE POLICY "authenticated_users_select_own_profile" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

CREATE POLICY "authenticated_users_insert_own_profile" 
ON public.profiles 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

CREATE POLICY "authenticated_users_update_own_profile" 
ON public.profiles 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

CREATE POLICY "authenticated_users_delete_own_profile" 
ON public.profiles 
FOR DELETE 
TO authenticated 
USING (auth.uid() = id);

-- Service role policies (for system operations)
CREATE POLICY "service_role_full_access" 
ON public.profiles 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);