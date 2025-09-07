-- Migration: Video Processing Queue System
-- Creates tables and functions for background video processing

-- Create processing queue table
CREATE TABLE IF NOT EXISTS processing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('process_video', 'generate_clip', 'generate_subtitles')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  payload JSONB NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

-- Create indexes for queue performance
CREATE INDEX idx_processing_queue_status ON processing_queue(status);
CREATE INDEX idx_processing_queue_priority_created ON processing_queue(priority DESC, created_at ASC);
CREATE INDEX idx_processing_queue_user_id ON processing_queue(user_id);
CREATE INDEX idx_processing_queue_type ON processing_queue(type);

-- Enable RLS
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies for processing queue
CREATE POLICY "Users can view their own jobs" ON processing_queue
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own jobs" ON processing_queue
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own jobs" ON processing_queue
  FOR UPDATE USING (user_id = auth.uid());

-- Service role can access all jobs
CREATE POLICY "Service role can access all jobs" ON processing_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to increment retry count
CREATE OR REPLACE FUNCTION increment_retry_count(job_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE processing_queue 
  SET retry_count = retry_count + 1 
  WHERE id = job_id
  RETURNING retry_count INTO new_count;
  
  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get queue statistics
CREATE OR REPLACE FUNCTION get_queue_stats()
RETURNS TABLE (
  total_jobs BIGINT,
  pending_jobs BIGINT,
  processing_jobs BIGINT,
  completed_jobs BIGINT,
  failed_jobs BIGINT,
  avg_processing_time INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    AVG(completed_at - started_at) FILTER (WHERE status = 'completed') as avg_processing_time
  FROM processing_queue
  WHERE created_at > NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old queue jobs
CREATE OR REPLACE FUNCTION cleanup_queue_jobs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete completed/failed/cancelled jobs older than 7 days
  DELETE FROM processing_queue 
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - INTERVAL '7 days';
    
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Cancel jobs that have been processing for more than 2 hours (stuck jobs)
  UPDATE processing_queue 
  SET status = 'failed', 
      error_message = 'Job timeout - processing took too long',
      completed_at = NOW()
  WHERE status = 'processing' 
    AND started_at < NOW() - INTERVAL '2 hours';
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule queue cleanup to run every hour
SELECT cron.schedule('cleanup-queue-jobs', '0 * * * *', 'SELECT cleanup_queue_jobs();');

-- Create video processing progress table for real-time updates
CREATE TABLE IF NOT EXISTS video_processing_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES processing_queue(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  clip_id UUID REFERENCES clips(id) ON DELETE CASCADE,
  stage TEXT NOT NULL, -- 'download', 'transcript', 'analysis', 'processing', 'upload'
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure only one progress record per job
  UNIQUE(job_id)
);

-- Enable RLS on progress table
ALTER TABLE video_processing_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for progress tracking
CREATE POLICY "Users can view their own progress" ON video_processing_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM processing_queue 
      WHERE processing_queue.id = video_processing_progress.job_id 
      AND processing_queue.user_id = auth.uid()
    )
  );

-- Service role can access all progress
CREATE POLICY "Service role can access all progress" ON video_processing_progress
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to update processing progress
CREATE OR REPLACE FUNCTION update_processing_progress(
  p_job_id UUID,
  p_stage TEXT,
  p_progress INTEGER,
  p_message TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_clip_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO video_processing_progress (job_id, project_id, clip_id, stage, progress_percent, message)
  VALUES (p_job_id, p_project_id, p_clip_id, p_stage, p_progress, p_message)
  ON CONFLICT (job_id) 
  DO UPDATE SET 
    stage = p_stage,
    progress_percent = p_progress,
    message = p_message,
    project_id = COALESCE(p_project_id, video_processing_progress.project_id),
    clip_id = COALESCE(p_clip_id, video_processing_progress.clip_id),
    created_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to get user's active processing jobs
CREATE OR REPLACE FUNCTION get_user_active_jobs(p_user_id UUID)
RETURNS TABLE (
  job_id UUID,
  job_type TEXT,
  job_status TEXT,
  job_progress INTEGER,
  stage TEXT,
  message TEXT,
  created_at TIMESTAMPTZ,
  estimated_completion TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pq.id as job_id,
    pq.type as job_type,
    pq.status as job_status,
    pq.progress as job_progress,
    vpp.stage,
    vpp.message,
    pq.created_at,
    -- Estimate completion time based on current progress
    CASE 
      WHEN pq.status = 'processing' AND pq.progress > 10 THEN
        pq.started_at + (
          (NOW() - pq.started_at) * (100.0 / GREATEST(pq.progress, 1))
        )::INTERVAL
      ELSE NULL
    END as estimated_completion
  FROM processing_queue pq
  LEFT JOIN video_processing_progress vpp ON vpp.job_id = pq.id
  WHERE pq.user_id = p_user_id
    AND pq.status IN ('pending', 'processing')
  ORDER BY pq.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON processing_queue TO authenticated;
GRANT ALL ON video_processing_progress TO authenticated;
GRANT EXECUTE ON FUNCTION increment_retry_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_queue_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_queue_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION update_processing_progress(UUID, TEXT, INTEGER, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_active_jobs(UUID) TO authenticated;

-- Add queue status to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS processing_job_id UUID REFERENCES processing_queue(id);

-- Add processing metadata to clips table  
ALTER TABLE clips
ADD COLUMN IF NOT EXISTS processing_job_id UUID REFERENCES processing_queue(id),
ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;

-- Create trigger to update project status based on clips
CREATE OR REPLACE FUNCTION update_project_status_from_clips()
RETURNS TRIGGER AS $$
DECLARE
  project_clip_stats RECORD;
BEGIN
  -- Get clip statistics for the project
  SELECT 
    COUNT(*) as total_clips,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_clips,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_clips,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_clips
  INTO project_clip_stats
  FROM clips 
  WHERE project_id = NEW.project_id;
  
  -- Update project status based on clip progress
  IF project_clip_stats.total_clips > 0 THEN
    IF project_clip_stats.completed_clips = project_clip_stats.total_clips THEN
      -- All clips completed
      UPDATE projects 
      SET status = 'completed', completed_at = NOW() 
      WHERE id = NEW.project_id;
    ELSIF project_clip_stats.failed_clips = project_clip_stats.total_clips THEN
      -- All clips failed
      UPDATE projects 
      SET status = 'failed' 
      WHERE id = NEW.project_id;
    ELSIF project_clip_stats.processing_clips > 0 OR project_clip_stats.completed_clips > 0 THEN
      -- Some clips are processing or completed
      UPDATE projects 
      SET status = 'processing' 
      WHERE id = NEW.project_id AND status != 'completed';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for project status updates
DROP TRIGGER IF EXISTS update_project_status_trigger ON clips;
CREATE TRIGGER update_project_status_trigger
  AFTER INSERT OR UPDATE ON clips
  FOR EACH ROW
  EXECUTE FUNCTION update_project_status_from_clips();
