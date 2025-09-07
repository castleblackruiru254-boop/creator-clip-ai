import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import { useState, useEffect } from 'react';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  timestamp: string;
  details?: Record<string, any>;
  error?: string;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  timestamp: string;
  uptime: number;
}

class HealthChecker {
  private readonly startTime = Date.now();
  private readonly checkInterval = 30000; // 30 seconds
  private readonly checks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();
  private isMonitoring = false;

  constructor() {
    this.registerDefaultChecks();
  }

  private registerDefaultChecks() {
    // Database connectivity check
    this.registerCheck('database', this.checkDatabase.bind(this));
    
    // Storage service check
    this.registerCheck('storage', this.checkStorage.bind(this));
    
    // Auth service check
    this.registerCheck('auth', this.checkAuth.bind(this));
    
    // Video processing queue check
    this.registerCheck('video-queue', this.checkVideoQueue.bind(this));
    
    // Skip external APIs check to avoid CORS issues in browser
    // External APIs will be checked server-side in Edge Functions
  }

  registerCheck(name: string, checkFn: () => Promise<HealthCheckResult>) {
    this.checks.set(name, checkFn);
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
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
          connectionPool: 'active',
          queryTime: `${responseTime.toFixed(2)}ms`,
        },
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime: performance.now() - startTime,
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }

  private async checkStorage(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      // Test storage accessibility
      const { data, error } = await supabase.storage
        .from('videos')
        .list('', { limit: 1 });
      
      const responseTime = performance.now() - startTime;
      
      if (error) {
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
        error: (error as Error).message,
      };
    }
  }

  private async checkAuth(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      const responseTime = performance.now() - startTime;
      
      if (error) {
        return {
          service: 'auth',
          status: 'degraded',
          responseTime,
          timestamp: new Date().toISOString(),
          error: error.message,
        };
      }

      return {
        service: 'auth',
        status: 'healthy',
        responseTime,
        timestamp: new Date().toISOString(),
        details: {
          sessionValid: !!session,
          authTime: `${responseTime.toFixed(2)}ms`,
        },
      };
    } catch (error) {
      return {
        service: 'auth',
        status: 'unhealthy',
        responseTime: performance.now() - startTime,
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }

  private async checkVideoQueue(): Promise<HealthCheckResult> {
    const startTime = performance.now();
    
    try {
      const { data, error } = await supabase
        .from('processing_queue')
        .select('status')
        .limit(10);
      
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

      return {
        service: 'video-queue',
        status: activeJobs < 5 ? 'healthy' : 'degraded',
        responseTime,
        timestamp: new Date().toISOString(),
        details: {
          activeJobs,
          queueSize,
          queryTime: `${responseTime.toFixed(2)}ms`,
        },
      };
    } catch (error) {
      return {
        service: 'video-queue',
        status: 'unhealthy',
        responseTime: performance.now() - startTime,
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      };
    }
  }



  async runAllChecks(): Promise<SystemHealth> {
    const startTime = performance.now();
    
    logger.debug('Starting system health check');
    
    const results = await Promise.allSettled(
      Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
        try {
          const result = await checkFn();
          this.lastResults.set(name, result);
          return result;
        } catch (error) {
          const errorResult: HealthCheckResult = {
            service: name,
            status: 'unhealthy',
            responseTime: 0,
            timestamp: new Date().toISOString(),
            error: (error as Error).message,
          };
          this.lastResults.set(name, errorResult);
          return errorResult;
        }
      })
    );

    const services = results
      .filter((result): result is PromiseFulfilledResult<HealthCheckResult> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);

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

    const systemHealth: SystemHealth = {
      overall,
      services,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
    };

    const totalTime = performance.now() - startTime;
    logger.info('System health check completed', {
      overall,
      serviceCount: services.length,
      duration: `${totalTime.toFixed(2)}ms`,
      unhealthyServices: unhealthyCount,
      degradedServices: degradedCount,
    });

    return systemHealth;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    logger.info('Health monitoring started');
    
    // Run initial check
    this.runAllChecks();
    
    // Set up periodic checks
    setInterval(async () => {
      try {
        const health = await this.runAllChecks();
        
        // Alert on degraded/unhealthy status
        if (health.overall !== 'healthy') {
          logger.warn('System health degraded', {
            overall: health.overall,
            unhealthyServices: health.services
              .filter(s => s.status === 'unhealthy')
              .map(s => s.service),
          });
        }
      } catch (error) {
        logger.error('Health check failed', error as Error);
      }
    }, this.checkInterval);
  }

  stopMonitoring() {
    this.isMonitoring = false;
    logger.info('Health monitoring stopped');
  }

  getLastResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }
}

// Global health checker instance
export const healthChecker = new HealthChecker();

// React hook for health monitoring

export const useHealthCheck = (autoStart = true) => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runCheck = async () => {
    setIsLoading(true);
    try {
      const result = await healthChecker.runAllChecks();
      setHealth(result);
    } catch (error) {
      logger.error('Health check hook failed', error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoStart) {
      healthChecker.startMonitoring();
      runCheck();
    }

    return () => {
      if (autoStart) {
        healthChecker.stopMonitoring();
      }
    };
  }, [autoStart]);

  return {
    health,
    isLoading,
    runCheck,
    startMonitoring: () => healthChecker.startMonitoring(),
    stopMonitoring: () => healthChecker.stopMonitoring(),
  };
};

// Note: HealthStatus component moved to src/components/HealthStatus.tsx to avoid JSX in lib files
