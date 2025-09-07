import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Star, 
  TrendingUp, 
  Calendar,
  BarChart3,
  Plus,
  AlertTriangle,
  Clock,
  Zap,
  Target,
  Award,
  Activity
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

interface CreditsSummary {
  credits_remaining: number;
  credits_used_this_month: number;
  total_credits_purchased: number;
  monthly_allocation: number;
  credits_reset_date: string;
}

interface UsageHistory {
  date: string;
  credits_used: number;
  credits_added: number;
  activity_type: string;
  description?: string;
}

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  bonus_credits?: number;
  description: string;
}

const CreditsUsage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [creditsSummary, setCreditsSummary] = useState<CreditsSummary | null>(null);
  const [usageHistory, setUsageHistory] = useState<UsageHistory[]>([]);
  const [creditPackages, setCreditPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingPackage, setPurchasingPackage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadCreditsData();
    }
  }, [user]);

  const loadCreditsData = async () => {
    try {
      setLoading(true);

      // Load credits summary
      const { data: summaryData, error: summaryError } = await supabase
        .rpc('get_user_billing_summary', { p_user_id: user?.id });

      if (summaryError) throw summaryError;

      if (summaryData && summaryData.length > 0) {
        setCreditsSummary({
          credits_remaining: summaryData[0].credits_remaining || 0,
          credits_used_this_month: summaryData[0].credits_used_this_month || 0,
          total_credits_purchased: summaryData[0].total_credits_purchased || 0,
          monthly_allocation: summaryData[0].monthly_allocation || 5,
          credits_reset_date: summaryData[0].next_billing_date || format(endOfMonth(new Date()), 'yyyy-MM-dd')
        });
      }

      // Load usage history for the current month
      const startDate = startOfMonth(new Date());
      const endDate = endOfMonth(new Date());

      const { data: historyData, error: historyError } = await supabase
        .from('billing_credits')
        .select('*')
        .eq('user_id', user?.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(20);

      if (historyError) throw historyError;

      const processedHistory = (historyData || []).map(record => ({
        date: record.created_at,
        credits_used: record.credits_used || 0,
        credits_added: record.credits_added || 0,
        activity_type: record.reason || 'unknown',
        description: record.description
      }));

      setUsageHistory(processedHistory);

      // Load available credit packages
      const packages: CreditPackage[] = [
        {
          id: 'credits_10',
          name: '10 Credits',
          credits: 10,
          price: 5,
          description: 'Perfect for trying out premium features'
        },
        {
          id: 'credits_50',
          name: '50 Credits',
          credits: 50,
          price: 20,
          bonus_credits: 5,
          description: 'Great value for regular users'
        },
        {
          id: 'credits_100',
          name: '100 Credits',
          credits: 100,
          price: 35,
          bonus_credits: 15,
          description: 'Best value for power users'
        }
      ];

      setCreditPackages(packages);

    } catch (error) {
      console.error('Failed to load credits data:', error);
      toast({
        title: "Failed to Load Credits Data",
        description: "Could not load your credits information. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseCredits = async (packageId: string, amount: number) => {
    if (!user) return;

    setPurchasingPackage(packageId);

    try {
      const response = await fetch('/api/paystack-integration/initialize-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: amount * 100, // Convert to kobo
          callback_url: `${window.location.origin}/credits-success`,
          metadata: {
            user_id: user.id,
            package_id: packageId,
            type: 'credits'
          }
        }),
      });

      const result = await response.json();

      if (result.success && result.data?.authorization_url) {
        window.location.href = result.data.authorization_url;
      } else {
        throw new Error(result.message || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('Credit purchase failed:', error);
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Failed to purchase credits",
        variant: "destructive",
      });
    } finally {
      setPurchasingPackage(null);
    }
  };

  const getUsageIcon = (activityType: string) => {
    switch (activityType.toLowerCase()) {
      case 'video_processing':
      case 'clip_generation':
        return <Zap className="w-4 h-4 text-blue-500" />;
      case 'subscription_renewal':
      case 'plan_upgrade':
        return <Star className="w-4 h-4 text-green-500" />;
      case 'credit_purchase':
        return <Plus className="w-4 h-4 text-purple-500" />;
      case 'bonus_credits':
        return <Award className="w-4 h-4 text-yellow-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const getActivityDisplayName = (activityType: string) => {
    const names = {
      video_processing: 'Video Processing',
      clip_generation: 'Clip Generation',
      subscription_renewal: 'Subscription Renewal',
      plan_upgrade: 'Plan Upgrade',
      credit_purchase: 'Credit Purchase',
      bonus_credits: 'Bonus Credits',
      refund: 'Refund',
    };
    
    return names[activityType as keyof typeof names] || activityType.replace('_', ' ');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  const usagePercentage = creditsSummary 
    ? Math.round((creditsSummary.credits_used_this_month / Math.max(creditsSummary.monthly_allocation, 1)) * 100)
    : 0;

  const remainingPercentage = creditsSummary
    ? Math.round((creditsSummary.credits_remaining / Math.max(creditsSummary.monthly_allocation, 1)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Credits Overview */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Remaining</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditsSummary?.credits_remaining || 0}</div>
            <p className="text-xs text-muted-foreground">
              of {creditsSummary?.monthly_allocation || 0} monthly credits
            </p>
            <Progress 
              value={remainingPercentage} 
              className="mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Used This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{creditsSummary?.credits_used_this_month || 0}</div>
            <p className="text-xs text-muted-foreground">
              {usagePercentage}% of monthly allocation
            </p>
            <Progress 
              value={usagePercentage} 
              className="mt-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Reset</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {creditsSummary?.credits_reset_date 
                ? format(new Date(creditsSummary.credits_reset_date), 'MMM dd')
                : format(endOfMonth(new Date()), 'MMM dd')
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Credits reset monthly
            </p>
            <div className="mt-3 flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {format(new Date(), 'MMM dd, yyyy')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Credits Warning */}
      {creditsSummary && creditsSummary.credits_remaining < 5 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/10">
          <CardContent className="flex items-center gap-4 p-4">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
            <div className="flex-1">
              <h4 className="font-medium text-orange-800 dark:text-orange-200">
                Running Low on Credits
              </h4>
              <p className="text-sm text-orange-600 dark:text-orange-300">
                You have {creditsSummary.credits_remaining} credits remaining. 
                Consider purchasing more credits or upgrading your plan.
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="border-orange-300 text-orange-700 hover:bg-orange-100"
              onClick={() => document.getElementById('credit-packages')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Buy Credits
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage This Month
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usageHistory.length > 0 ? (
            <div className="space-y-4">
              {/* Usage Timeline */}
              <div className="grid grid-cols-7 gap-2 mb-6">
                {Array.from({ length: 30 }, (_, i) => {
                  const date = subDays(new Date(), 29 - i);
                  const dayUsage = usageHistory
                    .filter(h => format(new Date(h.date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'))
                    .reduce((sum, h) => sum + h.credits_used, 0);
                  
                  const intensity = Math.min(dayUsage / 10, 1); // Max 10 credits for full intensity
                  
                  return (
                    <div
                      key={i}
                      className="aspect-square rounded-sm border"
                      style={{
                        backgroundColor: intensity > 0 
                          ? `hsl(var(--primary) / ${0.2 + intensity * 0.8})` 
                          : 'hsl(var(--muted))'
                      }}
                      title={`${format(date, 'MMM dd')}: ${dayUsage} credits used`}
                    />
                  );
                })}
              </div>

              {/* Recent Activity */}
              <div className="space-y-3">
                <h4 className="font-medium">Recent Activity</h4>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {usageHistory.slice(0, 10).map((activity, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        {getUsageIcon(activity.activity_type)}
                        <div>
                          <p className="font-medium text-sm">{getActivityDisplayName(activity.activity_type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.date), 'MMM dd, yyyy HH:mm')}
                          </p>
                          {activity.description && (
                            <p className="text-xs text-muted-foreground mt-1">{activity.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {activity.credits_used > 0 && (
                          <span className="text-sm font-medium text-red-600">-{activity.credits_used}</span>
                        )}
                        {activity.credits_added > 0 && (
                          <span className="text-sm font-medium text-green-600">+{activity.credits_added}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No usage activity this month</p>
              <p className="text-sm text-muted-foreground">
                Start creating clips to see your usage history here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Packages */}
      <Card id="credit-packages">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Buy Additional Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {creditPackages.map((pkg) => (
              <Card key={pkg.id} className="relative">
                {pkg.bonus_credits && (
                  <div className="absolute -top-2 -right-2">
                    <Badge className="bg-green-100 text-green-800 text-xs">
                      +{pkg.bonus_credits} Bonus
                    </Badge>
                  </div>
                )}
                
                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-lg">{pkg.name}</CardTitle>
                  <div className="space-y-1">
                    <div className="text-3xl font-bold">${pkg.price}</div>
                    <div className="text-sm text-muted-foreground">
                      {pkg.credits}{pkg.bonus_credits ? ` + ${pkg.bonus_credits}` : ''} credits
                    </div>
                    {pkg.bonus_credits && (
                      <div className="text-xs text-green-600 font-medium">
                        Total: {pkg.credits + pkg.bonus_credits} credits
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    {pkg.description}
                  </p>
                  
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">
                      ${(pkg.price / (pkg.credits + (pkg.bonus_credits || 0))).toFixed(2)} per credit
                    </div>
                  </div>
                  
                  <Button
                    className="w-full"
                    onClick={() => handlePurchaseCredits(pkg.id, pkg.price)}
                    disabled={purchasingPackage === pkg.id}
                  >
                    {purchasingPackage === pkg.id ? 'Processing...' : 'Purchase Credits'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-3">
              <Target className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-medium">How Credits Work</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Each video processing or clip generation uses 1 credit</p>
                  <p>• Credits purchased separately never expire</p>
                  <p>• Monthly plan credits reset at the beginning of each billing cycle</p>
                  <p>• Purchased credits are used first, then monthly allocation</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credits Statistics */}
      {creditsSummary && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Usage Pattern</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Average daily usage</span>
                  <span className="font-medium">
                    {(creditsSummary.credits_used_this_month / new Date().getDate()).toFixed(1)} credits
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Projected monthly usage</span>
                  <span className="font-medium">
                    {Math.round((creditsSummary.credits_used_this_month / new Date().getDate()) * 30)} credits
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Efficiency rate</span>
                  <span className="font-medium">
                    {usagePercentage}% of allocation used
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {usagePercentage > 80 ? (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Consider upgrading</p>
                      <p className="text-xs text-muted-foreground">
                        You're using {usagePercentage}% of your monthly allocation. 
                        Upgrading might be more cost-effective.
                      </p>
                    </div>
                  </div>
                ) : usagePercentage < 30 ? (
                  <div className="flex items-start gap-2">
                    <Target className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Great usage efficiency</p>
                      <p className="text-xs text-muted-foreground">
                        You're using {usagePercentage}% of your allocation efficiently. 
                        Your current plan fits your needs well.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <Award className="h-4 w-4 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Balanced usage</p>
                      <p className="text-xs text-muted-foreground">
                        You're making good use of your {usagePercentage}% allocation. 
                        Monitor your usage as you approach the limit.
                      </p>
                    </div>
                  </div>
                )}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => window.location.href = '/subscription/plans'}
                >
                  View All Plans
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CreditsUsage;
