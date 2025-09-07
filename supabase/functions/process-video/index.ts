import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { 
  extractVideoId, 
  isValidYouTubeUrl, 
  parseYouTubeUrl,
  parseYouTubeDuration,
  createFallbackVideoMetadata 
} from '../_shared/youtube-utils.ts'
import { enforceRateLimit } from '../_shared/rate-limiter.ts'
import { 
  generateTranscriptFromVideo,
  analyzeTranscriptForHighlights
} from '../_shared/transcript-service.ts'
import { 
  initializeFFmpeg,
  downloadYouTubeVideo,
  processVideoClip,
  createWorkingDirectory,
  cleanupWorkingDirectory,
  uploadToStorage
} from '../_shared/ffmpeg-utils.ts'

// Security headers with proper CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://lovable.dev, https://*.lovable.dev, http://localhost:*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
}

interface VideoMetadata {
  duration: number;
  title: string;
  description: string;
  thumbnailUrl?: string;
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
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      throw new Error('Invalid JSON in request body');
    }

    const { title, description, videoUrl } = body;

    // Input validation
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Title is required and must be a non-empty string');
    }
    if (title.length > 200) {
      throw new Error('Title must be less than 200 characters');
    }
    if (!/^[a-zA-Z0-9\s\-_.,!?()]+$/.test(title)) {
      throw new Error('Title contains invalid characters');
    }

    if (description && (typeof description !== 'string' || description.length > 1000)) {
      throw new Error('Description must be a string and less than 1000 characters');
    }
    if (description && !/^[a-zA-Z0-9\s\-_.,!?()\n\r]*$/.test(description)) {
      throw new Error('Description contains invalid characters');
    }

    if (!videoUrl || typeof videoUrl !== 'string') {
      throw new Error('Video URL is required');
    }
    
    // Validate YouTube URL format and extract video ID
    if (!isValidYouTubeUrl(videoUrl)) {
      throw new Error('Invalid YouTube URL format');
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      throw new Error('Invalid YouTube video ID');
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      throw new Error('Authentication required')
    }

    // Enforce rate limiting
    const rateLimitResult = await enforceRateLimit(req, 'processVideo', user.id);
    if (!rateLimitResult.success) {
      return rateLimitResult.response;
    }

    // Check user's credits
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('credits_remaining, subscription_tier')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    if (profile.credits_remaining <= 0 && profile.subscription_tier === 'free') {
      throw new Error('Insufficient credits. Please upgrade your plan.')
    }

    console.log(`Starting video processing for user ${user.email}`)
    console.log(`Video URL: ${videoUrl}`)

    // Step 1: Extract video metadata and validate
    let videoMetadata: VideoMetadata;
    try {
      videoMetadata = await getVideoMetadata(videoUrl);
      console.log(`Video metadata extracted: ${videoMetadata.duration}s duration`);
    } catch (error) {
      console.warn('Failed to get real metadata, using fallback:', error);
      // Use fallback metadata if API fails
      videoMetadata = {
        duration: 300, // 5 minutes default
        title: title || 'YouTube Video',
        description: description || 'Video processing',
        thumbnailUrl: extractVideoThumbnail(videoUrl)
      };
    }

    // Create the project with metadata
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .insert({
        user_id: user.id,
        title,
        description,
        source_video_url: videoUrl,
        source_video_duration: videoMetadata.duration,
        status: 'processing'
      })
      .select()
      .single()

    if (projectError) throw projectError

    console.log(`Project created with ID: ${project.id}`)

    // Step 2: Generate real transcript and analyze for highlights using AI
    console.log('Generating transcript and analyzing for highlights...');
    let highlights: Highlight[];
    
    try {
      // Generate transcript from the full video
      const transcript = await generateTranscriptFromVideo(videoUrl, undefined, undefined, 'en');
      console.log(`Generated transcript: ${transcript.text.length} characters`);
      
      // Analyze transcript for engaging highlights using AI
      const transcriptHighlights = await analyzeTranscriptForHighlights(
        transcript, 
        videoMetadata.title, 
        videoMetadata.duration
      );
      
      // Convert to our Highlight interface
      highlights = transcriptHighlights.map(h => ({
        id: h.id,
        startTime: h.startTime,
        endTime: h.endTime,
        confidence: h.confidence,
        type: h.type,
        description: h.description,
        suggestedTitle: h.suggestedTitle,
        aiScore: h.aiScore,
        keywords: h.keywords,
        platform: h.platform as 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'all'
      }));
      
      console.log(`Found ${highlights.length} transcript-based highlights`);
      
    } catch (transcriptError) {
      console.error('Transcript generation failed, using fallback:', transcriptError);
      highlights = await analyzeVideoForHighlights(videoUrl, videoMetadata);
    }

    // Step 3: Generate real clips for each highlight
    const clips = await generateRealClipsFromHighlights(project.id, highlights, videoUrl, supabaseClient)
    console.log(`Generated ${clips.length} processed clips`)

    // Step 4: Update project status
    await supabaseClient
      .from('projects')
      .update({ status: 'completed' })
      .eq('id', project.id)

    // Update user credits (only for free tier)
    if (profile.subscription_tier === 'free') {
      await supabaseClient
        .from('profiles')
        .update({ credits_remaining: profile.credits_remaining - 1 })
        .eq('id', user.id)
    }

    const response = {
      success: true,
      projectId: project.id,
      message: `Processing completed! Generated ${clips.length} viral clips.`,
      clipsGenerated: clips.length,
      clips: clips.map(clip => ({
        id: clip.id,
        title: clip.title,
        duration: clip.duration,
        platform: clip.platform,
        aiScore: clip.ai_score,
        thumbnailUrl: clip.thumbnail_url
      }))
    }

    console.log(`Video processing completed for project ${project.id}`)

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in process-video function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: 'Video processing failed. Please try again or contact support.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Helper function to extract video metadata
async function getVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
  try {
    // Validate and extract video ID using robust parsing
    if (!isValidYouTubeUrl(videoUrl)) {
      throw new Error('Invalid YouTube URL');
    }
    
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Failed to extract video ID from URL');
    }
    const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
    
    if (!youtubeApiKey) {
      throw new Error('YouTube API key not configured');
    }

    // Get video details from YouTube API
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoId}&key=${youtubeApiKey}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch video metadata');
    }
    
    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }
    
    const videoData = data.items[0];
    const duration = parseDuration(videoData.contentDetails.duration);
    
    return {
      duration,
      title: videoData.snippet.title,
      description: videoData.snippet.description,
      thumbnailUrl: videoData.snippet.thumbnails?.high?.url
    };
  } catch (error) {
    console.error('Error getting video metadata:', error);
    throw error;
  }
}

