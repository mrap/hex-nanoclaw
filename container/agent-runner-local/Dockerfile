# NanoClaw Local Model Agent Container
# Runs local models via Ollama using Vercel AI SDK

FROM node:22-slim

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    python3 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files first for better layer caching
COPY agent-runner-local/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY agent-runner-local/ ./

# Build TypeScript
RUN npm run build

# Create workspace directories
RUN mkdir -p /workspace/group /workspace/global /workspace/extra /workspace/ipc/messages /workspace/ipc/tasks /workspace/ipc/input

# Create entrypoint: reads stdin JSON, runs agent, writes stdout JSON
RUN printf '#!/bin/bash\nset -e\nnode /app/dist/index.js\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set ownership for writable directories
RUN chown -R node:node /workspace && chmod 777 /home/node

# Switch to non-root user
USER node

WORKDIR /workspace/group

ENTRYPOINT ["/app/entrypoint.sh"]
