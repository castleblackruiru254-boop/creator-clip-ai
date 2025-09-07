// Frontend Logger Implementation
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  userId?: string;
  sessionId?: string;
  component?: string;
  action?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private sessionId: string;
  private userId?: string;
  private minLevel: LogLevel;
  private buffer: LogEntry[] = [];
  private readonly maxBufferSize = 100;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.minLevel = import.meta.env.VITE_LOG_LEVEL 
      ? parseInt(import.meta.env.VITE_LOG_LEVEL) 
      : LogLevel.INFO;
    
    // Flush logs periodically
    setInterval(() => this.flushLogs(), 30000); // 30 seconds
    
    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flushLogs());
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  setUser(userId: string) {
    this.userId = userId;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ) {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, context, error);
    
    // Add to buffer
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = this.buffer.slice(-this.maxBufferSize);
    }

    // Console output for development
    if (import.meta.env.DEV) {
      const consoleMethod = this.getConsoleMethod(level);
      const formattedMessage = this.formatForConsole(entry);
      consoleMethod(formattedMessage, context, error);
    }

    // Send critical errors immediately
    if (level >= LogLevel.ERROR) {
      this.sendLogEntry(entry);
    }
  }

  private getConsoleMethod(level: LogLevel) {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error;
      default:
        return console.log;
    }
  }

  private formatForConsole(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const component = entry.component ? `[${entry.component}]` : '';
    const action = entry.action ? `[${entry.action}]` : '';
    return `${entry.timestamp} ${levelName} ${component} ${action} ${entry.message}`;
  }

  private async sendLogEntry(entry: LogEntry) {
    // Skip remote logging in development
    if (import.meta.env.DEV) {
      return;
    }
    
    try {
      // Send to backend logging endpoint
      await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      console.error('Failed to send log entry:', error);
    }
  }

  private async flushLogs() {
    if (this.buffer.length === 0) return;
    
    // Skip remote logging in development
    if (import.meta.env.DEV) {
      this.buffer = [];
      return;
    }

    try {
      const logs = [...this.buffer];
      this.buffer = [];

      await fetch('/api/logs/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs }),
      });
    } catch (error) {
      console.error('Failed to flush logs:', error);
    }
  }

  // Public logging methods
  debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, context, error);
  }

  fatal(message: string, error?: Error, context?: Record<string, any>) {
    this.log(LogLevel.FATAL, message, context, error);
  }

  // Component-specific logging
  component(componentName: string) {
    return {
      debug: (message: string, context?: Record<string, any>) =>
        this.log(LogLevel.DEBUG, message, { ...context, component: componentName }),
      info: (message: string, context?: Record<string, any>) =>
        this.log(LogLevel.INFO, message, { ...context, component: componentName }),
      warn: (message: string, context?: Record<string, any>) =>
        this.log(LogLevel.WARN, message, { ...context, component: componentName }),
      error: (message: string, error?: Error, context?: Record<string, any>) =>
        this.log(LogLevel.ERROR, message, { ...context, component: componentName }, error),
    };
  }

  // Action-specific logging
  action(actionName: string, componentName?: string) {
    return {
      start: (context?: Record<string, any>) =>
        this.log(LogLevel.INFO, `Started ${actionName}`, {
          ...context,
          component: componentName,
          action: actionName,
        }),
      success: (context?: Record<string, any>) =>
        this.log(LogLevel.INFO, `Completed ${actionName}`, {
          ...context,
          component: componentName,
          action: actionName,
        }),
      error: (error: Error, context?: Record<string, any>) =>
        this.log(LogLevel.ERROR, `Failed ${actionName}`, {
          ...context,
          component: componentName,
          action: actionName,
        }, error),
    };
  }
}

// Global logger instance
export const logger = new Logger();

// Video processing specific loggers
export const videoLogger = {
  job: (jobId: string) => ({
    start: (videoUrl: string, context?: Record<string, any>) =>
      logger.info('Video processing job started', {
        jobId,
        videoUrl,
        ...context,
        component: 'video-processing',
      }),
    progress: (step: string, progress: number, context?: Record<string, any>) =>
      logger.info(`Video processing: ${step}`, {
        jobId,
        step,
        progress,
        ...context,
        component: 'video-processing',
      }),
    success: (context?: Record<string, any>) =>
      logger.info('Video processing completed successfully', {
        jobId,
        ...context,
        component: 'video-processing',
      }),
    error: (step: string, error: Error, context?: Record<string, any>) =>
      logger.error(`Video processing failed at ${step}`, error, {
        jobId,
        step,
        ...context,
        component: 'video-processing',
      }),
  }),

  api: {
    request: (endpoint: string, method: string, context?: Record<string, any>) =>
      logger.debug('API request', {
        endpoint,
        method,
        ...context,
        component: 'api-client',
      }),
    response: (endpoint: string, status: number, duration: number, context?: Record<string, any>) =>
      logger.debug('API response', {
        endpoint,
        status,
        duration,
        ...context,
        component: 'api-client',
      }),
    error: (endpoint: string, error: Error, context?: Record<string, any>) =>
      logger.error('API request failed', error, {
        endpoint,
        ...context,
        component: 'api-client',
      }),
  },
};

// Performance logging utilities
export const performanceLogger = {
  measureAsync: async <T>(
    name: string,
    fn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> => {
    const startTime = performance.now();
    logger.debug(`Starting ${name}`, context);
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      logger.info(`Completed ${name}`, {
        ...context,
        duration: `${duration.toFixed(2)}ms`,
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error(`Failed ${name}`, error as Error, {
        ...context,
        duration: `${duration.toFixed(2)}ms`,
      });
      throw error;
    }
  },

  measureSync: <T>(
    name: string,
    fn: () => T,
    context?: Record<string, any>
  ): T => {
    const startTime = performance.now();
    logger.debug(`Starting ${name}`, context);
    
    try {
      const result = fn();
      const duration = performance.now() - startTime;
      logger.info(`Completed ${name}`, {
        ...context,
        duration: `${duration.toFixed(2)}ms`,
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error(`Failed ${name}`, error as Error, {
        ...context,
        duration: `${duration.toFixed(2)}ms`,
      });
      throw error;
    }
  },
};

// Hook for component logging
import { useCallback } from 'react';

export const useLogger = (componentName: string) => {
  const componentLogger = logger.component(componentName);
  
  const logAction = useCallback((actionName: string) => {
    return logger.action(actionName, componentName);
  }, [componentName]);

  return {
    ...componentLogger,
    action: logAction,
    performance: {
      measureAsync: <T>(name: string, fn: () => Promise<T>, context?: Record<string, any>) =>
        performanceLogger.measureAsync(`${componentName}:${name}`, fn, context),
      measureSync: <T>(name: string, fn: () => T, context?: Record<string, any>) =>
        performanceLogger.measureSync(`${componentName}:${name}`, fn, context),
    },
  };
};
