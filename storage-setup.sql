-- Storage Buckets Setup for Creator Clip AI
-- Run this in your Supabase SQL Editor after running database-setup.sql

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('video-uploads', 'video-uploads', false, 2147483648, ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']), -- 2GB limit
  ('processed-clips', 'processed-clips', true, 524288000, ARRAY['video/mp4', 'video/webm']), -- 500MB limit
  ('thumbnails', 'thumbnails', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']), -- 10MB limit
  ('temp-files', 'temp-files', false, 1073741824, ARRAY['video/*', 'audio/*', 'application/json']) -- 1GB limit
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Enable RLS for storage objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Storage policies for video-uploads bucket
DROP POLICY IF EXISTS "Users can upload videos" ON storage.objects;
CREATE POLICY "Users can upload videos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'video-uploads' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view their videos" ON storage.objects;
CREATE POLICY "Users can view their videos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'video-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for processed-clips bucket
DROP POLICY IF EXISTS "Users can upload processed clips" ON storage.objects;
CREATE POLICY "Users can upload processed clips" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'processed-clips' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Public can view processed clips" ON storage.objects;
CREATE POLICY "Public can view processed clips" ON storage.objects
  FOR SELECT USING (bucket_id = 'processed-clips');

-- Storage policies for thumbnails bucket
DROP POLICY IF EXISTS "Users can upload thumbnails" ON storage.objects;
CREATE POLICY "Users can upload thumbnails" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'thumbnails' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Public can view thumbnails" ON storage.objects;
CREATE POLICY "Public can view thumbnails" ON storage.objects
  FOR SELECT USING (bucket_id = 'thumbnails');

-- Storage policies for temp-files bucket
DROP POLICY IF EXISTS "Users can upload temp files" ON storage.objects;
CREATE POLICY "Users can upload temp files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'temp-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view their temp files" ON storage.objects;
CREATE POLICY "Users can view their temp files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'temp-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Service role can access all storage
DROP POLICY IF EXISTS "Service role can access all storage" ON storage.objects;
CREATE POLICY "Service role can access all storage" ON storage.objects
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant storage permissions
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;

-- Success message
SELECT 'Storage buckets setup completed!' as status;
