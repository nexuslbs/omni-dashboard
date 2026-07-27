import { escapeHtml } from "./helpers";
import hljs from "highlight.js";
import type { Message } from "./api";
import { renderMarkdown } from "./markdown";

// ── hljs kept for JSON formatting (configured in markdown.ts) ──

// ── Shared message card rendering ──
// Used by both /messages and /schedule/<id> pages

// ── Role badge colors ──
const ROLE_COLORS: Record<string, string> = {
  cause: "#3b82f6",
  user: "#3b82f6",
  agent: "#10b981",
  system: "#f59e0b",
  tool: "#8b5cf6",
};

function roleColor(role: string): string {
  return ROLE_COLORS[role.toLowerCase()] || "#64748b";
}

// ── Role display label: map "user" to "cause" ──
function roleDisplayLabel(role: string): string {
  return role === "user" ? "cause" : role;
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

function truncateMiddle(str: unknown, maxLen: number): string {
  const s = str == null ? "" : String(str);
  if (s.length <= maxLen) return s;
  const half = Math.floor((maxLen - 3) / 2);
  return s.slice(0, half) + "…" + s.slice(s.length - half);
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
export function renderMessageCard(msg: Message): string {
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
        ${msg.thread_id ? `<a href="/messages?thread_id=${encodeURIComponent(msg.thread_id)}" class="ev-thread-link" title="Thread ID">T${escapeHtml(truncateMiddle(msg.thread_id, 12))}</a>` : ""}
        ${msg.thread_sequence !== null && msg.thread_sequence !== undefined ? `<span class="ev-seq-badge" title="Sequence">#${msg.thread_sequence}</span>` : ""}
        ${msg.iteration_number !== null && msg.iteration_number !== undefined ? `<span class="ev-iter-badge" title="LLM Iteration">⟳ ${msg.iteration_number}</span>` : ""}
        ${channelStr ? `<span class="badge badge-neutral" title="Channel ID">${channelStr}</span>` : ""}
        <span class="agent-badge" title="Role: ${escapeHtml(role)}" style="--agent-color:${rColor};background:${rColor}22;border-color:${rColor}44;color:${rColor}">
          ${escapeHtml(roleDisplayLabel(role))}
        </span>
        <span class="event-type-badge" title="Status: ${escapeHtml(msg.thread_status || msg.status || "unknown")}" style="${statusBadgeStyle(msg.thread_status || msg.status)}">
          ${escapeHtml(msg.thread_status || msg.status || "unknown")}
        </span>
        ${msg.type ? `<span class="event-type-badge" title="Type: ${escapeHtml(msg.type)}" style="--type-color:${typeColor(msg.type)};background:${typeColor(msg.type)}22;border-color:${typeColor(msg.type)}44;color:${typeColor(msg.type)}">${msg.type}</span>` : ""}
        ${msg.subtype ? `<span class="event-subtype" title="Subtype: ${escapeHtml(msg.subtype)}" style="font-size:0.8rem;color:var(--text-muted);font-style:italic;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${msg.subtype}</span>` : ""}
        <span class="event-row-meta" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.8rem;color:var(--text-muted)">
          ${msg.provider ? `<span class="ev-provider" title="Provider">${escapeHtml(msg.provider)}</span>` : ""}
          ${msg.provider && msg.model ? `<span style="color:var(--text-muted);opacity:0.4">·</span>` : ""}
          ${msg.model ? `<span class="ev-model" title="Model">${escapeHtml(msg.model)}</span>` : ""}
          ${(msg.provider || msg.model) && (msg.processing_time_ms !== null || tokens > 0) ? `<span style="color:var(--text-muted);opacity:0.4">·</span>` : ""}
          ${msg.processing_time_ms !== null ? `<span title="Processing time">${msg.processing_time_ms.toFixed(0)}ms</span>` : ""}
          ${tokens > 0 ? `<span title="Token count">${tokens.toLocaleString()} tokens</span>` : ""}
        </span>
        <span class="ev-time" title="${escapeHtml(tsFull)}">${ts}</span>
      </div>
      <div class="event-content-area">
        <div class="ev-content-text${hasMore && !isEmpty ? " has-more" : ""}" data-msg-id="${msg.id}" data-view-raw="${btoa(encodeURIComponent(contentRaw))}">${isEmpty ? "<em>Empty</em>" : content}</div>
        ${
          hasMore && !isEmpty
            ? `<div class="ev-content-actions">
          <button class="ev-expand-btn">Show more</button>
          <button class="ev-view-btn ev-view-md" data-msg-id="${msg.id}">See as Markdown</button>
          <button class="ev-view-btn ev-view-json" data-msg-id="${msg.id}">See as JSON</button>
          <button class="ev-view-json-plus-md" data-msg-id="${msg.id}">See as JSON + Markdown</button>
        </div>`
            : ""
        }
      </div>
    </div>
  `;
}

// ── Flatten parsed JSON to markdown with key[index] notation ──
function flattenJsonToMarkdown(data: unknown): string {
  const lines: string[] = [];

  function walk(value: unknown, prefix: string = ""): void {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const elem = value[i] as unknown;
        if (typeof elem === "object" && elem !== null && !Array.isArray(elem)) {
          // Object inside array: suffix each key with [i]
          for (const [key, sub] of Object.entries(elem)) {
            const path = `${prefix ? prefix + "." : ""}${key}[${i}]`;
            if (typeof sub === "object" && sub !== null) {
              walk(sub, path);
            } else {
              lines.push(`# ${path}\n\n${String(sub)}`);
            }
          }
        } else {
          const path = `${prefix}[${i}]`;
          if (typeof elem === "object" && elem !== null) {
            walk(elem, path);
          } else {
            lines.push(`# ${path}\n\n${String(elem)}`);
          }
        }
      }
    } else if (typeof value === "object" && value !== null) {
      for (const [key, sub] of Object.entries(value as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof sub === "object" && sub !== null) {
          walk(sub, path);
        } else {
          lines.push(`# ${path}\n\n${String(sub)}`);
        }
      }
    } else if (prefix) {
      lines.push(`# ${prefix}\n\n${String(value)}`);
    } else {
      lines.push(String(value));
    }
  }

  walk(data);
  return lines.join("\n\n");
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

  // ── "See as Markdown" / "See as JSON" view buttons ──
  container.querySelectorAll(".ev-view-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const btnEl = e.currentTarget as HTMLElement;
      const msgId = btnEl.getAttribute("data-msg-id");
      if (!msgId) return;
      const card = btnEl.closest(".event-row")!;
      const contentDiv = card.querySelector(`.ev-content-text[data-msg-id="${msgId}"]`) as HTMLElement | null;
      if (!contentDiv) return;

      const rawB64 = contentDiv.getAttribute("data-view-raw") || "";
      let rawContent: string;
      try {
        rawContent = decodeURIComponent(atob(rawB64));
      } catch {
        rawContent = rawB64;
      }
      const currentView = contentDiv.getAttribute("data-view") || "original";
      const targetView = btnEl.classList.contains("ev-view-md") ? "md" : "json";

      if (currentView === targetView) {
        // Already in this view: switch back to original
        contentDiv.innerHTML = escapeHtml(rawContent);
        contentDiv.setAttribute("data-view", "original");
        btnEl.textContent = btnEl.classList.contains("ev-view-md") ? "See as Markdown" : "See as JSON";
        card.querySelectorAll(".ev-view-btn").forEach((b) => {
          (b as HTMLElement).textContent = b.classList.contains("ev-view-md")
            ? "See as Markdown"
            : "See as JSON";
        });
        return;
      }

      // Render the view
      if (targetView === "md") {
        const rendered = renderMarkdown(rawContent);
        // Enhance code blocks
        const wrapper = document.createElement("div");
        wrapper.innerHTML = rendered;
        enhanceCodeBlocks(wrapper);
        contentDiv.innerHTML = `<div class="markdown-content">${wrapper.innerHTML}</div>`;
        contentDiv.setAttribute("data-view", "md");
        if (typeof enhanceCodeBlocks === "function") {
          enhanceCodeBlocks(card as HTMLElement);
        }
      } else {
        // JSON view
        let formatted: string;
        try {
          const parsed = JSON.parse(rawContent);
          formatted = JSON.stringify(parsed, null, 2);
        } catch {
          // Not valid JSON: show as pretty text
          formatted = rawContent;
        }
        const escaped = escapeHtml(formatted);
        contentDiv.innerHTML = `<pre style="background:transparent;padding:0;margin:0;overflow-x:auto;font-size:0.82rem;line-height:1.5;color:var(--text-primary, #e2e8f0);">${escaped}</pre>`;
        contentDiv.setAttribute("data-view", "json");
        // Try syntax highlighting
        try {
          const highlighted = hljs.highlight(formatted, { language: "json" }).value;
          contentDiv.innerHTML = `<pre style="background:transparent;padding:0;margin:0;overflow-x:auto;font-size:0.82rem;line-height:1.5;"><code class="hljs language-json">${highlighted}</code></pre>`;
        } catch {
          // fallback to plain pre
        }
      }

      // Update buttons
      btnEl.textContent = "Show original";
      card.querySelectorAll(".ev-view-btn").forEach((b) => {
        const other = b as HTMLElement;
        if (other !== btnEl) {
          other.textContent = other.classList.contains("ev-view-md") ? "See as Markdown" : "See as JSON";
        }
      });
    });
  });

  // ── "See as JSON + Markdown" button ──
  container.querySelectorAll(".ev-view-json-plus-md").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const btnEl = e.currentTarget as HTMLElement;
      const msgId = btnEl.getAttribute("data-msg-id");
      if (!msgId) return;
      const card = btnEl.closest(".event-row")!;
      const contentDiv = card.querySelector(`.ev-content-text[data-msg-id="${msgId}"]`) as HTMLElement | null;
      if (!contentDiv) return;

      const rawB64 = contentDiv.getAttribute("data-view-raw") || "";
      let rawContent: string;
      try {
        rawContent = decodeURIComponent(atob(rawB64));
      } catch {
        rawContent = rawB64;
      }

      const currentView = contentDiv.getAttribute("data-view") || "original";

      if (currentView === "json+md") {
        contentDiv.innerHTML = escapeHtml(rawContent);
        contentDiv.setAttribute("data-view", "original");
        btnEl.textContent = "See as JSON + Markdown";
        // Reset sibling view buttons
        card.querySelectorAll(".ev-view-btn").forEach((b) => {
          const other = b as HTMLElement;
          other.textContent = other.classList.contains("ev-view-md") ? "See as Markdown" : "See as JSON";
        });
        return;
      }

      try {
        const parsed = JSON.parse(rawContent);
        const md = flattenJsonToMarkdown(parsed);
        const rendered = renderMarkdown(md);
        const wrapper = document.createElement("div");
        wrapper.innerHTML = rendered;
        enhanceCodeBlocks(wrapper);
        contentDiv.innerHTML = `<div class="markdown-content">${wrapper.innerHTML}</div>`;
        contentDiv.setAttribute("data-view", "json+md");
        btnEl.textContent = "Show original";
        // Reset sibling view buttons
        card.querySelectorAll(".ev-view-btn").forEach((b) => {
          const other = b as HTMLElement;
          other.textContent = other.classList.contains("ev-view-md") ? "See as Markdown" : "See as JSON";
        });
      } catch {
        contentDiv.innerHTML = `<em style="color:var(--text-muted)">Content is not valid JSON</em>`;
        contentDiv.setAttribute("data-view", "json+md");
        btnEl.textContent = "Show original";
      }
    });
  });
}

// ── Enhance code blocks with copy buttons (same as explorer.ts) ──
function enhanceCodeBlocks(container: HTMLElement): void {
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".code-actions")) return;
    const code = pre.querySelector("code");
    if (!code) return;
    const actions = document.createElement("div");
    actions.className = "code-actions";
    const langLabel = document.createElement("span");
    langLabel.className = "code-lang";
    const cls = Array.from(code.classList).find((c) => c.startsWith("language-"));
    langLabel.textContent = cls ? cls.replace("language-", "") : "";
    if (langLabel.textContent) actions.appendChild(langLabel);
    const copyBtn = document.createElement("button");
    copyBtn.className = "code-copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(code.textContent || "");
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 2000);
      } catch {
        copyBtn.textContent = "Failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 2000);
      }
    });
    actions.appendChild(copyBtn);
    pre.style.position = "relative";
    pre.prepend(actions);
  });
}
