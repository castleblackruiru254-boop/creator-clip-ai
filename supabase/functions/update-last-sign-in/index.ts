import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkSignInRateLimit, getClientIP, createRateLimitKey } from '../_shared/sign-in-rate-limiter.ts'

interface UpdateLastSignInRequest {
  userId: string
}

interface UpdateLastSignInResponse {
  success: boolean
  message: string
  timestamp?: string
  error?: string
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Method not allowed',
          message: 'Only POST requests are accepted'
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate content type
    const contentType = req.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid content type',
          message: 'Content-Type must be application/json'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse and validate request body
    let body: UpdateLastSignInRequest
    try {
      body = await req.json()
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate required fields
    if (!body.userId || typeof body.userId !== 'string') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid userId',
          message: 'userId must be a non-empty string'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(body.userId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid UUID format',
          message: 'userId must be a valid UUID'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Apply rate limiting
    const clientIP = getClientIP(req)
    const rateLimitKey = createRateLimitKey(body.userId, clientIP)
    const rateLimit = checkSignInRateLimit(rateLimitKey)
    
    if (!rateLimit.allowed) {
      const resetDate = new Date(rateLimit.resetTime).toISOString()
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rate limit exceeded',
          message: rateLimit.blocked 
            ? `Too many sign-in requests. Blocked until ${resetDate}` 
            : `Rate limit exceeded. Try again after ${resetDate}`,
          retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000)
        }),
        {
          status: 429,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString()
          }
        }
      )
    }

    // Get service role key from environment
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')

    if (!serviceRoleKey || !supabaseUrl) {
      console.error('Missing required environment variables')
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Configuration error',
          message: 'Service temporarily unavailable'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify the user exists in auth.users first
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(body.userId)
    
    if (authError || !authUser.user) {
      console.error('User verification failed:', authError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User not found',
          message: 'The specified user does not exist'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Update last_sign_in timestamp with current time
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        last_sign_in: now,
        last_activity_at: now
      })
      .eq('id', body.userId)
      .select('id, last_sign_in, last_activity_at')

    if (error) {
      console.error('Database update failed:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Database error',
          message: 'Failed to update sign-in timestamp'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if the update affected any rows
    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Profile not found',
          message: 'User profile does not exist'
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Success response
    const response: UpdateLastSignInResponse = {
      success: true,
      message: 'Last sign-in timestamp updated successfully',
      timestamp: now
    }

    // Log successful update (for monitoring)
    console.log(`Successfully updated last_sign_in for user ${body.userId} at ${now}`)

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    // Log unexpected errors
    console.error('Unexpected error in update-last-sign-in function:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
