# Raw SQL Queries Inventory — omni-dashboard

Generated: Complete scan of `/opt/workspace/omni-dashboard/repo/`

## Summary

| Category | Count |
|----------|-------|
| SELECT queries | 39 |
| INSERT queries | 11 |
| UPDATE queries | 16 |
| DELETE queries | 4 |
| API Proxy Endpoints | 8 |
| **Total raw SQL** | **70 occurrences** across 8 route files |

All raw SQL lives in `server/routes/*.ts` using the `queryDb()` wrapper from `server/db.ts`.  
Frontend (`src/`) contains **zero** raw SQL. Everything goes through `/api/*` REST endpoints.

---

## Database Connection

**`server/db.ts`**
- Line 3-11: PostgreSQL pool config (host: postgres, db: omniagent)
- Line 18-57: `queryDb(sql, params)` — generic query executor with retries (up to 3)

---

## 1. server/routes/overview.ts

| # | Line | Type | Purpose |
|---|------|------|---------|
| 1 | 10-28 | **SELECT** | Recent threads overview (50 rows) — joins threads, messages, channels |
| 2 | 58-168 | **SELECT** | Dashboard KPIs — massive multi-CTE query (kpis, hourly, status_dist, token_trend, recent, channel_health, top_tools) |

---

## 2. server/routes/messages.ts

| # | Line | Type | Purpose |
|---|------|------|---------|
| 3 | 11-17 | **SELECT** | Channels filter (DISTINCT channels with thread count) |
| 4 | 19-21 | **SELECT** | Roles filter (DISTINCT roles) |
| 5 | 23-25 | **SELECT** | Types filter (DISTINCT msg_type) |
| 6 | 27-29 | **SELECT** | Subtypes filter (DISTINCT msg_subtype) |
| 7 | 31-33 | **SELECT** | Providers filter (DISTINCT provider from threads) |
| 8 | 35-37 | **SELECT** | Models filter (DISTINCT model from threads) |
| 9 | 112-118 | **SELECT** | Messages count (dynamic WHERE from query params) |
| 10 | 122-151 | **SELECT** | Messages data (dynamic WHERE, joins messages/threads/channels, with LIMIT/OFFSET) |

---

## 3. server/routes/kanban.ts (heaviest SQL usage)

| # | Line | Type | Purpose |
|---|------|------|---------|
| 11 | 23-29 | **SELECT** | Board tasks (kanban_tasks, filtered by archived) |
| 12 | 54-57 | **SELECT** | Task detail by ID ($1 param) |
| 13 | 69-74 | **SELECT** | Task dependencies (joins kanban_task_dependencies + kanban_tasks) |
| 14 | 100-102 | **SELECT** | Max position for status group |
| 15 | 106-108 | **INSERT** | Create new kanban task |
| 16 | 125-127 | **INSERT** | Insert kanban history (creation) |
| 17 | 159-161 | **SELECT** | Check task exists (status update) |
| 18 | 176-178 | **SELECT** | Max position for new status |
| 19 | 186 | **UPDATE** | Shift positions up (fill gap in old column) |
| 20 | 191-193 | **UPDATE** | Shift positions down (make room in new column) |
| 21 | 199-201 | **UPDATE** | Reorder within column (move down) |
| 22 | 205-207 | **UPDATE** | Reorder within column (move up) |
| 23 | 212 | **UPDATE** | Set task status + position + updated_at |
| 24 | 221-223 | **INSERT** | History for status move |
| 25 | 260-262 | **SELECT** | Check task exists (position update) |
| 26 | 283 | **UPDATE** | Shift positions up (fill gap, position endpoint) |
| 27 | 288-290 | **UPDATE** | Shift positions down (make room, position endpoint) |
| 28 | 296-298 | **UPDATE** | Reorder within column (move down, position endpoint) |
| 29 | 302-304 | **UPDATE** | Reorder within column (move up, position endpoint) |
| 30 | 309 | **UPDATE** | Set task status + position (position endpoint) |
| 31 | 318-320 | **INSERT** | History for position move |
| 32 | 345-348 | **SELECT** | Check task + fetch current values (update endpoint) |
| 33 | 417 | **UPDATE** | Dynamic SET of task fields |
| 34 | 440-442 | **INSERT** | History for archive/unarchive |
| 35 | 447-449 | **INSERT** | History for status change |
| 36 | 454-456 | **INSERT** | History for field edits (with JSONB previous_values) |
| 37 | 478-481 | **SELECT** | Check task for delete |
| 38 | 503-505 | **INSERT** | History for deletion (with JSONB previous_values) |
| 39 | 510 | **DELETE** | Clear task dependencies |
| 40 | 511 | **UPDATE** | Detach threads from deleted task |
| 41 | 513 | **DELETE** | Delete task (with RETURNING) |
| 42 | 536 | **SELECT** | Count threads for task |
| 43 | 540-558 | **SELECT** | Threads for task (LATERAL join for last message) |
| 44 | 587 | **SELECT** | Check dependency target exists |
| 45 | 594-596 | **SELECT** | Check circular dependency |
| 46 | 604-606 | **SELECT** | Check duplicate dependency |
| 47 | 615-617 | **INSERT** | Add new dependency |
| 48 | 638 | **DELETE** | Remove dependency |
| 49 | 658-665 | **SELECT** | Kanban history log (with optional filters) |
| 50 | 680-687 | **SELECT** | Subtasks for kanban task |

