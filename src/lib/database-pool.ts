import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

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

// Singleton Supabase client instance to prevent multiple GoTrueClient instances
let supabaseClientInstance: SupabaseClient | null = null;

class DatabaseConnectionPool {
  private clients: SupabaseClient[] = [];
  private activeConnections: Set<SupabaseClient> = new Set();
  private availableConnections: SupabaseClient[] = [];
  private waitingQueue: Array<{
    resolve: (client: SupabaseClient) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private config: PoolConfig;
  private stats: ConnectionStats;
  private monitoringInterval?: NodeJS.Timeout;
  private reaperInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

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
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      poolUtilization: 0,
      averageResponseTime: 0,
      errorRate: 0,
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    logger.info('Initializing database connection pool', {
      config: this.config,
      component: 'database-pool',
    });

    // Create minimum connections
    for (let i = 0; i < this.config.minConnections; i++) {
      try {
        const client = await this.createConnection();
        this.availableConnections.push(client);
        this.clients.push(client);
      } catch (error) {
        logger.error('Failed to create initial connection', error as Error, {
          component: 'database-pool',
          connectionIndex: i,
        });
      }
    }

    // Start monitoring
    this.startMonitoring();

    // Start connection reaper
    this.startConnectionReaper();

    logger.info('Database connection pool initialized', {
      totalConnections: this.clients.length,
      availableConnections: this.availableConnections.length,
      component: 'database-pool',
    });
  }

