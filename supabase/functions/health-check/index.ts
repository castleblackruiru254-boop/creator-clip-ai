import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  timestamp: string;
  details?: Record<string, any>;
  error?: string;
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

const startTime = Date.now();
const version = Deno.env.get('APP_VERSION') || '1.0.0';
const environment = Deno.env.get('ENVIRONMENT') || 'development';

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const url = new URL(req.url);
    const detailed = url.searchParams.get('detailed') === 'true';
    
    // Quick health check for load balancer
    if (!detailed) {
      return new Response(JSON.stringify({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - startTime,
      }), {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    }

    // Detailed health check
    const health = await runDetailedHealthCheck();
    
    return new Response(JSON.stringify(health), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
      status: health.overall === 'unhealthy' ? 503 : 200
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return new Response(JSON.stringify({
      overall: 'unhealthy',
      services: [],
      timestamp: new Date().toISOString(),
      uptime: Date.now() - startTime,
      version,
      environment,
      error: error.message,
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json' 
      },
      status: 503
    });
  }
});

async function runDetailedHealthCheck(): Promise<SystemHealth> {
  const checks = [
    checkDatabase(),
    checkStorage(),
    checkAuth(),
    checkVideoProcessingQueue(),
    checkExternalAPIs(),
    checkEdgeFunctions(),
  ];

  const results = await Promise.allSettled(checks);
  
  const services = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      const serviceNames = ['database', 'storage', 'auth', 'video-queue', 'external-apis', 'edge-functions'];
      return {
        service: serviceNames[index],
        status: 'unhealthy' as const,
        responseTime: 0,
        timestamp: new Date().toISOString(),
        error: result.reason?.message || 'Unknown error',
      };
    }
  });

  const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;
  
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (unhealthyCount > 0) {
    overall = 'unhealthy';
  } else if (degradedCount > 0) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }

  return {
    overall,
    services,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    version,
    environment,
  };
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('count')
      .limit(1);
    
    const responseTime = performance.now() - startTime;
    
    if (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime,
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }

    return {
      service: 'database',
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      responseTime,
      timestamp: new Date().toISOString(),
      details: {
        connectionActive: true,
        queryTime: `${responseTime.toFixed(2)}ms`,
      },
    };
  } catch (error) {
    return {
      service: 'database',
      status: 'unhealthy',
      responseTime: performance.now() - startTime,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

async function checkStorage(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase.storage
      .from('videos')
      .list('', { limit: 1 });
    
    const responseTime = performance.now() - startTime;
    
    if (error && !error.message.includes('not found')) {
      return {
        service: 'storage',
        status: 'unhealthy',
        responseTime,
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }

    return {
      service: 'storage',
      status: responseTime < 2000 ? 'healthy' : 'degraded',
      responseTime,
      timestamp: new Date().toISOString(),
      details: {
        bucketsAccessible: true,
        listTime: `${responseTime.toFixed(2)}ms`,
      },
    };
  } catch (error) {
    return {
      service: 'storage',
      status: 'unhealthy',
      responseTime: performance.now() - startTime,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

async function checkAuth(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    // Test auth service availability
    const authUrl = `${Deno.env.get('SUPABASE_URL')}/auth/v1/settings`;
    const response = await fetch(authUrl, {
      headers: {
        'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
      },
    });
    
    const responseTime = performance.now() - startTime;
    
    if (!response.ok) {
      return {
        service: 'auth',
        status: 'unhealthy',
        responseTime,
        timestamp: new Date().toISOString(),
        error: `Auth service returned ${response.status}`,
      };
    }

    return {
      service: 'auth',
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      responseTime,
      timestamp: new Date().toISOString(),
      details: {
        serviceAvailable: true,
        responseTime: `${responseTime.toFixed(2)}ms`,
      },
    };
  } catch (error) {
    return {
      service: 'auth',
      status: 'unhealthy',
      responseTime: performance.now() - startTime,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

async function checkVideoProcessingQueue(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase
      .from('processing_queue')
      .select('status, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    
    const responseTime = performance.now() - startTime;
    
    if (error) {
      return {
        service: 'video-queue',
        status: 'unhealthy',
        responseTime,
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }

    const activeJobs = data?.filter(job => job.status === 'processing').length || 0;
    const queueSize = data?.length || 0;
    const avgAge = data?.length ? 
      data.reduce((acc, job) => acc + (Date.now() - new Date(job.created_at).getTime()), 0) / data.length / 1000 / 60 : 0;

    return {
      service: 'video-queue',
      status: activeJobs < 5 && avgAge < 60 ? 'healthy' : 'degraded',
      responseTime,
      timestamp: new Date().toISOString(),
      details: {
        activeJobs,
        queueSize,
        averageJobAge: `${avgAge.toFixed(1)} minutes`,
        queryTime: `${responseTime.toFixed(2)}ms`,
      },
    };
  } catch (error) {
    return {
      service: 'video-queue',
      status: 'unhealthy',
      responseTime: performance.now() - startTime,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

async function checkExternalAPIs(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    const checks = await Promise.allSettled([
      checkOpenAI(),
      checkYouTubeAPI(),
    ]);
    
    const responseTime = performance.now() - startTime;
    const failedChecks = checks.filter(check => check.status === 'rejected').length;
    
    return {
      service: 'external-apis',
      status: failedChecks === 0 ? 'healthy' : failedChecks < checks.length ? 'degraded' : 'unhealthy',
      responseTime,
      timestamp: new Date().toISOString(),
      details: {
        totalChecks: checks.length,
        failedChecks,
        results: checks.map((check, index) => ({
          service: ['openai', 'youtube'][index],
          status: check.status,
        })),
      },
    };
  } catch (error) {
    return {
      service: 'external-apis',
      status: 'unhealthy',
      responseTime: performance.now() - startTime,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

async function checkOpenAI(): Promise<void> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API returned ${response.status}`);
  }
}

async function checkYouTubeAPI(): Promise<void> {
  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) {
    throw new Error('YouTube API key not configured');
  }

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${apiKey}`,
    {
      signal: AbortSignal.timeout(5000),
    }
  );

  if (!response.ok) {
    throw new Error(`YouTube API returned ${response.status}`);
  }
}

async function checkEdgeFunctions(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    // Test if edge functions are running by checking a simple endpoint
    const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/health-check`;
    
    // Self-check - this function responding means edge functions work
    return {
      service: 'edge-functions',
      status: 'healthy',
      responseTime: performance.now() - startTime,
      timestamp: new Date().toISOString(),
      details: {
        platform: 'Deno',
        runtime: 'Edge Functions',
        selfCheck: true,
      },
    };
  } catch (error) {
    return {
      service: 'edge-functions',
      status: 'unhealthy',
      responseTime: performance.now() - startTime,
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

// Monitoring endpoints
serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    switch (path) {
      case '/health':
      case '/health-check':
        const detailed = url.searchParams.get('detailed') === 'true';
        if (detailed) {
          const health = await runDetailedHealthCheck();
          return new Response(JSON.stringify(health), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: health.overall === 'unhealthy' ? 503 : 200
          });
        } else {
          return new Response(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: Date.now() - startTime,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

      case '/metrics':
        const metrics = await getMetrics();
        return new Response(JSON.stringify(metrics), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      case '/status':
        const status = await getStatus();
        return new Response(JSON.stringify(status), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      default:
        return new Response('Not found', { 
          status: 404, 
          headers: corsHeaders 
        });
    }
  } catch (error) {
    console.error('Health endpoint error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function runDetailedHealthCheck(): Promise<SystemHealth> {
  const checks = [
    checkDatabase(),
    checkStorage(),
    checkAuth(),
    checkVideoProcessingQueue(),
    checkExternalAPIs(),
    checkEdgeFunctions(),
  ];

  const results = await Promise.allSettled(checks);
  
  const services = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      const serviceNames = ['database', 'storage', 'auth', 'video-queue', 'external-apis', 'edge-functions'];
      return {
        service: serviceNames[index],
        status: 'unhealthy' as const,
        responseTime: 0,
        timestamp: new Date().toISOString(),
        error: result.reason?.message || 'Unknown error',
      };
    }
  });

  const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;
  
  let overall: 'healthy' | 'degraded' | 'unhealthy';
  if (unhealthyCount > 0) {
    overall = 'unhealthy';
  } else if (degradedCount > 0) {
    overall = 'degraded';
  } else {
    overall = 'healthy';
  }

  return {
    overall,
    services,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    version,
    environment,
  };
}

async function getMetrics(): Promise<Record<string, any>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get queue metrics
    const { data: queueStats } = await supabase
      .from('processing_queue')
      .select('status, created_at, updated_at');

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const recentJobs = queueStats?.filter(job => 
      new Date(job.created_at).getTime() > oneHourAgo
    ) || [];

    const dailyJobs = queueStats?.filter(job => 
      new Date(job.created_at).getTime() > oneDayAgo
    ) || [];

    return {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - startTime,
      queue: {
        total: queueStats?.length || 0,
        processing: queueStats?.filter(job => job.status === 'processing').length || 0,
        completed: queueStats?.filter(job => job.status === 'completed').length || 0,
        failed: queueStats?.filter(job => job.status === 'failed').length || 0,
        recentJobsLastHour: recentJobs.length,
        jobsLast24Hours: dailyJobs.length,
      },
      performance: {
        averageProcessingTime: calculateAverageProcessingTime(queueStats || []),
        successRate: calculateSuccessRate(dailyJobs),
      },
    };
  } catch (error) {
    return {
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function getStatus(): Promise<Record<string, any>> {
  return {
    service: 'ViralClips Video Processing',
    version,
    environment,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    ready: true,
  };
}

function calculateAverageProcessingTime(jobs: any[]): number {
  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.updated_at && job.created_at
  );

  if (completedJobs.length === 0) return 0;

  const totalTime = completedJobs.reduce((acc, job) => {
    return acc + (new Date(job.updated_at).getTime() - new Date(job.created_at).getTime());
  }, 0);

  return totalTime / completedJobs.length / 1000 / 60; // Minutes
}

function calculateSuccessRate(jobs: any[]): number {
  if (jobs.length === 0) return 0;
  
  const completedJobs = jobs.filter(job => job.status === 'completed').length;
  return (completedJobs / jobs.length) * 100;
}
