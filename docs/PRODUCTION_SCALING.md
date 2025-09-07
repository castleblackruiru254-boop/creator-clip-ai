# Production Scaling Guide

## Overview

Creator Clip AI is now fully equipped with enterprise-grade scaling capabilities including:

- **Database Connection Pooling** - Optimized database connections with automatic management
- **CDN Integration** - Fast asset delivery with fallback mechanisms
- **Load Balancing** - Nginx-based load balancer with health checks
- **Auto-scaling** - Dynamic instance management based on metrics
- **Monitoring & Alerting** - Comprehensive observability stack

## Quick Start

### 1. Deploy with Docker Compose (Recommended for most use cases)

```bash
# Deploy with scaling enabled
./scripts/deploy-scaling.sh docker-compose production

# Monitor deployment
docker-compose -f docker-compose.scale.yml logs -f

# Check scaling status
curl http://localhost:3002/status
```

### 2. Deploy with Kubernetes (For enterprise environments)

```bash
# Deploy to Kubernetes
./scripts/deploy-scaling.sh kubernetes production

# Monitor deployment
kubectl get pods -n creator-clip-ai -w

# Check auto-scaling
kubectl get hpa -n creator-clip-ai
```

## Architecture Overview

```
                    ┌─────────────────┐
                    │   Load Balancer │
                    │     (Nginx)     │
                    └─────────┬───────┘
                              │
                ┌─────────────┼─────────────┐
                │             │             │
         ┌──────▼──────┐ ┌────▼─────┐ ┌────▼─────┐
         │    App 1    │ │  App 2   │ │  App 3   │
         │   (Node.js) │ │(Node.js) │ │(Node.js) │
         └──────┬──────┘ └────┬─────┘ └────┬─────┘
                │             │             │
                └─────────────┼─────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Database Pool   │
                    │    (Supabase)     │
                    └───────────────────┘
```

## Features

### Database Connection Pooling

- **Intelligent Pool Management**: Automatic connection creation and cleanup
- **Health Monitoring**: Real-time pool utilization and performance tracking
- **Graceful Degradation**: Fallback mechanisms for connection failures
- **Configurable Limits**: Min/max connections based on environment

```typescript
// Usage in components
import { usePooledSupabase } from '@/lib/database-pool';

const MyComponent = () => {
  const { executeQuery, getPoolStats } = usePooledSupabase();
  
  const loadData = async () => {
    const result = await executeQuery(client => 
      client.from('projects').select('*')
    );
  };
};
```

### CDN Integration

- **Automatic Fallback**: Falls back to local assets if CDN fails
- **Image Optimization**: Automatic WebP conversion and compression
- **Progressive Loading**: Smart asset preloading and lazy loading
- **Cache Management**: Intelligent cache invalidation and refresh

```typescript
// CDN-optimized image component
import { CDNImage } from '@/lib/cdn-manager';

<CDNImage
  src="/images/thumbnail.jpg"
  width={300}
  height={200}
  quality={85}
  format="webp"
  progressive={true}
/>
```

### Load Balancing

- **Health Checks**: Automatic instance health monitoring
- **Session Management**: Configurable session affinity
- **Rate Limiting**: Per-endpoint rate limiting with burst handling
- **SSL Termination**: Automatic HTTPS redirect and security headers

### Auto-scaling

- **Metric-based Scaling**: CPU, memory, request rate, and queue length
- **Configurable Thresholds**: Environment-specific scaling triggers
- **Graceful Operations**: Zero-downtime scaling with connection draining
- **Manual Override**: Emergency manual scaling controls

## Configuration

### Environment Variables

#### Database Connection Pooling
```bash
VITE_DB_MIN_CONNECTIONS=2          # Minimum pool connections
VITE_DB_MAX_CONNECTIONS=20         # Maximum pool connections
VITE_DB_POOL_SIZE=10              # Target pool size
VITE_DB_ACQUIRE_TIMEOUT=10000     # Connection acquisition timeout (ms)
VITE_DB_IDLE_TIMEOUT=300000       # Idle connection timeout (ms)
```

#### CDN Configuration
```bash
VITE_CDN_ENABLED=true             # Enable/disable CDN
VITE_CDN_BASE_URL=https://cdn.example.com  # CDN base URL
VITE_CDN_CACHE_TTL=86400          # Cache TTL in seconds
VITE_CDN_RETRY_ATTEMPTS=3         # Retry attempts for failed assets
VITE_CDN_PRELOAD_CRITICAL=true    # Preload critical assets
VITE_CDN_IMAGE_OPTIMIZATION=true  # Enable image optimization
```

#### Load Balancing
```bash
LOAD_BALANCER_ENABLED=true        # Enable load balancing
SESSION_AFFINITY=false            # Enable sticky sessions
MAX_CONCURRENT_REQUESTS=1000      # Max concurrent requests per instance
REQUEST_TIMEOUT=30000             # Request timeout (ms)
GRACEFUL_SHUTDOWN_TIMEOUT=30000   # Graceful shutdown timeout (ms)
```

#### Auto-scaling
```bash
AUTO_SCALING_ENABLED=true         # Enable auto-scaling
MIN_INSTANCES=3                   # Minimum instances
MAX_INSTANCES=20                  # Maximum instances
CPU_THRESHOLD=70                  # CPU threshold for scaling up (%)
MEMORY_THRESHOLD=80               # Memory threshold for scaling up (%)
REQUEST_RATE_THRESHOLD=100        # Request rate threshold (req/s)
SCALE_UP_COOLDOWN=60              # Cooldown after scaling up (s)
SCALE_DOWN_COOLDOWN=300           # Cooldown after scaling down (s)
```

## Deployment Options

### Docker Compose Deployment

Best for:
- Small to medium scale deployments
- Development and staging environments
- Simplified operations

```bash
# Deploy with 3 initial instances
docker-compose -f docker-compose.scale.yml up -d

# Scale manually
docker-compose -f docker-compose.scale.yml up -d --scale app=5

# Monitor logs
docker-compose -f docker-compose.scale.yml logs -f app
```

### Kubernetes Deployment

Best for:
- Enterprise environments
- High availability requirements
- Advanced scaling needs

```bash
# Deploy to Kubernetes
kubectl apply -f kubernetes/scaling-config.yaml

# Monitor scaling
kubectl get hpa -n creator-clip-ai -w

# Check pod status
kubectl get pods -n creator-clip-ai
```

## Monitoring and Alerting

### Health Check Endpoints

- `/health` - Load balancer health
- `/api/health` - Application health
- `/api/health/ready` - Readiness probe
- `/lb-health` - Backend health check
- `/metrics` - Prometheus metrics

### Monitoring Dashboard

Access the scaling dashboard at `/admin/scaling` to monitor:

- Real-time instance count
- CPU and memory utilization
- Database connection pool status
- CDN performance metrics
- Scaling events and triggers

### Key Metrics

#### Application Metrics
- **Response Time**: 95th percentile < 2 seconds
- **Error Rate**: < 5%
- **Request Rate**: Requests per second
- **Queue Length**: Pending video processing jobs

#### Database Metrics
- **Pool Utilization**: < 80% for healthy operation
- **Connection Wait Time**: < 100ms average
- **Query Performance**: Average query time
- **Error Rate**: Database connection failures

#### CDN Metrics
- **Cache Hit Rate**: Asset delivery success rate
- **Failed Assets**: Assets falling back to origin
- **Preload Success**: Critical asset preload status

## Scaling Behavior

### Scale Up Triggers

Auto-scaling will add instances when ANY of these conditions are met:

- CPU usage > 70%
- Memory usage > 80%
- Request rate > 100 req/s
- Processing queue > 50 items
- Response time > 2 seconds

### Scale Down Triggers

Auto-scaling will remove instances when ALL of these conditions are met:

- CPU usage < 35%
- Memory usage < 40%
- Request rate < 30 req/s
- Processing queue < 10 items
- Response time < 500ms

### Cooldown Periods

- **Scale Up Cooldown**: 60 seconds (prevents thrashing)
- **Scale Down Cooldown**: 300 seconds (prevents premature scaling down)

## Load Testing

Test your scaling configuration:

