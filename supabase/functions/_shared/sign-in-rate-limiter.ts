// Rate limiting specifically for sign-in operations
// More restrictive than general API rate limiting

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  blockDurationMs?: number // How long to block after limit exceeded
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  blocked?: boolean
}

// In-memory store for rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, { count: number; windowStart: number; blockedUntil?: number }>()

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, data] of rateLimitStore.entries()) {
    // Remove entries older than 1 hour
    if (data.windowStart < now - (60 * 60 * 1000)) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000) // Clean every 5 minutes

export function checkSignInRateLimit(
  identifier: string, // Usually user ID or IP
  config: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 5, // Max 5 sign-in updates per minute
    blockDurationMs: 5 * 60 * 1000 // Block for 5 minutes if exceeded
  }
): RateLimitResult {
  const now = Date.now()
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs
  
  let data = rateLimitStore.get(identifier)
  
  // Initialize or reset if new window
  if (!data || data.windowStart < windowStart) {
    data = { count: 0, windowStart }
    rateLimitStore.set(identifier, data)
  }
  
  // Check if currently blocked
  if (data.blockedUntil && now < data.blockedUntil) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: data.blockedUntil,
      blocked: true
    }
  }
  
  // Remove block if expired
  if (data.blockedUntil && now >= data.blockedUntil) {
    delete data.blockedUntil
    data.count = 0 // Reset count when unblocking
  }
  
  // Check if limit exceeded
  if (data.count >= config.maxRequests) {
    // Set block if configured
    if (config.blockDurationMs) {
      data.blockedUntil = now + config.blockDurationMs
      rateLimitStore.set(identifier, data)
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: data.blockedUntil,
        blocked: true
      }
    }
    
    return {
      allowed: false,
      remaining: 0,
      resetTime: windowStart + config.windowMs
    }
  }
  
  // Increment count and allow
  data.count++
  rateLimitStore.set(identifier, data)
  
  return {
    allowed: true,
    remaining: config.maxRequests - data.count,
    resetTime: windowStart + config.windowMs
  }
}

// Get client IP from request (handles various proxy headers)
export function getClientIP(req: Request): string {
  // Check various headers in order of preference
  const headers = [
    'cf-connecting-ip', // Cloudflare
    'x-real-ip', // Nginx
    'x-forwarded-for', // Standard proxy header
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ]
  
  for (const header of headers) {
    const value = req.headers.get(header)
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(',')[0].trim()
      if (isValidIP(ip)) {
        return ip
      }
    }
  }
  
  // Fallback to 'unknown' if no IP found
  return 'unknown'
}

// Basic IP validation
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Regex = /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i
  
  if (ipv4Regex.test(ip)) {
    // Validate IPv4 octets
    const octets = ip.split('.')
    return octets.every(octet => {
      const num = parseInt(octet, 10)
      return num >= 0 && num <= 255
    })
  }
  
  return ipv6Regex.test(ip)
}

// Create rate limit key combining user ID and IP
export function createRateLimitKey(userId: string, ip: string): string {
  return `sign_in:${userId}:${ip}`
}
