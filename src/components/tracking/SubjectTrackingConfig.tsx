import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Target, 
  Eye, 
  Zap,
  AlertCircle,
  CheckCircle,
  Play
} from 'lucide-react';

interface SubjectTrackingOptions {
  enabled: boolean;
  sensitivity: number;
  targetAspectRatio: string;
  cropMode: string;
  faceDetection: boolean;
  motionSmoothing: number;
  bufferZone: number;
}

const DEFAULT_TRACKING_OPTIONS: SubjectTrackingOptions = {
  enabled: false,
  sensitivity: 50,
  targetAspectRatio: '9:16',
  cropMode: 'smart',
  faceDetection: false,
  motionSmoothing: 25,
  bufferZone: 50,
};

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
  const [config, setConfig] = useState<SubjectTrackingOptions>({
    ...DEFAULT_TRACKING_OPTIONS,
    ...initialConfig
  });

  useEffect(() => {
    onConfigChange(config);
  }, [config, onConfigChange]);

  const handleConfigChange = (updates: Partial<SubjectTrackingOptions>) => {
    if (disabled) return;
    setConfig(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Subject Tracking Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Enable Tracking */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <span className="font-medium">Enable Subject Tracking</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Automatically track and follow subjects in your videos
                </p>
              </div>
              <Switch
                checked={config.enabled}
                onCheckedChange={(enabled) => handleConfigChange({ enabled })}
                disabled={disabled}
              />
            </div>

            {/* Preview */}
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto bg-muted rounded-lg flex items-center justify-center">
                  <Play className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Preview Not Available</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Upload a video to see tracking preview
                  </p>
                </div>
                {config.enabled ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-green-600">Tracking Enabled</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span className="text-orange-600">Tracking Disabled</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Premium Upgrade CTA for Free Users */}
      {planCode === 'free' && (
        <Card className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/50 dark:to-red-950/50 border-orange-200 dark:border-orange-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                  Unlock Advanced Tracking Features
                </h3>
                <p className="text-orange-700 dark:text-orange-300">
                  Get face detection, batch processing, and premium AI features with a paid plan.
                </p>
              </div>
              <Button className="bg-orange-600 hover:bg-orange-700">
                <Zap className="w-4 h-4 mr-2" />
                Upgrade Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SubjectTrackingConfig;