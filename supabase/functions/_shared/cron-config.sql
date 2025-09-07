-- File cleanup cron jobs configuration
-- This should be executed in your Supabase database to set up automated cleanup

-- Create cron extension if not exists (requires superuser privileges)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule file cleanup jobs using pg_cron
-- These jobs will automatically clean up expired and temporary files

-- Daily cleanup of expired files (runs at 2:00 AM UTC every day)
SELECT cron.schedule(
  'cleanup-expired-files',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/file-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('mode', 'auto')
  );
  $$
);

-- Hourly cleanup of temporary files (runs every hour at minute 30)
SELECT cron.schedule(
  'cleanup-temp-files',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/file-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('mode', 'temporary')
  );
  $$
);

-- Weekly deep cleanup (runs on Sundays at 3:00 AM UTC)
SELECT cron.schedule(
  'cleanup-old-files',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/file-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('mode', 'old')
  );
  $$
);

-- View scheduled cron jobs
-- SELECT * FROM cron.job;

-- To manually trigger cleanup (for testing):
-- SELECT net.http_post(
--   url := 'https://your-project.supabase.co/functions/v1/file-cleanup',
--   headers := jsonb_build_object(
--     'Authorization', 'Bearer your-service-key',
--     'Content-Type', 'application/json'
--   ),
--   body := jsonb_build_object('mode', 'auto')
-- );

-- To remove cron jobs (if needed):
-- SELECT cron.unschedule('cleanup-expired-files');
-- SELECT cron.unschedule('cleanup-temp-files');
-- SELECT cron.unschedule('cleanup-old-files');
