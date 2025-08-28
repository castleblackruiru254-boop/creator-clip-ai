-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro', 'enterprise')),
  credits_remaining INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create projects table for video projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  source_video_url TEXT,
  source_video_duration INTEGER, -- in seconds
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create clips table for generated short clips
CREATE TABLE public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  video_url TEXT,
  thumbnail_url TEXT,
  start_time INTEGER NOT NULL, -- in seconds
  end_time INTEGER NOT NULL, -- in seconds
  duration INTEGER NOT NULL, -- in seconds
  platform TEXT CHECK (platform IN ('tiktok', 'youtube_shorts', 'instagram_reels', 'all')),
  ai_score DECIMAL(3,2), -- AI engagement prediction score (0.00-1.00)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create subtitles table
CREATE TABLE public.subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  start_time DECIMAL(10,3) NOT NULL, -- in seconds with millisecond precision
  end_time DECIMAL(10,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtitles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Create RLS policies for projects
CREATE POLICY "Users can view their own projects"
ON public.projects FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
ON public.projects FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
ON public.projects FOR DELETE
USING (auth.uid() = user_id);

-- Create RLS policies for clips
CREATE POLICY "Users can view clips from their projects"
ON public.clips FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = clips.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can create clips for their projects"
ON public.clips FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = clips.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update clips from their projects"
ON public.clips FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = clips.project_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can delete clips from their projects"
ON public.clips FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = clips.project_id 
  AND projects.user_id = auth.uid()
));

-- Create RLS policies for subtitles
CREATE POLICY "Users can view subtitles from their clips"
ON public.subtitles FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.clips 
  JOIN public.projects ON clips.project_id = projects.id
  WHERE clips.id = subtitles.clip_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can create subtitles for their clips"
ON public.subtitles FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.clips 
  JOIN public.projects ON clips.project_id = projects.id
  WHERE clips.id = subtitles.clip_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update subtitles from their clips"
ON public.subtitles FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.clips 
  JOIN public.projects ON clips.project_id = projects.id
  WHERE clips.id = subtitles.clip_id 
  AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can delete subtitles from their clips"
ON public.subtitles FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.clips 
  JOIN public.projects ON clips.project_id = projects.id
  WHERE clips.id = subtitles.clip_id 
  AND projects.user_id = auth.uid()
));

-- Create function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  );
  RETURN NEW;
END;
$$;

-- Create trigger to automatically create profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clips_updated_at
  BEFORE UPDATE ON public.clips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();