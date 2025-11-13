#!/bin/sh
set -e

echo "🚀 Starting Mirador UI unified container..."

# Start mock API in background
echo "📡 Starting mock API server..."
cd /app
NODE_ENV=development MOCK_PORT=3001 node mock/server.js &
API_PID=$!

# Wait for API to start
echo "⏱️  Waiting for API to initialize..."
sleep 3

# Start simple HTTP server for frontend in background
echo "🌐 Starting frontend HTTP server..."
cd /app/dist
npx serve -s -l 3000 &
FRONTEND_PID=$!

# Function to handle shutdown gracefully
shutdown() {
    echo "🛑 Shutting down services..."
    kill $API_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGTERM SIGINT

echo "✅ All services started successfully!"
echo "🌐 Frontend available at http://localhost:3000"
echo "📡 API available at http://localhost:3000/api"

# Wait for frontend server (main process)
wait $FRONTEND_PID