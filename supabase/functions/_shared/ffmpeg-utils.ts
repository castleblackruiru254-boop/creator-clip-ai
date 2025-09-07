/**
 * Real FFmpeg Video Processing Utilities for Supabase Edge Functions
 * 
 * This module provides actual ffmpeg integration for video processing
 * within the Deno Edge Function environment using yt-dlp and server-side ffmpeg.
 */

import { join } from "https://deno.land/std@0.168.0/path/mod.ts";

// Real FFmpeg interface
export interface FFmpegProcessor {
  initialized: boolean;
  processVideo: (inputPath: string, outputPath: string, options: string[]) => Promise<void>;
  extractAudio: (inputPath: string, outputPath: string) => Promise<void>;
  generateThumbnail: (inputPath: string, outputPath: string, timestamp: number) => Promise<void>;
  getVideoInfo: (inputPath: string) => Promise<VideoInfo>;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  bitRate: number;
  format: string;
}

export interface ClipProcessingOptions {
  startTime: number;
  endTime: number;
  platform: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'all';
  quality?: 'high' | 'medium' | 'low';
  addSubtitles?: boolean;
  cropToVertical?: boolean;
  enhanceAudio?: boolean;
}

export interface ProcessingResult {
  videoData: Uint8Array;
  thumbnailData: Uint8Array;
  metadata: {
    duration: number;
    resolution: string;
    fileSize: number;
    format: string;
  };
}

/**
 * Initialize real FFmpeg processor
 */
