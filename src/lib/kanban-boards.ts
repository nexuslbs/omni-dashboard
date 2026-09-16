/**
 * Kanban boards UI: board selector, create/edit/delete board modals,
 * localStorage persistence, and pure helpers for board selection logic.
 *
 * Boards are file-defined (config/boards.yml, served by the omniagent
 * kanban API at /boards). The header control strip (selector + Create Board +
 * Edit Board) is rendered in EVERY state: an absent boards.yml (empty list)
 * or a failed /boards call shows an explicit hint instead of erasing the
 * controls (regression 2026-09-15: the strip vanished and the operator lost
 * the board selector).
 */
import {
  BOARD_SELECT_ID,
  CREATE_BOARD_BTN_ID,
  EDIT_BOARD_BTN_ID,
  boardControlsHTML,
  editBoardButtonVisible,
} from "./kanban-board-controls";
import {
  apiDelete,
  apiGet,
  apiPut,
  fetchWorkflows,
  type BoardConfig,
  type BoardEntry,
  type WorkflowEntry,
} from "./api";
import { escapeHtml } from "./helpers";
import { enhanceSelectElement, syncSelectDisplayEl } from "./dropdown";

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
    // localStorage unavailable; selection just isn't persisted.
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

// ── Workflow select helpers (pure, unit-testable) ──

/**
 * The <option> entries for a board's workflow field. Values are the keys
 * of workflows.yml; "" means "(none)". When `workflows` is empty the list
 * contains only the "(none)" option (the field is effectively read-only).
 */
export function workflowSelectOptions(
  workflows: WorkflowEntry[],
  current?: string | null,
): { value: string; label: string; selected: boolean }[] {
  const options: { value: string; label: string; selected: boolean }[] = [
    { value: "", label: "(none)", selected: !current },
  ];
  for (const w of workflows) {
    options.push({ value: w.key, label: w.key, selected: w.key === current });
  }
  return options;
}

/**
 * Muted "workflow: X · channel: Y" summary of a board's meta fields.
 * Only fields that exist are included; empty string when none are set.
 */
export function boardMetaLabel(board: BoardConfig): string {
  const parts: string[] = [];
  if (board.workflow) parts.push(`workflow: ${board.workflow}`);
  if (board.channel) parts.push(`channel: ${board.channel}`);
  return parts.join(" · ");
}

// ── API wrappers ──

/** Outcome of GET /boards: the list plus the failure reason when it failed. */
export interface BoardsFetchResult {
  boards: BoardEntry[];
  /** Non-null when the API call failed (NOT when boards.yml is simply empty). */
  error: string | null;
}

