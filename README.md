# Omni-Dashboard

SPA dashboard for OmniAgent: a real-time operational dashboard providing system monitoring, thread/message inspection, kanban task management, schedule management, prompt preview, wiki search, and settings management.

Built with **Vite + TypeScript** frontend and **Express** backend, sharing a **PostgreSQL** database with OmniAgent.

---

## Pages

### Overview (`/`)

4-row dashboard page with:

- **Row 1: KPI Cards**: Threads Today, Avg Response Time, Token Consumption, Active Channels. Each card shows a vs-yesterday trend indicator.
- **Row 2: SVG Charts**: Bar chart (7-day hourly thread count), donut chart (status distribution), line chart (14-day token trend). All rendered as pure SVG: no Chart.js used for these.
- **Row 3: Tables**: Recent Activity (last 10 threads with preview/time/tokens) and Channel Health (threads today, avg duration, success rate, last activity).
- **Row 4: Bottom Bar**: Top Tools Used (7-day tool call counts) and Kanban Snapshot (column counts overview).

### Threads (`/threads`)

Paginated thread list with filter controls:

- Filter by **Status** (completed, failed, processing, pending, etc.)
- Filter by **Cause** (user, cron, kanban, etc.)
- Filter by **Thread ID** (free-text input, uses LIKE search)
- Thread rows are real `<a>` elements (not `<tr>` with JS click handlers) for middle-click support.
- Each row shows: ID, status badge, cause badge, channel, created time, message count, content preview, duration, token count.

### Messages (`/messages`)

Detailed message viewer with extensive filtering:

- Filters: Channel, Thread ID, Role (cause/agent/system/tool), Type (multi-select toggle buttons for prompt/response/reasoning/tool/tool_output/iteration/delegate_result/skill), Subtype (free-text), Provider, Model, Seq-0 only checkbox.
- URL search param sync: filters persist in the URL.
- Per-message display: color-coded role badges, timing and token display, expandable content with 3-line truncation.
- Color-coded type a

### Memory (`/memory`)

Memory management:

- **Editors**: MEMORY.md and USER.md in-place editors with save.
- **Hindsight stats**: Memory usage, message counts.
- **Context preview**: Shows the assembled context section [3] that gets injected into the agent's system prompt: displays retrieved wiki, memory, and recent thread context built from Qdrant and the database.
- **Upload/Download**: Upload or download the memory files.

### Kanban (`/kanban`)

Kanban task board with board selector and role-based workflows:

- **Board selector** (top bar): custom enhanced `<select>` (via `lib/kanban-boards.ts`) listing boards from `boards.yml`; selection persisted in localStorage and synced to the URL (`?board=...`).
- **Columns**: 7 status columns (Backlog, Todo, Ready, In Progress, Review, Done, Blocked) with drag-and-drop cards.
- **Workflow display**: each board shows its configured workflow (`workflows.yml`); the board create/edit modal has a workflow select.
- **Create Task Modal**: Title, Body, Priority, Status, and custom enhanced `<select>`s for Board, Workflow, Plan mode, Template, Channel, Profile (board/workflow/plan/template populate from the boards/workflows config; board required when `boards.yml` is present).
- **Task Detail View** (`/kanban/:id`): Full task info with Edit modal, Archive/Unarchive toggle, Delete action, Move to status dropdown, subtask list.
- **Drag & Drop**: Desktop only (native HTML5 drag). Cards are `draggable`, columns are drop targets with position-aware insertion via drop Y-coordinate.
- **Archive Toggle**: Show/hide archived tasks (archived tasks are never dispatched).
- Module-level `_dropdownListenerAttached` flag to prevent accumulated listeners on re-render.

### Kanban History (`/kanban/:id/history`)

Per-task workflow history: shows the steps each task traversed (todo → running → review → testing → done) with the workflow roles that ran.

### Workflows (`/workflows`)

Role-based kanban workflow editor backed by `config/workflows.yml`:

- Lists workflows with their global settings (profile, provider, model, plan_mode, retries, `auto_approve`, `review_on_fail`, `clear_executions_on_review`).
- Per-role **Mode** select (`agent` / `action`) + **Action** select (when mode=action) + per-role profile/provider/model/template/plan_mode/retries.
- Changes are written to `workflows.yml` on save.

### Schedule (`/schedule`)

Cron job list with mode indicators:

- Shows all cron jobs from the `cron_jobs` table.
- Each row: name, schedule/cron expression (**5-field Linux format**: `min hour dom month dow`), mode (agentic/direct), enabled/disabled status, prompt preview, skills, last run / next run.
- **Detail View** (`/schedule/:id`): Full job detail with mode selector toggle, active/inactive switch, channel_id field.
- JSONB fields (skills, context_from, enabled_toolsets) parsed via `parseJsonArray` helper.

### Hooks (`/hooks`)

Event-driven hooks manager backed by the hooks API (`config/tasks.yml` hook templates):

- Lists hook task templates (thread_started / thread_finished / new_message events) with their channel, prompt, enabled state.
- **Create/Edit modal** (custom enhanced selects for trigger event type and channel).
- New hooks are registered as cron-scheduled tasks delivering events to the configured hook channel.

### Secrets (`/secrets`)

Vault secrets manager for API keys and credentials:

