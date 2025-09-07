import { Button } from "@/components/ui/button";
import { Play, Video, Wand2 } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const HeroSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    if (user) {
      navigate('/quick-generate');
    } else {
      navigate('/auth');
    }
  };

  const handleWatchDemo = () => {
    // Scroll to demo section or show demo modal
    const demoSection = document.getElementById('demo');
    if (demoSection) {
      demoSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      // If no demo section, navigate to quick generate for demo
      navigate('/quick-generate');
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-card to-muted">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.02]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
              <Wand2 className="w-4 h-4" />
              AI-Powered Video Creation
            </div>
            
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-7xl font-bold leading-tight">
                Turn Long Videos Into
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Viral Clips</span>
              </h1>
              
              <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
                Create engaging short-form content for TikTok, YouTube Shorts, and Instagram Reels with our AI-powered video editing platform.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="hero" size="lg" className="group" onClick={handleGetStarted}>
                <Video className="w-5 h-5 mr-2 transition-transform group-hover:scale-110" />
                {user ? 'Start Creating' : 'Start Creating Free'}
              </Button>
              
              <Button variant="secondary" size="lg" className="group" onClick={handleWatchDemo}>
                <Play className="w-5 h-5 mr-2 transition-transform group-hover:scale-110" />
                Watch Demo
              </Button>
            </div>
            
            <div className="flex items-center gap-8 pt-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">10M+</div>
                <div className="text-sm text-muted-foreground">Clips Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">50K+</div>
                <div className="text-sm text-muted-foreground">Happy Creators</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">95%</div>
                <div className="text-sm text-muted-foreground">Time Saved</div>
              </div>
            </div>
          </div>
          
          {/* Hero Image */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-3xl blur-2xl" />
            <img 
              src={heroImage} 
              alt="ViralClips AI Video Editor" 
              className="relative rounded-3xl shadow-2xl w-full max-w-2xl mx-auto"
            />
            
            {/* Floating Elements */}
            <div className="absolute -top-4 -left-4 bg-card rounded-2xl p-4 shadow-lg border animate-bounce" style={{ animationDelay: '0.5s' }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-success rounded-full animate-pulse" />
                <span className="text-sm font-medium">AI Processing</span>
              </div>
            </div>
            
            <div className="absolute -bottom-4 -right-4 bg-card rounded-2xl p-4 shadow-lg border animate-bounce" style={{ animationDelay: '1s' }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                <span className="text-sm font-medium">Clips Ready!</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;