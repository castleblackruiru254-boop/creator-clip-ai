# Video Processing Pipeline - Production Deployment Guide

This guide covers the deployment and setup of the complete video processing pipeline with real AI-powered transcript generation, highlight detection, and clip creation.

## 📋 Prerequisites

Before deploying, ensure you have:

### Required Services
- [x] Supabase project with database and storage
- [x] OpenAI API account with credits
- [ ] YouTube Data API v3 credentials (optional for search)
- [ ] FFmpeg binary access in edge functions

### Environment Variables
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# YouTube (optional)
YOUTUBE_API_KEY=your_youtube_api_key

# Optional: Custom CDN
CDN_BASE_URL=your_cdn_url
```

## 🗄️ Database Setup

### 1. Run Database Migrations

Apply the queue system migration:

```bash
# Apply the video processing queue migration
supabase db push

# Or manually run the SQL file
psql -f supabase/migrations/20240129000001_video_processing_queue.sql
```

### 2. Configure Storage Buckets

```bash
# Run storage configuration
supabase storage-update --execute-sql=storage.sql
```

Or manually create buckets:
- `videos` - For processed video clips
- `thumbnails` - For video thumbnails
- `temp` - For temporary processing files

### 3. Set Up Row Level Security

The migration includes RLS policies, but verify:
- Users can only access their own jobs and content
- Service role has full access for processing
- Anonymous users have no access

## 🚀 Edge Function Deployment

### 1. Deploy Core Functions

```bash
# Deploy all edge functions
supabase functions deploy

# Or deploy individually
supabase functions deploy process-video
supabase functions deploy youtube-search
supabase functions deploy process-youtube-url
supabase functions deploy generate-clips
```

### 2. Configure Function Environment Variables

```bash
# Set OpenAI API key for functions
supabase secrets set OPENAI_API_KEY=your_openai_api_key

# Set YouTube API key (if using search)
supabase secrets set YOUTUBE_API_KEY=your_youtube_api_key
```

### 3. Test Edge Functions

```bash
# Test video processing function
curl -X POST \
  "https://your-project.supabase.co/functions/v1/process-video" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Test","videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## 📦 Frontend Application Deployment

### 1. Install Dependencies

```bash
npm install
# or
yarn install
```

### 2. Build Application

```bash
# Production build
npm run build

# Development build (for testing)
npm run build:dev
```

### 3. Deploy to Hosting Platform

#### Vercel
```bash
npm install -g vercel
vercel --prod
```

#### Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

#### Custom Server
```bash
# Serve built files
npm run preview
```

## 🔧 Configuration

### 1. Video Processing Settings

Update these constants in your codebase as needed:

```typescript
// lib/video-validation.ts
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
export const MAX_DURATION = 12 * 60 * 60; // 12 hours

// lib/video-queue.ts  
const MAX_CONCURRENT_JOBS = 3; // Adjust based on server capacity
const MAX_RETRIES = 3;
const JOB_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours
```

### 2. OpenAI Configuration

```typescript
// lib/transcript-service.ts
const WHISPER_MODEL = 'whisper-1'; // Use whisper-1 for production
const CHAT_MODEL = 'gpt-4o'; // Use GPT-4 for better analysis
```

### 3. Storage Configuration

```typescript
// lib/video-cdn.ts
export const CDN_CONFIG = {
  maxAge: 7 * 24 * 60 * 60, // 7 days cache
  staleWhileRevalidate: 24 * 60 * 60, // 24 hours
};
```

## 🧪 Testing Pipeline

### 1. Run Automated Tests

```bash
# Install tsx for TypeScript execution
npm install tsx

# Run comprehensive pipeline tests
npm run test:pipeline

# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e
```

### 2. Manual Testing Steps

1. **Test URL Validation**
   - Valid YouTube URLs should pass
   - Invalid URLs should be rejected
   - Different URL formats should work

2. **Test Video Processing**
   - Submit a short test video (1-2 minutes)
   - Monitor queue progress in real-time
   - Verify clips are generated correctly

3. **Test Queue Management**
   - Check job status updates
   - Test cancel/retry functionality
   - Verify queue cleanup works

