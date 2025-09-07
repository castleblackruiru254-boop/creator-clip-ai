#!/bin/bash

# ViralClips Production Deployment Script
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
VERSION="${2:-$(git rev-parse --short HEAD)}"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking deployment prerequisites..."
    
    # Check required tools
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is required but not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is required but not installed"
        exit 1
    fi

    # Check environment file
    ENV_FILE="$PROJECT_DIR/environments/.env.$ENVIRONMENT"
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log_info "Loading $ENVIRONMENT environment configuration..."
    
    ENV_FILE="$PROJECT_DIR/environments/.env.$ENVIRONMENT"
    if [[ -f "$ENV_FILE" ]]; then
        export $(grep -v '^#' "$ENV_FILE" | xargs)
        log_success "Environment loaded: $ENVIRONMENT"
    else
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi
}

# Pre-deployment checks
pre_deployment_checks() {
    log_info "Running pre-deployment checks..."
    
    cd "$PROJECT_DIR"
    
    # Install dependencies
    log_info "Installing dependencies..."
    npm ci
    
    # Type checking
    log_info "Running type checking..."
    npm run type-check
    
    # Linting
    log_info "Running linter..."
    npm run lint
    
    # Unit tests
    log_info "Running unit tests..."
    npm run test:run
    
    # Build application
    log_info "Building application..."
    npm run build
    
    # Pipeline tests
    log_info "Running pipeline tests..."
    npm run test:pipeline
    
    log_success "Pre-deployment checks passed"
}

# Database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    if command -v supabase &> /dev/null; then
        # Apply database migrations
        supabase db push --linked --include-seed
        
        # Deploy edge functions
        supabase functions deploy --no-verify-jwt
        
        log_success "Database migrations completed"
    else
        log_warning "Supabase CLI not found, skipping migrations"
    fi
}

# Deploy application
deploy_application() {
    log_info "Deploying application to $ENVIRONMENT..."
    
    cd "$PROJECT_DIR"
    
    case "$ENVIRONMENT" in
        "staging")
            deploy_staging
            ;;
        "production")
            deploy_production
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
}

deploy_staging() {
    log_info "Deploying to staging environment..."
    
    # Build and start containers
    docker-compose -f docker-compose.yml build
    docker-compose -f docker-compose.yml up -d
    
    # Wait for application to start
    log_info "Waiting for application to start..."
    sleep 30
    
    # Health check
    if curl -f http://localhost:3000/health; then
        log_success "Staging deployment successful"
    else
        log_error "Staging health check failed"
        exit 1
    fi
}

deploy_production() {
    log_info "Deploying to production environment..."
    
    # Create production backup before deployment
    log_info "Creating pre-deployment backup..."
    npm run backup
    
    # Build and deploy with production profile
    docker-compose -f docker-compose.yml --profile production build
    docker-compose -f docker-compose.yml --profile production up -d
    
    # Wait for application to start
    log_info "Waiting for application to start..."
    sleep 60
    
    # Health check
    if curl -f https://viralclips.app/health; then
        log_success "Production deployment successful"
    else
        log_error "Production health check failed"
        log_error "Consider rolling back deployment"
        exit 1
    fi
}

# Post-deployment verification
post_deployment_verification() {
    log_info "Running post-deployment verification..."
    
    # Health checks
    log_info "Checking system health..."
    if curl -f "http://localhost:3000/api/health?detailed=true"; then
        log_success "Detailed health check passed"
    else
        log_warning "Detailed health check failed"
    fi
    
    # Performance check
    log_info "Running performance verification..."
    if command -v lighthouse &> /dev/null; then
        lighthouse --chrome-flags="--headless" http://localhost:3000 --output=json --output-path="./lighthouse-report.json"
        log_info "Lighthouse report generated: lighthouse-report.json"
    fi
    
    # Integration tests (if available)
    if [[ -f "$PROJECT_DIR/tests/integration.test.js" ]]; then
        log_info "Running integration tests..."
        npm run test:integration
    fi
    
    log_success "Post-deployment verification completed"
}

# Rollback function
rollback_deployment() {
    local BACKUP_ID="$1"
    log_warning "Rolling back deployment..."
    
    if [[ -z "$BACKUP_ID" ]]; then
        log_error "Backup ID required for rollback"
        exit 1
    fi
    
    # Stop current deployment
    docker-compose down
    
    # Restore from backup
    npm run backup:restore "$BACKUP_ID"
    
    # Restart with previous version
    docker-compose up -d
    
    log_success "Rollback completed"
}

# Monitoring setup
setup_monitoring() {
    log_info "Setting up monitoring stack..."
    
    # Start monitoring services
    docker-compose up -d prometheus grafana loki promtail
    
    # Wait for services to start
    sleep 30
    
    # Configure Grafana dashboards
    if curl -f http://localhost:3001/api/health; then
        log_success "Monitoring stack deployed"
        log_info "Grafana available at: http://localhost:3001"
        log_info "Prometheus available at: http://localhost:9090"
    else
        log_warning "Monitoring stack may not be fully ready"
    fi
}

# Main deployment process
main() {
    log_info "Starting ViralClips deployment process..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: $VERSION"
    log_info "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    
    # Deployment steps
    check_prerequisites
    load_environment
    pre_deployment_checks
    run_migrations
    deploy_application
    setup_monitoring
    post_deployment_verification
    
    log_success "🚀 Deployment completed successfully!"
    log_info "Application URL: ${ENVIRONMENT == 'production' && 'https://viralclips.app' || 'http://localhost:3000'}"
    log_info "Monitoring: http://localhost:3001 (Grafana)"
    log_info "Metrics: http://localhost:9090 (Prometheus)"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        if [[ -z "${2:-}" ]]; then
            log_error "Usage: $0 rollback <backup_id>"
            exit 1
        fi
        rollback_deployment "$2"
        ;;
    "health")
        log_info "Checking application health..."
        curl -f http://localhost:3000/health && log_success "Application is healthy"
        ;;
    "logs")
        log_info "Showing application logs..."
        docker-compose logs -f app
        ;;
    "backup")
        log_info "Creating backup..."
        npm run backup
        ;;
    "help"|"--help"|"-h")
        echo "ViralClips Deployment Script"
        echo
        echo "Usage: $0 [command] [environment] [version]"
        echo
        echo "Commands:"
        echo "  deploy [env] [version]  Deploy application (default)"
        echo "  rollback <backup_id>    Rollback to previous backup"
        echo "  health                  Check application health"
        echo "  logs                    Show application logs"
        echo "  backup                  Create system backup"
        echo "  help                    Show this help message"
        echo
        echo "Environments:"
        echo "  staging                 Deploy to staging environment"
        echo "  production              Deploy to production environment"
        echo
        echo "Examples:"
        echo "  $0 deploy staging       Deploy to staging"
        echo "  $0 deploy production    Deploy to production"
        echo "  $0 rollback full-123    Rollback to backup"
        ;;
    *)
        log_error "Unknown command: $1"
        log_info "Use '$0 help' for usage information"
        exit 1
        ;;
esac
