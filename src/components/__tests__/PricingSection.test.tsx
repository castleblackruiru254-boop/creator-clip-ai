import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useAuth } from '@/contexts/AuthContext'
import PricingSection from '../PricingSection'
import { mockUser } from '@/test/utils'

// Mock the AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('PricingSection', () => {
  const mockUseAuth = useAuth as vi.MockedFunction<typeof useAuth>

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('renders all pricing plans correctly', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    })

    render(<PricingSection />)

    // Check if all plan names are displayed
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('Starter')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('Enterprise')).toBeInTheDocument()

    // Check pricing
    expect(screen.getByText('$0')).toBeInTheDocument()
    expect(screen.getByText('$7')).toBeInTheDocument()
    expect(screen.getByText('$12')).toBeInTheDocument()
    expect(screen.getByText('$29')).toBeInTheDocument()
  })

  it('shows "Most Popular" badge on starter plan', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    })

    render(<PricingSection />)
    expect(screen.getByText('Most Popular')).toBeInTheDocument()
  })

  it('displays all features for each plan', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    })

    render(<PricingSection />)

    // Check for some key features
    expect(screen.getByText('5 video exports per month')).toBeInTheDocument()
    expect(screen.getByText('15 video exports per month')).toBeInTheDocument()
    expect(screen.getByText('Unlimited exports')).toBeInTheDocument()
    expect(screen.getByText('Priority AI rendering')).toBeInTheDocument()
  })

  it('handles free plan selection for unauthenticated user', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    })

    render(<PricingSection />)

    const freeButton = screen.getByRole('button', { name: 'Start Free' })
    fireEvent.click(freeButton)

    expect(mockNavigate).toHaveBeenCalledWith('/auth')
  })

  it('handles free plan selection for authenticated user', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<PricingSection />)

    const freeButton = screen.getByRole('button', { name: 'Start Free' })
    fireEvent.click(freeButton)

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('handles paid plan selection', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    render(<PricingSection />)

    const starterButton = screen.getByRole('button', { name: 'Start Starter Plan' })
    fireEvent.click(starterButton)

    expect(mockNavigate).toHaveBeenCalledWith('/pricing')
  })

  it('handles enterprise plan selection', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signOut: vi.fn(),
    })

    // Mock document.getElementById for contact section
    const mockScrollIntoView = vi.fn()
    const mockGetElementById = vi.fn(() => ({
      scrollIntoView: mockScrollIntoView
    }))
    
    Object.defineProperty(document, 'getElementById', {
      value: mockGetElementById,
    })

    render(<PricingSection />)

    const enterpriseButton = screen.getByRole('button', { name: 'Contact Sales' })
    fireEvent.click(enterpriseButton)

    expect(mockGetElementById).toHaveBeenCalledWith('contact')
    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' })
  })

  it('shows money-back guarantee and other benefits', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signOut: vi.fn(),
    })

    render(<PricingSection />)

    expect(screen.getByText('✓ No setup fees')).toBeInTheDocument()
    expect(screen.getByText('✓ Cancel anytime')).toBeInTheDocument()
    expect(screen.getByText('✓ 30-day money-back guarantee')).toBeInTheDocument()
  })
})
