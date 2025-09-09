// CORS headers for Supabase Edge Functions
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours
}

// Production CORS headers - more restrictive
export const productionCorsHeaders = {
  'Access-Control-Allow-Origin': 'https://your-app-domain.com', // Replace with your actual domain
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Credentials': 'true',
}

// Helper function to get appropriate CORS headers based on environment
export function getCorsHeaders(origin?: string): Record<string, string> {
  const isDevelopment = Deno.env.get('ENVIRONMENT') !== 'production'
  
  if (isDevelopment) {
    return corsHeaders
  }
  
  // In production, validate origin
  const allowedOrigins = [
    'https://your-app-domain.com',
    'https://www.your-app-domain.com',
    // Add your actual domains here
  ]
  
  if (origin && allowedOrigins.includes(origin)) {
    return {
      ...productionCorsHeaders,
      'Access-Control-Allow-Origin': origin,
    }
  }
  
  // Default to first allowed origin if no match
  return productionCorsHeaders
}
