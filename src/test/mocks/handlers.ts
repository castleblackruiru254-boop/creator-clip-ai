import { http, HttpResponse } from 'msw'

export const handlers = [
  // Supabase API mocks
  http.post('*/auth/v1/session', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      user: {
        id: 'mock-user-id',
        email: 'test@example.com',
        user_metadata: { full_name: 'Test User' }
      }
    })
  }),

  http.get('*/rest/v1/profiles', () => {
    return HttpResponse.json([
      {
        id: 'mock-user-id',
        email: 'test@example.com',
        full_name: 'Test User',
        subscription_tier: 'free',
        credits_remaining: 10
      }
    ])
  }),

  http.get('*/rest/v1/projects', () => {
    return HttpResponse.json([
      {
        id: 'project-1',
        title: 'Test Project',
        description: 'A test project',
        status: 'completed',
        created_at: new Date().toISOString(),
        source_video_url: 'https://youtube.com/watch?v=test',
        source_video_duration: 300
      }
    ])
  }),

  http.get('*/rest/v1/clips', () => {
    return HttpResponse.json([
      {
        id: 'clip-1',
        title: 'Test Clip',
        video_url: 'https://example.com/clip.mp4',
        thumbnail_url: 'https://example.com/thumb.jpg',
        duration: 30,
        platform: 'tiktok',
        ai_score: 0.85,
        status: 'completed',
        start_time: 10,
        end_time: 40,
        created_at: new Date().toISOString()
      }
    ])
  }),

  // Edge function mocks
  http.post('*/functions/v1/process-youtube-url', () => {
    return HttpResponse.json({
      project_id: 'new-project-id',
      message: 'Video processing started'
    })
  }),

  http.post('*/functions/v1/ai-highlight-detection', () => {
    return HttpResponse.json({
      highlights: [
        {
          start_time: 10,
          end_time: 40,
          confidence: 0.9,
          description: 'Exciting moment detected'
        }
      ]
    })
  }),

  http.post('*/functions/v1/generate-subtitles', () => {
    return HttpResponse.json({
      subtitles: [
        {
          start_time: 0,
          end_time: 5,
          text: 'Hello world'
        }
      ]
    })
  })
]
