export interface WatermarkConfig {
  text: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity: number;
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  padding: number;
  margin: number;
}

export interface VideoProcessingOptions {
  applyWatermark: boolean;
  watermarkConfig?: WatermarkConfig;
  maxResolution: '720p' | '1080p' | '4k';
  quality: 'low' | 'medium' | 'high';
  format: 'mp4' | 'webm';
}

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  text: 'Creator Clip AI',
  position: 'bottom-right',
  opacity: 0.7,
  fontSize: 24,
  fontColor: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  padding: 8,
  margin: 20,
};

export class WatermarkService {
  private static instance: WatermarkService;

  static getInstance(): WatermarkService {
    if (!WatermarkService.instance) {
      WatermarkService.instance = new WatermarkService();
    }
    return WatermarkService.instance;
  }

  /**
   * Generate FFmpeg watermark filter string
   */
  public generateWatermarkFilter(config: WatermarkConfig = DEFAULT_WATERMARK_CONFIG): string {
    const { text, position, opacity, fontSize, fontColor, backgroundColor, padding, margin } = config;

    // Convert position to FFmpeg coordinates
    const positions = {
      'top-left': `x=${margin}:y=${margin}`,
      'top-right': `x=w-tw-${margin}:y=${margin}`,
      'bottom-left': `x=${margin}:y=h-th-${margin}`,
      'bottom-right': `x=w-tw-${margin}:y=h-th-${margin}`,
      'center': `x=(w-tw)/2:y=(h-th)/2`,
    };

    const coord = positions[position];
    
    // Build text filter with background box if specified
    let textFilter = `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:${coord}:alpha=${opacity}`;
    
    if (backgroundColor) {
      textFilter += `:box=1:boxcolor=${backgroundColor}:boxborderw=${padding}`;
    }

    return textFilter;
  }

  /**
   * Generate FFmpeg command for video processing with watermark
   */
  public generateFFmpegCommand(
    inputPath: string,
    outputPath: string,
    options: VideoProcessingOptions
  ): string[] {
    const { applyWatermark, watermarkConfig, maxResolution, quality, format } = options;

    const cmd = ['ffmpeg', '-i', inputPath];

    // Resolution scaling
    const resolutionFilters: string[] = [];
    switch (maxResolution) {
      case '720p':
        resolutionFilters.push('scale=1280:720:force_original_aspect_ratio=decrease');
        break;
      case '1080p':
        resolutionFilters.push('scale=1920:1080:force_original_aspect_ratio=decrease');
        break;
      case '4k':
        resolutionFilters.push('scale=3840:2160:force_original_aspect_ratio=decrease');
        break;
    }

    // Watermark filter
    const filters: string[] = [...resolutionFilters];
    if (applyWatermark && watermarkConfig) {
      filters.push(this.generateWatermarkFilter(watermarkConfig));
    }

    // Apply filters if any
    if (filters.length > 0) {
      cmd.push('-vf', filters.join(','));
    }

    // Quality settings
    const qualitySettings = this.getQualitySettings(quality, format);
    cmd.push(...qualitySettings);

    // Output format
    if (format === 'webm') {
      cmd.push('-c:v', 'libvpx-vp9', '-c:a', 'libopus');
    } else {
      cmd.push('-c:v', 'libx264', '-c:a', 'aac');
    }

    cmd.push('-y', outputPath);

    return cmd;
  }

  /**
   * Get quality settings for FFmpeg
   */
  private getQualitySettings(quality: 'low' | 'medium' | 'high', format: 'mp4' | 'webm'): string[] {
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

    return settings[format][quality] || settings[format].medium;
  }

  /**
   * Create custom watermark config for branding
   */
  public createCustomWatermark(
    brandText: string,
    options: Partial<WatermarkConfig> = {}
  ): WatermarkConfig {
    return {
      ...DEFAULT_WATERMARK_CONFIG,
      text: brandText,
      ...options,
    };
  }

  /**
   * Generate preview of watermark positioning (for UI)
   */
  public getWatermarkPreviewStyle(
    position: WatermarkConfig['position']
  ): React.CSSProperties {
    const margin = 20;
    const styles: Record<string, React.CSSProperties> = {
      'top-left': {
        position: 'absolute',
        top: margin,
        left: margin,
      },
      'top-right': {
        position: 'absolute',
        top: margin,
        right: margin,
      },
      'bottom-left': {
        position: 'absolute',
        bottom: margin,
        left: margin,
      },
      'bottom-right': {
        position: 'absolute',
        bottom: margin,
        right: margin,
      },
      'center': {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      },
    };

    return styles[position] || styles['bottom-right'];
  }

  /**
   * Validate watermark configuration
   */
  public validateWatermarkConfig(config: WatermarkConfig): string[] {
    const errors: string[] = [];

    if (!config.text || config.text.trim().length === 0) {
      errors.push('Watermark text cannot be empty');
    }

    if (config.text.length > 50) {
      errors.push('Watermark text must be 50 characters or less');
    }

    if (config.opacity < 0 || config.opacity > 1) {
      errors.push('Opacity must be between 0 and 1');
    }

    if (config.fontSize < 8 || config.fontSize > 72) {
      errors.push('Font size must be between 8 and 72');
    }

    if (config.margin < 0 || config.margin > 100) {
      errors.push('Margin must be between 0 and 100');
    }

    if (config.padding < 0 || config.padding > 50) {
      errors.push('Padding must be between 0 and 50');
    }

    return errors;
  }

  /**
   * Get resolution constraints based on plan
   */
  public getResolutionConstraints(maxResolution: '720p' | '1080p' | '4k'): {
    width: number;
    height: number;
    label: string;
  } {
    const constraints = {
      '720p': { width: 1280, height: 720, label: '720p HD' },
      '1080p': { width: 1920, height: 1080, label: '1080p Full HD' },
      '4k': { width: 3840, height: 2160, label: '4K Ultra HD' },
    };

    return constraints[maxResolution];
  }

  /**
   * Check if video resolution exceeds user's plan limit
   */
  public checkResolutionLimit(
    videoWidth: number,
    videoHeight: number,
    maxResolution: '720p' | '1080p' | '4k'
  ): {
    exceedsLimit: boolean;
    suggestedResolution?: string;
    reason?: string;
  } {
    const constraints = this.getResolutionConstraints(maxResolution);

    if (videoWidth > constraints.width || videoHeight > constraints.height) {
      return {
        exceedsLimit: true,
        suggestedResolution: constraints.label,
        reason: `Video resolution (${videoWidth}x${videoHeight}) exceeds your plan limit of ${constraints.label}. Video will be downscaled.`,
      };
    }

    return { exceedsLimit: false };
  }
}

export const watermarkService = WatermarkService.getInstance();