  private async createConnection(): Promise<SupabaseClient> {
    // Use singleton instance if available
    if (supabaseClientInstance) {
      return supabaseClientInstance;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    // Create singleton instance
    supabaseClientInstance = createClient(supabaseUrl, supabaseKey, {
      db: {
        schema: 'public',
      },
      auth: {
        persistSession: false, // Don't persist sessions in pooled connections
        autoRefreshToken: true,
      },
      global: {
        headers: {
          'x-connection-pool': 'true',
        },
      },
    });

    // Test connection with a simple query
    const { error } = await supabaseClientInstance.from('projects').select('count').limit(1);
    if (error) {
      supabaseClientInstance = null;
      throw new Error(`Connection test failed: ${error.message}`);
    }

    return supabaseClientInstance;
  }

  async acquireConnection(): Promise<SupabaseClient> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from waiting queue
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        
        logger.warn('Connection acquisition timeout', {
          component: 'database-pool',
          waitTime: performance.now() - startTime,
          queueLength: this.waitingQueue.length,
        });
        
        reject(new Error('Connection acquisition timeout'));
      }, this.config.acquireTimeoutMillis);

      // Try to get available connection
      if (this.availableConnections.length > 0) {
        const client = this.availableConnections.shift()!;
        this.activeConnections.add(client);
        
        clearTimeout(timeoutId);
        
        const acquireTime = performance.now() - startTime;
        this.updateStats('acquire', acquireTime);
        
        logger.debug('Connection acquired from pool', {
          component: 'database-pool',
          acquireTime: `${acquireTime.toFixed(2)}ms`,
          activeConnections: this.activeConnections.size,
          availableConnections: this.availableConnections.length,
        });
        
        resolve(client);
        return;
      }

      // Try to create new connection if under max limit
      if (this.clients.length < this.config.maxConnections) {
        this.createConnection()
          .then(client => {
            this.clients.push(client);
            this.activeConnections.add(client);
            
            clearTimeout(timeoutId);
            
            const acquireTime = performance.now() - startTime;
            this.updateStats('acquire', acquireTime);
            
            logger.debug('New connection created and acquired', {
              component: 'database-pool',
              acquireTime: `${acquireTime.toFixed(2)}ms`,
              totalConnections: this.clients.length,
            });
            
            resolve(client);
          })
          .catch(error => {
            clearTimeout(timeoutId);
            this.updateStats('error');
            
            logger.error('Failed to create new connection', error, {
              component: 'database-pool',
            });
            
            reject(error);
          });
        return;
      }

      // Add to waiting queue
      this.waitingQueue.push({
        resolve: (client) => {
          clearTimeout(timeoutId);
          resolve(client);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now(),
      });

      logger.debug('Connection request queued', {
        component: 'database-pool',
        queueLength: this.waitingQueue.length,
        activeConnections: this.activeConnections.size,
      });
    });
  }

  releaseConnection(client: SupabaseClient): void {
    if (!this.activeConnections.has(client)) {
      logger.warn('Attempting to release connection not in active set', {
        component: 'database-pool',
      });
      return;
    }

    this.activeConnections.delete(client);

    // Serve waiting requests first
    if (this.waitingQueue.length > 0) {
      const waiting = this.waitingQueue.shift()!;
      this.activeConnections.add(client);
      
      const waitTime = Date.now() - waiting.timestamp;
      
      logger.debug('Connection served from queue', {
        component: 'database-pool',
        waitTime: `${waitTime}ms`,
        queueLength: this.waitingQueue.length,
      });
      
      waiting.resolve(client);
      return;
    }

    // Return to available pool
    this.availableConnections.push(client);
    
    logger.debug('Connection returned to pool', {
      component: 'database-pool',
      availableConnections: this.availableConnections.length,
      activeConnections: this.activeConnections.size,
    });
  }

  async executeQuery<T>(
    queryFn: (client: SupabaseClient) => Promise<T>
  ): Promise<T> {
    const client = await this.acquireConnection();
    
    try {
      const startTime = performance.now();
      const result = await queryFn(client);
      const queryTime = performance.now() - startTime;
      
      this.updateStats('query', queryTime);
      
      logger.debug('Query executed successfully', {
        component: 'database-pool',
        queryTime: `${queryTime.toFixed(2)}ms`,
      });
      
      return result;
    } catch (error) {
      this.updateStats('error');
      logger.error('Query execution failed', error as Error, {
        component: 'database-pool',
      });
      throw error;
    } finally {
      this.releaseConnection(client);
    }
  }

  private updateStats(operation: 'acquire' | 'query' | 'error', responseTime?: number): void {
    this.stats.totalConnections = this.clients.length;
    this.stats.activeConnections = this.activeConnections.size;
    this.stats.idleConnections = this.availableConnections.length;
    this.stats.waitingRequests = this.waitingQueue.length;
    this.stats.poolUtilization = this.clients.length > 0 
      ? (this.activeConnections.size / this.clients.length) * 100 
      : 0;

    if ((operation === 'acquire' || operation === 'query') && responseTime) {
      // Update average response time (exponential moving average)
      this.stats.averageResponseTime = this.stats.averageResponseTime === 0
        ? responseTime
        : (this.stats.averageResponseTime * 0.9) + (responseTime * 0.1);
    }

    if (operation === 'error') {
      this.stats.errorRate = (this.stats.errorRate * 0.95) + 5; // Increase error rate
    } else {
      this.stats.errorRate = this.stats.errorRate * 0.99; // Slowly decrease error rate
    }
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateStats('acquire');
      
      logger.debug('Connection pool stats', {
        component: 'database-pool',
        stats: this.stats,
      });

      // Alert on high utilization
      if (this.stats.poolUtilization > 80) {
        logger.warn('High database pool utilization', {
          component: 'database-pool',
          utilization: `${this.stats.poolUtilization.toFixed(1)}%`,
          activeConnections: this.stats.activeConnections,
          totalConnections: this.stats.totalConnections,
        });
      }

      // Alert on waiting requests
      if (this.stats.waitingRequests > 0) {
        logger.warn('Database connections queued', {
          component: 'database-pool',
          waitingRequests: this.stats.waitingRequests,
          utilization: `${this.stats.poolUtilization.toFixed(1)}%`,
        });
      }
    }, 30000); // Every 30 seconds
  }

  private startConnectionReaper(): void {
    this.reaperInterval = setInterval(() => {
      if (this.isShuttingDown) return;
      
      const now = Date.now();
      
      // Remove idle connections beyond minimum
      while (
        this.availableConnections.length > this.config.minConnections &&
        this.clients.length > this.config.minConnections
      ) {
        const client = this.availableConnections.shift();
        if (client) {
          const index = this.clients.indexOf(client);
          if (index !== -1) {
            this.clients.splice(index, 1);
          }
          
          logger.debug('Idle connection reaped', {
            component: 'database-pool',
            totalConnections: this.clients.length,
            availableConnections: this.availableConnections.length,
          });
        }
      }

      // Clean up old waiting requests
      const validRequests = this.waitingQueue.filter(request => {
        const age = now - request.timestamp;
        if (age > this.config.acquireTimeoutMillis) {
          request.reject(new Error('Connection request timeout'));
          return false;
        }
        return true;
      });
      
      if (validRequests.length !== this.waitingQueue.length) {
        logger.debug('Cleaned up expired connection requests', {
          component: 'database-pool',
          expiredRequests: this.waitingQueue.length - validRequests.length,
        });
        this.waitingQueue = validRequests;
      }
    }, this.config.reapIntervalMillis);
  }

  getStats(): ConnectionStats {
    this.updateStats('acquire');
    return { ...this.stats };
  }

  async destroy(): Promise<void> {
    logger.info('Destroying database connection pool', {
      component: 'database-pool',
    });

    this.isShuttingDown = true;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
    }

    // Reject all waiting requests
    this.waitingQueue.forEach(request => {
      request.reject(new Error('Connection pool destroyed'));
    });
    this.waitingQueue = [];

    // Clear all connections
    this.clients = [];
    this.activeConnections.clear();
    this.availableConnections = [];

    // Reset singleton instance
    supabaseClientInstance = null;

    logger.info('Database connection pool destroyed', {
      component: 'database-pool',
    });
  }
}

