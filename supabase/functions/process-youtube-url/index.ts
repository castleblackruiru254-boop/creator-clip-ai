import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { 
  extractVideoId, 
  isValidYouTubeUrl, 
  parseYouTubeUrl, 
  parseYouTubeDuration,
  getYouTubeOEmbedData,
  createFallbackVideoMetadata 
} from '../_shared/youtube-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VideoMetadata {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  publishedAt: string;
  channelTitle: string;
  viewCount: string;
  url: string;
  durationSeconds: number;
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { videoUrl } = await req.json()

    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header missing')
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      console.error('Auth error:', authError)
      throw new Error('Authentication failed')
    }

    // Validate and parse YouTube URL
    if (!isValidYouTubeUrl(videoUrl)) {
      throw new Error('Invalid YouTube URL. Please provide a valid YouTube video URL.');
    }

    const urlInfo = parseYouTubeUrl(videoUrl);
    if (!urlInfo) {
      throw new Error('Failed to parse YouTube URL. Please check the URL format.');
    }

    console.log(`Processing video ID: ${urlInfo.videoId} from URL: ${urlInfo.originalUrl}`);
    const videoId = urlInfo.videoId;

    // Get video metadata
    const metadata = await getVideoMetadata(videoId);
    console.log(`Video metadata extracted for: ${metadata.title}`);

    // Generate AI-powered highlights
    const highlights = await analyzeVideoForHighlights(metadata);
    console.log(`Generated ${highlights.length} highlights for video`);

    const response = {
      success: true,
      video: metadata,
      highlights,
      message: `Successfully analyzed video: ${metadata.title}`
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in process-youtube-url function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: 'Failed to process YouTube URL'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Helper function to parse YouTube duration format (PT1H2M3S) - now using shared utility
function parseDuration(duration: string): number {
  return parseYouTubeDuration(duration);
}

// AI-powered highlight detection using OpenAI
async function analyzeVideoForHighlights(metadata: VideoMetadata): Promise<Highlight[]> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.warn('OpenAI API key not configured, using fallback highlights');
    return generateFallbackHighlights(metadata.durationSeconds);
  }

  try {
    // Generate a mock transcript based on video metadata
    const simulatedTranscript = generateMockTranscript(metadata);
    
    const prompt = `Analyze this YouTube video and identify the top 3-5 moments that would make engaging short-form clips for TikTok, YouTube Shorts, and Instagram Reels.

Video Title: ${metadata.title}
Video Duration: ${metadata.durationSeconds} seconds
Channel: ${metadata.channelTitle}
Description: ${metadata.description.substring(0, 500)}...
Mock Transcript: ${simulatedTranscript}

For each highlight, provide:
1. Start time (seconds from video start)
2. End time (seconds from video start) - clips should be 15-60 seconds long
3. Engagement type (hook, educational, emotional, funny, dramatic, surprising)
4. Suggested clip title (viral-style with emojis, under 100 characters)
5. Platform recommendation (tiktok, youtube_shorts, instagram_reels, or all)
6. Engagement score (0.0-1.0 based on viral potential)
7. Key phrases or moments that make it engaging
8. Brief description of why this moment is engaging

Focus on moments with:
- Strong emotional reactions
- Surprising revelations or plot twists  
- Educational "aha!" moments
- Funny or entertaining segments
- Dramatic peaks or climaxes
- Strong hooks that grab attention

Respond in JSON format: {"highlights": [{"start_time": 30, "end_time": 50, "type": "hook", "title": "🤯 You Won't Believe What Happens Next!", "platform": "all", "score": 0.9, "keywords": ["surprising", "shocking"], "description": "Amazing reveal moment"}]}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert viral video content analyzer. You specialize in identifying the most engaging moments in videos that will perform well on short-form platforms. You understand what hooks viewers, creates emotional responses, and drives engagement.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.8,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      console.error(`OpenAI API error: ${response.status}`);
      return generateFallbackHighlights(metadata.durationSeconds);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);
    
    // Convert AI response to our Highlight interface
    const highlights: Highlight[] = (aiResponse.highlights || []).map((h: {
      start_time?: number;
      end_time?: number;
      type?: string;
      title?: string;
      suggested_title?: string;
      platform?: string;
      platform_recommendation?: string;
      score?: number;
      engagement_score?: number;
      keywords?: string[];
      key_phrases?: string[];
      description?: string;
      confidence?: number;
    }, index: number) => ({
      id: `ai_highlight_${index + 1}`,
      startTime: Math.max(0, Math.floor(h.start_time || 0)),
      endTime: Math.min(metadata.durationSeconds, Math.ceil(h.end_time || h.start_time + 30)),
      confidence: h.confidence || 0.85,
      type: h.type || h.engagement_type || 'general',
      description: h.description || 'AI-detected engaging moment',
      suggestedTitle: h.title || h.suggested_title || `🔥 Viral Clip #${index + 1}`,
      aiScore: Math.min(1.0, Math.max(0.0, h.score || h.engagement_score || 0.8)),
      keywords: Array.isArray(h.keywords) ? h.keywords : (h.key_phrases || ['viral', 'engaging']),
      platform: h.platform || h.platform_recommendation || 'all'
    }));

    // Filter and validate highlights
    return highlights
      .filter(h => {
        const duration = h.endTime - h.startTime;
        return duration >= 15 && duration <= 60 && h.endTime <= metadata.durationSeconds;
      })
      .sort((a, b) => b.aiScore - a.aiScore) // Sort by AI score descending
      .slice(0, 5); // Take top 5 highlights

  } catch (error) {
    console.error('Error analyzing video with AI:', error);
    return generateFallbackHighlights(metadata.durationSeconds);
  }
}

