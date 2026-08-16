/**
 * Kanban boards UI: board selector, create/edit/delete board modals,
 * localStorage persistence, and pure helpers for board selection logic.
 *
 * Boards are file-defined (config/boards.yml, served by the omniagent
 * kanban API at /boards). When the file is absent (omnistable today) the
 * API returns an empty list and the kanban page shows no board controls —
 * byte-for-byte today's behavior.
 */
import {
  apiDelete,
  apiGet,
  apiPut,
  type BoardConfig,
  type BoardEntry,
} from "./api";
import { escapeHtml } from "./helpers";

// ── localStorage persistence ──

export const KANBAN_BOARD_LS_KEY = "kanban-board";

/** Read the last-visited board from localStorage (null = no stored board). */
export function getStoredBoard(): string | null {
  try {
    const raw = window.localStorage.getItem(KANBAN_BOARD_LS_KEY);
    if (!raw || raw === "no-board") return null;
    return raw;
  } catch {
    return null;
  }
}

/** Persist the selected board. Passing null erases the stored board. */
export function setStoredBoard(board: string | null): void {
  try {
    if (board) {
      window.localStorage.setItem(KANBAN_BOARD_LS_KEY, board);
    } else {
      window.localStorage.removeItem(KANBAN_BOARD_LS_KEY);
    }
  } catch {
    // localStorage unavailable — selection just isn't persisted.
  }
}

// ── Board list helpers (pure, unit-testable) ──

/** Board keys a task may be moved to: every board except the current one. */
export function nextBoardOptions(boards: BoardEntry[], current: string | null): string[] {
  return boards.filter((b) => b.key !== current).map((b) => b.key);
}

/** Move-button gating: enabled only when a board is actually selected. */
export function boardMoveEnabled(selection: string | null | undefined): boolean {
  return !!selection && selection.trim() !== "";
}

// ── API wrappers ──

/** GET /boards — list boards from config/boards.yml ([] when file absent). */
export async function fetchBoards(): Promise<BoardEntry[]> {
  try {
    const res = await apiGet<{ boards: BoardEntry[] }>("/boards");
    return res?.boards ?? [];
  } catch {
    return [];
  }
}

/** PUT /boards/{key} — create or update a board in boards.yml. */
export async function upsertBoard(key: string, board: BoardConfig): Promise<BoardEntry[]> {
  const res = await apiPut<{ boards: BoardEntry[] }>(`/boards/${encodeURIComponent(key)}`, board);
  return res?.boards ?? [];
}

/** DELETE /boards/{key} — delete a board AND its tasks from boards.yml. */
export async function deleteBoard(key: string): Promise<BoardEntry[]> {
  const res = await apiDelete<{ boards: BoardEntry[] }>(`/boards/${encodeURIComponent(key)}`);
  return res?.boards ?? [];
}

// ── Modal shared bits ──

const inputStyle =
  "width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;";
const labelStyle = "display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;";

