import { showToast } from "../lib/utils";
import { apiGet } from "../lib/api";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";
import { escapeHtml, formatApiError } from "../lib/helpers";

// ── Types ──
interface ThreadRow {
  id: string;
  status: string;
  cause: string;
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
  channel: string;
  channel_closed?: boolean;
  msg_count: number;
  iterations: number;
  cause_content_preview: string | null;
  plan: boolean;
  cause_msg_type: string | null;
  cause_msg_subtype: string | null;
  parent_id: number | null;
  merged_into_thread_id: number | null;
  task_id: string | null;
  schedule_task_id: string | null;
  workflow_step: string | null;
  workflow: string | null;
  kanban_board: string | null;
  hook_id: string | null;
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
let currentParentId = "";

// ── URL search param sync ──
function syncFiltersToUrl(): void {
  const params = new URLSearchParams();
  if (currentStatus !== "all") params.set("status", currentStatus);
  if (currentCause !== "all") params.set("cause", currentCause);
  if (currentThreadId) params.set("thread_id", currentThreadId);
  if (currentParentId) params.set("parent_id", currentParentId);
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
  const parentId = p.get("parent_id");
  if (parentId) currentParentId = parentId;
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
              : s === "merged"
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
      <div class="filter-section">
        <label class="filter-label">Parent ID</label>
        <input class="filter-input" id="filter-parent-id" type="text" placeholder="Parent ID..." />
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
  currentParentId = "";

  applyFiltersFromUrl();

  const threadInput = document.getElementById("filter-thread-id") as HTMLInputElement | null;
  if (threadInput) threadInput.value = currentThreadId;
  const parentInput = document.getElementById("filter-parent-id") as HTMLInputElement | null;
  if (parentInput) parentInput.value = currentParentId;

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
      `<div class="error-state">Failed to load filters: ${formatApiError(e)}</div>`;
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
  const parentInput = document.getElementById("filter-parent-id") as HTMLInputElement;
  parentInput.addEventListener("input", () => {
    currentParentId = parentInput.value.trim();
    currentOffset = 0;
    void loadThreads();
  });
  document.getElementById("btn-refresh")!.addEventListener("click", () => void loadThreads());
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    currentStatus = "all";
    currentCause = "all";
    currentThreadId = "";
    currentParentId = "";
    currentOffset = 0;
    const statusSel = document.getElementById("filter-status") as HTMLSelectElement;
    const causeSel = document.getElementById("filter-cause") as HTMLSelectElement;
    const threadInput = document.getElementById("filter-thread-id") as HTMLInputElement;
    const parentInput = document.getElementById("filter-parent-id") as HTMLInputElement;
    statusSel.value = "all";
    causeSel.value = "all";
    threadInput.value = "";
    parentInput.value = "";
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
    // omniagent /threads filters by `id` (numeric thread id), not `thread_id`
    if (currentThreadId && /^\d+$/.test(currentThreadId)) params.set("id", currentThreadId);
    if (currentParentId && /^\d+$/.test(currentParentId)) params.set("parent_id", currentParentId);

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
        <div class="data-table threads-table" role="table">
          <div role="rowgroup">
            <div class="thread-header" role="row">
              <div role="columnheader">ID</div>
              <div role="columnheader">Details</div>
              <div role="columnheader">Status</div>
              <div role="columnheader">Channel</div>
              <div role="columnheader">Created</div>
              <div role="columnheader">Provider/Model</div>
              <div role="columnheader" style="text-align:right">Msgs</div>
              <div role="columnheader" style="text-align:right">LLM Calls</div>
              <div role="columnheader" class="col-preview">Preview</div>
              <div role="columnheader" style="text-align:right">Time (ms)</div>
              <div role="columnheader" style="text-align:right">Tokens</div>
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

    // Wire thread stop buttons
    document.querySelectorAll(".thread-stop-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const threadId = btn.getAttribute("data-thread-id");
        if (!threadId) return;
        if (!confirm("Stop this thread?")) return;
        const btnEl = btn as HTMLButtonElement;
        const originalText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = "Stopping...";
        try {
          const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/stop`, {
            method: "POST",
          });
          if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
          }
          showToast("Thread stopped", "success");
          void loadThreads();
        } catch (err) {
          showToast("Failed: " + (err instanceof Error ? err.message : "Unknown"), "error");
        } finally {
          btnEl.disabled = false;
          btnEl.textContent = originalText;
        }
      });
    });
    // Wire merged-into links (skipped thread -> target running thread)
    document.querySelectorAll(".merged-into-link").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = el.getAttribute("data-target");
        if (target) {
          window.location.href = `/threads?thread_id=${encodeURIComponent(target)}`;
        }
      });
    });
    // Wire "Show details" / "Hide details" toggles
    document.querySelectorAll(".thread-details-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = (btn as HTMLElement).closest(".thread-item");
        if (!item) return;
        const open = item.classList.toggle("open");
        (btn as HTMLButtonElement).textContent = open ? "Hide details" : "Show details";
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load threads: ${formatApiError(e)}</div>`;
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
  const cachePct =
    (row.input_tokens || 0) > 0 && (row.cached_tokens || 0) > 0
      ? Math.min(100, Math.round(((row.cached_tokens || 0) / (row.input_tokens || 0)) * 100))
      : null;
  const parentIdStr = row.parent_id
    ? `<span class="event-type-badge" title="Parent ID: ${escapeHtml(String(row.parent_id))}" style="--type-color:#64748b;background:rgba(100,116,139,0.12);border-color:rgba(100,116,139,0.25);color:#94a3b8;font-size:0.7rem;display:inline-flex;flex-direction:column;align-items:center;line-height:1.3;"><span style="font-size:0.65rem;opacity:0.7;">Parent:</span><span style="font-weight:600;">#${escapeHtml(String(row.parent_id))}</span></span>`
    : "";

  const url = `/messages?thread_id=${escapeHtml(row.id)}`;

  return `
    <div class="thread-item" data-thread-id="${escapeHtml(row.id)}">
      <a href="${url}" class="thread-row" role="row">
        <div role="cell" style="text-align:center;"><code style="font-size:0.8rem;color:var(--text-secondary);">#${escapeHtml(row.id)}</code>${row.parent_id ? `<br><div style="display:flex;flex-direction:column;align-items:center;gap:0.125rem;">${parentIdStr}</div>` : ""}</div>
        <div role="cell"><button type="button" class="thread-details-toggle" title="Show thread details">Show details</button></div>
        <div role="cell"><div style="display:flex;flex-direction:column;align-items:center;gap:0.25rem;"><span class="badge status-badge-${row.status.toLowerCase()}" style="${statusBadgeStyle(row.status)}">${escapeHtml(row.status)}</span>${row.status === "pending" || row.status === "processing" ? `<button class="thread-stop-btn" data-thread-id="${escapeHtml(row.id)}" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:6px;padding:0.3rem 0.85rem;cursor:pointer;font-size:0.78rem;line-height:1.4;font-weight:500;" title="Stop this thread">Stop</button>` : ""}${mergedIntoBadge(row)}</div></div>
        <div role="cell"><span class="badge" style="${channelStyle(row.channel_closed)}"${row.channel_closed ? ' title="Channel closed"' : ""}>${escapeHtml(row.channel)}</span></div>
        <div role="cell" class="cell-timestamp">${ts}</div>
        <div role="cell" style="font-size:0.8rem;color:var(--text-muted)">
          <div style="display:flex;flex-direction:column;gap:0.125rem;">
            ${row.provider ? `<span class="ev-provider" title="Provider" style="line-height:1.3;">${escapeHtml(row.provider)}</span>` : ""}
            ${row.model ? `<span class="ev-model" title="Model" style="line-height:1.3;">${escapeHtml(row.model)}</span>` : ""}
            ${!row.provider && !row.model ? "-" : ""}
          </div>
        </div>
        <div role="cell" class="cell-num">${row.msg_count}</div>
        <div role="cell" class="cell-num">${row.iterations}</div>
        <div role="cell" class="cell-preview">${preview}</div>
        <div role="cell" class="cell-num">${row.duration_ms !== null ? row.duration_ms.toFixed(0) : "-"}</div>
        <div role="cell" class="cell-num">${tokens > 0 ? tokens.toLocaleString() + (cachePct !== null ? ` (${cachePct}%)` : "") : "-"}</div>
      </a>
      <div class="thread-details">
        <div class="thread-details-box">${threadDetailsContent(row)}</div>
      </div>
    </div>
  `;
}

/**
 * Details box content for a thread row: Cause, Type, Subtype, Plan Mode,
 * plus kanban board / workflow / workflow role for kanban-originated threads
 * and a task link for kanban / hook / cron threads.
 */
function threadDetailsContent(row: ThreadRow): string {
  const causeCol = causeColor(row.cause);
  const pmCol = row.plan ? "#22c55e" : "#64748b";
  const typeStr = row.cause_msg_type ? escapeHtml(row.cause_msg_type) : "-";
  const subtypeStr = row.cause_msg_subtype ? escapeHtml(row.cause_msg_subtype) : "-";

  const kanbanExtra = row.task_id
    ? `<div class="thread-detail-item"><span class="thread-detail-label">Kanban board</span><span class="thread-detail-value">${row.kanban_board ? escapeHtml(row.kanban_board) : "<em>None</em>"}</span></div>
      <div class="thread-detail-item"><span class="thread-detail-label">Workflow</span><span class="thread-detail-value">${row.workflow ? `<code style="font-size:0.8rem;">${escapeHtml(row.workflow)}</code>` : "<em>None</em>"}</span></div>
      <div class="thread-detail-item"><span class="thread-detail-label">Workflow role</span><span class="thread-detail-value">${escapeHtml(workflowRole(row.workflow_step))}</span></div>`
    : "";

  const taskLink = threadTaskLink(row);

  return `
    <div class="thread-detail-item"><span class="thread-detail-label">Cause</span><span class="thread-detail-value"><span class="badge" style="--type-color:${causeCol};background:${causeCol}22;border-color:${causeCol}44;color:${causeCol}">${escapeHtml(row.cause)}</span></span></div>
    <div class="thread-detail-item"><span class="thread-detail-label">Type</span><span class="thread-detail-value">${typeStr === "-" ? typeStr : `<span class="event-type-badge" title="Type: ${typeStr}" style="--type-color:${seq0TypeColor(row.cause_msg_type || "")};background:${seq0TypeColor(row.cause_msg_type || "")}22;border-color:${seq0TypeColor(row.cause_msg_type || "")}44;color:${seq0TypeColor(row.cause_msg_type || "")}">${typeStr}</span>`}</span></div>
    <div class="thread-detail-item"><span class="thread-detail-label">Subtype</span><span class="thread-detail-value">${subtypeStr}</span></div>
    <div class="thread-detail-item"><span class="thread-detail-label">Plan Mode</span><span class="thread-detail-value"><span class="badge" style="--type-color:${pmCol};background:${pmCol}22;border-color:${pmCol}44;color:${pmCol}">${row.plan ? "On" : "Off"}</span></span></div>
    <div class="thread-detail-item"><span class="thread-detail-label">Tokens (total input)</span><span class="thread-detail-value"><code style="font-size:0.8rem;">${fmtTokens(row.input_tokens)}</code></span></div>
    <div class="thread-detail-item"><span class="thread-detail-label">Cache hit (cached input)</span><span class="thread-detail-value"><code style="font-size:0.8rem;">${fmtTokens(row.cached_tokens)}</code></span></div>
    <div class="thread-detail-item"><span class="thread-detail-label">Cache miss (non-cached input)</span><span class="thread-detail-value"><code style="font-size:0.8rem;">${fmtTokens(Math.max((row.input_tokens || 0) - (row.cached_tokens || 0), 0))}</code></span></div>
    <div class="thread-detail-item"><span class="thread-detail-label">Output tokens</span><span class="thread-detail-value"><code style="font-size:0.8rem;">${fmtTokens(row.output_tokens)}</code></span></div>
    ${kanbanExtra}
    ${taskLink ? `<div class="thread-detail-item"><span class="thread-detail-label">Task</span><span class="thread-detail-value">${taskLink}</span></div>` : ""}
  `;
}

/** Map a kanban workflow step to its role name. */
function workflowRole(step: string | null): string {
  switch (step) {
    case "running":
      return "executor";
    case "testing":
      return "tester";
    case "review":
      return "reviewer";
    default:
      return step || "unknown";
  }
}

/** Link to the originating kanban / schedule / hook task, when applicable. */
function threadTaskLink(row: ThreadRow): string {
  if (row.task_id) {
    return `<a class="thread-task-link" href="/kanban/${encodeURIComponent(row.task_id)}">Kanban task ${escapeHtml(row.task_id)}</a>`;
  }
  if (row.schedule_task_id) {
    return `<a class="thread-task-link" href="/schedules/${encodeURIComponent(row.schedule_task_id)}">Schedule ${escapeHtml(row.schedule_task_id)}</a>`;
  }
  if (row.hook_id) {
    return `<a class="thread-task-link" href="/hooks">Hook ${escapeHtml(row.hook_id)}</a>`;
  }
  return "";
}

/** For skipped/merged threads whose prompt was appended into another running
 * thread (sub-prompt merging), render a link to that target thread on the
 * Threads page.
 */
function mergedIntoBadge(row: ThreadRow): string {
  if ((row.status !== "skipped" && row.status !== "merged") || !row.merged_into_thread_id) {
    return "";
  }
  const target = String(row.merged_into_thread_id);
  return `<button type="button" class="merged-into-link" data-target="${escapeHtml(target)}" title="Merged into thread #${escapeHtml(target)}" style="background:none;border:none;padding:0;margin:0;color:#38bdf8;cursor:pointer;font-size:0.75rem;line-height:1.4;font-weight:500;text-decoration:underline;">→ merged into thread #${escapeHtml(target)}</button>`;
}

// ── Seq-0 type badge colors ──
const SEQ0_TYPE_COLORS: Record<string, string> = {
  Cause: "#3b82f6",
  cron: "#f59e0b",
  kanban: "#8b5cf6",
  message: "#64748b",
};

function seq0TypeColor(type: string): string {
  return SEQ0_TYPE_COLORS[type.toLowerCase()] || "#64748b";
}

// ── Utilities ──

function fmtTokens(n: number | null | undefined): string {
  const v = typeof n === "number" && n > 0 ? n : 0;
  return v > 0 ? v.toLocaleString() : "-";
}

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
