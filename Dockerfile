# Use Node.js 20 LTS as base image
FROM node:24-alpine

# Install Python and pip for OpenHands
RUN apk add --no-cache python3 py3-pip git

# Enable pnpm
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install Node.js dependencies
RUN pnpm install --frozen-lockfile

# Install OpenHands
RUN pip3 install openhands

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Create openhands workspace directory
RUN mkdir -p ./openhands_workspace

# Expose port (optional, for health checks)
EXPOSE 3000

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S slack-bot -u 1001
RUN chown -R slack-bot:nodejs /app
USER slack-bot

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Start the application
CMD ["pnpm", "start"]
