# Premium Dashboard — Deployment Guide

The dashboard runs in a Docker container. Source changes to the frontend (`src/`) or server (`server/`) are **not** automatically deployed — they must be built and copied into the running container.

**Never say "deployed" until you've verified with an actual endpoint call.** See Anti-Pattern #14 in the Hermes wiki.

---

## Frontend changes (HTML/JS/CSS)

```bash
# 1. Build
cd /opt/workspace/premium-dashboard/repo && npm run build:frontend

# 2. Copy to container
docker cp dist/assets/. premium-dashboard:/usr/share/nginx/html/assets/
docker cp dist/index.html premium-dashboard:/usr/share/nginx/html/index.html
docker cp dist/favicon.svg premium-dashboard:/usr/share/nginx/html/favicon.svg

# 3. Verify index.html references the correct hashed filename
docker exec premium-dashboard grep "assets/index" /usr/share/nginx/html/index.html

# 4. Clean up stale old-hash files
docker exec premium-dashboard sh -c 'for f in /usr/share/nginx/html/assets/index.*.js; do
  name=$(basename "$f")
  grep -q "$name" /usr/share/nginx/html/index.html || rm -f "$f"
done'
```

## Server changes (routes/*.ts)

```bash
# 1. Build server
cd /opt/workspace/premium-dashboard/repo && npm run build:server

# 2. Copy new JS to container
docker cp server-dist/routes/agents.js premium-dashboard:/app/server/routes/agents.js

# 3. Restart the Node process (it does NOT auto-reload)
docker exec premium-dashboard sh -c 'kill $(pgrep -f "node /app/server/index.js") && sleep 1 && node /app/server/index.js &'

# 4. Verify with a live API call
docker exec premium-dashboard curl -s "http://127.0.0.1:3001/api/agents/events?limit=1"
```

## Full rebuild (image)

```bash
cd /opt/workspace/premium-dashboard && docker compose build --no-cache && docker compose up -d
```
