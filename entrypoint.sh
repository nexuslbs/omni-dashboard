#!/bin/sh
set -e

# Start API server in background
node /app/server/index.js &

# Start nginx in foreground
nginx -g "daemon off;"
