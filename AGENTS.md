# Agent Development Conventions — Omni-Dashboard

This document captures the conventions, patterns, and gotchas discovered during the development of the Omni-Dashboard. It is intended for AI agents working on this codebase.

---

## Timestamp Pitfalls

The `queryDb` helper uses `rowMode: 'array'` (for performance), which causes inconsistent timestamp serialization:

- **Direct timestamps** (columns selected directly): Returned as JS `Date` objects. When serialized to JSON they become ISO strings ending with `Z`.
- **Timestamps inside `json_agg(row_to_json(...))`**: Returned as strings with `+00:00` offset (no `Z` suffix).
- **`formatTimeAgo`** (in `overview.ts` and other pages) must handle **both**:
  - `Date` objects (from direct column access with rowMode: array)
  - ISO strings (from JSON aggregates)

```typescript
// Canonical date parsing — in formatTimeAgo (overview.ts:514-524)
const dateVal =
  typeof dateStr === "object" && dateStr instanceof Date
    ? dateStr
    : new Date(
        typeof dateStr === "string"
          ? dateStr.endsWith("Z") || dateStr.includes("+") || dateStr.includes("T")
            ? dateStr
            : dateStr + "Z"
          : dateStr,
      );
```

- **Bucket normalization for charts**: Convert to ISO string before `.slice(0,10)`:

```typescript
// overview.ts:200-202 — normalize bucket for daily aggregation
const bucketStr =
  typeof h.bucket === "object" && h.bucket instanceof Date ? h.bucket.toISOString() : String(h.bucket);
const day = bucketStr.slice(0, 10);
```

---

### JSONB Column Handling

`queryDb` returns JSONB as raw strings when using `rowMode: 'array'`. Always parse with:

```typescript
function parseJsonArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
```

**Fields requiring this treatment**: `skills`, `context_from`, `enabled_toolsets`, `allowed_tools`, `token_usage`.

**Usage locations**: The `parseJsonArray` function is defined in `server/routes/schedule.ts` (line 5-17) and used there for cron jobs. The same pattern exists inline in `server/routes/messages.ts` for `token_usage` parsing (lines 157-176).

---

## Logged Messages: Iteration Badge

The `/messages` page displays each message's `thread_sequence` as an iteration badge (`⟳ N`) next to the message ID. The `thread_sequence` field is already returned by the `/api/messages/events` endpoint (from the `messages.thread_sequence` column). Only LLM calls increment this counter; tool messages share the same value as their parent LLM call.

The badge is rendered in `src/lib/message-card.ts` using the `.ev-iter-badge` CSS class (cyan color, monospace font, 70% opacity).

## Schedule Modal: Active Default

The Create Schedule modal defaults the "Active" checkbox to **unchecked**. New schedules are created inactive and must be explicitly activated. The scheduler filters by `active = true` in `cron_jobs` table, so inactive jobs are never picked up. Use `force=true` to run an inactive job via the trigger endpoint.

## Cron Schedule Format

All cron schedules in the dashboard use the **5-field Linux format**: `min hour dom month dow`. Each field accepts:

| Field | Values | Description |
|-------|--------|-------------|
| `min` | 0–59 | Minute of the hour |
| `hour` | 0–23 | Hour of the day |
| `dom` | 1–31 | Day of the month |
| `month` | 1–12 (or names) | Month |
| `dow` | 0–7 (0/7 = Sun) | Day of the week |

**Special syntax:** `*` = any, `*/N` = every N, `,` = list, `-` = range.

**Common examples:**
```
* * * * *     — every minute
*/10 * * * *  — every 10 minutes
0 * * * *     — every hour at :00
0 0 * * *     — daily at midnight
30 6 * * *    — daily at 06:30
0 9 * * 1-5   — weekdays at 09:00
0 0 1 * *     — 1st of every month at midnight
```

The default schedule value in the create modal is `0 0 * * *` (daily at midnight). The help box in `src/lib/schedule-detail.ts` (lines 384-395) documents this format.

## Channel Template Field

Channels now support a `template` field (TEXT column `channels.template`). When set:

1. **Template input** appears on the Channels page as an editable text field alongside other channel config fields (profile, provider, model, planning mode).
2. The template name is saved/loaded via `PATCH /api/channels/:id` with `body: { template: "my-template" }`.
3. On the backend, the channel template is injected into user message seq-0 metadata and loaded from `profiles/<name>/templates/<name>.md`.
4. For Cron/Kanban tasks, the channel template acts as a default fallback when the task doesn't have its own template.

**Frontend files:**
- `src/lib/channel-config.ts` — `renderTemplateInput()` renders the editable text field
- `src/lib/channel-status.ts` — renders the template row in the channel card
- `src/lib/api.ts` — `ChannelData` interface includes `template: string | null`
- `server/routes/channels.ts` — GET list and PATCH handler support the `template` field

**API contract:**
- `GET /api/channels` returns `template: string | null` for each channel
- `PATCH /api/channels/:id` accepts `{ template: "template-name" }` to set, or `{ template: "" }` to clear

---

## CSS Class Conventions

