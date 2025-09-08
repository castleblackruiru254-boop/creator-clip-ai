import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Crown, 
  CreditCard, 
  BarChart3, 
  Star,
  Settings,
  
} from 'lucide-react';
import SubscriptionManager from './SubscriptionManager';
import BillingHistory from './BillingHistory';
import PlanComparison from './PlanComparison';
import CreditsUsage from './CreditsUsage';

const SubscriptionDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Subscription & Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription, view billing history, and track your usage.
          </p>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="credits" className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Credits</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Billing</span>
            </TabsTrigger>
            <TabsTrigger value="plans" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Plans</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="overview" className="space-y-6">
            <SubscriptionManager />
          </TabsContent>

          <TabsContent value="credits" className="space-y-6">
            <CreditsUsage />
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <BillingHistory />
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <PlanComparison />
          </TabsContent>
        </Tabs>

        {/* Help Section */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
              <Settings className="h-5 w-5" />
              Need Help?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-medium text-blue-800 dark:text-blue-200">Common Questions</h4>
                <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                  <p>• How do I upgrade or downgrade my plan?</p>
                  <p>• What happens if I run out of credits?</p>
                  <p>• Can I get a refund for unused credits?</p>
                  <p>• How does billing work for plan changes?</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <h4 className="font-medium text-blue-800 dark:text-blue-200">Get Support</h4>
                <div className="space-y-2">
                  <button className="w-full text-left p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors">
                    <div className="text-sm font-medium text-blue-900 dark:text-blue-100">📧 Email Support</div>
                    <div className="text-xs text-blue-700 dark:text-blue-300">support@creator-clip.ai</div>
                  </button>
                  
                  <button className="w-full text-left p-3 bg-white/50 dark:bg-gray-800/50 rounded-lg hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors">
                    <div className="text-sm font-medium text-blue-900 dark:text-blue-100">💬 Live Chat</div>
                    <div className="text-xs text-blue-700 dark:text-blue-300">Available 9 AM - 5 PM EST</div>
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SubscriptionDashboard;