// Global connection pool instance
const poolConfig: Partial<PoolConfig> = {
  minConnections: parseInt(import.meta.env.VITE_DB_MIN_CONNECTIONS || '2'),
  maxConnections: parseInt(import.meta.env.VITE_DB_MAX_CONNECTIONS || '10'),
  acquireTimeoutMillis: parseInt(import.meta.env.VITE_DB_ACQUIRE_TIMEOUT || '10000'),
  idleTimeoutMillis: parseInt(import.meta.env.VITE_DB_IDLE_TIMEOUT || '300000'),
};

export const dbPool = new DatabaseConnectionPool(poolConfig);

// Enhanced Supabase client with connection pooling
export const createPooledSupabaseClient = () => {
  return {
    async executeQuery<T>(queryFn: (client: SupabaseClient) => Promise<T>): Promise<T> {
      return dbPool.executeQuery(queryFn);
    },
    
    // Convenience methods for common operations
    from: (table: string) => ({
      select: (columns: string = '*') => ({
        async execute() {
          return dbPool.executeQuery(client => 
            client.from(table).select(columns)
          );
        },
        eq: (column: string, value: any) => ({
          async execute() {
            return dbPool.executeQuery(client => 
              client.from(table).select(columns).eq(column, value)
            );
          },
        }),
      }),
      insert: (data: any) => ({
        async execute() {
          return dbPool.executeQuery(client => 
            client.from(table).insert(data)
          );
        },
      }),
      update: (data: any) => ({
        eq: (column: string, value: any) => ({
          async execute() {
            return dbPool.executeQuery(client => 
              client.from(table).update(data).eq(column, value)
            );
          },
        }),
      }),
      delete: () => ({
        eq: (column: string, value: any) => ({
          async execute() {
            return dbPool.executeQuery(client => 
              client.from(table).delete().eq(column, value)
            );
          },
        }),
      }),
    }),

    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, file: any, options?: any) => {
          return dbPool.executeQuery(client => 
            client.storage.from(bucket).upload(path, file, options)
          );
        },
        download: async (path: string) => {
          return dbPool.executeQuery(client => 
            client.storage.from(bucket).download(path)
          );
        },
        list: async (path: string = '', options?: any) => {
          return dbPool.executeQuery(client => 
            client.storage.from(bucket).list(path, options)
          );
        },
      }),
    },

    rpc: async (fn: string, args?: any) => {
      return dbPool.executeQuery(client => client.rpc(fn, args));
    },

    functions: {
      invoke: async (functionName: string, options?: any) => {
        return dbPool.executeQuery(client => 
          client.functions.invoke(functionName, options)
        );
      },
    },
  };
};

// Hook for React components to use pooled connections
import { useCallback } from 'react';

export const usePooledSupabase = () => {
  const pooledClient = createPooledSupabaseClient();

  const executeQuery = useCallback(async <T>(
    queryFn: (client: SupabaseClient) => Promise<T>
  ): Promise<T> => {
    return pooledClient.executeQuery(queryFn);
  }, []);

  const getPoolStats = useCallback(() => {
    return dbPool.getStats();
  }, []);

  return {
    executeQuery,
    from: pooledClient.from,
    storage: pooledClient.storage,
    rpc: pooledClient.rpc,
    functions: pooledClient.functions,
    getPoolStats,
  };
};

// Pool monitoring utilities
export const DatabasePoolMonitor = {
  getStats: () => dbPool.getStats(),
  
  getHealthStatus: () => {
    const stats = dbPool.getStats();
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (stats.errorRate > 10 || stats.poolUtilization > 90) {
      status = 'unhealthy';
    } else if (stats.errorRate > 5 || stats.poolUtilization > 80) {
      status = 'degraded';
    }
    
    return {
      status,
      stats,
      timestamp: new Date().toISOString(),
    };
  },
  
  logStats: () => {
    const stats = dbPool.getStats();
    logger.info('Database pool statistics', {
      component: 'database-pool',
      ...stats,
    });
  },
};

// Initialize cleanup on app shutdown
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dbPool.destroy().catch(error => {
      console.error('Error destroying connection pool:', error);
    });
  });
}

// For Node.js environments (not browser)
if (typeof process !== 'undefined' && process.on && typeof process.on === 'function') {
  process.on('SIGTERM', () => {
    dbPool.destroy().catch(error => {
      console.error('Error destroying connection pool:', error);
    });
  });
  
  process.on('SIGINT', () => {
    dbPool.destroy().catch(error => {
      console.error('Error destroying connection pool:', error);
    });
  });
}