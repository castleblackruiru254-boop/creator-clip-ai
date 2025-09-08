import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// CDN configuration
export const CDN_CONFIG = {
  // Supabase storage URL pattern
  storageUrl: process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public',
  
  // CDN settings
  maxAge: 7 * 24 * 60 * 60, // 7 days cache
  staleWhileRevalidate: 24 * 60 * 60, // 24 hours stale while revalidate
  
  // Video quality presets
  presets: {
    thumbnail: {
      width: 320,
      height: 180,
      quality: 80,
    },
    preview: {
      width: 640,
      height: 360,
      quality: 85,
    },
    mobile: {
      width: 854,
      height: 480,
      quality: 90,
    },
    hd: {
      width: 1920,
      height: 1080,
      quality: 95,
    },
  },
};

/**
 * Generates CDN URLs for video assets
 */
export class VideoCDNService {
  /**
   * Gets public URL for a video file
   */
  static getVideoUrl(bucketName: string, filePath: string, options?: {
    transform?: 'thumbnail' | 'preview' | 'mobile' | 'hd';
    cacheBuster?: boolean;
  }): string {
    const baseUrl = `${CDN_CONFIG.storageUrl}/${bucketName}/${filePath}`;
    
    const params = new URLSearchParams();
    
    // Add transformation parameters if specified
    if (options?.transform) {
      const preset = CDN_CONFIG.presets[options.transform];
      params.append('width', preset.width.toString());
      params.append('height', preset.height.toString());
      params.append('quality', preset.quality.toString());
      params.append('format', 'webp'); // Use WebP for better compression
    }
    
    // Add cache buster if requested
    if (options?.cacheBuster) {
      params.append('t', Date.now().toString());
    }
    
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }
  
  /**
   * Gets video thumbnail URL
   */
  static getThumbnailUrl(bucketName: string, filePath: string, options?: {
    timestamp?: number; // Seconds into video for thumbnail
    cacheBuster?: boolean;
  }): string {
    const params = new URLSearchParams();
    
    // Add thumbnail transformation
    const preset = CDN_CONFIG.presets.thumbnail;
    params.append('width', preset.width.toString());
    params.append('height', preset.height.toString());
    params.append('quality', preset.quality.toString());
    params.append('format', 'webp');
    
    // Add timestamp for video thumbnail
    if (options?.timestamp) {
      params.append('t', options.timestamp.toString());
    }
    
    // Add cache buster if requested
    if (options?.cacheBuster) {
      params.append('cb', Date.now().toString());
    }
    
    const baseUrl = `${CDN_CONFIG.storageUrl}/${bucketName}/${filePath}`;
    return `${baseUrl}?${params.toString()}`;
  }
  
  /**
   * Gets adaptive streaming URLs for different quality levels
   */
  static getStreamingUrls(bucketName: string, filePath: string): {
    qualities: Array<{
      label: string;
      url: string;
      width: number;
      height: number;
      bitrate: number;
    }>;
    defaultQuality: string;
  } {
    
    const qualities = [
      {
        label: '1080p',
        url: this.getVideoUrl(bucketName, filePath, { transform: 'hd' }),
        width: 1920,
        height: 1080,
        bitrate: 5000,
      },
      {
        label: '480p',
        url: this.getVideoUrl(bucketName, filePath, { transform: 'mobile' }),
        width: 854,
        height: 480,
        bitrate: 2000,
      },
      {
        label: '360p',
        url: this.getVideoUrl(bucketName, filePath, { transform: 'preview' }),
        width: 640,
        height: 360,
        bitrate: 1000,
      },
    ];
    
    return {
      qualities,
      defaultQuality: '480p',
    };
  }
  
