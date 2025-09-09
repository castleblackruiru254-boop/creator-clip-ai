-- Production‑ready migration using bigint identity primary keys
-- 0️⃣  Extensions --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1️⃣  Profiles ---------------------------------------------------------------
-- id must stay UUID because it references auth.users(id)
CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  full_name         TEXT,
  avatar_url        TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free','starter','pro','enterprise')),
  credits_remaining INTEGER DEFAULT 5 CHECK (credits_remaining >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at  TIMESTAMPTZ DEFAULT now(),
  last_sign_in      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_profiles_email              ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier  ON public.profiles(subscription_tier);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;

-- 2️⃣  Projects ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id                 BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  source_video_url   TEXT,
  source_video_duration INTEGER,
  status             TEXT DEFAULT 'draft' CHECK (status IN ('draft','processing','completed','failed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated, service_role;

-- 3️⃣  Clips ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clips (
  id           BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id   BIGINT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  video_url    TEXT,
  thumbnail_url TEXT,
  start_time   INTEGER NOT NULL,
  end_time     INTEGER NOT NULL,
  duration     INTEGER NOT NULL,
  platform     TEXT CHECK (platform IN ('tiktok','youtube_shorts','instagram_reels','all')),
  ai_score     DECIMAL(3,2),
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clips_project_id ON public.clips(project_id);

ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clips TO authenticated, service_role;

-- 4️⃣  Subtitles ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subtitles (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  clip_id    BIGINT NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  start_time DECIMAL(10,3) NOT NULL,
  end_time   DECIMAL(10,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtitles_clip_id ON public.subtitles(clip_id);

ALTER TABLE public.subtitles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subtitles TO authenticated, service_role;

--------------------------------------------------------------------
-- 5️⃣  RLS policies (authenticated only, service_role gets full access)
--------------------------------------------------------------------
-- Profiles
CREATE POLICY "profiles select own"
ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "profiles update own"
ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles insert own"
ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles service_role all"
ON public.profiles
FOR ALL TO service_role USING (true);

-- Projects
CREATE POLICY "projects select own"
ON public.projects
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "projects insert own"
ON public.projects
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects update own"
ON public.projects
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects delete own"
ON public.projects
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "projects service_role all"
ON public.projects
FOR ALL TO service_role USING (true);

-- Clips
CREATE POLICY "clips select own"
ON public.clips
FOR SELECT TO authenticated
USING (EXISTS (
   SELECT 1 FROM public.projects
   WHERE projects.id = clips.project_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "clips insert own"
ON public.clips
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
   SELECT 1 FROM public.projects
   WHERE projects.id = clips.project_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "clips update own"
ON public.clips
FOR UPDATE TO authenticated
USING (EXISTS (
   SELECT 1 FROM public.projects
   WHERE projects.id = clips.project_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "clips delete own"
ON public.clips
FOR DELETE TO authenticated
USING (EXISTS (
   SELECT 1 FROM public.projects
   WHERE projects.id = clips.project_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "clips service_role all"
ON public.clips
FOR ALL TO service_role USING (true);

-- Subtitles
CREATE POLICY "subtitles select own"
ON public.subtitles
FOR SELECT TO authenticated
USING (EXISTS (
   SELECT 1 FROM public.clips
   JOIN public.projects ON clips.project_id = projects.id
   WHERE clips.id = subtitles.clip_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "subtitles insert own"
ON public.subtitles
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
   SELECT 1 FROM public.clips
   JOIN public.projects ON clips.project_id = projects.id
   WHERE clips.id = subtitles.clip_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "subtitles update own"
ON public.subtitles
FOR UPDATE TO authenticated
USING (EXISTS (
   SELECT 1 FROM public.clips
   JOIN public.projects ON clips.project_id = projects.id
   WHERE clips.id = subtitles.clip_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "subtitles delete own"
ON public.subtitles
FOR DELETE TO authenticated
USING (EXISTS (
   SELECT 1 FROM public.clips
   JOIN public.projects ON clips.project_id = projects.id
   WHERE clips.id = subtitles.clip_id
     AND projects.user_id = auth.uid()
));

CREATE POLICY "subtitles service_role all"
ON public.subtitles
FOR ALL TO service_role USING (true);

--------------------------------------------------------------------
-- 6️⃣  Helper functions & triggers
--------------------------------------------------------------------
-- Auto‑create a profile when a new auth user appears
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, last_activity_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Automatic updated_at bump
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clips_updated_at
BEFORE UPDATE ON public.clips
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subtitles_updated_at
BEFORE UPDATE ON public.subtitles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Protect fields that should only be touched by the service role
CREATE OR REPLACE FUNCTION public.block_non_last_sign_in_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Service role can do anything
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Cannot update id field' USING ERRCODE = '42501';
  END IF;
  IF NEW.email <> OLD.email THEN
    RAISE EXCEPTION 'Cannot update email field directly' USING ERRCODE = '42501';
  END IF;
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    RAISE EXCEPTION 'Cannot update full_name field directly' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Cannot update created_at field' USING ERRCODE = '42501';
  END IF;

  -- Credits can only be changed by the owner (or service role, caught above)
  IF NEW.credits_remaining <> OLD.credits_remaining THEN
    IF auth.uid() <> OLD.id THEN
      RAISE EXCEPTION 'Cannot update credits_remaining field' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validate subscription tier if it changes
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    IF NEW.subscription_tier NOT IN ('free','starter','pro','enterprise') THEN
      RAISE EXCEPTION 'Invalid subscription tier: %', NEW.subscription_tier USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER block_non_last_sign_in_updates
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.block_non_last_sign_in_updates();