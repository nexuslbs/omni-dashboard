import { apiGet } from "../lib/api";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";
import { escapeHtml } from "../lib/helpers";

// ── Types ──
interface ThreadRow {
  id: string;
  status: string;
  cause: string;
  channel_id: number;
  profile: string;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  duration_ms: number | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  channel_name: string;
  channel_closed?: boolean;
  msg_count: number;
  cause_content_preview: string | null;
  planning_mode: string;
  cause_msg_type: string | null;
  cause_msg_subtype: string | null;
}

interface ThreadsResponse {
  threads: ThreadRow[];
  total: number;
  offset: number;
  limit: number;
}

interface ThreadFilters {
  statuses: string[];
  causes: string[];
}

// ── State ──
const currentLimit = 50;
let currentOffset = 0;
let currentStatus = "all";
let currentCause = "all";
let currentThreadId = "";

// ── URL search param sync ──
function syncFiltersToUrl(): void {
  const params = new URLSearchParams();
  if (currentStatus !== "all") params.set("status", currentStatus);
  if (currentCause !== "all") params.set("cause", currentCause);
  if (currentThreadId) params.set("thread_id", currentThreadId);
  if (currentOffset > 0) params.set("offset", String(currentOffset));
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function applyFiltersFromUrl(): void {
  const p = new URLSearchParams(window.location.search);
  const status = p.get("status");
  if (status) currentStatus = status;
  const cause = p.get("cause");
  if (cause) currentCause = cause;
  const threadId = p.get("thread_id");
  if (threadId) currentThreadId = threadId;
  const offset = p.get("offset");
  if (offset) currentOffset = parseInt(offset, 10) || 0;
}

// ── Status badge colors ──
function statusBadgeStyle(status: string): string {
  const s = status.toLowerCase();
  const color =
    s === "completed"
      ? "#10b981"
      : s === "failed"
        ? "#f43f5e"
        : s === "processing"
          ? "#f59e0b"
          : s === "pending"
            ? "#3b82f6"
            : s === "skipped"
              ? "#64748b"
              : s === "interrupted"
                ? "#8b5cf6"
                : "#64748b";
  return `--type-color:${color};background:${color}22;border-color:${color}44;color:${color}`;
}

/** Channel badge style: open = golden border/color, closed = strikethrough + gray. */
function channelStyle(closed: boolean | undefined): string {
  if (closed) {
    return "color:#94a3b8;opacity:0.5;text-decoration:line-through;border-color:rgba(148,163,184,0.2);background:rgba(148,163,184,0.05)";
  }
  return "--type-color:#fbbf24;color:#fbbf24;border-color:rgba(251,191,36,0.4);background:rgba(251,191,36,0.12)";
}

// ── Cause badge colors ──
function causeColor(cause: string): string {
  switch (cause.toLowerCase()) {
    case "user":
      return "#3b82f6";
    case "cron":
      return "#f59e0b";
    case "kanban":
      return "#8b5cf6";
    default:
      return "#64748b";
  }
}

/** Planning mode badge colors: styled like Cause — 3 colors. */
function planningModeColor(mode: string): string {
  switch (mode) {
    case "prompt_only":
      return "#64748b"; // gray — no plan
    case "auto_plan":
      return "#f59e0b"; // amber — simple plan
    case "auto_subtasks":
      return "#8b5cf6"; // purple — deep plan
    default:
      return "#64748b";
  }
}

// ── Main render ──
export function renderThreads(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Threads</h1>
        <p class="page-subtitle">Conversation threads with status, cause, and message counts</p>
      </div>
    </div>
    <div class="filter-bar" id="threads-filter-bar">
      <div class="filter-section">
        <label class="filter-label">Status</label>
        <select class="filter-select" id="filter-status">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Cause</label>
        <select class="filter-select" id="filter-cause">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Thread ID</label>
        <input class="filter-input" id="filter-thread-id" type="text" placeholder="Thread ID..." />
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="btn-refresh">⟳ Refresh</button>
        <button class="btn btn-secondary" id="btn-reset">✕ Reset</button>
      </div>
    </div>
    <div class="events-count" id="threads-count"></div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Threads</span>
        <span class="events-nav" id="threads-nav">
          <button class="nav-btn" id="prev-page" disabled>← Prev</button>
          <span id="page-info">Page 1</span>
          <button class="nav-btn" id="next-page" disabled>Next →</button>
        </span>
      </div>
      <div class="card-body" id="threads-list">
        <div class="loading">Loading threads</div>
      </div>
      <div class="card-footer" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;padding:0.75rem 1rem;border-top:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <button class="nav-btn" id="prev-page-bottom" disabled>← Prev</button>
        <span id="page-info-bottom">Page 1</span>
        <button class="nav-btn" id="next-page-bottom" disabled>Next →</button>
      </div>
    </div>
  `;

  currentOffset = 0;
  currentStatus = "all";
  currentCause = "all";
  currentThreadId = "";

  applyFiltersFromUrl();

  const threadInput = document.getElementById("filter-thread-id") as HTMLInputElement | null;
  if (threadInput) threadInput.value = currentThreadId;

  void loadFilters();
}

// ── Load filters ──
async function loadFilters(): Promise<void> {
  try {
    const filters = await apiGet<ThreadFilters>("/threads/filters");
    populateFilterControls(filters);
    void loadThreads();
  } catch (e) {
    document.getElementById("threads-list")!.innerHTML =
      `<div class="error-state">Failed to load filters: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function populateFilterControls(filters: ThreadFilters): void {
  const statusSel = document.getElementById("filter-status") as HTMLSelectElement;
  statusSel.innerHTML = '<option value="all">All</option>';
  for (const s of filters.statuses) {
    statusSel.innerHTML += `<option value="${escapeHtml(s)}">${escapeHtml(s.charAt(0).toUpperCase() + s.slice(1))}</option>`;
  }

  const causeSel = document.getElementById("filter-cause") as HTMLSelectElement;
  causeSel.innerHTML = '<option value="all">All</option>';
  for (const c of filters.causes) {
    causeSel.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c.charAt(0).toUpperCase() + c.slice(1))}</option>`;
  }

  // Restore filter values from URL-restored state (set BEFORE enhance)
  statusSel.value = currentStatus;
  causeSel.value = currentCause;

  // Enhance filter selects with custom dropdowns
  enhanceSelect("filter-status");
  enhanceSelect("filter-cause");

  wireFilterEvents();
}

function wireFilterEvents(): void {
  document.getElementById("filter-status")!.addEventListener("change", (e) => {
    currentStatus = (e.target as HTMLSelectElement).value;
    currentOffset = 0;
    void loadThreads();
  });
  document.getElementById("filter-cause")!.addEventListener("change", (e) => {
    currentCause = (e.target as HTMLSelectElement).value;
    currentOffset = 0;
    void loadThreads();
  });
  const threadInput = document.getElementById("filter-thread-id") as HTMLInputElement;
  threadInput.addEventListener("input", () => {
    currentThreadId = threadInput.value.trim();
    currentOffset = 0;
    void loadThreads();
  });
  document.getElementById("btn-refresh")!.addEventListener("click", () => void loadThreads());
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    currentStatus = "all";
    currentCause = "all";
    currentThreadId = "";
    currentOffset = 0;
    const statusSel = document.getElementById("filter-status") as HTMLSelectElement;
    const causeSel = document.getElementById("filter-cause") as HTMLSelectElement;
    const threadInput = document.getElementById("filter-thread-id") as HTMLInputElement;
    statusSel.value = "all";
    causeSel.value = "all";
    threadInput.value = "";
    syncSelectDisplay("filter-status");
    syncSelectDisplay("filter-cause");
    history.replaceState(null, "", window.location.pathname);
    void loadThreads();
  });
  document.getElementById("prev-page")!.addEventListener("click", () => {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - currentLimit);
      void loadThreads();
    }
  });
  document.getElementById("next-page")!.addEventListener("click", () => {
    currentOffset += currentLimit;
    void loadThreads();
  });
  document.getElementById("prev-page-bottom")?.addEventListener("click", () => {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - currentLimit);
      void loadThreads();
    }
  });
  document.getElementById("next-page-bottom")?.addEventListener("click", () => {
    currentOffset += currentLimit;
    void loadThreads();
  });
}

// ── Load threads ──
async function loadThreads(): Promise<void> {
  const listEl = document.getElementById("threads-list")!;
  const countEl = document.getElementById("threads-count")!;
  const prevBtn = document.getElementById("prev-page") as HTMLButtonElement;
  const nextBtn = document.getElementById("next-page") as HTMLButtonElement;
  const pageInfo = document.getElementById("page-info")!;
  const prevBottom = document.getElementById("prev-page-bottom") as HTMLButtonElement;
  const nextBottom = document.getElementById("next-page-bottom") as HTMLButtonElement;
  const pageInfoBottom = document.getElementById("page-info-bottom")!;

  listEl.innerHTML = '<div class="loading">Loading threads</div>';

  try {
    const params = new URLSearchParams();
    params.set("limit", String(currentLimit));
    params.set("offset", String(currentOffset));
    if (currentStatus !== "all") params.set("status", currentStatus);
    if (currentCause !== "all") params.set("cause", currentCause);
    if (currentThreadId) params.set("thread_id", currentThreadId);

    const data = await apiGet<ThreadsResponse>(`/threads?${params.toString()}`);

    const totalPages = Math.ceil(data.total / currentLimit);
    const currentPage = Math.floor(currentOffset / currentLimit) + 1;
    prevBtn.disabled = currentOffset <= 0;
    nextBtn.disabled = currentOffset + currentLimit >= data.total;
    prevBottom.disabled = prevBtn.disabled;
    nextBottom.disabled = nextBtn.disabled;

    const start = data.total > 0 ? currentOffset + 1 : 0;
    const end = Math.min(currentOffset + data.threads.length, data.total);
    countEl.textContent =
      data.total > 0 ? `Showing ${start}–${end} of ${data.total} threads` : "No threads found";
    pageInfo.textContent = data.total > 0 ? `Page ${currentPage} of ${totalPages}` : "";
    pageInfoBottom.textContent = pageInfo.textContent;

    if (data.threads.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No threads match the current filters</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="table-scroll">
        <div class="data-table" role="table">
          <div role="rowgroup">
            <div class="thread-header" role="row">
              <div role="columnheader">ID</div>
              <div role="columnheader">Status</div>
              <div role="columnheader">Cause</div>
              <div role="columnheader">Type</div>
              <div role="columnheader">Subtype</div>
              <div role="columnheader">Channel</div>
              <div role="columnheader">Created</div>
              <div role="columnheader">Plan Mode</div>
              <div role="columnheader" style="text-align:right">Msgs</div>
              <div role="columnheader" class="col-preview">Preview</div>
              <div role="columnheader" style="text-align:right">Time (ms)</div>
              <div role="columnheader" style="text-align:right">Tokens</div>
              <div role="columnheader">Provider/Model</div>
            </div>
          </div>
          <div role="rowgroup">
            ${data.threads.map((row) => renderRow(row)).join("")}
          </div>
        </div>
      </div>
    `;
    // Sync current filters to URL search params
    syncFiltersToUrl();
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load threads: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function planningModeLabel(mode: string): string {
  switch (mode) {
    case "prompt_only":
      return "No Plan";
    case "auto_plan":
      return "Simple Plan";
    case "auto_subtasks":
      return "Plan with Subtasks";
    default:
      return "No Plan";
  }
}

function renderRow(row: ThreadRow): string {
  const preview = row.cause_content_preview
    ? escapeHtml(row.cause_content_preview.slice(0, 100)) +
      (row.cause_content_preview.length > 100 ? "\u2026" : "")
    : "<em>No cause</em>";

  const ts = formatRelativeTime(
    new Date(row.created_at.endsWith("Z") ? row.created_at : row.created_at + "Z"),
  );
  const tokens = (row.input_tokens || 0) + (row.output_tokens || 0);
  const causeCol = causeColor(row.cause);
  const pmCol = planningModeColor(row.planning_mode);

  const typeStr = row.cause_msg_type ? escapeHtml(row.cause_msg_type) : "—";
  const subtypeStr = row.cause_msg_subtype ? escapeHtml(row.cause_msg_subtype) : "—";
  const providerModel =
    row.provider && row.model
      ? escapeHtml(`${row.provider}/${row.model}`)
      : row.provider
        ? escapeHtml(row.provider)
        : row.model
          ? escapeHtml(row.model)
          : "—";

  const url = `/messages?thread_id=${escapeHtml(row.id)}`;

  return `
    <a href="${url}" class="thread-row" role="row">
      <div role="cell"><code style="font-size:0.8rem;color:var(--text-secondary);">#${escapeHtml(row.id)}</code></div>
      <div role="cell"><span class="badge status-badge-${row.status.toLowerCase()}" style="${statusBadgeStyle(row.status)}">${escapeHtml(row.status)}</span></div>
      <div role="cell"><span class="badge" style="--type-color:${causeCol};background:${causeCol}22;border-color:${causeCol}44;color:${causeCol}">${escapeHtml(row.cause)}</span></div>
      <div role="cell" style="font-size:0.78rem;color:var(--text-secondary);">${typeStr}</div>
      <div role="cell" style="font-size:0.78rem;color:var(--text-secondary);">${subtypeStr}</div>
      <div role="cell"><span class="badge" style="${channelStyle(row.channel_closed)}"${row.channel_closed ? ' title="Channel closed"' : ""}>${escapeHtml(row.channel_name)}</span></div>
      <div role="cell" class="cell-timestamp">${ts}</div>
      <div role="cell"><span class="badge" style="--type-color:${pmCol};background:${pmCol}22;border-color:${pmCol}44;color:${pmCol}">${planningModeLabel(row.planning_mode)}</span></div>
      <div role="cell" class="cell-num">${row.msg_count}</div>
      <div role="cell" class="cell-preview">${preview}</div>
      <div role="cell" class="cell-num">${row.duration_ms !== null ? row.duration_ms.toFixed(0) : "—"}</div>
      <div role="cell" class="cell-num">${tokens > 0 ? tokens.toLocaleString() : "—"}</div>
      <div role="cell" style="font-size:0.75rem;color:var(--text-secondary);font-family:monospace;">${providerModel}</div>
    </a>
  `;
}

// ── Utilities ──

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
