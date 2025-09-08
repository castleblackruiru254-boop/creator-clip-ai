import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Crown, 
  Calendar, 
  CreditCard, 
  Download, 
  RefreshCw,
  Star,
  Clock,
  ArrowRight,
  Check,
  X
} from 'lucide-react';

interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  current_period_start: string;
  current_period_end: string;
  created_at: string;
}

interface BillingSummary {
  total_amount: number;
  current_period_usage: number;
  next_billing_date: string;
  credits_remaining: number;
}

interface Transaction {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  paid_at: string;
  reference: string;
}

const SubscriptionManager: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (user) {
      loadSubscriptionData();
    }
  }, [user]);

  const loadSubscriptionData = async () => {
    try {
      setLoading(true);

      // Mock subscription data - replace with actual implementation when billing is configured
      const mockSubscription: UserSubscription = {
        id: 'mock-subscription',
        user_id: user!.id,
        plan_id: 'free',
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };

      const mockBillingSummary: BillingSummary = {
        total_amount: 0,
        current_period_usage: 0,
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        credits_remaining: 5,
      };

      const mockTransactions: Transaction[] = [];

      setSubscription(mockSubscription);
      setBillingSummary(mockBillingSummary);
      setTransactions(mockTransactions);

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

    try {
      setCancelling(true);

      // In a real implementation, this would call a billing service
      console.log('Cancel subscription request for:', subscription.id);

      toast({
        title: "Cancellation Requested",
        description: "Your subscription will be cancelled at the end of the current billing period.",
      });

    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      toast({
        title: "Cancellation Failed",
        description: "Could not cancel your subscription. Please contact support.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadge = (status: UserSubscription['status']) => {
    const config = {
      active: { icon: <Check className="w-3 h-3" />, label: 'Active', variant: 'default' as const },
      cancelled: { icon: <X className="w-3 h-3" />, label: 'Cancelled', variant: 'secondary' as const },
      past_due: { icon: <Clock className="w-3 h-3" />, label: 'Past Due', variant: 'destructive' as const },
      trialing: { icon: <Star className="w-3 h-3" />, label: 'Trial', variant: 'outline' as const },
    };

    const { icon, label, variant } = config[status] || config.active;

    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {icon}
        {label}
      </Badge>
    );
  };

  const getPlanDisplayName = (planId: string) => {
    const planNames: Record<string, string> = {
      free: 'Free Plan',
      starter: 'Starter Plan',
      pro: 'Pro Plan',
      enterprise: 'Enterprise Plan',
    };
    return planNames[planId] || planId;
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Please sign in to view your subscription.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subscription Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Subscription Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscription ? (
            <>
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">
                    {getPlanDisplayName(subscription.plan_id)}
                  </h3>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(subscription.status)}
                    <span className="text-sm text-muted-foreground">
                      Member since {new Date(subscription.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-2xl font-bold">
                    {subscription.plan_id === 'free' ? '$0' : subscription.plan_id === 'starter' ? '$7' : '$12'}
                  </div>
                  <div className="text-sm text-muted-foreground">per month</div>
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Billing Period</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(subscription.current_period_start).toLocaleDateString()} - {' '}
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Next Billing</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {billingSummary ? new Date(billingSummary.next_billing_date).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <Crown className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No Active Subscription</h3>
              <p className="text-muted-foreground mb-4">
                You don't have an active subscription. Upgrade to unlock premium features.
              </p>
              <Button>
                <ArrowRight className="w-4 h-4 mr-2" />
                View Plans
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Summary */}
      {billingSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5" />
              Usage Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Credits Remaining</span>
                  <span className="text-lg font-semibold text-green-600">
                    {billingSummary.credits_remaining}
                  </span>
                </div>
                <Progress value={75} className="h-2" />
                <div className="text-xs text-muted-foreground">
                  75% of monthly allocation remaining
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Current Usage</span>
                  <span className="text-lg font-semibold">
                    ${billingSummary.current_period_usage.toFixed(2)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  This billing period
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Features */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Plan Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {subscription.plan_id === 'free' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">5 video exports per month</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Basic AI analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <X className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Priority processing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <X className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Advanced customization</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Unlimited exports</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Advanced AI analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Priority processing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">Advanced customization</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No Transactions Found</h3>
              <p className="text-muted-foreground">
                Your billing transactions will appear here once billing is fully configured.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="font-medium">${transaction.amount.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(transaction.paid_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant={transaction.status === 'paid' ? 'default' : 'secondary'}>
                    {transaction.status}
                  </Badge>
                </div>
              ))}
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
            <Button variant="outline" className="flex items-center gap-2">
              <Crown className="w-4 h-4" />
              Change Plan
            </Button>
            
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download Invoice
            </Button>
            
            <Button variant="outline" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Update Payment
            </Button>
          </div>

          {subscription && subscription.status === 'active' && subscription.plan_id !== 'free' && (
            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Cancel Subscription</h4>
                  <p className="text-sm text-muted-foreground">
                    Your subscription will remain active until the end of the current billing period.
                  </p>
                </div>
                <Button 
                  variant="destructive" 
                  onClick={handleCancelSubscription}
                  disabled={cancelling}
                >
                  {cancelling ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  {cancelling ? 'Cancelling...' : 'Cancel Plan'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Free Plan Upgrade CTA */}
      {subscription?.plan_id === 'free' && (
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/50 border-purple-200 dark:border-purple-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                  Ready to unlock more features?
                </h3>
                <p className="text-purple-700 dark:text-purple-300">
                  Upgrade to get unlimited exports, priority processing, and advanced AI features.
                </p>
              </div>
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Crown className="w-4 h-4 mr-2" />
                Upgrade Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SubscriptionManager;