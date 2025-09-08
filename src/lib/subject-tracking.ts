export interface FaceDetection {
  id: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  landmarks?: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
    mouth: { x: number; y: number };
  };
  timestamp: number;
}

export interface TrackingRegion {
  startTime: number;
  endTime: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  confidence: number;
}

export interface CropParameters {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface SubjectTrackingOptions {
  faceDetectionEnabled: boolean;
  objectTrackingEnabled: boolean;
  speakerCenteringEnabled: boolean;
  minFaceSize: number;
  confidenceThreshold: number;
  trackingSmoothing: number;
  cropAspectRatio: number; // 9:16 for vertical, 16:9 for horizontal
}

export const DEFAULT_TRACKING_OPTIONS: SubjectTrackingOptions = {
  faceDetectionEnabled: true,
  objectTrackingEnabled: false,
  speakerCenteringEnabled: true,
  minFaceSize: 50,
  confidenceThreshold: 0.7,
  trackingSmoothing: 0.8,
  cropAspectRatio: 9/16, // Default to vertical for social media
};

export class SubjectTrackingService {
  private static instance: SubjectTrackingService;
  private mediaPipeInitialized = false;

  static getInstance(): SubjectTrackingService {
    if (!SubjectTrackingService.instance) {
      SubjectTrackingService.instance = new SubjectTrackingService();
    }
    return SubjectTrackingService.instance;
  }

  /**
   * Initialize MediaPipe face detection model
   */
  public async initializeMediaPipe(): Promise<void> {
    if (this.mediaPipeInitialized) return;

    try {
      // Note: This is a placeholder for MediaPipe initialization
      // In a real implementation, you would load MediaPipe models here
      console.log('Initializing MediaPipe for face detection...');
      
      // Simulate model loading
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.mediaPipeInitialized = true;
      console.log('MediaPipe initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MediaPipe:', error);
      throw new Error('Face detection initialization failed');
    }
  }

  /**
   * Process video frame for face detection
   */
  public async detectFacesInFrame(
    imageData: ImageData,
    frameTimestamp: number,
    options: SubjectTrackingOptions = DEFAULT_TRACKING_OPTIONS
  ): Promise<FaceDetection[]> {
    if (!this.mediaPipeInitialized) {
      await this.initializeMediaPipe();
    }

    try {
      // Placeholder for MediaPipe face detection
      // In a real implementation, this would use MediaPipe's FaceDetection API
      
      // Simulate face detection result
      const mockDetections: FaceDetection[] = [
        {
          id: `face_${frameTimestamp}`,
          confidence: 0.85,
          boundingBox: {
            x: imageData.width * 0.3,
            y: imageData.height * 0.2,
            width: imageData.width * 0.4,
            height: imageData.height * 0.5,
          },
          landmarks: {
            leftEye: { x: imageData.width * 0.4, y: imageData.height * 0.35 },
            rightEye: { x: imageData.width * 0.6, y: imageData.height * 0.35 },
            nose: { x: imageData.width * 0.5, y: imageData.height * 0.45 },
            mouth: { x: imageData.width * 0.5, y: imageData.height * 0.55 },
          },
          timestamp: frameTimestamp,
        }
      ];

      // Filter by confidence threshold
      return mockDetections.filter(detection => 
        detection.confidence >= options.confidenceThreshold &&
        detection.boundingBox.width >= options.minFaceSize &&
        detection.boundingBox.height >= options.minFaceSize
      );

    } catch (error) {
      console.error('Face detection failed:', error);
      return [];
    }
  }

  /**
   * Track subject across video frames
   */
  public async trackSubjectInVideo(
    videoPath: string
  ): Promise<TrackingRegion[]> {
    try {
      console.log('Starting subject tracking for video:', videoPath);

      // In a real implementation, this would:
      // 1. Extract frames from video using FFmpeg
      // 2. Process each frame with MediaPipe
      // 3. Track faces/objects across frames
      // 4. Apply smoothing to reduce jitter
      // 5. Return tracking regions for cropping

      // Placeholder implementation
      const trackingRegions: TrackingRegion[] = [
        {
          startTime: 0,
          endTime: 30,
          centerX: 0.5,
          centerY: 0.4,
          width: 0.6,
          height: 0.8,
          confidence: 0.85,
        }
      ];

      return trackingRegions;

    } catch (error) {
      console.error('Subject tracking failed:', error);
      throw new Error('Failed to track subject in video');
    }
  }

