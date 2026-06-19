import { apiGet } from "../lib/api";

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
  msg_count: number;
  cause_content_preview: string | null;
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
    </div>
  `;

  currentOffset = 0;
  currentStatus = "all";
  currentCause = "all";
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
  document.getElementById("btn-refresh")!.addEventListener("click", () => void loadThreads());
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    currentStatus = "all";
    currentCause = "all";
    currentOffset = 0;
    (document.getElementById("filter-status") as HTMLSelectElement).value = "all";
    (document.getElementById("filter-cause") as HTMLSelectElement).value = "all";
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
}

// ── Load threads ──
async function loadThreads(): Promise<void> {
  const listEl = document.getElementById("threads-list")!;
  const countEl = document.getElementById("threads-count")!;
  const prevBtn = document.getElementById("prev-page") as HTMLButtonElement;
  const nextBtn = document.getElementById("next-page") as HTMLButtonElement;
  const pageInfo = document.getElementById("page-info")!;

  listEl.innerHTML = '<div class="loading">Loading threads</div>';

  try {
    const params = new URLSearchParams();
    params.set("limit", String(currentLimit));
    params.set("offset", String(currentOffset));
    if (currentStatus !== "all") params.set("status", currentStatus);
    if (currentCause !== "all") params.set("cause", currentCause);

    const data = await apiGet<ThreadsResponse>(`/threads?${params.toString()}`);

    const totalPages = Math.ceil(data.total / currentLimit);
    const currentPage = Math.floor(currentOffset / currentLimit) + 1;
    prevBtn.disabled = currentOffset <= 0;
    nextBtn.disabled = currentOffset + currentLimit >= data.total;

    const start = data.total > 0 ? currentOffset + 1 : 0;
    const end = Math.min(currentOffset + data.threads.length, data.total);
    countEl.textContent =
      data.total > 0 ? `Showing ${start}–${end} of ${data.total} threads` : "No threads found";
    pageInfo.textContent = data.total > 0 ? `Page ${currentPage} of ${totalPages}` : "";

    if (data.threads.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No threads match the current filters</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Cause</th>
              <th>Channel</th>
              <th>Created</th>
              <th>Msgs</th>
              <th>Preview</th>
              <th>Time (ms)</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            ${data.threads.map((row) => renderRow(row)).join("")}
          </tbody>
        </table>
      </div>
    `;

    // Wire row clicks — navigate to messages filtered by thread_id
    listEl.querySelectorAll(".thread-row").forEach((el) => {
      el.addEventListener("click", () => {
        const threadId = (el as HTMLElement).getAttribute("data-thread-id");
        if (threadId) {
          const url = `/messages?thread_id=${encodeURIComponent(threadId)}`;
          history.pushState({}, "", url);
          void import("../lib/router").then(({ router }) => {
            router.go("messages");
            document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
              n.classList.toggle("active", n.getAttribute("data-route") === "messages");
            });
          });
        }
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load threads: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
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

  return `
    <tr class="thread-row" data-thread-id="${escapeHtml(row.id)}" style="cursor:pointer;">
      <td><span class="badge status-badge-${row.status.toLowerCase()}" style="${statusBadgeStyle(row.status)}">${escapeHtml(row.status)}</span></td>
      <td><span class="badge" style="--type-color:${causeCol};background:${causeCol}22;border-color:${causeCol}44;color:${causeCol}">${escapeHtml(row.cause)}</span></td>
      <td><span class="badge badge-neutral">${escapeHtml(row.channel_name)}</span></td>
      <td class="cell-timestamp">${ts}</td>
      <td class="cell-num">${row.msg_count}</td>
      <td class="cell-preview">${preview}</td>
      <td class="cell-num">${row.duration_ms !== null ? row.duration_ms.toFixed(0) : "\u2014"}</td>
      <td class="cell-num">${tokens > 0 ? tokens.toLocaleString() : "\u2014"}</td>
    </tr>
  `;
}

// ── Utilities ──
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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
