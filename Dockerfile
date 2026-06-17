# syntax=docker/dockerfile:1
# Stage 1: Build frontend + compile backend
FROM node:22-alpine AS builder
WORKDIR /build

# Copy package files
COPY package.json tsconfig.json tsconfig.server.json vite.config.ts ./
COPY server/ ./server/
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./

# Copy pre-installed node_modules from host (avoids npm registry issues)
COPY node_modules/ ./node_modules/

# Build frontend (Vite)
RUN npm run build:frontend

# Compile backend TypeScript
RUN npm run build:server

# Stage 2: Production image — node serves both static + API
FROM node:22-alpine

# Install sqlite3 for agent_interactions queries
RUN apk add --no-cache sqlite

# Copy built frontend
COPY --from=builder /build/dist /app/dist

# Copy compiled backend
COPY --from=builder /build/server-dist /app/server
COPY --from=builder /build/package.json /app/package.json
COPY --from=builder /build/node_modules /app/node_modules

EXPOSE 80

CMD ["node", "/app/server/index.js"]
