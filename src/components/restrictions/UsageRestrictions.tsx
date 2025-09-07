import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { restrictionsService, RestrictionLimits, UsageStats } from '@/lib/freemium-restrictions';
import { 
  Crown, 
  AlertTriangle, 
  Clock, 
  Target,
  Zap,
  Shield,
  TrendingUp,
  Calendar,
  Video,
  HardDrive
} from 'lucide-react';

interface UsageRestrictionsProps {
  onUpgradeClick?: () => void;
  showUpgradeButton?: boolean;
}

const UsageRestrictions: React.FC<UsageRestrictionsProps> = ({
  onUpgradeClick,
  showUpgradeButton = true
}) => {
  const { user } = useAuth();
  const [limits, setLimits] = useState<RestrictionLimits | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadUserLimits();
    }
  }, [user]);

  const loadUserLimits = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { limits: userLimits, usage: userUsage } = await restrictionsService.getUserLimitsAndUsage(user.id);
      
      setLimits(userLimits);
      setUsage(userUsage);
      
      const userWarnings = restrictionsService.getLimitWarnings(userLimits, userUsage);
      setWarnings(userWarnings);
    } catch (error) {
      console.error('Failed to load user limits:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatLimit = (limit: number): string => {
    return limit === -1 ? 'Unlimited' : limit.toString();
  };

  const getUsageColor = (used: number, limit: number): string => {
    if (limit === -1) return 'text-green-600'; // Unlimited
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-orange-600';
    return 'text-green-600';
  };

  const getProgressValue = (used: number, limit: number): number => {
    if (limit === -1) return 0; // Don't show progress for unlimited
    return Math.min((used / limit) * 100, 100);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded animate-pulse" />
            <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
            <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!limits || !usage) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Plan Overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">Current Plan Limits</CardTitle>
          <Crown className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Daily Clips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Daily Clips
                </span>
                <span className={`text-sm font-bold ${getUsageColor(usage.clipsCreatedToday, limits.dailyClipLimit)}`}>
                  {usage.clipsCreatedToday} / {formatLimit(limits.dailyClipLimit)}
                </span>
              </div>
              {limits.dailyClipLimit !== -1 && (
                <Progress 
                  value={getProgressValue(usage.clipsCreatedToday, limits.dailyClipLimit)} 
                  className="h-2" 
                />
              )}
            </div>

            {/* Monthly Clips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Monthly Clips
                </span>
                <span className={`text-sm font-bold ${getUsageColor(usage.clipsCreatedThisMonth, limits.monthlyClipLimit)}`}>
                  {usage.clipsCreatedThisMonth} / {formatLimit(limits.monthlyClipLimit)}
                </span>
              </div>
              {limits.monthlyClipLimit !== -1 && (
                <Progress 
                  value={getProgressValue(usage.clipsCreatedThisMonth, limits.monthlyClipLimit)} 
                  className="h-2" 
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Restrictions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Plan Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Video Quality */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Max Resolution</span>
              </div>
              <Badge variant={limits.maxResolution === '720p' ? 'secondary' : 'default'}>
                {limits.maxResolution.toUpperCase()}
              </Badge>
            </div>

            {/* Watermark */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Watermark</span>
              </div>
              <Badge variant={limits.watermarkEnabled ? 'destructive' : 'default'}>
                {limits.watermarkEnabled ? 'Applied' : 'Removed'}
              </Badge>
            </div>

            {/* File Size Limit */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Max File Size</span>
              </div>
              <Badge variant="secondary">
                {limits.maxFileSize}MB
              </Badge>
            </div>

            {/* Priority Processing */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Priority Processing</span>
              </div>
              <Badge variant={limits.priorityProcessing ? 'default' : 'secondary'}>
                {limits.priorityProcessing ? 'Enabled' : 'Standard'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/10">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2 text-orange-800 dark:text-orange-200">
              <AlertTriangle className="h-5 w-5" />
              Usage Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {warnings.map((warning, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Target className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-orange-700 dark:text-orange-300">{warning}</p>
                </div>
              ))}
            </div>
            
            {showUpgradeButton && (
              <div className="mt-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-orange-300 text-orange-700 hover:bg-orange-100"
                  onClick={onUpgradeClick || (() => window.location.href = '/pricing')}
                >
                  Upgrade Plan
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Usage Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Usage Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-primary">{usage.clipsCreatedThisMonth}</p>
              <p className="text-xs text-muted-foreground">Clips This Month</p>
            </div>
            
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{usage.creditsUsedThisMonth}</p>
              <p className="text-xs text-muted-foreground">Credits Used</p>
            </div>
            
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{usage.storageUsedMB.toFixed(1)}MB</p>
              <p className="text-xs text-muted-foreground">Storage Used</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Free Plan Upgrade CTA */}
      {limits.watermarkEnabled && showUpgradeButton && (
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-6 text-center">
            <Crown className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Remove Limitations</h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              Upgrade to remove watermarks, increase quality to 1080p, and get more daily clips.
            </p>
            <div className="flex items-center justify-center gap-4 mb-6">
              <Badge variant="destructive" className="text-xs">Watermark Applied</Badge>
              <Badge variant="secondary" className="text-xs">720p Max</Badge>
              <Badge variant="secondary" className="text-xs">{limits.dailyClipLimit} Daily Clips</Badge>
            </div>
            <Button 
              size="lg" 
              onClick={onUpgradeClick || (() => window.location.href = '/pricing')}
            >
              Upgrade Now
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default UsageRestrictions;
