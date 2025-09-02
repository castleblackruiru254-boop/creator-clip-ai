import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Upload, Play, BarChart3, LogOut, User, Settings, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  user_id: string;
}

interface Clip {
  id: string;
  project_id: string;
  title: string;
  status: string;
  created_at: string;
}

const Dashboard = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchUserData();
      setupRealtimeSubscriptions();
    }
  }, [user]);

  const fetchUserData = async () => {
    try {
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      // Fetch user projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Fetch user clips
      const { data: clipsData, error: clipsError } = await supabase
        .from('clips')
        .select(`
          id,
          project_id,
          title,
          status,
          created_at,
          projects!inner(user_id)
        `)
        .eq('projects.user_id', user!.id)
        .order('created_at', { ascending: false });

      if (clipsError) throw clipsError;
      setClips(clipsData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to profile changes
    const profileChannel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user!.id}`
        },
        (payload) => setProfile(payload.new as Profile)
      )
      .subscribe();

    // Subscribe to project changes
    const projectsChannel = supabase
      .channel('project-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          filter: `user_id=eq.${user!.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setProjects(prev => [payload.new as Project, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setProjects(prev => 
              prev.map(p => p.id === payload.new.id ? payload.new as Project : p)
            );
          } else if (payload.eventType === 'DELETE') {
            setProjects(prev => prev.filter(p => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to clip changes
    const clipsChannel = supabase
      .channel('clip-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clips'
        },
        async (payload) => {
          // Check if this clip belongs to user's project
          const projectId = (payload.new as any)?.project_id || (payload.old as any)?.project_id;
          if (!projectId) return;

          const { data: projectData } = await supabase
            .from('projects')
            .select('user_id')
            .eq('id', projectId)
            .single();

          if (projectData?.user_id === user!.id) {
            if (payload.eventType === 'INSERT') {
              setClips(prev => [payload.new as Clip, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setClips(prev => 
                prev.map(c => c.id === (payload.new as any).id ? payload.new as Clip : c)
              );
            } else if (payload.eventType === 'DELETE') {
              setClips(prev => prev.filter(c => c.id !== (payload.old as any).id));
            }
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(projectsChannel);
      supabase.removeChannel(clipsChannel);
    };
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed out",
        description: "You've been signed out successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading || loadingData) {
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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-accent rounded-lg flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">ViralClips</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="capitalize bg-primary/10 text-primary px-2 py-1 rounded-full">
                  {profile?.subscription_tier}
                </span>
                <span className="text-muted-foreground">
                  {profile?.credits_remaining} credits
                </span>
              </div>
              
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
                Live count
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clips</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clips.length}</div>
              <p className="text-xs text-muted-foreground">
                Generated clips
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Credits</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profile?.credits_remaining}</div>
              <p className="text-xs text-muted-foreground">
                Available now
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Plan</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{profile?.subscription_tier}</div>
              <p className="text-xs text-muted-foreground">
                Current tier
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                <Button variant="hero">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Video
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => (
                <Card key={project.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{project.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {project.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {new Date(project.created_at).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {clips.filter(c => c.project_id === project.id).length} clips
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs capitalize relative ${
                          project.status === 'completed' 
                            ? 'bg-success/10 text-success' 
                            : project.status === 'processing'
                            ? 'bg-warning/10 text-warning animate-pulse'
                            : project.status === 'failed'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {project.status === 'processing' && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full animate-ping"></div>
                          )}
                          {project.status}
                        </span>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;