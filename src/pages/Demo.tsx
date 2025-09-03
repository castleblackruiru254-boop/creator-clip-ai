import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Clock, Eye, TrendingUp, Users, BarChart3 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Demo = () => {
  const [selectedDemo, setSelectedDemo] = useState<number | null>(null);
  const navigate = useNavigate();

  const demoVideos = [
    {
      id: 1,
      title: "Podcast to TikTok Clips",
      description: "Watch how a 2-hour podcast becomes 10 viral TikTok clips",
      duration: "3:45",
      views: "125K",
      thumbnail: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&h=300&fit=crop&crop=center",
      category: "Podcast"
    },
    {
      id: 2,
      title: "YouTube to Instagram Reels",
      description: "Transform a 20-minute YouTube video into engaging Instagram Reels",
      duration: "4:12",
      views: "89K",
      thumbnail: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=300&fit=crop&crop=center",
      category: "YouTube"
    },
    {
      id: 3,
      title: "Webinar Highlights",
      description: "Extract key moments from a business webinar for LinkedIn",
      duration: "2:58",
      views: "67K",
      thumbnail: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop&crop=center",
      category: "Business"
    },
    {
      id: 4,
      title: "Gaming Stream Clips",
      description: "Create viral gaming clips from a 4-hour Twitch stream",
      duration: "5:23",
      views: "203K",
      thumbnail: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=300&fit=crop&crop=center",
      category: "Gaming"
    },
    {
      id: 5,
      title: "Educational Content",
      description: "Turn a lecture into bite-sized educational clips",
      duration: "3:31",
      views: "45K",
      thumbnail: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=300&fit=crop&crop=center",
      category: "Education"
    },
    {
      id: 6,
      title: "Live Event Coverage",
      description: "Create social media content from a live conference",
      duration: "4:47",
      views: "112K",
      thumbnail: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=300&fit=crop&crop=center",
      category: "Events"
    }
  ];

  const stats = [
    { label: "Average Engagement Increase", value: "340%", icon: TrendingUp },
    { label: "Time Saved Per Video", value: "95%", icon: Clock },
    { label: "Content Creators Using ViralClips", value: "50K+", icon: Users },
    { label: "Total Clips Generated", value: "10M+", icon: BarChart3 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-muted">
      <div className="container mx-auto px-6 pt-24 pb-12">
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl lg:text-6xl font-bold">
            See ViralClips in
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent"> Action</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Watch real examples of how creators transform their long-form content 
            into viral short clips using our AI technology
          </p>
        </div>

        {/* Featured Demo */}
        <div className="max-w-4xl mx-auto mb-16">
          <Card className="overflow-hidden hover:shadow-2xl transition-all duration-300">
            <div className="relative">
              <img 
                src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&h=450&fit=crop&crop=center" 
                alt="Main Demo Video" 
                className="w-full h-[450px] object-cover"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Button 
                  variant="secondary" 
                  size="lg" 
                  className="bg-white/90 hover:bg-white text-black"
                  onClick={() => setSelectedDemo(1)}
                >
                  <Play className="w-6 h-6 mr-2" />
                  Watch Full Demo
                </Button>
              </div>
              <Badge className="absolute top-4 left-4 bg-primary">
                Featured Demo
              </Badge>
              <div className="absolute bottom-4 left-4 text-white">
                <h3 className="text-xl font-bold">Complete ViralClips Walkthrough</h3>
                <p className="text-sm opacity-90">See the entire process from upload to viral clip</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Demo Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {demoVideos.map((demo) => (
            <Card key={demo.id} className="overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer">
              <div className="relative" onClick={() => setSelectedDemo(demo.id)}>
                <img 
                  src={demo.thumbnail} 
                  alt={demo.title}
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Play className="w-12 h-12 text-white" />
                </div>
                <Badge className="absolute top-2 left-2 bg-primary/90">
                  {demo.category}
                </Badge>
                <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-sm">
                  {demo.duration}
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2">{demo.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{demo.description}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {demo.views}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {demo.duration}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {stats.map((stat, index) => (
            <Card key={index} className="text-center hover:shadow-lg transition-all duration-300 hover:scale-105">
              <CardContent className="p-6">
                <stat.icon className="w-12 h-12 text-primary mx-auto mb-4" />
                <div className="text-3xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <div className="text-center bg-card/50 backdrop-blur rounded-3xl p-8 border">
          <h2 className="text-3xl font-bold mb-4">Ready to Create Your Own Viral Clips?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of creators who are already using ViralClips to transform 
            their content and grow their audience across all platforms.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg" onClick={() => navigate('/start-creating')}>
              Start Creating Free
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate('/pricing')}>
              View Pricing
            </Button>
          </div>
        </div>

        {/* Modal for demo video (simplified placeholder) */}
        {selectedDemo && (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedDemo(null)}
          >
            <div className="bg-background rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-4">Demo Video Coming Soon</h3>
                <p className="text-muted-foreground mb-6">
                  This feature will be available in the next update. 
                  Sign up now to get notified when it's ready!
                </p>
                <div className="flex gap-4 justify-center">
                  <Button onClick={() => navigate('/auth')}>
                    Get Notified
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedDemo(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Demo;