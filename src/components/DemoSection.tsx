import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Video, ArrowRight, Clock, Star, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const DemoSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleTryDemo = () => {
    navigate(user ? '/quick-generate' : '/auth');
  };

  return (
    <section id="demo" className="py-24 bg-gradient-to-br from-background to-muted/30">
      <div className="container mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold">
            See ViralClips in
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Action</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Watch how our AI transforms a 10-minute tutorial into multiple viral clips in under 60 seconds.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Demo Video Placeholder */}
          <Card className="overflow-hidden bg-gradient-to-br from-card to-muted/50">
            <CardContent className="p-0">
              <div className="relative aspect-video bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                {/* Mock video player */}
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-white/90 rounded-full flex items-center justify-center mx-auto shadow-lg hover:scale-110 transition-transform cursor-pointer">
                    <Play className="w-8 h-8 text-primary ml-1" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-foreground">Interactive Demo</h3>
                    <p className="text-muted-foreground">3 minutes • See the full process</p>
                  </div>
                </div>
                
                {/* Demo progress indicators */}
                <div className="absolute bottom-4 left-4 flex gap-2">
                  <div className="bg-white/90 px-2 py-1 rounded text-xs font-medium">
                    <Clock className="w-3 h-3 inline mr-1" />
                    Real-time processing
                  </div>
                </div>
                
                <div className="absolute top-4 right-4 flex gap-2">
                  <div className="bg-white/90 px-2 py-1 rounded text-xs font-medium">
                    <Star className="w-3 h-3 inline mr-1 text-yellow-500" />
                    AI Score: 92%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Demo Steps */}
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto">
                  <Video className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">1. Upload or Search</h4>
                  <p className="text-sm text-muted-foreground">
                    Upload your video or search YouTube for content to transform
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mx-auto">
                  <Star className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">2. AI Analysis</h4>
                  <p className="text-sm text-muted-foreground">
                    Our AI identifies viral moments and creates engaging clips automatically
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="text-center hover:shadow-lg transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-600 rounded-xl flex items-center justify-center mx-auto">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">3. Download & Share</h4>
                  <p className="text-sm text-muted-foreground">
                    Export optimized clips for each platform and start going viral
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <Button 
              variant="hero" 
              size="lg" 
              onClick={handleTryDemo}
              className="group"
            >
              <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
              {user ? 'Try It Now' : 'Try Demo Free'}
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <p className="text-sm text-muted-foreground mt-3">
              No credit card required • Takes less than 2 minutes
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DemoSection;