  /**
   * Calculate optimal crop parameters for speaker centering
   */
  public calculateSpeakerCrop(
    trackingRegions: TrackingRegion[],
    videoWidth: number,
    videoHeight: number,
    targetAspectRatio: number = 9/16
  ): CropParameters[] {
    const cropParams: CropParameters[] = [];

    for (const region of trackingRegions) {
      const centerX = region.centerX * videoWidth;
      const centerY = region.centerY * videoHeight;

      // Calculate crop dimensions based on target aspect ratio
      let cropWidth: number;
      let cropHeight: number;

      if (targetAspectRatio < (videoWidth / videoHeight)) {
        // Target is more vertical than source
        cropHeight = videoHeight;
        cropWidth = videoHeight * targetAspectRatio;
      } else {
        // Target is more horizontal than source
        cropWidth = videoWidth;
        cropHeight = videoWidth / targetAspectRatio;
      }

      // Ensure crop doesn't exceed video bounds
      cropWidth = Math.min(cropWidth, videoWidth);
      cropHeight = Math.min(cropHeight, videoHeight);

      // Center the crop around the subject
      let cropX = centerX - (cropWidth / 2);
      let cropY = centerY - (cropHeight / 2);

      // Clamp to video bounds
      cropX = Math.max(0, Math.min(cropX, videoWidth - cropWidth));
      cropY = Math.max(0, Math.min(cropY, videoHeight - cropHeight));

      cropParams.push({
        x: Math.round(cropX),
        y: Math.round(cropY),
        width: Math.round(cropWidth),
        height: Math.round(cropHeight),
        aspectRatio: targetAspectRatio,
      });
    }

    return cropParams;
  }

  /**
   * Generate FFmpeg crop filter for speaker centering
   */
  public generateCropFilter(cropParams: CropParameters): string {
    return `crop=${cropParams.width}:${cropParams.height}:${cropParams.x}:${cropParams.y}`;
  }

  /**
   * Smooth tracking data to reduce jitter
   */
  public smoothTrackingData(
    detections: FaceDetection[],
    smoothingFactor: number = 0.8
  ): FaceDetection[] {
    if (detections.length < 2) return detections;

    const smoothed = [detections[0]]; // Keep first detection as-is

    for (let i = 1; i < detections.length; i++) {
      const current = detections[i];
      const previous = smoothed[i - 1];

      // Apply exponential smoothing to bounding box
      const smoothedDetection: FaceDetection = {
        ...current,
        boundingBox: {
          x: previous.boundingBox.x * smoothingFactor + current.boundingBox.x * (1 - smoothingFactor),
          y: previous.boundingBox.y * smoothingFactor + current.boundingBox.y * (1 - smoothingFactor),
          width: previous.boundingBox.width * smoothingFactor + current.boundingBox.width * (1 - smoothingFactor),
          height: previous.boundingBox.height * smoothingFactor + current.boundingBox.height * (1 - smoothingFactor),
        },
      };

      // Smooth landmarks if available
      if (current.landmarks && previous.landmarks) {
        smoothedDetection.landmarks = {
          leftEye: {
            x: previous.landmarks.leftEye.x * smoothingFactor + current.landmarks.leftEye.x * (1 - smoothingFactor),
            y: previous.landmarks.leftEye.y * smoothingFactor + current.landmarks.leftEye.y * (1 - smoothingFactor),
          },
          rightEye: {
            x: previous.landmarks.rightEye.x * smoothingFactor + current.landmarks.rightEye.x * (1 - smoothingFactor),
            y: previous.landmarks.rightEye.y * smoothingFactor + current.landmarks.rightEye.y * (1 - smoothingFactor),
          },
          nose: {
            x: previous.landmarks.nose.x * smoothingFactor + current.landmarks.nose.x * (1 - smoothingFactor),
            y: previous.landmarks.nose.y * smoothingFactor + current.landmarks.nose.y * (1 - smoothingFactor),
          },
          mouth: {
            x: previous.landmarks.mouth.x * smoothingFactor + current.landmarks.mouth.x * (1 - smoothingFactor),
            y: previous.landmarks.mouth.y * smoothingFactor + current.landmarks.mouth.y * (1 - smoothingFactor),
          },
        };
      }

      smoothed.push(smoothedDetection);
    }

    return smoothed;
  }