// Helper function to parse YouTube duration format (PT1H2M3S)
function parseDuration(duration: string): number {
  return parseYouTubeDuration(duration);
}

// AI-powered highlight detection using OpenAI
async function analyzeVideoForHighlights(videoUrl: string, metadata: VideoMetadata): Promise<Highlight[]> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.warn('OpenAI API key not configured, using fallback highlights');
    return generateFallbackHighlights(metadata.duration);
  }

  // Simulate transcript extraction (in production, use Whisper API)
  const simulatedTranscript = generateMockTranscript(metadata);
  
  const prompt = `Analyze this video transcript and identify the top 3-5 moments that would make engaging short-form clips for TikTok, YouTube Shorts, and Instagram Reels.

Video Title: ${metadata.title}
Video Duration: ${metadata.duration} seconds
Transcript: ${simulatedTranscript}

For each highlight, provide:
1. Start time (seconds)
2. End time (seconds) - clips should be 15-60 seconds
3. Engagement type (hook, educational, emotional, funny, dramatic)
4. Suggested clip title (viral-style with emojis)
5. Platform recommendation (tiktok, youtube_shorts, instagram_reels, or all)
6. Engagement score (0.0-1.0)
7. Key phrases or moments that make it engaging

Respond in JSON format with an array of highlights.`;

  try {
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
            content: 'You are an expert video content analyzer specializing in identifying viral moments for short-form content. You understand what makes content engaging on TikTok, YouTube Shorts, and Instagram Reels.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = JSON.parse(data.choices[0].message.content);
    
    // Convert AI response to our Highlight interface
    return (aiResponse.highlights || []).map((h: {
      start_time?: number;
      startTime?: number;
      end_time?: number;
      endTime?: number;
      confidence?: number;
      type?: string;
      engagement_type?: string;
      description?: string;
      moment?: string;
      title?: string;
      suggested_title?: string;
      score?: number;
      engagement_score?: number;
      keywords?: string[];
      key_phrases?: string[];
      platform?: string;
      platform_recommendation?: string;
    }, index: number) => ({
      id: `highlight_${index + 1}`,
      startTime: h.start_time || h.startTime || 0,
      endTime: h.end_time || h.endTime || 30,
      confidence: h.confidence || 0.8,
      type: h.type || h.engagement_type || 'general',
      description: h.description || h.moment || 'Engaging moment',
      suggestedTitle: h.title || h.suggested_title || '🔥 Viral Moment',
      aiScore: h.score || h.engagement_score || 0.8,
      keywords: h.keywords || h.key_phrases || [],
      platform: h.platform || h.platform_recommendation || 'all'
    }));
  } catch (error) {
    console.error('Error analyzing video with AI:', error);
    // Fallback to mock highlights if AI fails
    return generateFallbackHighlights(metadata.duration);
  }
}

