import { supabase } from '@/integrations/supabase/client'

interface UpdateLastSignInResponse {
  success: boolean
  message: string
  timestamp?: string
  error?: string
  retryAfter?: number
}

interface AuthServiceError {
  code: string
  message: string
  details?: any
}

/**
 * Simple, production-ready AuthService using direct HTTP fetch
 * This bypasses any issues with Supabase's function invoke method
 */
export class AuthService {
  private static readonly EDGE_FUNCTION_NAME = 'update-last-sign-in'
  private static readonly MAX_RETRY_ATTEMPTS = 3
  private static readonly BASE_RETRY_DELAY = 1000 // 1 second

  /**
   * Update the user's last sign-in timestamp securely via Edge Function
   */
  static async updateLastSignIn(userId: string): Promise<{ success: boolean; error?: AuthServiceError }> {
    // Input validation
    if (!userId || typeof userId !== 'string') {
      return { success: false, error: { code: 'INVALID_USER_ID', message: 'User ID is required' } }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      return { success: false, error: { code: 'INVALID_UUID_FORMAT', message: 'Invalid user ID format' } }
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !anonKey) {
      return { success: false, error: { code: 'CONFIG_ERROR', message: 'Missing Supabase configuration' } }
    }

    let lastError: AuthServiceError | null = null

    // Retry logic
    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Get user session for auth token
        const { data: { session } } = await supabase.auth.getSession()
        const authToken = session?.access_token || anonKey

        // Direct HTTP request to Edge Function
        const response = await fetch(`${supabaseUrl}/functions/v1/${this.EDGE_FUNCTION_NAME}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'apikey': anonKey,
          },
          body: JSON.stringify({ userId })
        })

        if (!response.ok) {
          // Handle HTTP errors
          const errorText = await response.text().catch(() => 'Unknown error')
          
          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
            return {
              success: false,
              error: {
                code: 'RATE_LIMITED',
                message: `Rate limited. Try again after ${retryAfter} seconds.`,
                details: { retryAfter }
              }
            }
          }

          // Check if retryable
          const isRetryable = [500, 502, 503, 504].includes(response.status)
          if (isRetryable && attempt < this.MAX_RETRY_ATTEMPTS) {
            lastError = {
              code: 'HTTP_ERROR',
              message: `HTTP ${response.status}: ${response.statusText}`,
              details: { status: response.status, body: errorText }
            }
            await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1))
            continue
          }

          return {
            success: false,
            error: {
              code: 'HTTP_ERROR',
              message: `HTTP ${response.status}: ${response.statusText}`,
              details: { status: response.status, body: errorText }
            }
          }
        }

        // Parse successful response
        const data: UpdateLastSignInResponse = await response.json()

        if (!data.success) {
          return {
            success: false,
            error: {
              code: this.mapErrorCode(data.error || 'UNKNOWN_ERROR'),
              message: data.message || 'Unknown error occurred',
              details: data
            }
          }
        }

        // Success!
        console.log(`✅ Updated last_sign_in for user ${userId} at ${data.timestamp}`)
        return { success: true }

      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt} failed:`, error)
        lastError = {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error occurred',
          details: error
        }

        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1))
        }
      }
    }

    return {
      success: false,
      error: lastError || {
        code: 'UNKNOWN_ERROR',
        message: 'Failed to update last sign-in after all retry attempts'
      }
    }
  }

  /**
   * Update last sign-in for current authenticated user
   */
  static async updateCurrentUserLastSignIn(): Promise<{ success: boolean; error?: AuthServiceError }> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return {
          success: false,
          error: { code: 'NO_AUTH_USER', message: 'No authenticated user found' }
        }
      }

      return await this.updateLastSignIn(user.id)
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SESSION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get user session'
        }
      }
    }
  }

  /**
   * Call this after successful sign-in (non-blocking)
   * This is the main method you'll use in your auth flow
   */
  static async onSignInSuccess(userId?: string): Promise<void> {
    try {
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id
      
      if (!targetUserId) {
        console.warn('⚠️ No user ID available for last_sign_in update')
        return
      }

      const result = await this.updateLastSignIn(targetUserId)
      
      if (!result.success) {
        // Log error but don't throw - this shouldn't block the sign-in process
        console.warn('⚠️ Failed to update last_sign_in:', result.error)
      }
    } catch (error) {
      // Catch-all to ensure sign-in process isn't disrupted
      console.error('❌ Unexpected error updating last_sign_in:', error)
    }
  }

  // Helper methods
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private static mapErrorCode(errorString: string): string {
    const errorMap: { [key: string]: string } = {
      'Method not allowed': 'METHOD_NOT_ALLOWED',
      'Invalid content type': 'INVALID_CONTENT_TYPE',
      'Invalid JSON': 'INVALID_JSON',
      'Invalid userId': 'INVALID_USER_ID',
      'Invalid UUID format': 'INVALID_UUID_FORMAT',
      'Configuration error': 'CONFIGURATION_ERROR',
      'User not found': 'USER_NOT_FOUND',
      'Database error': 'DATABASE_ERROR',
      'Profile not found': 'PROFILE_NOT_FOUND',
      'Rate limit exceeded': 'RATE_LIMITED',
      'Internal server error': 'INTERNAL_SERVER_ERROR'
    }

    return errorMap[errorString] || 'UNKNOWN_ERROR'
  }
}
