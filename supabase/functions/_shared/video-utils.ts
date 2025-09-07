/**
 * Video Download and Processing Utilities for Supabase Edge Functions
 * 
 * This module provides utilities for downloading and processing videos
 * within the Deno Edge Function environment.
 */

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  url: string;
  thumbnailUrl: string;
  audioUrl?: string;
  formats: VideoFormat[];
}

export interface VideoFormat {
  itag: number;
  url: string;
  mimeType: string;
  quality: string;
  hasAudio: boolean;
  hasVideo: boolean;
  container: string;
  filesize?: number;
}

export interface DownloadOptions {
  quality?: 'highest' | 'lowest' | 'medium' | 'audio_only';
  format?: 'mp4' | 'webm' | 'm4a' | 'mp3';
  maxFileSize?: number; // in bytes
}

/**
 * Download YouTube video information and available formats
 * Note: This is a simplified implementation. In production, you'd use
 * a service like youtube-dl-exec or yt-dlp for robust video downloading.
 */
export async function getVideoInfo(videoUrl: string): Promise<VideoInfo> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!youtubeApiKey) {
    throw new Error('YouTube API key not configured');
  }

  // Get basic video info from YouTube API
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${youtubeApiKey}`;
  const response = await fetch(apiUrl);
  
  if (!response.ok) {
    throw new Error('Failed to fetch video information');
  }
  
  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('Video not found');
  }
  
  const videoData = data.items[0];
  const duration = parseDuration(videoData.contentDetails.duration);
  
  // In a real implementation, you would use youtube-dl or yt-dlp here
  // to get the actual download URLs. For now, we'll return mock formats.
  const mockFormats: VideoFormat[] = [
    {
      itag: 22,
      url: `https://mock-cdn.example.com/${videoId}/720p.mp4`,
      mimeType: 'video/mp4',
      quality: '720p',
      hasAudio: true,
      hasVideo: true,
      container: 'mp4',
      filesize: 50 * 1024 * 1024 // 50MB estimate
    },
    {
      itag: 18,
      url: `https://mock-cdn.example.com/${videoId}/360p.mp4`,
      mimeType: 'video/mp4',
      quality: '360p',
      hasAudio: true,
      hasVideo: true,
      container: 'mp4',
      filesize: 20 * 1024 * 1024 // 20MB estimate
    },
    {
      itag: 140,
      url: `https://mock-cdn.example.com/${videoId}/audio.m4a`,
      mimeType: 'audio/mp4',
      quality: 'audio_only',
      hasAudio: true,
      hasVideo: false,
      container: 'm4a',
      filesize: 5 * 1024 * 1024 // 5MB estimate
    }
  ];
  
  return {
    id: videoId,
    title: videoData.snippet.title,
    duration,
    url: videoUrl,
    thumbnailUrl: videoData.snippet.thumbnails.high?.url || videoData.snippet.thumbnails.medium?.url,
    formats: mockFormats
  };
}

/**
 * Download video segment for clip generation
 * In production, this would integrate with youtube-dl and ffmpeg
 */
export async function downloadVideoSegment(
  videoInfo: VideoInfo,
  startTime: number,
  endTime: number,
  options: DownloadOptions = {}
): Promise<Uint8Array> {
  console.log(`Downloading segment ${startTime}s-${endTime}s from video ${videoInfo.id}`);
  
  // Select appropriate format
  const format = selectBestFormat(videoInfo.formats, options);
  if (!format) {
    throw new Error('No suitable video format found');
  }
  
  console.log(`Using format: ${format.quality} (${format.mimeType})`);
  
  // In production, this would:
  // 1. Download the video using the format URL
  // 2. Use ffmpeg to extract the segment (startTime to endTime)
  // 3. Apply any necessary processing (resize, crop, format conversion)
  // 4. Return the processed video data
  
  // For now, return mock video data
  const mockVideoData = new Uint8Array(1024 * 1024); // 1MB of mock data
  mockVideoData.fill(0x00); // Fill with zeros for demo
  
  return mockVideoData;
}

/**
 * Generate thumbnail for a video clip at a specific timestamp
 */
export async function generateThumbnail(
  videoInfo: VideoInfo,
  timestamp: number
): Promise<string> {
  // In production, this would:
  // 1. Extract a frame from the video at the specified timestamp
  // 2. Process it (resize, enhance, add overlays)
  // 3. Upload to storage and return URL
  
  // For now, return YouTube's thumbnail with timestamp
  return `https://img.youtube.com/vi/${videoInfo.id}/maxresdefault.jpg`;
}

/**
 * Extract audio from video for transcript generation
 */
export async function extractAudio(videoInfo: VideoInfo): Promise<Uint8Array> {
  console.log(`Extracting audio from video ${videoInfo.id}`);
  
  // Find audio format
  const audioFormat = videoInfo.formats.find(f => f.hasAudio && !f.hasVideo) ||
                      videoInfo.formats.find(f => f.hasAudio);
  
  if (!audioFormat) {
    throw new Error('No audio format available');
  }
  
  // In production, download and extract audio using ffmpeg
  // For now, return mock audio data
  const mockAudioData = new Uint8Array(512 * 1024); // 512KB of mock audio data
  mockAudioData.fill(0x00);
  
  return mockAudioData;
}

/**
 * Process video clip for specific platform requirements
 */
export async function processClipForPlatform(
  videoData: Uint8Array,
  platform: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'all'
): Promise<Uint8Array> {
  console.log(`Processing clip for platform: ${platform}`);
  
  // Platform-specific processing configurations
  const platformConfigs = {
    tiktok: {
      aspectRatio: '9:16',
      maxDuration: 60,
      resolution: '1080x1920',
      frameRate: 30
    },
    youtube_shorts: {
      aspectRatio: '9:16',
      maxDuration: 60,
      resolution: '1080x1920',
      frameRate: 30
    },
    instagram_reels: {
      aspectRatio: '9:16',
      maxDuration: 90,
      resolution: '1080x1920',
      frameRate: 30
    },
    all: {
      aspectRatio: '9:16',
      maxDuration: 60,
      resolution: '1080x1920',
      frameRate: 30
    }
  };
  
  const config = platformConfigs[platform];
  
  // In production, use ffmpeg.wasm to:
  // 1. Resize video to platform requirements
  // 2. Adjust aspect ratio (crop or letterbox)
  // 3. Optimize compression
  // 4. Add platform-specific effects or overlays
  
  console.log(`Applied ${platform} processing: ${config.resolution} at ${config.frameRate}fps`);
  
  // For now, return the original data (in production this would be processed)
  return videoData;
}

// Helper functions

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

function selectBestFormat(formats: VideoFormat[], options: DownloadOptions): VideoFormat | null {
  let filtered = formats.filter(f => f.hasVideo && f.hasAudio);
  
  if (options.format) {
    filtered = filtered.filter(f => f.container === options.format);
  }
  
  if (options.maxFileSize) {
    filtered = filtered.filter(f => !f.filesize || f.filesize <= options.maxFileSize!);
  }
  
  switch (options.quality) {
    case 'highest':
      return filtered.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))[0] || null;
    case 'lowest':
      return filtered.sort((a, b) => parseInt(a.quality) - parseInt(b.quality))[0] || null;
    case 'audio_only':
      return formats.find(f => f.hasAudio && !f.hasVideo) || null;
    default:
      // Medium quality - prefer 360p or 480p
      return filtered.find(f => f.quality.includes('360') || f.quality.includes('480')) || 
             filtered[0] || null;
  }
}

/**
 * Upload processed video to Supabase Storage
 * Returns the public URL of the uploaded video
 */
export async function uploadVideoToStorage(
  videoData: Uint8Array,
  fileName: string,
  bucket: string = 'clips'
): Promise<string> {
  // In production, upload to Supabase Storage:
  // const { data, error } = await supabase.storage
  //   .from(bucket)
  //   .upload(fileName, videoData, {
  //     contentType: 'video/mp4',
  //     upsert: false
  //   });
  
  // For now, return a mock URL
  return `https://mock-storage.supabase.co/storage/v1/object/public/${bucket}/${fileName}`;
}

/**
 * Validate video meets processing requirements
 */
export function validateVideoForProcessing(videoInfo: VideoInfo): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check duration (2 minutes to 2 hours)
  if (videoInfo.duration < 120) {
    errors.push('Video is too short (minimum 2 minutes)');
  }
  if (videoInfo.duration > 7200) {
    errors.push('Video is too long (maximum 2 hours)');
  }
  
  // Check if we have suitable formats
  const hasVideoAudio = videoInfo.formats.some(f => f.hasVideo && f.hasAudio);
  if (!hasVideoAudio) {
    errors.push('No suitable video+audio format available');
  }
  
  // Check file sizes (estimate total size)
  const estimatedSize = videoInfo.formats.reduce((max, f) => 
    Math.max(max, f.filesize || 0), 0);
  if (estimatedSize > 500 * 1024 * 1024) { // 500MB limit
    errors.push('Video file is too large (maximum 500MB)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
