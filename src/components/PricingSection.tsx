import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Check, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out ViralClips",
    features: [
      "5 video exports per month",
      "Basic AI clipping",
      "Watermarked clips",
      "Standard templates",
      "60-second ads for 3 bonus videos"
    ],
    cta: "Start Free",
    variant: "outline" as const
  },
  {
    name: "Starter",
    price: "$7",
    period: "month",
    description: "Great for individual creators",
    features: [
      "15 video exports per month",
      "Watermark-free clips",
      "Ready-made templates",
      "Basic subtitle editing",
      "Batch upload (5 videos)",
      "Priority processing",
      "1-hour source video limit"
    ],
    cta: "Start Starter Plan",
    variant: "hero" as const,
    popular: true
  },
  {
    name: "Pro",
    price: "$12",
    period: "month",
    description: "Perfect for serious creators",
    features: [
      "Unlimited exports",
      "Advanced subtitle editing",
      "Team collaboration",
      "AI script generation",
      "Premium templates",
      "Analytics dashboard",
      "Unlimited batch uploads"
    ],
    cta: "Start Pro Plan",
    variant: "accent" as const
  },
  {
    name: "Enterprise",
    price: "$29",
    period: "month",
    description: "For agencies and content houses",
    features: [
      "Everything in Pro",
      "Multiple team accounts",
      "Priority AI rendering",
      "API access",
      "Premium support",
      "Custom integrations",
      "Advanced analytics"
    ],
    cta: "Contact Sales",
    variant: "outline" as const
  }
];

const PricingSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handlePlanSelect = (plan: typeof plans[number]) => {
    if (plan.name === 'Free') {
      // Free plan - direct to auth or dashboard
      navigate(user ? '/dashboard' : '/auth');
    } else if (plan.name === 'Enterprise' || plan.cta === 'Contact Sales') {
      // Enterprise plan - scroll to contact or redirect to pricing page
      const contactSection = document.getElementById('contact');
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/pricing');
      }
    } else {
      // Paid plans - go to pricing page for detailed view
      navigate('/pricing');
    }
  };

  return (
    <section id="pricing" className="py-24">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold">
            Simple Pricing for
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Every Creator</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free and scale as you grow. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`relative hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${
                plan.popular ? 'border-primary/50 shadow-lg' : 'border-border/50'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-primary to-accent text-white px-4 py-1 rounded-full text-sm font-medium flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    Most Popular
                  </div>
                </div>
              )}
              
              <CardHeader className="text-center space-y-4 pb-8">
                <h3 className="text-2xl font-bold">{plan.name}</h3>
                <div className="space-y-1">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">/{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Button 
                  variant={plan.variant} 
                  className="w-full"
                  size="lg"
                  onClick={() => handlePlanSelect(plan)}
                >
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="text-center mt-16 space-y-4">
          <p className="text-muted-foreground">
            Need a custom plan? <a href="#contact" className="text-primary hover:underline">Contact our sales team</a>
          </p>
          <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <span>✓ No setup fees</span>
            <span>✓ Cancel anytime</span>
            <span>✓ 30-day money-back guarantee</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;