import { apiGet, type OverviewRow } from "../lib/api";

export function renderOverview(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Overview</h1>
      <p class="page-subtitle">Recent user messages and processing metrics</p>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Last User Messages</span></div>
      <div class="card-body" id="overview-table"><div class="loading">Loading...</div></div>
    </div>
  `;
  void loadOverview();
}

async function loadOverview(): Promise<void> {
  const tableEl = document.getElementById("overview-table")!;
  try {
    const data = await apiGet<OverviewRow[]>("/overview");
    if (data.length === 0) {
      tableEl.innerHTML = '<div class="empty-state">No messages found</div>';
      return;
    }
    tableEl.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Channel</th>
              <th>Timestamp</th>
              <th>Thread ID</th>
              <th>Thread Count</th>
              <th>Message Preview</th>
              <th>Time (ms)</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            ${data.map((row) => renderRow(row)).join("")}
          </tbody>
        </table>
      </div>
    `;
    // Wire up row clicks
    tableEl.querySelectorAll(".overview-row").forEach((el) => {
      el.addEventListener("click", () => {
        const threadId = (el as HTMLElement).getAttribute("data-thread-id");
        if (threadId) {
          const url = `/messages?thread_id=${encodeURIComponent(threadId)}`;
          history.pushState({}, "", url);
          // Import router dynamically to avoid circular deps
          void import("../lib/router").then(({ router }) => {
            router.go("messages");
            // Update sidebar active state to "messages"
            document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
              n.classList.toggle("active", n.getAttribute("data-route") === "messages");
            });
          });
        }
      });
    });
  } catch (e) {
    tableEl.innerHTML = `<div class="error-state">Failed to load: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderRow(row: OverviewRow): string {
  const preview = row.content_preview
    ? escapeHtml(row.content_preview.slice(0, 100)) + (row.content_preview.length > 100 ? "\u2026" : "")
    : "<em>Empty</em>";
  const ts = formatDateTime(row.created_at);
  const tokens = (row.prompt_tokens || 0) + (row.completion_tokens || 0);
  return `
    <tr class="overview-row" data-thread-id="${escapeHtml(row.thread_id || "")}" style="cursor:pointer;">
      <td><span class="badge status-badge-${row.status ? row.status.toLowerCase() : "unknown"}">${escapeHtml(row.status || "unknown")}</span></td>
      <td><span class="badge badge-neutral">${escapeHtml(row.channel_name || "\u2014")}</span></td>
      <td class="cell-timestamp">${ts}</td>
      <td class="cell-mono">${escapeHtml(row.thread_id ? truncateMiddle(row.thread_id, 12) : "\u2014")}</td>
      <td class="cell-num">${row.thread_count}</td>
      <td class="cell-preview">${preview}</td>
      <td class="cell-num">${row.processing_time_ms !== null ? row.processing_time_ms.toFixed(0) : "\u2014"}</td>
      <td class="cell-num">${tokens > 0 ? tokens.toLocaleString() : "\u2014"}</td>
    </tr>
  `;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + "\u2026" + str.slice(str.length - half);
}
