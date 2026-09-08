/**
 * Kanban board rendering: columns, cards, drag-and-drop.
 * Extracted from src/pages/kanban.ts
 */
import { apiGet, type KanbanBoardResponse, type KanbanTask } from "./api";
import { boardMetaLabel, fetchBoards, getStoredBoard, setStoredBoard } from "./kanban-boards";
import { formatApiError } from "../lib/helpers";
import { showToast } from "./utils";

// ── Status labels used across kanban modules ──
export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  running: "In Progress",
  testing: "Testing",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

// ── Column color classes ──
function columnColorClass(id: string): string {
  const map: Record<string, string> = {
    backlog: "kanban-col-neutral",
    todo: "kanban-col-purple",
    running: "kanban-col-cyan",
    testing: "kanban-col-orange",
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
    running: "badge-cyan",
    testing: "badge-warning",
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
  if (!dateStr) return "-";
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

// ── Collapsible status panels: per-column collapse state (session) ──
// Collapsed panels hide their task-list area, leaving the header (chevron,
// title, count). State lives in a module Set so every loadBoard re-render
// keeps it, and is mirrored to sessionStorage so it also survives same-tab
// reloads; each panel toggles independently.
const COLLAPSE_LS_KEY = "kanban-col-collapsed";
let collapsedCols: Set<string> | null = null;

function collapseState(): Set<string> {
  if (collapsedCols) return collapsedCols;
  collapsedCols = new Set<string>();
  try {
    const raw = window.sessionStorage.getItem(COLLAPSE_LS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === "string") collapsedCols.add(id);
      }
    }
  } catch {
    /* storage unavailable: keep the in-memory set */
  }
  return collapsedCols;
}

function persistCollapseState(): void {
  try {
    window.sessionStorage.setItem(COLLAPSE_LS_KEY, JSON.stringify([...collapseState()]));
  } catch {
    /* ignore */
  }
}

/** Flip one panel's collapsed state and mirror it into the live DOM. */
export function toggleColumnCollapsed(id: string): void {
  const state = collapseState();
  const col = document.querySelector(`.kanban-column[data-col="${CSS.escape(id)}"]`);
  if (!col) return;
  const header = col.querySelector(".kanban-col-header");
  const btn = header?.querySelector(".kanban-col-toggle");
  const label = col.querySelector(".kanban-col-title")?.textContent || id;
  if (col.classList.contains("collapsed")) {
    state.delete(id);
    col.classList.remove("collapsed");
    btn?.setAttribute("aria-expanded", "true");
    btn?.setAttribute("aria-label", `Collapse ${label}`);
  } else {
    state.add(id);
    col.classList.add("collapsed");
    btn?.setAttribute("aria-expanded", "false");
    btn?.setAttribute("aria-label", `Expand ${label}`);
  }
  persistCollapseState();
}

