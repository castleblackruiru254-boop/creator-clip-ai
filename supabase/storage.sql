-- Storage configuration for video files and thumbnails
-- This sets up buckets and policies for storing processed video clips

-- Create storage bucket for videos and thumbnails
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('videos', 'videos', true, 314572800, ARRAY['video/mp4', 'video/webm', 'video/quicktime']), -- 300MB limit
  ('thumbnails', 'thumbnails', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']); -- 10MB limit

-- Enable RLS for storage
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy for videos bucket - users can upload/view their own clips
CREATE POLICY "Users can upload video clips" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'videos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view video clips" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'videos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR 
      -- Allow public access to completed clips
      EXISTS (
        SELECT 1 FROM clips 
        WHERE clips.video_url LIKE '%' || name || '%' 
        AND clips.status = 'completed'
      )
    )
  );

CREATE POLICY "Users can update their video clips" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'videos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their video clips" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'videos' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Policy for thumbnails bucket
CREATE POLICY "Users can upload thumbnails" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'thumbnails' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public can view thumbnails" ON storage.objects
  FOR SELECT USING (bucket_id = 'thumbnails');

CREATE POLICY "Users can update their thumbnails" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'thumbnails' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their thumbnails" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'thumbnails' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_name ON storage.objects(bucket_id, name);
CREATE INDEX IF NOT EXISTS idx_storage_objects_updated_at ON storage.objects(updated_at);

-- Add columns to clips table for file metadata
ALTER TABLE clips 
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS resolution TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create function to cleanup old temporary files
CREATE OR REPLACE FUNCTION cleanup_temporary_files()
RETURNS void AS $$
BEGIN
  -- Delete storage objects older than 7 days that are in temp folders
  DELETE FROM storage.objects 
  WHERE bucket_id IN ('videos', 'thumbnails')
    AND name LIKE '%/temp/%'
    AND created_at < NOW() - INTERVAL '7 days';
    
  -- Delete failed clips older than 24 hours
  DELETE FROM clips 
  WHERE status = 'failed' 
    AND created_at < NOW() - INTERVAL '24 hours';
    
  -- Log cleanup activity
  INSERT INTO audit_logs (action, details, created_at)
  VALUES ('storage_cleanup', 'Cleaned up temporary files and failed clips', NOW());
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup function to run daily
SELECT cron.schedule('cleanup-temp-files', '0 2 * * *', 'SELECT cleanup_temporary_files();');

-- Create audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy for audit_logs - only system can insert, users can view their own
CREATE POLICY "System can insert audit logs" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NULL OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can view their own audit logs" ON audit_logs
  FOR SELECT USING (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'service_role');

-- Create function to track video processing events
CREATE OR REPLACE FUNCTION track_video_processing(
  p_action TEXT,
  p_details TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_logs (action, details, user_id, created_at)
  VALUES (p_action, p_details, COALESCE(p_user_id, auth.uid()), NOW());
END;
$$ LANGUAGE plpgsql;

-- Add trigger to track clip status changes
CREATE OR REPLACE FUNCTION track_clip_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    PERFORM track_video_processing(
      'clip_status_changed',
      format('Clip %s status changed from %s to %s', NEW.id, OLD.status, NEW.status),
      (SELECT user_id FROM projects WHERE id = NEW.project_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for clip status changes
DROP TRIGGER IF EXISTS clips_status_change_trigger ON clips;
CREATE TRIGGER clips_status_change_trigger
  AFTER UPDATE ON clips
  FOR EACH ROW
  EXECUTE FUNCTION track_clip_changes();

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
CREATE INDEX IF NOT EXISTS idx_clips_user_id ON clips((
  SELECT user_id FROM projects WHERE projects.id = clips.project_id
));
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;
