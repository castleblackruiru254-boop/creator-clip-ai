import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Youtube, ArrowLeft, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ImportFromUrl = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a valid YouTube URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    console.log('Starting import process for URL:', url);
    
    try {
      // Get the current session for authorization
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('Session check:', { session: !!session, error: sessionError });
      
      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        toast({
          title: "Authentication Error",
          description: "Please sign in to continue",
          variant: "destructive",
        });
        navigate('/auth');
        return;
      }

      console.log('Calling process-video function...');
      
      // Call the process-video Edge Function
      const { data, error } = await supabase.functions.invoke('process-video', {
        body: {
          title: projectTitle || 'Imported Video',
          description: projectDescription || '',
          videoUrl: url.trim()
        }
      });

      console.log('Function response:', { data, error });

      if (error) {
        console.error('Function error:', error);
        throw new Error(error.message || 'Failed to process video');
      }

      toast({
        title: "Import Started",
        description: `Video processing started. ${data?.projectId ? `Project ID: ${data.projectId}` : ''} ${data?.estimatedTime ? `Estimated time: ${data.estimatedTime}` : ''}`,
      });
      
      // Navigate to dashboard to see the processing project
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import video. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-muted">
      <div className="container mx-auto px-6 pt-24 pb-12">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/start-creating')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>

          <div className="text-center space-y-4 mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
              <Youtube className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold">
              Import from YouTube
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Paste a YouTube URL and we'll automatically extract the best moments for viral clips
            </p>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Video Import
              </CardTitle>
              <CardDescription>
                Enter the YouTube video URL and customize your project settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="url">YouTube URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Project Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="Enter a title for your project"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Project Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what kind of clips you want to generate..."
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleImport}
                disabled={isLoading || !url.trim()}
                className="w-full"
                size="lg"
              >
                {isLoading ? "Processing..." : "Import & Generate Clips"}
              </Button>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Supported: YouTube videos between 2-60 minutes in length
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportFromUrl;