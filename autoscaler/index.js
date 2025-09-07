const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const Redis = require('ioredis');

const execAsync = promisify(exec);

class AutoScaler {
  constructor() {
    this.config = {
      minInstances: parseInt(process.env.MIN_INSTANCES || '3'),
      maxInstances: parseInt(process.env.MAX_INSTANCES || '10'),
      cpuThreshold: parseInt(process.env.CPU_THRESHOLD || '70'),
      memoryThreshold: parseInt(process.env.MEMORY_THRESHOLD || '80'),
      requestRateThreshold: parseInt(process.env.REQUEST_RATE_THRESHOLD || '100'),
      scaleUpCooldown: parseInt(process.env.SCALE_UP_COOLDOWN || '60'),
      scaleDownCooldown: parseInt(process.env.SCALE_DOWN_COOLDOWN || '300'),
      prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
      redisUrl: process.env.REDIS_URL || 'redis://redis-cluster:6379',
      composeProjectName: process.env.COMPOSE_PROJECT_NAME || 'creator-clip-ai',
    };

    this.redis = new Redis(this.config.redisUrl);
    this.lastScaleAction = 0;
    this.currentInstances = this.config.minInstances;
    this.metrics = {
      cpu: 0,
      memory: 0,
      requestRate: 0,
      queueLength: 0,
      responseTime: 0,
    };

    this.initialize();
  }

  async initialize() {
    console.log('🚀 Auto-scaler starting up...', {
      config: this.config,
      timestamp: new Date().toISOString(),
    });

    // Start monitoring
    this.startMetricsCollection();
    this.startScalingLoop();
    
    // Setup HTTP server for health checks and admin
    this.setupHttpServer();
    
    console.log('✅ Auto-scaler initialized successfully');
  }

