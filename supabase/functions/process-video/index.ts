import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { title, description, videoUrl } = await req.json()

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

    // Create the project
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .insert({
        user_id: user.id,
        title,
        description,
        source_video_url: videoUrl,
        status: 'processing'
      })
      .select()
      .single()

    if (projectError) throw projectError

    // Simulate video processing (in real implementation, this would trigger actual video processing)
    console.log(`Processing video for project ${project.id}`)
    console.log(`Video URL: ${videoUrl}`)
    console.log(`User: ${user.email}`)

    // TODO: Integrate with actual video processing service
    // This would involve:
    // 1. Download/access the source video
    // 2. Analyze video content for highlights
    // 3. Generate clips based on AI analysis
    // 4. Generate thumbnails and metadata
    // 5. Update project status

    // For now, we'll just create a sample response
    const response = {
      success: true,
      projectId: project.id,
      message: 'Video processing started. You will be notified when clips are ready.',
      estimatedTime: '5-10 minutes'
    }

    // Update user credits (only for free tier)
    if (profile.subscription_tier === 'free') {
      await supabaseClient
        .from('profiles')
        .update({ credits_remaining: profile.credits_remaining - 1 })
        .eq('id', user.id)
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in process-video function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})