  /**
   * Uploads video file to storage with proper content type and caching
   */
  static async uploadVideo(
    bucketName: string,
    filePath: string,
    file: File | Buffer,
    options?: {
      contentType?: string;
      cacheControl?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const uploadOptions: any = {
        contentType: options?.contentType || 'video/mp4',
        cacheControl: options?.cacheControl || `max-age=${CDN_CONFIG.maxAge}`,
      };
      
      // Add metadata if provided
      if (options?.metadata) {
        uploadOptions.metadata = options.metadata;
      }
      
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, uploadOptions);
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      const url = this.getVideoUrl(bucketName, filePath);
      return { success: true, url };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      };
    }
  }
  
  /**
   * Uploads thumbnail image
   */
  static async uploadThumbnail(
    bucketName: string,
    filePath: string,
    imageBuffer: Buffer,
    options?: {
      metadata?: Record<string, any>;
    }
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, imageBuffer, {
          contentType: 'image/webp',
          cacheControl: `max-age=${CDN_CONFIG.maxAge}`,
          metadata: options?.metadata,
        });
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      const url = this.getThumbnailUrl(bucketName, filePath);
      return { success: true, url };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Thumbnail upload failed' 
      };
    }
  }
  
  /**
   * Deletes video and related files from storage
   */
  static async deleteVideo(bucketName: string, filePaths: string[]): Promise<{
    success: boolean;
    deletedFiles: string[];
    errors: string[];
  }> {
    const deletedFiles: string[] = [];
    const errors: string[] = [];
    
    for (const filePath of filePaths) {
      try {
        const { error } = await supabase.storage
          .from(bucketName)
          .remove([filePath]);
        
        if (error) {
          errors.push(`Failed to delete ${filePath}: ${error.message}`);
        } else {
          deletedFiles.push(filePath);
        }
      } catch (error) {
        errors.push(`Failed to delete ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return {
      success: errors.length === 0,
      deletedFiles,
      errors,
    };
  }
  
  /**
   * Gets video file info from storage
   */
  static async getVideoInfo(bucketName: string, filePath: string): Promise<{
    exists: boolean;
    size?: number;
    lastModified?: Date;
    contentType?: string;
    metadata?: Record<string, any>;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .list(filePath.split('/').slice(0, -1).join('/'), {
          search: filePath.split('/').pop()
        });
      
      if (error) {
        return { exists: false, error: error.message };
      }
      
      const file = data?.find(f => f.name === filePath.split('/').pop());
      
      if (!file) {
        return { exists: false };
      }
      
      return {
        exists: true,
        size: file.metadata?.size,
        lastModified: file.updated_at ? new Date(file.updated_at) : undefined,
        contentType: file.metadata?.mimetype,
        metadata: file.metadata,
      };
    } catch (error) {
      return { 
        exists: false, 
        error: error instanceof Error ? error.message : 'Failed to get file info' 
      };
    }
  }
  
  /**
   * Generates presigned URLs for secure video access
   */
  static async getPresignedUrl(
    bucketName: string, 
    filePath: string, 
    expiresIn: number = 3600 // 1 hour default
  ): Promise<{ url?: string; error?: string }> {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, expiresIn);
      
      if (error) {
        return { error: error.message };
      }
      
      return { url: data.signedUrl };
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : 'Failed to generate signed URL' 
      };
    }
  }
  
  /**
   * Lists all videos for a user with pagination
   */
  static async listUserVideos(
    bucketName: string,
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      sortBy?: 'name' | 'created_at' | 'updated_at';
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    files: Array<{
      name: string;
      path: string;
      size: number;
      url: string;
      thumbnailUrl: string;
      lastModified: Date;
    }>;
    total: number;
    hasMore: boolean;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .list(`users/${userId}`, {
          limit: options?.limit || 50,
          offset: options?.offset || 0,
          sortBy: { column: options?.sortBy || 'created_at', order: options?.sortOrder || 'desc' }
        });
      
      if (error) {
        return { files: [], total: 0, hasMore: false, error: error.message };
      }
      
      const files = data.map(file => ({
        name: file.name,
        path: `users/${userId}/${file.name}`,
        size: file.metadata?.size || 0,
        url: this.getVideoUrl(bucketName, `users/${userId}/${file.name}`),
        thumbnailUrl: this.getThumbnailUrl(bucketName, `users/${userId}/${file.name}`),
        lastModified: file.updated_at ? new Date(file.updated_at) : new Date(),
      }));
      
      return {
        files,
        total: files.length,
        hasMore: files.length === (options?.limit || 50),
      };
    } catch (error) {
      return { 
        files: [], 
        total: 0, 
        hasMore: false,
        error: error instanceof Error ? error.message : 'Failed to list videos' 
      };
    }
  }
  
  /**
   * Optimizes video delivery based on user agent and connection
   */
  static getOptimalDeliveryUrl(
    bucketName: string,
    filePath: string,
    options?: {
      userAgent?: string;
      connectionType?: 'slow-2g' | '2g' | '3g' | '4g' | '5g';
      deviceType?: 'mobile' | 'tablet' | 'desktop';
    }
  ): string {
    // Default to original quality
    let transform: 'thumbnail' | 'preview' | 'mobile' | 'hd' | undefined;
    
    // Adjust quality based on connection type
    if (options?.connectionType) {
      switch (options.connectionType) {
        case 'slow-2g':
        case '2g':
          transform = 'thumbnail';
          break;
        case '3g':
          transform = 'preview';
          break;
        case '4g':
          transform = 'mobile';
          break;
        case '5g':
          transform = 'hd';
          break;
      }
    }
    
    // Adjust quality based on device type
    if (options?.deviceType === 'mobile' && !transform) {
      transform = 'mobile';
    }
    
    return this.getVideoUrl(bucketName, filePath, { transform });
  }
  
  /**
   * Generates video embed code for external use
   */
  static generateEmbedCode(
    videoUrl: string,
    options?: {
      width?: number;
      height?: number;
      autoplay?: boolean;
      loop?: boolean;
      muted?: boolean;
      controls?: boolean;
    }
  ): string {
    const {
      width = 640,
      height = 360,
      autoplay = false,
      loop = false,
      muted = true, // Default muted for autoplay compliance
      controls = true,
    } = options || {};
    
    const attributes = [
      `width="${width}"`,
      `height="${height}"`,
      `src="${videoUrl}"`,
      controls ? 'controls' : '',
      autoplay ? 'autoplay' : '',
      loop ? 'loop' : '',
      muted ? 'muted' : '',
      'preload="metadata"',
      'playsinline', // For iOS
    ].filter(Boolean);
    
    return `<video ${attributes.join(' ')}>\n  Your browser does not support the video tag.\n</video>`;
  }
  
  /**
   * Gets video analytics data
   */
  static async getVideoAnalytics(): Promise<{
    views: number;
    bandwidth: number;
    requests: number;
    cacheHitRatio: number;
    topCountries: Array<{ country: string; requests: number }>;
    error?: string;
  }> {
    // Note: This is a placeholder for actual CDN analytics
    // In a real implementation, you'd integrate with your CDN provider's analytics API
    
    try {
      // Mock analytics data for now
      return {
        views: Math.floor(Math.random() * 1000),
        bandwidth: Math.floor(Math.random() * 1024 * 1024 * 1024), // GB
        requests: Math.floor(Math.random() * 500),
        cacheHitRatio: 0.85 + Math.random() * 0.1, // 85-95%
        topCountries: [
          { country: 'US', requests: Math.floor(Math.random() * 200) },
          { country: 'UK', requests: Math.floor(Math.random() * 100) },
          { country: 'CA', requests: Math.floor(Math.random() * 80) },
        ],
      };
    } catch (error) {
      return {
        views: 0,
        bandwidth: 0,
        requests: 0,
        cacheHitRatio: 0,
        topCountries: [],
        error: error instanceof Error ? error.message : 'Analytics unavailable',
      };
    }
  }
  
  /**
   * Prefetches video content for faster loading
   */
  static prefetchVideo(url: string): void {
    if (typeof window === 'undefined') return;
    
    // Create a link element for prefetching
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
    
    // Remove the link after a delay to clean up DOM
    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    }, 5000);
  }
  
  /**
   * Validates video accessibility from CDN
   */
  static async validateVideoAccess(url: string): Promise<{
    accessible: boolean;
    responseTime: number;
    fileSize?: number;
    contentType?: string;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        cache: 'no-cache' 
      });
      
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        return {
          accessible: false,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
      
      return {
        accessible: true,
        responseTime,
        fileSize: response.headers.get('content-length') 
          ? parseInt(response.headers.get('content-length')!) 
          : undefined,
        contentType: response.headers.get('content-type') || undefined,
      };
    } catch (error) {
      return {
        accessible: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }
  
  /**
   * Gets optimal video format for delivery based on browser support
   */
  static getOptimalFormat(userAgent?: string): {
    container: string;
    videoCodec: string;
    audioCodec: string;
    supportsHEVC: boolean;
    supportsAV1: boolean;
    supportsWebM: boolean;
  } {
    // Default fallback format
    let format = {
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      supportsHEVC: false,
      supportsAV1: false,
      supportsWebM: false,
    };
    
    if (!userAgent) return format;
    
    const ua = userAgent.toLowerCase();
    
    // Check for modern codec support
    if (ua.includes('chrome') && !ua.includes('edge')) {
      // Chrome supports WebM, AV1
      format.supportsWebM = true;
      format.supportsAV1 = true;
      format.container = 'webm';
      format.videoCodec = 'av1';
      format.audioCodec = 'opus';
    } else if (ua.includes('firefox')) {
      // Firefox supports WebM
      format.supportsWebM = true;
      format.container = 'webm';
      format.videoCodec = 'vp9';
      format.audioCodec = 'opus';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      // Safari supports HEVC on newer versions
      format.supportsHEVC = true;
      format.videoCodec = 'h265';
    }
    
    return format;
  }
}

/**
 * Video streaming utilities
 */
export class VideoStreamingService {
  /**
   * Creates video player configuration with adaptive streaming
   */
  static createPlayerConfig(videoUrl: string, options?: {
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    poster?: string;
    qualities?: Array<{ label: string; url: string }>;
  }): any {
    const config = {
      src: videoUrl,
      poster: options?.poster,
      autoplay: options?.autoplay || false,
      loop: options?.loop || false,
      muted: options?.muted || true,
      controls: true,
      preload: 'metadata',
      playsinline: true,
    };
    
    // Add quality selection if multiple qualities available
    if (options?.qualities && options.qualities.length > 1) {
      return {
        ...config,
        sources: options.qualities.map(quality => ({
          src: quality.url,
          label: quality.label,
          type: 'video/mp4',
        })),
      };
    }
    
    return config;
  }
  
  /**
   * Optimizes video loading based on viewport and connection
   */
  static getLoadingStrategy(options?: {
    isInViewport?: boolean;
    connectionSpeed?: string;
    deviceMemory?: number;
  }): {
    preload: 'none' | 'metadata' | 'auto';
    quality: 'thumbnail' | 'preview' | 'mobile' | 'hd';
    shouldDefer: boolean;
  } {
    const {
      isInViewport = false,
      connectionSpeed = 'unknown',
      deviceMemory = 4,
    } = options || {};
    
    // Aggressive loading for good conditions
    if (isInViewport && connectionSpeed === '4g' && deviceMemory >= 4) {
      return {
        preload: 'metadata',
        quality: 'hd',
        shouldDefer: false,
      };
    }
    
    // Conservative loading for poor conditions
    if (!isInViewport || connectionSpeed === '2g' || deviceMemory < 2) {
      return {
        preload: 'none',
        quality: 'preview',
        shouldDefer: true,
      };
    }
    
    // Default strategy
    return {
      preload: 'metadata',
      quality: 'mobile',
      shouldDefer: false,
    };
  }
}

/**
 * Storage bucket management utilities
 */
export class StorageBucketService {
  /**
   * Creates storage bucket with optimal settings for video content
   */
  static async createBucket(bucketName: string, options?: {
    public?: boolean;
    allowedMimeTypes?: string[];
    fileSizeLimit?: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.storage.createBucket(bucketName, {
        public: options?.public ?? true,
        allowedMimeTypes: options?.allowedMimeTypes || [
          'video/mp4',
          'video/avi', 
          'video/quicktime',
          'video/x-msvideo',
          'video/webm',
          'video/x-flv',
        ],
        fileSizeLimit: options?.fileSizeLimit || CDN_CONFIG.maxAge,
      });
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create bucket' 
      };
    }
  }
  
  /**
   * Gets bucket usage statistics
   */
  static async getBucketStats(): Promise<{
    fileCount: number;
    totalSize: number;
    averageFileSize: number;
    oldestFile: Date;
    newestFile: Date;
    error?: string;
  }> {
    try {
      // This would require custom implementation with actual storage analytics
      // For now, return mock data
      return {
        fileCount: 0,
        totalSize: 0,
        averageFileSize: 0,
        oldestFile: new Date(),
        newestFile: new Date(),
      };
    } catch (error) {
      return {
        fileCount: 0,
        totalSize: 0,
        averageFileSize: 0,
        oldestFile: new Date(),
        newestFile: new Date(),
        error: error instanceof Error ? error.message : 'Failed to get bucket stats',
      };
    }
  }
}