---

## 4. server/routes/schedule.ts

| # | Line | Type | Purpose |
|---|------|------|---------|
| 51 | 47-54 | **SELECT** | Active cron jobs (DISTINCT ON name, active=true) |
| 52 | 57-63 | **SELECT** | All cron jobs (no active filter) |
| 53 | 117-123 | **SELECT** | Single cron job detail |
| 54 | 206-222 | **INSERT** | Create/upsert cron job (ON CONFLICT DO UPDATE) |
| 55 | 269 | **SELECT** | Check job exists (for PATCH) |
| 56 | 347 | **UPDATE** | Dynamic SET of cron job fields |
| 57 | 367 | **UPDATE** | Toggle active state |
| 58 | 384 | **SELECT** | Count threads for schedule job |
| 59 | 390-408 | **SELECT** | Threads for schedule job (LATERAL join for last message) |
| 60 | 423-430 | **SELECT** | Subtasks for schedule job (joins thread_subtasks + threads) |

---

## 5. server/routes/memory.ts

| # | Line | Type | Purpose |
|---|------|------|---------|
| 61 | 40 | **SELECT** | Count threads (optionally filtered by profile/channel) |
| 62 | 44-46 | **SELECT** | Count completed threads |
| 63 | 51-53 | **SELECT** | Count failed threads |
| 64 | 58-60 | **SELECT** | Count messages (subquery on threads) |
| 65 | 65-67 | **SELECT** | Count vectors (messages with non-empty embedding) |
| 66 | 129-146 | **SELECT** | Search messages by content ILIKE (dynamic WHERE) |

---

## 6. server/routes/threads.ts

| # | Line | Type | Purpose |
|---|------|------|---------|
| 67 | 68-71 | **SELECT** | Count threads (dynamic WHERE for status/cause/id/parent filters) |
| 68 | 74-111 | **SELECT** | Threads list with details (dynamic WHERE, LATERAL join, msg_count) |
| 69 | 157 | **SELECT** | Distinct statuses (threads filter) |
| 70 | 158 | **SELECT** | Distinct causes (threads filter) |
| 71 | 179-180 | **SELECT** | Subtasks for a specific thread |

---

## 7. server/routes/channels.ts

| # | Line | Type | Purpose |
|---|------|------|---------|
| 72 | 36-38 | **SELECT** | List all channels (id, name, platform, resource_identifier, etc.) |
| 73 | 55 | **SELECT** | Check channel exists + readonly status |
| 74 | 119 | **UPDATE** | Dynamic SET of channel fields |

---

## 8. server/routes/platforms.ts

| # | Line | Type | Purpose |
|---|------|------|---------|
| 75 | 10-11 | **SELECT** | Distinct platform names |
| 76 | 19-22 | **SELECT** | Channels for a specific platform |
| 77 | 29-35 | **SELECT** | Subscriptions for a platform (joins channel_subscriptions + channels) |
| 78 | 64 | **SELECT** | All channels (for subscription UI) |
| 79 | 102-105 | **INSERT** | Add channel subscription (ON CONFLICT DO NOTHING) |
| 80 | 120 | **DELETE** | Remove channel subscription |

