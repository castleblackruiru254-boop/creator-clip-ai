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
  BarChart3
} from 'lucide-react';

// Simplified mock interfaces for demo purposes
interface QueueJob {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  payload: any;
  progress: number;
  created_at: string;
  error_message?: string;
  retry_count: number;
  max_retries: number;
}

interface ActiveJob {
  job_id: string;
  job_type: string;
  job_status: string;
  job_progress: number;
  created_at: string;
}

// Helper functions
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
  return job.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Mock hook for demo
function useVideoQueue() {
  return {
    jobs: [] as QueueJob[],
    activeJobs: [] as ActiveJob[],
    loading: false,
    error: null,
    cancelJob: (_id: string) => Promise.resolve(),
    retryJob: (_id: string) => Promise.resolve(),
  };
}

interface ProcessingProgressProps {
  className?: string;
}

export function ProcessingProgress({ className }: ProcessingProgressProps) {
  const { jobs, activeJobs, loading, error, cancelJob, retryJob } = useVideoQueue();

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
            <QueueStats />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ActiveJobCard({ job }: { job: ActiveJob }) {
  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div>
              <p className="font-medium">{job.job_type.replace('_', ' ')}</p>
              <p className="text-sm text-gray-600">Processing...</p>
            </div>
          </div>
          <Badge className="bg-blue-100 text-blue-800">
            Processing
          </Badge>
        </div>

        <Progress value={job.job_progress} className="mb-2" />
        
        <div className="flex justify-between text-sm text-gray-600">
          <span>{job.job_progress}% complete</span>
        </div>
      </CardContent>
    </Card>
  );
}

function JobCard({ job, onCancel, onRetry }: { 
  job: QueueJob; 
  onCancel: () => void; 
  onRetry: () => void;
}) {
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

function QueueStats() {
  const mockStats = {
    totalJobs: 0,
    pendingJobs: 0,
    processingJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{mockStats.totalJobs}</div>
          <div className="text-sm text-blue-700">Total Jobs</div>
        </div>
        
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">{mockStats.pendingJobs}</div>
          <div className="text-sm text-yellow-700">Pending</div>
        </div>
        
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{mockStats.completedJobs}</div>
          <div className="text-sm text-green-700">Completed</div>
        </div>
        
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{mockStats.failedJobs}</div>
          <div className="text-sm text-red-700">Failed</div>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Success Rate</span>
          <span className="text-sm text-gray-600">100%</span>
        </div>
        <Progress value={100} className="w-full" />
      </div>
    </div>
  );
}

export function ProcessingMonitor({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Processing Video
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-6 text-gray-500">
          No active processing
        </div>
      </CardContent>
    </Card>
  );
}

export function JobHistory({ limit = 10, className }: { 
  limit?: number; 
  className?: string;
}) {
  const mockJobs: QueueJob[] = [];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent Jobs</CardTitle>
      </CardHeader>
      <CardContent>
        {mockJobs.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            No processing jobs yet
          </div>
        ) : (
          <div className="space-y-3">
            {mockJobs.slice(0, limit).map((job) => (
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

                <Badge className={getStatusColor(job.status)}>
                  {job.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}