### Filter Bar Classes
All filter controls use these classes — never raw `<input>` with inline styles:

| Class | Element | Usage |
|-------|---------|-------|
| `filter-bar` | Container | Wrapper for filter sections |
| `filter-section` | Container | Each individual filter group |
| `filter-label` | `<label>` | Filter group label |
| `filter-input` | `<input>` | Text inputs |
| `filter-select` | `<select>` | Dropdown selects |
| `filter-checkbox-label` | `<label>` | Checkbox with styled label |
| `filter-actions` | Container | Action buttons (Refresh, Reset) |

**History**: The Settings page initially used raw inline styles for inputs — the user corrected this to use `filter-bar` classes. All new pages should follow this pattern.

### Settings Page Classes

| Class | Element | Usage |
|-------|---------|-------|
| `settings-card` | `<div class="card settings-card">` | Card wrapper for each category |
| `card-header` | Header | Category title |
| `card-body` | Content | Settings rows |
| `setting-row` | Container | Individual setting entry |
| `setting-controls` | Container | Left side: name + input group |
| `setting-description` | Text | Right side: setting description |
| `setting-readonly-value` | Container | Read-only field wrapper |
| `setting-readonly-code` | `<code>` | Read-only value display |
| `setting-lock-icon` | SVG | Lock icon for readonly fields |
| `setting-input` | input/select/textarea | Editable setting input |
| `setting-secret-wrapper` | Container | Secret field + eye toggle |
| `setting-secret-input` | `<input type="password">` | Secret value input |
| `setting-secret-toggle` | Button | Eye icon toggle |
| `setting-actions` | Container | Confirm/Cancel buttons |
| `setting-confirm-btn` | Button | Save a single setting |
| `setting-cancel-btn` | Button | Reset a single setting |
| `setting-name` | Text | Setting variable name |

### Status Badge Classes

| Class | Meaning |
|-------|---------|
| `status-badge-success` | Green — completed/success |
| `status-badge-completed` | Green — completed |
| `status-badge-error` | Red — error/failed |
| `status-badge-created` | Indigo — created/new |
| `status-badge-failed` | Red — failed |
| `status-badge-interrupted` | Purple — interrupted |
| `status-badge-processing` | Amber — processing |
| `status-badge-pending` | Blue — pending |
| `status-badge-skipped` | Muted gray — skipped |

### Kanban Status Badge Colors

| Status ID | Class | Color |
|-----------|-------|-------|
| `backlog` | `kanban-col-neutral` / `badge-neutral` | Neutral gray |
| `todo` | `kanban-col-purple` / `badge-purple` | Purple |
| `ready` | `kanban-col-orange` / `badge-warning` | Amber/warning |
| `running` | `kanban-col-cyan` / `badge-cyan` | Cyan |
| `review` | `kanban-col-sky` / `badge-blue` | Blue |
| `done` | `kanban-col-emerald` / `badge-success` | Green/emerald |
| `blocked` | `kanban-col-rose` / `badge-error` | Rose/red |

---

## DOM Event Handling

### Module-Level Listener Flags
- The Kanban page uses a module-level `_dropdownListenerAttached` flag to prevent accumulated event listeners when `innerHTML` is replaced.
- `innerHTML` replacement kills old DOM elements but does NOT remove document-level or module-level listeners.
- When a page is re-rendered, the old event listeners remain unless explicitly managed with flags.

### Thread Rows Must Be Real `<a>` Elements
Thread rows in the Threads page must be **real `<a>` elements** with `href` attributes, not `<tr>` elements with JS click handlers. This ensures:
- Middle-click opens in new tab
- Right-click context menu works
- Keyboard navigation works
- Screen readers get proper navigation semantics

```html
<!-- CORRECT -->
<a href="/messages?thread_id=123" class="thread-row" role="row">
  <div role="cell">...</div>
</a>

<!-- WRONG — do not use -->
<tr onclick="navigate(...)">...</tr>
```

### Drag-Drop Overlay
The global drag-drop overlay (for file uploads) checks for `'Files'` in `dataTransfer.types` to distinguish file drops from internal application drags (e.g., kanban card text/plain drags):

```typescript
// Skip internal drags (kanban cards) — only handle file drops
if (dragTypes.includes("text/plain") && !dragTypes.includes("Files")) {
  return;
}
if (!dragTypes.includes("Files")) {
  return;
}
```

### Use `classList.toggle` for State
Never manipulate inline styles for toggle state — use `classList.toggle`:

```typescript
// CORRECT
element.classList.toggle("active", condition);

// WRONG
element.style.display = condition ? "block" : "none";
```

---

## Date Handling

Always use the canonical date parsing pattern when converting database timestamps:

```typescript
const dateVal =
  typeof dateStr === "object" && dateStr instanceof Date
    ? dateStr
    : new Date(
        typeof dateStr === "string"
          ? dateStr.endsWith("Z") || dateStr.includes("+") || dateStr.includes("T")
            ? dateStr
            : dateStr + "Z"
          : dateStr,
      );
```

