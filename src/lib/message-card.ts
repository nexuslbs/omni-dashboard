import { escapeHtml } from "./helpers";

// ── Shared message card rendering ──
// Used by both /messages and /schedule/<id> pages

// ── Role badge colors ──
const ROLE_COLORS: Record<string, string> = {
  user: "#3b82f6",
  agent: "#10b981",
  system: "#f59e0b",
  tool: "#8b5cf6",
};

function roleColor(role: string): string {
  return ROLE_COLORS[role.toLowerCase()] || "#64748b";
}

// ── Type badge colors ──
const TYPE_COLORS: Record<string, string> = {
  prompt: "#3b82f6",
  response: "#10b981",
  reasoning: "#f59e0b",
  tool: "#8b5cf6",
  tool_output: "#a78bfa",
  iteration: "#64748b",
  delegate_result: "#f43f5e",
  skill: "#06b6d4",
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] || "#64748b";
}

// ── Status badge style ──
function statusBadgeStyle(status: string | null): string {
  const s = (status || "unknown").toLowerCase();
  const color =
    s === "completed" || s === "success"
      ? "#10b981"
      : s === "failed" || s === "error"
        ? "#f43f5e"
        : s === "processing"
          ? "#f59e0b"
          : s === "pending"
            ? "#3b82f6"
            : s === "skipped"
              ? "#64748b"
              : "#64748b";
  return `--type-color:${color};background:${color}22;border-color:${color}44;color:${color}`;
}

// ── Utilities ──

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + "…" + str.slice(str.length - half);
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

// ── Render a single message as a card block ──
export function renderMessageCard(msg: any): string {
  const role = msg.role || "unknown";
  const rColor = roleColor(role);
  const contentRaw = msg.content || "";
  const isEmpty = !contentRaw.trim();
  const content = contentRaw ? escapeHtml(contentRaw) : "";
  const hasMore = !isEmpty;
  const ts = formatRelativeTime(
    new Date(msg.created_at.endsWith("Z") ? msg.created_at : msg.created_at + "Z"),
  );
  const tsFull = new Date(
    msg.created_at.endsWith("Z") ? msg.created_at : msg.created_at + "Z",
  ).toLocaleString();
  const tokens = msg.token_usage
    ? (msg.token_usage.prompt_tokens || 0) + (msg.token_usage.completion_tokens || 0)
    : 0;
  const channelStr = msg.channel_name ? escapeHtml(msg.channel_name) : "";

  return `
    <div class="event-row" data-msg-id="${msg.id}">
      <div class="event-row-header">
        <span class="ev-id-badge" title="Message ID">#${msg.id}</span>
        ${channelStr ? `<span class="badge badge-neutral" title="Channel ID">${channelStr}</span>` : ""}
        <span class="agent-badge" title="Role: ${escapeHtml(role)}" style="--agent-color:${rColor};background:${rColor}22;border-color:${rColor}44;color:${rColor}">
          ${escapeHtml(role)}
        </span>
        <span class="event-type-badge" title="Status: ${escapeHtml(msg.status || "unknown")}" style="${statusBadgeStyle(msg.status)}">
          ${escapeHtml(msg.status || "unknown")}
        </span>
        ${msg.type ? `<span class="event-type-badge" title="Type: ${escapeHtml(msg.type)}" style="--type-color:${typeColor(msg.type)};background:${typeColor(msg.type)}22;border-color:${typeColor(msg.type)}44;color:${typeColor(msg.type)}">${msg.type}</span>` : ""}
        ${msg.subtype ? `<span class="event-subtype" title="Subtype: ${escapeHtml(msg.subtype)}" style="font-size:0.8rem;color:var(--text-muted);font-style:italic;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${msg.subtype}</span>` : ""}
        <span class="event-row-meta" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.8rem;color:var(--text-muted)">
          ${msg.provider ? `<span class="ev-provider" title="Provider">${escapeHtml(msg.provider)}</span>` : ""}
          ${msg.provider && msg.model ? `<span style="color:var(--text-muted);opacity:0.4">·</span>` : ""}
          ${msg.model ? `<span class="ev-model" title="Model">${escapeHtml(msg.model)}</span>` : ""}
          ${(msg.provider || msg.model) && (msg.thread_id || msg.processing_time_ms !== null || tokens > 0) ? `<span style="color:var(--text-muted);opacity:0.4">·</span>` : ""}
          ${msg.thread_id ? `<a href="/?page=threads" class="ev-thread-link" data-thread-id="${escapeHtml(msg.thread_id)}" title="Thread ID">${escapeHtml(truncateMiddle(msg.thread_id, 12))}</a>` : ""}
          ${msg.processing_time_ms !== null ? `<span title="Processing time">${msg.processing_time_ms.toFixed(0)}ms</span>` : ""}
          ${tokens > 0 ? `<span title="Token count">${tokens.toLocaleString()} tokens</span>` : ""}
        </span>
        <span class="ev-time" title="${escapeHtml(tsFull)}">${ts}</span>
      </div>
      <div class="event-content-area">
        <div class="ev-content-text${hasMore && !isEmpty ? " has-more" : ""}">${isEmpty ? "<em>Empty</em>" : content}</div>
        ${hasMore && !isEmpty ? `<button class="ev-expand-btn">Show more</button>` : ""}
      </div>
    </div>
  `;
}

// ── Wire up expand/collapse toggles for rendered cards ──
export function wireMessageCardToggles(container: HTMLElement): void {
  container.querySelectorAll(".ev-expand-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const card = (e.currentTarget as HTMLElement).closest(".event-row")!;
      const isExpanded = card.classList.toggle("expanded");
      (e.currentTarget as HTMLElement).textContent = isExpanded ? "Show less" : "Show more";
    });
  });
}
