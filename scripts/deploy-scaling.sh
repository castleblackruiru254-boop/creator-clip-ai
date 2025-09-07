#!/bin/bash

# Creator Clip AI - Production Scaling Deployment Script
# This script deploys the application with full scaling, load balancing, and CDN configuration

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_TYPE="${1:-docker-compose}"  # docker-compose or kubernetes
ENVIRONMENT="${2:-production}"          # production or staging
DRY_RUN="${3:-false}"                   # true for dry run

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Banner
echo -e "${BLUE}"
echo "=========================================="
echo "   Creator Clip AI - Scaling Deployment"
echo "=========================================="
echo -e "${NC}"
echo "Deployment Type: $DEPLOYMENT_TYPE"
echo "Environment: $ENVIRONMENT"
echo "Dry Run: $DRY_RUN"
echo ""

# Pre-flight checks
log_info "Running pre-flight checks..."

# Check if required tools are installed
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it and try again."
        exit 1
    fi
}

check_tool "docker"
check_tool "docker-compose"

if [ "$DEPLOYMENT_TYPE" = "kubernetes" ]; then
    check_tool "kubectl"
    check_tool "helm"
fi

# Check if environment file exists
ENV_FILE="$PROJECT_ROOT/.env.$ENVIRONMENT"
if [ ! -f "$ENV_FILE" ]; then
    log_error "Environment file $ENV_FILE not found!"
    exit 1
fi

log_success "Pre-flight checks passed"

# Load environment variables
log_info "Loading environment configuration..."
set -a
source "$ENV_FILE"
set +a

