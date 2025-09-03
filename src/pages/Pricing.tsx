import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Pricing = () => {
  const navigate = useNavigate();

  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "forever",
      description: "Perfect for getting started",
      features: [
        "3 clips per month",
        "Basic AI processing",
        "Standard quality exports",
        "Watermarked videos",
        "Community support"
      ],
      cta: "Get Started Free",
      variant: "secondary" as const,
      popular: false
    },
    {
      name: "Creator",
      price: "$19",
      period: "per month",
      description: "For serious content creators",
      features: [
        "50 clips per month",
        "Advanced AI processing",
        "HD quality exports",
        "No watermarks",
        "Priority support",
        "Custom branding",
        "Analytics dashboard"
      ],
      cta: "Start Free Trial",
      variant: "hero" as const,
      popular: true
    },
    {
      name: "Pro",
      price: "$49",
      period: "per month",
      description: "For teams and agencies",
      features: [
        "200 clips per month",
        "Premium AI processing",
        "4K quality exports",
        "No watermarks",
        "Priority support",
        "Custom branding",
        "Advanced analytics",
        "Batch processing",
        "API access",
        "Team collaboration"
      ],
      cta: "Start Free Trial",
      variant: "secondary" as const,
      popular: false
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-muted">
      <div className="container mx-auto px-6 pt-24 pb-12">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl lg:text-6xl font-bold">
            Simple, Transparent
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Pricing</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the perfect plan for your content creation needs. 
            All plans include our core AI-powered features.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          {plans.map((plan, index) => (
            <Card key={index} className={`relative hover:shadow-lg transition-all duration-300 hover:scale-105 ${plan.popular ? 'border-primary shadow-lg' : ''}`}>
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-white">
                  <Star className="w-3 h-3 mr-1" />
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                  <p className="text-muted-foreground">{plan.description}</p>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  variant={plan.variant} 
                  className="w-full" 
                  size="lg"
                  onClick={() => navigate('/auth')}
                >
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center space-y-8">
          <div className="bg-card/50 backdrop-blur rounded-3xl p-8 border max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Enterprise Solutions</h2>
            <p className="text-muted-foreground mb-6">
              Need more than 200 clips per month? Custom integrations? Dedicated support?
            </p>
            <Button variant="outline" size="lg" onClick={() => navigate('/contact')}>
              Contact Sales
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-8 justify-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              30-day money-back guarantee
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              Cancel anytime
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-primary" />
              No setup fees
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;