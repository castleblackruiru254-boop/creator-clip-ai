#!/bin/bash

# Creator Clip AI - Load Testing Script
# This script tests the application's scaling behavior under load

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_URL="${1:-http://localhost}"
TEST_DURATION="${2:-300}"  # 5 minutes default
CONCURRENT_USERS="${3:-50}"
RAMP_UP_TIME="${4:-60}"    # 1 minute ramp up

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
echo "   Creator Clip AI - Load Testing"
echo "=========================================="
echo -e "${NC}"
echo "Target URL: $TARGET_URL"
echo "Test Duration: ${TEST_DURATION}s"
echo "Concurrent Users: $CONCURRENT_USERS"
echo "Ramp Up Time: ${RAMP_UP_TIME}s"
echo ""

# Check if required tools are installed
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it and try again."
        return 1
    fi
    return 0
}

# Install load testing tools if needed
install_tools() {
    log_info "Checking for load testing tools..."
    
    if ! check_tool "ab"; then
        log_info "Installing Apache Bench..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y apache2-utils
        elif command -v yum &> /dev/null; then
            sudo yum install -y httpd-tools
        elif command -v brew &> /dev/null; then
            brew install httpd
        else
            log_error "Cannot install Apache Bench. Please install manually."
            exit 1
        fi
    fi
    
    if ! check_tool "curl"; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    log_success "Load testing tools are available"
}

# Pre-test health check
pre_test_health_check() {
    log_info "Running pre-test health checks..."
    
    # Check application health
    if ! curl -f "$TARGET_URL/health" > /dev/null 2>&1; then
        log_error "Application health check failed at $TARGET_URL/health"
        exit 1
    fi
    
    # Check API health
    if ! curl -f "$TARGET_URL/api/health" > /dev/null 2>&1; then
        log_error "API health check failed at $TARGET_URL/api/health"
        exit 1
    fi
    
    # Check auto-scaler if available
    if curl -f "$TARGET_URL:3002/health" > /dev/null 2>&1; then
        log_success "Auto-scaler is responding"
    else
        log_warning "Auto-scaler not responding (may not be deployed)"
    fi
    
    log_success "Pre-test health checks passed"
}

# Get initial metrics
get_initial_metrics() {
    log_info "Collecting initial metrics..."
    
    # Get current instance count from auto-scaler
    INITIAL_INSTANCES=$(curl -s "$TARGET_URL:3002/status" | jq -r '.currentInstances' 2>/dev/null || echo "unknown")
    
    # Get initial response time
    INITIAL_RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}" "$TARGET_URL/api/health")
    
    echo "Initial State:"
    echo "- Instances: $INITIAL_INSTANCES"
    echo "- Response Time: ${INITIAL_RESPONSE_TIME}s"
    echo ""
}

# Run load test scenarios
run_load_tests() {
    log_info "Starting load tests..."
    
    # Create results directory
    RESULTS_DIR="$PROJECT_ROOT/load-test-results-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$RESULTS_DIR"
    
    # Test 1: Baseline performance test
    log_info "Running baseline performance test..."
    ab -n 1000 -c 10 -g "$RESULTS_DIR/baseline.tsv" "$TARGET_URL/api/health" > "$RESULTS_DIR/baseline.txt" 2>&1
    
    # Test 2: Gradual load increase
    log_info "Running gradual load increase test..."
    for concurrent in 10 20 30 40 50; do
        log_info "Testing with $concurrent concurrent users..."
        ab -n 500 -c $concurrent -g "$RESULTS_DIR/gradual-$concurrent.tsv" "$TARGET_URL/api/health" > "$RESULTS_DIR/gradual-$concurrent.txt" 2>&1
        sleep 30  # Wait between tests
    done
    
    # Test 3: Sustained load test
    log_info "Running sustained load test for ${TEST_DURATION}s..."
    ab -t $TEST_DURATION -c $CONCURRENT_USERS -g "$RESULTS_DIR/sustained.tsv" "$TARGET_URL/api/health" > "$RESULTS_DIR/sustained.txt" 2>&1
    
    # Test 4: Spike test
    log_info "Running spike test..."
    ab -n 2000 -c 100 -g "$RESULTS_DIR/spike.tsv" "$TARGET_URL/api/health" > "$RESULTS_DIR/spike.txt" 2>&1
    
    # Test 5: API endpoint tests
    log_info "Testing different API endpoints..."
    
    # Test video processing endpoint
    if curl -f "$TARGET_URL/api/videos" > /dev/null 2>&1; then
        ab -n 200 -c 20 "$TARGET_URL/api/videos" > "$RESULTS_DIR/api-videos.txt" 2>&1
    fi
    
    # Test project endpoints
    if curl -f "$TARGET_URL/api/projects" > /dev/null 2>&1; then
        ab -n 200 -c 20 "$TARGET_URL/api/projects" > "$RESULTS_DIR/api-projects.txt" 2>&1
    fi
    
    log_success "Load tests completed. Results saved to $RESULTS_DIR"
}