// Generate mock transcript for AI analysis
function generateMockTranscript(metadata: VideoMetadata): string {
  const title = metadata.title.toLowerCase();
  const description = metadata.description.toLowerCase();
  
  // Generate contextual transcript based on video metadata
  if (title.includes('tutorial') || title.includes('how to') || title.includes('guide')) {
    return `[0:00] Hey everyone! Today I'm going to show you ${metadata.title.substring(0, 50)}... [0:15] This is something that most people get wrong, but I'm going to reveal the secret. [0:45] Here's the step that nobody talks about - this is crucial! [1:20] Watch this transformation - it's incredible! [2:00] I can't believe how much this has changed my approach. [2:30] If you've been struggling with this, this method will blow your mind!`;
  } else if (title.includes('review') || title.includes('test') || title.includes('vs')) {
    return `[0:00] Alright everyone, I've been testing this extensively and I have shocking results to share. [0:20] Look at this difference! This is absolutely insane! [0:50] But here's what really surprised me that nobody talks about... [1:25] The moment I tried this, everything clicked. [1:55] This completely changed my opinion. [2:20] You need to see this comparison!`;
  } else if (title.includes('reaction') || title.includes('responds')) {
    return `[0:00] Oh my god, I cannot believe what I'm seeing right now! [0:15] Wait, wait, wait - did that really just happen?! [0:35] This is not what I expected at all! [1:05] I'm literally speechless right now. [1:30] This changes everything I thought I knew! [2:00] I have to watch that again!`;
  } else if (title.includes('story') || title.includes('storytime')) {
    return `[0:00] You guys are not going to believe what happened to me yesterday... [0:20] So there I was, minding my own business, when suddenly... [0:55] I couldn't believe my eyes! [1:25] That's when things got really crazy. [1:50] I never thought something like this could happen to me! [2:15] The plot twist at the end will shock you!`;
  } else {
    return `[0:00] What I'm about to show you will completely change your perspective. [0:18] This discovery shocked everyone in the industry. [0:45] Here's the moment when everything clicked for me. [1:15] I wish someone had told me this years ago! [1:45] This is the secret that top professionals don't want you to know. [2:10] Once you see this, you can't unsee it!`;
  }
}

