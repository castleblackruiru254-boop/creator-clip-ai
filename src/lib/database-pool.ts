import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';
import { supabase } from '@/integrations/supabase/client';

interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
  createRetryIntervalMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
}

interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  poolUtilization: number;
  averageResponseTime: number;
  errorRate: number;
}

// Use the shared Supabase client instead of creating multiple instances
class DatabaseConnectionPool {
  private config: PoolConfig;
  private stats: ConnectionStats;
  private monitoringInterval?: NodeJS.Timeout;
  private isShuttingDown = false;
  private operationCount = 0;
  private errorCount = 0;
  private totalResponseTime = 0;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      minConnections: config.minConnections || 2,
      maxConnections: config.maxConnections || 10,
      acquireTimeoutMillis: config.acquireTimeoutMillis || 10000,
      idleTimeoutMillis: config.idleTimeoutMillis || 300000, // 5 minutes
      reapIntervalMillis: config.reapIntervalMillis || 30000, // 30 seconds
      createRetryIntervalMillis: config.createRetryIntervalMillis || 200,
      createTimeoutMillis: config.createTimeoutMillis || 30000,
      destroyTimeoutMillis: config.destroyTimeoutMillis || 5000,
    };

    this.stats = {
      totalConnections: 1, // We use the single shared client
      activeConnections: 0,
      idleConnections: 1,
      waitingRequests: 0,
      poolUtilization: 0,
      averageResponseTime: 0,
      errorRate: 0,
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    logger.info('Initializing database connection pool (using shared client)', {
      config: this.config,
      component: 'database-pool',
    });

    // Start monitoring
    this.startMonitoring();

    logger.info('Database connection pool initialized', {
      component: 'database-pool',
    });
  }

  async acquire(): Promise<SupabaseClient> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    const startTime = Date.now();
    
    // Return the shared supabase client instance
    const client = supabase;
    
    this.operationCount++;
    this.totalResponseTime += Date.now() - startTime;
    this.updateStats();
    
    logger.debug('Acquired shared database connection', {
      component: 'database-pool',
      operationCount: this.operationCount,
    });
    
    return client;
  }

  release(_client: SupabaseClient): void {
    // For shared client, we don't need to do anything special
    logger.debug('Released shared database connection', {
      component: 'database-pool',
    });
  }

  private updateStats(): void {
    this.stats.averageResponseTime = this.operationCount > 0 
      ? this.totalResponseTime / this.operationCount 
      : 0;
    this.stats.errorRate = this.operationCount > 0 
      ? (this.errorCount / this.operationCount) * 100 
      : 0;
    this.stats.poolUtilization = 50; // Fixed at 50% for shared client
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      logger.debug('Database pool monitoring', {
        stats: this.stats,
        component: 'database-pool',
      });
    }, this.config.reapIntervalMillis);
  }

  async destroy(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    logger.info('Shutting down database connection pool', {
      component: 'database-pool',
    });

    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Database connection pool shutdown complete', {
      component: 'database-pool',
    });
  }

  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  async executeQuery(query: () => Promise<any>): Promise<any> {
    const client = await this.acquire();
    const startTime = Date.now();
    
    try {
      const result = await query();
      const duration = Date.now() - startTime;
      
      logger.debug('Query executed successfully', {
        component: 'database-pool',
        duration: `${duration}ms`,
      });
      
      return result;
    } catch (error) {
      this.errorCount++;
      const duration = Date.now() - startTime;
      
      logger.error('Query execution failed', error as Error, {
        component: 'database-pool',
        duration: `${duration}ms`,
      });
      
      throw error;
    } finally {
      this.release(client);
    }
  }
}

// Create and export singleton instances
export const DatabasePoolMonitor = {
  getStats: (): ConnectionStats => {
    return {
      totalConnections: 1,
      activeConnections: 0,
      idleConnections: 1,
      waitingRequests: 0,
      poolUtilization: 0,
      averageResponseTime: 0,
      errorRate: 0,
    };
  }
};

// Export a default pool instance
const defaultPool = new DatabaseConnectionPool();

export { DatabaseConnectionPool };
export default defaultPool;