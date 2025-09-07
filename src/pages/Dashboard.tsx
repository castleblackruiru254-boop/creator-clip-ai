import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Upload, Play, BarChart3, LogOut, User, Settings, ChevronDown, ChevronRight, Download, ExternalLink, Clock, Star, Loader2, Crown, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ProcessingProgress, ProcessingMonitor } from "@/components/video-processing/ProcessingProgress";
import { useVideoQueue, useVideoProcessor } from "@/hooks/use-video-queue";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  subscription_tier: string;
  credits_remaining: number;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  source_video_url?: string;
  source_video_duration?: number;
}

interface Clip {
  id: string;
  title: string;
  video_url: string | null;
  thumbnail_url: string | null;
  duration: number;
  platform: string | null;
  ai_score: number | null;
  status: string;
  start_time: number;
  end_time: number;
  created_at: string;
}

const Dashboard = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [projectClips, setProjectClips] = useState<{ [key: string]: Clip[] }>({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadingClips, setLoadingClips] = useState<string | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const { toast } = useToast();
  const { activeJobs } = useVideoQueue();
  const { processVideo, processing } = useVideoProcessor();

  const fetchUserData = useCallback(async () => {
    console.log('🔄 fetchUserData called with user:', user?.id);
    setLoadingData(true);
    
    try {
      console.log('📡 Fetching user profile...');
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle();

      if (profileError) {
        console.error('❌ Profile fetch error:', profileError);
        throw profileError;
      }
      
      console.log('✅ Profile data fetched:', profileData);
      setProfile(profileData);

      console.log('📡 Fetching user projects...');
      // Fetch user projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (projectsError) {
        console.error('❌ Projects fetch error:', projectsError);
        throw projectsError;
      }
      
      console.log('✅ Projects data fetched:', projectsData);
      setProjects(projectsData || []);

    } catch (error) {
      console.error('❌ Failed to fetch user data:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load user data",
        variant: "destructive",
      });
    } finally {
      console.log('✅ fetchUserData complete, setting loadingData to false');
      setLoadingData(false);
    }
  }, [user, toast]);

  const fetchProjectClips = async (projectId: string) => {
    // Check if already loading or loaded
    if (loadingClips === projectId || projectClips[projectId]) return;
    
    setLoadingClips(projectId);
    try {
      const { data: clipsData, error: clipsError } = await supabase
        .from('clips')
        .select('*')
        .eq('project_id', projectId)
        .order('ai_score', { ascending: false });

      if (clipsError) throw clipsError;
      
      setProjectClips(prev => ({
        ...prev,
        [projectId]: clipsData || []
      }));
    } catch (error) {
      console.error('Failed to fetch project clips:', error);
      toast({
        title: "Error loading clips",
        description: error instanceof Error ? error.message : "Failed to load clips",
        variant: "destructive",
      });
    } finally {
      setLoadingClips(null);
    }
  };

  useEffect(() => {
    console.log('🔄 Dashboard useEffect triggered - user:', !!user, 'loading:', loading);
    if (user && !loading) {
      console.log('🚀 Calling fetchUserData...');
      fetchUserData();
    }
  }, [user, loading, fetchUserData]);

  const toggleProjectExpansion = async (projectId: string) => {
    if (selectedProject === projectId) {
      setSelectedProject(null);
    } else {
      setSelectedProject(projectId);
      await fetchProjectClips(projectId);
    }
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getPlatformIcon = (platform: string | null) => {
    switch (platform) {
      case 'tiktok': return '📱';
      case 'youtube_shorts': return '▶️';
      case 'instagram_reels': return '📸';
      default: return '🎬';
    }
  };

  const getAIScoreColor = (score: number | null) => {
    if (!score) return 'bg-gray-100 text-gray-600';
    if (score >= 0.9) return 'bg-green-100 text-green-800';
    if (score >= 0.8) return 'bg-blue-100 text-blue-800';
    if (score >= 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: "You've been signed out successfully.",
      });
    } catch (error) {
      console.error('Sign out failed:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Sign out failed",
        variant: "destructive",
      });
    }
  };

  console.log('🔍 Dashboard render - loading:', loading, 'loadingData:', loadingData, 'user:', !!user);
  
  if (loading || loadingData) {
    console.log('⏳ Dashboard showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">ViralClips</span>
            </Link>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="capitalize bg-primary/10 text-primary px-2 py-1 rounded-full">
                  {profile?.subscription_tier}
                </span>
                <span className="text-muted-foreground">
                  {profile?.credits_remaining} credits
                </span>
              </div>
              
              {profile?.subscription_tier === 'free' && (
                <Button variant="hero" size="sm" onClick={() => navigate('/pricing')}>
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade
                </Button>
              )}
              
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}!
          </h1>
          <p className="text-muted-foreground">
            Create viral clips from your videos with AI-powered editing.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projects.length}</div>
              <p className="text-xs text-muted-foreground">
                +2 from last month
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeJobs.length}</div>
              <p className="text-xs text-muted-foreground">
                Currently processing
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Credits Remaining</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile?.credits_remaining}</div>
              <p className="text-xs text-muted-foreground">
                Resets monthly
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Subscription</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{profile?.subscription_tier}</div>
              <p className="text-xs text-muted-foreground">
                {profile?.subscription_tier === 'free' ? 'Upgrade for more features' : 'Active plan'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Active Processing Jobs */}
        {activeJobs.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Active Processing Jobs</h2>
              <Button variant="outline" onClick={() => setShowQueue(!showQueue)}>
                <Activity className="w-4 h-4 mr-2" />
                {showQueue ? 'Hide Queue' : 'Show Queue'}
              </Button>
            </div>
            {showQueue && (
              <ProcessingProgress className="mb-6" />
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
              <CardContent className="p-6 text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-primary group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Upload Video</h3>
                <p className="text-sm text-muted-foreground">
                  Upload a video to start creating clips
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => navigate('/quick-generate')}>
              <CardContent className="p-6 text-center">
                <Play className="w-12 h-12 mx-auto mb-4 text-accent group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Quick Generate</h3>
                <p className="text-sm text-muted-foreground">
                  AI-powered clip generation from YouTube videos
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => setShowQueue(true)}>
              <CardContent className="p-6 text-center">
                <Activity className="w-12 h-12 mx-auto mb-4 text-blue-500 group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Processing Queue</h3>
                <p className="text-sm text-muted-foreground">
                  Monitor video processing progress
                </p>
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
              <CardContent className="p-6 text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-success group-hover:scale-110 transition-transform" />
                <h3 className="font-semibold mb-2">Analytics</h3>
                <p className="text-sm text-muted-foreground">
                  View performance metrics
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Projects */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Projects</h2>
          {projects.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Video className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                <p className="text-muted-foreground mb-4">
                  Upload your first video to start creating viral clips!
                </p>
                <Button variant="hero" onClick={() => navigate('/quick-generate')}>
                  <Upload className="w-4 h-4 mr-2" />
                  Start Creating
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => {
                const clips = projectClips[project.id] || [];
                const isExpanded = selectedProject === project.id;
                const canExpand = project.status === 'completed';
                
                return (
                  <Card key={project.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      {/* Real-time processing monitor for active projects */}
                      {project.status === 'processing' && (
                        <ProcessingMonitor projectId={project.id} className="mb-4" />
                      )}
                      
                      {/* Project Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-lg">{project.title}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs capitalize ${
                              project.status === 'completed' 
                                ? 'bg-success/10 text-success' 
                                : project.status === 'processing'
                                ? 'bg-warning/10 text-warning'
                                : project.status === 'failed'
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {project.status}
                            </span>
                            {project.status === 'completed' && clips.length > 0 && (
                              <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs">
                                {clips.length} clips generated
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {project.description || 'No description'}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                            {project.source_video_duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDuration(project.source_video_duration)}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {project.source_video_url && (
                            <Button variant="ghost" size="sm" onClick={() => window.open(project.source_video_url, '_blank')}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Source
                            </Button>
                          )}
                          
                          {canExpand && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => toggleProjectExpansion(project.id)}
                            >
                              {loadingClips === project.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : isExpanded ? (
                                <ChevronDown className="w-4 h-4 mr-2" />
                              ) : (
                                <ChevronRight className="w-4 h-4 mr-2" />
                              )}
                              {isExpanded ? 'Hide Clips' : 'View Clips'}
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Clips Section */}
                      {isExpanded && clips.length > 0 && (
                        <div className="border-t pt-6 mt-4">
                          <h4 className="font-medium mb-4 flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-500" />
                            Generated Clips (sorted by AI score)
                          </h4>
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {clips.map((clip) => (
                              <Card key={clip.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                {clip.thumbnail_url && (
                                  <div className="relative aspect-video">
                                    <img 
                                      src={clip.thumbnail_url} 
                                      alt={clip.title}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs">
                                      {formatDuration(clip.duration)}
                                    </div>
                                    <div className="absolute top-2 left-2 flex items-center gap-1">
                                      <span className={`px-2 py-1 rounded text-xs ${getAIScoreColor(clip.ai_score)}`}>
                                        {clip.ai_score ? (clip.ai_score * 100).toFixed(0) : 'N/A'}% viral
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <CardContent className="p-4">
                                  <h5 className="font-medium text-sm line-clamp-2 mb-2">
                                    {clip.title}
                                  </h5>
                                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                                    <span className="flex items-center gap-1">
                                      <span>{getPlatformIcon(clip.platform)}</span>
                                      {clip.platform?.replace('_', ' ') || 'All platforms'}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {clip.start_time}s-{clip.end_time}s
                                    </span>
                                  </div>
                                  <div className="flex gap-2">
                                    {clip.video_url && (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="flex-1"
                                        onClick={() => window.open(clip.video_url!, '_blank')}
                                      >
                                        <Play className="w-3 h-3 mr-1" />
                                        Play
                                      </Button>
                                    )}
                                    <Button 
                                      variant="secondary" 
                                      size="sm" 
                                      className="flex-1"
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Download
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                          
                          {clips.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <Video className="w-12 h-12 mx-auto mb-2 opacity-50" />
                              <p>No clips found for this project</p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Show clips count for completed projects */}
                      {!isExpanded && project.status === 'completed' && clips.length > 0 && (
                        <div className="border-t pt-4 mt-4">
                          <div className="flex items-center justify-center text-sm text-muted-foreground">
                            <Video className="w-4 h-4 mr-2" />
                            {clips.length} clips ready • Click "View Clips" to see them
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;