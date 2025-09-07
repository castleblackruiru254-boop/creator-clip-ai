import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Play, 
  Pause, 
  RotateCcw,
  Trash2,
  Download,
  FileText,
  Scissors,
  Upload,
  BarChart3
} from 'lucide-react';
import { 
  useVideoQueue, 
  useJobProgress, 
  useQueueManagement, 
  useBatchJobOperations,
  type QueueJob,
  type ActiveJob 
} from '@/hooks/use-video-queue';
import { formatDuration } from '@/lib/video-validation';

// Add useProcessingMonitor to the existing hook exports
function useProcessingMonitor(projectId?: string) {
  // This is imported from the hooks file but needs to be available locally
  // In a real implementation, this would be in the hooks file
  return {
    progress: null,
    isProcessing: false,
  };
}

interface ProcessingProgressProps {
  className?: string;
}

export function ProcessingProgress({ className }: ProcessingProgressProps) {
  const { jobs, activeJobs, loading, error, cancelJob, retryJob } = useVideoQueue();
  const { stats, cleanupQueue } = useQueueManagement();
  const { cancelJobs, retryJobs, deleteJobs } = useBatchJobOperations();

  const getStatusIcon = (status: QueueJob['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing':
        return <Play className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <Pause className="w-4 h-4 text-gray-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'download':
        return <Download className="w-4 h-4" />;
      case 'transcript':
        return <FileText className="w-4 h-4" />;
      case 'analysis':
        return <BarChart3 className="w-4 h-4" />;
      case 'processing':
        return <Scissors className="w-4 h-4" />;
      case 'upload':
        return <Upload className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: QueueJob['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const formatJobTitle = (job: QueueJob) => {
    switch (job.type) {
      case 'process_video':
        return `Process: ${job.payload.projectTitle || 'Video'}`;
      case 'generate_clip':
        return `Generate Clip`;
      case 'generate_subtitles':
        return `Generate Subtitles`;
      default:
        return job.type;
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2">Loading queue...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center text-red-600">
            <XCircle className="w-5 h-5 mr-2" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Processing Queue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">Active Jobs ({activeJobs.length})</TabsTrigger>
            <TabsTrigger value="history">History ({jobs.length})</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 mt-4">
            {activeJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No active jobs
              </div>
            ) : (
              <div className="space-y-3">
                {activeJobs.map((job) => (
                  <ActiveJobCard key={job.job_id} job={job} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 mt-4">
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No jobs in history
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <JobCard 
                    key={job.id} 
                    job={job} 
                    onCancel={() => cancelJob(job.id)}
                    onRetry={() => retryJob(job.id)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <QueueStats stats={stats} onCleanup={cleanupQueue} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface ActiveJobCardProps {
  job: ActiveJob;
}

function ActiveJobCard({ job }: ActiveJobCardProps) {
  const { progress } = useJobProgress(job.job_id);

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {progress && getStageIcon(progress.stage)}
            <div>
              <p className="font-medium">{job.job_type.replace('_', ' ')}</p>
              {progress && (
                <p className="text-sm text-gray-600 capitalize">
                  {progress.stage} stage
                </p>
              )}
            </div>
          </div>
          <Badge className="bg-blue-100 text-blue-800">
            Processing
          </Badge>
        </div>

        <Progress value={job.job_progress} className="mb-2" />
        
        <div className="flex justify-between text-sm text-gray-600">
          <span>{job.job_progress}% complete</span>
          {job.estimated_completion && (
            <span>ETA: {formatDuration(
              Math.max(0, new Date(job.estimated_completion).getTime() - Date.now()) / 1000
            )}</span>
          )}
        </div>

        {(progress?.message || job.message) && (
          <p className="text-sm text-gray-600 mt-2">
            {progress?.message || job.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface JobCardProps {
  job: QueueJob;
  onCancel: () => void;
  onRetry: () => void;
}

function JobCard({ job, onCancel, onRetry }: JobCardProps) {
  const canCancel = job.status === 'pending' || job.status === 'processing';
  const canRetry = job.status === 'failed' && job.retry_count < job.max_retries;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {getStatusIcon(job.status)}
            <div className="flex-1">
              <h4 className="font-medium">{formatJobTitle(job)}</h4>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={getStatusColor(job.status)}>
                  {job.status}
                </Badge>
                <span className="text-sm text-gray-500">
                  Created {new Date(job.created_at).toLocaleDateString()}
                </span>
              </div>
              
              {job.status === 'processing' && (
                <div className="mt-2">
                  <Progress value={job.progress} className="w-32" />
                  <span className="text-xs text-gray-600">{job.progress}%</span>
                </div>
              )}
              
              {job.error_message && (
                <p className="text-sm text-red-600 mt-2">
                  {job.error_message}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="text-red-600 hover:text-red-700"
              >
                <Pause className="w-4 h-4" />
              </Button>
            )}
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="text-blue-600 hover:text-blue-700"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface QueueStatsProps {
  stats: {
    totalJobs: number;
    pendingJobs: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
    avgProcessingTime?: string;
  } | null;
  onCleanup: () => Promise<any>;
}

function QueueStats({ stats, onCleanup }: QueueStatsProps) {
  const [cleaningUp, setCleaningUp] = React.useState(false);

  const handleCleanup = async () => {
    setCleaningUp(true);
    try {
      await onCleanup();
    } finally {
      setCleaningUp(false);
    }
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading statistics...</span>
      </div>
    );
  }

  const { totalJobs, pendingJobs, processingJobs, completedJobs, failedJobs } = stats;
  const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{totalJobs}</div>
          <div className="text-sm text-blue-700">Total Jobs</div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">{pendingJobs}</div>
          <div className="text-sm text-yellow-700">Pending</div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{completedJobs}</div>
          <div className="text-sm text-green-700">Completed</div>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{failedJobs}</div>
          <div className="text-sm text-red-700">Failed</div>
        </div>
      </div>

      {/* Success Rate */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Success Rate</span>
          <span className="text-sm text-gray-600">{successRate.toFixed(1)}%</span>
        </div>
        <Progress value={successRate} className="w-full" />
      </div>

      {/* Processing Time */}
      {stats.avgProcessingTime && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Average Processing Time</span>
            <span className="text-sm text-gray-600">{stats.avgProcessingTime}</span>
          </div>
        </div>
      )}

      {/* Cleanup Button */}
      <div className="pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleCleanup}
          disabled={cleaningUp}
          className="w-full"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {cleaningUp ? 'Cleaning up...' : 'Clean up old jobs'}
        </Button>
      </div>
    </div>
  );
}

interface ProcessingMonitorProps {
  projectId: string;
  className?: string;
}

export function ProcessingMonitor({ projectId, className }: ProcessingMonitorProps) {
  const { progress, isProcessing } = useProcessingMonitor(projectId);

  if (!isProcessing && !progress) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          {getStageIcon(progress?.stage || 'processing')}
          Processing Video
        </CardTitle>
      </CardHeader>
      <CardContent>
        {progress && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium capitalize">
                {progress.stage} Stage
              </span>
              <span className="text-sm text-gray-600">
                {progress.progress}%
              </span>
            </div>
            
            <Progress value={progress.progress} className="w-full" />
            
            {progress.message && (
              <p className="text-sm text-gray-600">{progress.message}</p>
            )}

            {progress.estimatedCompletion && (
              <p className="text-xs text-gray-500">
                Estimated completion: {new Date(progress.estimatedCompletion).toLocaleTimeString()}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface JobHistoryProps {
  limit?: number;
  showActions?: boolean;
  className?: string;
}

export function JobHistory({ limit = 10, showActions = true, className }: JobHistoryProps) {
  const { jobs, cancelJob, retryJob } = useVideoQueue();
  const recentJobs = limit ? jobs.slice(0, limit) : jobs;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent Jobs</CardTitle>
      </CardHeader>
      <CardContent>
        {recentJobs.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            No processing jobs yet
          </div>
        ) : (
          <div className="space-y-3">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="font-medium">{formatJobTitle(job)}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(job.status)}>
                    {job.status}
                  </Badge>
                  
                  {showActions && (
                    <div className="flex gap-1">
                      {(job.status === 'pending' || job.status === 'processing') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelJob(job.id)}
                        >
                          <Pause className="w-4 h-4" />
                        </Button>
                      )}
                      {job.status === 'failed' && job.retry_count < job.max_retries && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryJob(job.id)}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ProcessingStatusBadgeProps {
  jobId: string;
  showProgress?: boolean;
  className?: string;
}

export function ProcessingStatusBadge({ 
  jobId, 
  showProgress = false, 
  className 
}: ProcessingStatusBadgeProps) {
  const { progress } = useJobProgress(jobId);

  if (!progress) {
    return (
      <Badge variant="secondary" className={className}>
        Unknown
      </Badge>
    );
  }

  const isProcessing = progress.progress_percent < 100;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge 
        className={`${isProcessing ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}
      >
        {isProcessing ? 'Processing' : 'Completed'}
      </Badge>
      
      {showProgress && isProcessing && (
        <div className="flex items-center gap-2">
          <Progress value={progress.progress_percent} className="w-20" />
          <span className="text-xs text-gray-600">
            {progress.progress_percent}%
          </span>
        </div>
      )}
    </div>
  );
}
