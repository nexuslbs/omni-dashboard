import { escapeHtml } from "../lib/helpers";

interface HistoryRow {
  id: number;
  kanban_task_id: string;
  action: string;
  initial_board: string | null;
  final_board: string | null;
  created_at: string | null;
}

/** Render a human-readable description of a history entry. */
function formatAction(row: HistoryRow): string {
  const action = row.action;
  const initial = row.initial_board;
  const final = row.final_board;

  switch (action) {
    case "created":
      return `created in ${escapeHtml(initial || "Backlog")}`;
    case "archived":
      return `was archived`;
    case "unarchived":
      return `was unarchived`;
    case "deleted":
      return `was deleted`;
    case "moved":
      if (initial && final && initial !== final) {
        return `moved from ${escapeHtml(initial)} to ${escapeHtml(final)}`;
      } else if (final) {
        return `moved to ${escapeHtml(final)}`;
      } else if (initial) {
        return `moved from ${escapeHtml(initial)}`;
      }
      return "moved";
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

export function renderKanbanHistory(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban History</h1>
        <p class="page-subtitle">Historical log of kanban task actions \u2014 most recent first</p>
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
          <option value="archived">Archived</option>
          <option value="unarchived">Unarchived</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="kh-btn-refresh">\u27f3 Refresh</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">History Log</span>
      </div>
      <div class="card-body" id="kh-list">
        <div class="loading">Loading history...</div>
      </div>
    </div>
  `;

  // Wire filter events (SPA-safe: re-wired on every render)
  const taskInput = document.getElementById("kh-filter-task-id") as HTMLInputElement;
  const actionSelect = document.getElementById("kh-filter-action") as HTMLSelectElement;
  const refreshBtn = document.getElementById("kh-btn-refresh") as HTMLButtonElement;

  if (taskInput) {
    taskInput.addEventListener("input", () => {
      clearTimeout((taskInput as any)._debounce);
      (taskInput as any)._debounce = setTimeout(() => void loadHistory(), 300);
    });
  }
  if (actionSelect) {
    actionSelect.addEventListener("change", () => void loadHistory());
  }
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => void loadHistory());
  }

  void loadHistory();
}

async function loadHistory(): Promise<void> {
  const listEl = document.getElementById("kh-list")!;
  const taskId = (document.getElementById("kh-filter-task-id") as HTMLInputElement).value.trim();
  const action = (document.getElementById("kh-filter-action") as HTMLSelectElement).value;

  try {
    const params = new URLSearchParams();
    params.set("limit", "200");
    params.set("offset", "0");
    if (taskId) params.set("task_id", taskId);
    if (action) params.set("action", action);

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

    const rows = res.data;
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
              <th style="text-align:left;padding:0.5rem 0.75rem;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));color:var(--text-muted);font-size:0.78rem;font-weight:500;">Task</th>
              <th style="text-align:left;padding:0.5rem 0.75rem;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));color:var(--text-muted);font-size:0.78rem;font-weight:500;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr style="border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.03));">
                <td style="padding:0.5rem 0.75rem;font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;">${escapeHtml(formatTimestamp(r.created_at))}</td>
                <td style="padding:0.5rem 0.75rem;font-size:0.82rem;color:var(--text-primary);"><code style="font-size:0.78rem;color:var(--text-secondary);">${escapeHtml(r.kanban_task_id)}</code></td>
                <td style="padding:0.5rem 0.75rem;font-size:0.82rem;color:var(--text-primary);">${formatAction(r)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load history: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}