function fieldRow(id: string, label: string, inputHtml: string, hint?: string): string {
  return `<div>
    <label style="${labelStyle}">${label}</label>
    ${inputHtml}
    ${hint ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">${hint}</div>` : ""}
  </div>`;
}

function readField(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";
}

/** Collect the board option fields from the modal form. */
function readBoardForm(): { key: string; board: BoardConfig } {
  const key = readField("board-form-key").trim();
  const board: BoardConfig = {};
  const channel = readField("board-form-channel");
  if (channel) board.channel = channel;
  const profile = readField("board-form-profile");
  if (profile) board.profile = profile;
  const workflow = readField("board-form-workflow");
  if (workflow) board.workflow = workflow;
  const plan = readField("board-form-plan");
  if (plan !== "") board.plan = plan === "true";
  const template = readField("board-form-template");
  if (template) board.template = template;
  const priority = readField("board-form-priority");
  if (priority !== "") board.priority = parseInt(priority, 10);
  return { key, board };
}

/**
 * Open the create/edit board modal. `mode === "edit"` requires `boardKey`
 * and adds a delete option (with confirmation that the board's tasks will
 * be deleted). `onDone` fires after any successful save/delete.
 */
export function openBoardModal(
  mode: "create" | "edit",
  boardKey: string | null,
  boards: BoardEntry[],
  onDone: () => void,
): void {
  document.getElementById("board-modal")?.remove();
  const existing = boards.find((b) => b.key === boardKey);
  const b = existing?.board ?? {};
  const modal = document.createElement("div");
  modal.id = "board-modal";
  modal.style.cssText =
    "display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1001;align-items:flex-start;justify-content:center;padding-top:10vh;";
  modal.innerHTML = `
    <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:520px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
      <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">${mode === "create" ? "Create Board" : "Edit Board"}</h2>
      <div style="display:grid;gap:0.75rem;">
        ${fieldRow("board-form-key", "Name *", `<input type="text" id="board-form-key" value="${escapeHtml(boardKey ?? "")}" ${mode === "edit" ? "disabled" : ""} style="${inputStyle}" />`, "Board name (key). Tasks reference it via the task's board field.")}
        ${fieldRow("board-form-channel", "Channel", `<input type="text" id="board-form-channel" value="${escapeHtml(b.channel ?? "")}" style="${inputStyle}" />`, "Channel name or id — fallback for tasks on this board.")}
        ${fieldRow("board-form-profile", "Profile", `<input type="text" id="board-form-profile" value="${escapeHtml(b.profile ?? "")}" style="${inputStyle}" />`)}
        ${fieldRow("board-form-workflow", "Workflow", `<input type="text" id="board-form-workflow" value="${escapeHtml(b.workflow ?? "")}" style="${inputStyle}" />`, "Used when the task itself does not set a workflow.")}
        ${fieldRow(
          "board-form-plan",
          "Plan mode",
          `<select id="board-form-plan" style="${inputStyle}">
            <option value="">Default</option>
            <option value="true" ${b.plan === true ? "selected" : ""}>On</option>
            <option value="false" ${b.plan === false ? "selected" : ""}>Off</option>
          </select>`,
        )}
        ${fieldRow("board-form-template", "Template", `<input type="text" id="board-form-template" value="${escapeHtml(b.template ?? "")}" style="${inputStyle}" />`)}
        ${fieldRow("board-form-priority", "Priority", `<input type="number" id="board-form-priority" value="${b.priority != null ? String(b.priority) : ""}" style="${inputStyle}" />`)}
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem;">
        <div style="display:flex;gap:0.5rem;">
          ${
            mode === "edit"
              ? `<button id="board-form-delete" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);color:var(--accent-rose);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Delete Board</button>`
              : ""
          }
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button id="board-form-cancel" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="board-form-save" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">${mode === "create" ? "Create" : "Save"}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  document.getElementById("board-form-cancel")?.addEventListener("click", close);

  document.getElementById("board-form-save")?.addEventListener("click", async () => {
    const { key, board } = readBoardForm();
    const target = mode === "edit" ? boardKey : key;
    if (!target) {
      alert("Board name cannot be empty");
      return;
    }
    try {
      await upsertBoard(target, board);
      close();
      onDone();
    } catch (e) {
      alert("Failed to save board: " + (e instanceof Error ? e.message : String(e)));
    }
  });

  const delBtn = document.getElementById("board-form-delete");
  if (delBtn && boardKey) {
    delBtn.addEventListener("click", async () => {
      if (!confirm(`Delete board "${boardKey}"?\n\nAll tasks of this board will be deleted. This cannot be undone.`)) {
        return;
      }
      try {
        await deleteBoard(boardKey);
        setStoredBoard(null);
        close();
        onDone();
      } catch (e) {
        alert("Failed to delete board: " + (e instanceof Error ? e.message : String(e)));
      }
    });
  }
}

/**
 * Populate a plain <select> with the board list (used by the create-task /
 * edit-task modals). No-op when the element or the board list is missing.
 */
export async function populateBoardSelect(
  selectId: string,
  selected: string | null = null,
): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  const boards = await fetchBoards();
  if (boards.length === 0) {
    select.innerHTML = '<option value="">None</option>';
    return;
  }
  select.innerHTML = '<option value="">None</option>';
  for (const b of boards) {
    const opt = document.createElement("option");
    opt.value = b.key;
    opt.textContent = b.key;
    if (b.key === selected) opt.selected = true;
    select.appendChild(opt);
  }
}

/**
 * Wire the board selector + create/edit board buttons into the kanban
 * page header (#kanban-board-controls). Boards absent (boards.yml missing)
 * ⇒ no controls at all — the page renders exactly as before.
 */
export async function wireBoardControls(opts: {
  currentBoard: string | null;
  onBoardChange: (board: string | null) => void;
  onBoardsChanged: () => void;
}): Promise<void> {
  const container = document.getElementById("kanban-board-controls");
  if (!container) return;
  const boards = await fetchBoards();
  if (boards.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = `
    <select id="kanban-board-select" title="Filter by board" style="background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);color:inherit;border-radius:6px;padding:0.375rem 0.5rem;font-size:0.8rem;cursor:pointer;">
      <option value="">No board</option>
      ${boards
        .map(
          (b) =>
            `<option value="${escapeHtml(b.key)}" ${b.key === opts.currentBoard ? "selected" : ""}>${escapeHtml(b.key)}</option>`,
        )
        .join("")}
    </select>
    <button id="kanban-create-board-btn" title="Create a new board" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.78rem;font-weight:500;white-space:nowrap;">+ New Board</button>
    <button id="kanban-edit-board-btn" title="Edit the current board" style="display:${opts.currentBoard ? "inline-block" : "none"};background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.78rem;white-space:nowrap;">Edit Board</button>
  `;

  const sel = document.getElementById("kanban-board-select") as HTMLSelectElement | null;
  sel?.addEventListener("change", () => {
    const v = sel.value || null;
    setStoredBoard(v);
    opts.onBoardChange(v);
  });

  document.getElementById("kanban-create-board-btn")?.addEventListener("click", () => {
    openBoardModal("create", null, boards, () => {
      void wireBoardControls(opts);
      opts.onBoardsChanged();
    });
  });

  const editBtn = document.getElementById("kanban-edit-board-btn");
  editBtn?.addEventListener("click", () => {
    if (!opts.currentBoard) return;
    openBoardModal("edit", opts.currentBoard, boards, () => {
      void wireBoardControls(opts);
      opts.onBoardsChanged();
    });
  });
}
