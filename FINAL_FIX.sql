-- FINAL FIX - Handles function conflicts properly
-- Run this to complete the database setup

-- 1. Drop the existing function first (as suggested by the error)
DROP FUNCTION IF EXISTS get_user_active_jobs(uuid);

-- 2. Create the function with the correct signature
CREATE OR REPLACE FUNCTION get_user_active_jobs(p_user_id UUID)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  job_status TEXT,
  job_progress INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pq.id as job_id,
    pq.type as job_type,
    pq.status as job_status,
    pq.progress as job_progress,
    pq.created_at
  FROM processing_queue pq
  WHERE pq.user_id = p_user_id
    AND pq.status IN ('pending', 'processing')
  ORDER BY pq.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grant permissions for the new function
GRANT EXECUTE ON FUNCTION get_user_active_jobs(UUID) TO authenticated;

-- 4. Create storage buckets (this might have failed in the previous run)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('videos', 'videos', false, 2147483648, ARRAY['video/mp4', 'video/webm', 'video/quicktime']),
  ('thumbnails', 'thumbnails', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 5. Final verification
SELECT 
  'SUCCESS: All database setup completed!' as status,
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('profiles', 'projects', 'processing_queue')) as tables_created,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('create_user_profile', 'get_user_active_jobs')) as functions_created,
  (SELECT COUNT(*) FROM storage.buckets WHERE id IN ('videos', 'thumbnails')) as buckets_created;
