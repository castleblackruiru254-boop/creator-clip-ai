import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import LoadingSpinner from "@/components/LoadingSpinner";
import { initializeMonitoring } from "@/lib/monitoring";
import { logger } from "@/lib/logger";
import { healthChecker } from "@/lib/health-checks";
import { DatabasePoolMonitor } from "@/lib/database-pool";
import { CDNUtils } from "@/lib/cdn-manager";

// Lazy load pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const QuickGenerate = lazy(() => import("./pages/QuickGenerate"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error: any) => {
        if (error?.status === 404) return false;
        return failureCount < 2;
      },
    },
  },
});

const AppContent = () => {
  useEffect(() => {
    // Initialize monitoring and health checks
    initializeMonitoring();
    healthChecker.startMonitoring();
    
    // Initialize performance monitoring
    const dbStats = DatabasePoolMonitor.getStats();
    const cdnStats = CDNUtils.getStats();
    
    logger.info('Creator Clip AI application started', {
      version: '1.0.0',
      environment: import.meta.env.VITE_ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
      features: {
        databasePooling: true,
        cdnEnabled: import.meta.env.VITE_CDN_ENABLED === 'true',
        loadBalancing: import.meta.env.LOAD_BALANCER_ENABLED === 'true',
        autoScaling: import.meta.env.AUTO_SCALING_ENABLED === 'true',
      },
      performance: {
        databasePool: dbStats,
        cdn: cdnStats,
      },
    });
    
    // Start periodic performance monitoring
    const performanceInterval = setInterval(() => {
      const stats = DatabasePoolMonitor.getStats();
      
      if (stats.errorRate > 10) {
        logger.warn('Database pool error rate high', {
          component: 'app-monitoring',
          errorRate: stats.errorRate,
          stats,
        });
      }
    }, 60000); // Every minute
    
    return () => {
      healthChecker.stopMonitoring();
      clearInterval(performanceInterval);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/quick-generate" element={<QuickGenerate />} />
                <Route path="/pricing" element={<PricingPage />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

const App = () => {
  return <AppContent />;
};

export default App;