  /**
   * Generate tracking data for video processing
   */
  public async generateTrackingData(
    videoPath: string,
    options: SubjectTrackingOptions = DEFAULT_TRACKING_OPTIONS
  ): Promise<{
    trackingRegions: TrackingRegion[];
    cropParameters: CropParameters[];
    processingMetadata: Record<string, any>;
  }> {
    try {
      console.log('Generating tracking data for:', videoPath);

      // Track subjects in video
      const trackingRegions = await this.trackSubjectInVideo(videoPath);

      // Get video dimensions (placeholder - would use FFprobe in real implementation)
      const videoWidth = 1920;
      const videoHeight = 1080;

      // Calculate crop parameters
      const cropParameters = this.calculateSpeakerCrop(
        trackingRegions,
        videoWidth,
        videoHeight,
        options.cropAspectRatio
      );

      const processingMetadata = {
        trackingMethod: 'mediapipe_face_detection',
        options: options,
        videoResolution: { width: videoWidth, height: videoHeight },
        trackingQuality: 'high',
        processingTime: Date.now(),
      };

      return {
        trackingRegions,
        cropParameters,
        processingMetadata,
      };

    } catch (error) {
      console.error('Failed to generate tracking data:', error);
      throw error;
    }
  }

  /**
   * Validate tracking configuration
   */
  public validateTrackingOptions(options: SubjectTrackingOptions): string[] {
    const errors: string[] = [];

    if (options.minFaceSize < 20 || options.minFaceSize > 500) {
      errors.push('Minimum face size must be between 20 and 500 pixels');
    }

    if (options.confidenceThreshold < 0.1 || options.confidenceThreshold > 1.0) {
      errors.push('Confidence threshold must be between 0.1 and 1.0');
    }

    if (options.trackingSmoothing < 0 || options.trackingSmoothing > 1) {
      errors.push('Tracking smoothing must be between 0 and 1');
    }

    if (options.cropAspectRatio <= 0) {
      errors.push('Crop aspect ratio must be positive');
    }

    return errors;
  }

  /**
   * Get common aspect ratios for video cropping
   */
  public getCommonAspectRatios(): { label: string; ratio: number; description: string }[] {
    return [
      { label: '9:16', ratio: 9/16, description: 'Vertical (TikTok, Instagram Stories)' },
      { label: '1:1', ratio: 1, description: 'Square (Instagram Posts)' },
      { label: '4:5', ratio: 4/5, description: 'Portrait (Instagram Feed)' },
      { label: '16:9', ratio: 16/9, description: 'Landscape (YouTube, Horizontal)' },
      { label: '21:9', ratio: 21/9, description: 'Ultra-wide (Cinematic)' },
    ];
  }

  /**
   * Check if tracking is available for current user plan
   */
  public isTrackingAvailable(): boolean {
    // Face tracking available for all plans
    // Advanced tracking features might be premium-only
    return true; // Basic tracking for all, advanced features for premium
  }

  /**
   * Get tracking quality based on plan
   */
  public getTrackingQuality(planCode: string): 'basic' | 'standard' | 'advanced' {
    switch (planCode) {
      case 'viral_enterprise_monthly':
        return 'advanced';
      case 'viral_pro_monthly':
      case 'viral_starter_monthly':
        return 'standard';
      default:
        return 'basic';
    }
  }
}

export const subjectTrackingService = SubjectTrackingService.getInstance();