---

## Files with NO SQL queries

| File | Approach |
|------|----------|
| `server/routes/profiles.ts` | File-system based (reads config.json from OMNI_DIR/profiles/) |
| `server/routes/settings.ts` | Proxies to `http://omniagent:8080/settings` |
| `server/routes/plugins.ts` | Proxies to `http://omniagent:8080/api/plugins/*` |
| `server/routes/health.ts` | In-memory (version + uptime) |
| `server/routes/fs.ts` | File-system operations (list/read/download) |
| `server/routes/uploads.ts` | File-system + multer |
| `server/routes/wiki-search.ts` | Qdrant HTTP API (scroll) — no SQL |
| `src/*` (all frontend) | HTTP calls to `/api/*` only |

---

## API Proxy Endpoints

These forward requests to OmniAgent backend (`http://omniagent:8080`):

| # | File | Line | Route | Target |
|---|------|------|-------|--------|
| P1 | `server/index.ts` | 32-43 | `GET /api/messages/filters` | `http://omniagent:8080/messages/filters` |
| P2 | `server/index.ts` | 44-57 | `GET /api/messages/events` | `http://omniagent:8080/messages/events` (with query params) |
| P3 | `server/index.ts` | 77-99 | `POST /api/prompt-preview/:channelName` | `http://omniagent:8080/prompt-preview/{name}` |
| P4 | `server/index.ts` | 102-122 | `GET /api/prompt/:channelName` | `http://omniagent:8080/prompt/{name}` |
| P5 | `server/index.ts` | 159 | `GET /api/mcp/tools` | Generic proxy `http://omniagent:8080/mcp/tools` |
| P6 | `server/index.ts` | 161 | `ANY /api/actions/*` | Generic proxy (strips `/api` prefix) |
| P7 | `server/index.ts` | 163 | `ANY /api/secrets/*` | Generic proxy (strips `/api` prefix) |
| P8 | `server/index.ts` | 166-204 | `GET /api/templates` | File-system (reads .md files from profiles/*/templates/) |
| P9 | `server/routes/schedule.ts` | 23-37 | `GET /api/schedule/actions` | `http://omniagent:8080/actions` |
| P10 | `server/routes/memory.ts` | 327-354 | `GET /api/memory/context/:channelName` | `http://omniagent:8080/api/context/{name}` |
| P11 | `server/routes/threads.ts` | 7-31 | `POST /api/threads/:threadId/stop` | `http://omniagent:8080/stop-thread/{id}` |
| P12 | `server/routes/channels.ts` | 7-31 | `POST /api/channels/:channelId/stop` | `http://omniagent:8080/stop/{channelId}` |
| P13 | `server/routes/schedule.ts` | 441-465 | `POST /api/schedule/:id/run` | `http://omniagent:8080/run-cron/{id}` |

---

## Tables Referenced

| Table | Queries |
|-------|---------|
| `threads` | 30+ (core table — overview, dashboard, messages, memory, threads, schedule, kanban) |
| `messages` | 15+ (messages, memory, overview, threads, schedule, kanban) |
| `channels` | 10+ (overview, messages, channels, platforms, schedule, threads, kanban) |
| `kanban_tasks` | 15+ (kanban module) |
| `kanban_history` | 8 (INSERT only — audit log) |
| `kanban_task_dependencies` | 5 (INSERT, SELECT, DELETE) |
| `cron_jobs` | 6 (schedule module) |
| `thread_subtasks` | 3 (threads, schedule, kanban) |
| `channel_subscriptions` | 3 (platforms module) |

---

## Security Concerns Noted

1. **messages.ts L88**: `msg_subtype LIKE '%...%'` — uses string interpolation (`subtypeParam`) instead of parameterized query for LIKE pattern
2. **messages.ts L93, L96-L106**: Dynamic WHERE clauses built with string interpolation via `quoteValue()` rather than parameterized `$N` placeholders
3. **messages.ts L150**: `LIMIT ${limit} OFFSET ${offset}` — limit/offset are cast to integers but still interpolated into SQL string
