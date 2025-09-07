import React, { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options })

export * from '@testing-library/react'
export { customRender as render }

// Mock user for authenticated tests
export const mockUser = {
  id: 'mock-user-id',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
}

// Mock profile data
export const mockProfile = {
  id: 'mock-user-id',
  email: 'test@example.com',
  full_name: 'Test User',
  subscription_tier: 'free',
  credits_remaining: 10,
}

// Mock project data
export const mockProject = {
  id: 'project-1',
  title: 'Test Project',
  description: 'A test project',
  status: 'completed',
  created_at: new Date().toISOString(),
  source_video_url: 'https://youtube.com/watch?v=test',
  source_video_duration: 300,
}

// Mock clip data
export const mockClip = {
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
  created_at: new Date().toISOString(),
}