```bash
# Quick test (1 minute, 10 users)
./scripts/load-test.sh http://localhost 60 10

# Standard test (5 minutes, 50 users)
./scripts/load-test.sh http://localhost 300 50

# Stress test (10 minutes, 100 users)
./scripts/load-test.sh http://localhost 600 100
```

The load test will:
1. Run baseline performance tests
2. Gradually increase load
3. Test sustained high load
4. Run spike tests
5. Monitor scaling behavior
6. Generate detailed reports

## Performance Optimization

### Database Optimization

1. **Connection Pool Tuning**:
   ```bash
   # For high-traffic environments
   VITE_DB_MIN_CONNECTIONS=5
   VITE_DB_MAX_CONNECTIONS=50
   VITE_DB_POOL_SIZE=20
   ```

2. **Query Optimization**:
   - Use connection pooling for all database operations
   - Implement read replicas for read-heavy workloads
   - Monitor slow queries and add indexes

### CDN Optimization

1. **Asset Optimization**:
   - Enable WebP format for images
   - Use progressive JPEG for large images
   - Implement responsive images

2. **Cache Strategy**:
   ```bash
   # Aggressive caching for static assets
   VITE_CDN_CACHE_TTL=31536000  # 1 year
   
   # Short cache for dynamic content
   API_CACHE_TTL=300  # 5 minutes
   ```

### Load Balancer Optimization

1. **Connection Settings**:
   - Keep-alive connections
   - Connection pooling to backends
   - Appropriate timeout values

2. **Caching**:
   - Static asset caching
   - API response caching
   - Browser cache headers

## Troubleshooting

### Common Issues

#### Database Connection Pool Exhausted
```bash
# Symptoms
- High pool utilization (>95%)
- Waiting requests > 0
- Slow response times

# Solutions
1. Increase max connections
2. Optimize query performance
3. Scale up application instances
4. Add read replicas
```

#### CDN Assets Failing
```bash
# Symptoms
- High failed asset count
- Slow page load times
- Assets served from origin

# Solutions
1. Check CDN provider status
2. Verify CDN configuration
3. Clear CDN cache
4. Update asset manifest
```

#### Auto-scaling Not Triggering
```bash
# Symptoms
- High resource usage but no scaling
- Manual scaling works but auto doesn't

# Solutions
1. Check auto-scaler logs
2. Verify Prometheus metrics
3. Check scaling thresholds
4. Ensure cooldown periods have passed
```

### Debug Commands

```bash
# Check application logs
docker-compose -f docker-compose.scale.yml logs app1 app2 app3

# Check auto-scaler status
curl http://localhost:3002/status | jq

# Check database pool stats
curl http://localhost/api/admin/db-stats

# Check CDN performance
curl http://localhost/api/admin/cdn-stats

# Monitor resource usage
docker stats

# Check load balancer status
curl http://localhost:8080/nginx-status
```

## Security Considerations

### Production Security

1. **SSL/TLS**: Replace self-signed certificates with proper certificates
2. **Secrets Management**: Use proper secret management (not plain text env files)
3. **Network Security**: Implement proper firewall rules and network segmentation
4. **Access Control**: Restrict admin endpoints to authorized networks

### Environment Separation

1. **Staging Environment**: Test scaling behavior before production
2. **Database Isolation**: Separate databases for different environments
3. **Secret Rotation**: Regular rotation of API keys and passwords

## Maintenance

### Regular Tasks

1. **Monitor Resource Usage**: Check scaling metrics daily
2. **Review Scaling Events**: Analyze auto-scaling decisions
3. **Update Thresholds**: Adjust based on traffic patterns
4. **Performance Testing**: Monthly load testing
5. **Security Updates**: Keep dependencies updated

### Backup Considerations

- Database backups include connection pool configuration
- CDN cache invalidation procedures
- Load balancer configuration backup
- Scaling event logs retention

## Support

For issues with scaling configuration:

1. Check the monitoring dashboard at `/admin/scaling`
2. Review application logs for errors
3. Test with the load testing script
4. Consult the troubleshooting section above

The application is now production-ready with enterprise-grade scaling capabilities. All components work together to provide optimal performance under varying load conditions.
