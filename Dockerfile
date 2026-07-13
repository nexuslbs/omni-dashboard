# syntax=docker/dockerfile:1
# Stage 1: Build frontend + compile backend
FROM node:22-alpine AS builder
WORKDIR /build

# Copy package files
COPY package.json package-lock.json tsconfig.json tsconfig.server.json vite.config.ts ./
COPY server/ ./server/
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./

# Install dependencies from lockfile (deterministic install)
RUN npm ci

# Build frontend (Vite)
RUN npm run build:frontend

# Compile backend TypeScript
RUN npm run build:server

# Stage 2: Production image: node serves both static + API
FROM node:22-alpine

RUN apk add --no-cache git

# Trust the omni-stack repo (owned by host uid 10000, not root)
RUN git config --global --add safe.directory /opt/omni

WORKDIR /app

# Copy built frontend
COPY --from=builder /build/dist /app/dist

# Copy compiled backend
COPY --from=builder /build/server-dist /app/server

# Copy package files for production install
COPY --from=builder /build/package.json /app/package.json
COPY --from=builder /build/package-lock.json /app/package-lock.json

# Install only production dependencies: remove prepare script to avoid husky dependency
RUN npm pkg delete scripts.prepare && npm ci --omit=dev

EXPOSE 3001

CMD ["node", "/app/server/index.js"]
