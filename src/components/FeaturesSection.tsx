import { Card, CardContent } from "@/components/ui/card";
import { Wand2, Scissors, MessageSquare, BarChart3, Users, Zap } from "lucide-react";

const features = [
  {
    icon: Wand2,
    title: "AI Highlight Detection",
    description: "Our AI automatically finds the most engaging moments in your videos using advanced sentiment analysis and trend detection."
  },
  {
    icon: Scissors,
    title: "Smart Video Editing",
    description: "Cut, trim, and resize videos automatically. Optimize for TikTok, YouTube Shorts, and Instagram Reels formats."
  },
  {
    icon: MessageSquare,
    title: "Auto Subtitles & Captions",
    description: "Generate accurate subtitles and captions using AI. Edit with our timeline-based WYSIWYG editor."
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description: "Track engagement predictions and performance metrics to optimize your content strategy."
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Work together with your team. Share projects, assign roles, and collaborate in real-time."
  },
  {
    icon: Zap,
    title: "Batch Processing",
    description: "Upload and process multiple videos simultaneously. Save hours with our bulk editing features."
  }
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 bg-muted/30">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold">
            Powerful Features for
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Content Creators</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to turn your long-form content into viral short clips that engage your audience.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50 hover:border-primary/20"
            >
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;