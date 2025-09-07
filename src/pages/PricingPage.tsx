import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { 
  Check, 
  Star, 
  Zap, 
  Crown, 
  Building2,
  ArrowLeft,
  Video,
  Sparkles,
  CreditCard,
  Wallet
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePaystack } from "@/lib/paystack-service";

interface PricingTier {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  limitations?: string[];
  recommended?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  credits: number | string;
}

const PricingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number>(0);
  const { initializePayment } = usePaystack();

  // Check for payment reference from redirect
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const reference = query.get('reference');
    
    if (reference) {
      verifyPayment(reference);
    }
    
    if (user) {
      loadUserSubscription();
    }
  }, [user]);
  
  // Load user subscription
  const loadUserSubscription = async () => {
    try {
      // Get user profile including subscription tier and credits
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('subscription_tier, credits_remaining')
        .eq('id', user?.id)
        .single();
      
      if (profileError) throw profileError;
      
      setCreditsRemaining(profile.credits_remaining || 0);
      
      // Get active subscription details
      const { data: subscription, error: subError } = await supabase
        .rpc('get_user_active_subscription', { p_user_id: user?.id });
      
      if (subError) throw subError;
      
      if (subscription && subscription.length > 0) {
        setUserSubscription(subscription[0]);
      }
    } catch (error) {
      console.error('Failed to load subscription:', error);
    }
  };
  
  // Verify payment after redirect
  const verifyPayment = async (reference: string) => {
    try {
      toast({
        title: "Verifying Payment",
        description: "Please wait while we verify your payment...",
      });
      
      const response = await fetch('/api/paystack-integration/verify-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference }),
      });
      
      const result = await response.json();
      
      if (result.success && result.transaction.status === 'success') {
        toast({
          title: "Payment Successful",
          description: "Your subscription has been activated successfully!",
        });
        
        // Remove reference from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('reference');
        window.history.replaceState({}, document.title, url.toString());
        
        // Reload subscription data
        await loadUserSubscription();
      } else {
        toast({
          title: "Payment Verification Failed",
          description: result.error || "Please contact support if you've been charged.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Payment verification failed:', error);
      toast({
        title: "Payment Verification Error",
        description: "An unexpected error occurred. Please contact support.",
        variant: "destructive",
      });
    }
  };

  const pricingTiers: PricingTier[] = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      period: 'forever',
      description: 'Perfect for trying out ViralClips',
      credits: 5,
      icon: Video,
      gradient: 'from-gray-500 to-gray-600',
      features: [
        '5 clips per month',
        'Basic AI analysis',
        'Standard quality exports',
        'YouTube video import',
        'Basic subtitle generation',
        'Community support'
      ],
      limitations: [
        'Watermark on exports',
        'Limited AI features',
        'Basic templates only'
      ]
    },
    {
      id: 'starter',
      name: 'Starter',
      price: 19,
      period: 'month',
      description: 'Great for content creators getting started',
      credits: 50,
      icon: Zap,
      gradient: 'from-blue-500 to-purple-600',
      features: [
        '50 clips per month',
        'Advanced AI analysis',
        'HD quality exports (1080p)',
        'No watermarks',
        'Custom subtitle styles',
        'Priority processing',
        'Email support',
        'Basic analytics'
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 49,
      period: 'month',
      description: 'Perfect for professional creators and agencies',
      credits: 200,
      recommended: true,
      icon: Crown,
      gradient: 'from-purple-500 to-pink-600',
      features: [
        '200 clips per month',
        'Premium AI analysis',
        '4K quality exports',
        'Advanced editing tools',
        'Custom branding',
        'Batch processing',
        'Priority support',
        'Advanced analytics',
        'Team collaboration (3 members)',
        'Custom templates',
        'API access'
      ]
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 199,
      period: 'month',
      description: 'Custom solutions for large teams and organizations',
      credits: 'Unlimited',
      icon: Building2,
      gradient: 'from-orange-500 to-red-600',
      features: [
        'Unlimited clips',
        'White-label solution',
        'Custom AI models',
        'Dedicated support manager',
        'Custom integrations',
        'Advanced team management',
        'SSO authentication',
        'Custom analytics dashboard',
        'SLA guarantees',
        'On-premise deployment option'
      ]
    }
  ];

  const handleUpgrade = async (tierId: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to upgrade your subscription.",
        variant: "destructive",
      });
      navigate('/auth');
      return;
    }

    setProcessing(tierId);
    
    try {
      // Get plan details
      const tier = pricingTiers.find(t => t.id === tierId);
      if (!tier) {
        throw new Error("Invalid plan selected");
      }

      // Initialize payment with Paystack
      const response = await fetch('/api/paystack-integration/initialize-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          amount: tier.price,
          plan_code: `viral_${tierId}_monthly`,
          metadata: {
            user_id: user.id,
            plan_id: tierId,
            plan_name: tier.name,
          }
        }),
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Payment initialization failed");
      }

      // Redirect to Paystack checkout page
      window.location.href = result.data.authorization_url;
      
      toast({
        title: "Redirecting to Payment",
        description: `You'll be redirected to complete your ${tier.name} plan subscription.`,
      });

    } catch (error) {
      console.error('Upgrade failed:', error);
      toast({
        title: "Upgrade Failed",
        description: error instanceof Error ? error.message : "Upgrade process failed",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const getTierButton = (tier: PricingTier) => {
    if (tier.id === 'free') {
      return (
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => navigate(user ? '/dashboard' : '/auth')}
        >
          {user ? 'Current Plan' : 'Get Started Free'}
        </Button>
      );
    }

    return (
      <Button 
        variant={tier.recommended ? 'hero' : 'default'} 
        className="w-full"
        onClick={() => handleUpgrade(tier.id)}
        disabled={processing === tier.id}
      >
        {processing === tier.id ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Processing...
          </div>
        ) : (
          `Upgrade to ${tier.name}`
        )}
      </Button>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate(user ? '/dashboard' : '/')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-2xl font-bold">ViralClips Pricing</h1>
              </div>
            </div>
            
            {user && (
              <Button variant="ghost" onClick={() => navigate('/dashboard')}>
                Dashboard
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-12">
        {/* Header Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Choose Your Plan
          </div>
          
          <h2 className="text-4xl lg:text-6xl font-bold mb-6">
            Simple, Transparent
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Pricing</span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and scale as you grow. All plans include our core AI-powered video processing features.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {pricingTiers.map((tier) => {
            const IconComponent = tier.icon;
            return (
              <Card 
                key={tier.id} 
                className={`relative overflow-hidden transition-all hover:shadow-2xl ${
                  tier.recommended ? 'ring-2 ring-primary scale-105' : ''
                } ${selectedTier === tier.id ? 'ring-2 ring-accent' : ''}`}
                onClick={() => setSelectedTier(tier.id)}
              >
                {tier.recommended && (
                  <div className="absolute top-0 left-0 right-0">
                    <div className="bg-gradient-to-r from-primary to-accent text-white text-center py-2 text-sm font-medium">
                      <Star className="w-4 h-4 inline mr-1" />
                      Most Popular
                    </div>
                  </div>
                )}
                
                <CardHeader className={tier.recommended ? 'pt-12' : 'pt-6'}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 bg-gradient-to-r ${tier.gradient} rounded-xl flex items-center justify-center`}>
                      <IconComponent className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{tier.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{tier.description}</p>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">${tier.price}</span>
                      {tier.price > 0 && <span className="text-muted-foreground">/{tier.period}</span>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {typeof tier.credits === 'number' ? `${tier.credits} clips per month` : tier.credits}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Features */}
                  <div className="space-y-3">
                    {tier.features.map((feature, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Limitations */}
                  {tier.limitations && tier.limitations.length > 0 && (
                    <div className="space-y-2 pt-4 border-t">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Limitations</p>
                      {tier.limitations.map((limitation, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <div className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0">⚠️</div>
                          <span className="text-xs text-muted-foreground">{limitation}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="pt-6">
                    {getTierButton(tier)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="mt-24 max-w-4xl mx-auto">
          <h3 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h3>
          
          <div className="grid md:grid-cols-2 gap-8">
            <Card>
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">How does the credit system work?</h4>
                <p className="text-sm text-muted-foreground">
                  Each video you process uses 1 credit. Credits reset monthly based on your plan. 
                  Unused credits don't roll over to the next month.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">What video formats are supported?</h4>
                <p className="text-sm text-muted-foreground">
                  We support YouTube URLs and direct uploads of MP4, MOV, AVI, and WebM formats. 
                  Maximum file size varies by plan.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">Can I cancel anytime?</h4>
                <p className="text-sm text-muted-foreground">
                  Yes! You can cancel your subscription at any time. You'll continue to have access 
                  until the end of your current billing period.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">Do you offer refunds?</h4>
                <p className="text-sm text-muted-foreground">
                  We offer a 14-day money-back guarantee for all paid plans. 
                  Contact support if you're not satisfied with our service.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-24 text-center">
          <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-none">
            <CardContent className="p-12">
              <h3 className="text-3xl font-bold mb-4">Ready to Go Viral?</h3>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                Join thousands of creators who are already using ViralClips to grow their audience 
                and create engaging content that gets results.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  variant="hero" 
                  size="lg"
                  onClick={() => navigate(user ? '/quick-generate' : '/auth')}
                >
                  {user ? 'Start Creating Now' : 'Get Started Free'}
                </Button>
                
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={() => navigate('/dashboard')}
                >
                  View Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