- Lists all secrets from the secrets API.
- Each secret shows key name with obfuscated value (••••••••).
- **Eye toggle** to reveal/hide individual secret values: only shown on password-type fields.
- **Add Secret** modal: key-value form with custom enhanced `<select>` for secret type.
- **Delete** action with confirmation.
- Secrets are fetched and stored via the OmniAgent secrets API (`/api/secrets`).
- **Plugin config references**: Secrets can be referenced from plugin config forms (Platforms, Tools, Providers) using the prefix `$secret:name`. The secret value is resolved at runtime: the YAML file stores only the reference, never the actual value. See [Plugin Config References](#-secretconfig-field-reference-toggle) below.

### Profiles (`/profiles`)

Agent profile management:

- Lists all profiles from the `profiles` DB table.
- Each profile displays: provider, model, base_url, max_tokens, temperature, allowed_tools (JSONB).
- **Read-only display** of channels currently using this profile.
- Profiles define the LLM configuration and tool access for threads created under them.

### Channels (`/channels`)

Channel management for all connected platforms:

- Lists all channels with: name, platform, resource identifier, open/closed status badge.
- **Open/Close toggle**: Close a channel to stop processing; open to resume.
- **Status badge**: Permanent (readonly) channels shown with neutral badge.
- **Planning Mode badge**: Shows the channel's planning mode configuration.
- **Template field**: Optional template name injected into every user message's prompt. Also acts as default template for Cron/Kanban tasks in this channel.
- Displays current profile, provider, and model for each channel.
- Filter controls: channel ID, platform, status.

### Platforms (`/platforms`)

Platform management and subscription control:

- Platforms grouped by name with active/inactive status.
- Active status determined by whether any channel for that platform is not closed.
- Resource identifiers linked to their channels.
- **Subscription Management**: Add/remove which channels a platform listens to via the `channel_subscriptions` table.
- Subscribe: POST to `/api/platforms/:platform/subscribe` with `subscriber_resource` and `channel_id`.
- Unsubscribe: DELETE to `/api/platforms/:platform/subscribe/:subId`.

### Tools (`/tools`)

MCP tool registry viewer:

- Lists all registered MCP tools from the OmniAgent MCP registry.
- Each tool shows: name, description, input schema (JSON).
- Tools are grouped by source: built-in, external MCP servers, and plugin-provided.
- Read-only view: tool configuration is managed through Platforms and plugin settings.

### Providers (`/providers`)

LLM provider configuration:

- Lists all configured LLM providers with their settings.
- Each provider shows: name, base URL, model list (from `config_schema` enriched with provider manifest data), API mode.
- Providers can be enabled/disabled individually.
- Models are rendered via the shared `plugin-config.ts` rendering system (same as Tools and Platforms).
- Configuration is stored in OmniAgent's provider config and read from the root `config_schema`.

### Models (`/models`)

Provider/model overrides from `config/models.yml`:

- Lists provider entries with their models list, api_mode, default_base_url, refresh_url, token budgets.
- **Add/Edit/Delete** provider entries (written to `models.yml` via `PUT /api/models`).
- **Import** a models.yml-like file (shared `lib/plugin-import.ts` modal).
- **⟳ Refresh** fetches live model lists from a provider's `refresh_url` and writes them back to `models.yml`.

### Actions (`/actions`)

Saved action management:

- Lists all saved actions from the `actions` table.
- Each action has: name, tool name, JSON parameters.
- **Create action**: name + tool + optional params.
- **Run action**: executes the action's MCP tool call in real-time and shows the result.
- **Edit/Delete**: update action parameters or remove.
- Built-in actions (e.g., kanban_dispatcher, relevance_indexer, hindsight_populator) are marked and cannot be deleted.

### Prompt (`/prompt`)

Prompt preview tool for testing assembled system prompts:

- Channel selector (populated from API), prompt textarea, optional planning step toggle.
- Posts to `/api/prompt-preview/:channelName` which proxies to OmniAgent HTTP API.
- Shows assembled system prompt + messages response, including recent seq-0 context and available skills.

### Explorer (`/explorer`)

Filesystem browser for agent workspace:

- **File Tree** (left panel): Tree-view of the filesystem. Directories are expandable/collapsible with lazy-loaded children.
- **File Viewer** (right panel): Markdown rendering with `marked` + `marked-highlight` + `highlight.js`. Syntax highlighting for code blocks. Copy-button on each code block. YAML frontmatter stripped before rendering. Tables wrapped in scrollable containers.
- **Search**: Debounced (300ms) search against Qdrant vector DB. Results sorted by relevance score.
- **File Upload**: Drag-drop overlay with confirmation modal. Checks for existing files before upload.
- **File Delete**: Confirmation modal before deletion.
- **Git box**: bottom section showing git status (uncommitted/staged files) for the workspace repository.
- Explorer collapse/expand toggle persisted in localStorage.

### Database (`/database`)

Read-only database browser/query runner:

- **Table list** (left sidebar): all tables with row counts; click to view columns + first rows.
- **Custom SELECT** box: run any read-only query (`LIMIT 25` appended automatically if missing), Ctrl+Enter to run.
- Results with sortable columns, null styling, and pagination.
- Backed by the OmniAgent `search_database` MCP tool (the DB page calls `POST /api/db/query` which proxies to it).

### Settings (`/settings`)

Environment variable editor:

- Settings fetched from OmniAgent API (`GET /api/settings`), organized by category.
- Per-row **Confirm/Cancel** buttons appear on change detection.
- **Read-only** values shown with lock icon and muted styling.
- **Secret** fields with eye toggle to show/hide password values.
- Field types: number, boolean, select, text, textarea, secret.
- Settings tabs for: Environment, Profiles, Channels, Platforms, Tools, Actions.

---

## Architecture

### Frontend

- **Vite + TypeScript SPA** with hashless router.
- `data-route` attributes on `<a>` elements for SPA navigation.
- Router at `src/lib/router.ts` maps routes to page renderer functions.
- Pages are pure TypeScript modules that render into `#main-content` via `innerHTML`.
- All styles in `src/style.css` (dark SaaS theme with CSS custom properties).
- Custom enhanced `<select>` dropdowns in `src/lib/dropdown.ts` (dark-theme consistent styling) used across board/workflow/hook/template/channel forms.
- Chart.js used for some charts; SVG-rendered charts in Overview are pure SVG.
- Global file drag-drop in `src/index.ts`.

### Backend

- **Express server** (compiled from TypeScript via `tsc`).
- Routes proxy to OmniAgent API or query shared PostgreSQL directly.
- All API routes under `/api/` prefix.
- SPA fallback: Express serves `index.html` for any non-API, non-file route.
- Static assets in `/assets/` cached for 365 days with `immutable: true`.
- `index.html` served with `Cache-Control: no-store`.
- Docker gateway used to reach sibling containers (`omniagent:8080`, `qdrant:6333`).

### Docker

- **Multi-stage build**: Stage 1 builds frontend (Vite) + compiles backend (tsc). Stage 2 is a minimal `node:22-alpine` image.
- Frontend output: `./dist/`. Backend output: `./server-dist/`.
- Volume-mounted `./dist:/app/dist:ro` for instant frontend updates without Docker rebuild.
- Served by Node on port 3001 (container) mapped externally.
- Includes `sqlite` for agent_interactions queries.

### Database

- **PostgreSQL** (shared with OmniAgent).
- Connected via `pg` driver with `rowMode: 'array'` for performance.
- `queryDb` helper with automatic retry (3 attempts, exponential backoff) and named-field conversion from array rows.
- Tables accessed: `threads`, `messages`, `channels`, `profiles`, `kanban_tasks`, `cron_jobs`, `channel_subscriptions`.

---

## Directory Structure

```text
repo/
├── index.html                     # Entry HTML with sidebar + mobile nav
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # Frontend TypeScript config (ESNext modules, bundler resolution)
├── tsconfig.server.json           # Server TypeScript config (NodeNext modules, output to server-dist/)
├── vite.config.ts                 # Vite config with @/ path alias
├── Dockerfile                     # Multi-stage Docker build
├── public/                        # Static assets (favicon, etc.)
├── src/
│   ├── index.ts                   # Entry point: SPA router, sidebar toggle, global drag-drop, upload modal, toast system
│   ├── style.css                  # All styles (dark SaaS theme, ~4200 lines)
│   ├── lib/
│   │   ├── router.ts              # SPA routing: maps route names to page renderers
│   │   ├── api.ts                 # API client + all TypeScript type definitions
│   │   ├── helpers.ts             # Shared utilities (escapeHtml, formatCompact, shortDate, parseJsonArray)
│   │   ├── dropdown.ts            # Custom enhanced <select> dropdowns (dark theme consistent styling)
│   │   ├── message-card.ts        # Message card rendering (color-coded badges, expandable content, timestamps)
│   │   ├── channel-config.ts      # Channel config form fields (name, profile, provider, model, planning mode selects)
│   │   ├── channel-status.ts      # Channel status controls (open/close toggles, filter bar, status badges)
│   │   ├── plugin-config.ts       # Shared plugin config rendering (used by Tools, Providers, Platforms)
│   │   ├── plugin-import.ts       # Shared YAML-import modal (used by Models page)
│   │   ├── kanban-boards.ts       # Kanban board selector (custom enhanced <select>, localStorage + URL sync) + wireBoardControls
│   │   ├── kanban-board.ts        # Kanban board rendering (drag-drop columns, card rendering)
│   │   ├── kanban-detail.ts       # Kanban task detail view (edit modal, archive, delete, status move)
│   │   ├── kanban-subtasks.ts     # Kanban subtask rendering within task detail
│   │   ├── schedule-list.ts       # Schedule list rendering (cron job rows, status indicators)
│   │   └── schedule-detail.ts     # Schedule detail view (mode toggle, active/inactive, channel field)
│   └── pages/
│       ├── overview.ts            # Overview dashboard (4-row layout, SVG charts, formatTimeAgo, escapeHtml)
│       ├── threads.ts             # Threads list (filter by status/cause/ID, real <a> rows, pagination)
│       ├── messages.ts            # Message viewer (8 filters, URL sync, custom selects, expandable content)
│       ├── memory.ts              # Memory management (MEMORY.md/USER.md editors, Hindsight stats, context preview)
│       ├── kanban.ts              # Kanban board (7 columns, drag-drop, board selector, create/edit/detail modals, archive)
│       ├── kanban-history.ts      # Kanban task workflow history (steps traversed per task)
│       ├── workflows.ts           # Role-based workflow editor (config/workflows.yml: modes, auto_approve, review_on_fail)
│       ├── schedule.ts            # Schedule page (cron job list + detail view)
│       ├── hooks.ts               # Event-driven hooks manager (thread_started/thread_finished/new_message)
│       ├── secrets.ts             # Secrets manager (key-value viewer, eye toggle, add/delete)
│       ├── profiles.ts            # Profiles management (provider/model config, tool access, channel usage)
│       ├── channels.ts            # Channels management (open/close, status badges, filter controls)
│       ├── platforms.ts           # Platforms with subscription management (subscribe/unsubscribe channels)
│       ├── tools.ts               # MCP tool registry viewer (name, description, input schema per tool)
│       ├── providers.ts           # LLM provider configuration (base URL, models, API mode, enable/disable)
│       ├── models.ts              # models.yml provider/model overrides (CRUD, import, refresh)
│       ├── actions.ts             # Saved action manager (create, run, edit, delete MCP tool actions)
│       ├── prompt.ts              # Prompt preview tool (channel selector, prompt textarea, plan toggle)
│       ├── explorer.ts            # Filesystem browser (file tree, markdown viewer, search, upload/delete, git box)
│       ├── database.ts            # Read-only DB browser (table list, custom SELECT via search_database)
│       └── settings.ts            # Settings editor (env vars, per-row confirm/cancel, secret toggle)
└── server/
    ├── index.ts                   # Express setup, static file serving, SPA fallback
    ├── db.ts                      # PostgreSQL connection pool + queryDb helper with retry
    └── routes/
        ├── health.ts              # Health check endpoint (status, version, uptime)
        ├── overview.ts            # Dashboard data (multi-CTE query) + recent threads list
        ├── threads.ts             # Thread list with pagination + filters endpoint
        ├── messages.ts            # Message events + filters (channels, roles, types, providers, models)
        ├── memory.ts              # Memory read/write endpoints (MEMORY.md, USER.md, context preview)
        ├── kanban.ts              # Kanban CRUD (boards, tasks CRUD, status/position updates, workflow select)
        ├── schedule.ts            # Cron job list + detail
        ├── settings.ts            # Settings proxy to OmniAgent API
        ├── channels.ts            # Channels list from DB
        ├── profiles.ts            # Profiles list from DB
        ├── platforms.ts           # Platforms + subscription management from DB
        ├── plugins.ts             # Plugin management endpoints (list, get, enable, disable, config)
        ├── db.ts                  # Read-only query endpoint (proxies to OmniAgent search_database MCP tool)
        ├── wiki-search.ts         # Wiki search via Qdrant vector DB
        ├── uploads.ts             # File upload/delete/check with multer
        └── fs.ts                  # Filesystem browse/read/download
```

---

## Development

### Commands

| Command                  | Description                       |
| ------------------------ | --------------------------------- |
| `npm run dev:frontend`   | Vite dev server                   |
| `npm run dev:server`     | Watch-mode server via `tsx watch` |
| `npm run build:frontend` | Vite production build → `./dist/` |
| `npm run build:server`   | tsc compile → `./server-dist/`    |
| `npm run build`          | Both frontend + server            |
| `npm run test`           | Run all tests (`node --test`)     |
| `npm run lint`           | ESLint check                      |
| `npm run format`         | Prettier formatting               |
| `npm run format:check`   | Check formatting                  |

### Workflow

- **Frontend-only changes**: Run `npm run build:frontend`: no Docker rebuild needed. The compose file mounts `./dist:/app/dist:ro`, so changes are instantly reflected.
- **Server changes**: Run `npm run build:server` + `docker compose up -d --build dashboard`.
- **Combined changes**: `npm run build` + `docker compose up -d --build dashboard`.
- Always use the combined `docker compose up -d --build` (not separate build + recreate).
- Never use `--no-cache` unless the `dist/` directory is empty.

### Tests

- Test files in `tests/` directory.
- Run with `npm run test` or `npm run test:unit`.
- Uses Node.js built-in test runner.
- Regression coverage for kanban UI behavior (board selector custom select, workflow modal selects, hooks triggers) lives in `tests/` (e.g. `kanban-workflow.test.ts`) and is exercised from omni-deployer as GROUP 49.

---

## Environment / Configuration

The server reads the following environment variables:

| Variable     | Default     | Description              |
| ------------ | ----------- | ------------------------ |
| `PGHOST`     | `postgres`  | PostgreSQL host          |
| `PGPORT`     | `5432`      | PostgreSQL port          |
| `PGUSER`     | `omniagent` | PostgreSQL user          |
| `PGPASSWORD` | `omniagent` | PostgreSQL password      |
| `PGDATABASE` | `omniagent` | PostgreSQL database name |
| `PORT`       | `3001`      | Server listen port       |

The dashboard container connects to:

- **OmniAgent HTTP API** at `http://omniagent:8080` (for settings, prompt-preview, hooks, models, DB query proxy).
- **Qdrant** at `http://qdrant:6333` (for wiki search).
- Note: Dashboard cannot reach sibling containers via `localhost`: uses Docker internal networking.

### Caching

- Content-hashed JS/CSS files in `/assets/` are cached for **365 days** with `immutable: true`.
- `index.html` is served with `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`.
- After deploying frontend changes, users may need **Ctrl+Shift+R** (hard refresh) to bypass cached JS.
- If `index.html` loads stale JS references, the page shows blank white: meta tags + Cache-Control headers mitigate this.

---

## Dependencies

### Runtime

| Package            | Purpose                    |
| ------------------ | -------------------------- |
| `express`          | HTTP server                |
| `pg`               | PostgreSQL driver          |
| `multer`           | File upload handling       |
| `chart.js`         | Chart rendering            |
| `marked`           | Markdown→HTML parsing      |
| `marked-highlight` | Markdown code highlighting |
| `highlight.js`     | Syntax highlighting        |
| `shell-quote`      | Shell command quoting      |

### Dev

| Package      | Purpose                     |
| ------------ | --------------------------- |
| `vite`       | Frontend bundler            |
| `typescript` | TypeScript compiler         |
| `eslint`     | Linting                     |
| `prettier`   | Code formatting             |
| `husky`      | Git hooks                   |
| `@types/*`   | TypeScript type definitions |

---

## API Endpoints

All endpoints are under `/api/`:

| Endpoint                                    | Method | Description                                                              |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| `/api/health`                               | GET    | Server health check (status, version, uptime)                            |
| `/api/overview`                             | GET    | Recent threads list (50 most recent)                                     |
| `/api/overview/dashboard`                   | GET    | Full dashboard data (KPIs, charts, tables, tools)                        |
| `/api/threads`                              | GET    | Paginated threads with filters                                           |
| `/api/threads/filters`                      | GET    | Available status and cause values                                        |
| `/api/messages/filters`                     | GET    | Available filter values (channels, roles, types, etc.)                   |
| `/api/messages/events`                      | GET    | Paginated messages with all filters                                      |
| `/api/kanban/board`                         | GET    | Kanban board (columns with tasks)                                        |
| `/api/kanban/boards`                        | GET    | List boards (from boards.yml)                                            |
| `/api/kanban/tasks`                         | POST   | Create kanban task (board/workflow/plan/template/channel/profile fields) |
| `/api/kanban/tasks/:id`                     | GET    | Task detail                                                              |
| `/api/kanban/tasks/:id`                     | PATCH  | Update task fields                                                       |
| `/api/kanban/tasks/:id`                     | DELETE | Delete task                                                              |
| `/api/kanban/tasks/:id/status`              | PATCH  | Move task between columns                                                |
| `/api/kanban/tasks/:id/position`            | PATCH  | Reorder task within/between columns                                      |
| `/api/kanban/tasks/:id/history`             | GET    | Workflow history for a task                                              |
| `/api/workflows`                            | GET    | List role-based workflows (config/workflows.yml)                         |
| `/api/workflows`                            | PUT    | Update workflows.yml                                                     |
| `/api/schedule`                             | GET    | List cron jobs                                                           |
| `/api/schedule/:id`                         | GET    | Cron job detail                                                          |
| `/api/schedule/:id`                         | DELETE | Delete cron job (removes the entry from tasks.yml)                       |
| `/api/hooks`                                | GET    | List hooks (tasks.yml `hooks:` section)                                  |
| `/api/hooks/:id`                            | DELETE | Delete hook (removes the entry from tasks.yml)                           |
| `/api/hooks/:id/threads`                    | GET    | Threads spawned by a hook (`{rows,total}`, parity with /schedule)         |
| `/api/settings`                             | GET    | All env settings (proxied to OmniAgent)                                  |
| `/api/settings`                             | PUT    | Update settings (proxied to OmniAgent)                                   |
| `/api/prompt-preview/:channelName`          | POST   | Preview assembled prompt (proxied to OmniAgent)                          |
| `/api/channels`                             | GET    | List all channels                                                        |
| `/api/profiles`                             | GET    | List all profiles                                                        |
| `/api/platforms`                            | GET    | List all platforms with subscriptions                                    |
| `/api/platforms/:platform/subscribe`        | POST   | Add channel subscription                                                 |
| `/api/platforms/:platform/subscribe/:subId` | DELETE | Remove channel subscription                                              |
| `/api/hooks`                                | GET    | List hook task templates                                                 |
| `/api/hooks`                                | POST   | Create hook                                                              |
| `/api/hooks/:id`                            | PUT    | Update hook                                                              |
| `/api/hooks/:id`                            | DELETE | Delete hook                                                              |
| `/api/models`                               | GET    | List models.yml entries                                                  |
| `/api/models`                               | PUT    | Write models.yml                                                         |
| `/api/models/import`                        | POST   | Import a models.yml-like file                                            |
| `/api/models/refresh`                       | POST   | Refresh model lists from provider refresh_url                            |
| `/api/db/query`                             | POST   | Read-only SQL query (proxied to OmniAgent `search_database` MCP tool)    |
| `/api/wiki-search`                          | POST   | Search wiki via Qdrant                                                   |
| `/api/uploads`                              | POST   | Upload files                                                             |
| `/api/uploads/list`                         | GET    | List uploaded files                                                      |
| `/api/uploads/check`                        | POST   | Check if files exist                                                     |
| `/api/uploads/:file`                        | DELETE | Delete uploaded file                                                     |
| `/api/fs/list`                              | GET    | List directory contents                                                  |
| `/api/fs/read`                              | GET    | Read file content                                                        |
| `/api/fs/download`                          | GET    | Download file                                                            |

---

## Plugin Config References (`$secret:` / `$env:`)

Plugin config forms (Platforms, Tools, Providers) support referencing values from external sources instead of storing them directly. This keeps secrets out of version-controlled YAML and provides a single source of truth for shared values.

### Prefix syntax

| Prefix          | Source                       | Example                     | Resolution                                   |
| --------------- | ---------------------------- | --------------------------- | -------------------------------------------- |
| `$secret:name`  | Secrets DB (`/secrets` page) | `$secret:my_telegram_token` | Async DB lookup at API handler level         |
| `$env:VAR_NAME` | Process environment variable | `$env:OPENCODE_GO_API_KEY`  | Sync env var read in `build_plugin_detail()` |

### UI toggle

Every string and secret config field has a **🔗** button next to it:

- **Default mode** (🔗): literal value is entered directly. Works exactly as before.
- **Reference mode** (✏️): the field shows a **Secret** / **Env Var** type selector and a **name input**. The value is stored as `$secret:name` or `$env:VAR_NAME`.

Click 🔗 to switch to reference mode. Click ✏️ to switch back to literal mode.

### YAML storage

The YAML file stores the reference string, never the resolved value:

```yaml
telegram:
  enabled: true
  config:
    bot_token: "$secret:my_telegram_token"
    polling_interval: 30
```
