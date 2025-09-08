import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

import { 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Zap
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface CreditTransaction {
  id: string;
  credits_used: number;
  credits_added: number;
  reason: string;
  description: string;
  created_at: string;
}

interface BillingSummary {
  credits_remaining: number;
  credits_used_this_month: number;
  total_credits_purchased: number;
  monthly_allocation: number;
  next_billing_date: string;
}

const CreditsUsage: React.FC = () => {
  const { user } = useAuth();
  const [loading] = useState(false);

  // Mock billing summary - replace with actual billing integration
  const mockBillingSummary: BillingSummary = {
    credits_remaining: 150,
    credits_used_this_month: 50,
    total_credits_purchased: 200,
    monthly_allocation: 200,
    next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };

  // Mock credit transactions - replace with actual data
  const mockTransactions: CreditTransaction[] = [
    {
      id: '1',
      credits_used: 10,
      credits_added: 0,
      reason: 'video_processing',
      description: 'Video processing - YouTube clip generation',
      created_at: new Date().toISOString()
    },
    {
      id: '2',
      credits_used: 0,
      credits_added: 200,
      reason: 'subscription_renewal',
      description: 'Monthly Pro plan renewal',
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    }
  ];

  const [billingSummary] = useState<BillingSummary>(mockBillingSummary);
  const [creditTransactions] = useState<CreditTransaction[]>(mockTransactions);

  const getUsagePercentage = () => {
    if (!billingSummary.monthly_allocation) return 0;
    return (billingSummary.credits_used_this_month / billingSummary.monthly_allocation) * 100;
  };

  const getReasonIcon = (reason: string) => {
    switch (reason) {
      case 'video_processing':
        return <Zap className="w-4 h-4 text-blue-500" />;
      case 'subscription_renewal':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      default:
        return <CreditCard className="w-4 h-4 text-gray-500" />;
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      video_processing: 'Video Processing',
      subscription_renewal: 'Subscription Renewal',
      manual_addition: 'Manual Addition',
      refund: 'Refund'
    };
    return labels[reason] || reason.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Please sign in to view credits usage.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Credits Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Credits Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading credits data...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {billingSummary.credits_remaining}
                  </div>
                  <div className="text-sm text-muted-foreground">Remaining</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {billingSummary.credits_used_this_month}
                  </div>
                  <div className="text-sm text-muted-foreground">Used This Month</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {billingSummary.monthly_allocation}
                  </div>
                  <div className="text-sm text-muted-foreground">Monthly Allocation</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {billingSummary.total_credits_purchased}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Purchased</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Credits Used This Month</span>
                  <span>{billingSummary.credits_used_this_month} / {billingSummary.monthly_allocation}</span>
                </div>
                <Progress value={getUsagePercentage()} className="h-2" />
                <div className="text-xs text-muted-foreground">
                  {getUsagePercentage().toFixed(1)}% of monthly allocation used
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Next billing date:</span>
                </div>
                <Badge variant="outline">
                  {new Date(billingSummary.next_billing_date).toLocaleDateString()}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Credits History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Credit Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {creditTransactions.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No Activity Found</h3>
              <p className="text-muted-foreground">
                Your credit activity will appear here as you use the service.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {creditTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-lg">
                      {getReasonIcon(transaction.reason)}
                    </div>
                    <div>
                      <div className="font-medium">{transaction.description}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        {new Date(transaction.created_at).toLocaleDateString()}
                        <span>•</span>
                        <span>{getReasonLabel(transaction.reason)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {transaction.credits_used > 0 && (
                      <div className="flex items-center gap-1 text-red-600">
                        <TrendingDown className="w-4 h-4" />
                        <span className="font-medium">-{transaction.credits_used}</span>
                      </div>
                    )}
                    {transaction.credits_added > 0 && (
                      <div className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="w-4 h-4" />
                        <span className="font-medium">+{transaction.credits_added}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditsUsage;