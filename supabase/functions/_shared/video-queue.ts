/**
 * Video Processing Queue System
 * 
 * Handles background video processing jobs with retry logic,
 * progress tracking, and efficient resource management.
 */

export interface QueueJob {
  id: string;
  type: 'process_video' | 'generate_clip' | 'generate_subtitles';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high';
  payload: any;
  user_id: string;
  progress: number; // 0-100
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
}

export interface JobProgress {
  jobId: string;
  progress: number;
  status: string;
  message: string;
  estimatedTimeRemaining?: number;
}

export class VideoProcessingQueue {
  private supabaseClient: any;
  private isProcessing = false;
  private maxConcurrentJobs = 3;
  private currentJobs = 0;

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }

  /**
   * Add a new job to the processing queue
   */
  async addJob(
    type: QueueJob['type'],
    payload: any,
    userId: string,
    priority: QueueJob['priority'] = 'normal'
  ): Promise<string> {
    try {
      const { data: job, error } = await this.supabaseClient
        .from('processing_queue')
        .insert({
          type,
          status: 'pending',
          priority,
          payload,
          user_id: userId,
          progress: 0,
          retry_count: 0,
          max_retries: 3
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`Added job ${job.id} to queue: ${type}`);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.startProcessing();
      }

      return job.id;

    } catch (error) {
      console.error('Error adding job to queue:', error);
      throw new Error(`Failed to add job to queue: ${error.message}`);
    }
  }

  /**
   * Start processing jobs from the queue
   */
  async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log('Starting video processing queue...');

    try {
      while (this.isProcessing) {
        // Check if we can process more jobs
        if (this.currentJobs >= this.maxConcurrentJobs) {
          await this.sleep(5000); // Wait 5 seconds before checking again
          continue;
        }

        // Get next pending job
        const job = await this.getNextJob();
        if (!job) {
          await this.sleep(10000); // Wait 10 seconds if no jobs
          continue;
        }

        // Process job in background
        this.processJob(job).catch(error => {
          console.error(`Job ${job.id} processing failed:`, error);
        });

        this.currentJobs++;
      }
    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Stop processing queue
   */
  stopProcessing(): void {
    this.isProcessing = false;
    console.log('Stopping video processing queue...');
  }

  /**
   * Get next pending job based on priority
   */
  private async getNextJob(): Promise<QueueJob | null> {
    try {
      const { data: job, error } = await this.supabaseClient
        .from('processing_queue')
        .select('*')
        .eq('status', 'pending')
        .order('priority', { ascending: false }) // High priority first
        .order('created_at', { ascending: true }) // FIFO within same priority
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return job;

    } catch (error) {
      console.error('Error getting next job:', error);
      return null;
    }
  }

  /**
   * Process an individual job
   */
  private async processJob(job: QueueJob): Promise<void> {
    try {
      // Mark job as processing
      await this.updateJobStatus(job.id, 'processing', 0, 'Starting processing...');

      console.log(`Processing job ${job.id}: ${job.type}`);

      // Process based on job type
      switch (job.type) {
        case 'process_video':
          await this.processVideoJob(job);
          break;
        case 'generate_clip':
          await this.generateClipJob(job);
          break;
        case 'generate_subtitles':
          await this.generateSubtitlesJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark job as completed
      await this.updateJobStatus(job.id, 'completed', 100, 'Processing completed successfully');
      console.log(`Job ${job.id} completed successfully`);

    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      
      // Check if we should retry
      if (job.retry_count < job.max_retries) {
        await this.retryJob(job.id, error.message);
      } else {
        await this.updateJobStatus(job.id, 'failed', job.progress, error.message);
      }
    } finally {
      this.currentJobs--;
    }
  }

  /**
   * Process video job (full video analysis and clip generation)
   */
  private async processVideoJob(job: QueueJob): Promise<void> {
    const { videoUrl, title, description } = job.payload;
    
    // Import functions dynamically to avoid circular dependencies
    const { 
      initializeFFmpeg,
      downloadYouTubeVideo,
      createWorkingDirectory,
      cleanupWorkingDirectory
    } = await import('./ffmpeg-utils.ts');
    
    const {
      generateTranscriptFromVideo,
      analyzeTranscriptForHighlights
    } = await import('./transcript-service.ts');

    let workingDir: string | null = null;

    try {
      await this.updateJobStatus(job.id, 'processing', 10, 'Initializing video processing...');

      // Create working directory
      workingDir = await createWorkingDirectory();
      const ffmpegProcessor = await initializeFFmpeg();

      await this.updateJobStatus(job.id, 'processing', 20, 'Downloading video...');

      // Download video
      const videoPath = await downloadYouTubeVideo(videoUrl, workingDir);

      await this.updateJobStatus(job.id, 'processing', 40, 'Generating transcript...');

      // Generate transcript
      const transcript = await generateTranscriptFromVideo(videoUrl);

      await this.updateJobStatus(job.id, 'processing', 60, 'Analyzing for highlights...');

      // Analyze for highlights
      const highlights = await analyzeTranscriptForHighlights(transcript, title, transcript.duration);

      await this.updateJobStatus(job.id, 'processing', 80, 'Creating clip records...');

      // Create project and clips in database
      const { data: project, error: projectError } = await this.supabaseClient
        .from('projects')
        .insert({
          user_id: job.user_id,
          title,
          description,
          source_video_url: videoUrl,
          source_video_duration: transcript.duration,
          status: 'processing'
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Queue individual clip generation jobs
      for (const highlight of highlights) {
        await this.addJob('generate_clip', {
          projectId: project.id,
          highlight,
          videoUrl,
          sharedVideoPath: videoPath // Pass the already downloaded video
        }, job.user_id, 'normal');
      }

      await this.updateJobStatus(job.id, 'processing', 100, 'Video processing completed');

    } catch (error) {
      throw error;
    } finally {
      if (workingDir) {
        await cleanupWorkingDirectory(workingDir);
      }
    }
  }

  /**
   * Process clip generation job
   */
  private async generateClipJob(job: QueueJob): Promise<void> {
    const { projectId, highlight, videoUrl, sharedVideoPath } = job.payload;
    
    const { 
      initializeFFmpeg,
      processVideoClip,
      createWorkingDirectory,
      cleanupWorkingDirectory,
      uploadToStorage
    } = await import('./ffmpeg-utils.ts');

    let workingDir: string | null = null;

    try {
      await this.updateJobStatus(job.id, 'processing', 10, 'Setting up clip generation...');

      workingDir = await createWorkingDirectory();
      const ffmpegProcessor = await initializeFFmpeg();

      await this.updateJobStatus(job.id, 'processing', 30, 'Processing video clip...');

      // Create clip record
      const { data: clip, error: clipError } = await this.supabaseClient
        .from('clips')
        .insert({
          project_id: projectId,
          title: highlight.suggestedTitle,
          start_time: Math.floor(highlight.startTime),
          end_time: Math.floor(highlight.endTime),
          duration: Math.floor(highlight.endTime - highlight.startTime),
          platform: highlight.platform,
          ai_score: highlight.aiScore,
          status: 'processing'
        })
        .select()
        .single();

      if (clipError) throw clipError;

      // Process video clip
      const clipOutputPath = `${workingDir}/clip_${clip.id}.mp4`;
      const processingOptions = {
        startTime: highlight.startTime,
        endTime: highlight.endTime,
        platform: highlight.platform,
        quality: 'medium' as const,
        cropToVertical: true,
        enhanceAudio: true
      };

      await this.updateJobStatus(job.id, 'processing', 60, 'Processing with FFmpeg...');

      const processingResult = await processVideoClip(
        ffmpegProcessor,
        sharedVideoPath || videoUrl, // Use shared path if available
        clipOutputPath,
        processingOptions
      );

      await this.updateJobStatus(job.id, 'processing', 80, 'Uploading to storage...');

      // Upload to storage
      const uploadResult = await uploadToStorage(
        this.supabaseClient,
        processingResult.videoData,
        processingResult.thumbnailData,
        clip.id,
        highlight.platform
      );

      // Update clip record
      await this.supabaseClient
        .from('clips')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          video_url: uploadResult.videoUrl,
          thumbnail_url: uploadResult.thumbnailUrl,
          file_size: processingResult.metadata.fileSize,
          resolution: processingResult.metadata.resolution
        })
        .eq('id', clip.id);

      await this.updateJobStatus(job.id, 'processing', 100, 'Clip generation completed');

    } catch (error) {
      throw error;
    } finally {
      if (workingDir) {
        await cleanupWorkingDirectory(workingDir);
      }
    }
  }

  /**
   * Process subtitle generation job
   */
  private async generateSubtitlesJob(job: QueueJob): Promise<void> {
    const { clipId, videoUrl, startTime, endTime, language, style } = job.payload;
    
    const { generateTranscriptFromVideo, generateEnhancedSubtitles } = await import('./transcript-service.ts');

    try {
      await this.updateJobStatus(job.id, 'processing', 20, 'Generating transcript...');

      // Generate transcript for clip segment
      const transcript = await generateTranscriptFromVideo(videoUrl, startTime, endTime, language);

      await this.updateJobStatus(job.id, 'processing', 60, 'Processing subtitles...');

      // Generate enhanced subtitles
      const subtitleSegments = await generateEnhancedSubtitles(transcript, style);

      await this.updateJobStatus(job.id, 'processing', 80, 'Storing subtitles...');

      // Store subtitles
      await this.storeSubtitles(clipId, subtitleSegments);

      await this.updateJobStatus(job.id, 'processing', 100, 'Subtitles generated successfully');

    } catch (error) {
      throw error;
    }
  }

  /**
   * Update job status and progress
   */
  private async updateJobStatus(
    jobId: string,
    status: QueueJob['status'],
    progress: number,
    message: string
  ): Promise<void> {
    try {
      const updates: any = {
        status,
        progress,
        error_message: status === 'failed' ? message : null
      };

      if (status === 'processing' && progress === 0) {
        updates.started_at = new Date().toISOString();
      } else if (status === 'completed' || status === 'failed') {
        updates.completed_at = new Date().toISOString();
      }

      await this.supabaseClient
        .from('processing_queue')
        .update(updates)
        .eq('id', jobId);

      console.log(`Job ${jobId}: ${status} (${progress}%) - ${message}`);

    } catch (error) {
      console.error(`Failed to update job ${jobId} status:`, error);
    }
  }

  /**
   * Retry a failed job
   */
  private async retryJob(jobId: string, errorMessage: string): Promise<void> {
    try {
      await this.supabaseClient
        .from('processing_queue')
        .update({
          status: 'pending',
          retry_count: this.supabaseClient.rpc('increment_retry_count', { job_id: jobId }),
          error_message: errorMessage,
          started_at: null
        })
        .eq('id', jobId);

      console.log(`Job ${jobId} queued for retry`);

    } catch (error) {
      console.error(`Failed to retry job ${jobId}:`, error);
    }
  }

  /**
   * Store subtitle segments
   */
  private async storeSubtitles(
    clipId: string,
    segments: { text: string; startTime: number; endTime: number; confidence: number }[]
  ): Promise<void> {
    // Clear existing subtitles
    await this.supabaseClient
      .from('subtitles')
      .delete()
      .eq('clip_id', clipId);

    // Insert new subtitles
    for (const segment of segments) {
      const { error } = await this.supabaseClient
        .from('subtitles')
        .insert({
          clip_id: clipId,
          text: segment.text,
          start_time: segment.startTime,
          end_time: segment.endTime
        });

      if (error) {
        throw new Error(`Failed to store subtitle segment: ${error.message}`);
      }
    }

    console.log(`Stored ${segments.length} subtitle segments for clip ${clipId}`);
  }

  /**
   * Get job status and progress
   */
  async getJobProgress(jobId: string): Promise<JobProgress | null> {
    try {
      const { data: job, error } = await this.supabaseClient
        .from('processing_queue')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) return null;

      // Calculate estimated time remaining based on progress
      let estimatedTimeRemaining: number | undefined;
      if (job.status === 'processing' && job.started_at) {
        const elapsed = Date.now() - new Date(job.started_at).getTime();
        const progressPercentage = job.progress / 100;
        if (progressPercentage > 0.1) { // Only estimate after 10% progress
          const totalEstimated = elapsed / progressPercentage;
          estimatedTimeRemaining = Math.round((totalEstimated - elapsed) / 1000); // seconds
        }
      }

      return {
        jobId: job.id,
        progress: job.progress,
        status: job.status,
        message: job.error_message || getStatusMessage(job.status, job.progress),
        estimatedTimeRemaining
      };

    } catch (error) {
      console.error(`Failed to get job progress for ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Cancel a pending or processing job
   */
  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await this.supabaseClient
        .from('processing_queue')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .eq('user_id', userId) // Ensure user can only cancel their own jobs
        .in('status', ['pending', 'processing']);

      if (error) throw error;

      console.log(`Job ${jobId} cancelled by user ${userId}`);
      return true;

    } catch (error) {
      console.error(`Failed to cancel job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Get user's job history
   */
  async getUserJobs(userId: string, limit: number = 50): Promise<QueueJob[]> {
    try {
      const { data: jobs, error } = await this.supabaseClient
        .from('processing_queue')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return jobs || [];

    } catch (error) {
      console.error(`Failed to get user jobs for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Clean up old completed jobs
   */
  async cleanupOldJobs(): Promise<void> {
    try {
      // Delete completed/failed jobs older than 7 days
      const { error } = await this.supabaseClient
        .from('processing_queue')
        .delete()
        .in('status', ['completed', 'failed', 'cancelled'])
        .lt('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      console.log('Cleaned up old processing queue jobs');

    } catch (error) {
      console.error('Failed to cleanup old jobs:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Get status message for job progress
 */
function getStatusMessage(status: string, progress: number): string {
  switch (status) {
    case 'pending':
      return 'Job queued for processing...';
    case 'processing':
      if (progress < 20) return 'Initializing...';
      if (progress < 40) return 'Downloading video...';
      if (progress < 60) return 'Processing with AI...';
      if (progress < 80) return 'Generating clips...';
      return 'Finalizing...';
    case 'completed':
      return 'Processing completed successfully';
    case 'failed':
      return 'Processing failed';
    case 'cancelled':
      return 'Processing cancelled';
    default:
      return 'Unknown status';
  }
}

/**
 * Initialize global queue instance
 */
let globalQueue: VideoProcessingQueue | null = null;

export function getQueue(supabaseClient: any): VideoProcessingQueue {
  if (!globalQueue) {
    globalQueue = new VideoProcessingQueue(supabaseClient);
  }
  return globalQueue;
}
