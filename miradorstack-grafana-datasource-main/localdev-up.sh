#!/bin/bash

# Local Development Setup Script for MiradorStack Grafana Datasource Plugin
# This script builds the plugin, pulls Grafana Docker image, and runs it with the plugin loaded

set -e  # Exit on any error

echo "🚀 Starting MiradorStack Grafana Datasource Plugin Local Development Setup"
echo "========================================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GRAFANA_VERSION="12.2.0"
PLUGIN_ID="platformbuilds-miradorstack-datasource"
CONTAINER_NAME="platformbuilds-miradorstack-datasource"
GRAFANA_PORT="3000"
MIRADOR_PORT="8081"

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

# Check if we're in the right directory
if [ ! -f "datasource/package.json" ] || [ ! -d "datasource" ]; then
    print_error "Please run this script from the root directory of the miradorstack-grafana-datasource project"
    exit 1
fi

print_status "Step 1: Cleaning up old artifacts..."
# Clean up any existing plugin-temp directory
if [ -d "plugin-temp" ]; then
    print_status "Removing existing plugin-temp directory..."
    rm -rf plugin-temp
fi

# Clean up any existing containers
print_status "Stopping any existing Grafana containers..."
cd datasource
docker-compose down 2>/dev/null || true
cd ..

print_status "Building the datasource plugin..."
cd datasource

# Force clean install and build
print_status "Cleaning and installing dependencies..."
rm -rf node_modules package-lock.json
npm install

# Clean previous build artifacts
print_status "Cleaning previous build artifacts..."
rm -rf dist

# Build the plugin
print_status "Building plugin..."
npm run build

if [ $? -eq 0 ]; then
    print_success "Plugin built successfully"
    # Verify build artifacts exist
    if [ -d "dist" ] && [ -f "dist/plugin.json" ]; then
        print_success "Build artifacts verified"
    else
        print_error "Build artifacts not found"
        exit 1
    fi
else
    print_error "Plugin build failed"
    exit 1
fi

cd ..

print_status "Step 2: Preparing plugin files..."
# Create a clean temporary directory for the plugin
PLUGIN_DIR="$(pwd)/plugin-temp"
rm -rf ${PLUGIN_DIR}
mkdir -p ${PLUGIN_DIR}

# Copy the built plugin to the temp directory
cp -r datasource/dist/* ${PLUGIN_DIR}/
cp datasource/src/plugin.json ${PLUGIN_DIR}/

print_status "Plugin files prepared in: ${PLUGIN_DIR}"

print_status "Step 3: Pulling Grafana Docker image..."
docker pull grafana/grafana:${GRAFANA_VERSION}

if [ $? -eq 0 ]; then
    print_success "Grafana ${GRAFANA_VERSION} image pulled successfully"
else
    print_error "Failed to pull Grafana image"
    exit 1
fi

print_status "Step 4: Starting Grafana with plugin loaded..."

# Change to datasource directory for docker-compose
cd datasource

# Start Grafana using docker-compose
docker-compose up -d grafana

if [ $? -eq 0 ]; then
    print_success "Grafana container started successfully"
else
    print_error "Failed to start Grafana container"
    cd ..
    exit 1
fi

# Go back to root directory
cd ..

print_status "Step 5: Waiting for Grafana to initialize..."
sleep 10

# Check if Grafana is running
if docker ps | grep -q ${CONTAINER_NAME}; then
    print_success "Grafana container is running"
else
    print_error "Grafana container failed to start"
    print_status "Checking container logs..."
    docker logs ${CONTAINER_NAME}
    exit 1
fi

print_status "Step 6: Checking plugin installation..."
sleep 5

# Check plugin installation
PLUGIN_CHECK=$(docker exec ${CONTAINER_NAME} ls -la /var/lib/grafana/plugins/ | grep ${PLUGIN_ID} || true)

if [ -n "${PLUGIN_CHECK}" ]; then
    print_success "Plugin files are present in container"
else
    print_warning "Plugin files not found in expected location (this is normal with docker-compose mounting)"
fi

print_status "Disabling LiveReload in Grafana..."
# Disable LiveReload script in Grafana's index.html
docker exec ${CONTAINER_NAME} sed -i 's|<script src="http://localhost:35729/livereload.js"></script>|<!-- LiveReload disabled -->|' /usr/share/grafana/public/views/index.html 2>/dev/null || true

print_status "Step 7: Checking Grafana logs for plugin loading..."
sleep 5

# Check if plugin loaded successfully
PLUGIN_LOADED=$(docker logs ${CONTAINER_NAME} 2>&1 | grep -i "plugin.*${PLUGIN_ID}.*loaded" || true)

if [ -n "${PLUGIN_LOADED}" ]; then
    print_success "Plugin loaded successfully in Grafana"
else
    print_warning "Plugin loading status unclear, checking further..."
    # Check for any plugin-related logs
    docker logs ${CONTAINER_NAME} 2>&1 | grep -i plugin | tail -10
fi

print_success "🎉 Local development environment is ready!"
echo ""
echo "========================================================================="
echo "📊 Access Information:"
echo "  • Grafana URL: http://localhost:${GRAFANA_PORT}"
echo "  • Username: admin"
echo "  • Password: admin"
echo "  • Mirador Core (if running): http://localhost:${MIRADOR_PORT}"
echo ""
echo "🔧 Container Management:"
echo "  • View logs: docker-compose -f datasource/docker-compose.yaml logs -f grafana"
echo "  • Stop container: docker-compose -f datasource/docker-compose.yaml down"
echo "  • Start container: docker-compose -f datasource/docker-compose.yaml up -d grafana"
echo "  • Remove container: docker-compose -f datasource/docker-compose.yaml down --volumes"
echo ""
echo "📝 Next Steps:"
echo "  1. Open http://localhost:${GRAFANA_PORT} in your browser"
echo "  2. Login with admin/admin"
echo "  3. Go to Configuration → Data Sources"
echo "  4. Add 'MiradorStack Datasource' data source"
echo "  5. Configure with URL: http://localhost:${MIRADOR_PORT}/api/v1"
echo ""
echo "💡 Tips:"
echo "  • Using host networking mode for direct access to host services"
echo "  • If mirador-core is running on host, use localhost"
echo "  • Plugin rebuilds require restarting the container"
echo "  • Check docker-compose logs for any plugin loading issues"
echo "========================================================================="

# Optional: Open browser (macOS)
if command -v open &> /dev/null; then
    print_status "Opening Grafana in browser..."
    sleep 2
    open "http://localhost:${GRAFANA_PORT}"
fi