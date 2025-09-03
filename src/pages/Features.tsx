import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Wand2, 
  Scissors, 
  Type, 
  Palette, 
  Zap, 
  Share2, 
  BarChart3, 
  Globe, 
  Shield,
  Clock,
  Sparkles,
  Target
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const Features = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Wand2,
      title: "AI-Powered Clip Detection",
      description: "Advanced AI automatically identifies the most engaging moments in your long-form content"
    },
    {
      icon: Scissors,
      title: "Smart Video Editing",
      description: "Intelligent cutting and trimming with perfect timing for maximum engagement"
    },
    {
      icon: Type,
      title: "Auto Subtitles & Captions",
      description: "Generate accurate subtitles automatically with customizable styling"
    },
    {
      icon: Palette,
      title: "Brand Customization",
      description: "Add your logos, colors, and branding to maintain consistency across all clips"
    },
    {
      icon: Zap,
      title: "Lightning Fast Processing",
      description: "Get your clips ready in minutes, not hours, with our optimized AI pipeline"
    },
    {
      icon: Share2,
      title: "Multi-Platform Export",
      description: "Export in perfect formats for TikTok, YouTube Shorts, Instagram Reels, and more"
    },
    {
      icon: BarChart3,
      title: "Performance Analytics",
      description: "Track engagement metrics and optimize your content strategy with detailed insights"
    },
    {
      icon: Globe,
      title: "Multi-Language Support",
      description: "Create content in multiple languages with automatic translation and localization"
    },
    {
      icon: Shield,
      title: "Content Safety",
      description: "Built-in content moderation ensures your clips meet platform guidelines"
    },
    {
      icon: Clock,
      title: "Batch Processing",
      description: "Process multiple videos simultaneously to scale your content creation"
    },
    {
      icon: Sparkles,
      title: "Smart Thumbnails",
      description: "AI-generated thumbnails that maximize click-through rates"
    },
    {
      icon: Target,
      title: "Audience Targeting",
      description: "Optimize clips for specific demographics and interests automatically"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-muted">
      <div className="container mx-auto px-6 pt-24 pb-12">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl lg:text-6xl font-bold">
            Powerful Features for
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Content Creators</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Everything you need to transform long-form content into viral short clips, 
            powered by cutting-edge AI technology
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <Card key={index} className="hover:shadow-lg transition-all duration-300 hover:scale-105 group">
              <CardContent className="p-6">
                <feature.icon className="w-12 h-12 text-primary mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center bg-card/50 backdrop-blur rounded-3xl p-8 border">
          <h2 className="text-3xl font-bold mb-4">Ready to Experience These Features?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of creators who are already using ViralClips to grow their audience 
            and increase engagement across all platforms.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg" onClick={() => navigate('/start-creating')}>
              Start Creating Free
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate('/demo')}>
              Watch Demo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Features;