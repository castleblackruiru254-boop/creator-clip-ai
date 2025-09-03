import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Youtube, FileVideo, Wand2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const StartCreating = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleGetStarted = () => {
    if (user) {
      navigate('/quick-generate');
    } else {
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-muted">
      <div className="container mx-auto px-6 pt-24 pb-12">
        <div className="text-center space-y-6 mb-12">
          <h1 className="text-4xl lg:text-6xl font-bold">
            Start Creating 
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Amazing Clips</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose your preferred method to create viral short-form content with AI
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-12">
          <Card className="hover:shadow-lg transition-all duration-300 hover:scale-105">
            <CardHeader className="text-center">
              <Upload className="w-12 h-12 mx-auto mb-4 text-primary" />
              <CardTitle>Upload Video</CardTitle>
              <CardDescription>
                Upload your long-form video and let AI extract the best moments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={handleGetStarted}>
                Upload & Create
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-all duration-300 hover:scale-105">
            <CardHeader className="text-center">
              <Youtube className="w-12 h-12 mx-auto mb-4 text-primary" />
              <CardTitle>YouTube URL</CardTitle>
              <CardDescription>
                Paste a YouTube URL and we'll create clips from the video
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={handleGetStarted}>
                Import from YouTube
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-all duration-300 hover:scale-105">
            <CardHeader className="text-center">
              <FileVideo className="w-12 h-12 mx-auto mb-4 text-primary" />
              <CardTitle>Record Live</CardTitle>
              <CardDescription>
                Record directly in your browser and create clips instantly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={handleGetStarted}>
                Start Recording
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Wand2 className="w-4 h-4" />
            AI-Powered Processing
          </div>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Our advanced AI analyzes your content to find the most engaging moments, 
            add perfect timing, and optimize for each platform automatically.
          </p>
          <Button variant="hero" size="lg" onClick={handleGetStarted}>
            Get Started Free
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StartCreating;