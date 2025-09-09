import { useState, useEffect } from "react";
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
  Filter,
  Link as LinkIcon,
  CheckCircle2,
  Scissors,
  Download,
  Upload,
  Target
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSchema, ProjectSchema, YouTubeUrlSchema, validateAndSanitize } from "@/lib/validation";
import { useVideoQueue, useQueueManagement } from "@/hooks/use-video-queue";
import { validateVideoFile, getProcessingEstimate, isValidVideoUrl } from "@/lib/video-validation";
import { ProcessingMonitor } from "@/components/video-processing/ProcessingProgress";
import FileUpload from "@/components/upload/FileUpload";
import UsageRestrictions from "@/components/restrictions/UsageRestrictions";
import SubjectTrackingConfig from "@/components/tracking/SubjectTrackingConfig";
import { restrictionsService } from "@/lib/freemium-restrictions";
import { SubjectTrackingOptions, DEFAULT_TRACKING_OPTIONS } from "@/lib/subject-tracking";

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

interface Highlight {
  id: string;
  startTime: number;
  endTime: number;
  confidence: number;
  type: string;
  description: string;
  suggestedTitle: string;
  aiScore: number;
  keywords: string[];
  platform: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'all';
}

interface GeneratedClip {
  id: string;
  title: string;
  duration: number;
  platform: string;
  aiScore: number;
  startTime: number;
  endTime: number;
  videoUrl: string;
  thumbnailUrl: string;
  status: string;
}

interface ProcessedVideo extends YouTubeVideo {
  durationSeconds: number;
  highlights: Highlight[];
}

