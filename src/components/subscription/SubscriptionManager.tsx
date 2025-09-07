import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Crown, 
  Calendar, 
  CreditCard, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Star,
  Wallet,
  Download,
  TrendingUp,
  Users
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface UserSubscription {
  subscription_id: string;
  plan_code: string;
  status: string;
  current_period_end: string;
  amount: number;
  features: Record<string, string>;
}

interface BillingSummary {
  total_spent: number;
  total_transactions: number;
  credits_remaining: number;
  credits_used_this_month: number;
  next_billing_date: string;
  current_subscription: any;
}

interface Transaction {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  paid_at: string;
  reference: string;
}

const SubscriptionManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);

  useEffect(() => {
    if (user) {
      loadSubscriptionData();
    }
  }, [user]);

  const loadSubscriptionData = async () => {
    try {
      setLoading(true);

      // Load active subscription
      const { data: subData, error: subError } = await supabase
        .rpc('get_user_active_subscription', { p_user_id: user?.id });

      if (subError) throw subError;

      if (subData && subData.length > 0) {
        setSubscription(subData[0]);
      }

      // Load billing summary
      const { data: summaryData, error: summaryError } = await supabase
        .rpc('get_user_billing_summary', { p_user_id: user?.id });

      if (summaryError) throw summaryError;

      if (summaryData && summaryData.length > 0) {
        setBillingSummary(summaryData[0]);
      }

      // Load recent transactions
      const { data: transData, error: transError } = await supabase
        .from('billing_transactions')
        .select('id, amount, status, payment_method, paid_at, reference')
        .eq('user_id', user?.id)
        .order('paid_at', { ascending: false })
        .limit(10);

      if (transError) throw transError;

      setTransactions(transData || []);

    } catch (error) {
      console.error('Failed to load subscription data:', error);
      toast({
        title: "Failed to Load Subscription",
        description: "Could not load your subscription details. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription) return;

    setCancellingSubscription(true);
    
    try {
      const response = await fetch('/api/paystack-integration/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription_code: subscription.subscription_id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Subscription Cancelled",
          description: "Your subscription has been cancelled successfully. You'll retain access until the end of your billing period.",
        });
        
        await loadSubscriptionData();
      } else {
        throw new Error(result.error || 'Cancellation failed');
      }
    } catch (error) {
      console.error('Cancellation failed:', error);
      toast({
        title: "Cancellation Failed",
        description: error instanceof Error ? error.message : "Failed to cancel subscription",
        variant: "destructive",
      });
    } finally {
      setCancellingSubscription(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs = {
      active: { label: 'Active', variant: 'default', icon: CheckCircle },
      cancelled: { label: 'Cancelled', variant: 'secondary', icon: XCircle },
      will_not_renew: { label: 'Ending Soon', variant: 'destructive', icon: AlertCircle },
      attention: { label: 'Attention Required', variant: 'destructive', icon: AlertCircle },
    };

    const config = configs[status as keyof typeof configs] || configs.active;
    const IconComponent = config.icon;

    return (
      <Badge variant={config.variant as any} className="flex items-center gap-1">
        <IconComponent className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getPlanDisplayName = (planCode: string) => {
    const plans = {
      'viral_starter_monthly': 'Starter',
      'viral_pro_monthly': 'Pro',
      'viral_enterprise_monthly': 'Enterprise',
    };
    
    return plans[planCode as keyof typeof plans] || planCode;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-40 bg-muted rounded-lg animate-pulse" />
          <div className="h-40 bg-muted rounded-lg animate-pulse" />
        </div>
        <div className="h-60 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subscription Overview */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Current Plan */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Current Plan</CardTitle>
            <Crown className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold">{getPlanDisplayName(subscription.plan_code)}</h3>
                    {getStatusBadge(subscription.status)}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">${subscription.amount}</p>
                    <p className="text-xs text-muted-foreground">per month</p>
                  </div>
                </div>
                
                {subscription.current_period_end && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {subscription.status === 'active' ? 'Next billing' : 'Access until'}: {' '}
                      {formatDistanceToNow(new Date(subscription.current_period_end), { addSuffix: true })}
                    </span>
                  </div>
                )}
                
                {subscription.status === 'active' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleCancelSubscription}
                    disabled={cancellingSubscription}
                  >
                    {cancellingSubscription ? 'Cancelling...' : 'Cancel Subscription'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold">Free</h3>
                  <Badge variant="secondary">Current Plan</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  You're currently on the free plan. Upgrade to unlock more features.
                </p>
                <Button className="w-full" onClick={() => window.location.href = '/pricing'}>
                  Upgrade Plan
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Usage This Month</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Credits Remaining</span>
                  <span className="font-medium">{billingSummary?.credits_remaining || 0}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all" 
                    style={{ 
                      width: `${Math.max(10, (billingSummary?.credits_remaining || 0) / 
                        ((subscription?.features?.monthly_clips === 'unlimited' ? 200 : 
                          parseInt(subscription?.features?.monthly_clips || '5')) / 100))}%` 
                    }}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary">{billingSummary?.credits_used_this_month || 0}</p>
                  <p className="text-xs text-muted-foreground">Credits Used</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{billingSummary?.total_transactions || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Payments</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Features */}
      {subscription && subscription.features && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" />
              Plan Features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {Object.entries(subscription.features).map(([feature, value]) => {
                const featureLabels = {
                  monthly_clips: 'Monthly Clips',
                  max_resolution: 'Max Resolution',
                  watermark_enabled: 'Watermark',
                  priority_support: 'Priority Support',
                  batch_processing: 'Batch Processing',
                  custom_branding: 'Custom Branding',
                  analytics: 'Analytics',
                  team_members: 'Team Members',
                  api_access: 'API Access',
                  white_label: 'White Label',
                };

                const label = featureLabels[feature as keyof typeof featureLabels] || feature;
                const displayValue = value === 'true' ? '✅ Enabled' : 
                                  value === 'false' ? '❌ Disabled' : value;

                return (
                  <div key={feature} className="flex justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-sm text-muted-foreground">{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(transaction.status)}
                    <div>
                      <p className="font-medium">${transaction.amount.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.payment_method} • {transaction.reference}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={transaction.status === 'completed' ? 'default' : 'secondary'}>
                      {transaction.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(transaction.paid_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
              
              {transactions.length >= 10 && (
                <div className="text-center pt-4">
                  <Button variant="outline" size="sm">
                    View All Transactions
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No transactions yet</p>
              <p className="text-sm text-muted-foreground">
                Your payment history will appear here once you make a purchase.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <Button variant="outline" className="flex items-center gap-2" onClick={() => window.location.href = '/pricing'}>
              <Crown className="h-4 w-4" />
              Change Plan
            </Button>
            
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download Invoice
            </Button>
            
            <Button variant="outline" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Update Payment Method
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Billing Statistics */}
      {billingSummary && (
        <div className="grid md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">${billingSummary.total_spent.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{billingSummary.credits_remaining}</p>
                  <p className="text-xs text-muted-foreground">Credits Left</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{billingSummary.credits_used_this_month}</p>
                  <p className="text-xs text-muted-foreground">Used This Month</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{billingSummary.total_transactions}</p>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upgrade CTA for Free Users */}
      {(!subscription || subscription.plan_code === 'free') && (
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20">
          <CardContent className="p-8 text-center">
            <Crown className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-2">Unlock More Features</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Upgrade to a paid plan to remove watermarks, access higher quality exports, 
              and get more monthly credits.
            </p>
            <Button size="lg" onClick={() => window.location.href = '/pricing'}>
              View Plans & Upgrade
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SubscriptionManager;