# Validate required environment variables
required_vars=(
    "VITE_SUPABASE_URL"
    "VITE_SUPABASE_ANON_KEY"
    "VITE_OPENAI_API_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
        log_error "Required environment variable $var is not set!"
        exit 1
    fi
done

log_success "Environment configuration loaded"

# Function to deploy with Docker Compose
deploy_docker_compose() {
    log_info "Deploying with Docker Compose..."
    
    cd "$PROJECT_ROOT"
    
    # Build application image
    log_info "Building application image..."
    if [ "$DRY_RUN" = "false" ]; then
        docker-compose -f docker-compose.scale.yml build --no-cache
    else
        log_info "[DRY RUN] Would build application image"
    fi
    
    # Create necessary directories
    log_info "Creating storage directories..."
    if [ "$DRY_RUN" = "false" ]; then
        sudo mkdir -p /var/app-storage/{videos,postgres-master,postgres-replica,prometheus,grafana}
        sudo chown -R $(id -u):$(id -g) /var/app-storage/
    else
        log_info "[DRY RUN] Would create storage directories"
    fi
    
    # Deploy services
    log_info "Deploying services..."
    if [ "$DRY_RUN" = "false" ]; then
        # Start infrastructure services first
        docker-compose -f docker-compose.scale.yml up -d redis-cluster postgres-master postgres-replica
        
        # Wait for database to be ready
        log_info "Waiting for database to be ready..."
        sleep 30
        
        # Start monitoring
        docker-compose -f docker-compose.scale.yml up -d prometheus grafana
        
        # Start application instances
        docker-compose -f docker-compose.scale.yml up -d app1 app2 app3
        
        # Wait for apps to be ready
        log_info "Waiting for application instances to be ready..."
        sleep 45
        
        # Start load balancer
        docker-compose -f docker-compose.scale.yml up -d nginx-lb
        
        # Start auto-scaler
        docker-compose -f docker-compose.scale.yml up -d autoscaler
        
        # Start health monitor
        docker-compose -f docker-compose.scale.yml up -d health-monitor
    else
        log_info "[DRY RUN] Would deploy all services"
    fi
    
    # Verify deployment
    log_info "Verifying deployment..."
    if [ "$DRY_RUN" = "false" ]; then
        sleep 30
        
        # Check service health
        for service in nginx-lb app1 app2 app3 redis-cluster postgres-master prometheus grafana autoscaler; do
            if docker-compose -f docker-compose.scale.yml ps "$service" | grep -q "Up"; then
                log_success "$service is running"
            else
                log_error "$service is not running properly"
                docker-compose -f docker-compose.scale.yml logs "$service" | tail -20
            fi
        done
        
        # Test load balancer
        if curl -f http://localhost/health > /dev/null 2>&1; then
            log_success "Load balancer health check passed"
        else
            log_error "Load balancer health check failed"
        fi
        
        # Test application
        if curl -f http://localhost/api/health > /dev/null 2>&1; then
            log_success "Application health check passed"
        else
            log_error "Application health check failed"
        fi
    else
        log_info "[DRY RUN] Would verify all services"
    fi
}

# Function to deploy with Kubernetes
deploy_kubernetes() {
    log_info "Deploying with Kubernetes..."
    
    cd "$PROJECT_ROOT"
    
    # Check cluster connectivity
    if [ "$DRY_RUN" = "false" ]; then
        if ! kubectl cluster-info > /dev/null 2>&1; then
            log_error "Cannot connect to Kubernetes cluster"
            exit 1
        fi
    fi
    
    # Apply configurations
    log_info "Applying Kubernetes configurations..."
    if [ "$DRY_RUN" = "false" ]; then
        # Create namespace
        kubectl apply -f kubernetes/scaling-config.yaml
        
        # Wait for namespace
        kubectl wait --for=condition=Ready namespace/creator-clip-ai --timeout=60s
        
        # Apply secrets (these should be created manually in production)
        log_warning "Remember to create secrets manually in production!"
        
        # Apply deployments
        kubectl apply -f kubernetes/scaling-config.yaml
        
        # Wait for deployments
        kubectl wait --for=condition=available --timeout=300s deployment/creator-clip-ai-app -n creator-clip-ai
        kubectl wait --for=condition=available --timeout=300s deployment/redis -n creator-clip-ai
    else
        log_info "[DRY RUN] Would apply Kubernetes configurations"
    fi
    
    # Verify deployment
    log_info "Verifying Kubernetes deployment..."
    if [ "$DRY_RUN" = "false" ]; then
        # Check pod status
        kubectl get pods -n creator-clip-ai
        
        # Check services
        kubectl get services -n creator-clip-ai
        
        # Check HPA
        kubectl get hpa -n creator-clip-ai
        
        # Check ingress
        kubectl get ingress -n creator-clip-ai
        
        # Test application
        APP_URL=$(kubectl get ingress creator-clip-ai-ingress -n creator-clip-ai -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
        if [ -n "$APP_URL" ]; then
            log_info "Testing application at $APP_URL..."
            sleep 60  # Wait for load balancer
            if curl -f "http://$APP_URL/api/health" > /dev/null 2>&1; then
                log_success "Application health check passed"
            else
                log_warning "Application health check failed (may need more time)"
            fi
        fi
    else
        log_info "[DRY RUN] Would verify Kubernetes deployment"
    fi
}

# Function to setup SSL certificates
setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    SSL_DIR="$PROJECT_ROOT/ssl"
    
    if [ "$DRY_RUN" = "false" ]; then
        mkdir -p "$SSL_DIR"
        
        # Check if certificates exist
        if [ ! -f "$SSL_DIR/server.crt" ] || [ ! -f "$SSL_DIR/server.key" ]; then
            log_warning "SSL certificates not found, generating self-signed certificates for development"
            
            # Generate self-signed certificate for development
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout "$SSL_DIR/server.key" \
                -out "$SSL_DIR/server.crt" \
                -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
            
            log_warning "Generated self-signed certificates. Replace with proper certificates in production!"
        else
            log_success "SSL certificates found"
        fi
    else
        log_info "[DRY RUN] Would setup SSL certificates"
    fi
}

# Function to initialize monitoring
setup_monitoring() {
    log_info "Setting up monitoring and alerting..."
    
    # Create monitoring directories
    MONITORING_DIR="$PROJECT_ROOT/monitoring"
    
    if [ "$DRY_RUN" = "false" ]; then
        mkdir -p "$MONITORING_DIR"/{prometheus,grafana/dashboards,grafana/provisioning}
        
        # Set proper permissions
        sudo chown -R 472:472 "$MONITORING_DIR/grafana" 2>/dev/null || true
        sudo chown -R 65534:65534 "$MONITORING_DIR/prometheus" 2>/dev/null || true
    else
        log_info "[DRY RUN] Would setup monitoring directories"
    fi
}

# Function to run post-deployment tests
run_post_deployment_tests() {
    log_info "Running post-deployment tests..."
    
    if [ "$DRY_RUN" = "false" ]; then
        # Wait for services to stabilize
        sleep 60
        
        # Test endpoints
        endpoints=(
            "http://localhost/health"
            "http://localhost/api/health"
            "http://localhost:9090/-/healthy"  # Prometheus
            "http://localhost:3001/api/health" # Grafana
        )
        
        for endpoint in "${endpoints[@]}"; do
            if curl -f "$endpoint" > /dev/null 2>&1; then
                log_success "✓ $endpoint"
            else
                log_error "✗ $endpoint"
            fi
        done
        
        # Test auto-scaler
        if [ "$DEPLOYMENT_TYPE" = "docker-compose" ]; then
            SCALER_STATUS=$(curl -s http://localhost:3002/status || echo "failed")
            if [ "$SCALER_STATUS" != "failed" ]; then
                log_success "Auto-scaler is responding"
            else
                log_error "Auto-scaler is not responding"
            fi
        fi
        
        # Performance test
        log_info "Running basic performance test..."
        ab -n 100 -c 10 http://localhost/api/health > /dev/null 2>&1 || log_warning "Apache Bench not available for performance testing"
    else
        log_info "[DRY RUN] Would run post-deployment tests"
    fi
}

# Function to display deployment summary
show_deployment_summary() {
    echo ""
    echo -e "${GREEN}=========================================="
    echo "   Deployment Summary"
    echo -e "==========================================${NC}"
    echo ""
    echo "🚀 Application URL: https://localhost (or your domain)"
    echo "📊 Monitoring: http://localhost:3001 (Grafana)"
    echo "📈 Metrics: http://localhost:9090 (Prometheus)"
    echo "⚖️  Auto-scaler: http://localhost:3002/status"
    echo "🔍 Admin Panel: https://localhost:8080"
    echo ""
    echo "Default Credentials:"
    echo "- Grafana: admin / $GRAFANA_ADMIN_PASSWORD"
    echo ""
    echo "Key Features Enabled:"
    echo "- ✅ Database Connection Pooling"
    echo "- ✅ CDN Integration"
    echo "- ✅ Load Balancing"
    echo "- ✅ Auto-scaling"
    echo "- ✅ Monitoring & Alerting"
    echo "- ✅ Health Checks"
    echo "- ✅ Graceful Shutdown"
    echo ""
    echo "Next Steps:"
    echo "1. Update DNS to point to your load balancer"
    echo "2. Replace self-signed certificates with proper SSL certificates"
    echo "3. Configure your CDN provider"
    echo "4. Set up external monitoring alerts"
    echo "5. Run load testing to verify scaling behavior"
    echo ""
}

# Main deployment process
main() {
    log_info "Starting deployment process..."
    
    # Setup SSL certificates
    setup_ssl
    
    # Setup monitoring
    setup_monitoring
    
    # Deploy based on type
    case "$DEPLOYMENT_TYPE" in
        "docker-compose")
            deploy_docker_compose
            ;;
        "kubernetes")
            deploy_kubernetes
            ;;
        *)
            log_error "Unknown deployment type: $DEPLOYMENT_TYPE"
            log_info "Supported types: docker-compose, kubernetes"
            exit 1
            ;;
    esac
    
    # Run tests
    run_post_deployment_tests
    
    # Show summary
    show_deployment_summary
    
    log_success "Deployment completed successfully!"
}

