import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { extractVideoId, isValidYouTubeUrl } from '../_shared/youtube-utils.ts'
import { 
  initializeFFmpeg, 
  downloadYouTubeVideo, 
  processVideoClip, 
  createWorkingDirectory, 
  cleanupWorkingDirectory,
  uploadToStorage,
  validateFFmpegReady,
  estimateProcessingTime
} from '../_shared/ffmpeg-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SelectedHighlight {
  id: string;
  startTime: number;
  endTime: number;
  title: string;
  type: string;
  platform: string;
  aiScore: number;
}

interface ClipRequest {
  videoUrl: string;
  videoTitle: string;
  selectedHighlights: SelectedHighlight[];
  projectTitle: string;
  projectDescription?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { videoUrl, videoTitle, selectedHighlights, projectTitle, projectDescription }: ClipRequest = await req.json()

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
      throw new Error('Authentication required')
    }

    // Check user's credits and subscription
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('credits_remaining, subscription_tier')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError

    if (profile.credits_remaining <= 0 && profile.subscription_tier === 'free') {
      throw new Error('Insufficient credits. Please upgrade your plan to continue generating clips.')
    }

    // Validate input parameters
    if (!videoUrl || !videoTitle || !selectedHighlights || selectedHighlights.length === 0) {
      throw new Error('Invalid input: videoUrl, videoTitle, and selectedHighlights are required')
    }

    if (!projectTitle || projectTitle.trim().length === 0) {
      throw new Error('Project title is required')
    }

    console.log(`Starting clip generation for user ${user.email}`)
    console.log(`Video: ${videoTitle}`)
    console.log(`Selected highlights: ${selectedHighlights.length}`)

    // Create the project
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .insert({
        user_id: user.id,
        title: projectTitle,
        description: projectDescription || `AI-generated clips from: ${videoTitle}`,
        source_video_url: videoUrl,
        source_video_duration: Math.max(...selectedHighlights.map(h => h.endTime)),
        status: 'processing'
      })
      .select()
      .single()

    if (projectError) throw projectError

    console.log(`Project created with ID: ${project.id}`)

    // Validate and extract video ID
    if (!isValidYouTubeUrl(videoUrl)) {
      throw new Error('Invalid YouTube URL provided')
    }

    // Generate clips from selected highlights
    const clips = []
    const videoId = extractVideoId(videoUrl)

    for (const highlight of selectedHighlights) {
      try {
        console.log(`Processing highlight: ${highlight.title} (${highlight.startTime}s - ${highlight.endTime}s)`)

        // Create clip record in database
        const { data: clip, error: clipError } = await supabaseClient
          .from('clips')
          .insert({
            project_id: project.id,
            title: highlight.title,
            start_time: Math.floor(highlight.startTime),
            end_time: Math.floor(highlight.endTime),
            duration: Math.floor(highlight.endTime - highlight.startTime),
            platform: highlight.platform,
            ai_score: highlight.aiScore,
            status: 'processing',
            // For now, link to YouTube with timestamp - in production this would be processed video file
            video_url: `${videoUrl}&t=${Math.floor(highlight.startTime)}s`,
            thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          })
          .select()
          .single()

        if (clipError) {
          console.error('Error creating clip:', clipError)
          continue
        }

        // REAL VIDEO PROCESSING IMPLEMENTATION
        console.log(`Starting real video processing for clip: ${highlight.title}`);
        
        let workingDir: string | null = null;
        
        try {
          // Create working directory for this clip
          workingDir = await createWorkingDirectory();
          
          // Initialize FFmpeg processor
          const ffmpegProcessor = await initializeFFmpeg();
          const validation = validateFFmpegReady(ffmpegProcessor);
          
          if (!validation.ready) {
            throw new Error(`FFmpeg not ready: ${validation.error}`);
          }
          
          // Download the YouTube video
          console.log('Downloading source video...');
          const downloadedVideoPath = await downloadYouTubeVideo(videoUrl, workingDir);
          
          // Process the video clip with platform-specific settings
          const clipOutputPath = `${workingDir}/clip_${clip.id}.mp4`;
          const processingOptions = {
            startTime: highlight.startTime,
            endTime: highlight.endTime,
            platform: highlight.platform as 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'all',
            quality: 'medium' as const,
            cropToVertical: true,
            enhanceAudio: true
          };
          
          console.log(`Processing clip with options:`, processingOptions);
          const processingResult = await processVideoClip(
            ffmpegProcessor,
            downloadedVideoPath,
            clipOutputPath,
            processingOptions
          );
          
          // Upload processed video and thumbnail to storage
          console.log('Uploading processed files to storage...');
          const uploadResult = await uploadToStorage(
            supabaseClient,
            processingResult.videoData,
            processingResult.thumbnailData,
            clip.id,
            highlight.platform
          );
          
          // Update clip with real URLs and processing metadata
          await supabaseClient
            .from('clips')
            .update({ 
              status: 'completed',
              processed_at: new Date().toISOString(),
              video_url: uploadResult.videoUrl,
              thumbnail_url: uploadResult.thumbnailUrl,
              file_size: processingResult.metadata.fileSize,
              resolution: processingResult.metadata.resolution
            })
            .eq('id', clip.id);
            
          console.log(`Successfully processed clip: ${clip.title}`);
          
        } catch (processingError) {
          console.error(`Video processing failed for clip ${clip.id}:`, processingError);
          
          // Update clip status to failed
          await supabaseClient
            .from('clips')
            .update({ 
              status: 'failed',
              error_message: processingError.message
            })
            .eq('id', clip.id);
            
          throw processingError;
        } finally {
          // Always clean up working directory
          if (workingDir) {
            await cleanupWorkingDirectory(workingDir);
          }
        }

        // Fetch updated clip data
        const { data: updatedClip } = await supabaseClient
          .from('clips')
          .select('*')
          .eq('id', clip.id)
          .single();
          
        if (updatedClip && updatedClip.status === 'completed') {
          clips.push({
            id: updatedClip.id,
            title: updatedClip.title,
            duration: updatedClip.duration,
            platform: updatedClip.platform,
            aiScore: updatedClip.ai_score,
            startTime: updatedClip.start_time,
            endTime: updatedClip.end_time,
            videoUrl: updatedClip.video_url,
            thumbnailUrl: updatedClip.thumbnail_url,
            status: updatedClip.status,
            fileSize: updatedClip.file_size,
            resolution: updatedClip.resolution
          });
        }

        console.log(`Completed clip: ${clip.title}`)

      } catch (error) {
        console.error(`Error processing highlight ${highlight.id}:`, error)
      }
    }

    // Update project status
    await supabaseClient
      .from('projects')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
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
      message: `Successfully generated ${clips.length} viral clips!`,
      clipsGenerated: clips.length,
      clips
    }

    console.log(`Clip generation completed for project ${project.id}`)

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in generate-clips function:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: 'Clip generation failed. Please try again or contact support.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Note: extractVideoId is now imported from shared utilities