export async function initializeFFmpeg(): Promise<FFmpegProcessor> {
  console.log('Initializing real FFmpeg processor...');
  
  try {
    // Check if ffmpeg and ffprobe are available
    const ffmpegCheck = new Deno.Command('ffmpeg', {
      args: ['-version'],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    try {
      const { success } = await ffmpegCheck.output();
      if (!success) {
        throw new Error('FFmpeg not available');
      }
    } catch {
      throw new Error('FFmpeg binary not found. Install ffmpeg in your deployment environment.');
    }
    
    const processor: FFmpegProcessor = {
      initialized: true,
      
      processVideo: async (inputPath: string, outputPath: string, options: string[]) => {
        const command = new Deno.Command('ffmpeg', {
          args: ['-y', '-i', inputPath, ...options, outputPath],
          stdout: 'piped',
          stderr: 'piped'
        });
        
        const { success, stderr } = await command.output();
        if (!success) {
          const errorText = new TextDecoder().decode(stderr);
          throw new Error(`FFmpeg processing failed: ${errorText}`);
        }
      },
      
      extractAudio: async (inputPath: string, outputPath: string) => {
        const command = new Deno.Command('ffmpeg', {
          args: [
            '-y',
            '-i', inputPath,
            '-vn', // No video
            '-acodec', 'pcm_s16le', // Uncompressed audio for Whisper
            '-ar', '16000', // 16kHz sample rate
            '-ac', '1', // Mono
            outputPath
          ],
          stdout: 'piped',
          stderr: 'piped'
        });
        
        const { success, stderr } = await command.output();
        if (!success) {
          const errorText = new TextDecoder().decode(stderr);
          throw new Error(`Audio extraction failed: ${errorText}`);
        }
      },
      
      generateThumbnail: async (inputPath: string, outputPath: string, timestamp: number) => {
        const command = new Deno.Command('ffmpeg', {
          args: [
            '-y',
            '-i', inputPath,
            '-ss', timestamp.toString(),
            '-vframes', '1',
            '-q:v', '2',
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
            outputPath
          ],
          stdout: 'piped',
          stderr: 'piped'
        });
        
        const { success, stderr } = await command.output();
        if (!success) {
          const errorText = new TextDecoder().decode(stderr);
          throw new Error(`Thumbnail generation failed: ${errorText}`);
        }
      },
      
      getVideoInfo: async (inputPath: string): Promise<VideoInfo> => {
        const command = new Deno.Command('ffprobe', {
          args: [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            inputPath
          ],
          stdout: 'piped',
          stderr: 'piped'
        });
        
        const { success, stdout, stderr } = await command.output();
        if (!success) {
          const errorText = new TextDecoder().decode(stderr);
          throw new Error(`Video info extraction failed: ${errorText}`);
        }
        
        const output = new TextDecoder().decode(stdout);
        const info = JSON.parse(output);
        
        const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
        if (!videoStream) {
          throw new Error('No video stream found');
        }
        
        // Parse frame rate from fraction
        const frameRateStr = videoStream.r_frame_rate || '30/1';
        const [num, den] = frameRateStr.split('/').map(Number);
        const frameRate = den ? num / den : 30;
        
        return {
          duration: parseFloat(info.format.duration || '0'),
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          frameRate,
          bitRate: parseInt(info.format.bit_rate || '0'),
          format: info.format.format_name || 'unknown'
        };
      }
    };
    
    console.log('Real FFmpeg processor initialized successfully');
    return processor;
    
  } catch (error) {
    console.error('Failed to initialize FFmpeg:', error);
    throw new Error('Video processing engine initialization failed');
  }
}

/**
 * Download YouTube video using yt-dlp
 */
export async function downloadYouTubeVideo(videoUrl: string, outputDir: string): Promise<string> {
  console.log(`Downloading video from: ${videoUrl}`);
  
  try {
    // Check if yt-dlp is available
    const ytDlpCheck = new Deno.Command('yt-dlp', {
      args: ['--version'],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    try {
      const { success } = await ytDlpCheck.output();
      if (!success) {
        throw new Error('yt-dlp not available');
      }
    } catch {
      throw new Error('yt-dlp not found. Install yt-dlp in your deployment environment.');
    }
    
    const outputTemplate = join(outputDir, 'video.%(ext)s');
    
    const command = new Deno.Command('yt-dlp', {
      args: [
        videoUrl,
        '-f', 'best[height<=1080][ext=mp4]/best[height<=1080]', // Prefer mp4, max 1080p
        '-o', outputTemplate,
        '--no-playlist',
        '--extract-flat', 'false'
      ],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    const { success, stdout, stderr } = await command.output();
    
    if (!success) {
      const errorText = new TextDecoder().decode(stderr);
      throw new Error(`YouTube download failed: ${errorText}`);
    }
    
    // Find the downloaded video file
    const files = [];
    for await (const entry of Deno.readDir(outputDir)) {
      if (entry.isFile && (entry.name.endsWith('.mp4') || entry.name.endsWith('.mkv') || entry.name.endsWith('.webm'))) {
        files.push(entry.name);
      }
    }
    
    if (files.length === 0) {
      throw new Error('No video file found after download');
    }
    
    const videoPath = join(outputDir, files[0]);
    console.log(`Video downloaded successfully: ${videoPath}`);
    return videoPath;
    
  } catch (error) {
    console.error('YouTube download failed:', error);
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

/**
 * Process video clip with platform-specific optimizations
 */
export async function processVideoClip(
  processor: FFmpegProcessor,
  inputVideoPath: string,
  outputPath: string,
  options: ClipProcessingOptions
): Promise<ProcessingResult> {
  const { startTime, endTime, platform, quality = 'medium' } = options;
  const duration = endTime - startTime;
  
  console.log(`Processing ${duration}s clip for ${platform} (${quality} quality)`);
  
  try {
    // Get video info first
    const videoInfo = await processor.getVideoInfo(inputVideoPath);
    console.log(`Input video: ${videoInfo.width}x${videoInfo.height}, ${videoInfo.duration}s`);
    
    // Build FFmpeg options for clip processing
    const ffmpegOptions = buildFFmpegOptions({
      startTime,
      endTime,
      platform,
      quality,
      sourceWidth: videoInfo.width,
      sourceHeight: videoInfo.height,
      ...options
    });
    
    console.log('Processing video with FFmpeg...');
    
    // Process the video clip
    await processor.processVideo(inputVideoPath, outputPath, ffmpegOptions);
    
    // Generate thumbnail
    const thumbnailPath = outputPath.replace('.mp4', '_thumb.jpg');
    await processor.generateThumbnail(inputVideoPath, thumbnailPath, startTime + duration / 2);
    
    // Read processed files
    const videoData = await Deno.readFile(outputPath);
    const thumbnailData = await Deno.readFile(thumbnailPath);
    
    const resolution = getPlatformResolution(platform);
    
    return {
      videoData,
      thumbnailData,
      metadata: {
        duration,
        resolution: resolution.display,
        fileSize: videoData.length,
        format: 'mp4'
      }
    };
    
  } catch (error) {
    console.error('Video processing failed:', error);
    throw new Error(`Video clip processing failed: ${error.message}`);
  }
}

/**
 * Build FFmpeg options for real video processing
 */
function buildFFmpegOptions(params: {
  startTime: number;
  endTime: number;
  platform: string;
  quality: string;
  sourceWidth: number;
  sourceHeight: number;
  cropToVertical?: boolean;
  enhanceAudio?: boolean;
}): string[] {
  const { startTime, endTime, platform, quality, sourceWidth, sourceHeight } = params;
  const duration = endTime - startTime;
  
  const platformConfig = getPlatformConfig(platform);
  const qualityConfig = getQualityConfig(quality);
  
  const options = [
    '-ss', startTime.toString(),
    '-t', duration.toString(),
    '-c:v', 'libx264',
    '-preset', qualityConfig.preset,
    '-crf', qualityConfig.crf.toString(),
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2'
  ];
  
  // Determine if we need to crop to vertical format
  const needsCropping = params.cropToVertical !== false && (sourceWidth > sourceHeight);
  
  // Build video filter chain
  const videoFilters = [];
  
  if (needsCropping) {
    // Smart crop to vertical format - center crop with intelligent detection
    videoFilters.push(`crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':x='(iw-ow)/2':y='(ih-oh)/2'`);
  }
  
  // Scale to target resolution
  videoFilters.push(`scale=${platformConfig.resolution}:force_original_aspect_ratio=decrease`);
  videoFilters.push(`pad=${platformConfig.resolution}:(ow-iw)/2:(oh-ih)/2:black`);
  
  // Add platform-specific enhancements
  const platformFilters = getPlatformVideoFilters(platform);
  if (platformFilters.enhance) {
    videoFilters.push(platformFilters.enhance);
  }
  
  // Apply video filters
  if (videoFilters.length > 0) {
    options.push('-vf', videoFilters.join(','));
  }
  
  // Set frame rate
  options.push('-r', platformConfig.frameRate.toString());
  
  // Add audio enhancements if requested
  if (params.enhanceAudio) {
    options.push('-af', 'volume=1.1,dynaudnorm,highpass=f=80,lowpass=f=12000');
  }
  
  // Output format optimizations
  options.push('-f', 'mp4');
  options.push('-movflags', '+faststart');
  options.push('-pix_fmt', 'yuv420p');
  
  // Limit file size for social media
  if (platform !== 'all') {
    const maxSizeMB = getMaxFileSizeForPlatform(platform);
    const targetBitrate = calculateTargetBitrate(duration, maxSizeMB);
    options.push('-maxrate', `${targetBitrate}k`);
    options.push('-bufsize', `${targetBitrate * 2}k`);
  }
  
  return options;
}

/**
 * Get platform-specific configuration
 */
function getPlatformConfig(platform: string) {
  const configs = {
    tiktok: {
      resolution: '1080x1920',
      frameRate: 30,
      maxDuration: 60,
      aspectRatio: '9:16'
    },
    youtube_shorts: {
      resolution: '1080x1920',
      frameRate: 30,
      maxDuration: 60,
      aspectRatio: '9:16'
    },
    instagram_reels: {
      resolution: '1080x1920',
      frameRate: 30,
      maxDuration: 90,
      aspectRatio: '9:16'
    },
    all: {
      resolution: '1080x1920',
      frameRate: 30,
      maxDuration: 60,
      aspectRatio: '9:16'
    }
  };
  
  return configs[platform as keyof typeof configs] || configs.all;
}

/**
 * Get quality-specific encoding settings
 */
function getQualityConfig(quality: string) {
  const configs = {
    high: {
      preset: 'medium',
      crf: 18,
      bitrate: '4000k'
    },
    medium: {
      preset: 'fast',
      crf: 23,
      bitrate: '2000k'
    },
    low: {
      preset: 'ultrafast',
      crf: 28,
      bitrate: '1000k'
    }
  };
  
  return configs[quality as keyof typeof configs] || configs.medium;
}

/**
 * Get platform-specific video filters
 */
function getPlatformVideoFilters(platform: string) {
  const platformFilters = {
    tiktok: {
      enhance: "unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.1:brightness=0.02:saturation=1.1"
    },
    youtube_shorts: {
      enhance: "unsharp=5:5:1.0:5:5:0.0"
    },
    instagram_reels: {
      enhance: "unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.05:saturation=1.05"
    },
    all: {
      enhance: "unsharp=5:5:1.0:5:5:0.0"
    }
  };
  
  return platformFilters[platform as keyof typeof platformFilters] || platformFilters.all;
}

/**
 * Get platform resolution info
 */
function getPlatformResolution(platform: string) {
  const resolutions = {
    tiktok: { width: 1080, height: 1920, display: '1080x1920' },
    youtube_shorts: { width: 1080, height: 1920, display: '1080x1920' },
    instagram_reels: { width: 1080, height: 1920, display: '1080x1920' },
    all: { width: 1080, height: 1920, display: '1080x1920' }
  };
  
  return resolutions[platform as keyof typeof resolutions] || resolutions.all;
}

/**
 * Get maximum file size for each platform (in MB)
 */
function getMaxFileSizeForPlatform(platform: string): number {
  const maxSizes = {
    tiktok: 287,
    youtube_shorts: 256,
    instagram_reels: 250,
    all: 200
  };
  
  return maxSizes[platform as keyof typeof maxSizes] || maxSizes.all;
}

/**
 * Calculate target bitrate based on duration and file size limit
 */
function calculateTargetBitrate(durationSeconds: number, maxSizeMB: number): number {
  const maxBits = (maxSizeMB * 8 * 1024 * 1024) * 0.9;
  const audioBits = 128 * 1024 * durationSeconds;
  const videoBits = maxBits - audioBits;
  
  return Math.max(500, Math.floor(videoBits / 1024 / durationSeconds));
}

/**
 * Create temporary working directory
 */
export async function createWorkingDirectory(): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: 'viralclips_' });
  console.log(`Created working directory: ${tempDir}`);
  return tempDir;
}

/**
 * Clean up temporary files and directories
 */
export async function cleanupWorkingDirectory(workingDir: string): Promise<void> {
  try {
    await Deno.remove(workingDir, { recursive: true });
    console.log(`Cleaned up working directory: ${workingDir}`);
  } catch (error) {
    console.warn(`Failed to cleanup working directory: ${error.message}`);
  }
}

/**
 * Upload processed files to Supabase Storage
 */
export async function uploadToStorage(
  supabaseClient: any,
  videoData: Uint8Array,
  thumbnailData: Uint8Array,
  clipId: string,
  platform: string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  try {
    const videoFileName = `clips/${clipId}_${platform}.mp4`;
    const { error: videoError } = await supabaseClient.storage
      .from('videos')
      .upload(videoFileName, videoData, {
        contentType: 'video/mp4',
        upsert: true
      });
    
    if (videoError) throw videoError;
    
    const thumbnailFileName = `thumbnails/${clipId}_${platform}.jpg`;
    const { error: thumbError } = await supabaseClient.storage
      .from('videos')
      .upload(thumbnailFileName, thumbnailData, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (thumbError) throw thumbError;
    
    const { data: videoUrl } = supabaseClient.storage
      .from('videos')
      .getPublicUrl(videoFileName);
      
    const { data: thumbnailUrl } = supabaseClient.storage
      .from('videos')
      .getPublicUrl(thumbnailFileName);
    
    return {
      videoUrl: videoUrl.publicUrl,
      thumbnailUrl: thumbnailUrl.publicUrl
    };
    
  } catch (error) {
    console.error('Storage upload failed:', error);
    throw new Error(`Failed to upload processed files: ${error.message}`);
  }
}

/**
 * Extract audio for transcript generation
 */
export async function extractAudioForTranscript(
  processor: FFmpegProcessor,
  inputVideoPath: string,
  outputAudioPath: string
): Promise<void> {
  console.log('Extracting audio for transcript generation...');
  
  try {
    await processor.extractAudio(inputVideoPath, outputAudioPath);
    console.log(`Audio extracted successfully: ${outputAudioPath}`);
  } catch (error) {
    console.error('Audio extraction failed:', error);
    throw new Error(`Failed to extract audio: ${error.message}`);
  }
}

/**
 * Validate FFmpeg processor is ready
 */
export function validateFFmpegReady(processor: FFmpegProcessor | null): { ready: boolean; error?: string } {
  try {
    if (!processor) {
      return { ready: false, error: 'FFmpeg processor not provided' };
    }
    
    if (!processor.initialized) {
      return { ready: false, error: 'FFmpeg processor not initialized' };
    }
    
    return { ready: true };
  } catch (error) {
    return { ready: false, error: 'FFmpeg validation failed' };
  }
}

/**
 * Validate video file format and compatibility
 */
export async function validateVideoFile(videoPath: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const command = new Deno.Command('ffprobe', {
      args: [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        videoPath
      ],
      stdout: 'piped',
      stderr: 'piped'
    });
    
    const { success } = await command.output();
    
    if (!success) {
      return { valid: false, error: 'Invalid video file or format not supported' };
    }
    
    return { valid: true };
    
  } catch (error) {
    return { valid: false, error: `Video validation failed: ${error.message}` };
  }
}

/**
 * Estimate processing time based on clip duration and complexity
 */
export function estimateProcessingTime(
  duration: number, 
  options: ClipProcessingOptions
): number {
  let estimatedSeconds = duration * 2;
  
  if (options.addSubtitles) estimatedSeconds += 10;
  if (options.enhanceAudio) estimatedSeconds += 5;
  if (options.quality === 'high') estimatedSeconds *= 1.5;
  
  estimatedSeconds += 15; // I/O overhead
  
  return Math.ceil(estimatedSeconds);
}