# Monitor scaling behavior during tests
monitor_scaling() {
    log_info "Monitoring scaling behavior..."
    
    MONITORING_LOG="$RESULTS_DIR/scaling-monitor.log"
    
    # Monitor for the duration of the test + buffer time
    MONITOR_DURATION=$((TEST_DURATION + 120))
    
    (
        for ((i=0; i<MONITOR_DURATION; i+=10)); do
            echo "$(date '+%Y-%m-%d %H:%M:%S')" >> "$MONITORING_LOG"
            
            # Get auto-scaler status
            if SCALER_STATUS=$(curl -s "$TARGET_URL:3002/status" 2>/dev/null); then
                echo "Scaling Status: $SCALER_STATUS" >> "$MONITORING_LOG"
            fi
            
            # Get docker stats
            if command -v docker &> /dev/null; then
                docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" \
                    $(docker ps --filter "name=creator-clip-ai-app" --format "{{.Names}}") >> "$MONITORING_LOG" 2>/dev/null || true
            fi
            
            echo "---" >> "$MONITORING_LOG"
            sleep 10
        done
    ) &
    
    MONITOR_PID=$!
    
    # Return the monitor PID so we can stop it later
    echo $MONITOR_PID
}

# Analyze results
analyze_results() {
    log_info "Analyzing test results..."
    
    ANALYSIS_FILE="$RESULTS_DIR/analysis.txt"
    
    echo "Load Test Analysis - $(date)" > "$ANALYSIS_FILE"
    echo "========================================" >> "$ANALYSIS_FILE"
    echo "" >> "$ANALYSIS_FILE"
    
    # Analyze baseline test
    if [ -f "$RESULTS_DIR/baseline.txt" ]; then
        echo "Baseline Test Results:" >> "$ANALYSIS_FILE"
        grep -E "(Requests per second|Time per request|Transfer rate)" "$RESULTS_DIR/baseline.txt" >> "$ANALYSIS_FILE"
        echo "" >> "$ANALYSIS_FILE"
    fi
    
    # Analyze sustained load test
    if [ -f "$RESULTS_DIR/sustained.txt" ]; then
        echo "Sustained Load Test Results:" >> "$ANALYSIS_FILE"
        grep -E "(Requests per second|Time per request|Failed requests|Transfer rate)" "$RESULTS_DIR/sustained.txt" >> "$ANALYSIS_FILE"
        echo "" >> "$ANALYSIS_FILE"
    fi
    
    # Analyze spike test
    if [ -f "$RESULTS_DIR/spike.txt" ]; then
        echo "Spike Test Results:" >> "$ANALYSIS_FILE"
        grep -E "(Requests per second|Time per request|Failed requests)" "$RESULTS_DIR/spike.txt" >> "$ANALYSIS_FILE"
        echo "" >> "$ANALYSIS_FILE"
    fi
    
    # Extract scaling events from monitoring log
    if [ -f "$MONITORING_LOG" ]; then
        echo "Scaling Events:" >> "$ANALYSIS_FILE"
        grep -i "scale" "$MONITORING_LOG" >> "$ANALYSIS_FILE" 2>/dev/null || echo "No scaling events detected" >> "$ANALYSIS_FILE"
        echo "" >> "$ANALYSIS_FILE"
    fi
    
    # Calculate performance metrics
    echo "Performance Summary:" >> "$ANALYSIS_FILE"
    echo "===================" >> "$ANALYSIS_FILE"
    
    # Get final metrics
    FINAL_INSTANCES=$(curl -s "$TARGET_URL:3002/status" | jq -r '.currentInstances' 2>/dev/null || echo "unknown")
    FINAL_RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}" "$TARGET_URL/api/health")
    
    echo "Initial Instances: $INITIAL_INSTANCES" >> "$ANALYSIS_FILE"
    echo "Final Instances: $FINAL_INSTANCES" >> "$ANALYSIS_FILE"
    echo "Initial Response Time: ${INITIAL_RESPONSE_TIME}s" >> "$ANALYSIS_FILE"
    echo "Final Response Time: ${FINAL_RESPONSE_TIME}s" >> "$ANALYSIS_FILE"
    
    # Check if scaling occurred
    if [ "$INITIAL_INSTANCES" != "unknown" ] && [ "$FINAL_INSTANCES" != "unknown" ] && [ "$INITIAL_INSTANCES" != "$FINAL_INSTANCES" ]; then
        echo "✅ Auto-scaling triggered: $INITIAL_INSTANCES → $FINAL_INSTANCES instances" >> "$ANALYSIS_FILE"
    else
        echo "ℹ️  No scaling detected during test" >> "$ANALYSIS_FILE"
    fi
    
    log_success "Analysis completed. See $ANALYSIS_FILE for detailed results."
}

