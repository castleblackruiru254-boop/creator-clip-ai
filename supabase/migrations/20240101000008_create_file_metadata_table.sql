-- Create file_metadata table for tracking uploaded files and storage management
CREATE TABLE file_metadata (
  id TEXT PRIMARY KEY, -- File path/ID in storage bucket
  name TEXT NOT NULL,
  size BIGINT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  bucket TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('uploading', 'processing', 'completed', 'error', 'cleanup')),
  is_temporary BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX idx_file_metadata_user_id ON file_metadata(user_id);
CREATE INDEX idx_file_metadata_bucket ON file_metadata(bucket);
CREATE INDEX idx_file_metadata_project_id ON file_metadata(project_id);
CREATE INDEX idx_file_metadata_status ON file_metadata(status);
CREATE INDEX idx_file_metadata_expires_at ON file_metadata(expires_at);
CREATE INDEX idx_file_metadata_uploaded_at ON file_metadata(uploaded_at);
CREATE INDEX idx_file_metadata_is_temporary ON file_metadata(is_temporary);

-- Create composite indexes for cleanup queries
CREATE INDEX idx_file_metadata_cleanup ON file_metadata(expires_at, is_temporary, uploaded_at) WHERE status != 'cleanup';
CREATE INDEX idx_file_metadata_user_bucket ON file_metadata(user_id, bucket, status);

-- Enable Row Level Security
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own files"
  ON file_metadata FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files"
  ON file_metadata FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files"
  ON file_metadata FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files"
  ON file_metadata FOR DELETE
  USING (auth.uid() = user_id);

-- Create policy for service role to manage all files (for cleanup)
CREATE POLICY "Service role can manage all files"
  ON file_metadata FOR ALL
  USING (auth.role() = 'service_role');

-- Create trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_file_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER file_metadata_updated_at_trigger
  BEFORE UPDATE ON file_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_file_metadata_updated_at();

-- Create function to calculate user storage usage
CREATE OR REPLACE FUNCTION get_user_storage_usage(user_uuid UUID)
RETURNS TABLE(
  total_files BIGINT,
  total_size BIGINT,
  size_by_bucket JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_files,
    COALESCE(SUM(size), 0)::BIGINT as total_size,
    COALESCE(
      JSON_OBJECT_AGG(
        bucket,
        JSON_BUILD_OBJECT(
          'count', bucket_count,
          'size', bucket_size
        )
      ),
      '{}'::JSONB
    ) as size_by_bucket
  FROM (
    SELECT 
      bucket,
      COUNT(*) as bucket_count,
      COALESCE(SUM(size), 0) as bucket_size
    FROM file_metadata
    WHERE user_id = user_uuid 
      AND status != 'cleanup'
    GROUP BY bucket
  ) bucket_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_user_storage_usage(UUID) TO authenticated;

-- Create cleanup job function (for cron)
CREATE OR REPLACE FUNCTION cleanup_expired_files()
RETURNS TABLE(
  cleaned_count BIGINT,
  error_count BIGINT,
  total_size_freed BIGINT
) AS $$
DECLARE
  file_record RECORD;
  cleaned BIGINT := 0;
  errors BIGINT := 0;
  size_freed BIGINT := 0;
BEGIN
  -- Find expired files
  FOR file_record IN 
    SELECT * FROM file_metadata
    WHERE (
      expires_at < NOW() OR
      (is_temporary = true AND uploaded_at < NOW() - INTERVAL '1 day') OR
      (bucket = 'temp-files' AND uploaded_at < NOW() - INTERVAL '7 days')
    )
    AND status != 'cleanup'
  LOOP
    BEGIN
      -- Mark as cleanup
      UPDATE file_metadata 
      SET status = 'cleanup', updated_at = NOW()
      WHERE id = file_record.id;
      
      -- Note: Actual file deletion from storage should be handled by the Edge Function
      -- This function only manages metadata and provides counts
      
      cleaned := cleaned + 1;
      size_freed := size_freed + file_record.size;
      
    EXCEPTION WHEN OTHERS THEN
      errors := errors + 1;
      -- Log error but continue processing
      INSERT INTO system_logs (level, message, metadata) 
      VALUES ('error', 'Failed to cleanup file: ' || file_record.id, 
              JSON_BUILD_OBJECT('error', SQLERRM, 'file_id', file_record.id));
    END;
  END LOOP;
  
  RETURN QUERY SELECT cleaned, errors, size_freed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_files() TO service_role;
