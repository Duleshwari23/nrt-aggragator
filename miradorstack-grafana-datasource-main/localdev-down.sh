#!/bin/bash

# Local Development Cleanup Script for MiradorStack Grafana Datasource Plugin
# This script stops and cleans up the development environment

set -e  # Exit on any error

echo "🧹 Cleaning up MiradorStack Grafana Datasource Plugin Local Development Environment"
echo "=================================================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="grafana-miradorstack-dev"
PLUGIN_DIR="$(pwd)/plugin-temp"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Stop and remove container
print_status "Stopping Grafana container..."
docker stop ${CONTAINER_NAME} 2>/dev/null || print_warning "Container was not running"

print_status "Removing Grafana container..."
docker rm ${CONTAINER_NAME} 2>/dev/null || print_warning "Container was already removed"

# Clean up temporary plugin directory
print_status "Cleaning up temporary plugin files..."
if [ -d "${PLUGIN_DIR}" ]; then
    rm -rf ${PLUGIN_DIR}
    print_success "Temporary plugin directory removed"
else
    print_warning "Temporary plugin directory not found"
fi

# Optional: Remove Grafana image (uncomment if needed)
# print_status "Removing Grafana Docker image..."
# docker rmi grafana/grafana:12.2.0 2>/dev/null || print_warning "Image removal failed or image not found"

print_success "🧹 Cleanup completed successfully!"
echo ""
echo "💡 The development environment has been stopped and cleaned up."
echo "   Run './localdev-up.sh' again to restart the development environment."