# Generate report
generate_report() {
    log_info "Generating test report..."
    
    REPORT_FILE="$RESULTS_DIR/load-test-report.md"
    
    cat > "$REPORT_FILE" << EOF
# Load Test Report

**Date:** $(date)
**Target:** $TARGET_URL
**Duration:** ${TEST_DURATION}s
**Concurrent Users:** $CONCURRENT_USERS

## Test Configuration
- Baseline Test: 1000 requests, 10 concurrent
- Gradual Load: 500 requests each at 10, 20, 30, 40, 50 concurrent users
- Sustained Load: ${TEST_DURATION}s duration, $CONCURRENT_USERS concurrent users
- Spike Test: 2000 requests, 100 concurrent users

## Results Summary

$(cat "$ANALYSIS_FILE")

## Files Generated
- Baseline results: \`baseline.txt\`
- Gradual load results: \`gradual-*.txt\`
- Sustained load results: \`sustained.txt\`
- Spike test results: \`spike.txt\`
- Scaling monitor log: \`scaling-monitor.log\`
- Analysis: \`analysis.txt\`

## Recommendations

### Performance
$(if [ -f "$RESULTS_DIR/sustained.txt" ]; then
    FAILED_REQUESTS=$(grep "Failed requests:" "$RESULTS_DIR/sustained.txt" | awk '{print $3}')
    if [ "$FAILED_REQUESTS" -gt 0 ]; then
        echo "⚠️ $FAILED_REQUESTS failed requests detected. Consider:"
        echo "   - Increasing instance limits"
        echo "   - Optimizing database queries"
        echo "   - Adding caching layers"
    else
        echo "✅ No failed requests during sustained load test"
    fi
fi)

### Scaling
$(if [ "$INITIAL_INSTANCES" != "$FINAL_INSTANCES" ]; then
    echo "✅ Auto-scaling is working correctly"
    echo "   - Started with $INITIAL_INSTANCES instances"
    echo "   - Scaled to $FINAL_INSTANCES instances under load"
else
    echo "ℹ️ No scaling occurred during test"
    echo "   - Consider lowering scaling thresholds if expecting higher load"
    echo "   - Verify auto-scaler configuration"
fi)

### Next Steps
1. Review individual test results for bottlenecks
2. Monitor application logs during high load
3. Verify database connection pool behavior
4. Test CDN cache hit rates
5. Run tests with real user traffic patterns

EOF

    log_success "Test report generated: $REPORT_FILE"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Kill monitoring process if it exists
    if [ -n "${MONITOR_PID:-}" ]; then
        kill $MONITOR_PID 2>/dev/null || true
    fi
    
    # Wait for any background processes
    wait 2>/dev/null || true
}

# Trap cleanup function
trap cleanup EXIT

# Help function
show_help() {
    echo "Usage: $0 [target-url] [duration] [concurrent-users] [ramp-up-time]"
    echo ""
    echo "Arguments:"
    echo "  target-url         Base URL to test (default: http://localhost)"
    echo "  duration          Test duration in seconds (default: 300)"
    echo "  concurrent-users   Number of concurrent users (default: 50)"
    echo "  ramp-up-time      Ramp up time in seconds (default: 60)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Test localhost with default settings"
    echo "  $0 https://app.com 600 100 120       # Test production with 100 users for 10 minutes"
    echo "  $0 http://localhost 60 10 10         # Quick test with 10 users for 1 minute"
    echo ""
    echo "Prerequisites:"
    echo "  - curl"
    echo "  - Apache Bench (ab) - will be installed if missing"
    echo "  - jq (optional, for JSON parsing)"
    echo ""
}

# Check for help flag
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    show_help
    exit 0
fi

# Main execution
main() {
    # Install required tools
    install_tools
    
    # Pre-test checks
    pre_test_health_check
    
    # Get initial state
    get_initial_metrics
    
    # Start monitoring
    MONITOR_PID=$(monitor_scaling)
    
    # Run load tests
    run_load_tests
    
    # Stop monitoring
    if [ -n "${MONITOR_PID:-}" ]; then
        kill $MONITOR_PID 2>/dev/null || true
    fi
    
    # Wait a bit for metrics to stabilize
    sleep 30
    
    # Analyze results
    analyze_results
    
    # Generate report
    generate_report
    
    log_success "Load testing completed successfully!"
    echo ""
    echo "Results available in: $RESULTS_DIR"
    echo "Report: $REPORT_FILE"
    echo ""
    echo "Key metrics:"
    echo "- Initial instances: $INITIAL_INSTANCES"
    echo "- Final instances: $(curl -s "$TARGET_URL:3002/status" | jq -r '.currentInstances' 2>/dev/null || echo "unknown")"
    echo "- Initial response time: ${INITIAL_RESPONSE_TIME}s"
    echo "- Final response time: $(curl -o /dev/null -s -w "%{time_total}" "$TARGET_URL/api/health")"
    echo ""
}

# Confirm test execution
echo ""
read -p "This will generate significant load on $TARGET_URL. Continue? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Load test cancelled"
    exit 0
fi

# Run main function
main

log_success "🎉 Load testing completed!"