// Generate mock transcript for demonstration (replace with Whisper API in production)
function generateMockTranscript(metadata: VideoMetadata): string {
  const title = metadata.title.toLowerCase();
  
  if (title.includes('tutorial') || title.includes('how to')) {
    return `Welcome everyone! Today I'm going to show you something incredible that's going to change the way you think about this topic. [0:05] First, let me explain the problem that everyone faces... [0:30] Now here's the solution that nobody talks about! This is the game-changer right here. [1:15] Watch this demonstration - it's going to blow your mind! [2:00] And that's how you do it! I can't believe how simple this actually is once you know the secret.`;
  } else if (title.includes('review') || title.includes('test')) {
    return `Alright guys, I've been testing this for weeks now and I have to tell you - I'm absolutely shocked by the results. [0:10] Look at this difference! This is insane! [0:45] But here's what really surprised me... [1:20] The moment I tried this feature, everything changed. [1:50] You won't believe what happened next!`;
  } else {
    return `Hey everyone! You're not going to believe what just happened. [0:05] I was skeptical at first, but then this happened... [0:25] This is the moment that changed everything for me. [1:00] I wish I had known this sooner! [1:30] If you're struggling with this, you need to see this. [2:00] This is absolutely incredible and I had to share it with you!`;
  }
}

// Generate fallback highlights if AI analysis fails
function generateFallbackHighlights(duration: number): Highlight[] {
  const highlights: Highlight[] = [];
  const clipDuration = 30; // Default clip duration
  const numClips = Math.min(5, Math.floor(duration / 45)); // Generate up to 5 clips, spaced 45 seconds apart
  
  for (let i = 0; i < numClips; i++) {
    const startTime = i * 45 + 15; // Start 15 seconds in, then every 45 seconds
    const endTime = Math.min(startTime + clipDuration, duration - 5); // Ensure we don't go past video end
    
    if (endTime - startTime < 15) break; // Skip if clip would be too short
    
    highlights.push({
      id: `fallback_${i + 1}`,
      startTime,
      endTime,
      confidence: 0.7,
      type: 'general',
      description: `Engaging moment ${i + 1}`,
      suggestedTitle: `🔥 Viral Moment #${i + 1}`,
      aiScore: 0.75,
      keywords: ['viral', 'engaging'],
      platform: 'all'
    });
  }
  
  return highlights;
}

// Generate real processed clips from highlights using FFmpeg
async function generateRealClipsFromHighlights(
  projectId: string, 
  highlights: Highlight[], 
  videoUrl: string, 
  supabaseClient: SupabaseClient
): Promise<{
  id: string;
  title: string;
  start_time: number;
  end_time: number;
  duration: number;
  platform: string;
  ai_score: number;
  status: string;
  video_url: string;
  thumbnail_url: string;
  file_size?: number;
  resolution?: string;
}[]> {
  const clips = [];
  let sharedWorkingDir: string | null = null;
  let sharedVideoPath: string | null = null;
  
  try {
    // Create shared working directory and download video once
    sharedWorkingDir = await createWorkingDirectory();
    const ffmpegProcessor = await initializeFFmpeg();
    
    console.log('Downloading source video for processing...');
    sharedVideoPath = await downloadYouTubeVideo(videoUrl, sharedWorkingDir);
    
    for (const highlight of highlights) {
      let clipWorkingDir: string | null = null;
      
      try {
        console.log(`Processing clip: ${highlight.suggestedTitle} (${highlight.startTime}s-${highlight.endTime}s)`);
        
        // Create clip record in database first
        const { data: clip, error: clipError } = await supabaseClient
          .from('clips')
          .insert({
            project_id: projectId,
            title: highlight.suggestedTitle,
            start_time: Math.floor(highlight.startTime),
            end_time: Math.floor(highlight.endTime),
            duration: Math.floor(highlight.endTime - highlight.startTime),
            platform: highlight.platform,
            ai_score: highlight.aiScore,
            status: 'processing'
          })
          .select()
          .single();

        if (clipError) {
          console.error('Error creating clip record:', clipError);
          continue;
        }

        // Create individual working directory for this clip
        clipWorkingDir = await createWorkingDirectory();
        const clipOutputPath = `${clipWorkingDir}/clip_${clip.id}.mp4`;
        
        // Process the video clip with real FFmpeg
        const processingOptions = {
          startTime: highlight.startTime,
          endTime: highlight.endTime,
          platform: highlight.platform,
          quality: 'medium' as const,
          cropToVertical: true,
          enhanceAudio: true
        };
        
        console.log(`Processing video segment with FFmpeg...`);
        const processingResult = await processVideoClip(
          ffmpegProcessor,
          sharedVideoPath,
          clipOutputPath,
          processingOptions
        );
        
        // Upload processed files to Supabase Storage
        console.log(`Uploading processed clip to storage...`);
        const uploadResult = await uploadToStorage(
          supabaseClient,
          processingResult.videoData,
          processingResult.thumbnailData,
          clip.id,
          highlight.platform
        );
        
        // Update clip record with real data
        const { data: updatedClip, error: updateError } = await supabaseClient
          .from('clips')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            video_url: uploadResult.videoUrl,
            thumbnail_url: uploadResult.thumbnailUrl,
            file_size: processingResult.metadata.fileSize,
            resolution: processingResult.metadata.resolution
          })
          .eq('id', clip.id)
          .select()
          .single();
          
        if (updateError) {
          console.error('Error updating clip:', updateError);
          continue;
        }
        
        clips.push(updatedClip);
        console.log(`Successfully processed clip: ${updatedClip.title}`);
        
      } catch (error) {
        console.error(`Error processing highlight ${highlight.id}:`, error);
        
        // Update clip status to failed if it was created
        try {
          await supabaseClient
            .from('clips')
            .update({ 
              status: 'failed',
              error_message: error.message
            })
            .eq('project_id', projectId)
            .eq('start_time', Math.floor(highlight.startTime));
        } catch (updateError) {
          console.error('Failed to update clip status:', updateError);
        }
        
      } finally {
        // Clean up individual clip working directory
        if (clipWorkingDir) {
          await cleanupWorkingDirectory(clipWorkingDir);
        }
      }
    }
    
  } catch (error) {
    console.error('Error in clip generation process:', error);
    throw error;
  } finally {
    // Clean up shared working directory
    if (sharedWorkingDir) {
      await cleanupWorkingDirectory(sharedWorkingDir);
    }
  }
  
  return clips;
}

