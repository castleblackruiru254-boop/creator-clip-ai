import { describe, it, expect } from 'vitest'
import { 
  YouTubeUrlSchema,
  ProjectSchema,
  SearchSchema,
  SignUpSchema,
  SignInSchema,
  sanitizeString,
  sanitizeUrl,
  extractYouTubeVideoId,
  validateAndSanitize,
  createSafeError,
  getSecurityHeaders
} from '../validation'

describe('YouTube URL Validation', () => {
  it('validates correct YouTube URLs', () => {
    const validUrls = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    ]

    validUrls.forEach(url => {
      expect(() => YouTubeUrlSchema.parse(url)).not.toThrow()
    })
  })

  it('rejects invalid URLs', () => {
    const invalidUrls = [
      'not-a-url',
      'https://google.com',
      'https://youtube.com/watch', // No video ID
      'https://youtube.com/watch?v=invalid', // Invalid video ID format
      'javascript:alert(1)', // XSS attempt
    ]

    invalidUrls.forEach(url => {
      expect(() => YouTubeUrlSchema.parse(url)).toThrow()
    })
  })
})

describe('Project Schema Validation', () => {
  it('validates correct project data', () => {
    const validProject = {
      title: 'My Test Project',
      description: 'A great project description.',
      videoUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ'
    }

    expect(() => ProjectSchema.parse(validProject)).not.toThrow()
  })

  it('rejects invalid project data', () => {
    const invalidProjects = [
      { title: '', videoUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ' }, // Empty title
      { title: 'Valid Title', videoUrl: 'invalid-url' }, // Invalid URL
      { title: 'Title<script>', videoUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ' }, // XSS in title
    ]

    invalidProjects.forEach(project => {
      expect(() => ProjectSchema.parse(project)).toThrow()
    })
  })
})

describe('Search Schema Validation', () => {
  it('validates correct search data', () => {
    const validSearch = {
      query: 'test search',
      maxResults: 25,
      publishedAfter: new Date().toISOString(),
    }

    expect(() => SearchSchema.parse(validSearch)).not.toThrow()
  })

  it('rejects invalid search data', () => {
    const invalidSearches = [
      { query: '', maxResults: 25 }, // Empty query
      { query: 'valid', maxResults: 0 }, // Invalid max results
      { query: 'valid', maxResults: 51 }, // Too many results
      { query: 'query<script>', maxResults: 25 }, // XSS in query
    ]

    invalidSearches.forEach(search => {
      expect(() => SearchSchema.parse(search)).toThrow()
    })
  })
})

describe('Authentication Schema Validation', () => {
  it('validates correct sign up data', () => {
    const validSignUp = {
      email: 'test@example.com',
      password: 'SecurePass123',
      fullName: 'John Doe'
    }

    expect(() => SignUpSchema.parse(validSignUp)).not.toThrow()
  })

  it('validates correct sign in data', () => {
    const validSignIn = {
      email: 'test@example.com',
      password: 'any-password'
    }

    expect(() => SignInSchema.parse(validSignIn)).not.toThrow()
  })

  it('rejects weak passwords in sign up', () => {
    const weakPasswords = [
      'short', // Too short
      'alllowercase123', // No uppercase
      'ALLUPPERCASE123', // No lowercase
      'NoNumbers!', // No numbers
    ]

    weakPasswords.forEach(password => {
      expect(() => SignUpSchema.parse({
        email: 'test@example.com',
        password,
        fullName: 'John Doe'
      })).toThrow()
    })
  })
})

describe('Sanitization Functions', () => {
  it('sanitizes strings correctly', () => {
    expect(sanitizeString('  normal text  ')).toBe('normal text')
    expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script')
    expect(sanitizeString('javascript:alert(1)')).toBe('alert(1)')
    expect(sanitizeString('data:text/html,<script>')).toBe('text/html,script')
  })

  it('sanitizes URLs correctly', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/')
    expect(() => sanitizeUrl('javascript:alert(1)')).toThrow('Invalid URL format')
    expect(() => sanitizeUrl('not-a-url')).toThrow('Invalid URL format')
  })
})

describe('YouTube Video ID Extraction', () => {
  it('extracts video ID from different YouTube URL formats', () => {
    expect(extractYouTubeVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ')
  })

  it('returns null for invalid URLs', () => {
    expect(extractYouTubeVideoId('https://google.com')).toBeNull()
    expect(extractYouTubeVideoId('not-a-url')).toBeNull()
    expect(extractYouTubeVideoId('https://youtube.com/watch?v=invalid')).toBeNull()
  })
})

describe('Validation Wrapper', () => {
  it('validates and returns data for valid input', () => {
    const schema = YouTubeUrlSchema
    const validUrl = 'https://youtube.com/watch?v=dQw4w9WgXcQ'
    
    const result = validateAndSanitize(schema, validUrl)
    expect(result).toBe(validUrl)
  })

  it('throws safe error for invalid input', () => {
    const schema = YouTubeUrlSchema
    const invalidUrl = 'invalid-url'
    
    expect(() => validateAndSanitize(schema, invalidUrl)).toThrow('Validation failed')
  })
})

describe('Security Utilities', () => {
  it('creates safe errors with sanitized messages', () => {
    const error = createSafeError('<script>alert(1)</script>', 'TEST_CODE')
    expect(error.message).toBe('scriptalert(1)/script')
    expect(error.code).toBe('TEST_CODE')
  })

  it('generates security headers correctly', () => {
    const headers = getSecurityHeaders()
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'")
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })
})
