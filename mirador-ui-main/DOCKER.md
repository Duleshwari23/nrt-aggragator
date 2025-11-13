# 🐳 Docker Guide for Mirador UI

This guide covers Docker deployment options for the Mirador UI iOS Widgets Dashboard.

## 📋 Prerequisites

- Docker 20.10+ and Docker Compose V2
- At least 2GB RAM available for containers
- Port 3000 (production) and/or 5173 (development) available

## 🚀 Quick Start

### Production Build
```bash
# Build and run production container
pnpm docker:build
pnpm docker:run

# Or use docker-compose
pnpm compose:up

# Access the app
open http://localhost:3000
```

### Development with Hot Reload
```bash
# Run development environment
pnpm compose:up:dev

# Access dev server with hot reload
open http://localhost:5173
```

## 🏗️ Docker Architecture

### Multi-Stage Production Build
```
├── Stage 1: Builder (node:18-alpine)
│   ├── Install pnpm + dependencies
│   ├── Build React app (pnpm build)
│   └── Generate optimized dist/
│
└── Stage 2: Runtime (nginx:alpine)
    ├── Copy built assets
    ├── Custom nginx config
    ├── Security headers
    ├── Gzip compression
    └── SPA routing support
```

### Image Sizes
- **Production image**: ~25MB (Alpine + Nginx + built assets)
- **Development image**: ~350MB (Node.js + dependencies + source)

## 📦 Available Scripts

### Docker Commands
```bash
# Production
pnpm docker:build         # Build production image
pnpm docker:run          # Run production container
pnpm docker:stop         # Stop production container
pnpm docker:clean        # Remove container + image
pnpm docker:logs         # View container logs
pnpm docker:shell        # Access container shell

# Development
pnpm docker:build:dev    # Build development image
pnpm docker:run:dev      # Run development container
pnpm docker:stop:dev     # Stop development container
pnpm docker:clean:dev    # Remove dev container + image

# Docker Compose
pnpm compose:up          # Start production stack
pnpm compose:up:dev      # Start development stack
pnpm compose:down        # Stop all containers
pnpm compose:logs        # View all logs
pnpm compose:build       # Build all images
pnpm compose:rebuild     # Full rebuild and restart
```

## 🔧 Configuration Options

### Environment Variables
```bash
# Production
NODE_ENV=production

# Development  
NODE_ENV=development
VITE_API_URL=http://localhost:3001
```

### Docker Compose Services

#### `mirador-ui` (Production)
- **Port**: 3000:80
- **Image**: mirador-ui:latest
- **Health Check**: /health endpoint
- **Restart**: unless-stopped

#### `mirador-ui-dev` (Development)
- **Port**: 5173:5173
- **Volume**: Live code mounting
- **Hot Reload**: Enabled
- **Profile**: dev

#### `mock-api` (Development)
- **Port**: 3001:3000
- **Mock**: KPI data endpoints
- **Profile**: dev

### Nginx Configuration
Located in `docker/nginx.conf`:
- SPA routing support (React Router)
- Asset caching (1 year for static files)
- Security headers (XSS, CSRF, etc.)
- Gzip compression
- API proxy placeholder

## 🛡️ Security Features

### Container Security
- **Non-root user**: All processes run as `mirador` user (UID 1001)
- **Minimal base**: Alpine Linux for reduced attack surface
- **No shell access**: Production containers have no unnecessary tools
- **Read-only filesystem**: Nginx serves static files only

### HTTP Security Headers
```nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff  
X-XSS-Protection: 1; mode=block
Referrer-Policy: no-referrer-when-downgrade
Content-Security-Policy: default-src 'self'...
```

## 📊 Health Checks

### Application Health
```bash
# Check container health
docker ps

# Check application endpoint
curl http://localhost:3000/health
# Expected: "healthy"
```

### Monitoring
```bash
# Container stats
docker stats mirador-ui-app

# Resource usage
docker exec mirador-ui-app ps aux

# Nginx access logs
docker logs mirador-ui-app
```

## 🔄 Development Workflow

### Local Development with Docker
```bash
# Start development stack
pnpm compose:up:dev

# View logs
pnpm compose:logs

# Make code changes (auto-reloads)
# Changes in src/ are immediately reflected

# Stop when done
pnpm compose:down
```

### Building for Production
```bash
# Build optimized image
pnpm docker:build

# Test locally
pnpm docker:run
open http://localhost:3000

# Check widget functionality
# - Try long-press to enter edit mode
# - Test drag and drop
# - Verify responsive layout
```

## 🚢 Deployment Options

### Single Container
```bash
# Direct Docker run
docker run -d \
  --name mirador-ui \
  -p 80:80 \
  --restart unless-stopped \
  mirador-ui:latest
```

### Docker Compose Stack
```yaml
# docker-compose.yml includes:
# - Production app
# - Development app (with profile)
# - Mock API (with profile)  
# - Nginx proxy (with profile)
```

### Container Registry
```bash
# Tag for registry
docker tag mirador-ui:latest your-registry/mirador-ui:v1.0.0

# Push to registry
docker push your-registry/mirador-ui:v1.0.0

# Pull and run on server
docker pull your-registry/mirador-ui:v1.0.0
docker run -d -p 80:80 your-registry/mirador-ui:v1.0.0
```

## 🎯 Production Checklist

- [ ] Build passes without errors
- [ ] Health check responds at `/health`
- [ ] All routes work (React Router)
- [ ] Widgets dashboard loads at `/widgets`
- [ ] Edit mode and drag/drop functional
- [ ] Mobile responsive layout
- [ ] Static assets cached properly
- [ ] Security headers present
- [ ] Container runs as non-root user
- [ ] Logs are accessible

## 🐛 Troubleshooting

### Common Issues

#### Container Won't Start
```bash
# Check logs
docker logs mirador-ui-app

# Common causes:
# - Port 3000 already in use
# - Insufficient permissions
# - Build errors
```

#### App Not Loading
```bash
# Verify nginx is serving files
docker exec mirador-ui-app ls -la /usr/share/nginx/html

# Check nginx config
docker exec mirador-ui-app cat /etc/nginx/conf.d/default.conf

# Test health endpoint
curl http://localhost:3000/health
```

#### Development Hot Reload Not Working
```bash
# Ensure volume mount is correct
docker inspect mirador-ui-dev-container | grep Mounts

# Check file permissions
ls -la src/

# Restart development container
pnpm compose:down && pnpm compose:up:dev
```

### Performance Tuning

#### Nginx Optimization
```nginx
# Adjust worker processes in nginx.conf
worker_processes auto;

# Increase client body size if needed
client_max_body_size 10M;

# Enable additional compression
gzip_comp_level 6;
```

#### Container Resources
```yaml
# Add to docker-compose.yml
services:
  mirador-ui:
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M
```

## 📈 Monitoring & Logging

### Container Logs
```bash
# Follow production logs
pnpm docker:logs

# View specific time range
docker logs --since="2h" --until="1h" mirador-ui-app

# Export logs
docker logs mirador-ui-app > mirador-ui.log
```

### Resource Monitoring
```bash
# Real-time stats
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Historical data (requires monitoring setup)
# Consider Prometheus + Grafana for production
```

---

**Ready to containerize your iOS Widgets Dashboard! 🚀**

For additional deployment scenarios (Kubernetes, Cloud providers), see the deployment guides in the `/docs` directory.