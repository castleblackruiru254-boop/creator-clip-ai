import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  features: string[];
  popular?: boolean;
  current?: boolean;
}

const PlanComparison: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const mockPlans: PricingPlan[] = [
    {
      id: '1',
      name: 'Free',
      price: 0,
      currency: 'NGN',
      interval: 'month',
      description: 'Perfect for getting started',
      features: ['Basic editing', 'Limited exports', 'Community support'],
      current: true
    },
    {
      id: '2',
      name: 'Pro',
      price: 2900,
      currency: 'NGN',
      interval: 'month',
      description: 'Perfect for professionals',
      features: ['AI-powered editing', 'Unlimited exports', 'Priority support'],
      popular: true
    }
  ];

  const handleSubscribe = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to subscribe to a plan.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Coming Soon",
      description: "Subscription functionality will be available soon.",
    });
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency
    }).format(price / 100);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-4">Choose Your Plan</h2>
        <p className="text-muted-foreground">
          Select the perfect plan for your video editing needs
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {mockPlans.map((plan) => (
          <Card 
            key={plan.id}
            className={`relative ${plan.current ? 'border-primary' : ''} ${plan.popular ? 'ring-2 ring-primary' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">
                  <Star className="w-3 h-3 mr-1" />
                  Most Popular
                </Badge>
              </div>
            )}
            
            <CardHeader className="text-center pb-8">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <div className="mt-4">
                <span className="text-4xl font-bold">
                  {plan.price === 0 ? 'Free' : formatPrice(plan.price, plan.currency)}
                </span>
                {plan.price > 0 && (
                  <span className="text-muted-foreground">/{plan.interval}</span>
                )}
              </div>
              <p className="text-muted-foreground mt-2">{plan.description}</p>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="space-y-3">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
              
              <Button
                className="w-full"
                variant={plan.current ? 'secondary' : 'default'}
                onClick={handleSubscribe}
                disabled={plan.current}
              >
                {plan.current ? (
                  <>Current Plan</>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    {plan.price === 0 ? 'Get Started' : 'Upgrade Now'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PlanComparison;