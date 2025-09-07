import { z } from 'zod';

// URL Validation
export const YouTubeUrlSchema = z.string()
  .url('Invalid URL format')
  .refine((url) => {
    try {
      const parsedUrl = new URL(url);
      return (
        parsedUrl.hostname === 'www.youtube.com' ||
        parsedUrl.hostname === 'youtube.com' ||
        parsedUrl.hostname === 'youtu.be' ||
        parsedUrl.hostname === 'm.youtube.com'
      );
    } catch {
      return false;
    }
  }, 'Must be a valid YouTube URL')
  .refine((url) => {
    try {
      const parsedUrl = new URL(url);
      // Check for video ID in various URL formats
      const videoId = parsedUrl.searchParams.get('v') || 
                     (parsedUrl.hostname === 'youtu.be' ? parsedUrl.pathname.slice(1) : null);
      return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
    } catch {
      return false;
    }
  }, 'URL must contain a valid YouTube video ID');

// Project Validation
export const ProjectSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters')
    .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Title contains invalid characters'),
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .regex(/^[a-zA-Z0-9\s\-_.,!?()\n\r]*$/, 'Description contains invalid characters')
    .optional(),
  videoUrl: YouTubeUrlSchema,
});

// Search Validation
export const SearchSchema = z.object({
  query: z.string()
    .min(1, 'Search query is required')
    .max(100, 'Search query must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_.,!?()]+$/, 'Search query contains invalid characters'),
  maxResults: z.number()
    .int('Must be an integer')
    .min(1, 'Must be at least 1')
    .max(50, 'Cannot exceed 50 results'),
  publishedAfter: z.string()
    .datetime('Invalid date format')
    .optional(),
  publishedBefore: z.string()
    .datetime('Invalid date format')
    .optional(),
});

// User Profile Validation
export const ProfileUpdateSchema = z.object({
  full_name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s\-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email is too long'),
});

// Auth Validation
export const SignUpSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email is too long')
    .toLowerCase(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain lowercase, uppercase, and number'),
  fullName: z.string()
    .min(1, 'Full name is required')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s\-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes'),
});

export const SignInSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email is too long')
    .toLowerCase(),
  password: z.string()
    .min(1, 'Password is required')
    .max(128, 'Password is too long'),
});

// Sanitization utilities
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .trim();
}

export function sanitizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Only allow HTTP(S) protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid URL protocol');
    }
    return parsedUrl.toString();
  } catch {
    throw new Error('Invalid URL format');
  }
}

// YouTube Video ID extraction with validation
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const sanitizedUrl = sanitizeUrl(url);
    const parsedUrl = new URL(sanitizedUrl);
    
    // Handle different YouTube URL formats
    if (parsedUrl.hostname === 'youtu.be') {
      const videoId = parsedUrl.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
    }
    
    if (parsedUrl.hostname.includes('youtube.com')) {
      const videoId = parsedUrl.searchParams.get('v');
      return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
    }
    
    return null;
  } catch {
    return null;
  }
}

// Rate limiting helpers
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
}

export const rateLimitConfigs: Record<string, RateLimitConfig> = {
  search: { maxRequests: 50, windowMs: 60 * 1000 }, // 50 requests per minute
  processVideo: { maxRequests: 5, windowMs: 60 * 1000 }, // 5 videos per minute
  auth: { maxRequests: 10, windowMs: 15 * 60 * 1000 }, // 10 auth attempts per 15 minutes
  default: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
};

// Content Security Policy helpers
export const getSecurityHeaders = () => ({
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "media-src 'self' https:",
    "connect-src 'self' https://*.supabase.co https://api.openai.com https://www.googleapis.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});

// Error handling with proper logging
export function createSafeError(message: string, code?: string): Error & { code?: string } {
  const error = new Error(sanitizeString(message)) as Error & { code?: string };
  if (code) {
    error.code = code;
  }
  return error;
}

// Input validation wrapper
export function validateAndSanitize<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw createSafeError(`Validation failed: ${errorMessage}`, 'VALIDATION_ERROR');
    }
    throw createSafeError('Invalid input data', 'VALIDATION_ERROR');
  }
}
