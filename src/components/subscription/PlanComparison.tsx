import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Crown, 
  Check, 
  X,
  Star,
  TrendingUp,
  Users,
  Zap,
  Shield,
  Palette,
  BarChart3,
  Globe,
  Sparkles
} from 'lucide-react';
import { initializePayment } from '@/lib/paystack-utils';

interface PricingPlan {
  id: string;
  name: string;
  code: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  features: Record<string, any>;
  popular?: boolean;
  current?: boolean;
}

interface CurrentSubscription {
  plan_code: string;
  status: string;
  subscription_id: string;
}

const PlanComparison = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadPlansAndSubscription();
    }
  }, [user]);

  const loadPlansAndSubscription = async () => {
    try {
      setLoading(true);

      // Load available plans
      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('active', true)
        .order('price', { ascending: true });

      if (plansError) throw plansError;

      // Load current subscription
      const { data: subData, error: subError } = await supabase
        .rpc('get_user_active_subscription', { p_user_id: user?.id });

      if (subError) throw subError;

      const subscription = subData && subData.length > 0 ? subData[0] : null;
      setCurrentSubscription(subscription);

      // Mark current plan and process plans
      const processedPlans = (plansData || []).map(plan => ({
        ...plan,
        current: subscription?.plan_code === plan.code,
        popular: plan.code === 'viral_pro_monthly'
      }));

      setPlans(processedPlans);
    } catch (error) {
      console.error('Failed to load plans:', error);
      toast({
        title: "Failed to Load Plans",
        description: "Could not load pricing plans. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planCode: string, planPrice: number) => {
    if (!user) return;

    setProcessingPlan(planCode);

    try {
      const result = await initializePayment({
        email: user.email || '',
        amount: planPrice * 100, // Convert to kobo
        plan: planCode,
        callback_url: `${window.location.origin}/subscription-success`,
        metadata: {
          user_id: user.id,
          upgrade: 'true',
          current_plan: currentSubscription?.plan_code || 'free'
        }
      });

      if (result.success && result.data?.authorization_url) {
        window.location.href = result.data.authorization_url;
      } else {
        throw new Error(result.message || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('Upgrade failed:', error);
      toast({
        title: "Upgrade Failed",
        description: error instanceof Error ? error.message : "Failed to start upgrade process",
        variant: "destructive",
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleDowngrade = async (planCode: string) => {
    if (!currentSubscription) return;

    setProcessingPlan(planCode);

    try {
      const response = await fetch('/api/paystack-integration/change-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription_code: currentSubscription.subscription_id,
          new_plan_code: planCode,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Plan Changed",
          description: "Your subscription has been updated successfully.",
        });
        
        await loadPlansAndSubscription();
      } else {
        throw new Error(result.error || 'Plan change failed');
      }
    } catch (error) {
      console.error('Plan change failed:', error);
      toast({
        title: "Plan Change Failed",
        description: error instanceof Error ? error.message : "Failed to change plan",
        variant: "destructive",
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const getFeatureIcon = (featureKey: string) => {
    const icons = {
      monthly_clips: Star,
      max_resolution: TrendingUp,
      priority_support: Shield,
      batch_processing: Zap,
      custom_branding: Palette,
      analytics: BarChart3,
      team_members: Users,
      api_access: Globe,
      white_label: Sparkles,
    };
    
    return icons[featureKey as keyof typeof icons] || Check;
  };

  const getFeatureLabel = (featureKey: string) => {
    const labels = {
      monthly_clips: 'Monthly Clips',
      max_resolution: 'Max Resolution',
      watermark_enabled: 'Watermark',
      priority_support: 'Priority Support',
      batch_processing: 'Batch Processing',
      custom_branding: 'Custom Branding',
      analytics: 'Analytics Dashboard',
      team_members: 'Team Members',
      api_access: 'API Access',
      white_label: 'White Label',
    };
    
    return labels[featureKey as keyof typeof labels] || featureKey;
  };

  const formatFeatureValue = (key: string, value: any): string => {
    if (typeof value === 'boolean') {
      return value ? 'Included' : 'Not included';
    }
    
    if (key === 'monthly_clips' && value === 'unlimited') {
      return 'Unlimited';
    }
    
    if (key === 'watermark_enabled') {
      return value === 'true' ? 'Visible' : 'Removed';
    }
    
    return String(value);
  };

  const getButtonAction = (plan: PricingPlan) => {
    if (plan.current) {
      return { text: 'Current Plan', disabled: true, variant: 'secondary' as const };
    }

    if (!currentSubscription || currentSubscription.plan_code === 'free') {
      return { 
        text: 'Upgrade Now', 
        disabled: false, 
        variant: 'default' as const,
        action: () => handleUpgrade(plan.code, plan.price)
      };
    }

    const currentPlan = plans.find(p => p.code === currentSubscription.plan_code);
    const isUpgrade = !currentPlan || plan.price > currentPlan.price;
    
    return {
      text: isUpgrade ? 'Upgrade' : 'Downgrade',
      disabled: false,
      variant: isUpgrade ? 'default' as const : 'outline' as const,
      action: isUpgrade 
        ? () => handleUpgrade(plan.code, plan.price)
        : () => handleDowngrade(plan.code)
    };
  };

  if (loading) {
    return (
      <div className="grid md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-96 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  // Get all unique feature keys for comparison
  const allFeatures = Array.from(
    new Set(plans.flatMap(plan => Object.keys(plan.features || {})))
  );

  return (
    <div className="space-y-8">
      {/* Plan Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const buttonConfig = getButtonAction(plan);
          
          return (
            <Card 
              key={plan.id} 
              className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''} ${plan.current ? 'ring-2 ring-primary' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1">
                    Most Popular
                  </Badge>
                </div>
              )}
              
              {plan.current && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="secondary" className="bg-green-100 text-green-800 px-3 py-1">
                    Current
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/{plan.interval}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Plan Features */}
                <div className="space-y-3">
                  {Object.entries(plan.features || {}).map(([key, value]) => {
                    const IconComponent = getFeatureIcon(key);
                    const isIncluded = value !== 'false' && value !== false && value !== '0' && value !== 0;
                    
                    return (
                      <div key={key} className="flex items-center gap-3">
                        {isIncluded ? (
                          <IconComponent className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${isIncluded ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {getFeatureLabel(key)}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {formatFeatureValue(key, value)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Action Button */}
                <Button
                  className="w-full mt-6"
                  variant={buttonConfig.variant}
                  disabled={buttonConfig.disabled || processingPlan === plan.code}
                  onClick={buttonConfig.action}
                >
                  {processingPlan === plan.code ? 'Processing...' : buttonConfig.text}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Feature Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Feature</th>
                  {plans.map(plan => (
                    <th key={plan.id} className="text-center py-3 px-2 font-medium">
                      <div className="flex flex-col items-center gap-1">
                        <span>{plan.name}</span>
                        {plan.current && (
                          <Badge variant="secondary" className="text-xs">Current</Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allFeatures.map(feature => {
                  const IconComponent = getFeatureIcon(feature);
                  
                  return (
                    <tr key={feature} className="border-b hover:bg-muted/50">
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-2">
                          <IconComponent className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{getFeatureLabel(feature)}</span>
                        </div>
                      </td>
                      {plans.map(plan => {
                        const value = plan.features?.[feature];
                        const isIncluded = value !== 'false' && value !== false && value !== '0' && value !== 0;
                        
                        return (
                          <td key={plan.id} className="py-4 px-2 text-center">
                            {value !== undefined ? (
                              <div className="flex flex-col items-center gap-1">
                                {isIncluded ? (
                                  <Check className="w-4 h-4 text-green-500" />
                                ) : (
                                  <X className="w-4 h-4 text-muted-foreground" />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {formatFeatureValue(feature, value)}
                                </span>
                              </div>
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Billing Information */}
      {currentSubscription && (
        <Card>
          <CardHeader>
            <CardTitle>Billing Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-medium">Plan Changes</h4>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>• Upgrades take effect immediately</p>
                  <p>• Downgrades take effect at the end of your current billing period</p>
                  <p>• Prorated billing applies to mid-cycle upgrades</p>
                  <p>• You'll retain access to premium features until your billing period ends</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium">Cancellation Policy</h4>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>• Cancel anytime without penalty</p>
                  <p>• Access continues until billing period ends</p>
                  <p>• No automatic renewals after cancellation</p>
                  <p>• Your data is preserved for 30 days after cancellation</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Can I change my plan anytime?</h4>
              <p className="text-sm text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time. Upgrades take effect immediately, 
                while downgrades will take effect at the end of your current billing cycle.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">What happens to my credits when I change plans?</h4>
              <p className="text-sm text-muted-foreground">
                Your existing credits will carry over when you upgrade. When downgrading, you'll keep 
                your current credits but receive the new plan's monthly allocation going forward.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">How does billing work for plan changes?</h4>
              <p className="text-sm text-muted-foreground">
                For upgrades, you'll be charged a prorated amount immediately. For downgrades, 
                the change will take effect at your next billing cycle with no immediate charges.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Can I get a refund if I'm not satisfied?</h4>
              <p className="text-sm text-muted-foreground">
                We offer a 14-day money-back guarantee for first-time subscribers. 
                Contact support if you'd like to request a refund within this period.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  function formatFeatureValue(key: string, value: any): string {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    
    if (key === 'monthly_clips' && value === 'unlimited') {
      return 'Unlimited';
    }
    
    if (key === 'watermark_enabled') {
      return value === 'true' ? 'Yes' : 'Removed';
    }
    
    if (key === 'team_members' && typeof value === 'number') {
      return value === 1 ? '1 member' : `${value} members`;
    }
    
    return String(value);
  }
};

export default PlanComparison;