/** GET /boards keeping the failure reason (never throws, [] on failure). */
export async function fetchBoardsResult(): Promise<BoardsFetchResult> {
  try {
    const res = await apiGet<{ boards: BoardEntry[] }>("/boards");
    return { boards: res?.boards ?? [], error: null };
  } catch (e) {
    return { boards: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** GET /boards: list boards from config/boards.yml ([] when file absent). */
export async function fetchBoards(): Promise<BoardEntry[]> {
  return (await fetchBoardsResult()).boards;
}

/** PUT /boards/{key}: create or update a board in boards.yml. */
export async function upsertBoard(key: string, board: BoardConfig): Promise<BoardEntry[]> {
  const res = await apiPut<{ boards: BoardEntry[] }>(`/boards/${encodeURIComponent(key)}`, board);
  return res?.boards ?? [];
}

/** DELETE /boards/{key}: delete a board AND its tasks from boards.yml. */
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
    <label for="${id}" style="${labelStyle}">${label}</label>
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
 * HTML for the board workflow <select>. Values are workflows.yml keys
 * ("" = none); when no workflows exist the select is disabled (read-only).
 */
export function renderWorkflowSelect(workflows: WorkflowEntry[], current?: string | null): string {
  const options = workflowSelectOptions(workflows, current)
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${o.selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");
  return `<select id="board-form-workflow" style="${inputStyle}"${workflows.length === 0 ? " disabled" : ""}>
    ${options}
  </select>`;
}

/**
 * Open the create/edit board modal. `mode === "edit"` requires `boardKey`
 * and adds a delete option (with confirmation that the board's tasks will
 * be deleted). `onDone` fires after any successful save/delete.
 *
 * The workflow field is a <select> populated from workflows.yml (keys of
 * the file); the board's saved workflow is pre-selected.
 */
export async function openBoardModal(
  mode: "create" | "edit",
  boardKey: string | null,
  boards: BoardEntry[],
  onDone: (savedKey?: string) => void,
): Promise<void> {
  document.getElementById("board-modal")?.remove();
  const existing = boards.find((b) => b.key === boardKey);
  const b = existing?.board ?? {};
  // Workflow options come from workflows.yml; empty file ⇒ single "(none)" option.
  // The four option sources are INDEPENDENT (no data dependency between them):
  // start them all in the same tick so the modal pays max(call) instead of
  // sum(call). Workflows keeps its original error semantics (a rejection still
  // fails the open); the other three keep their per-source fallback.
  const [workflows, channelsRes, profilesRes, templatesRes] = await Promise.all([
    fetchWorkflows(),
    apiGet<unknown[]>("/channels").catch(() => null),
    apiGet<{ name: string }[]>("/profiles").catch(() => null),
    apiGet<{ name: string }[]>("/templates").catch(() => null),
  ]);
  const channels: unknown[] = channelsRes || [];
  const profiles: { name: string }[] = profilesRes || [];
  const templates: { name: string }[] = templatesRes || [];
  const modal = document.createElement("div");
  modal.id = "board-modal";
  modal.style.cssText =
    "display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1001;align-items:flex-start;justify-content:center;padding-top:10vh;";
  modal.innerHTML = `
    <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:520px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
      <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">${mode === "create" ? "Create Board" : "Edit Board"}</h2>
      <div style="display:grid;gap:0.75rem;">
        ${fieldRow("board-form-key", "Name *", `<input type="text" id="board-form-key" value="${escapeHtml(boardKey ?? "")}" ${mode === "edit" ? "disabled" : ""} style="${inputStyle}" />`, "Board name (key). Tasks reference it via the task's board field.")}
        ${fieldRow("board-form-channel", "Channel", `<select id="board-form-channel" style="${inputStyle}"><option value="">- None -</option>${channels.map((c) => `<option value="${escapeHtml(typeof c === "string" ? c : ((c as { name?: string }).name ?? ""))}" ${String(b.channel ?? "") === String(typeof c === "string" ? c : ((c as { name?: string }).name ?? "")) ? "selected" : ""}>${escapeHtml(typeof c === "string" ? c : ((c as { name?: string }).name ?? ""))}</option>`).join("")}</select>`, "Channel: fallback for tasks on this board.")}
        ${fieldRow("board-form-profile", "Profile", `<select id="board-form-profile" style="${inputStyle}"><option value="">- None -</option>${profiles.map((pr) => `<option value="${escapeHtml(pr.name)}" ${String(b.profile ?? "") === pr.name ? "selected" : ""}>${escapeHtml(pr.name)}</option>`).join("")}</select>`)}
        ${fieldRow("board-form-workflow", "Workflow", renderWorkflowSelect(workflows, b.workflow), "Used when the task itself does not set a workflow.")}
        ${fieldRow(
          "board-form-plan",
          "Plan mode",
          `<select id="board-form-plan" style="${inputStyle}">
            <option value="">Default</option>
            <option value="true" ${b.plan === true ? "selected" : ""}>On</option>
            <option value="false" ${b.plan === false ? "selected" : ""}>Off</option>
          </select>`,
        )}
        ${fieldRow("board-form-template", "Template", `<select id="board-form-template" style="${inputStyle}"><option value="">- None -</option>${templates.map((t) => `<option value="${escapeHtml(t.name)}" ${String(b.template ?? "") === t.name ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}</select>`)}
        ${fieldRow("board-form-priority", "Priority", `<select id="board-form-priority" style="${inputStyle}"><option value="">- None -</option>${[0, 1, 2, 3, 4, 5].map((pr) => `<option value="${pr}" ${b.priority === pr ? "selected" : ""}>${pr}</option>`).join("")}</select>`)}
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
  modal.querySelectorAll("select").forEach((sel) => enhanceSelectElement(sel as HTMLSelectElement));

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
      onDone(target);
    } catch (e) {
      alert("Failed to save board: " + (e instanceof Error ? e.message : String(e)));
    }
  });

  const delBtn = document.getElementById("board-form-delete");
  if (delBtn && boardKey) {
    delBtn.addEventListener("click", async () => {
      if (
        !confirm(
          `Delete board "${boardKey}"?\n\nAll tasks of this board will be deleted. This cannot be undone.`,
        )
      ) {
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
export async function populateBoardSelect(selectId: string, selected: string | null = null): Promise<void> {
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
 * Reflect a programmatically chosen board (e.g. a click on a board panel of
 * the "select a board" prompt) in the header board select, so the select can
 * never keep showing "No board" while the page shows that board's tasks.
 *
 * The select's own change handler is the single source of truth for board
 * state, the URL and the board reload, so we set the value + sync the custom
 * dropdown display and dispatch "change" instead of duplicating that logic.
 * Returns false when the select is not rendered (no controls), so the caller
 * can fall back to updating the stored board / URL / board view directly.
 */
export function selectBoardInControls(board: string): boolean {
  const sel = document.getElementById("kanban-board-select") as HTMLSelectElement | null;
  if (!sel) return false;
  sel.value = board;
  syncSelectDisplayEl(sel);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Wire the board selector + create/edit board buttons into the kanban
 * page header (#kanban-board-controls).
 *
 * The strip is ALWAYS rendered: the board selector + the Create Board button
 * always, the Edit Board button whenever a board is selected. An empty or
 * failed boards list shows an explicit, non-blocking hint instead of erasing
 * the controls (it must stay possible to create the first board).
 */
export async function wireBoardControls(opts: {
  currentBoard: string | null;
  onBoardChange: (board: string | null) => void;
  onBoardsChanged: () => void;
}): Promise<void> {
  const container = document.getElementById("kanban-board-controls");
  if (!container) return;
  const seq = ++boardControlsRenderSeq;
  const { boards, error } = await fetchBoardsResult();
  // A newer render started while this fetch was in flight: never let a stale
  // response overwrite the newer one (rapid board switches / create + reload).
  if (seq !== boardControlsRenderSeq) return;
  const currentMeta = opts.currentBoard ? boards.find((b) => b.key === opts.currentBoard)?.board : undefined;
  const metaLabel = currentMeta ? boardMetaLabel(currentMeta) : "";
  container.innerHTML = boardControlsHTML({
    boards,
    currentBoard: opts.currentBoard,
    loadError: error,
    metaLabel,
  });

  const sel = document.getElementById(BOARD_SELECT_ID) as HTMLSelectElement | null;
  // Item 2: the board selector must use the custom stylized select (reference
  // the Create Task modal treatment) instead of a native <select>.
  if (sel) enhanceSelectElement(sel);
  sel?.addEventListener("change", () => {
    const v = sel.value || null;
    setStoredBoard(v);
    opts.onBoardChange(v);
  });

  document.getElementById(CREATE_BOARD_BTN_ID)?.addEventListener("click", () => {
    void openBoardModal("create", null, boards, (newKey) => {
      if (newKey) {
        // Select the freshly created board: the selector must show it and the
        // Edit Board button must appear (creating the first board).
        setStoredBoard(newKey);
        opts.onBoardChange(newKey);
      } else {
        opts.onBoardsChanged();
      }
    });
  });

  // Edit Board: rendered above like every other control; its visibility is
  // enforced here as well so no re-render can leave it missing while a board
  // is selected (hidden only when no board is selected).
  const editBtn = document.getElementById(EDIT_BOARD_BTN_ID) as HTMLButtonElement | null;
  if (editBtn) editBtn.style.display = editBoardButtonVisible(opts.currentBoard) ? "inline-block" : "none";
  editBtn?.addEventListener("click", () => {
    if (!opts.currentBoard) return;
    void openBoardModal("edit", opts.currentBoard, boards, () => {
      opts.onBoardsChanged();
    });
  });
}

// Board-controls render generation: a late /boards response must never
// overwrite a newer render of the header control strip.
let boardControlsRenderSeq = 0;

/**
 * Populate a plain <select> with the workflows.yml keys (used by the
 * create-task modal). No-op when the element or the workflow list is missing.
 */
export async function populateWorkflowSelect(
  selectId: string,
  selected: string | null = null,
): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  const workflows = await fetchWorkflows();
  const options = workflowSelectOptions(workflows, selected);
  select.innerHTML = '<option value="">(none)</option>';
  for (const o of options) {
    if (o.value === "") continue;
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.selected) opt.selected = true;
    select.appendChild(opt);
  }
}
