import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DatabasePoolMonitor } from '@/lib/database-pool';
import { CDNUtils } from '@/lib/cdn-manager';
import { Activity, Server, Database, Globe, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface ScalingMetrics {
  currentInstances: number;
  metrics: {
    cpu: number;
    memory: number;
    requestRate: number;
    queueLength: number;
    responseTime: number;
  };
  lastScaleAction: string;
  cooldownRemaining: number;
}

interface DatabaseStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  poolUtilization: number;
  averageResponseTime: number;
  errorRate: number;
}

interface CDNStats {
  failedAssetsCount: number;
  preloadedAssetsCount: number;
  manifestSize: number;
  cdnEnabled: boolean;
  failedAssets: string[];
}

const ScalingDashboard: React.FC = () => {
  const [scalingMetrics, setScalingMetrics] = useState<ScalingMetrics | null>(null);
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);
  const [cdnStats, setCdnStats] = useState<CDNStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch scaling metrics from auto-scaler
  const fetchScalingMetrics = async () => {
    try {
      const response = await fetch('/api/autoscaler/status');
      if (response.ok) {
        const data = await response.json();
        setScalingMetrics(data);
      } else {
        throw new Error('Failed to fetch scaling metrics');
      }
    } catch (err) {
      console.error('Error fetching scaling metrics:', err);
      setError('Failed to load scaling metrics');
    }
  };

  // Fetch database pool statistics
  const fetchDatabaseStats = () => {
    try {
      const stats = DatabasePoolMonitor.getStats();
      setDatabaseStats(stats);
    } catch (err) {
      console.error('Error fetching database stats:', err);
    }
  };

  // Fetch CDN statistics
  const fetchCDNStats = () => {
    try {
      const stats = CDNUtils.getStats();
      setCdnStats(stats);
    } catch (err) {
      console.error('Error fetching CDN stats:', err);
    }
  };

  // Manual scaling actions
  const handleScaleUp = async () => {
    try {
      const response = await fetch('/api/autoscaler/scale-up', { method: 'POST' });
      if (response.ok) {
        await fetchScalingMetrics();
      } else {
        throw new Error('Failed to scale up');
      }
    } catch (err) {
      setError('Failed to scale up: ' + (err as Error).message);
    }
  };

  const handleScaleDown = async () => {
    try {
      const response = await fetch('/api/autoscaler/scale-down', { method: 'POST' });
      if (response.ok) {
        await fetchScalingMetrics();
      } else {
        throw new Error('Failed to scale down');
      }
    } catch (err) {
      setError('Failed to scale down: ' + (err as Error).message);
    }
  };

  // Initialize data fetching
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([
        fetchScalingMetrics(),
        fetchDatabaseStats(),
        fetchCDNStats(),
      ]);
      setLoading(false);
    };

    fetchData();

    // Set up polling for real-time updates
    const interval = setInterval(fetchData, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }


  const getHealthStatus = () => {
    if (!scalingMetrics || !databaseStats) return 'unknown';
    
    if (scalingMetrics.metrics.cpu > 90 || scalingMetrics.metrics.memory > 90 || databaseStats.poolUtilization > 95) {
      return 'critical';
    }
    
    if (scalingMetrics.metrics.cpu > 70 || scalingMetrics.metrics.memory > 80 || databaseStats.poolUtilization > 80) {
      return 'warning';
    }
    
    return 'healthy';
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Scaling Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor and manage application scaling, database pooling, and CDN performance
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Badge variant={healthStatus === 'healthy' ? 'default' : healthStatus === 'warning' ? 'secondary' : 'destructive'}>
            {healthStatus === 'healthy' && '🟢 Healthy'}
            {healthStatus === 'warning' && '🟡 Warning'}
            {healthStatus === 'critical' && '🔴 Critical'}
          </Badge>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scaling">Auto-Scaling</TabsTrigger>
          <TabsTrigger value="database">Database Pool</TabsTrigger>
          <TabsTrigger value="cdn">CDN Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Instances</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{scalingMetrics?.currentInstances || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Min: 3, Max: 20
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{scalingMetrics?.metrics.cpu.toFixed(1) || 0}%</div>
                <Progress value={scalingMetrics?.metrics.cpu || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">DB Pool Usage</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{databaseStats?.poolUtilization.toFixed(1) || 0}%</div>
                <Progress value={databaseStats?.poolUtilization || 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CDN Status</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {cdnStats?.cdnEnabled ? 'Enabled' : 'Disabled'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {cdnStats?.failedAssetsCount || 0} failed assets
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="scaling" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Scaling Controls</CardTitle>
                <CardDescription>
                  Manual scaling controls for emergency situations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Current Instances:</span>
                  <Badge variant="outline">{scalingMetrics?.currentInstances || 0}</Badge>
                </div>
                
                <div className="flex space-x-2">
                  <Button 
                    onClick={handleScaleUp}
                    disabled={!scalingMetrics || scalingMetrics.currentInstances >= 20}
                    className="flex-1"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Scale Up
                  </Button>
                  
                  <Button 
                    onClick={handleScaleDown}
                    disabled={!scalingMetrics || scalingMetrics.currentInstances <= 3}
                    variant="outline"
                    className="flex-1"
                  >
                    <TrendingDown className="h-4 w-4 mr-2" />
                    Scale Down
                  </Button>
                </div>

                {scalingMetrics?.cooldownRemaining && scalingMetrics.cooldownRemaining > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Scaling Cooldown Active</AlertTitle>
                    <AlertDescription>
                      Next scaling action available in {Math.ceil((scalingMetrics?.cooldownRemaining || 0) / 1000)} seconds
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>
                  Real-time application performance indicators
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Memory Usage</span>
                    <span>{scalingMetrics?.metrics.memory.toFixed(1) || 0}%</span>
                  </div>
                  <Progress value={scalingMetrics?.metrics.memory || 0} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Request Rate</span>
                    <span>{scalingMetrics?.metrics.requestRate.toFixed(1) || 0}/s</span>
                  </div>
                  <Progress value={Math.min((scalingMetrics?.metrics.requestRate || 0) / 100 * 100, 100)} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Response Time</span>
                    <span>{scalingMetrics?.metrics.responseTime.toFixed(0) || 0}ms</span>
                  </div>
                  <Progress value={Math.min((scalingMetrics?.metrics.responseTime || 0) / 2000 * 100, 100)} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Queue Length</span>
                    <span>{scalingMetrics?.metrics.queueLength || 0}</span>
                  </div>
                  <Progress value={Math.min((scalingMetrics?.metrics.queueLength || 0) / 100 * 100, 100)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Connection Pool Status</CardTitle>
                <CardDescription>
                  Database connection pool performance and utilization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {databaseStats?.totalConnections || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Connections</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {databaseStats?.activeConnections || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Active</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600">
                      {databaseStats?.idleConnections || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Idle</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {databaseStats?.waitingRequests || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Waiting</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Pool Utilization</span>
                    <span>{databaseStats?.poolUtilization.toFixed(1) || 0}%</span>
                  </div>
                  <Progress 
                    value={databaseStats?.poolUtilization || 0} 
                    className={databaseStats && databaseStats.poolUtilization > 80 ? 'bg-red-200' : ''}
                  />
                </div>

                <div className="flex justify-between text-sm">
                  <span>Avg Response Time:</span>
                  <span>{databaseStats?.averageResponseTime.toFixed(2) || 0}ms</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span>Error Rate:</span>
                  <span className={databaseStats && databaseStats.errorRate > 5 ? 'text-red-600' : 'text-green-600'}>
                    {databaseStats?.errorRate.toFixed(2) || 0}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Database Health</CardTitle>
                <CardDescription>
                  Connection pool health status and recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {databaseStats && (
                  <div className="space-y-4">
                    {databaseStats.poolUtilization > 90 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Critical Pool Utilization</AlertTitle>
                        <AlertDescription>
                          Connection pool is almost exhausted. Consider increasing pool size or scaling up.
                        </AlertDescription>
                      </Alert>
                    )}

                    {databaseStats.waitingRequests > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Connections Queued</AlertTitle>
                        <AlertDescription>
                          {databaseStats.waitingRequests} requests are waiting for database connections.
                        </AlertDescription>
                      </Alert>
                    )}

                    {databaseStats.errorRate > 5 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>High Error Rate</AlertTitle>
                        <AlertDescription>
                          Database error rate is {databaseStats.errorRate.toFixed(1)}%. Check database connectivity.
                        </AlertDescription>
                      </Alert>
                    )}

                    {databaseStats.poolUtilization < 50 && databaseStats.errorRate < 1 && (
                      <Alert>
                        <Activity className="h-4 w-4" />
                        <AlertTitle>Pool Healthy</AlertTitle>
                        <AlertDescription>
                          Database connection pool is operating within normal parameters.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cdn" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>CDN Performance</CardTitle>
                <CardDescription>
                  Content delivery network status and metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>CDN Status:</span>
                  <Badge variant={cdnStats?.cdnEnabled ? 'default' : 'secondary'}>
                    {cdnStats?.cdnEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {cdnStats?.preloadedAssetsCount || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Preloaded Assets</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {cdnStats?.manifestSize || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Assets</div>
                  </div>
                </div>

                {cdnStats && cdnStats.failedAssetsCount > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Failed Assets:</span>
                      <span className="text-red-600">{cdnStats.failedAssetsCount}</span>
                    </div>
                    
                    <Button 
                      onClick={() => CDNUtils.invalidateAssets(cdnStats.failedAssets)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Retry Failed Assets
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>CDN Health</CardTitle>
                <CardDescription>
                  Asset delivery performance and reliability
                </CardDescription>
              </CardHeader>
              <CardContent>
                {cdnStats && (
                  <div className="space-y-4">
                    {!cdnStats.cdnEnabled && (
                      <Alert>
                        <Globe className="h-4 w-4" />
                        <AlertTitle>CDN Disabled</AlertTitle>
                        <AlertDescription>
                          CDN is disabled. Assets are being served directly from the application.
                        </AlertDescription>
                      </Alert>
                    )}

                    {cdnStats.failedAssetsCount > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Asset Delivery Issues</AlertTitle>
                        <AlertDescription>
                          {cdnStats.failedAssetsCount} assets failed to load from CDN and are using fallback.
                        </AlertDescription>
                      </Alert>
                    )}

                    {cdnStats.cdnEnabled && cdnStats.failedAssetsCount === 0 && (
                      <Alert>
                        <Activity className="h-4 w-4" />
                        <AlertTitle>CDN Healthy</AlertTitle>
                        <AlertDescription>
                          All assets are being delivered successfully through the CDN.
                        </AlertDescription>
                      </Alert>
                    )}

                    {cdnStats.failedAssets.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Failed Assets:</h4>
                        <div className="max-h-32 overflow-y-auto text-sm">
                          {cdnStats.failedAssets.map((asset, index) => (
                            <div key={index} className="text-red-600 font-mono">
                              {asset}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ScalingDashboard;
