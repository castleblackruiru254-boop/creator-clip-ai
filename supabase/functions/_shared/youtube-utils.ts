/**
 * YouTube URL Processing Utilities for Supabase Edge Functions
 * 
 * This module provides robust YouTube URL parsing and validation
 * that handles all YouTube URL formats and tracking parameters.
 */

export interface YouTubeUrlInfo {
  videoId: string;
  originalUrl: string;
  cleanUrl: string;
  thumbnailUrl: string;
  embedUrl: string;
}

/**
 * Extract video ID from any YouTube URL format
 * Handles all known YouTube URL patterns and strips tracking parameters
 */
export function extractVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Remove any leading/trailing whitespace
  url = url.trim();

  // Support for various YouTube URL formats
  const patterns = [
    // Standard YouTube URLs
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    // Shortened youtu.be URLs  
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    // YouTube embed URLs
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    // YouTube mobile URLs
    /(?:m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    // YouTube gaming URLs
    /(?:gaming\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    // YouTube music URLs
    /(?:music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    // YouTube v/ URLs
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    // YouTube with additional parameters
    /(?:youtube\.com\/.*[?&]v=)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      // Validate that the extracted ID is exactly 11 characters (YouTube standard)
      const videoId = match[1];
      if (videoId.length === 11 && /^[a-zA-Z0-9_-]+$/.test(videoId)) {
        return videoId;
      }
    }
  }
  
  return null;
}

/**
 * Validate if a URL is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null;
}

/**
 * Clean YouTube URL by removing tracking parameters and normalizing format
 */
export function cleanYouTubeUrl(url: string): string | null {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return null;
  }
  
  // Return clean, standardized YouTube URL
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Get comprehensive YouTube URL information
 */
export function parseYouTubeUrl(url: string): YouTubeUrlInfo | null {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return null;
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}`;

  return {
    videoId,
    originalUrl: url,
    cleanUrl,
    thumbnailUrl,
    embedUrl
  };
}

/**
 * Get multiple thumbnail sizes for a YouTube video
 */
export function getYouTubeThumbnails(videoId: string) {
  const baseUrl = `https://img.youtube.com/vi/${videoId}`;
  
  return {
    maxres: `${baseUrl}/maxresdefault.jpg`, // 1280x720
    standard: `${baseUrl}/sddefault.jpg`,   // 640x480
    high: `${baseUrl}/hqdefault.jpg`,       // 480x360
    medium: `${baseUrl}/mqdefault.jpg`,     // 320x180
    default: `${baseUrl}/default.jpg`       // 120x90
  };
}

/**
 * Validate YouTube video ID format
 */
export function isValidVideoId(videoId: string): boolean {
  return (
    typeof videoId === 'string' &&
    videoId.length === 11 &&
    /^[a-zA-Z0-9_-]+$/.test(videoId)
  );
}

/**
 * Parse YouTube duration format (PT1H2M3S) to seconds
 */
export function parseYouTubeDuration(duration: string): number {
  if (!duration) return 0;
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds to YouTube duration format (PT1H2M3S)
 */
export function formatToYouTubeDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  let duration = 'PT';
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (seconds > 0) duration += `${seconds}S`;
  
  return duration === 'PT' ? 'PT0S' : duration;
}

/**
 * Format seconds to human readable time (MM:SS or H:MM:SS)
 */
export function formatDurationHuman(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Get YouTube oEmbed data as fallback for video metadata
 */
export async function getYouTubeOEmbedData(url: string): Promise<{
  title: string;
  author_name: string;
  author_url: string;
  type: string;
  height: number;
  width: number;
  version: string;
  provider_name: string;
  provider_url: string;
  thumbnail_height: number;
  thumbnail_width: number;
  thumbnail_url: string;
  html: string;
}> {
  try {
    const cleanUrl = cleanYouTubeUrl(url);
    if (!cleanUrl) {
      throw new Error('Invalid YouTube URL');
    }

    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
    const response = await fetch(oEmbedUrl);
    
    if (!response.ok) {
      throw new Error(`oEmbed API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('oEmbed fetch failed:', error);
    throw error;
  }
}

/**
 * Create fallback video metadata when APIs fail
 */
export function createFallbackVideoMetadata(url: string, title?: string): {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  publishedAt: string;
  channelTitle: string;
  viewCount: string;
  url: string;
  durationSeconds: number;
} {
  const urlInfo = parseYouTubeUrl(url);
  if (!urlInfo) {
    throw new Error('Invalid YouTube URL for fallback metadata');
  }

  return {
    id: urlInfo.videoId,
    title: title || 'YouTube Video',
    description: 'Video content for clip generation',
    thumbnail: urlInfo.thumbnailUrl,
    duration: 'PT5M30S', // Default 5.5 minutes
    publishedAt: new Date().toISOString(),
    channelTitle: 'YouTube Channel',
    viewCount: '0',
    url: urlInfo.cleanUrl,
    durationSeconds: 330
  };
}
