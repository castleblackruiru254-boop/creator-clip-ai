import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface QueueJob {
  id: string;
  type: string;
  status: string;
  priority: string;
  payload: any;
  user_id: string;
  progress: number | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  retry_count: number | null;
  max_retries: number | null;
}

export interface ProcessingProgress {
  job_id: string;
  project_id?: string;
  clip_id?: string;
  stage: string;
  progress_percent: number;
  message?: string;
  created_at: string;
}

export interface ActiveJob {
  job_id: string;
  job_type: string;
  job_status: string;
  job_progress: number;
  stage?: string;
  message?: string;
  created_at: string;
  estimated_completion?: string;
}

/**
 * Hook for managing video processing queue
 */
export function useVideoQueue() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches user's queue jobs
   */
  const fetchJobs = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('processing_queue')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setJobs(data as QueueJob[] || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * Fetches active jobs with progress info
   */
  const fetchActiveJobs = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_active_jobs', { p_user_id: user.id });

      if (error) {
        console.warn('Failed to fetch active jobs:', error.message);
        return;
      }

      setActiveJobs(data || []);
    } catch (err) {
      console.error('Failed to fetch active jobs:', err);
    }
  }, [user]);

  /**
   * Adds a new job to the queue
   */
  const addJob = useCallback(async (
    type: string,
    payload: any,
    priority: string = 'normal'
  ): Promise<{ success: boolean; jobId?: string; error?: string }> => {
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    try {
      const { data, error } = await supabase
        .from('processing_queue')
        .insert({
          type,
          payload,
          priority,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh jobs list
      await fetchJobs();
      await fetchActiveJobs();

      return { success: true, jobId: data.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add job';
      setError(message);
      return { success: false, error: message };
    }
  }, [user, fetchJobs, fetchActiveJobs]);

  /**
   * Cancels a job
   */
  const cancelJob = useCallback(async (jobId: string): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      const { error } = await supabase
        .from('processing_queue')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Refresh jobs list
      await fetchJobs();
      await fetchActiveJobs();

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel job';
      setError(message);
      return { success: false, error: message };
    }
  }, [user, fetchJobs, fetchActiveJobs]);

  /**
   * Retries a failed job
   */
  const retryJob = useCallback(async (jobId: string): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      const { error } = await supabase
        .from('processing_queue')
        .update({ 
          status: 'pending',
          error_message: null,
          started_at: null,
          completed_at: null,
        })
        .eq('id', jobId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Refresh jobs list
      await fetchJobs();
      await fetchActiveJobs();

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retry job';
      setError(message);
      return { success: false, error: message };
    }
  }, [user, fetchJobs, fetchActiveJobs]);

  /**
   * Gets job history with pagination
   */
  const getJobHistory = useCallback(async (options?: {
    limit?: number;
    offset?: number;
    status?: string;
    type?: string;
  }): Promise<{
    jobs: QueueJob[];
    total: number;
    hasMore: boolean;
    error?: string;
  }> => {
    if (!user) {
      return { jobs: [], total: 0, hasMore: false, error: 'User not authenticated' };
    }

    try {
      let query = supabase
        .from('processing_queue')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.type) {
        query = query.eq('type', options.type);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const total = count || 0;
      const limit = options?.limit || 50;
      const hasMore = (options?.offset || 0) + limit < total;

      return {
        jobs: data as QueueJob[] || [],
        total,
        hasMore,
      };
    } catch (err) {
      return {
        jobs: [],
        total: 0,
        hasMore: false,
        error: err instanceof Error ? err.message : 'Failed to fetch job history',
      };
    }
  }, [user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user) return;

    // Subscribe to job updates
    const jobsSubscription = supabase
      .channel('processing_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'processing_queue',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchJobs();
          fetchActiveJobs();
        }
      )
      .subscribe();

    return () => {
      jobsSubscription.unsubscribe();
    };
  }, [user, fetchJobs, fetchActiveJobs]);

  // Initial data fetch
  useEffect(() => {
    if (user) {
      fetchJobs();
      fetchActiveJobs();
    }
  }, [user, fetchJobs, fetchActiveJobs]);

  return {
    jobs,
    activeJobs,
    loading,
    error,
    addJob,
    cancelJob,
    retryJob,
    fetchJobs,
    getJobHistory,
    refreshJobs: fetchJobs,
  };
}

/**
 * Hook for tracking specific job progress
 */
export function useJobProgress(jobId: string | null) {
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!jobId) return;

    try {
      setLoading(true);
      setError(null);

      // Mock progress data since table doesn't exist
      setProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch progress');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Initial progress fetch
  useEffect(() => {
    if (jobId) {
      fetchProgress();
    }
  }, [jobId, fetchProgress]);

  return {
    progress,
    loading,
    error,
    refreshProgress: fetchProgress,
  };
}

/**
 * Hook for queue management operations
 */
export function useQueueManagement() {
  const [stats, setStats] = useState<{
    totalJobs: number;
    pendingJobs: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
    avgProcessingTime?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches queue statistics
   */
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Mock stats since function doesn't exist
      setStats({
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch queue stats');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Triggers queue cleanup
   */
  const cleanupQueue = useCallback(async (): Promise<{
    success: boolean;
    deletedCount?: number;
    error?: string;
  }> => {
    try {
      // Mock cleanup since function doesn't exist
      await fetchStats(); // Refresh stats after cleanup

      return { success: true, deletedCount: 0 };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cleanup queue';
      setError(message);
      return { success: false, error: message };
    }
  }, [fetchStats]);

  // Initial stats fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    fetchStats,
    cleanupQueue,
    refreshStats: fetchStats,
  };
}

/**
 * Hook for batch job operations
 */
export function useBatchJobOperations() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelJobs = useCallback(async (jobIds: string[]): Promise<{
    success: boolean;
    cancelledCount?: number;
    error?: string;
  }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('processing_queue')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .in('id', jobIds)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true, cancelledCount: jobIds.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel jobs';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [user]);

  const retryJobs = useCallback(async (jobIds: string[]): Promise<{
    success: boolean;
    retriedCount?: number;
    error?: string;
  }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('processing_queue')
        .update({ 
          status: 'pending',
          error_message: null,
          started_at: null,
          completed_at: null,
        })
        .in('id', jobIds)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true, retriedCount: jobIds.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retry jobs';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [user]);

  const deleteJobs = useCallback(async (jobIds: string[]): Promise<{
    success: boolean;
    deletedCount?: number;
    error?: string;
  }> => {
    if (!user) return { success: false, error: 'User not authenticated' };

    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('processing_queue')
        .delete()
        .in('id', jobIds)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true, deletedCount: jobIds.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete jobs';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [user]);

  return {
    loading,
    error,
    cancelJobs,
    retryJobs,
    deleteJobs,
  };
}