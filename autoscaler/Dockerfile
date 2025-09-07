FROM node:18-alpine AS base

# Install docker CLI for container management
RUN apk add --no-cache docker-cli curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S autoscaler && \
    adduser -S autoscaler -u 1001 -G autoscaler

# Set ownership
RUN chown -R autoscaler:autoscaler /app

USER autoscaler

EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

CMD ["node", "index.js"]
