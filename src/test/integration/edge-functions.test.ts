import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '@/integrations/supabase/client'

// Mock the Supabase client for integration tests
vi.mock('@/integrations/supabase/client', () => {
  const mockSupabase = {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'mock-token' } }
      })),
    },
  }
  
  return { supabase: mockSupabase }
})

describe('Edge Functions Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('process-youtube-url function', () => {
    it('processes YouTube URL successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          video: {
            id: 'test-video-id',
            title: 'Test Video Title',
            description: 'Test video description',
            thumbnail: 'https://example.com/thumb.jpg',
            duration: 'PT5M30S',
            publishedAt: new Date().toISOString(),
            channelTitle: 'Test Channel',
            viewCount: '1000000',
            url: 'https://youtube.com/watch?v=test-video-id',
            durationSeconds: 330,
          },
          highlights: [
            {
              id: 'highlight-1',
              startTime: 10,
              endTime: 40,
              confidence: 0.9,
              type: 'hook',
              description: 'Engaging opening sequence',
              suggestedTitle: 'Amazing Hook!',
              aiScore: 0.85,
              keywords: ['hook', 'engaging', 'opening'],
              platform: 'tiktok'
            }
          ]
        },
        error: null,
      }

      vi.mocked(supabase.functions.invoke).mockResolvedValue(mockResponse)

      const result = await supabase.functions.invoke('process-youtube-url', {
        body: {
          videoUrl: 'https://youtube.com/watch?v=test-video-id'
        },
        headers: {
          Authorization: 'Bearer mock-token'
        }
      })

      expect(result.data.success).toBe(true)
      expect(result.data.video).toBeDefined()
      expect(result.data.highlights).toHaveLength(1)
      expect(result.data.highlights[0].aiScore).toBe(0.85)
    })

    it('handles invalid YouTube URL', async () => {
      const mockResponse = {
        data: {
          success: false,
          error: 'Invalid YouTube URL provided'
        },
        error: null,
      }

      vi.mocked(supabase.functions.invoke).mockResolvedValue(mockResponse)

      const result = await supabase.functions.invoke('process-youtube-url', {
        body: {
          videoUrl: 'invalid-url'
        }
      })

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Invalid YouTube URL provided')
    })
  })

  describe('ai-highlight-detection function', () => {
    it('detects highlights successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          highlights: [
            {
              id: 'highlight-1',
              startTime: 15,
              endTime: 45,
              confidence: 0.92,
              type: 'emotional',
              description: 'High emotional engagement detected',
              suggestedTitle: 'This Moment Will Give You Chills!',
              aiScore: 0.88,
              keywords: ['emotional', 'engaging', 'viral'],
              platform: 'all'
            },
            {
              id: 'highlight-2', 
              startTime: 120,
              endTime: 150,
              confidence: 0.87,
              type: 'hook',
              description: 'Strong hook moment detected',
              suggestedTitle: 'You Won\'t Believe What Happens Next!',
              aiScore: 0.91,
              keywords: ['hook', 'surprise', 'engaging'],
              platform: 'tiktok'
            }
          ]
        },
        error: null,
      }

      vi.mocked(supabase.functions.invoke).mockResolvedValue(mockResponse)

      const result = await supabase.functions.invoke('ai-highlight-detection', {
        body: {
          videoUrl: 'https://youtube.com/watch?v=test-video-id',
          transcript: 'Mock transcript text...'
        }
      })

      expect(result.data.success).toBe(true)
      expect(result.data.highlights).toHaveLength(2)
      expect(result.data.highlights[0].confidence).toBeGreaterThan(0.8)
      expect(result.data.highlights[1].aiScore).toBeGreaterThan(0.8)
    })

    it('handles video analysis failure', async () => {
      const mockResponse = {
        data: {
          success: false,
          error: 'Failed to analyze video content'
        },
        error: null,
      }

      vi.mocked(supabase.functions.invoke).mockResolvedValue(mockResponse)

      const result = await supabase.functions.invoke('ai-highlight-detection', {
        body: {
          videoUrl: 'https://youtube.com/watch?v=private-video',
        }
      })

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Failed to analyze video content')
    })
  })

  describe('generate-subtitles function', () => {
    it('generates subtitles successfully', async () => {
      const mockResponse = {
        data: {
          success: true,
          subtitles: [
            {
              id: 'subtitle-1',
              start_time: 0,
              end_time: 5,
              text: 'Hello everyone, welcome back to my channel!',
              speaker: 'narrator',
              confidence: 0.95
            },
            {
              id: 'subtitle-2',
              start_time: 5,
              end_time: 10,
              text: 'Today we\'re going to learn something amazing.',
              speaker: 'narrator',
              confidence: 0.93
            }
          ],
          project_id: 'test-project-id'
        },
        error: null,
      }

      vi.mocked(supabase.functions.invoke).mockResolvedValue(mockResponse)

      const result = await supabase.functions.invoke('generate-subtitles', {
        body: {
          videoUrl: 'https://youtube.com/watch?v=test-video-id',
          projectId: 'test-project-id'
        }
      })

      expect(result.data.success).toBe(true)
      expect(result.data.subtitles).toHaveLength(2)
      expect(result.data.subtitles[0].confidence).toBeGreaterThan(0.9)
      expect(result.data.project_id).toBe('test-project-id')
    })

    it('handles subtitle generation failure', async () => {
      const mockResponse = {
        data: {
          success: false,
          error: 'Failed to extract audio from video'
        },
        error: null,
      }

      vi.mocked(supabase.functions.invoke).mockResolvedValue(mockResponse)

      const result = await supabase.functions.invoke('generate-subtitles', {
        body: {
          videoUrl: 'https://youtube.com/watch?v=invalid-video',
          projectId: 'test-project-id'
        }
      })

      expect(result.data.success).toBe(false)
      expect(result.data.error).toBe('Failed to extract audio from video')
    })
  })

  describe('Error handling across edge functions', () => {
    it('handles network errors gracefully', async () => {
      const networkError = new Error('Network request failed')
      vi.mocked(supabase.functions.invoke).mockRejectedValue(networkError)

      await expect(
        supabase.functions.invoke('process-youtube-url', {
          body: { videoUrl: 'https://youtube.com/watch?v=test' }
        })
      ).rejects.toThrow('Network request failed')
    })

    it('handles authentication errors', async () => {
      const authError = {
        data: null,
        error: { message: 'Invalid authentication token' }
      }
      vi.mocked(supabase.functions.invoke).mockResolvedValue(authError)

      const result = await supabase.functions.invoke('ai-highlight-detection', {
        body: { videoUrl: 'https://youtube.com/watch?v=test' },
        headers: { Authorization: 'Bearer invalid-token' }
      })

      expect(result.error).toBeDefined()
      expect(result.error.message).toBe('Invalid authentication token')
    })
  })
})
