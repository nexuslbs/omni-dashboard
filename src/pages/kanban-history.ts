import { escapeHtml } from "../lib/helpers";
import { enhanceSelect } from "../lib/dropdown";
import { STATUS_LABELS, statusBadge } from "../lib/kanban-board";

interface HistoryRow {
  id: number;
  kanban_task_id: string;
  action: string;
  initial_board: string | null;
  final_board: string | null;
  previous_values: any;
  created_at: string | null;
}

// ── Filter state ──
interface FilterState {
  task_id: string;
  action: string;
}

let currentFilters: FilterState = { task_id: "", action: "" };

// ── URL search param sync ──
function syncFiltersToUrl(): void {
  const params = new URLSearchParams();
  if (currentFilters.task_id) params.set("task_id", currentFilters.task_id);
  if (currentFilters.action) params.set("action", currentFilters.action);
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function applyFiltersFromUrl(): void {
  const p = new URLSearchParams(window.location.search);
  const taskId = p.get("task_id");
  if (taskId) currentFilters.task_id = taskId;
  const action = p.get("action");
  if (action) currentFilters.action = action;
}

// ── Action display helpers ──

/** Render a status label with its badge style. */
function statusSpan(boardId: string | null): string {
  if (!boardId) return "<em>none</em>";
  const label = STATUS_LABELS[boardId] || boardId;
  const cls = statusBadge(boardId);
  return `<span class="badge ${cls}" style="font-size:0.75rem;padding:0.125rem 0.45rem;">${escapeHtml(label)}</span>`;
}

/** Render a linkable task ID with status-colored border. */
function taskIdLink(taskId: string, status: string | null): string {
  const cls = statusBadge(status || "backlog");
  return `<a href="/kanban/${encodeURIComponent(taskId)}" class="task-id-link ${cls}-link" style="display:inline-flex;align-items:center;gap:0.25rem;text-decoration:none;color:var(--text-primary);font-family:monospace;font-size:0.78rem;border:1px solid var(--glass-border);border-radius:4px;padding:0.125rem 0.4rem;transition:border-color 0.15s;" data-task-id="${escapeHtml(taskId)}">#${escapeHtml(taskId)}</a>`;
}

/** Build the Event description based on action + board fields. */
function formatEvent(action: string, initial: string | null, final: string | null): string {
  switch (action) {
    case "created":
      return `was Created ${final ? `in ${statusSpan(final)}` : ""}`;
    case "archived":
      return `was Archived ${initial ? `from ${statusSpan(initial)}` : ""}`;
    case "unarchived":
      return `was Unarchived ${final ? `to ${statusSpan(final)}` : ""}`;
    case "deleted":
      return `was Deleted ${initial ? `from ${statusSpan(initial)}` : ""}`;
    case "moved":
      if (initial && final && initial !== final) {
        return `was Moved from ${statusSpan(initial)} to ${statusSpan(final)}`;
      } else if (final) {
        return `was Moved to ${statusSpan(final)}`;
      } else if (initial) {
        return `was Moved from ${statusSpan(initial)}`;
      }
      return "was Moved";
    case "edited":
      return "was Edited";
    default:
      return escapeHtml(action);
  }
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "\u2014";
  try {
    const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

/** Open a modal with formatted JSON content. */
function openJsonModal(title: string, jsonObj: any): void {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:flex-start;justify-content:center;padding-top:8vh;";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const panel = document.createElement("div");
  panel.style.cssText =
    "background:#1a1a2e;border-radius:8px;max-width:700px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));max-height:70vh;display:flex;flex-direction:column;";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid var(--border-primary,rgba(255,255,255,0.08));";
  header.innerHTML = `<span style="font-size:1rem;font-weight:600;">${escapeHtml(title)}</span>
    <button class="modal-close-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;padding:0.25rem;">&#x2715;</button>`;

  const body = document.createElement("div");
  body.style.cssText = "padding:1rem 1.25rem;overflow-y:auto;flex:1;";
  const pre = document.createElement("pre");
  pre.style.cssText =
    "background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:var(--radius-sm);padding:0.75rem;font-size:0.78rem;color:var(--accent-cyan);white-space:pre-wrap;word-break:break-word;line-height:1.5;margin:0;font-family:monospace;";
  pre.textContent = JSON.stringify(jsonObj, null, 2);
  body.appendChild(pre);

  panel.appendChild(header);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  header.querySelector(".modal-close-btn")!.addEventListener("click", () => overlay.remove());
  // Close on Escape
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", keyHandler);
    }
  };
  document.addEventListener("keydown", keyHandler);
}

// ── Main render ──

export function renderKanbanHistory(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban History</h1>
        <p class="page-subtitle">Historical log of kanban task actions — most recent first</p>
      </div>
    </div>
    <div class="filter-bar" id="kh-filter-bar">
      <div class="filter-section">
        <label class="filter-label">Task ID</label>
        <input class="filter-input" id="kh-filter-task-id" type="text" placeholder="task_build-flask-blog..." />
      </div>
      <div class="filter-section">
        <label class="filter-label">Action</label>
        <select class="filter-select" id="kh-filter-action">
          <option value="">All</option>
          <option value="created">Created</option>
          <option value="moved">Moved</option>
          <option value="edited">Edited</option>
          <option value="archived">Archived</option>
          <option value="unarchived">Unarchived</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="kh-btn-refresh">↻ Refresh</button>
        <button class="btn btn-secondary" id="kh-btn-reset">✕ Reset</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Events</span>
      </div>
      <div class="card-body" id="kh-list">
        <div class="loading">Loading history...</div>
      </div>
    </div>
  `;

  // Reset state
  currentFilters = { task_id: "", action: "" };
  applyFiltersFromUrl();

  // Wire filter events
  const taskInput = document.getElementById("kh-filter-task-id") as HTMLInputElement;
  const actionSelect = document.getElementById("kh-filter-action") as HTMLSelectElement;
  const refreshBtn = document.getElementById("kh-btn-refresh") as HTMLButtonElement;
  const resetBtn = document.getElementById("kh-btn-reset") as HTMLButtonElement;

  if (taskInput) {
    taskInput.value = currentFilters.task_id;
    taskInput.addEventListener("input", () => {
      clearTimeout((taskInput as any)._debounce);
      (taskInput as any)._debounce = setTimeout(() => {
        currentFilters.task_id = taskInput.value.trim();
        syncFiltersToUrl();
        void loadHistory();
      }, 300);
    });
  }

  if (actionSelect) {
    actionSelect.value = currentFilters.action;
    actionSelect.addEventListener("change", () => {
      currentFilters.action = actionSelect.value;
      syncFiltersToUrl();
      void loadHistory();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => void loadHistory());
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      currentFilters = { task_id: "", action: "" };
      if (taskInput) taskInput.value = "";
      if (actionSelect) actionSelect.value = "";
      history.replaceState(null, "", window.location.pathname);
      void loadHistory();
    });
  }

  // Enhance select with custom dropdown
  enhanceSelect("kh-filter-action");

  void loadHistory();
}

// ── Load history ──

async function loadHistory(): Promise<void> {
  const listEl = document.getElementById("kh-list")!;

  try {
    const params = new URLSearchParams();
    params.set("limit", "200");
    params.set("offset", "0");
    if (currentFilters.task_id) params.set("task_id", currentFilters.task_id);
    if (currentFilters.action) params.set("action", currentFilters.action);

    const response = await fetch(`/api/kanban/history?${params.toString()}`);
    const text = await response.text();
    let res: any;
    try {
      res = JSON.parse(text);
    } catch {
      console.error("Non-JSON response:", text);
      res = { success: false, data: [] };
    }

    if (!res.success || !res.data) {
      listEl.innerHTML = '<div class="error-state">Failed to load history</div>';
      return;
    }

    const rows: HistoryRow[] = res.data;
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No history entries match the current filters</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="table-scroll">
        <table class="history-table" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding:0.5rem 0.75rem;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));color:var(--text-muted);font-size:0.78rem;font-weight:500;">Timestamp</th>
              <th style="text-align:left;padding:0.5rem 0.75rem;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));color:var(--text-muted);font-size:0.78rem;font-weight:500;">Event</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => {
                  const taskStatus = r.final_board || r.initial_board || "backlog";
                  return `<tr style="border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.03));">
                <td style="padding:0.5rem 0.75rem;font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;vertical-align:middle;">${escapeHtml(formatTimestamp(r.created_at))}</td>
                <td style="padding:0.5rem 0.75rem;font-size:0.82rem;color:var(--text-primary);vertical-align:middle;">
                  <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.4rem;">
                    ${taskIdLink(r.kanban_task_id, taskStatus)}
                    <span style="color:var(--text-secondary);font-size:0.82rem;">${formatEvent(r.action, r.initial_board, r.final_board)}</span>
                    ${r.previous_values ? `<button class="kh-json-btn" style="background:none;border:none;cursor:pointer;color:var(--accent-cyan);font-size:0.9rem;padding:0 0.25rem;line-height:1;" title="Show previous values as JSON">📋</button>` : ""}
                  </div>
                </td>
              </tr>`;
                },
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // Wire JSON view buttons
    listEl.querySelectorAll(".kh-json-btn").forEach((btn, i) => {
      btn.addEventListener("click", () => {
        const row = rows[i];
        if (row.previous_values) {
          openJsonModal("Previous Values", row.previous_values);
        }
      });
    });

    // Wire task ID links for SPA navigation
    listEl.querySelectorAll(".task-id-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const href = (e.currentTarget as HTMLAnchorElement).getAttribute("href");
        if (!href) return;
        const taskId = href.replace("/kanban/", "");
        history.pushState({}, "", href);
        import("../lib/router").then((mod) => mod.router.go(`kanban/${taskId}`));
      });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load history: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}
