interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  error?: string;
}

// Simple in-memory rate limiter (for production, consider Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = `${identifier}`;
  
  // Clean expired entries
  if (rateLimitStore.has(key)) {
    const entry = rateLimitStore.get(key)!;
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
  
  const entry = rateLimitStore.get(key);
  
  if (!entry) {
    // First request in window
    const resetTime = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
    };
  }
  
  if (entry.count >= config.maxRequests) {
    // Rate limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      error: `Rate limit exceeded. Max ${config.maxRequests} requests per ${Math.floor(config.windowMs / 1000)} seconds.`,
    };
  }
  
  // Increment counter
  entry.count++;
  rateLimitStore.set(key, entry);
  
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

export const rateLimitConfigs = {
  search: { maxRequests: 50, windowMs: 60 * 1000 }, // 50 per minute
  processVideo: { maxRequests: 3, windowMs: 60 * 1000 }, // 3 per minute (expensive operation)
  aiAnalysis: { maxRequests: 10, windowMs: 60 * 1000 }, // 10 per minute
  auth: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 per 15 minutes
  default: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 per minute
} satisfies Record<string, RateLimitConfig>;

export async function enforceRateLimit(
  request: Request,
  operation: keyof typeof rateLimitConfigs,
  userId?: string
): Promise<{ success: true } | { success: false; response: Response }> {
  // Create identifier based on user ID or IP
  const identifier = userId || getClientIdentifier(request);
  const config = rateLimitConfigs[operation];
  
  const result = await checkRateLimit(identifier, config);
  
  if (!result.allowed) {
    const response = new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: result.error,
        resetTime: result.resetTime,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
          'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
        },
      }
    );
    
    return { success: false, response };
  }
  
  return { success: true };
}

function getClientIdentifier(request: Request): string {
  // Try to get IP from various headers (for different hosting providers)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  const ip = cfConnectingIp || realIp || forwarded?.split(',')[0] || 'unknown';
  return `ip:${ip}`;
}

// Enhanced rate limiting with user subscription tiers
export function getRateLimitForUser(
  operation: keyof typeof rateLimitConfigs,
  subscriptionTier: string = 'free'
): RateLimitConfig {
  const baseConfig = rateLimitConfigs[operation];
  
  // Increase limits for paid users
  const multiplier = getSubscriptionMultiplier(subscriptionTier);
  
  return {
    ...baseConfig,
    maxRequests: Math.floor(baseConfig.maxRequests * multiplier),
  };
}

function getSubscriptionMultiplier(tier: string): number {
  switch (tier) {
    case 'starter': return 2;
    case 'pro': return 5;
    case 'enterprise': return 10;
    default: return 1; // free tier
  }
}

// Cleanup function to prevent memory leaks
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Periodic cleanup (call this in a timer or worker)
setInterval(cleanupRateLimitStore, 60 * 1000); // Cleanup every minute