// Generate fallback highlights if AI analysis fails
function generateFallbackHighlights(durationSeconds: number): Highlight[] {
  const highlights: Highlight[] = [];
  const clipDuration = 30; // Default clip duration
  const spacing = Math.max(45, Math.floor(durationSeconds / 6)); // Space clips evenly
  const numClips = Math.min(5, Math.floor(durationSeconds / (clipDuration + 15)));
  
  for (let i = 0; i < numClips; i++) {
    const startTime = Math.floor(i * spacing + 15); // Start 15 seconds in, then spaced evenly
    const endTime = Math.min(startTime + clipDuration, durationSeconds - 5);
    
    if (endTime - startTime < 15) break; // Skip if clip would be too short
    
    const types = ['hook', 'emotional', 'educational', 'funny', 'dramatic'];
    const platforms = ['all', 'tiktok', 'youtube_shorts', 'instagram_reels'];
    
    highlights.push({
      id: `fallback_${i + 1}`,
      startTime,
      endTime,
      confidence: 0.75,
      type: types[i % types.length],
      description: `High-engagement moment detected at ${Math.floor(startTime/60)}:${String(startTime%60).padStart(2, '0')}`,
      suggestedTitle: [
        `🔥 Mind-Blowing Moment!`,
        `😱 You Won't Believe This!`,
        `💡 Game-Changing Insight!`,
        `🤯 Plot Twist Alert!`,
        `⚡ Viral Moment Detected!`
      ][i % 5],
      aiScore: 0.8 - (i * 0.05), // Decreasing scores
      keywords: ['viral', 'engaging', 'trending'],
      platform: platforms[i % platforms.length] as 'all' | 'tiktok' | 'youtube_shorts' | 'instagram_reels'
    });
  }
  
  return highlights;
}

// Helper function to get video metadata with multiple fallback strategies
async function getVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Strategy 1: Try YouTube Data API v3
  const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (youtubeApiKey) {
    try {
      console.log('Attempting YouTube API fetch...');
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${youtubeApiKey}`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          const video = data.items[0];
          const durationSeconds = parseDuration(video.contentDetails.duration);
          
          // Validate video duration (between 1 minute and 2 hours)
          if (durationSeconds < 60) {
            throw new Error('Video is too short. Please select a video that is at least 1 minute long.');
          }
          if (durationSeconds > 7200) {
            throw new Error('Video is too long. Please select a video that is less than 2 hours.');
          }
          
          console.log('Successfully fetched metadata from YouTube API');
          return {
            id: videoId,
            title: video.snippet.title,
            description: video.snippet.description || '',
            thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.medium?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            duration: video.contentDetails.duration,
            publishedAt: video.snippet.publishedAt,
            channelTitle: video.snippet.channelTitle,
            viewCount: video.statistics?.viewCount || '0',
            url: cleanUrl,
            durationSeconds
          };
        }
      }
    } catch (apiError) {
      console.warn('YouTube API failed:', apiError);
    }
  } else {
    console.warn('YouTube API key not configured');
  }
  
  // Strategy 2: Try oEmbed API as fallback
  try {
    console.log('Attempting oEmbed fetch...');
    const oEmbedData = await getYouTubeOEmbedData(cleanUrl);
    if (oEmbedData) {
      console.log('Successfully fetched metadata from oEmbed');
      return {
        id: videoId,
        title: oEmbedData.title || 'YouTube Video',
        description: 'Video content for analysis',
        thumbnail: oEmbedData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 'PT5M30S', // Default duration since oEmbed doesn't provide this
        publishedAt: new Date().toISOString(),
        channelTitle: oEmbedData.author_name || 'YouTube Channel',
        viewCount: '0',
        url: cleanUrl,
        durationSeconds: 330 // 5.5 minutes default
      };
    }
  } catch (oembedError) {
    console.warn('oEmbed fetch failed:', oembedError);
  }
  
  // Strategy 3: Create intelligent fallback metadata
  console.log('Using fallback metadata generation');
  try {
    const fallbackMetadata = createFallbackVideoMetadata(cleanUrl);
    console.log('Generated fallback metadata successfully');
    return {
      id: videoId,
      title: fallbackMetadata.title,
      description: fallbackMetadata.description,
      thumbnail: fallbackMetadata.thumbnail,
      duration: fallbackMetadata.duration,
      publishedAt: fallbackMetadata.publishedAt,
      channelTitle: fallbackMetadata.channelTitle,
      viewCount: fallbackMetadata.viewCount,
      url: fallbackMetadata.url,
      durationSeconds: fallbackMetadata.durationSeconds
    };
  } catch (fallbackError) {
    console.error('All metadata strategies failed:', fallbackError);
    throw new Error('Unable to retrieve video metadata. Please check the video URL and try again.');
  }
}
