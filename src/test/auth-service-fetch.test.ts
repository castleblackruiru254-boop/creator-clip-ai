import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AuthService } from '@/lib/auth-service'
import { supabase } from '@/integrations/supabase/client'

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn()
    }
  }
}))

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_SUPABASE_URL: 'https://test-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key'
  }
})

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

const mockSupabase = supabase as any

describe('AuthService with HTTP Fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default session mock
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('updateLastSignIn', () => {
    const validUserId = '550e8400-e29b-41d4-a716-446655440000'
    const invalidUserId = 'invalid-uuid'

    it('should reject invalid user ID', async () => {
      const result = await AuthService.updateLastSignIn('')
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_USER_ID')
    })

    it('should reject invalid UUID format', async () => {
      const result = await AuthService.updateLastSignIn(invalidUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_UUID_FORMAT')
    })

    it('should successfully update last sign-in timestamp', async () => {
      // Mock successful fetch response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Last sign-in timestamp updated successfully',
          timestamp: '2024-01-01T12:00:00.000Z'
        })
      })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-project.supabase.co/functions/v1/update-last-sign-in',
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
            'apikey': 'test-anon-key'
          },
          body: JSON.stringify({ userId: validUserId })
        }
      )
    })

    it('should handle rate limiting', async () => {
      // Mock 429 rate limit response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (header: string) => header === 'Retry-After' ? '60' : null
        },
        text: async () => JSON.stringify({
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many requests',
          retryAfter: 60
        })
      })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('RATE_LIMITED')
      expect(result.error?.details.retryAfter).toBe(60)
    })

    it('should handle user not found error', async () => {
      // Mock successful HTTP response but application error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'User not found',
          message: 'The specified user does not exist'
        })
      })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('USER_NOT_FOUND')
    })

    it('should handle network errors with retry', async () => {
      // Mock network failures for first two attempts, then success
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            message: 'Success after retry',
            timestamp: '2024-01-01T12:00:00.000Z'
          })
        })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    }, 10000) // 10 second timeout for retry delays

    it('should fail after max retry attempts', async () => {
      // Mock network failures for all attempts
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('NETWORK_ERROR')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    }, 10000) // 10 second timeout for retry delays

    it('should handle HTTP error responses', async () => {
      // Mock 404 error response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Function not found'
      })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('HTTP_ERROR')
      expect(result.error?.details.status).toBe(404)
    })
  })

  describe('updateCurrentUserLastSignIn', () => {
    const validUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com'
    }

    it('should update last sign-in for current user', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: validUser },
        error: null
      })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Success',
          timestamp: '2024-01-01T12:00:00.000Z'
        })
      })

      const result = await AuthService.updateCurrentUserLastSignIn()
      
      expect(result.success).toBe(true)
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    })

    it('should handle no authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null
      })

      const result = await AuthService.updateCurrentUserLastSignIn()
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('NO_AUTHENTICATED_USER')
    })

    it('should handle session error', async () => {
      mockSupabase.auth.getUser.mockRejectedValueOnce(new Error('Session expired'))

      const result = await AuthService.updateCurrentUserLastSignIn()
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('SESSION_ERROR')
    })
  })

  describe('onSignInSuccess', () => {
    const validUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com'
    }

    it('should call updateLastSignIn with provided userId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Success',
          timestamp: '2024-01-01T12:00:00.000Z'
        })
      })

      // Should not throw even if it fails
      await expect(AuthService.onSignInSuccess(validUser.id)).resolves.toBeUndefined()
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-project.supabase.co/functions/v1/update-last-sign-in',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ userId: validUser.id })
        })
      )
    })

    it('should get user from session if no userId provided', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: validUser },
        error: null
      })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Success',
          timestamp: '2024-01-01T12:00:00.000Z'
        })
      })

      await AuthService.onSignInSuccess()
      
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should handle errors gracefully without throwing', async () => {
      mockSupabase.auth.getUser.mockRejectedValueOnce(new Error('Session error'))

      // Should not throw
      await expect(AuthService.onSignInSuccess()).resolves.toBeUndefined()
    })

    it('should log but not throw on update failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: validUser },
        error: null
      })
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Database error',
          message: 'Failed to update'
        })
      })

      await AuthService.onSignInSuccess()
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to update last_sign_in:',
        expect.objectContaining({ code: 'DATABASE_ERROR' })
      )
      
      consoleSpy.mockRestore()
    })
  })
})
