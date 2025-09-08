import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';
import { useEffect } from 'react';
import { useLocation, useNavigationType, createRoutesFromChildren, matchRoutes } from 'react-router-dom';

// Environment-specific configuration
const config = {
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_ENVIRONMENT || 'development',
  debug: import.meta.env.VITE_ENVIRONMENT === 'development',
  tracesSampleRate: import.meta.env.VITE_ENVIRONMENT === 'production' ? 0.1 : 1.0,
  profilesSampleRate: import.meta.env.VITE_ENVIRONMENT === 'production' ? 0.1 : 1.0,
};

// Initialize Sentry
export const initializeMonitoring = () => {
  if (!config.dsn) {
    console.info('Sentry DSN not configured - error tracking disabled');
    return;
  }

  // Skip Sentry initialization in development if DSN is placeholder
  if (config.dsn === 'your-sentry-dsn' || config.dsn.includes('your-')) {
    console.info('Sentry DSN is placeholder - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    debug: config.debug,
    integrations: [
      new BrowserTracing({
        // Set up automatic route change tracking for React Router
        routingInstrumentation: Sentry.reactRouterV6Instrumentation(
          useEffect,
          useLocation,
          useNavigationType,
          createRoutesFromChildren,
          matchRoutes
        ),
      }),
    ],
    tracesSampleRate: config.tracesSampleRate,
    profilesSampleRate: config.profilesSampleRate,
    
    // Performance monitoring
    beforeSend(event) {
      // Filter out development errors in production
      if (config.environment === 'production') {
        if (event.exception) {
          const error = event.exception.values?.[0];
          if (error?.value?.includes('ResizeObserver loop limit exceeded')) {
            return null; // Common harmless browser error
          }
        }
      }
      return event;
    },

    // Custom error filtering
    ignoreErrors: [
      'Non-Error promise rejection captured',
      'ResizeObserver loop limit exceeded',
      'Network request failed',
      /extension\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
    ],
  });

  // Set user context when available
  Sentry.setUser({
    id: 'user-id', // Will be set dynamically in auth context
    email: 'user-email', // Will be set dynamically in auth context
  });
};

// Error reporting utilities
export const captureError = (error: Error, context?: Record<string, any>) => {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('additional_info', context);
    }
    Sentry.captureException(error);
  });
};

export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  Sentry.captureMessage(message, level);
};

// Performance monitoring
export const startTransaction = (name: string, operation: string) => {
  return Sentry.startTransaction({ name, op: operation });
};

export const measurePerformance = async <T>(
  name: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  const transaction = startTransaction(name, operation);
  try {
    const result = await fn();
    transaction.setStatus('ok');
    return result;
  } catch (error) {
    transaction.setStatus('internal_error');
    captureError(error as Error, { operation: name });
    throw error;
  } finally {
    transaction.finish();
  }
};

// Video processing specific monitoring
export const monitorVideoProcessing = {
  startJob: (jobId: string, videoUrl: string) => {
    const transaction = startTransaction('video-processing', 'process');
    transaction.setData('jobId', jobId);
    transaction.setData('videoUrl', videoUrl);
    return transaction;
  },

  recordStep: (transaction: any, step: string, duration: number) => {
    const span = transaction.startChild({
      op: 'video-processing-step',
      description: step,
    });
    span.setData('duration', duration);
    span.finish();
  },

  recordError: (error: Error, jobId: string, step?: string) => {
    captureError(error, {
      jobId,
      step,
      component: 'video-processing',
    });
  },
};

// Custom error boundary
export const SentryErrorBoundary = Sentry.withErrorBoundary;

