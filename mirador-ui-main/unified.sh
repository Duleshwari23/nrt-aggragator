#!/bin/bash

# Mirador UI - Unified Container Startup Script
# This script builds and runs the unified container with frontend + mock API

set -e

echo "🚀 Mirador UI - Unified Container Setup"
echo "======================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Function to show usage
show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  build     Build the unified container"
    echo "  up        Start the unified container"
    echo "  down      Stop the unified container"  
    echo "  logs      Show container logs"
    echo "  rebuild   Stop, rebuild, and start the container"
    echo "  status    Show container status"
    echo "  shell     Open shell in running container"
    echo "  clean     Stop and remove container + image"
    echo ""
    echo "Default: rebuild (stop, build, start)"
    exit 1
}

# Parse command line argument
COMMAND=${1:-rebuild}

case $COMMAND in
    "build")
        echo "📦 Building unified container..."
        docker build -f Dockerfile.unified -t mirador-ui:unified .
        echo "✅ Build complete"
        ;;
    "up")
        echo "🔄 Starting unified container..."
        docker-compose -f docker-compose.unified.yml up -d
        echo "✅ Container started"
        ;;
    "down")
        echo "🛑 Stopping unified container..."
        docker-compose -f docker-compose.unified.yml down
        echo "✅ Container stopped"
        ;;
    "logs")
        echo "📋 Showing container logs (Ctrl+C to exit)..."
        docker-compose -f docker-compose.unified.yml logs -f
        ;;
    "rebuild")
        echo "🔄 Rebuilding unified container..."
        echo "  1. Stopping existing container..."
        docker-compose -f docker-compose.unified.yml down 2>/dev/null || true
        echo "  2. Building new image..."
        docker build -f Dockerfile.unified -t mirador-ui:unified .
        echo "  3. Starting container..."
        docker-compose -f docker-compose.unified.yml up -d
        echo "✅ Rebuild complete"
        ;;
    "status")
        echo "📊 Container status:"
        docker-compose -f docker-compose.unified.yml ps
        echo ""
        echo "📊 Health check:"
        if curl -s http://localhost:3000/health.html > /dev/null; then
            echo "✅ Frontend: healthy (http://localhost:3000)"
        else
            echo "❌ Frontend: not responding"
        fi
        if curl -s http://localhost:3001/api/v1/kpi/defs > /dev/null; then
            echo "✅ Mock API: healthy (http://localhost:3001/api)"
        else
            echo "❌ Mock API: not responding"
        fi
        ;;
    "shell")
        echo "🐚 Opening shell in container..."
        docker exec -it mirador-unified /bin/sh
        ;;
    "clean")
        echo "🧹 Cleaning up unified container and image..."
        docker-compose -f docker-compose.unified.yml down 2>/dev/null || true
        docker rmi mirador-ui:unified 2>/dev/null || true
        echo "✅ Cleanup complete"
        ;;
    "help"|"-h"|"--help")
        show_usage
        ;;
    *)
        echo "❌ Unknown command: $COMMAND"
        show_usage
        ;;
esac

# Show final status for certain commands
if [[ "$COMMAND" == "up" || "$COMMAND" == "rebuild" ]]; then
    echo ""
    echo "🌐 Application URLs:"
    echo "   Frontend:  http://localhost:3000"
    echo "   Mock API:  http://localhost:3001/api"
    echo "   Health:    http://localhost:3000/health.html"
    echo ""
    echo "📋 Useful commands:"
    echo "   ./unified.sh logs    - Show live logs"
    echo "   ./unified.sh status  - Check container status"  
    echo "   ./unified.sh down    - Stop container"
    echo ""
    echo "🎉 Ready to go! Visit http://localhost:3000"
fi