// FontAwesome classic solid chevron-down (viewBox 0 0 512 512); a collapsed
// panel rotates it 180deg via CSS so it reads as chevron-up.
const CHEVRON_DOWN_SVG = `<svg viewBox="0 0 512 512" aria-hidden="true"><path d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"/></svg>`;
export function renderColumn(id: string, title: string, tasks: KanbanTask[]): string {
  const collapsed = collapseState().has(id);
  return `
    <div class="kanban-column ${columnColorClass(id)}${collapsed ? " collapsed" : ""}" data-col="${id}">
      <div class="kanban-col-header">
        <button type="button" class="kanban-col-toggle" aria-expanded="${!collapsed}" aria-label="${collapsed ? `Expand ${escapeHtml(title)}` : `Collapse ${escapeHtml(title)}`}" title="${collapsed ? "Expand panel" : "Collapse panel"}">
          ${CHEVRON_DOWN_SVG}
        </button>
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

// ── Tag colors (deterministic per tag name) ──
/** Stable hue [0,360) derived from the tag name (djb2 hash). */
const TAG_REGISTRY: Record<string, string> = {};

/** Prime the tag->color map from the tag registry (GET /api/kanban/tags). */
export function primeTagColors(registry: { name: string; color?: string | null }[]): void {
  const next: Record<string, string> = {};
  for (const t of Array.isArray(registry) ? registry : []) {
    if (t && t.name) next[String(t.name)] = typeof t.color === "string" ? t.color : "";
  }
  for (const k of Object.keys(TAG_REGISTRY)) if (!(k in next)) delete TAG_REGISTRY[k];
  for (const k of Object.keys(next)) TAG_REGISTRY[k] = next[k];
}

function hexToHue(hex: string): string | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return String(Math.round(h));
}

/** Hue [0,360) for a tag: registry color when set, else deterministic hash. */
export function tagHue(tag: string): string {
  const hex = TAG_REGISTRY[tag];
  if (hex) {
    const fromHex = hexToHue(hex);
    if (fromHex !== null) return fromHex;
  }
  let h = 5381;
  for (let i = 0; i < tag.length; i++) {
    h = ((h << 5) + h + tag.charCodeAt(i)) | 0;
  }
  return String(Math.abs(h) % 360);
}

/** Backwards-compatible alias (hash hue). */
export function tagColor(tag: string): string {
  return tagHue(tag);
}

export function renderTagChips(tags: string[]): string {
  const list = Array.isArray(tags) ? tags : [];
  if (list.length === 0) return "";
  return `<div class="kanban-card-tags" style="margin-top:0.3rem;display:flex;flex-wrap:wrap;gap:0.2rem;">${list
    .map((t) => {
      const hue = tagHue(t);
      return `<span class="kanban-tag" style="display:inline-block;background:hsl(${hue},55%,24%);color:hsl(${hue},95%,80%);border:1px solid hsl(${hue},60%,42%);border-radius:10px;padding:0.05rem 0.5rem;font-size:0.68rem;font-weight:600;line-height:1.4;">${escapeHtml(t)}</span>`;
    })
    .join("")}</div>`;
}

function renderTaskTags(task: KanbanTask): string {
  return renderTagChips(Array.isArray(task.tags) ? task.tags : []);
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
        <span class="kanban-task-id" style="font-size:0.7rem;color:var(--text-muted);font-family:monospace;">${task.display_id || task.id}</span>
      </div>
      <div class="kanban-card-title">${escapeHtml(task.title)}</div>
      ${renderTaskTags(task)}
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

// ── Drag state: column the card currently being dragged came from ──
// A cross-column drop must land the moved task at the TOP of the destination
// column; a same-column drop keeps the drop position. The source column is
// recorded on dragstart and consumed by the drop handler.
let dragSourceColumn: string | null = null;

// Drag/click coordination: after a drag interaction the browser can still
// dispatch a click on the dragged card (Chromium for drags released without
// crossing the drag threshold; Firefox and Safari dispatch one after every
// dragend). That click must not be treated as an open-card click: it would
// navigate away from the board. A drag arms a short-lived suppression window
// that consumes the first click after it.
let suppressClickAfterDrag = false;
// Pointer-intent tracking for sub-threshold releases: a mousedown plus a small
// movement that never crosses the browser's drag threshold still fires a click
// on mouseup. Track it so that click is consumed too, while genuine clicks
// (no movement) keep opening the task detail page.
let mouseDragIntent = false;
let mouseStartX = 0;
let mouseStartY = 0;

function armClickSuppression(): void {
  suppressClickAfterDrag = true;
  window.setTimeout(() => {
    suppressClickAfterDrag = false;
  }, 400);
}

/** Board key the UI is currently showing: URL ?board= wins, then the stored board. */
function currentBoardKey(): string | null {
  const urlBoard = new URLSearchParams(window.location.search).get("board");
  return urlBoard && urlBoard !== "" ? urlBoard : getStoredBoard();
}

/**
 * Load and render the full kanban board into the DOM.
 * Handles column layout, card rendering, drag-and-drop, and touch drag.
 */
export async function loadBoard(
  showArchived: boolean,
  boardKey: string | null = null,
  tagFilter?: string,
): Promise<void> {
  // A reload after a card move may omit the board key; stay on the current
  // board (URL ?board= wins, then the last visited board) instead of falling
  // back to the "choose a board" prompt.
  if (!boardKey) boardKey = currentBoardKey();
  // Tag filter: the page keeps it in the URL (?tag=), so a reload after a
  // card move or a board switch preserves it automatically. A caller-provided
  // filter wins over the URL value.
  if (tagFilter === undefined) {
    tagFilter = new URLSearchParams(window.location.search).get("tag") || "";
  }
  const tag = tagFilter.trim();
  const boardEl = document.getElementById("kanban-board")!;
  const summaryEl = document.getElementById("kanban-summary")!;
  const countEl = document.getElementById("kanban-count")!;
  try {
    // No board selected but boards exist (boards.yml present): show a prompt
    // to choose or create one instead of the board view.
    if (!boardKey) {
      const boards = await fetchBoards();
      if (boards.length > 0) {
        summaryEl.style.display = "flex";
        countEl.textContent = "";
        boardEl.innerHTML = `
          <div class="empty-state" style="text-align:center;padding:2.5rem;">
            <div style="font-size:1.05rem;margin-bottom:0.75rem;color:var(--text-primary);">Select a board to view its tasks</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;">
              ${boards
                .map((b) => {
                  const meta = boardMetaLabel(b.board);
                  return `<button class="board-choice-btn" data-board="${escapeHtml(b.key)}" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">${escapeHtml(b.key)}${
                    meta
                      ? `<div style="font-size:0.7rem;color:var(--text-muted);font-weight:400;margin-top:0.25rem;">${escapeHtml(meta)}</div>`
                      : ""
                  }</button>`;
                })
                .join("")}
            </div>
            <div style="color:var(--text-muted);font-size:0.8rem;margin-top:0.75rem;">…or create a new board with the “+ New Board” button above.</div>
          </div>`;
        boardEl.querySelectorAll(".board-choice-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const b = (btn as HTMLElement).getAttribute("data-board");
            if (!b) return;
            setStoredBoard(b);
            history.replaceState(null, "", `/kanban?board=${encodeURIComponent(b)}`);
            void loadBoard(showArchived, b);
          });
        });
        return;
      }
    }
    // Ask the API for archived tasks too when "Show archived" is active:
    // the server excludes archived tasks by default.
    const tasks = await apiGet<KanbanTask[]>(
      boardKey
        ? `/kanban/tasks?board=${encodeURIComponent(boardKey)}${showArchived ? "&show_archived=true" : ""}`
        : `/kanban/tasks${showArchived ? "?show_archived=true" : ""}`,
    );
    // Archived filter: default (Unarchived) shows ONLY non-archived tasks of
    // the chosen board; "Show archived" shows ONLY archived tasks. Filtering
    // happens here on the archived flag - not merely on the URL.
    // Tag filter: AND-combined with the archived filter. Matching is exact
    // (case-sensitive) against the task's tag list; an empty tag means no tag
    // restriction, so the archived filter alone decides the shown set.
    const visibleTasks = tasks
      .filter((t: KanbanTask) => (showArchived ? t.archived === true : !t.archived))
      .filter((t: KanbanTask) => !tag || (Array.isArray(t.tags) && t.tags.includes(tag)));
    const KANBAN_COLUMNS: { id: string; title: string }[] = [
      { id: "backlog", title: "Backlog" },
      { id: "todo", title: "Todo" },
      { id: "running", title: "In Progress" },
      { id: "testing", title: "Testing" },
      { id: "review", title: "Review" },
      { id: "blocked", title: "Blocked" },
      { id: "done", title: "Done" },
    ];
    const columns = KANBAN_COLUMNS.map((col) => ({
      id: col.id,
      title: col.title,
      tasks: visibleTasks.filter((t: KanbanTask) => t.status === col.id),
    }));
    const board: KanbanBoardResponse = { columns, total: visibleTasks.length };
    if (board.columns.length === 0 || board.total === 0) {
      boardEl.innerHTML = `<div class="empty-state">${
        showArchived ? "No archived tasks" : "No tasks yet"
      }${tag ? ` with tag "${escapeHtml(tag)}"` : ""}</div>`;
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

    // Collapse/expand chevrons: each panel toggles independently; state is
    // kept in the module set + sessionStorage, so it survives re-renders.
    boardEl.querySelectorAll(".kanban-col-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const colEl = (e.currentTarget as HTMLElement).closest(".kanban-column");
        const colId = colEl?.getAttribute("data-col");
        if (colId) toggleColumnCollapsed(colId);
      });
    });
    // Wire up card click handlers for navigation
    document.querySelectorAll(".kanban-card").forEach((card) => {
      (card as HTMLElement).draggable = true;
      card.addEventListener("click", (e) => {
        // A drag that ends with a release on or near the card can surface as a
        // click (Chromium for sub-threshold drags; Firefox/Safari after any
        // dragend). Consume it so the board view is not left.
        if (suppressClickAfterDrag || mouseDragIntent) {
          suppressClickAfterDrag = false;
          mouseDragIntent = false;
          return;
        }
        if ((e.target as HTMLElement).closest("button, select, input, textarea")) return;
        const taskId = card.getAttribute("data-task-id");
        if (taskId) {
          history.pushState({}, "", `/kanban/${taskId}`);
          // Dynamic import to avoid circular dependency
          void import("../lib/router").then(({ router }) => router.go(`kanban/${taskId}`));
        }
      });
    });

    // ── Touch-based drag-and-drop (mobile support) ──
    let touchDragTaskId: string | null = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let isTouchDragging = false;
    let touchMoved = false;

    document.querySelectorAll(".kanban-card").forEach((card) => {
      card.addEventListener(
        "touchstart",
        (e) => {
          if ((e.target as HTMLElement).closest("button, select, input, textarea")) return;
          const te = e as TouchEvent;
          const touch = te.touches[0];
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
          touchDragTaskId = card.getAttribute("data-task-id");
          isTouchDragging = false;
          touchMoved = false;
        },
        { passive: true },
      );

      card.addEventListener(
        "touchmove",
        (e) => {
          if (!touchDragTaskId) return;
          const te = e as TouchEvent;
          const touch = te.touches[0];
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          const dist = Math.hypot(dx, dy);
          // Only treat as drag if horizontal movement dominates (not scroll)
          if (dist > 15 && Math.abs(dx) > Math.abs(dy) && !isTouchDragging) {
            isTouchDragging = true;
          }
          // ANY movement while touching is drag intent: the release must not
          // be treated as an open-card tap. 2 px is a jitter tolerance so a
          // zero-movement tap still opens the task detail page.
          if (dist > 2) {
            touchMoved = true;
          }
          if (isTouchDragging) {
            e.preventDefault();
            // Highlight column under finger
            document.querySelectorAll(".kanban-col-body").forEach((col) => {
              const rect = col.getBoundingClientRect();
              if (
                touch.clientX >= rect.left &&
                touch.clientX <= rect.right &&
                touch.clientY >= rect.top &&
                touch.clientY <= rect.bottom
              ) {
                (col as HTMLElement).style.background = "rgba(139, 92, 246, 0.08)";
              } else {
                (col as HTMLElement).style.background = "";
              }
            });
          }
        },
        { passive: false },
      );

      card.addEventListener(
        "touchend",
        (e) => {
          if (!touchDragTaskId) return;
          const te = e as TouchEvent;
          const touch = te.changedTouches[0];
          // A touch drag (started or completed) can still surface a
          // synthesized click; suppress it so the board view is kept.
          if (isTouchDragging || touchMoved) armClickSuppression();
          if (isTouchDragging) {
            // Find column under the release point
            const dropEl = document.elementFromPoint(touch.clientX, touch.clientY);
            const colBody = dropEl?.closest(".kanban-col-body");
            const newStatus = colBody?.getAttribute("data-column");
            if (newStatus && touchDragTaskId) {
              const id = touchDragTaskId;
              touchDragTaskId = null;
              isTouchDragging = false;
              // Reset highlights
              document.querySelectorAll(".kanban-col-body").forEach((col) => {
                (col as HTMLElement).style.background = "";
              });
              void moveTask(id, newStatus)
                .then(() => {
                  showToast(`Task moved to ${STATUS_LABELS[newStatus] || newStatus}`, "success");
                  void loadBoard(showArchived, currentBoardKey());
                })
                .catch(() => {
                  showToast("Failed to move task", "error");
                  void loadBoard(showArchived, currentBoardKey());
                });
              return;
            }
          }
          // Reset
          document.querySelectorAll(".kanban-col-body").forEach((col) => {
            (col as HTMLElement).style.background = "";
          });
          touchDragTaskId = null;
          isTouchDragging = false;
        },
        { passive: true },
      );
    });

    // ── Desktop drag-and-drop ──
    // Wire up drag start
    document.querySelectorAll(".kanban-card").forEach((card) => {
      card.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest("button, select, input, textarea")) return;
        mouseStartX = (e as MouseEvent).clientX;
        mouseStartY = (e as MouseEvent).clientY;
        mouseDragIntent = false;
      });
      card.addEventListener("mousemove", (e) => {
        if (mouseDragIntent) return;
        const dx = (e as MouseEvent).clientX - mouseStartX;
        const dy = (e as MouseEvent).clientY - mouseStartY;
        if (Math.hypot(dx, dy) > 2) {
          mouseDragIntent = true;
        }
      });
      card.addEventListener("dragstart", (e) => {
        if ((e.target as HTMLElement).closest("button, select, input, textarea")) {
          e.preventDefault();
          return;
        }
        armClickSuppression();
        const taskId = (e.currentTarget as HTMLElement).getAttribute("data-task-id");
        if (taskId && (e as DragEvent).dataTransfer) {
          (e as DragEvent).dataTransfer!.setData("text/plain", taskId);
          (e as DragEvent).dataTransfer!.effectAllowed = "move";
        }
        // Remember the source column: a cross-column drop must land the moved
        // task at the TOP of the destination column (not at the drop point).
        dragSourceColumn =
          (e.currentTarget as HTMLElement).closest(".kanban-col-body")?.getAttribute("data-column") ?? null;
      });
      card.addEventListener("dragend", () => {
        dragSourceColumn = null;
        // The drop can be followed by a click on the card (same-place drop in
        // Chromium, every dragend in Firefox/Safari); consume it so the board
        // is not left.
        armClickSuppression();
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

        // A cross-column move always lands the task as the TOPMOST card of
        // the destination column: the /status endpoint inserts at position 0
        // when no explicit position is given (and runs the workflow dispatch
        // for workflow columns). Same-column drops keep the drop position.
        const crossColumn = dragSourceColumn !== null && dragSourceColumn !== newStatus;
        dragSourceColumn = null;

        try {
          if (crossColumn) {
            await moveTask(taskId, newStatus);
            showToast(`Task moved to ${STATUS_LABELS[newStatus] || newStatus}`, "success");
            void loadBoard(showArchived, currentBoardKey());
            return;
          }

          // Same-column reorder: determine insert position from drop Y.
          // The dragged card is still in the DOM at its original spot while
          // the drag is in flight, so it must be EXCLUDED from the card list
          // before the insertion index is computed: the backend /position
          // endpoint interprets `position` as the final index of the moved
          // card in the column (0-based, including itself), which equals the
          // insertion index among the OTHER cards. Computing over the full
          // list (dragged card included) made a same-place drop resolve one
          // slot too far down - the strict `dropY < midY` comparison fails at
          // the dragged card's own midpoint - so the card drifted toward the
          // bottom of the panel instead of staying exactly where it was.
          const cards = Array.from(colBody!.querySelectorAll(".kanban-card"))
            .filter((card) => card.getAttribute("data-task-id") !== taskId)
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

          const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId) + "/position", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, position: insertIndex }),
          });
          if (res.ok) {
            showToast(`Task moved to ${STATUS_LABELS[newStatus] || newStatus}`, "success");
          } else {
            showToast("Failed to move task", "error");
          }
          void loadBoard(showArchived, currentBoardKey());
        } catch {
          showToast("Failed to move task", "error");
          void loadBoard(showArchived, currentBoardKey());
        }
      });
    });
  } catch (e) {
    boardEl.innerHTML = `<div class="error-state">Failed to load board: ${formatApiError(e)}</div>`;
  }
}
