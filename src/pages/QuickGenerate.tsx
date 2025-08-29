import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Video, 
  Search, 
  Play, 
  Clock, 
  Eye, 
  Calendar,
  ArrowLeft,
  Loader2,
  Wand2,
  ExternalLink,
  Filter
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  publishedAt: string;
  channelTitle: string;
  viewCount: string;
  url: string;
}

const QuickGenerate = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [searchFilters, setSearchFilters] = useState({
    publishedAfter: '',
    publishedBefore: '',
    maxResults: '25'
  });
  const [showFilters, setShowFilters] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search Required",
        description: "Please enter a search query to find videos.",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: {
          query: searchQuery,
          maxResults: parseInt(searchFilters.maxResults),
          publishedAfter: searchFilters.publishedAfter || undefined,
          publishedBefore: searchFilters.publishedBefore || undefined,
        }
      });

      if (error) throw error;

      if (data.success) {
        setSearchResults(data.videos);
        toast({
          title: "Search Complete",
          description: `Found ${data.videos.length} videos matching your search.`,
        });
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search YouTube videos.",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleVideoSelect = (video: YouTubeVideo) => {
    setSelectedVideo(video);
    if (!projectTitle) {
      setProjectTitle(`Clips from: ${video.title.substring(0, 50)}...`);
    }
    if (!projectDescription) {
      setProjectDescription(`Auto-generated clips from YouTube video: ${video.title}`);
    }
  };

  const handleProcessVideo = async () => {
    if (!selectedVideo || !projectTitle.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a video and provide a project title.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(selectedVideo.id);
    try {
      const { data, error } = await supabase.functions.invoke('process-video', {
        body: {
          title: projectTitle,
          description: projectDescription,
          videoUrl: selectedVideo.url,
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Processing Started",
          description: data.message,
        });
        
        // Navigate to dashboard after successful processing start
        navigate('/dashboard');
      } else {
        throw new Error(data.error || 'Processing failed');
      }
    } catch (error: any) {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to start video processing.",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const formatDuration = (duration: string) => {
    if (duration === 'Unknown') return duration;
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  const formatViewCount = (count: string) => {
    const num = parseInt(count);
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M views`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K views`;
    } else {
      return `${num} views`;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold">Quick Generate</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Search Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search YouTube Videos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search for videos (e.g., 'motivation speech', 'tech review', 'cooking tutorial')"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <Button 
                  variant="ghost" 
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  Search
                </Button>
              </div>

              {showFilters && (
                <div className="grid md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                  <div className="space-y-2">
                    <Label>Published After</Label>
                    <Input
                      type="date"
                      value={searchFilters.publishedAfter}
                      onChange={(e) => setSearchFilters(prev => ({ ...prev, publishedAfter: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Published Before</Label>
                    <Input
                      type="date"
                      value={searchFilters.publishedBefore}
                      onChange={(e) => setSearchFilters(prev => ({ ...prev, publishedBefore: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Results</Label>
                    <Select value={searchFilters.maxResults} onValueChange={(value) => setSearchFilters(prev => ({ ...prev, maxResults: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 videos</SelectItem>
                        <SelectItem value="25">25 videos</SelectItem>
                        <SelectItem value="50">50 videos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Search Results ({searchResults.length} videos)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {searchResults.map((video) => (
                    <Card 
                      key={video.id} 
                      className={`cursor-pointer transition-all hover:shadow-lg ${
                        selectedVideo?.id === video.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => handleVideoSelect(video)}
                    >
                      <div className="relative">
                        <img 
                          src={video.thumbnail} 
                          alt={video.title}
                          className="w-full h-48 object-cover rounded-t-lg"
                        />
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-sm flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(video.duration)}
                        </div>
                        {selectedVideo?.id === video.id && (
                          <div className="absolute top-2 left-2 bg-primary text-white px-2 py-1 rounded text-sm">
                            Selected
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-sm line-clamp-2 mb-2">
                          {video.title}
                        </h3>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Video className="w-3 h-3" />
                            {video.channelTitle}
                          </div>
                          <div className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {formatViewCount(video.viewCount)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(video.publishedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(video.url, '_blank');
                            }}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            View
                          </Button>
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVideoSelect(video);
                            }}
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Select
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project Details */}
          {selectedVideo && (
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Wand2 className="h-4 w-4" />
                  <AlertDescription>
                    Selected: <strong>{selectedVideo.title}</strong> by {selectedVideo.channelTitle}
                  </AlertDescription>
                </Alert>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="projectTitle">Project Title</Label>
                    <Input
                      id="projectTitle"
                      placeholder="Enter project title"
                      value={projectTitle}
                      onChange={(e) => setProjectTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="projectDescription">Description (Optional)</Label>
                    <Textarea
                      id="projectDescription"
                      placeholder="Enter project description"
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button 
                    onClick={handleProcessVideo}
                    disabled={processing === selectedVideo.id}
                    variant="hero"
                    size="lg"
                  >
                    {processing === selectedVideo.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    Generate Clips
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {searchResults.length === 0 && !searching && (
            <Card>
              <CardContent className="p-12 text-center">
                <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Search YouTube Videos</h3>
                <p className="text-muted-foreground mb-4">
                  Enter a search query above to find videos and generate viral clips instantly.
                </p>
                <Badge variant="secondary">
                  AI-powered video analysis and clip generation
                </Badge>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickGenerate;