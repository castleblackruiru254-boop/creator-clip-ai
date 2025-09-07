import { z } from 'zod';

// Video format validation schemas
export const videoFormatSchema = z.object({
  container: z.enum(['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'm4v']),
  videoCodec: z.enum(['h264', 'h265', 'vp8', 'vp9', 'av1', 'mpeg4', 'xvid']).optional(),
  audioCodec: z.enum(['aac', 'mp3', 'opus', 'vorbis', 'ac3', 'flac']).optional(),
  resolution: z.object({
    width: z.number().min(144).max(7680), // 144p to 8K
    height: z.number().min(144).max(4320),
  }).optional(),
  frameRate: z.number().min(1).max(120).optional(),
  bitrate: z.number().min(100).max(100000).optional(), // 100 Kbps to 100 Mbps
  duration: z.number().min(1).max(43200), // 1 second to 12 hours
  fileSize: z.number().min(1).max(10 * 1024 * 1024 * 1024), // 1 byte to 10GB
});

export type VideoFormat = z.infer<typeof videoFormatSchema>;

// Supported video file extensions
export const SUPPORTED_VIDEO_EXTENSIONS = [
  '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.m4v'
] as const;

// Maximum file size (10GB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;

// Maximum duration (12 hours)
export const MAX_DURATION = 12 * 60 * 60;

// Minimum quality requirements
export const MIN_RESOLUTION = { width: 144, height: 144 }; // 144p
export const MIN_BITRATE = 100; // 100 Kbps

// Preferred formats for optimal processing
export const PREFERRED_FORMATS = {
  container: ['mp4', 'mov'] as const,
  videoCodec: ['h264', 'h265'] as const,
  audioCodec: ['aac', 'mp3'] as const,
};

/**
 * Validates if a file extension is supported
 */
export function isValidVideoExtension(filename: string): boolean {
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension ? SUPPORTED_VIDEO_EXTENSIONS.includes(extension as any) : false;
}

/**
 * Validates video file size
 */
export function isValidFileSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE;
}

/**
 * Validates video duration
 */
export function isValidDuration(durationSeconds: number): boolean {
  return durationSeconds > 0 && durationSeconds <= MAX_DURATION;
}

/**
 * Gets format validation errors
 */
export function getFormatValidationErrors(format: Partial<VideoFormat>): string[] {
  const errors: string[] = [];
  
  try {
    videoFormatSchema.parse(format);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.errors.map(err => {
        const field = err.path.join('.');
        return `${field}: ${err.message}`;
      });
    }
  }
  
  return errors;
}

/**
 * Checks if video format needs conversion for optimal processing
 */
export function needsFormatConversion(format: VideoFormat): boolean {
  // Check if container format is preferred
  if (!PREFERRED_FORMATS.container.includes(format.container as any)) {
    return true;
  }
  
  // Check if video codec is preferred (if available)
  if (format.videoCodec && !PREFERRED_FORMATS.videoCodec.includes(format.videoCodec as any)) {
    return true;
  }
  
  // Check if audio codec is preferred (if available)
  if (format.audioCodec && !PREFERRED_FORMATS.audioCodec.includes(format.audioCodec as any)) {
    return true;
  }
  
  return false;
}

/**
 * Gets recommended conversion settings
 */
export function getRecommendedConversionSettings(format: VideoFormat): {
  container: string;
  videoCodec: string;
  audioCodec: string;
  shouldConvert: boolean;
} {
  const shouldConvert = needsFormatConversion(format);
  
  return {
    container: shouldConvert ? 'mp4' : format.container,
    videoCodec: shouldConvert ? 'h264' : format.videoCodec || 'h264',
    audioCodec: shouldConvert ? 'aac' : format.audioCodec || 'aac',
    shouldConvert,
  };
}

/**
 * Validates URL format for video sources
 */
export function isValidVideoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Check for supported domains
    const supportedDomains = [
      'youtube.com',
      'youtu.be',
      'www.youtube.com',
      'vimeo.com',
      'www.vimeo.com',
      'dailymotion.com',
      'www.dailymotion.com',
    ];
    
    return supportedDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Extracts video platform from URL
 */
export function getVideoPlatform(url: string): 'youtube' | 'vimeo' | 'dailymotion' | 'unknown' {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      return 'youtube';
    }
    if (hostname.includes('vimeo')) {
      return 'vimeo';
    }
    if (hostname.includes('dailymotion')) {
      return 'dailymotion';
    }
    
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Estimates processing time based on video properties
 */
