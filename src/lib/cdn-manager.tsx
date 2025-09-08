import { logger } from './logger';

interface CDNConfig {
  enabled: boolean;
  baseUrl: string;
  fallbackUrl: string;
  cacheTtl: number;
  retryAttempts: number;
  retryDelay: number;
  preloadCriticalAssets: boolean;
  compression: boolean;
  imageOptimization: boolean;
}

interface AssetManifest {
  [key: string]: {
    originalPath: string;
    cdnPath: string;
    size: number;
    hash: string;
    mimeType: string;
    lastModified: string;
    cacheTtl: number;
  };
}

class CDNManager {
  public config: CDNConfig;
  private manifest: AssetManifest = {};
  private failedAssets: Set<string> = new Set();
  private preloadedAssets: Set<string> = new Set();

  constructor(config: Partial<CDNConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      baseUrl: config.baseUrl || import.meta.env.VITE_CDN_BASE_URL || '',
      fallbackUrl: config.fallbackUrl || window.location.origin,
      cacheTtl: config.cacheTtl || 86400, // 24 hours
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      preloadCriticalAssets: config.preloadCriticalAssets ?? true,
      compression: config.compression ?? true,
      imageOptimization: config.imageOptimization ?? true,
    };

    if (this.config.enabled && !this.config.baseUrl) {
      logger.warn('CDN enabled but no base URL configured, falling back to local assets', {
        component: 'cdn-manager',
      });
      this.config.enabled = false;
    }

    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('CDN disabled, using local assets', {
        component: 'cdn-manager',
      });
      return;
    }

    try {
      await this.loadAssetManifest();
      
      if (this.config.preloadCriticalAssets) {
        await this.preloadCriticalAssets();
      }

      this.setupCacheHeaders();
      
      logger.info('CDN manager initialized', {
        component: 'cdn-manager',
        baseUrl: this.config.baseUrl,
        assetsCount: Object.keys(this.manifest).length,
      });
    } catch (error) {
      logger.error('Failed to initialize CDN manager', error as Error, {
        component: 'cdn-manager',
      });
      this.config.enabled = false;
    }
  }

  private async loadAssetManifest(): Promise<void> {
    const manifestUrl = this.getAssetUrl('/assets/manifest.json');
    
    try {
      const response = await fetch(manifestUrl, {
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load manifest: ${response.status}`);
      }

      this.manifest = await response.json();
      
      logger.debug('Asset manifest loaded', {
        component: 'cdn-manager',
        assetsCount: Object.keys(this.manifest).length,
      });
    } catch (error) {
      logger.error('Failed to load asset manifest', error as Error, {
        component: 'cdn-manager',
        manifestUrl,
      });
      throw error;
    }
  }

  private async preloadCriticalAssets(): Promise<void> {
    const criticalAssets = Object.entries(this.manifest)
      .filter(([_, asset]) => 
        asset.originalPath.includes('critical') || 
        asset.originalPath.includes('above-fold') ||
        asset.mimeType.startsWith('font/') ||
        asset.originalPath.includes('logo')
      )
      .slice(0, 10); // Limit to 10 critical assets

    const preloadPromises = criticalAssets.map(async ([key, asset]) => {
      try {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = this.getAssetUrl(asset.cdnPath);
        
        if (asset.mimeType.startsWith('image/')) {
          link.as = 'image';
        } else if (asset.mimeType.startsWith('font/')) {
          link.as = 'font';
          link.crossOrigin = 'anonymous';
        } else if (asset.mimeType.includes('javascript')) {
          link.as = 'script';
        } else if (asset.mimeType.includes('css')) {
          link.as = 'style';
        }

        document.head.appendChild(link);
        this.preloadedAssets.add(key);
        
        logger.debug('Critical asset preloaded', {
          component: 'cdn-manager',
          asset: asset.originalPath,
          size: this.formatBytes(asset.size),
        });
      } catch (error) {
        logger.warn('Failed to preload critical asset', {
          component: 'cdn-manager',
          asset: asset.originalPath,
          error: (error as Error).message,
        });
      }
    });

    await Promise.allSettled(preloadPromises);
    
    logger.info('Critical assets preload completed', {
      component: 'cdn-manager',
      preloadedCount: this.preloadedAssets.size,
      totalCritical: criticalAssets.length,
    });
  }

  getAssetUrl(path: string): string {
    if (!this.config.enabled || this.failedAssets.has(path)) {
      return this.getFallbackUrl(path);
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const cdnUrl = `${this.config.baseUrl}${cleanPath}`;

    // Add optimization parameters for images
    if (this.config.imageOptimization && this.isImage(path)) {
      const url = new URL(cdnUrl);
      url.searchParams.set('format', 'webp');
      url.searchParams.set('quality', '85');
      return url.toString();
    }

    return cdnUrl;
  }

  getFallbackUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.config.fallbackUrl}${cleanPath}`;
  }

  async loadAssetWithFallback(path: string): Promise<string> {
    if (!this.config.enabled) {
      return this.getFallbackUrl(path);
    }

    const cdnUrl = this.getAssetUrl(path);
    
    try {
      const response = await this.fetchWithRetry(cdnUrl);
      
      if (response.ok) {
        logger.debug('Asset loaded from CDN', {
          component: 'cdn-manager',
          path,
          cdnUrl,
          status: response.status,
        });
        return cdnUrl;
      }
      
      throw new Error(`CDN response not ok: ${response.status}`);
    } catch (error) {
      logger.warn('CDN asset failed, using fallback', {
        component: 'cdn-manager',
        path,
        error: (error as Error).message,
      });
      
      this.failedAssets.add(path);
      return this.getFallbackUrl(path);
    }
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'HEAD', // Just check if asset exists
          cache: 'default',
        });
        return response;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isImage(path: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    return imageExtensions.some(ext => path.toLowerCase().endsWith(ext));
  }

  private isVideo(path: string): boolean {
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov'];
    return videoExtensions.some(ext => path.toLowerCase().endsWith(ext));
  }

  private setupCacheHeaders(): void {
    // Intercept fetch requests to add cache headers for CDN assets
    const originalFetch = window.fetch;
    
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      
      if (url.startsWith(this.config.baseUrl)) {
        const headers = new Headers(init?.headers);
        
        if (this.isImage(url) || this.isVideo(url)) {
          headers.set('Cache-Control', `public, max-age=${this.config.cacheTtl}`);
        } else {
          headers.set('Cache-Control', 'public, max-age=31536000'); // 1 year for other assets
        }
        
        init = { ...init, headers };
      }
      
      return originalFetch(input, init);
    };
  }

  // Video-specific CDN methods
  getVideoUrl(videoId: string, quality: '720p' | '1080p' | '4k' = '720p'): string {
    const path = `/videos/${videoId}/${quality}.mp4`;
    return this.getAssetUrl(path);
  }

  getThumbnailUrl(videoId: string, timestamp: number = 0): string {
    const path = `/thumbnails/${videoId}/${timestamp}.webp`;
    return this.getAssetUrl(path);
  }

  getPreviewUrl(videoId: string): string {
    const path = `/previews/${videoId}/preview.gif`;
    return this.getAssetUrl(path);
  }

  // Progressive image loading
  async loadImageProgressive(src: string, placeholder?: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      if (placeholder) {
        img.src = placeholder;
      }

      const highQualityUrl = this.getAssetUrl(src);
      
      img.onload = () => {
        logger.debug('Progressive image loaded', {
          component: 'cdn-manager',
          src: highQualityUrl,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
        resolve(img);
      };
      
      img.onerror = () => {
        const fallbackUrl = this.getFallbackUrl(src);
        img.src = fallbackUrl;
        
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      };
      
      img.src = highQualityUrl;
    });
  }

  // Bulk asset preloading
  async preloadAssets(paths: string[]): Promise<void> {
    const preloadPromises = paths.map(async (path) => {
      try {
        const url = this.getAssetUrl(path);
        await fetch(url, { method: 'HEAD' });
        
        logger.debug('Asset preloaded', {
          component: 'cdn-manager',
          path,
          url,
        });
      } catch (error) {
        logger.warn('Failed to preload asset', {
          component: 'cdn-manager',
          path,
          error: (error as Error).message,
        });
      }
    });

    await Promise.allSettled(preloadPromises);
  }

  // Cache management
  async invalidateCache(paths: string[]): Promise<void> {
    if (!this.config.enabled) return;

    const invalidationPromises = paths.map(async (path) => {
      try {
        const url = this.getAssetUrl(path);
        
        // Try to force cache invalidation
        await fetch(`${url}?cache-bust=${Date.now()}`, {
          method: 'HEAD',
          cache: 'reload',
        });
        
        this.failedAssets.delete(path);
        
        logger.debug('Cache invalidated for asset', {
          component: 'cdn-manager',
          path,
          url,
        });
      } catch (error) {
        logger.warn('Failed to invalidate cache for asset', {
          component: 'cdn-manager',
          path,
          error: (error as Error).message,
        });
      }
    });

    await Promise.allSettled(invalidationPromises);
  }

  // Performance monitoring
  getPerformanceStats() {
    return {
      failedAssetsCount: this.failedAssets.size,
      preloadedAssetsCount: this.preloadedAssets.size,
      manifestSize: Object.keys(this.manifest).length,
      cdnEnabled: this.config.enabled,
      failedAssets: Array.from(this.failedAssets),
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Global CDN manager instance
export const cdnManager = new CDNManager({
  enabled: import.meta.env.VITE_CDN_ENABLED === 'true',
  baseUrl: import.meta.env.VITE_CDN_BASE_URL,
  cacheTtl: parseInt(import.meta.env.VITE_CDN_CACHE_TTL || '86400'),
  retryAttempts: parseInt(import.meta.env.VITE_CDN_RETRY_ATTEMPTS || '3'),
  preloadCriticalAssets: import.meta.env.VITE_CDN_PRELOAD_CRITICAL === 'true',
  compression: import.meta.env.VITE_CDN_COMPRESSION === 'true',
  imageOptimization: import.meta.env.VITE_CDN_IMAGE_OPTIMIZATION === 'true',
});

// React hook for CDN asset management
import { useState, useEffect, useCallback } from 'react';

export const useCDNAsset = (path: string, preload: boolean = false) => {
  const [assetUrl, setAssetUrl] = useState<string>(cdnManager.getFallbackUrl(path));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadAsset = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = await cdnManager.loadAssetWithFallback(path);
        
        if (mounted) {
          setAssetUrl(url);
        }
      } catch (err) {
        if (mounted) {
          setError((err as Error).message);
          setAssetUrl(cdnManager.getFallbackUrl(path));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (preload) {
      loadAsset();
    } else {
      // Lazy load - just return the URL immediately
      setAssetUrl(cdnManager.getAssetUrl(path));
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [path, preload]);

  const refresh = useCallback(async () => {
    await cdnManager.invalidateCache([path]);
    const url = await cdnManager.loadAssetWithFallback(path);
    setAssetUrl(url);
  }, [path]);

  return { assetUrl, loading, error, refresh };
};

// Image component with CDN support
import React from 'react';

interface CDNImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackSrc?: string;
  placeholder?: string;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  width?: number;
  height?: number;
  progressive?: boolean;
}

export const CDNImage: React.FC<CDNImageProps> = ({
  src,
  fallbackSrc,
  placeholder,
  quality = 85,
  format = 'webp',
  width,
  height,
  progressive = true,
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState(placeholder || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadImage = async () => {
      setLoading(true);
      setError(false);

      try {
        let imageUrl = cdnManager.getAssetUrl(src);

        // Add optimization parameters
        if (cdnManager.config.imageOptimization) {
          const url = new URL(imageUrl);
          url.searchParams.set('format', format);
          url.searchParams.set('quality', quality.toString());
          
          if (width) url.searchParams.set('width', width.toString());
          if (height) url.searchParams.set('height', height.toString());
          
          imageUrl = url.toString();
        }

        const img = new Image();
        
        img.onload = () => {
          if (mounted) {
            setCurrentSrc(imageUrl);
            setLoading(false);
          }
        };
        
        img.onerror = () => {
          if (mounted) {
            const fallback = fallbackSrc || cdnManager.getFallbackUrl(src);
            setCurrentSrc(fallback);
            setError(true);
            setLoading(false);
            
            logger.warn('CDN image failed, using fallback', {
              component: 'cdn-manager',
              originalSrc: src,
              fallbackSrc: fallback,
            });
          }
        };
        
        img.src = imageUrl;
      } catch (err) {
        if (mounted) {
          const fallback = fallbackSrc || cdnManager.getFallbackUrl(src);
          setCurrentSrc(fallback);
          setError(true);
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
    };
  }, [src, fallbackSrc, quality, format, width, height]);

  return (
    <img 
      src={currentSrc} 
      {...props}
      alt=""
      loading={progressive ? 'lazy' : 'eager'}
      style={{
        opacity: loading ? 0.7 : 1,
        transition: 'opacity 0.3s ease',
        ...props.style,
      }}
      onError={() => {
        if (!error) {
          const fallback = fallbackSrc || cdnManager.getFallbackUrl(src);
          setCurrentSrc(fallback);
          setError(true);
        }
      }}
    />
  );
};

// Video component with CDN support
interface CDNVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  quality?: '720p' | '1080p' | '4k';
  thumbnail?: string;
  preload?: 'none' | 'metadata' | 'auto';
}

export const CDNVideo: React.FC<CDNVideoProps> = ({
  src,
  quality = '720p',
  thumbnail,
  preload = 'metadata',
  ...props
}) => {
  const [videoSrc, setVideoSrc] = useState('');
  const [posterSrc, setPosterSrc] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    const videoUrl = cdnManager.getVideoUrl(src, quality);
    setVideoSrc(videoUrl);

    if (thumbnail) {
      const thumbnailUrl = cdnManager.getThumbnailUrl(src);
      setPosterSrc(thumbnailUrl);
    }
  }, [src, quality, thumbnail]);

  const handleError = useCallback(() => {
    if (!error) {
      const fallbackUrl = cdnManager.getFallbackUrl(`/videos/${src}/${quality}.mp4`);
      setVideoSrc(fallbackUrl);
      setError(true);
      
      logger.warn('CDN video failed, using fallback', {
        component: 'cdn-manager',
        videoId: src,
        quality,
        fallbackUrl,
      });
    }
  }, [src, quality, error]);

  return (
    <video
      {...props}
      src={videoSrc}
      poster={posterSrc}
      preload={preload}
      onError={handleError}
    />
  );
};

// Utility functions
export const CDNUtils = {
  preloadVideo: async (videoId: string, quality: '720p' | '1080p' | '4k' = '720p') => {
    const url = cdnManager.getVideoUrl(videoId, quality);
    
    try {
      await fetch(url, { method: 'HEAD' });
      logger.debug('Video preloaded', {
        component: 'cdn-manager',
        videoId,
        quality,
        url,
      });
    } catch (error) {
      logger.warn('Failed to preload video', {
        component: 'cdn-manager',
        videoId,
        quality,
        error: (error as Error).message,
      });
    }
  },

  getOptimizedImageUrl: (
    src: string,
    options: {
      width?: number;
      height?: number;
      quality?: number;
      format?: 'webp' | 'jpeg' | 'png';
    } = {}
  ) => {
    let url = cdnManager.getAssetUrl(src);
    
    if (cdnManager.config.imageOptimization) {
      const urlObj = new URL(url);
      
      if (options.width) urlObj.searchParams.set('width', options.width.toString());
      if (options.height) urlObj.searchParams.set('height', options.height.toString());
      if (options.quality) urlObj.searchParams.set('quality', options.quality.toString());
      if (options.format) urlObj.searchParams.set('format', options.format);
      
      url = urlObj.toString();
    }
    
    return url;
  },

  getStats: () => cdnManager.getPerformanceStats(),
  
  invalidateAssets: (paths: string[]) => cdnManager.invalidateCache(paths),
};

export default cdnManager;