4. **Test Storage and CDN**
   - Verify files upload correctly
   - Check CDN URLs are accessible
   - Test different quality presets

### 3. Load Testing

```bash
# Test concurrent job processing
for i in {1..10}; do
  curl -X POST "https://your-project.supabase.co/functions/v1/process-video" \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Load Test $i\",\"videoUrl\":\"https://www.youtube.com/watch?v=dQw4w9WgXcQ\"}" &
done
```

## 📊 Monitoring and Alerts

### 1. Set Up Database Monitoring

Monitor these key metrics:
- Queue job success/failure rates
- Average processing times
- Storage usage
- API usage and costs

### 2. Application Monitoring

```typescript
// Add error tracking (e.g., Sentry)
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: process.env.NODE_ENV,
});
```

### 3. Queue Health Checks

```bash
# Set up cron job to monitor queue health
# Check for stuck jobs, failed job rates, etc.
0 */6 * * * curl -X POST "https://your-project.supabase.co/functions/v1/queue-health-check"
```

## 🔒 Security Considerations

### 1. API Key Security
- Never expose service role keys in frontend
- Use environment variables for all secrets
- Rotate API keys regularly

### 2. Storage Security
- Verify RLS policies are correctly applied
- Test access controls with different user roles
- Monitor for unauthorized access attempts

### 3. Rate Limiting
- Implement rate limiting on edge functions
- Monitor API usage to prevent abuse
- Set up billing alerts for cost control

## 🎯 Performance Optimization

### 1. Queue Processing
- Monitor concurrent job limits
- Adjust timeouts based on video length
- Implement priority queuing for premium users

### 2. Storage Optimization
- Use WebP for thumbnails
- Implement video compression for large files
- Set up automatic cleanup of old files

### 3. CDN Configuration
- Configure proper cache headers
- Set up multiple quality levels
- Implement adaptive bitrate streaming

## 🐛 Troubleshooting

### Common Issues

1. **Jobs Stuck in Processing**
   ```sql
   -- Manually reset stuck jobs
   UPDATE processing_queue 
   SET status = 'failed', 
       error_message = 'Manual reset - job was stuck'
   WHERE status = 'processing' 
     AND started_at < NOW() - INTERVAL '2 hours';
   ```

2. **High OpenAI API Costs**
   - Monitor transcript lengths (Whisper charges per minute)
   - Implement caching for repeated videos
   - Use shorter clips for analysis when possible

3. **Storage Space Issues**
   - Run cleanup functions regularly
   - Implement automatic file deletion policies
   - Monitor storage quotas

4. **Edge Function Timeouts**
   - Break large videos into smaller chunks
   - Implement async processing with callbacks
   - Increase function timeout limits

### Debug Commands

```bash
# Check queue status
supabase db functions invoke get_queue_stats

# View recent failed jobs
supabase db query "SELECT * FROM processing_queue WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10"

# Check storage usage
supabase storage ls --bucket videos --recursive

# View function logs
supabase functions logs process-video --follow
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Use multiple edge function regions
- Implement job distribution across regions
- Set up load balancing for high traffic

### Database Scaling
- Monitor connection limits
- Implement read replicas for analytics
- Consider database connection pooling

### Storage Scaling
- Implement multi-region storage
- Set up CDN caching at edge locations
- Consider object lifecycle policies

## 🔄 Maintenance

### Daily Tasks
- Monitor queue health and job success rates
- Check storage usage and cleanup old files
- Review error logs and failed jobs

### Weekly Tasks
- Analyze performance metrics
- Update API usage reports
- Test backup and recovery procedures

### Monthly Tasks
- Review and update security policies
- Audit user access and permissions
- Plan capacity scaling based on growth

## 📚 Additional Resources

- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [YouTube Data API Documentation](https://developers.google.com/youtube/v3)

## 🆘 Support and Issues

For issues with the video processing pipeline:

1. Check the troubleshooting section above
2. Review edge function logs
3. Monitor database query performance
4. Verify API key configurations
5. Test with smaller video files first

Remember to always test changes in a staging environment before deploying to production!
