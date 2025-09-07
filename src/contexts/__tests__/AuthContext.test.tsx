import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'
import { mockUser } from '@/test/utils'

// Mock Supabase client
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
  },
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}))

// Test component that uses AuthContext
const TestComponent = () => {
  const { user, loading, signOut } = useAuth()
  
  if (loading) return <div>Loading...</div>
  if (!user) return <div>Not authenticated</div>
  
  return (
    <div>
      <div>User: {user.email}</div>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provides loading state initially', () => {
    mockSupabase.auth.getSession.mockReturnValue(Promise.resolve({ data: { session: null }, error: null }))
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('provides user data when authenticated', async () => {
    mockSupabase.auth.getSession.mockReturnValue(
      Promise.resolve({ 
        data: { session: { user: mockUser } }, 
        error: null 
      })
    )
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(`User: ${mockUser.email}`)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('shows not authenticated when no user', async () => {
    mockSupabase.auth.getSession.mockReturnValue(
      Promise.resolve({ 
        data: { session: null }, 
        error: null 
      })
    )
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    })

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument()
    })
  })

  it('handles sign out', async () => {
    mockSupabase.auth.getSession.mockReturnValue(
      Promise.resolve({ 
        data: { session: { user: mockUser } }, 
        error: null 
      })
    )
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } }
    })
    mockSupabase.auth.signOut.mockReturnValue(Promise.resolve({ error: null }))

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      const signOutButton = screen.getByRole('button', { name: /sign out/i })
      signOutButton.click()
    })

    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
  })
})
