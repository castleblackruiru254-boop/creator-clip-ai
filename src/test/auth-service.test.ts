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
vi.mock('import.meta.env', () => ({
  VITE_SUPABASE_URL: 'https://test-project.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key'
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

const mockSupabase = supabase as any

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      // Mock successful session
      mockSupabase.auth.getSession.mockResolvedValueOnce({
        data: { session: { access_token: 'test-token' } },
        error: null
      })
      
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
      // Mock session
      mockSupabase.auth.getSession.mockResolvedValueOnce({
        data: { session: { access_token: 'test-token' } },
        error: null
      })
      
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
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'User not found',
          message: 'The specified user does not exist'
        },
        error: null
      })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('USER_NOT_FOUND')
    })

    it('should handle network errors with retry', async () => {
      // Mock network failures for first two attempts, then success
      mockSupabase.functions.invoke
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: {
            success: true,
            message: 'Success after retry',
            timestamp: '2024-01-01T12:00:00.000Z'
          },
          error: null
        })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(true)
      expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(3)
    })

    it('should fail after max retry attempts', async () => {
      // Mock network failures for all attempts
      mockSupabase.functions.invoke
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('NETWORK_ERROR')
      expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(3)
    })

    it('should handle Supabase function invoke error', async () => {
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Function not found',
          code: 'FUNCTION_NOT_FOUND'
        }
      })

      const result = await AuthService.updateLastSignIn(validUserId)
      
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('FUNCTION_INVOKE_ERROR')
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
      
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Success',
          timestamp: '2024-01-01T12:00:00.000Z'
        },
        error: null
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
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Success',
          timestamp: '2024-01-01T12:00:00.000Z'
        },
        error: null
      })

      // Should not throw even if it fails
      await expect(AuthService.onSignInSuccess(validUser.id)).resolves.toBeUndefined()
      
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        'update-last-sign-in',
        {
          body: { userId: validUser.id },
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    })

    it('should get user from session if no userId provided', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: validUser },
        error: null
      })
      
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Success',
          timestamp: '2024-01-01T12:00:00.000Z'
        },
        error: null
      })

      await AuthService.onSignInSuccess()
      
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
      expect(mockSupabase.functions.invoke).toHaveBeenCalled()
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
      
      mockSupabase.functions.invoke.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Database error',
          message: 'Failed to update'
        },
        error: null
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
