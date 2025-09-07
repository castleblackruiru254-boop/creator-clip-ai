import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export interface QueueJob {
  id: string;
  type: 'process_video' | 'generate_clip' | 'generate_subtitles';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'normal' | 'high';
  payload: any;
  user_id: string;
  progress: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
}

export interface ProcessingProgress {
  job_id: string;
  project_id?: string;
  clip_id?: string;
  stage: 'download' | 'transcript' | 'analysis' | 'processing' | 'upload';
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

      setJobs(data || []);
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

      if (error) throw error;

      setActiveJobs(data || []);
    } catch (err) {
      console.error('Failed to fetch active jobs:', err);
    }
  }, [user]);

  /**
   * Adds a new job to the queue
   */
  const addJob = useCallback(async (
    type: QueueJob['type'],
    payload: any,
    priority: QueueJob['priority'] = 'normal'
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
    try {
      const { error } = await supabase
        .from('processing_queue')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('user_id', user?.id);

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
        .eq('user_id', user?.id);

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
    status?: QueueJob['status'];
    type?: QueueJob['type'];
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
        jobs: data || [],
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

  /**
   * Gets queue statistics
   */
  const getQueueStats = useCallback(async (): Promise<{
    totalJobs: number;
    pendingJobs: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
    avgProcessingTime?: string;
    error?: string;
  }> => {
    try {
      const { data, error } = await supabase.rpc('get_queue_stats');

      if (error) throw error;

      const stats = data?.[0] || {};

      return {
        totalJobs: stats.total_jobs || 0,
        pendingJobs: stats.pending_jobs || 0,
        processingJobs: stats.processing_jobs || 0,
        completedJobs: stats.completed_jobs || 0,
        failedJobs: stats.failed_jobs || 0,
        avgProcessingTime: stats.avg_processing_time,
      };
    } catch (err) {
      return {
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        error: err instanceof Error ? err.message : 'Failed to fetch queue stats',
      };
    }
  }, []);

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

    // Subscribe to progress updates
    const progressSubscription = supabase
      .channel('progress_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_processing_progress',
        },
        () => {
          fetchActiveJobs();
        }
      )
      .subscribe();

    return () => {
      jobsSubscription.unsubscribe();
      progressSubscription.unsubscribe();
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
    getQueueStats,
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

      const { data, error } = await supabase
        .from('video_processing_progress')
        .select('*')
        .eq('job_id', jobId)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore "not found" errors
        throw error;
      }

      setProgress(data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch progress');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Set up real-time subscription for progress updates
  useEffect(() => {
    if (!jobId) return;

    const subscription = supabase
      .channel(`progress_${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_processing_progress',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          if (payload.new) {
            setProgress(payload.new as ProcessingProgress);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
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

      const { data, error } = await supabase.rpc('get_queue_stats');

      if (error) throw error;

      const statsData = data?.[0] || {};
      setStats({
        totalJobs: statsData.total_jobs || 0,
        pendingJobs: statsData.pending_jobs || 0,
        processingJobs: statsData.processing_jobs || 0,
        completedJobs: statsData.completed_jobs || 0,
        failedJobs: statsData.failed_jobs || 0,
        avgProcessingTime: statsData.avg_processing_time,
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
      const { data, error } = await supabase.rpc('cleanup_queue_jobs');

      if (error) throw error;

      await fetchStats(); // Refresh stats after cleanup

      return { success: true, deletedCount: data };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cleanup queue';
      setError(message);
      return { success: false, error: message };
    }
  }, [fetchStats]);

  // Set up real-time subscription for queue changes
  useEffect(() => {
    const subscription = supabase
      .channel('queue_stats')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'processing_queue',
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
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
  };
}

/**
 * Hook for processing video from URL
 */
export function useVideoProcessor() {
  const { addJob } = useVideoQueue();
  const [processing, setProcessing] = useState(false);

  /**
   * Processes a video from URL
   */
  const processVideo = useCallback(async (
    url: string,
    projectTitle: string,
    options?: {
      priority?: 'low' | 'normal' | 'high';
      clipCount?: number;
      clipDuration?: number;
    }
  ): Promise<{
    success: boolean;
    jobId?: string;
    error?: string;
  }> => {
    try {
      setProcessing(true);

      const payload = {
        url,
        projectTitle,
        clipCount: options?.clipCount || 5,
        clipDuration: options?.clipDuration || 60,
      };

      const result = await addJob('process_video', payload, options?.priority);

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start video processing';
      return { success: false, error: message };
    } finally {
      setProcessing(false);
    }
  }, [addJob]);

  /**
   * Generates additional clips for a project
   */
  const generateAdditionalClips = useCallback(async (
    projectId: string,
    clipCount: number = 3
  ): Promise<{
    success: boolean;
    jobId?: string;
    error?: string;
  }> => {
    try {
      setProcessing(true);

      const payload = {
        projectId,
        clipCount,
      };

      const result = await addJob('generate_clip', payload, 'normal');

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate additional clips';
      return { success: false, error: message };
    } finally {
      setProcessing(false);
    }
  }, [addJob]);

  /**
   * Generates subtitles for a clip
   */
  const generateSubtitles = useCallback(async (
    clipId: string,
    options?: {
      enhanced?: boolean;
      style?: 'casual' | 'professional' | 'engaging';
    }
  ): Promise<{
    success: boolean;
    jobId?: string;
    error?: string;
  }> => {
    try {
      setProcessing(true);

      const payload = {
        clipId,
        enhanced: options?.enhanced !== false,
        style: options?.style || 'engaging',
      };

      const result = await addJob('generate_subtitles', payload, 'normal');

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate subtitles';
      return { success: false, error: message };
    } finally {
      setProcessing(false);
    }
  }, [addJob]);

  return {
    processing,
    processVideo,
    generateAdditionalClips,
    generateSubtitles,
  };
}

/**
 * Hook for monitoring processing progress with real-time updates
 */
export function useProcessingMonitor(projectId?: string) {
  const [progress, setProgress] = useState<{
    stage: string;
    progress: number;
    message?: string;
    estimatedCompletion?: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    // Subscribe to progress updates for this project
    const subscription = supabase
      .channel(`project_progress_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'video_processing_progress',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.new) {
            const data = payload.new as ProcessingProgress;
            setProgress({
              stage: data.stage,
              progress: data.progress_percent,
              message: data.message,
            });
            setIsProcessing(data.progress_percent < 100);
          }
        }
      )
      .subscribe();

    // Subscribe to job completion
    const jobSubscription = supabase
      .channel(`project_jobs_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'processing_queue',
        },
        (payload) => {
          if (payload.new && payload.new.status === 'completed') {
            setIsProcessing(false);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      jobSubscription.unsubscribe();
    };
  }, [projectId]);

  return {
    progress,
    isProcessing,
  };
}

/**
 * Hook for batch job operations
 */
export function useBatchJobOperations() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Cancels multiple jobs
   */
  const cancelJobs = useCallback(async (jobIds: string[]): Promise<{
    success: boolean;
    cancelledCount: number;
    error?: string;
  }> => {
    if (!user) {
      return { success: false, cancelledCount: 0, error: 'User not authenticated' };
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('processing_queue')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .in('id', jobIds)
        .eq('user_id', user.id)
        .select('id');

      if (error) throw error;

      return { 
        success: true, 
        cancelledCount: data?.length || 0 
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel jobs';
      setError(message);
      return { success: false, cancelledCount: 0, error: message };
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * Retries multiple failed jobs
   */
  const retryJobs = useCallback(async (jobIds: string[]): Promise<{
    success: boolean;
    retriedCount: number;
    error?: string;
  }> => {
    if (!user) {
      return { success: false, retriedCount: 0, error: 'User not authenticated' };
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('processing_queue')
        .update({ 
          status: 'pending',
          error_message: null,
          started_at: null,
          completed_at: null,
        })
        .in('id', jobIds)
        .eq('user_id', user.id)
        .eq('status', 'failed') // Only retry failed jobs
        .select('id');

      if (error) throw error;

      return { 
        success: true, 
        retriedCount: data?.length || 0 
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retry jobs';
      setError(message);
      return { success: false, retriedCount: 0, error: message };
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * Deletes multiple completed/failed jobs
   */
  const deleteJobs = useCallback(async (jobIds: string[]): Promise<{
    success: boolean;
    deletedCount: number;
    error?: string;
  }> => {
    if (!user) {
      return { success: false, deletedCount: 0, error: 'User not authenticated' };
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('processing_queue')
        .delete()
        .in('id', jobIds)
        .eq('user_id', user.id)
        .in('status', ['completed', 'failed', 'cancelled'])
        .select('id');

      if (error) throw error;

      return { 
        success: true, 
        deletedCount: data?.length || 0 
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete jobs';
      setError(message);
      return { success: false, deletedCount: 0, error: message };
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