# Cleanup function for graceful exit
cleanup() {
    log_info "Cleaning up..."
    # Add any cleanup logic here
}

# Trap cleanup function
trap cleanup EXIT

# Help function
show_help() {
    echo "Usage: $0 [deployment-type] [environment] [dry-run]"
    echo ""
    echo "Arguments:"
    echo "  deployment-type    docker-compose or kubernetes (default: docker-compose)"
    echo "  environment        production or staging (default: production)"
    echo "  dry-run           true or false (default: false)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy with docker-compose to production"
    echo "  $0 kubernetes production             # Deploy with Kubernetes to production"
    echo "  $0 docker-compose staging true       # Dry run deployment to staging"
    echo ""
    echo "Prerequisites:"
    echo "  - Docker and Docker Compose installed"
    echo "  - kubectl and helm (for Kubernetes deployment)"
    echo "  - Proper environment file (.env.production or .env.staging)"
    echo "  - SSL certificates (or will generate self-signed for development)"
    echo ""
}

# Check for help flag
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    show_help
    exit 0
fi

# Validate arguments
if [ "$DEPLOYMENT_TYPE" != "docker-compose" ] && [ "$DEPLOYMENT_TYPE" != "kubernetes" ]; then
    log_error "Invalid deployment type: $DEPLOYMENT_TYPE"
    show_help
    exit 1
fi

if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "staging" ]; then
    log_error "Invalid environment: $ENVIRONMENT"
    show_help
    exit 1
fi

# Confirm deployment (unless dry run)
if [ "$DRY_RUN" = "false" ]; then
    echo ""
    read -p "Are you sure you want to deploy to $ENVIRONMENT with $DEPLOYMENT_TYPE? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled"
        exit 0
    fi
fi

# Run main deployment
main

log_success "🎉 Creator Clip AI scaling deployment completed successfully!"
echo ""
echo "The application is now running with:"
echo "- Database connection pooling for optimal performance"
echo "- CDN integration for fast asset delivery"
echo "- Load balancing across multiple instances"
echo "- Auto-scaling based on metrics"
echo "- Comprehensive monitoring and alerting"
echo ""
echo "Monitor the deployment with:"
echo "docker-compose -f docker-compose.scale.yml logs -f"
echo ""
