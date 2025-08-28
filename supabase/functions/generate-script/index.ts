import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoDescription, targetPlatform, tone } = await req.json();

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

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Prepare the prompt for script generation
    const prompt = `Generate an engaging script for a ${targetPlatform} video with a ${tone} tone.

Video Description: ${videoDescription}
Platform: ${targetPlatform}
Tone: ${tone}

Requirements:
- Hook viewers in the first 3 seconds
- Keep it concise and engaging
- Include clear call-to-action
- Optimize for ${targetPlatform} format
- Use ${tone} language throughout

Generate a script with:
1. Opening hook (3-5 seconds)
2. Main content (15-45 seconds)
3. Call-to-action (3-5 seconds)

Also suggest:
- 3 engaging titles
- 5 relevant hashtags
- Best posting time recommendation`;

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
            content: 'You are an expert content creator specializing in viral short-form video content for TikTok, YouTube Shorts, and Instagram Reels. You understand platform-specific algorithms and audience preferences.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedScript = data.choices[0].message.content;

    // Parse the generated content (in a real implementation, you'd use more sophisticated parsing)
    const scriptResponse = {
      script: generatedScript,
      platform: targetPlatform,
      tone: tone,
      generatedAt: new Date().toISOString(),
      suggestions: {
        titles: extractTitles(generatedScript),
        hashtags: extractHashtags(generatedScript),
        bestTime: getBestPostingTime(targetPlatform)
      }
    };

    console.log(`Generated script for user ${user.email} for ${targetPlatform}`);

    return new Response(JSON.stringify(scriptResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-script function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper functions
function extractTitles(content: string): string[] {
  // Simple extraction - in real implementation, use more sophisticated parsing
  const titleMatches = content.match(/(?:Title|titles?):\s*(.+)/gi);
  if (titleMatches) {
    return titleMatches.slice(0, 3).map(match => 
      match.replace(/(?:Title|titles?):\s*/gi, '').trim()
    );
  }
  return [
    "🔥 This Will Change Everything!",
    "✨ The Secret Nobody Talks About",
    "🚀 Mind-Blowing Results in Minutes"
  ];
}

function extractHashtags(content: string): string[] {
  // Simple extraction - in real implementation, use more sophisticated parsing
  const hashtagMatches = content.match(/#\w+/g);
  if (hashtagMatches) {
    return hashtagMatches.slice(0, 5);
  }
  return ["#viral", "#trending", "#fyp", "#contentcreator", "#tips"];
}

function getBestPostingTime(platform: string): string {
  const times = {
    'tiktok': 'Tuesday-Thursday, 6-10 PM',
    'youtube_shorts': 'Monday-Wednesday, 2-4 PM',
    'instagram_reels': 'Wednesday-Friday, 11 AM-1 PM',
    'all': 'Tuesday-Thursday, 6-9 PM'
  };
  return times[platform as keyof typeof times] || times.all;
}