This handles three cases:
1. JS `Date` objects (from rowMode: array)
2. ISO strings ending with `Z` (standard UTC)
3. ISO strings with `+00:00` offset (from JSON aggregates)
4. Date-only strings without timezone info

---

## Build & Deploy

### Commands

| Situation | Command |
|-----------|---------|
| Frontend-only changes | `npm run build:frontend` (no Docker) |
| Server changes | `npm run build:server` + `docker compose up -d --build dashboard` |
| Combined changes | `npm run build` + `docker compose up -d --build dashboard` |

### Rules
- Always use the combined `docker compose up -d --build` (not separate build + recreate).
- Never use `--no-cache` unless the `dist/` directory is empty and stale cached layers cause issues.
- The compose file mounts `./dist:/app/dist:ro` — so frontend builds don't need a Docker rebuild.

### Caching Gotcha
- Content-hashed JS/CSS files in `/assets/` are cached for **365 days** with `immutable: true`.
- `index.html` is served with `Cache-Control: no-store`.
- After a frontend deploy, users may need **Ctrl+Shift+R** (hard refresh) to pick up new JS chunks.
- If `index.html` loads a stale JS reference (because the old URL is cached), the page shows **blank white**.
- Fix: Meta tags + Cache-Control headers on index.html + Ctrl+Shift+R.

---

## Navigation

### Dual Navigation
The nav is defined in **two places** in `index.html`:

1. `.sidebar-nav` (desktop sidebar) — lines 56-94
2. `.mobile-nav` (mobile bottom bar) — lines 109-145

**Both must be kept in sync** when adding or renaming pages.

### Nav Order
1. Overview (`/`)
2. Threads (`/threads`)
3. Messages (`/messages`)
4. Kanban (`/kanban`)
5. Schedule (`/schedule`)
6. Prompt (`/prompt`)
7. Wiki (`/wiki`)
8. Settings (`/settings`)

### Data Attributes
Each `<a>` needs:
- `href="/<route-name>"` — the URL path
- `data-route="<route-name>"` — matching the router key in `router.ts`
- `class="nav-item"` or `class="mobile-nav-item"` depending on position

### Router
The SPA router (`src/lib/router.ts`) supports:
- **Exact routes**: `overview`, `threads`, `messages`, `kanban`, `schedule`, `settings`, `wiki`, `prompt`, `profiles`, `channels`, `platforms`
- **Parameterized routes**: `kanban/<id>`, `schedule/<id>`

To add a new page:
1. Add the route to `routes` array in `router.ts`
2. Create the page renderer in `src/pages/`
3. Add nav items in both `.sidebar-nav` and `.mobile-nav` in `index.html`
4. Import the renderer in `router.ts`

---

## Known Bug Patterns

### Empty-string filter values
- Setting empty-string filter on `Some("")` from DB — check for **both** `null` and empty string:
  ```typescript
  if (subtypeParam && subtypeParam.trim() !== "") { ... }
  ```

### Settings page initial styles
- Initially the Settings page used raw inline styles for inputs. The user corrected this to always use `filter-bar` classes. **All new pages should use filter-bar classes from the start.**

### Blank page on deploy
- Symptom: After deploying, the page shows blank white.
- Cause: Browser cached `index.html` references old JS chunk URLs.
- Fix: Hard refresh (Ctrl+Shift+R). Prevention: `Cache-Control: no-store` on index.html + meta tags.

### Container networking
- The dashboard container **cannot reach sibling containers** via `localhost` — Docker maps ports differently.
- Use Docker gateway IP or internal Docker network hostnames (`omniagent:8080`, `qdrant:6333`).

---

## TypeScript Conventions

### Frontend (`tsconfig.json`)
- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`
- Strict mode enabled, including `noUnusedLocals` and `noUnusedParameters`
- `@/` path alias maps to `src/`
- DOM types included

### Server (`tsconfig.server.json`)
- `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`
- Strict mode but `noUnusedLocals`/`noUnusedParameters` disabled
- Output to `server-dist/`, root in `server/`
- No DOM types (Node.js only)

### API Client Pattern
The API client (`src/lib/api.ts`) defines all types and four HTTP methods:

```typescript
export async function apiGet<T>(path: string): Promise<T>
export async function apiPost<T>(path: string, body: unknown): Promise<T>
export async function apiPut<T>(path: string, body: unknown): Promise<T>
export async function apiDelete<T>(path: string): Promise<T>
```

All methods throw on non-OK responses with message from response text. Use these for all API calls in page modules.

### Database Query Pattern
```typescript
import { queryDb } from "../db.js";

const rows = await queryDb("SELECT * FROM table WHERE id = $1", [id]);
// rows is an array of objects with named fields (converted from array rows)
```

---

## Testing

- Tests use Node.js built-in test runner (`node --test`).
- Test files live in `tests/` directory.
- Run: `npm run test` or `npm run test:unit`.
- Tests currently exist for routes and lib utilities.

---

## Linting & Formatting

- ESLint with `@eslint/js` and `typescript-eslint` for TypeScript linting.
- Prettier for code formatting with eslint-plugin-prettier integration.
- Run: `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`.
- Husky is configured for pre-commit hooks (via `npm run prepare`).