const QuickGenerate = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addJob } = useQueueManagement();
  const { activeJobs } = useVideoQueue();
  const queueProcessing = activeJobs.length > 0;
  
  // Search tab state
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
  
  // URL upload tab state
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [processingUrl, setProcessingUrl] = useState(false);
  const [analyzedVideo, setAnalyzedVideo] = useState<ProcessedVideo | null>(null);
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);
  const [generatingClips, setGeneratingClips] = useState(false);
  const [generatedClips, setGeneratedClips] = useState<GeneratedClip[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<Array<{url: string, name: string, size: number}>>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  
  // Restrictions and tracking state
  const [userLimits, setUserLimits] = useState<any>(null);
  const [userUsage, setUserUsage] = useState<any>(null);
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const [trackingConfig, setTrackingConfig] = useState<SubjectTrackingOptions>(DEFAULT_TRACKING_OPTIONS);
  const [restrictionsLoading, setRestrictionsLoading] = useState(true);
  
  useEffect(() => {
    if (user) {
      loadUserRestrictionsAndUsage();
    }
  }, [user]);
  
  const loadUserRestrictionsAndUsage = async () => {
    if (!user) return;
    
    try {
      setRestrictionsLoading(true);
      const { subscription, limits, usage } = await restrictionsService.getUserLimitsAndUsage(user.id);
      
      setUserSubscription(subscription);
      setUserLimits(limits);
      setUserUsage(usage);
    } catch (error) {
      console.error('Failed to load user restrictions:', error);
    } finally {
      setRestrictionsLoading(false);
    }
  };

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
    try {
      // Validate search parameters
      const validatedSearch = validateAndSanitize(SearchSchema, {
        query: searchQuery,
        maxResults: parseInt(searchFilters.maxResults),
        publishedAfter: searchFilters.publishedAfter || undefined,
        publishedBefore: searchFilters.publishedBefore || undefined,
      });

      setSearching(true);
      
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: validatedSearch,
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to search YouTube videos.';
      toast({
        title: "Search Failed",
        description: errorMessage,
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
    if (!selectedVideo) {
      toast({
        title: "No Video Selected",
        description: "Please select a video first.",
        variant: "destructive",
      });
      return;
    }

    // Validate YouTube URL
    if (!isValidVideoUrl(selectedVideo.url)) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid YouTube URL.",
        variant: "destructive",
      });
      return;
    }

    if (!projectTitle.trim()) {
      toast({
        title: "Project Title Required",
        description: "Please enter a project title.",
        variant: "destructive",
      });
      return;
    }

    try {
      setProcessing(selectedVideo.id);
      
      // Add job to the processing queue
      const job = await addJob({
        type: 'video_processing',
        priority: 'normal',
        payload: {
          videoUrl: selectedVideo.url,
          projectTitle,
          clipCount: 5,
          clipDuration: 60,
        },
      });

      if (job) {
        toast({
          title: "Processing Started",
          description: "Your video has been added to the processing queue. You'll be notified when clips are ready!",
        });
        
        // Navigate to dashboard to show progress
        navigate('/dashboard');
      } else {
        throw new Error('Failed to add job to the processing queue');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start video processing.';
      toast({
        title: "Processing Failed",
        description: errorMessage,
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

  // URL upload functions
  const handleUrlAnalysis = async () => {
    try {
      // Validate YouTube URL
      if (!isValidVideoUrl(youtubeUrl)) {
        toast({
          title: "Invalid URL",
          description: "Please provide a valid YouTube URL.",
          variant: "destructive",
        });
        return;
      }

      setProcessingUrl(true);
      setAnalyzedVideo(null);
      setSelectedHighlights([]);
      setGeneratedClips([]);

      // Use the process-youtube-url function to get video metadata and highlights
      const { data, error } = await supabase.functions.invoke('process-youtube-url', {
        body: {
          videoUrl: youtubeUrl,
        },
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;

      if (data.success && data.video && data.highlights) {
        // Use the response from process-youtube-url function
        const videoData = data.video;
        const highlights = data.highlights;
        
        // Create analyzed video data
        const analyzedVideoData: ProcessedVideo = {
          id: videoData.id,
          title: videoData.title,
          description: videoData.description,
          thumbnail: videoData.thumbnail,
          duration: videoData.duration,
          publishedAt: videoData.publishedAt,
          channelTitle: videoData.channelTitle,
          viewCount: videoData.viewCount,
          url: videoData.url,
          durationSeconds: videoData.durationSeconds,
          highlights: highlights
        };
        
        setAnalyzedVideo(analyzedVideoData);
        
        // Auto-set project title if not set
        if (!projectTitle) {
          setProjectTitle(`Clips from: ${analyzedVideoData.title.substring(0, 50)}...`);
        }
        if (!projectDescription) {
          setProjectDescription(`AI-generated clips from: ${analyzedVideoData.title}`);
        }

        toast({
          title: "Analysis Complete",
          description: `Found ${highlights.length} viral moments in "${analyzedVideoData.title}"!`,
        });
      } else {
        throw new Error(data.error || 'Failed to analyze video');
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to analyze YouTube video.';
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setProcessingUrl(false);
    }
  };

  // Helper function to parse duration to seconds
  const parseDurationToSeconds = (duration: string): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 330; // Default 5.5 minutes
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    return hours * 3600 + minutes * 60 + seconds;
  };

  // Generate smart highlights based on video metadata
  const generateSmartHighlights = (videoData: YouTubeVideo): Highlight[] => {
    const title = videoData.title.toLowerCase();
    const duration = parseDurationToSeconds(videoData.duration);
    
    // Generate contextual highlights based on video title and type
    const highlights: Highlight[] = [];
    
    if (title.includes('tutorial') || title.includes('how to') || title.includes('guide')) {
      highlights.push(
        {
          id: "tutorial_hook",
          startTime: 5,
          endTime: 35,
          confidence: 0.9,
          type: "hook",
          description: "Tutorial introduction and problem setup",
          suggestedTitle: "🎯 This Tutorial Will Change Everything!",
          aiScore: 0.88,
          keywords: ["tutorial", "guide", "learn"],
          platform: "youtube_shorts"
        },
        {
          id: "tutorial_solution",
          startTime: Math.floor(duration * 0.3),
          endTime: Math.floor(duration * 0.3) + 30,
          confidence: 0.85,
          type: "educational",
          description: "Key solution reveal moment",
          suggestedTitle: "💡 The Secret Step Nobody Talks About!",
          aiScore: 0.91,
          keywords: ["secret", "solution", "reveal"],
          platform: "all"
        }
      );
    } else if (title.includes('review') || title.includes('test') || title.includes('vs')) {
      highlights.push(
        {
          id: "review_results",
          startTime: Math.floor(duration * 0.2),
          endTime: Math.floor(duration * 0.2) + 30,
          confidence: 0.87,
          type: "surprising",
          description: "Shocking test results revealed",
          suggestedTitle: "😱 The Results Will SHOCK You!",
          aiScore: 0.89,
          keywords: ["shocking", "results", "unexpected"],
          platform: "all"
        },
        {
          id: "review_verdict",
          startTime: Math.floor(duration * 0.7),
          endTime: Math.floor(duration * 0.7) + 25,
          confidence: 0.82,
          type: "dramatic",
          description: "Final verdict and conclusion",
          suggestedTitle: "🔥 My Final Verdict Is INSANE!",
          aiScore: 0.84,
          keywords: ["verdict", "conclusion", "final"],
          platform: "tiktok"
        }
      );
    } else if (title.includes('reaction')) {
      highlights.push(
        {
          id: "reaction_peak",
          startTime: Math.floor(duration * 0.4),
          endTime: Math.floor(duration * 0.4) + 20,
          confidence: 0.92,
          type: "emotional",
          description: "Peak emotional reaction moment",
          suggestedTitle: "😲 I Can't Believe My Eyes!",
          aiScore: 0.93,
          keywords: ["reaction", "shocked", "emotional"],
          platform: "tiktok"
        }
      );
    }
    
    // Add generic highlights if we don't have specific ones or need more
    const needMoreHighlights = highlights.length < 3;
    if (needMoreHighlights) {
      const remainingCount = 5 - highlights.length;
      const spacing = Math.floor(duration / (remainingCount + 1));
      
      for (let i = 0; i < remainingCount; i++) {
        const startTime = spacing * (i + 1);
        const endTime = Math.min(startTime + 30, duration - 5);
        
        if (endTime - startTime >= 15) {
          highlights.push({
            id: `generic_${i + 1}`,
            startTime,
            endTime,
            confidence: 0.75,
            type: ['hook', 'educational', 'emotional', 'funny', 'dramatic'][i % 5],
            description: `Engaging moment at ${Math.floor(startTime/60)}:${String(startTime%60).padStart(2, '0')}`,
            suggestedTitle: [
              "🚀 This Moment Is FIRE!",
              "⚡ Pure Gold Content!",
              "🎯 Viral Moment Alert!",
              "💯 This Part Hits Different!",
              "🔥 Peak Engagement Zone!"
            ][i % 5],
            aiScore: 0.8 - (i * 0.02),
            keywords: ["viral", "engaging", "trending"],
            platform: "all"
          });
        }
      }
    }
    
    return highlights.sort((a, b) => b.aiScore - a.aiScore).slice(0, 5);
  };

  const handleHighlightToggle = (highlightId: string) => {
    setSelectedHighlights(prev => {
      if (prev.includes(highlightId)) {
        return prev.filter(id => id !== highlightId);
      } else {
        return [...prev, highlightId];
      }
    });
  };

  const handleGenerateClips = async () => {
    if (!analyzedVideo || selectedHighlights.length === 0) {
      toast({
        title: "No Highlights Selected",
        description: "Please select at least one highlight to generate clips.",
        variant: "destructive",
      });
      return;
    }

    if (!projectTitle.trim()) {
      toast({
        title: "Project Title Required",
        description: "Please enter a project title.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingClips(true);
    try {
      // Add job to the processing queue with selected highlights
      const job = await addJob({
        type: 'video_processing',
        priority: 'normal',
        payload: {
          videoUrl: analyzedVideo.url,
          projectTitle,
          clipCount: selectedHighlights.length,
          clipDuration: 60,
          highlights: selectedHighlights,
        },
      });

      if (job) {
        toast({
          title: "Processing Started",
          description: `Your video has been queued for processing. ${selectedHighlights.length} clips will be generated!`,
        });
        
        // Navigate to dashboard to show progress
        navigate('/dashboard');
      } else {
        throw new Error('Failed to add job to the processing queue');
      }
    } catch (error) {
      console.error('Clip generation failed:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate clips.",
        variant: "destructive",
      });
    } finally {
      setGeneratingClips(false);
    }
  };

  // Handle local file processing
  const handleProcessLocalFile = async () => {
    if (!selectedFileUrl || !projectTitle.trim()) {
      toast({
        title: "Missing Information",
        description: "Please upload a file and enter a project title.",
        variant: "destructive",
      });
      return;
    }

    // Check usage restrictions before processing
    if (userLimits && userUsage) {
      const canProcess = await restrictionsService.checkUsageLimits(
        user!.id,
        userSubscription?.tier || 'free',
        { type: 'daily_clips', count: 1 }
      );
      
      if (!canProcess.allowed) {
        toast({
          title: "Usage Limit Reached",
          description: canProcess.message,
          variant: "destructive",
        });
        return;
      }
    }

    setGeneratingClips(true);
    try {
      // Call the enhanced process-video Edge Function
      const { data, error } = await supabase.functions.invoke('process-video', {
        body: {
          videoUrl: selectedFileUrl,
          projectTitle,
          projectDescription,
          subjectTracking: trackingConfig,
          isLocalFile: true,
          fileName: uploadedFiles[0]?.name
        },
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Processing Started",
          description: "Your video file has been queued for processing with subject tracking enabled!",
        });
        
        // Refresh usage stats
        await loadUserRestrictionsAndUsage();
        
        // Navigate to dashboard to show progress
        navigate('/dashboard');
      } else {
        throw new Error(data.error || 'Failed to start processing');
      }
    } catch (error) {
      console.error('File processing failed:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process video file.",
        variant: "destructive",
      });
    } finally {
      setGeneratingClips(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPlatformBadgeColor = (platform: string) => {
    switch (platform) {
      case 'tiktok': return 'bg-pink-500';
      case 'youtube_shorts': return 'bg-red-500';
      case 'instagram_reels': return 'bg-purple-500';
      default: return 'bg-blue-500';
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
          {/* Usage Restrictions Bar */}
          {userLimits && userUsage && !restrictionsLoading && (
            <UsageRestrictions 
              subscription={userSubscription}
              limits={userLimits}
              usage={userUsage}
              onUpgrade={() => navigate('/billing')}
            />
          )}
          
          <Tabs defaultValue="url" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="url" className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Upload by URL
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Search Videos
              </TabsTrigger>
              <TabsTrigger value="file" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload File
              </TabsTrigger>
            </TabsList>

            {/* File Upload Tab */}
            <TabsContent value="file" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Upload Video File
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FileUpload
                    onFilesUploaded={(files) => {
                      setUploadedFiles(files);
                      if (files.length > 0) {
                        setSelectedFileUrl(files[0].url);
                        if (!projectTitle) {
                          setProjectTitle(`Clips from: ${files[0].name}`);
                        }
                      }
                    }}
                    onUploadError={(error) => {
                      toast({
                        title: "Upload Failed",
                        description: error,
                        variant: "destructive"
                      });
                    }}
                    maxSize={2 * 1024 * 1024 * 1024} // 2GB limit
                    acceptedTypes={[".mp4", ".mov", ".avi", ".mkv", ".webm"]}
                  />
                </CardContent>
              </Card>

              {/* Subject Tracking Configuration */}
              {uploadedFiles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Subject Tracking
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SubjectTrackingConfig
                      config={trackingConfig}
                      onConfigChange={setTrackingConfig}
                      subscription={userSubscription}
                      disabled={!selectedFileUrl}
                    />
                  </CardContent>
                </Card>
              )}

              {/* File Processing */}
              {uploadedFiles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Process Uploaded File</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        File uploaded: <strong>{uploadedFiles[0].name}</strong> ({(uploadedFiles[0].size / 1024 / 1024).toFixed(1)} MB)
                      </AlertDescription>
                    </Alert>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fileProjectTitle">Project Title</Label>
                        <Input
                          id="fileProjectTitle"
                          placeholder="Enter project title"
                          value={projectTitle}
                          onChange={(e) => setProjectTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fileProjectDescription">Description (Optional)</Label>
                        <Textarea
                          id="fileProjectDescription"
                          placeholder="Enter project description"
                          value={projectDescription}
                          onChange={(e) => setProjectDescription(e.target.value)}
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button 
                        onClick={() => handleProcessLocalFile()}
                        disabled={!selectedFileUrl || generatingClips}
                        variant="hero"
                        size="lg"
                      >
                        {generatingClips ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4 mr-2" />
                        )}
                        Process Video File
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* File Upload Empty State */}
              {uploadedFiles.length === 0 && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Upload className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Upload Video File</h3>
                    <p className="text-muted-foreground mb-4">
                      Drag and drop your video file or click to browse. Supports MP4, MOV, AVI, MKV, and WebM formats.
                    </p>
                    <div className="flex justify-center gap-2">
                      <Badge variant="secondary">Smart Tracking</Badge>
                      <Badge variant="secondary">Face Detection</Badge>
                      <Badge variant="secondary">Auto Cropping</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* URL Upload Tab */}
            <TabsContent value="url" className="space-y-6">
              {/* URL Input Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LinkIcon className="w-5 h-5" />
                    Paste YouTube URL
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Input
                        placeholder="https://www.youtube.com/watch?v=example"
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleUrlAnalysis()}
                      />
                    </div>
                    <Button onClick={handleUrlAnalysis} disabled={processingUrl}>
                      {processingUrl ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4 mr-2" />
                      )}
                      Analyze Video
                    </Button>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    Paste any YouTube URL and our AI will analyze it to find the best viral moments for TikTok, YouTube Shorts, and Instagram Reels.
                  </p>
                </CardContent>
              </Card>

              {/* Video Analysis Results */}
              {analyzedVideo && (
                <Card>
                  <CardHeader>
                    <CardTitle>Video Analysis Complete</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Video Info */}
                    <div className="flex gap-4">
                      <img 
                        src={analyzedVideo.thumbnail} 
                        alt={analyzedVideo.title}
                        className="w-32 h-24 object-cover rounded-lg"
                      />
                      <div className="flex-1 space-y-2">
                        <h3 className="font-semibold text-lg line-clamp-2">{analyzedVideo.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Video className="w-4 h-4" />
                            {analyzedVideo.channelTitle}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDuration(analyzedVideo.duration)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Eye className="w-4 h-4" />
                            {formatViewCount(analyzedVideo.viewCount)}
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => window.open(analyzedVideo.url, '_blank')}
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Watch Original
                        </Button>
                      </div>
                    </div>

                    {/* AI Highlights */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold">AI-Detected Viral Moments ({analyzedVideo.highlights.length})</h4>
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          Select clips to generate
                        </Badge>
                      </div>
                      
                      <div className="grid gap-4">
                        {analyzedVideo.highlights.map((highlight) => (
                          <Card 
                            key={highlight.id} 
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              selectedHighlights.includes(highlight.id) ? 'ring-2 ring-primary bg-primary/5' : ''
                            }`}
                            onClick={() => handleHighlightToggle(highlight.id)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <Checkbox 
                                  checked={selectedHighlights.includes(highlight.id)}
                                  onChange={() => handleHighlightToggle(highlight.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                
                                <div className="flex-1 space-y-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <h5 className="font-semibold">{highlight.suggestedTitle}</h5>
                                      <p className="text-sm text-muted-foreground mt-1">{highlight.description}</p>
                                    </div>
                                    <div className="text-right space-y-1">
                                      <Badge className={`${getPlatformBadgeColor(highlight.platform)} text-white`}>
                                        {highlight.platform.replace('_', ' ').toUpperCase()}
                                      </Badge>
                                      <div className="text-sm font-mono text-muted-foreground">
                                        {formatTime(highlight.startTime)} - {formatTime(highlight.endTime)}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-1">
                                      <Scissors className="w-4 h-4" />
                                      {highlight.endTime - highlight.startTime}s clip
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Wand2 className="w-4 h-4" />
                                      {(highlight.aiScore * 100).toFixed(0)}% viral score
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {highlight.type}
                                    </Badge>
                                  </div>
                                  
                                  {highlight.keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {highlight.keywords.slice(0, 3).map((keyword, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">
                                          {keyword}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Project Configuration */}
                    {selectedHighlights.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Project Configuration</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <Alert>
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertDescription>
                              {selectedHighlights.length} highlight{selectedHighlights.length !== 1 ? 's' : ''} selected for clip generation
                            </AlertDescription>
                          </Alert>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="urlProjectTitle">Project Title</Label>
                              <Input
                                id="urlProjectTitle"
                                placeholder="Enter project title"
                                value={projectTitle}
                                onChange={(e) => setProjectTitle(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="urlProjectDescription">Description (Optional)</Label>
                              <Textarea
                                id="urlProjectDescription"
                                placeholder="Enter project description"
                                value={projectDescription}
                                onChange={(e) => setProjectDescription(e.target.value)}
                                rows={3}
                              />
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <Button 
                              onClick={handleGenerateClips}
                              disabled={generatingClips}
                              variant="hero"
                              size="lg"
                            >
                              {generatingClips ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Scissors className="w-4 h-4 mr-2" />
                              )}
                              Generate {selectedHighlights.length} Clip{selectedHighlights.length !== 1 ? 's' : ''}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Generated Clips */}
                    {generatedClips.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            Generated Clips ({generatedClips.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {generatedClips.map((clip) => (
                              <Card key={clip.id} className="overflow-hidden">
                                <div className="relative">
                                  <img 
                                    src={clip.thumbnailUrl} 
                                    alt={clip.title}
                                    className="w-full h-32 object-cover"
                                  />
                                  <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs">
                                    {formatTime(clip.duration)}
                                  </div>
                                  <div className="absolute top-2 left-2">
                                    <Badge className={`${getPlatformBadgeColor(clip.platform)} text-white text-xs`}>
                                      {clip.platform.replace('_', ' ')}
                                    </Badge>
                                  </div>
                                </div>
                                <CardContent className="p-3">
                                  <h6 className="font-medium text-sm line-clamp-2 mb-2">{clip.title}</h6>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                                    <span>{formatTime(clip.startTime)} - {formatTime(clip.endTime)}</span>
                                    <span>{(clip.aiScore * 100).toFixed(0)}% score</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      className="flex-1"
                                      onClick={() => window.open(clip.videoUrl, '_blank')}
                                    >
                                      <Play className="w-3 h-3 mr-1" />
                                      Preview
                                    </Button>
                                    <Button 
                                      variant="secondary" 
                                      size="sm"
                                      onClick={() => {
                                        toast({
                                          title: "Download Ready",
                                          description: "Clip download will be available soon!",
                                        });
                                      }}
                                    >
                                      <Download className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                          
                          <div className="mt-6 flex justify-center">
                            <Button onClick={() => navigate('/dashboard')} variant="outline">
                              View All Projects in Dashboard
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Search Tab */}
            <TabsContent value="search" className="space-y-6">
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

              {/* Project Details for Search */}
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

              {/* Empty State for Search */}
              {searchResults.length === 0 && !searching && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
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
              {/* Empty State for URL Tab */}
              {!analyzedVideo && !processingUrl && (
                <Card>
                  <CardContent className="p-12 text-center">
                    <LinkIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Paste YouTube URL</h3>
                    <p className="text-muted-foreground mb-4">
                      Enter any YouTube video URL above and our AI will find the best viral moments automatically.
                    </p>
                    <div className="flex justify-center gap-2">
                      <Badge variant="secondary">AI Analysis</Badge>
                      <Badge variant="secondary">Viral Moment Detection</Badge>
                      <Badge variant="secondary">Custom Clips</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default QuickGenerate;