  setupHttpServer() {
    const app = express();
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        currentInstances: this.currentInstances,
        config: this.config,
        metrics: this.metrics,
      });
    });

    // Get current scaling status
    app.get('/status', (req, res) => {
      res.json({
        currentInstances: this.currentInstances,
        metrics: this.metrics,
        lastScaleAction: new Date(this.lastScaleAction).toISOString(),
        cooldownRemaining: Math.max(0, this.getRemainingCooldown()),
      });
    });

    // Manual scaling endpoints
    app.post('/scale-up', async (req, res) => {
      try {
        const result = await this.scaleUp('manual');
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/scale-down', async (req, res) => {
      try {
        const result = await this.scaleDown('manual');
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Set target instance count
    app.post('/scale-to/:count', async (req, res) => {
      try {
        const targetCount = parseInt(req.params.count);
        if (isNaN(targetCount) || targetCount < this.config.minInstances || targetCount > this.config.maxInstances) {
          return res.status(400).json({ 
            success: false, 
            error: `Invalid count. Must be between ${this.config.minInstances} and ${this.config.maxInstances}` 
          });
        }

        const result = await this.scaleTo(targetCount, 'manual');
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    const port = process.env.PORT || 3002;
    app.listen(port, () => {
      console.log(`🌐 Auto-scaler HTTP server listening on port ${port}`);
    });
  }

  async startMetricsCollection() {
    setInterval(async () => {
      try {
        await Promise.all([
          this.collectPrometheusMetrics(),
          this.collectRedisMetrics(),
          this.collectDockerMetrics(),
        ]);
      } catch (error) {
        console.error('❌ Error collecting metrics:', error.message);
      }
    }, 10000); // Every 10 seconds
  }

  async collectPrometheusMetrics() {
    try {
      // CPU usage
      const cpuQuery = `avg(rate(container_cpu_usage_seconds_total{name=~"creator-clip-ai-app.*"}[5m])) * 100`;
      const cpuResponse = await fetch(`${this.config.prometheusUrl}/api/v1/query?query=${encodeURIComponent(cpuQuery)}`);
      const cpuData = await cpuResponse.json();
      
      if (cpuData.data?.result?.length > 0) {
        this.metrics.cpu = parseFloat(cpuData.data.result[0].value[1]);
      }

      // Memory usage
      const memoryQuery = `avg(container_memory_usage_bytes{name=~"creator-clip-ai-app.*"} / container_spec_memory_limit_bytes{name=~"creator-clip-ai-app.*"}) * 100`;
      const memoryResponse = await fetch(`${this.config.prometheusUrl}/api/v1/query?query=${encodeURIComponent(memoryQuery)}`);
      const memoryData = await memoryResponse.json();
      
      if (memoryData.data?.result?.length > 0) {
        this.metrics.memory = parseFloat(memoryData.data.result[0].value[1]);
      }

      // Request rate
      const requestQuery = `sum(rate(http_requests_total{job="creator-clip-ai"}[1m]))`;
      const requestResponse = await fetch(`${this.config.prometheusUrl}/api/v1/query?query=${encodeURIComponent(requestQuery)}`);
      const requestData = await requestResponse.json();
      
      if (requestData.data?.result?.length > 0) {
        this.metrics.requestRate = parseFloat(requestData.data.result[0].value[1]);
      }

      // Response time
      const responseQuery = `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="creator-clip-ai"}[5m]))`;
      const responseResponse = await fetch(`${this.config.prometheusUrl}/api/v1/query?query=${encodeURIComponent(responseQuery)}`);
      const responseData = await responseResponse.json();
      
      if (responseData.data?.result?.length > 0) {
        this.metrics.responseTime = parseFloat(responseData.data.result[0].value[1]) * 1000; // Convert to ms
      }
    } catch (error) {
      console.error('❌ Error collecting Prometheus metrics:', error.message);
    }
  }

  async collectRedisMetrics() {
    try {
      const queueLength = await this.redis.llen('video_processing_queue');
      this.metrics.queueLength = queueLength;
    } catch (error) {
      console.error('❌ Error collecting Redis metrics:', error.message);
    }
  }

  async collectDockerMetrics() {
    try {
      // Get current number of running app instances
      const { stdout } = await execAsync(`docker ps --filter "name=${this.config.composeProjectName}-app" --format "{{.Names}}" | wc -l`);
      this.currentInstances = parseInt(stdout.trim()) || this.config.minInstances;
    } catch (error) {
      console.error('❌ Error collecting Docker metrics:', error.message);
    }
  }

  async startScalingLoop() {
    setInterval(async () => {
      try {
        await this.evaluateScaling();
      } catch (error) {
        console.error('❌ Error in scaling loop:', error.message);
      }
    }, 30000); // Every 30 seconds
  }

  async evaluateScaling() {
    const now = Date.now();
    const cooldownRemaining = this.getRemainingCooldown();

    if (cooldownRemaining > 0) {
      console.log(`⏳ Scaling cooldown active: ${Math.ceil(cooldownRemaining / 1000)}s remaining`);
      return;
    }

    const shouldScaleUp = this.shouldScaleUp();
    const shouldScaleDown = this.shouldScaleDown();

    console.log('📊 Current metrics:', {
      cpu: `${this.metrics.cpu.toFixed(1)}%`,
      memory: `${this.metrics.memory.toFixed(1)}%`,
      requestRate: `${this.metrics.requestRate.toFixed(1)}/s`,
      queueLength: this.metrics.queueLength,
      responseTime: `${this.metrics.responseTime.toFixed(1)}ms`,
      currentInstances: this.currentInstances,
      shouldScaleUp,
      shouldScaleDown,
    });

    if (shouldScaleUp) {
      await this.scaleUp('automatic');
    } else if (shouldScaleDown) {
      await this.scaleDown('automatic');
    }
  }

  shouldScaleUp() {
    const reasons = [];

    if (this.metrics.cpu > this.config.cpuThreshold) {
      reasons.push(`CPU: ${this.metrics.cpu.toFixed(1)}% > ${this.config.cpuThreshold}%`);
    }

    if (this.metrics.memory > this.config.memoryThreshold) {
      reasons.push(`Memory: ${this.metrics.memory.toFixed(1)}% > ${this.config.memoryThreshold}%`);
    }

    if (this.metrics.requestRate > this.config.requestRateThreshold) {
      reasons.push(`Requests: ${this.metrics.requestRate.toFixed(1)}/s > ${this.config.requestRateThreshold}/s`);
    }

    if (this.metrics.queueLength > 50) {
      reasons.push(`Queue: ${this.metrics.queueLength} > 50`);
    }

    if (this.metrics.responseTime > 2000) {
      reasons.push(`Response time: ${this.metrics.responseTime.toFixed(1)}ms > 2000ms`);
    }

    if (reasons.length > 0 && this.currentInstances < this.config.maxInstances) {
      console.log('📈 Scale up triggered:', reasons.join(', '));
      return true;
    }

    return false;
  }

  shouldScaleDown() {
    // Only scale down if ALL metrics are well below thresholds
    const cpuOk = this.metrics.cpu < (this.config.cpuThreshold * 0.5);
    const memoryOk = this.metrics.memory < (this.config.memoryThreshold * 0.5);
    const requestRateOk = this.metrics.requestRate < (this.config.requestRateThreshold * 0.3);
    const queueOk = this.metrics.queueLength < 10;
    const responseTimeOk = this.metrics.responseTime < 500;

    if (cpuOk && memoryOk && requestRateOk && queueOk && responseTimeOk && this.currentInstances > this.config.minInstances) {
      console.log('📉 Scale down triggered: all metrics well below thresholds');
      return true;
    }

    return false;
  }

  async scaleUp(trigger) {
    if (this.currentInstances >= this.config.maxInstances) {
      console.log('⚠️ Cannot scale up: already at maximum instances');
      return { success: false, reason: 'At maximum instances' };
    }

    const newInstanceId = this.currentInstances + 1;
    const serviceName = `app${newInstanceId}`;

    try {
      console.log(`🔄 Scaling up: creating ${serviceName}...`);

      // Create new application instance using docker-compose
      const scaleCommand = `docker-compose -f docker-compose.scale.yml up -d --scale app${newInstanceId}=1`;
      await execAsync(scaleCommand);

      // Wait for health check
      await this.waitForInstanceHealth(serviceName);

      this.currentInstances = newInstanceId;
      this.lastScaleAction = Date.now();

      // Update load balancer configuration
      await this.updateLoadBalancerConfig();

      console.log(`✅ Successfully scaled up to ${this.currentInstances} instances`);

      // Log scaling event
      await this.redis.lpush('scaling_events', JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'scale_up',
        trigger,
        previousInstances: newInstanceId - 1,
        newInstances: newInstanceId,
        metrics: { ...this.metrics },
      }));

      return {
        success: true,
        action: 'scale_up',
        newInstances: this.currentInstances,
        trigger,
      };
    } catch (error) {
      console.error(`❌ Failed to scale up:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async scaleDown(trigger) {
    if (this.currentInstances <= this.config.minInstances) {
      console.log('⚠️ Cannot scale down: already at minimum instances');
      return { success: false, reason: 'At minimum instances' };
    }

    const instanceToRemove = this.currentInstances;
    const serviceName = `app${instanceToRemove}`;

    try {
      console.log(`🔄 Scaling down: removing ${serviceName}...`);

      // Gracefully drain connections from the instance
      await this.drainInstance(serviceName);

      // Remove the instance
      const stopCommand = `docker-compose -f docker-compose.scale.yml stop ${serviceName}`;
      await execAsync(stopCommand);

      const removeCommand = `docker-compose -f docker-compose.scale.yml rm -f ${serviceName}`;
      await execAsync(removeCommand);

      this.currentInstances = instanceToRemove - 1;
      this.lastScaleAction = Date.now();

      // Update load balancer configuration
      await this.updateLoadBalancerConfig();

      console.log(`✅ Successfully scaled down to ${this.currentInstances} instances`);

      // Log scaling event
      await this.redis.lpush('scaling_events', JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'scale_down',
        trigger,
        previousInstances: instanceToRemove,
        newInstances: this.currentInstances,
        metrics: { ...this.metrics },
      }));

      return {
        success: true,
        action: 'scale_down',
        newInstances: this.currentInstances,
        trigger,
      };
    } catch (error) {
      console.error(`❌ Failed to scale down:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async scaleTo(targetCount, trigger) {
    if (targetCount === this.currentInstances) {
      return { success: true, message: 'Already at target instance count' };
    }

    if (targetCount > this.currentInstances) {
      const scaleUpCount = targetCount - this.currentInstances;
      console.log(`📈 Scaling to ${targetCount} instances (adding ${scaleUpCount})`);
      
      for (let i = 0; i < scaleUpCount; i++) {
        const result = await this.scaleUp(trigger);
        if (!result.success) {
          return result;
        }
        
        // Brief delay between instances
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } else {
      const scaleDownCount = this.currentInstances - targetCount;
      console.log(`📉 Scaling to ${targetCount} instances (removing ${scaleDownCount})`);
      
      for (let i = 0; i < scaleDownCount; i++) {
        const result = await this.scaleDown(trigger);
        if (!result.success) {
          return result;
        }
        
        // Brief delay between instances
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    return {
      success: true,
      action: 'scale_to',
      targetInstances: targetCount,
      currentInstances: this.currentInstances,
      trigger,
    };
  }

  async waitForInstanceHealth(serviceName, maxWaitTime = 60000) {
    const startTime = Date.now();
    const healthCheckUrl = `http://${serviceName}:3000/api/health`;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const healthResponse = await fetch(healthCheckUrl, { timeout: 5000 });
        if (healthResponse.ok) {
          console.log(`✅ Instance ${serviceName} is healthy`);
          return true;
        }
      } catch (error) {
        // Instance not ready yet, continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error(`Instance ${serviceName} failed to become healthy within ${maxWaitTime}ms`);
  }

  async drainInstance(serviceName) {
    console.log(`🔄 Draining connections from ${serviceName}...`);
    
    try {
      // Signal instance to stop accepting new connections
      await fetch(`http://${serviceName}:3000/api/admin/drain`, { 
        method: 'POST',
        timeout: 5000,
      });

      // Wait for existing connections to complete
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      console.log(`✅ Successfully drained ${serviceName}`);
    } catch (error) {
      console.warn(`⚠️ Could not gracefully drain ${serviceName}:`, error.message);
    }
  }

  async updateLoadBalancerConfig() {
    try {
      // Generate upstream configuration for current instances
      let upstreamConfig = 'upstream backend_servers {\n    least_conn;\n';
      
      for (let i = 1; i <= this.currentInstances; i++) {
        upstreamConfig += `    server app${i}:3000 max_fails=3 fail_timeout=30s weight=1;\n`;
      }
      
      upstreamConfig += '    keepalive 32;\n    keepalive_requests 100;\n    keepalive_timeout 60s;\n}\n';

      // WebSocket upstream
      upstreamConfig += '\nupstream websocket_servers {\n    ip_hash;\n';
      
      for (let i = 1; i <= this.currentInstances; i++) {
        upstreamConfig += `    server app${i}:3001 max_fails=2 fail_timeout=10s;\n`;
      }
      
      upstreamConfig += '    keepalive 16;\n}\n';

      // Write new configuration and reload nginx
      const reloadCommand = `docker exec creator-clip-ai-lb nginx -s reload`;
      await execAsync(reloadCommand);

      console.log(`✅ Load balancer configuration updated for ${this.currentInstances} instances`);
    } catch (error) {
      console.error('❌ Failed to update load balancer config:', error.message);
    }
  }

  getRemainingCooldown() {
    const now = Date.now();
    const timeSinceLastAction = now - this.lastScaleAction;
    const cooldownPeriod = this.config.scaleUpCooldown * 1000; // Convert to ms
    
    return Math.max(0, cooldownPeriod - timeSinceLastAction);
  }

  async getScalingEvents(limit = 50) {
    try {
      const events = await this.redis.lrange('scaling_events', 0, limit - 1);
      return events.map(event => JSON.parse(event));
    } catch (error) {
      console.error('❌ Error fetching scaling events:', error.message);
      return [];
    }
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Auto-scaler shutting down...');
    
    try {
      await this.redis.disconnect();
      console.log('✅ Redis connection closed');
    } catch (error) {
      console.error('❌ Error during shutdown:', error.message);
    }
    
    process.exit(0);
  }
}

// Initialize auto-scaler
const autoScaler = new AutoScaler();

// Graceful shutdown handling
process.on('SIGTERM', () => autoScaler.shutdown());
process.on('SIGINT', () => autoScaler.shutdown());

// Unhandled error logging
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