export function estimateProcessingTime(format: VideoFormat): {
  transcriptTime: number; // seconds
  analysisTime: number;   // seconds
  clipTime: number;       // seconds per clip
} {
  const { duration, resolution, fileSize } = format;
  
  // Base processing times (in seconds)
  const transcriptBaseTime = Math.max(duration * 0.1, 30); // 10% of duration, min 30s
  const analysisBaseTime = Math.max(duration * 0.05, 15);  // 5% of duration, min 15s
  const clipBaseTime = 45; // 45 seconds per clip
  
  // Adjust for resolution
  let resolutionMultiplier = 1;
  if (resolution) {
    const pixels = resolution.width * resolution.height;
    if (pixels >= 3840 * 2160) { // 4K
      resolutionMultiplier = 2.5;
    } else if (pixels >= 1920 * 1080) { // 1080p
      resolutionMultiplier = 1.5;
    } else if (pixels >= 1280 * 720) { // 720p
      resolutionMultiplier = 1.2;
    }
  }
  
  // Adjust for file size
  let sizeMultiplier = 1;
  if (fileSize > 5 * 1024 * 1024 * 1024) { // > 5GB
    sizeMultiplier = 2;
  } else if (fileSize > 1024 * 1024 * 1024) { // > 1GB
    sizeMultiplier = 1.3;
  }
  
  return {
    transcriptTime: Math.ceil(transcriptBaseTime * resolutionMultiplier * sizeMultiplier),
    analysisTime: Math.ceil(analysisBaseTime),
    clipTime: Math.ceil(clipBaseTime * resolutionMultiplier),
  };
}

/**
 * Formats duration in human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

/**
 * Formats file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Validates video metadata extracted from file
 */
export function validateVideoMetadata(metadata: any): {
  isValid: boolean;
  errors: string[];
  format?: VideoFormat;
} {
  const errors: string[] = [];
  
  // Required fields validation
  if (!metadata.duration || typeof metadata.duration !== 'number') {
    errors.push('Invalid or missing duration');
  }
  
  if (!metadata.container || typeof metadata.container !== 'string') {
    errors.push('Invalid or missing container format');
  }
  
  if (!metadata.fileSize || typeof metadata.fileSize !== 'number') {
    errors.push('Invalid or missing file size');
  }
  
  if (errors.length > 0) {
    return { isValid: false, errors };
  }
  
  // Build format object
  const format: VideoFormat = {
    container: metadata.container.toLowerCase(),
    duration: metadata.duration,
    fileSize: metadata.fileSize,
  };
  
  // Optional fields
  if (metadata.videoCodec) {
    format.videoCodec = metadata.videoCodec.toLowerCase();
  }
  
  if (metadata.audioCodec) {
    format.audioCodec = metadata.audioCodec.toLowerCase();
  }
  
  if (metadata.resolution) {
    format.resolution = {
      width: metadata.resolution.width,
      height: metadata.resolution.height,
    };
  }
  
  if (metadata.frameRate) {
    format.frameRate = metadata.frameRate;
  }
  
  if (metadata.bitrate) {
    format.bitrate = metadata.bitrate;
  }
  
  // Validate using schema
  const validationErrors = getFormatValidationErrors(format);
  
  return {
    isValid: validationErrors.length === 0,
    errors: validationErrors,
    format: validationErrors.length === 0 ? format : undefined,
  };
}

/**
 * Gets video quality rating based on format
 */
export function getVideoQualityRating(format: VideoFormat): {
  rating: 'poor' | 'fair' | 'good' | 'excellent';
  score: number; // 0-100
  factors: string[];
} {
  let score = 50; // Base score
  const factors: string[] = [];
  
  // Resolution scoring
  if (format.resolution) {
    const pixels = format.resolution.width * format.resolution.height;
    if (pixels >= 3840 * 2160) { // 4K
      score += 30;
      factors.push('4K resolution');
    } else if (pixels >= 1920 * 1080) { // 1080p
      score += 20;
      factors.push('1080p resolution');
    } else if (pixels >= 1280 * 720) { // 720p
      score += 10;
      factors.push('720p resolution');
    } else if (pixels < 640 * 480) { // Below 480p
      score -= 20;
      factors.push('Low resolution');
    }
  }
  
  // Codec scoring
  if (format.videoCodec === 'h265' || format.videoCodec === 'av1') {
    score += 15;
    factors.push('Modern video codec');
  } else if (format.videoCodec === 'h264') {
    score += 5;
    factors.push('Standard video codec');
  }
  
  if (format.audioCodec === 'aac' || format.audioCodec === 'opus') {
    score += 5;
    factors.push('Good audio codec');
  }
  
  // Bitrate scoring
  if (format.bitrate) {
    if (format.bitrate >= 8000) { // 8 Mbps+
      score += 10;
      factors.push('High bitrate');
    } else if (format.bitrate >= 3000) { // 3 Mbps+
      score += 5;
      factors.push('Good bitrate');
    } else if (format.bitrate < 1000) { // < 1 Mbps
      score -= 10;
      factors.push('Low bitrate');
    }
  }
  
  // Frame rate scoring
  if (format.frameRate) {
    if (format.frameRate >= 60) {
      score += 10;
      factors.push('High frame rate');
    } else if (format.frameRate >= 30) {
      score += 5;
      factors.push('Standard frame rate');
    } else if (format.frameRate < 24) {
      score -= 10;
      factors.push('Low frame rate');
    }
  }
  
  // Container format preference
  if (PREFERRED_FORMATS.container.includes(format.container as any)) {
    score += 5;
    factors.push('Preferred container format');
  }
  
  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));
  
  // Determine rating
  let rating: 'poor' | 'fair' | 'good' | 'excellent';
  if (score >= 80) {
    rating = 'excellent';
  } else if (score >= 60) {
    rating = 'good';
  } else if (score >= 40) {
    rating = 'fair';
  } else {
    rating = 'poor';
  }
  
  return { rating, score, factors };
}

