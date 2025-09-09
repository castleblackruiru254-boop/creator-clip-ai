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

export class AuthService {
  private static readonly EDGE_FUNCTION_NAME = 'update-last-sign-in'
  private static readonly MAX_RETRY_ATTEMPTS = 3
  private static readonly BASE_RETRY_DELAY = 1000 // 1 second
  
  // Get Supabase project URL and anon key from the client
  private static getSupabaseConfig() {
    // Extract from the existing supabase client configuration
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !anonKey) {
      throw new Error('Supabase configuration not found')
    }
    
    return { supabaseUrl, anonKey }
  }

  /**
   * Update the user's last sign-in timestamp securely via Edge Function
   * @param userId - The user's UUID
   * @returns Promise with success status
   */
  static async updateLastSignIn(userId: string): Promise<{ success: boolean; error?: AuthServiceError }> {
    if (!userId || typeof userId !== 'string') {
      return {
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'User ID is required and must be a string'
        }
      }
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      return {
        success: false,
        error: {
          code: 'INVALID_UUID_FORMAT',
          message: 'User ID must be a valid UUID'
        }
      }
    }

    let lastError: AuthServiceError | null = null

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const { supabaseUrl, anonKey } = this.getSupabaseConfig()
        
        // Construct the Edge Function URL
        const functionUrl = `${supabaseUrl}/functions/v1/${this.EDGE_FUNCTION_NAME}`
        
        // Get current user session for authorization
        const { data: { session } } = await supabase.auth.getSession()
        const authToken = session?.access_token || anonKey
        
        // Make direct HTTP request to Edge Function
        const response = await fetch(functionUrl, {
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
          let errorData: UpdateLastSignInResponse | null = null
          
          try {
            errorData = JSON.parse(errorText) as UpdateLastSignInResponse
          } catch {
            // Not JSON, create error from status
          }
          
          const httpError: AuthServiceError = {
            code: response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
            message: errorData?.message || `HTTP ${response.status}: ${response.statusText}`,
            details: { status: response.status, statusText: response.statusText, body: errorText }
          }
          
          // Handle rate limiting specifically
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
            console.warn(`Rate limited. Retry after ${retryAfter} seconds`)
            
            return {
              success: false,
              error: {
                code: 'RATE_LIMITED',
                message: errorData?.message || 'Rate limit exceeded',
                details: { retryAfter }
              }
            }
          }
          
          // Check if retryable - inline check instead of method
          const retryableStatuses = [500, 502, 503, 504];
          const isRetryable = retryableStatuses.includes(response.status);
            if (isRetryable && attempt < this.MAX_RETRY_ATTEMPTS) {
            lastError = {
              code: 'HTTP_ERROR',
              message: `HTTP ${response.status}: ${response.statusText}`,
              details: { status: response.status, body: errorText }
            };
            await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1));
            continue
          } else {
            // Don't retry, return error immediately
            return {
              success: false,
              error: httpError
            }
          }
        }
        
        // Parse successful response
        const data: UpdateLastSignInResponse = await response.json()
        
        if (!data.success) {
          // Handle application-level errors
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
        console.log(`Successfully updated last_sign_in for user ${userId} at ${data.timestamp}`)
        return { success: true }
        
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error)
        lastError = {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error occurred',
          details: error
        }
        
        // Wait before retry if not the last attempt
        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          await this.delay(this.BASE_RETRY_DELAY * Math.pow(2, attempt - 1))
        }
      }
    }

    // All attempts failed
    return {
      success: false,
      error: lastError || {
        code: 'UNKNOWN_ERROR',
        message: 'Failed to update last sign-in after all retry attempts'
      }
    }
  }

  /**
   * Update last sign-in with current user from session
   */
  static async updateCurrentUserLastSignIn(): Promise<{ success: boolean; error?: AuthServiceError }> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return {
          success: false,
          error: {
            code: 'NO_AUTHENTICATED_USER',
            message: 'No authenticated user found'
          }
        }
      }

      return await this.updateLastSignIn(user.id)
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SESSION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get user session',
          details: error
        }
      }
    }
  }

  /**
   * Call this after successful sign-in to update timestamp
   * This is the main method you'll use in your auth flow
   */
  static async onSignInSuccess(userId?: string): Promise<void> {
    try {
      const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id
      
      if (!targetUserId) {
        console.error('No user ID available for last_sign_in update')
        return
      }

      const result = await this.updateLastSignIn(targetUserId)
      
      if (!result.success) {
        // Log error but don't throw - this shouldn't block the sign-in process
        console.error('Failed to update last_sign_in:', result.error)
        
        // You could add telemetry/monitoring here
        // analytics.track('last_sign_in_update_failed', { error: result.error })
      }
    } catch (error) {
      // Catch-all to ensure sign-in process isn't disrupted
      console.error('Unexpected error updating last_sign_in:', error)
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
