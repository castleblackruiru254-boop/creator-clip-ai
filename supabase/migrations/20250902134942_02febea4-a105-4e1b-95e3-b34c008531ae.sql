-- Create storage buckets for the project

-- Source videos bucket (for user uploads)
INSERT INTO storage.buckets (id, name, public) VALUES ('source-videos', 'source-videos', false);

-- Clips bucket (for generated highlights/clips)
INSERT INTO storage.buckets (id, name, public) VALUES ('clips', 'clips', false);

-- Thumbnails bucket (for video thumbnails)
INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true);

-- Temp uploads bucket (for temporary processing)
INSERT INTO storage.buckets (id, name, public) VALUES ('temp-uploads', 'temp-uploads', false);

-- RLS policies for source-videos bucket
CREATE POLICY "Users can view their own source videos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'source-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own source videos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'source-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own source videos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'source-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own source videos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'source-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies for clips bucket
CREATE POLICY "Users can view their own clips" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own clips" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own clips" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own clips" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies for thumbnails bucket (public bucket)
CREATE POLICY "Anyone can view thumbnails" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'thumbnails');

CREATE POLICY "Users can upload thumbnails to their folder" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own thumbnails" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own thumbnails" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies for temp-uploads bucket
CREATE POLICY "Users can view their own temp uploads" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'temp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload to temp-uploads" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'temp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their temp uploads" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'temp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their temp uploads" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'temp-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);