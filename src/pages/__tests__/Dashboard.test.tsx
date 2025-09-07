import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/utils'
import { useAuth } from '@/contexts/AuthContext'
import Dashboard from '../Dashboard'
import { mockUser, mockProfile, mockProject, mockClip } from '@/test/utils'

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
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  }
})

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: mockProfile, error: null })),
        order: vi.fn(() => Promise.resolve({ data: [mockProject], error: null })),
      })),
      order: vi.fn(() => Promise.resolve({ data: [mockClip], error: null })),
    })),
  })),
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}))

describe('Dashboard', () => {
  const mockUseAuth = useAuth as vi.MockedFunction<typeof useAuth>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to auth when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    })

    render(<Dashboard />)
    expect(screen.getByText('Redirecting to /auth')).toBeInTheDocument()
  })

  it('shows loading spinner when loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: true,
      signOut: vi.fn(),
    })

    render(<Dashboard />)
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument() // Loading spinner
  })

  it('renders dashboard content for authenticated user', async () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<Dashboard />)

    // Check if welcome message is displayed
    await waitFor(() => {
      expect(screen.getByText(/Welcome back/)).toBeInTheDocument()
    })

    // Check for quick actions
    expect(screen.getByText('Upload Video')).toBeInTheDocument()
    expect(screen.getByText('Quick Generate')).toBeInTheDocument()
    expect(screen.getByText('Analytics')).toBeInTheDocument()

    // Check for stats cards
    expect(screen.getByText('Total Projects')).toBeInTheDocument()
    expect(screen.getByText('Credits Remaining')).toBeInTheDocument()
    expect(screen.getByText('Subscription')).toBeInTheDocument()
  })

  it('displays user profile information correctly', async () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Welcome back, Test User!')).toBeInTheDocument()
    })

    expect(screen.getByText('free')).toBeInTheDocument()
    expect(screen.getByText('10 credits')).toBeInTheDocument()
  })

  it('shows no projects message when user has no projects', async () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    // Mock empty projects response
    const emptyMockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockProfile, error: null })),
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    }

    vi.mocked(mockSupabase.from).mockImplementation(emptyMockSupabase.from)

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('No projects yet')).toBeInTheDocument()
    })

    expect(screen.getByText('Upload your first video to start creating viral clips!')).toBeInTheDocument()
  })

  it('handles sign out correctly', async () => {
    const mockSignOut = vi.fn()
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: mockSignOut,
    })

    render(<Dashboard />)

    await waitFor(() => {
      const signOutButton = screen.getByRole('button', { name: /sign out/i })
      expect(signOutButton).toBeInTheDocument()
    })
  })

  it('shows upgrade button for free tier users', async () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('Upgrade')).toBeInTheDocument()
    })
  })
})
