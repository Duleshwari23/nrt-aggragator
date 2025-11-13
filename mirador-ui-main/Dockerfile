# Multi-stage Alpine-based Dockerfile for Mirador UI
# Optimized for production with minimal image size

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Stage 2: Production stage
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mirador -u 1001 -G nodejs

# Set ownership of nginx files
RUN chown -R mirador:nodejs /usr/share/nginx/html && \
    chown -R mirador:nodejs /var/cache/nginx && \
    chown -R mirador:nodejs /var/log/nginx && \
    chown -R mirador:nodejs /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R mirador:nodejs /var/run/nginx.pid

# Create nginx directories with proper permissions
RUN mkdir -p /var/cache/nginx/client_temp && \
    mkdir -p /var/cache/nginx/proxy_temp && \
    mkdir -p /var/cache/nginx/fastcgi_temp && \
    mkdir -p /var/cache/nginx/uwsgi_temp && \
    mkdir -p /var/cache/nginx/scgi_temp && \
    chown -R mirador:nodejs /var/cache/nginx

# Switch to non-root user
USER mirador

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Metadata
LABEL maintainer="platformbuilds"
LABEL description="Mirador UI - iOS Widgets Dashboard"
LABEL version="1.0.0"