/**
 * Checks if video is suitable for social media clips
 */
export function isSuitableForClips(format: VideoFormat): {
  suitable: boolean;
  warnings: string[];
  recommendations: string[];
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  // Check resolution
  if (format.resolution) {
    const { width, height } = format.resolution;
    const aspectRatio = width / height;
    
    // Warn about very low resolution
    if (width < 720 || height < 720) {
      warnings.push('Low resolution may result in poor quality clips');
      recommendations.push('Use higher resolution source videos (720p+)');
    }
    
    // Recommend aspect ratios for different platforms
    if (aspectRatio > 2) {
      warnings.push('Very wide aspect ratio may not work well for vertical clips');
      recommendations.push('Consider cropping to 16:9 or 9:16 for better mobile viewing');
    }
  }
  
  // Check duration
  if (format.duration < 30) {
    warnings.push('Very short videos may not have enough content for clips');
  } else if (format.duration > 3600) { // 1 hour
    recommendations.push('Long videos may take significant time to process');
  }
  
  // Check audio quality
  if (!format.audioCodec) {
    warnings.push('No audio detected - clips may be less engaging');
  }
  
  // Check file size vs duration ratio (quality indicator)
  const bitrate = (format.fileSize * 8) / format.duration / 1000; // Kbps
  if (bitrate < 500) {
    warnings.push('Low quality encoding detected - may affect clip quality');
    recommendations.push('Use higher quality source videos');
  }
  
  // Overall suitability
  const suitable = warnings.length < 3; // Arbitrary threshold
  
  return { suitable, warnings, recommendations };
}

/**
 * Gets optimal output settings for clips based on input format
 */
export function getOptimalClipSettings(format: VideoFormat): {
  container: string;
  videoCodec: string;
  audioCodec: string;
  resolution?: { width: number; height: number };
  bitrate?: number;
  frameRate?: number;
} {
  const settings = {
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
  } as any;
  
  // Optimize resolution for social media
  if (format.resolution) {
    const { width, height } = format.resolution;
    const aspectRatio = width / height;
    
    if (aspectRatio > 1.5) {
      // Landscape - optimize for YouTube Shorts/TikTok landscape
      settings.resolution = { width: 1920, height: 1080 };
    } else if (aspectRatio < 0.8) {
      // Portrait - optimize for TikTok/Instagram Reels
      settings.resolution = { width: 1080, height: 1920 };
    } else {
      // Square-ish - optimize for Instagram
      settings.resolution = { width: 1080, height: 1080 };
    }
    
    // Don't upscale
    if (width < settings.resolution.width || height < settings.resolution.height) {
      settings.resolution = { width, height };
    }
  }
  
  // Optimize bitrate for file size vs quality
  if (format.bitrate) {
    settings.bitrate = Math.min(format.bitrate, 5000); // Cap at 5 Mbps
  } else {
    settings.bitrate = 3000; // Default 3 Mbps
  }
  
  // Optimize frame rate
  if (format.frameRate && format.frameRate > 30) {
    settings.frameRate = 30; // Cap at 30fps for social media
  }
  
  return settings;
}

/**
 * Client-side file validation (before upload)
 */
export function validateVideoFile(file: File): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check file extension
  if (!isValidVideoExtension(file.name)) {
    errors.push(`Unsupported file format. Supported formats: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`);
  }
  
  // Check file size
  if (!isValidFileSize(file.size)) {
    if (file.size === 0) {
      errors.push('File appears to be empty');
    } else {
      errors.push(`File size too large. Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`);
    }
  }
  
  // Warnings for large files
  if (file.size > 1024 * 1024 * 1024) { // > 1GB
    warnings.push('Large file may take significant time to process');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Gets processing time estimates for user display
 */
export function getProcessingEstimate(format: VideoFormat, highlightCount: number = 5): {
  totalTime: number;
  breakdown: {
    transcript: number;
    analysis: number;
    clips: number;
  };
  formattedTime: string;
} {
  const estimates = estimateProcessingTime(format);
  const breakdown = {
    transcript: estimates.transcriptTime,
    analysis: estimates.analysisTime,
    clips: estimates.clipTime * highlightCount,
  };
  
  const totalTime = breakdown.transcript + breakdown.analysis + breakdown.clips;
  
  return {
    totalTime,
    breakdown,
    formattedTime: formatDuration(totalTime),
  };
}
