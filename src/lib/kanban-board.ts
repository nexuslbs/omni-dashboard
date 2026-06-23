/**
 * Kanban board rendering — columns, cards, drag-and-drop.
 * Extracted from src/pages/kanban.ts
 */
import { apiGet, type KanbanBoardResponse, type KanbanTask } from "./api";

// ── Status labels used across kanban modules ──
export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  ready: "Ready",
  running: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

// ── Column color classes ──
function columnColorClass(id: string): string {
  const map: Record<string, string> = {
    backlog: "kanban-col-neutral",
    todo: "kanban-col-purple",
    ready: "kanban-col-orange",
    running: "kanban-col-cyan",
    review: "kanban-col-sky",
    done: "kanban-col-emerald",
    blocked: "kanban-col-rose",
  };
  return map[id] || "kanban-col-neutral";
}

// ── Status badge CSS class ──
export function statusBadge(status: string): string {
  const map: Record<string, string> = {
    backlog: "badge-neutral",
    todo: "badge-purple",
    ready: "badge-warning",
    running: "badge-cyan",
    review: "badge-blue",
    done: "badge-success",
    blocked: "badge-error",
  };
  return map[status] || "badge-neutral";
}

// ── Time formatting ──
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatTaskDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ── Render helpers ──

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function renderColumn(id: string, title: string, tasks: KanbanTask[]): string {
  return `
    <div class="kanban-column ${columnColorClass(id)}">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${title}</span>
        <span class="kanban-col-count">${tasks.length}</span>
      </div>
      <div class="kanban-col-body" data-column="${id}">
        ${
          tasks.length === 0
            ? `<div class="kanban-empty">No tasks</div>`
            : tasks.map((t) => renderTaskCard(t)).join("")
        }
      </div>
    </div>
  `;
}

export function renderTaskCard(task: KanbanTask): string {
  const priorityLabel = task.priority >= 3 ? "High" : task.priority >= 1 ? "Med" : "Low";
  const priorityClass =
    task.priority >= 3
      ? "kanban-priority-high"
      : task.priority >= 1
        ? "kanban-priority-med"
        : "kanban-priority-low";
  const timeAgo = formatRelativeTime(task.created_at);

  return `
    <div class="kanban-card" data-task-id="${task.id}">
      <div class="kanban-card-top">
        <span class="kanban-priority ${priorityClass}">${priorityLabel}</span>
        <span class="kanban-task-id" style="font-size:0.7rem;color:var(--text-muted);font-family:monospace;">#${task.display_id || task.id}</span>
      </div>
      <div class="kanban-card-title">${escapeHtml(task.title)}</div>
      ${task.body ? `<div class="kanban-card-body">${escapeHtml(task.body).slice(0, 120)}${task.body.length > 120 ? "..." : ""}</div>` : ""}
      <div class="kanban-card-footer">
        ${task.assignee ? `<span class="kanban-assignee">@${escapeHtml(task.assignee)}</span>` : ""}
        <span class="kanban-time">${timeAgo}</span>
      </div>
    </div>
  `;
}

export async function moveTask(taskId: string, status: string): Promise<void> {
  const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId) + "/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Load and render the full kanban board into the DOM.
 * Handles column layout, card rendering, drag-and-drop wiring.
 */
export async function loadBoard(showArchived: boolean): Promise<void> {
  const boardEl = document.getElementById("kanban-board")!;
  const summaryEl = document.getElementById("kanban-summary")!;
  const countEl = document.getElementById("kanban-count")!;
  try {
    const board = await apiGet<KanbanBoardResponse>(
      "/kanban/board" + (showArchived ? "?show_archived=true" : ""),
    );
    if (board.columns.length === 0 || board.total === 0) {
      boardEl.innerHTML = `<div class="empty-state">No tasks yet</div>`;
      countEl.textContent = "";
      return;
    }

    countEl.textContent = `${board.total} tasks`;
    summaryEl.style.display = "flex";

    boardEl.innerHTML = `
      <div class="kanban-columns">
        ${board.columns.map((col) => renderColumn(col.id, col.title, col.tasks)).join("")}
      </div>
    `;

    // Only enable native drag on non-touch devices
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Wire up card click handlers for navigation
    document.querySelectorAll(".kanban-card").forEach((card) => {
      if (!isTouchDevice) {
        (card as HTMLElement).draggable = true;
      }
      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button, select, input, textarea")) return;
        const taskId = card.getAttribute("data-task-id");
        if (taskId) {
          history.pushState({}, "", `/kanban/${taskId}`);
          // Dynamic import to avoid circular dependency
          void import("../lib/router").then(({ router }) => router.go(`kanban/${taskId}`));
        }
      });
    });

    if (!isTouchDevice) {
      // Wire up drag start
      document.querySelectorAll(".kanban-card").forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          if ((e.target as HTMLElement).closest("button, select, input, textarea")) {
            e.preventDefault();
            return;
          }
          const taskId = (e.currentTarget as HTMLElement).getAttribute("data-task-id");
          if (taskId && (e as DragEvent).dataTransfer) {
            (e as DragEvent).dataTransfer!.setData("text/plain", taskId);
            (e as DragEvent).dataTransfer!.effectAllowed = "move";
          }
        });
      });

      // Wire up drag-and-drop columns
      document.querySelectorAll(".kanban-col-body").forEach((col) => {
        col.addEventListener("dragover", (e) => {
          e.preventDefault();
          if ((e as DragEvent).dataTransfer) {
            (e as DragEvent).dataTransfer!.dropEffect = "move";
          }
        });
        col.addEventListener("drop", async (e) => {
          e.preventDefault();
          const taskId = (e as DragEvent).dataTransfer?.getData("text/plain");
          if (!taskId) return;
          const colBody = (e.currentTarget as HTMLElement).closest(".kanban-col-body");
          const newStatus = colBody?.getAttribute("data-column");
          if (!newStatus) return;

          // Determine insert position based on drop Y coordinate
          const cards = Array.from(colBody!.querySelectorAll(".kanban-card"))
            .map((card) => ({
              el: card as HTMLElement,
              rect: (card as HTMLElement).getBoundingClientRect(),
            }))
            .sort((a, b) => a.rect.top - b.rect.top);

          const dropY = (e as DragEvent).clientY;
          let insertIndex = cards.length;
          for (let i = 0; i < cards.length; i++) {
            const midY = cards[i].rect.top + cards[i].rect.height / 2;
            if (dropY < midY) {
              insertIndex = i;
              break;
            }
          }

          try {
            const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId) + "/position", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newStatus, position: insertIndex }),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => "Unknown error");
              console.error("Position move failed:", `${res.status}: ${text}`);
            }
            void loadBoard(showArchived);
          } catch (err) {
            console.error("Drop move failed:", err);
            void loadBoard(showArchived);
          }
        });
      });
    }
  } catch (e) {
    boardEl.innerHTML = `<div class="error-state">Failed to load board: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}
