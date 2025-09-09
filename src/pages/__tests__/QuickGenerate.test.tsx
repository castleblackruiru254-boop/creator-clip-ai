import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/utils'
import userEvent from '@testing-library/user-event'
import { useAuth } from '@/contexts/AuthContext'
import QuickGenerate from '../QuickGenerate'
import { mockUser } from '@/test/utils'

// Mock the AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => <div>Redirecting to {to}</div>,
    useNavigate: () => vi.fn(),
  }
})

// Mock validation
vi.mock('@/lib/validation', () => ({
  SearchSchema: {},
  ProjectSchema: {},
  YouTubeUrlSchema: {},
  validateAndSanitize: vi.fn((data) => data),
}))

// Mock Supabase client
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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}))

describe('QuickGenerate', () => {
  const mockUseAuth = useAuth as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to auth when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    })

    render(<QuickGenerate />)
    expect(screen.getByText('Redirecting to /auth')).toBeInTheDocument()
  })

  it('shows loading spinner when loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
      signOut: vi.fn(),
    })

    render(<QuickGenerate />)
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument()
  })

  it('renders QuickGenerate content for authenticated user', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<QuickGenerate />)

    expect(screen.getByText('Quick Generate')).toBeInTheDocument()
    expect(screen.getByText('Upload by URL')).toBeInTheDocument()
    expect(screen.getByText('Search Videos')).toBeInTheDocument()
  })

  it('handles URL input and analysis', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    // Mock successful analysis response
    mockSupabase.functions.invoke.mockResolvedValue({
      data: {
        success: true,
        video: {
          id: 'test-video',
          title: 'Test Video',
          description: 'Test Description',
          thumbnail: 'https://example.com/thumb.jpg',
          duration: 'PT5M30S',
          publishedAt: new Date().toISOString(),
          channelTitle: 'Test Channel',
          viewCount: '1000',
          url: 'https://youtube.com/watch?v=test',
          durationSeconds: 330,
        },
        highlights: [
          {
            id: 'highlight-1',
            startTime: 10,
            endTime: 40,
            confidence: 0.9,
            type: 'hook',
            description: 'Engaging opening',
            suggestedTitle: 'Amazing Hook!',
            aiScore: 0.85,
            keywords: ['hook', 'engaging'],
            platform: 'tiktok'
          }
        ]
      },
      error: null,
    })

    render(<QuickGenerate />)

    // Find and fill URL input
    const urlInput = screen.getByPlaceholderText(/https:\/\/www\.youtube\.com/)
    await user.type(urlInput, 'https://youtube.com/watch?v=test')

    // Click analyze button
    const analyzeButton = screen.getByRole('button', { name: /analyze video/i })
    await user.click(analyzeButton)

    // Wait for analysis to complete and check for results
    await waitFor(() => {
      expect(screen.getByText('Video Analysis Complete')).toBeInTheDocument()
    })
  })

  it('handles search functionality', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    // Mock successful search response
    mockSupabase.functions.invoke.mockResolvedValue({
      data: {
        success: true,
        videos: [
          {
            id: 'video-1',
            title: 'Test Video 1',
            description: 'Test Description 1',
            thumbnail: 'https://example.com/thumb1.jpg',
            duration: 'PT3M30S',
            publishedAt: new Date().toISOString(),
            channelTitle: 'Test Channel 1',
            viewCount: '5000',
            url: 'https://youtube.com/watch?v=test1',
          }
        ]
      },
      error: null,
    })

    render(<QuickGenerate />)

    // Switch to search tab
    const searchTab = screen.getByRole('tab', { name: /search videos/i })
    await user.click(searchTab)

    // Find and fill search input
    const searchInput = screen.getByPlaceholderText(/search for videos/i)
    await user.type(searchInput, 'test query')

    // Click search button
    const searchButton = screen.getByRole('button', { name: /^search$/i })
    await user.click(searchButton)

    // Wait for search results
    await waitFor(() => {
      expect(screen.getByText('Search Results (1 videos)')).toBeInTheDocument()
    })
  })

  it('shows empty state when no URL is entered', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<QuickGenerate />)

    expect(screen.getByText('Paste YouTube URL')).toBeInTheDocument()
    expect(screen.getByText('Enter any YouTube video URL above and our AI will find the best viral moments automatically.')).toBeInTheDocument()
  })

  it('toggles search filters correctly', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<QuickGenerate />)

    // Switch to search tab
    const searchTab = screen.getByRole('tab', { name: /search videos/i })
    await user.click(searchTab)

    // Click filters button
    const filtersButton = screen.getByRole('button', { name: /filters/i })
    await user.click(filtersButton)

    // Check if filter options appear
    expect(screen.getByText('Published After')).toBeInTheDocument()
    expect(screen.getByText('Published Before')).toBeInTheDocument()
    expect(screen.getByText('Max Results')).toBeInTheDocument()
  })
})
