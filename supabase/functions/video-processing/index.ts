import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VideoProcessingRequest {
  videoUrl?: string; // For YouTube URLs
  fileUrl?: string; // For uploaded files
  userId: string;
  processingOptions: {
    applyWatermark: boolean;
    watermarkConfig?: {
      text: string;
      position: string;
      opacity: number;
      fontSize: number;
      fontColor: string;
      backgroundColor?: string;
    };
    maxResolution: '720p' | '1080p' | '4k';
    quality: 'low' | 'medium' | 'high';
    format: 'mp4' | 'webm';
    enableSubjectTracking: boolean;
    trackingOptions?: {
      cropAspectRatio: number;
      confidenceThreshold: number;
      trackingSmoothing: number;
    };
  };
  clipSegments: Array<{
    startTime: number;
    endTime: number;
    title: string;
  }>;
}

interface PlanLimits {
  maxResolution: '720p' | '1080p' | '4k';
  watermarkEnabled: boolean;
  dailyClipLimit: number;
  monthlyClipLimit: number;
  priorityProcessing: boolean;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  'free': {
    maxResolution: '720p',
    watermarkEnabled: true,
    dailyClipLimit: 3,
    monthlyClipLimit: 15,
    priorityProcessing: false,
  },
  'viral_starter_monthly': {
    maxResolution: '1080p',
    watermarkEnabled: false,
    dailyClipLimit: 10,
    monthlyClipLimit: 100,
    priorityProcessing: false,
  },
  'viral_pro_monthly': {
    maxResolution: '1080p',
    watermarkEnabled: false,
    dailyClipLimit: 50,
    monthlyClipLimit: 500,
    priorityProcessing: true,
  },
  'viral_enterprise_monthly': {
    maxResolution: '4k',
    watermarkEnabled: false,
    dailyClipLimit: -1, // unlimited
    monthlyClipLimit: -1, // unlimited
    priorityProcessing: true,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const requestData: VideoProcessingRequest = await req.json();
    const { videoUrl, fileUrl, userId, processingOptions, clipSegments } = requestData;

    // Get user subscription and limits
    const { data: subscriptionData, error: subError } = await supabaseClient
      .rpc('get_user_active_subscription', { p_user_id: userId });

    if (subError) {
      throw new Error(`Failed to get user subscription: ${subError.message}`);
    }

    const subscription = subscriptionData?.[0];
    const planCode = subscription?.plan_code || 'free';
    const limits = PLAN_LIMITS[planCode] || PLAN_LIMITS.free;

    // Check daily and monthly limits
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const { data: dailyUsage, error: dailyError } = await supabaseClient
      .from('user_clips')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`);

    if (dailyError) throw dailyError;

    const { data: monthlyUsage, error: monthlyError } = await supabaseClient
      .from('user_clips')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth);

    if (monthlyError) throw monthlyError;

    const dailyCount = dailyUsage?.length || 0;
    const monthlyCount = monthlyUsage?.length || 0;

    // Enforce limits
    if (limits.dailyClipLimit !== -1 && dailyCount >= limits.dailyClipLimit) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Daily limit reached (${limits.dailyClipLimit} clips). Upgrade your plan for more clips.`,
          code: 'DAILY_LIMIT_EXCEEDED',
          upgrade_required: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429,
        }
      );
    }

    if (limits.monthlyClipLimit !== -1 && monthlyCount >= limits.monthlyClipLimit) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Monthly limit reached (${limits.monthlyClipLimit} clips). Upgrade your plan for more clips.`,
          code: 'MONTHLY_LIMIT_EXCEEDED',
          upgrade_required: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429,
        }
      );
    }

    // Apply plan-based restrictions
    const finalProcessingOptions = {
      ...processingOptions,
      applyWatermark: limits.watermarkEnabled || processingOptions.applyWatermark,
      maxResolution: getConstrainedResolution(processingOptions.maxResolution, limits.maxResolution),
    };

    // If watermark is required, ensure it's configured
    if (finalProcessingOptions.applyWatermark && !finalProcessingOptions.watermarkConfig) {
      finalProcessingOptions.watermarkConfig = {
        text: 'Creator Clip AI',
        position: 'bottom-right',
        opacity: 0.7,
        fontSize: 24,
        fontColor: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
      };
    }

    // Create processing job record
    const { data: jobData, error: jobError } = await supabaseClient
      .from('video_processing_jobs')
      .insert({
        user_id: userId,
        video_url: videoUrl,
        file_url: fileUrl,
        status: 'queued',
        processing_options: finalProcessingOptions,
        clip_segments: clipSegments,
        priority: limits.priorityProcessing ? 'high' : 'normal',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create processing job: ${jobError.message}`);
    }

    // Start processing (this would typically be handled by a separate worker)
    const processingResult = await processVideo(
      jobData.id,
      videoUrl || fileUrl!,
      finalProcessingOptions,
      clipSegments,
      supabaseClient
    );

    // Record clip creation for usage tracking
    await supabaseClient
      .from('user_clips')
      .insert({
        user_id: userId,
        job_id: jobData.id,
        clips_generated: clipSegments.length,
        credits_used: clipSegments.length,
        created_at: new Date().toISOString(),
      });

    // Deduct credits
    await supabaseClient.rpc('deduct_user_credits', {
      p_user_id: userId,
      p_credits: clipSegments.length,
      p_reason: 'video_processing',
    });

    return new Response(
      JSON.stringify({
        success: true,
        jobId: jobData.id,
        processingResult,
        restrictions_applied: {
          watermark: finalProcessingOptions.applyWatermark,
          max_resolution: finalProcessingOptions.maxResolution,
          priority: limits.priorityProcessing ? 'high' : 'normal',
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Video processing error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Video processing failed'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function getConstrainedResolution(
  requested: '720p' | '1080p' | '4k',
  maxAllowed: '720p' | '1080p' | '4k'
): '720p' | '1080p' | '4k' {
  const resolutionOrder = ['720p', '1080p', '4k'];
  const requestedIndex = resolutionOrder.indexOf(requested);
  const maxIndex = resolutionOrder.indexOf(maxAllowed);
  
  return requestedIndex <= maxIndex ? requested : maxAllowed;
}

async function processVideo(
  jobId: string,
  videoSource: string,
  processingOptions: any,
  clipSegments: any[],
  supabaseClient: any
): Promise<any> {
  try {
    // Update job status
    await supabaseClient
      .from('video_processing_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log('Processing video with options:', processingOptions);

    // Step 1: Download/prepare video
    let inputVideoPath: string;
    
    if (videoSource.startsWith('http')) {
      // YouTube URL or external URL
      if (videoSource.includes('youtube.com') || videoSource.includes('youtu.be')) {
        // Use yt-dlp to download YouTube video
        inputVideoPath = await downloadYouTubeVideo(videoSource, jobId);
      } else {
        // Download external URL
        inputVideoPath = await downloadExternalVideo(videoSource, jobId);
      }
    } else {
      // Local file URL from Supabase storage
      inputVideoPath = await downloadSupabaseFile(videoSource, jobId, supabaseClient);
    }

    // Step 2: Subject tracking (if enabled)
    let trackingData = null;
    if (processingOptions.enableSubjectTracking) {
      trackingData = await performSubjectTracking(inputVideoPath, processingOptions.trackingOptions);
    }

    // Step 3: Process each clip segment
    const processedClips = [];
    
    for (let i = 0; i < clipSegments.length; i++) {
      const segment = clipSegments[i];
      
      console.log(`Processing clip ${i + 1}/${clipSegments.length}: ${segment.title}`);

      const clipResult = await processClipSegment(
        inputVideoPath,
        segment,
        processingOptions,
        trackingData,
        jobId,
        i
      );

      processedClips.push(clipResult);

      // Update progress
      const progress = Math.round(((i + 1) / clipSegments.length) * 100);
      await supabaseClient
        .from('video_processing_jobs')
        .update({ 
          progress,
          processed_clips: processedClips.length
        })
        .eq('id', jobId);
    }

    // Step 4: Upload processed clips to storage
    const uploadedClips = [];
    for (const clip of processedClips) {
      const uploadedUrl = await uploadClipToStorage(clip.outputPath, clip.filename, supabaseClient);
      uploadedClips.push({
        ...clip,
        url: uploadedUrl
      });
    }

    // Step 5: Clean up temporary files
    await cleanupTempFiles(inputVideoPath, processedClips.map(c => c.outputPath));

    // Step 6: Update job status
    await supabaseClient
      .from('video_processing_jobs')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_urls: uploadedClips.map(c => c.url),
        progress: 100
      })
      .eq('id', jobId);

    return {
      clips: uploadedClips,
      trackingApplied: !!trackingData,
      watermarkApplied: processingOptions.applyWatermark,
      processingTime: Date.now(),
    };

  } catch (error) {
    console.error('Video processing failed:', error);
    
    // Update job status to failed
    await supabaseClient
      .from('video_processing_jobs')
      .update({ 
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    throw error;
  }
}

async function downloadYouTubeVideo(youtubeUrl: string, jobId: string): Promise<string> {
  // Placeholder for YouTube video download using yt-dlp
  console.log('Downloading YouTube video:', youtubeUrl);
  
  // In a real implementation, this would:
  // 1. Use yt-dlp to download the video
  // 2. Extract audio and video streams
  // 3. Return the local file path
  
  return `/tmp/downloaded_${jobId}.mp4`;
}

async function downloadExternalVideo(videoUrl: string, jobId: string): Promise<string> {
  // Placeholder for external video download
  console.log('Downloading external video:', videoUrl);
  
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }

  const videoData = await response.arrayBuffer();
  const outputPath = `/tmp/external_${jobId}.mp4`;
  
  // Write file (placeholder - would use Deno.writeFile in real implementation)
  console.log(`Downloaded ${videoData.byteLength} bytes to ${outputPath}`);
  
  return outputPath;
}

async function downloadSupabaseFile(fileUrl: string, jobId: string, supabaseClient: any): Promise<string> {
  console.log('Downloading Supabase file:', fileUrl);
  
  // Extract file path from URL
  const urlParts = fileUrl.split('/');
  const fileName = urlParts[urlParts.length - 1];
  
  const { data: fileData, error } = await supabaseClient.storage
    .from('user-videos')
    .download(fileName);

  if (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }

  const outputPath = `/tmp/uploaded_${jobId}.mp4`;
  
  // Write file (placeholder - would use Deno.writeFile in real implementation)
  console.log(`Downloaded Supabase file to ${outputPath}`);
  
  return outputPath;
}

async function performSubjectTracking(
  videoPath: string,
  trackingOptions: any
): Promise<any> {
  console.log('Performing subject tracking on:', videoPath);
  
  // Placeholder for subject tracking using MediaPipe/OpenCV
  // In a real implementation, this would:
  // 1. Extract frames from video
  // 2. Run face detection on each frame
  // 3. Track subjects across frames
  // 4. Generate crop parameters for centering
  
  return {
    trackingRegions: [
      {
        startTime: 0,
        endTime: 30,
        centerX: 0.5,
        centerY: 0.4,
        width: 0.6,
        height: 0.8,
        confidence: 0.85,
      }
    ],
    cropParameters: {
      x: 320,
      y: 0,
      width: 720,
      height: 1080,
      aspectRatio: trackingOptions?.cropAspectRatio || 9/16,
    },
  };
}

async function processClipSegment(
  inputPath: string,
  segment: any,
  processingOptions: any,
  trackingData: any,
  jobId: string,
  clipIndex: number
): Promise<any> {
  const outputPath = `/tmp/clip_${jobId}_${clipIndex}.${processingOptions.format}`;
  
  console.log(`Processing clip segment: ${segment.title} (${segment.startTime}s - ${segment.endTime}s)`);

  // Build FFmpeg command
  const ffmpegArgs = ['ffmpeg', '-i', inputPath];

  // Time segment
  ffmpegArgs.push('-ss', segment.startTime.toString());
  ffmpegArgs.push('-t', (segment.endTime - segment.startTime).toString());

  // Video filters
  const filters = [];

  // Resolution scaling
  switch (processingOptions.maxResolution) {
    case '720p':
      filters.push('scale=1280:720:force_original_aspect_ratio=decrease');
      break;
    case '1080p':
      filters.push('scale=1920:1080:force_original_aspect_ratio=decrease');
      break;
    case '4k':
      filters.push('scale=3840:2160:force_original_aspect_ratio=decrease');
      break;
  }

  // Subject tracking crop
  if (trackingData && trackingData.cropParameters) {
    const crop = trackingData.cropParameters;
    filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  }

  // Watermark
  if (processingOptions.applyWatermark && processingOptions.watermarkConfig) {
    const wm = processingOptions.watermarkConfig;
    const positions = {
      'top-left': `x=20:y=20`,
      'top-right': `x=w-tw-20:y=20`,
      'bottom-left': `x=20:y=h-th-20`,
      'bottom-right': `x=w-tw-20:y=h-th-20`,
      'center': `x=(w-tw)/2:y=(h-th)/2`,
    };
    
    const position = positions[wm.position as keyof typeof positions] || positions['bottom-right'];
    const watermarkFilter = `drawtext=text='${wm.text}':fontsize=${wm.fontSize}:fontcolor=${wm.fontColor}:${position}:alpha=${wm.opacity}`;
    
    if (wm.backgroundColor) {
      filters[filters.length - 1] = watermarkFilter + `:box=1:boxcolor=${wm.backgroundColor}:boxborderw=8`;
    } else {
      filters.push(watermarkFilter);
    }
  }

  // Apply filters
  if (filters.length > 0) {
    ffmpegArgs.push('-vf', filters.join(','));
  }

  // Quality settings
  const qualitySettings = getQualitySettings(processingOptions.quality, processingOptions.format);
  ffmpegArgs.push(...qualitySettings);

  // Output format
  if (processingOptions.format === 'webm') {
    ffmpegArgs.push('-c:v', 'libvpx-vp9', '-c:a', 'libopus');
  } else {
    ffmpegArgs.push('-c:v', 'libx264', '-c:a', 'aac');
  }

  ffmpegArgs.push('-y', outputPath);

  // Execute FFmpeg (placeholder)
  console.log('FFmpeg command:', ffmpegArgs.join(' '));
  
  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    filename: `${segment.title}.${processingOptions.format}`,
    outputPath,
    duration: segment.endTime - segment.startTime,
    title: segment.title,
    resolution: processingOptions.maxResolution,
    watermarked: processingOptions.applyWatermark,
    tracking_applied: !!trackingData,
  };
}

function getQualitySettings(quality: string, format: string): string[] {
  const settings: Record<string, Record<string, string[]>> = {
    mp4: {
      low: ['-crf', '28', '-preset', 'fast'],
      medium: ['-crf', '23', '-preset', 'medium'],
      high: ['-crf', '18', '-preset', 'slower'],
    },
    webm: {
      low: ['-b:v', '500k', '-deadline', 'good'],
      medium: ['-b:v', '1M', '-deadline', 'good'],
      high: ['-b:v', '2M', '-deadline', 'best'],
    },
  };

  return settings[format]?.[quality] || settings.mp4.medium;
}

async function uploadClipToStorage(filePath: string, filename: string, supabaseClient: any): Promise<string> {
  console.log('Uploading clip to storage:', filename);
  
  // Read file (placeholder)
  // const fileData = await Deno.readFile(filePath);
  
  // Upload to Supabase storage
  const { data, error } = await supabaseClient.storage
    .from('processed-clips')
    .upload(`clips/${Date.now()}-${filename}`, new Uint8Array(), {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    throw new Error(`Failed to upload clip: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabaseClient.storage
    .from('processed-clips')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

async function cleanupTempFiles(inputPath: string, outputPaths: string[]): Promise<void> {
  console.log('Cleaning up temporary files...');
  
  try {
    // Remove input file
    // await Deno.remove(inputPath);
    
    // Remove output files
    for (const outputPath of outputPaths) {
      // await Deno.remove(outputPath);
    }
    
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Cleanup failed:', error);
    // Don't throw - cleanup failure shouldn't fail the whole process
  }
}