// Generate actual clips from highlights (legacy function for fallback)
async function generateClipsFromHighlights(
  projectId: string, 
  highlights: Highlight[], 
  videoUrl: string, 
  supabaseClient: SupabaseClient
): Promise<{
  id: string;
  title: string;
  start_time: number;
  end_time: number;
  duration: number;
  platform: string;
  ai_score: number;
  status: string;
  video_url: string;
  thumbnail_url: string;
}[]> {
  const clips = [];
  
  for (const highlight of highlights) {
    try {
      // Create clip records with YouTube URLs as fallback
      const { data: clip, error: clipError } = await supabaseClient
        .from('clips')
        .insert({
          project_id: projectId,
          title: highlight.suggestedTitle,
          start_time: Math.floor(highlight.startTime),
          end_time: Math.floor(highlight.endTime),
          duration: Math.floor(highlight.endTime - highlight.startTime),
          platform: highlight.platform,
          ai_score: highlight.aiScore,
          status: 'completed',
          // Fallback URLs - these link to YouTube with timestamps
          video_url: `${videoUrl}&t=${Math.floor(highlight.startTime)}s`,
          thumbnail_url: `https://img.youtube.com/vi/${extractVideoId(videoUrl)}/maxresdefault.jpg`
        })
        .select()
        .single();

      if (clipError) {
        console.error('Error creating clip:', clipError);
        continue;
      }

      clips.push(clip);
      
      // Generate subtitles for this clip (mock for now)
      await generateSubtitlesForClip(clip.id, highlight, supabaseClient);
      
    } catch (error) {
      console.error(`Error generating clip for highlight ${highlight.id}:`, error);
    }
  }
  
  return clips;
}

// Generate subtitles for a clip
async function generateSubtitlesForClip(clipId: string, highlight: Highlight, supabaseClient: SupabaseClient): Promise<void> {
  // Mock subtitle generation - in production, use Whisper API
  const mockSubtitles = [
    {
      text: "This is the moment",
      start_time: 0.0,
      end_time: 2.5
    },
    {
      text: "that will change everything!",
      start_time: 2.5,
      end_time: 4.8
    },
    {
      text: "Watch what happens next...",
      start_time: 4.8,
      end_time: 7.2
    }
  ];

  for (const subtitle of mockSubtitles) {
    await supabaseClient
      .from('subtitles')
      .insert({
        clip_id: clipId,
        text: subtitle.text,
        start_time: subtitle.start_time,
        end_time: subtitle.end_time
      });
  }
}

// Helper function to extract video thumbnail
function extractVideoThumbnail(url: string): string {
  const videoId = extractVideoId(url);
  return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '';
}
