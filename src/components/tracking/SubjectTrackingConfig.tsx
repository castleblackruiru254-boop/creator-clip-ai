import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { subjectTrackingService, SubjectTrackingOptions, DEFAULT_TRACKING_OPTIONS } from '@/lib/subject-tracking';
import { 
  Target, 
  Eye, 
  Settings,
  Crop,
  Smartphone,
  Monitor,
  Square,
  Video,
  Zap,
  AlertCircle,
  CheckCircle,
  Play
} from 'lucide-react';

interface SubjectTrackingConfigProps {
  onConfigChange: (options: SubjectTrackingOptions) => void;
  initialConfig?: Partial<SubjectTrackingOptions>;
  disabled?: boolean;
  planCode?: string;
}

const SubjectTrackingConfig: React.FC<SubjectTrackingConfigProps> = ({
  onConfigChange,
  initialConfig = {},
  disabled = false,
  planCode = 'free'
}) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<SubjectTrackingOptions>({
    ...DEFAULT_TRACKING_OPTIONS,
    ...initialConfig
  });
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    onConfigChange(config);
  }, [config, onConfigChange]);

  const handleConfigChange = (updates: Partial<SubjectTrackingOptions>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const getTrackingQuality = () => {
    return subjectTrackingService.getTrackingQuality(planCode);
  };

  const getAspectRatios = () => {
    return subjectTrackingService.getCommonAspectRatios();
  };

  const isAdvancedFeatureAvailable = () => {
    const quality = getTrackingQuality();
    return quality === 'standard' || quality === 'advanced';
  };

  const getQualityBadge = () => {
    const quality = getTrackingQuality();
    const variants = {
      basic: 'secondary',
      standard: 'default',
      advanced: 'default',
    };
    
    return (
      <Badge variant={variants[quality] as any} className="text-xs">
        {quality.charAt(0).toUpperCase() + quality.slice(1)} Tracking
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Target className="h-5 w-5" />
            Subject Tracking
          </CardTitle>
          <div className="flex items-center gap-2">
            {getQualityBadge()}
            <Switch
              checked={config.faceDetectionEnabled}
              onCheckedChange={(enabled) => handleConfigChange({ faceDetectionEnabled: enabled })}
              disabled={disabled}
            />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Automatically detect and center subjects in your videos for better social media cropping.
          </p>
        </CardContent>
      </Card>

      {config.faceDetectionEnabled && (
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Basic Settings</TabsTrigger>
            <TabsTrigger value="cropping">Cropping</TabsTrigger>
            <TabsTrigger value="advanced" disabled={!isAdvancedFeatureAvailable()}>
              Advanced
            </TabsTrigger>
          </TabsList>

          {/* Basic Settings */}
          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Detection Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Speaker Centering */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Speaker Centering</label>
                    <p className="text-xs text-muted-foreground">
                      Automatically center the main speaker in the frame
                    </p>
                  </div>
                  <Switch
                    checked={config.speakerCenteringEnabled}
                    onCheckedChange={(enabled) => handleConfigChange({ speakerCenteringEnabled: enabled })}
                    disabled={disabled}
                  />
                </div>

                {/* Confidence Threshold */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Detection Confidence</label>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(config.confidenceThreshold * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[config.confidenceThreshold]}
                    onValueChange={([value]) => handleConfigChange({ confidenceThreshold: value })}
                    min={0.3}
                    max={0.95}
                    step={0.05}
                    disabled={disabled}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher values = more accurate detection, lower values = detect more faces
                  </p>
                </div>

                {/* Minimum Face Size */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Minimum Face Size</label>
                    <span className="text-xs text-muted-foreground">
                      {config.minFaceSize}px
                    </span>
                  </div>
                  <Slider
                    value={[config.minFaceSize]}
                    onValueChange={([value]) => handleConfigChange({ minFaceSize: value })}
                    min={20}
                    max={200}
                    step={10}
                    disabled={disabled}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ignore faces smaller than this size to focus on main subjects
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cropping Settings */}
          <TabsContent value="cropping" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2">
                  <Crop className="h-4 w-4" />
                  Aspect Ratio & Cropping
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Aspect Ratio Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Target Aspect Ratio</label>
                  <div className="grid grid-cols-2 gap-3">
                    {getAspectRatios().map((ratio) => (
                      <Card 
                        key={ratio.label}
                        className={`cursor-pointer transition-colors ${
                          Math.abs(config.cropAspectRatio - ratio.ratio) < 0.01
                            ? 'ring-2 ring-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => !disabled && handleConfigChange({ cropAspectRatio: ratio.ratio })}
                      >
                        <CardContent className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            {ratio.label === '9:16' && <Smartphone className="h-4 w-4" />}
                            {ratio.label === '16:9' && <Monitor className="h-4 w-4" />}
                            {ratio.label === '1:1' && <Square className="h-4 w-4" />}
                            {ratio.label === '4:5' && <Video className="h-4 w-4" />}
                            <span className="font-semibold">{ratio.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{ratio.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Preview Area */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Crop Preview</label>
                  <div className="relative bg-muted rounded-lg p-4 flex items-center justify-center min-h-[200px]">
                    <div 
                      className="bg-primary/20 border-2 border-primary border-dashed rounded"
                      style={{
                        aspectRatio: config.cropAspectRatio,
                        width: config.cropAspectRatio > 1 ? '80%' : 'auto',
                        height: config.cropAspectRatio < 1 ? '80%' : 'auto',
                        maxWidth: '300px',
                        maxHeight: '200px'
                      }}
                    >
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <Target className="h-8 w-8 text-primary mx-auto mb-2" />
                          <p className="text-xs text-primary font-medium">Subject will be centered here</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Settings */}
          <TabsContent value="advanced" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced Tracking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {!isAdvancedFeatureAvailable() && (
                  <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-950/10 rounded-lg border border-orange-200">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Advanced tracking requires Pro or Enterprise plan
                    </p>
                  </div>
                )}

                {/* Object Tracking */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Object Tracking</label>
                    <p className="text-xs text-muted-foreground">
                      Track objects beyond faces for complex scenes
                    </p>
                  </div>
                  <Switch
                    checked={config.objectTrackingEnabled}
                    onCheckedChange={(enabled) => handleConfigChange({ objectTrackingEnabled: enabled })}
                    disabled={disabled || !isAdvancedFeatureAvailable()}
                  />
                </div>

                {/* Tracking Smoothing */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Tracking Smoothness</label>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(config.trackingSmoothing * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[config.trackingSmoothing]}
                    onValueChange={([value]) => handleConfigChange({ trackingSmoothing: value })}
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    disabled={disabled || !isAdvancedFeatureAvailable()}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher values = smoother tracking, lower values = more responsive tracking
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Tracking Status */}
      {config.faceDetectionEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-md flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Tracking Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Face Detection</span>
                <Badge variant="default" className="text-xs">Enabled</Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Speaker Centering</span>
                <Badge variant={config.speakerCenteringEnabled ? 'default' : 'secondary'} className="text-xs">
                  {config.speakerCenteringEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm">Object Tracking</span>
                <Badge variant={config.objectTrackingEnabled && isAdvancedFeatureAvailable() ? 'default' : 'secondary'} className="text-xs">
                  {config.objectTrackingEnabled && isAdvancedFeatureAvailable() ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Target Format</span>
                <Badge variant="outline" className="text-xs">
                  {getAspectRatios().find(r => Math.abs(r.ratio - config.cropAspectRatio) < 0.01)?.label || 'Custom'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Info */}
      <Card className="bg-blue-50 dark:bg-blue-950/10 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-medium text-blue-800 dark:text-blue-200">Performance Impact</h4>
              <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <p>• Face detection adds ~30-60 seconds to processing time</p>
                <p>• Object tracking (Pro+) adds additional 20-40 seconds</p>
                <p>• Higher quality tracking provides better accuracy</p>
                <p>• Smoothing helps reduce jittery movements in final clips</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Button */}
      {config.faceDetectionEnabled && (
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => setPreviewMode(!previewMode)}
          disabled={disabled}
        >
          <Play className="w-4 h-4 mr-2" />
          {previewMode ? 'Hide Preview' : 'Preview Tracking'}
        </Button>
      )}

      {/* Preview Mode */}
      {previewMode && config.faceDetectionEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-md">Tracking Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                <div 
                  className="relative bg-gradient-to-br from-gray-700 to-gray-800"
                  style={{ aspectRatio: '16/9', height: '200px' }}
                >
                  {/* Simulated video frame */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white/50 text-sm">Original Video (16:9)</div>
                  </div>
                  
                  {/* Face detection overlay */}
                  <div 
                    className="absolute border-2 border-green-400 bg-green-400/10"
                    style={{
                      left: '30%',
                      top: '20%',
                      width: '40%',
                      height: '50%',
                    }}
                  >
                    <div className="absolute -top-6 left-0 text-xs text-green-400 font-medium">
                      Face Detected (85%)
                    </div>
                  </div>
                  
                  {/* Crop area overlay */}
                  <div 
                    className="absolute border-2 border-primary border-dashed bg-primary/5"
                    style={{
                      left: '25%',
                      top: '0%',
                      width: '50%',
                      height: '100%',
                      aspectRatio: config.cropAspectRatio,
                    }}
                  >
                    <div className="absolute -top-6 right-0 text-xs text-primary font-medium">
                      Crop Area ({getAspectRatios().find(r => Math.abs(r.ratio - config.cropAspectRatio) < 0.01)?.label})
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground text-center">
                Green box: Detected face • Blue box: Final crop area
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disabled State */}
      {disabled && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Subject tracking is currently disabled. Enable it to automatically center speakers in your clips.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SubjectTrackingConfig;
