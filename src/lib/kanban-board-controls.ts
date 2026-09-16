/**
 * Pure rendering for the Kanban page header board controls
 * (#kanban-board-controls): the board selector, the Create Board button and
 * the Edit Board button.
 *
 * The control strip is ALWAYS rendered - board selected or not, zero boards or
 * many, GET /boards OK or failed:
 *   - the board selector (#kanban-board-select) always carries the "No board"
 *     option (plus every board key when the list loaded),
 *   - the Create Board button (+ New Board) is always present,
 *   - the Edit Board button is present (inline-block) whenever a board is
 *     selected and hidden only when no board is selected.
 * A failed/empty boards list must never erase the strip: it keeps the selector
 * with the "No board" option and shows an explicit, non-blocking hint next to
 * it, so the Create Board button stays usable to create the first board.
 *
 * This module is deliberately free of DOM/API access so the rendered markup is
 * unit-testable (the phase-1 regression wiped the strip with innerHTML = "").
 */

import { escapeHtml } from "./helpers";

/** Minimal shape of a board entry needed by the header controls. */
export interface BoardControlEntry {
  key: string;
}

export interface BoardControlsState {
  /** Boards from GET /boards ([] when boards.yml is empty or the call failed). */
  boards: readonly BoardControlEntry[];
  /** Board currently selected on the page (null = none). */
  currentBoard: string | null;
  /** Non-null when GET /boards FAILED (as opposed to a legitimately empty list). */
  loadError?: string | null;
  /** Optional muted "workflow: X · channel: Y" label of the selected board. */
  metaLabel?: string;
}

export const BOARD_SELECT_ID = "kanban-board-select";
export const BOARD_HINT_ID = "kanban-board-hint";
export const CREATE_BOARD_BTN_ID = "kanban-create-board-btn";
export const EDIT_BOARD_BTN_ID = "kanban-edit-board-btn";

const selectStyle =
  "background:rgba(255,255,255,0.04);border:1px solid var(--glass-border);color:inherit;border-radius:6px;padding:0.375rem 0.5rem;font-size:0.8rem;cursor:pointer;";
const hintStyle = "color:var(--text-muted);font-size:0.72rem;";
const metaStyle = "color:var(--text-muted);font-size:0.75rem;margin-left:0.5rem;";
const createBtnStyle =
  "background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.78rem;font-weight:500;white-space:nowrap;";
const editBtnStyle =
  "background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.78rem;white-space:nowrap;";

/** True when a board is selected: the Edit Board button must be visible. */
export function editBoardButtonVisible(currentBoard: string | null | undefined): boolean {
  return !!currentBoard && currentBoard.trim() !== "";
}

/**
 * Non-blocking hint shown next to the selector when the boards list is empty
 * or could not be loaded (never wipes the controls).
 */
export function boardControlsHint(state: BoardControlsState): string | null {
  if (state.loadError) return `Could not load boards: ${state.loadError}`;
  if (state.boards.length === 0) return "No boards yet - use Create Board to add one.";
  return null;
}

/**
 * The <option> entries for the board selector: "No board" first, then every
 * board key. On a failed fetch only "No board" is offered (the list is
 * unknown), never an empty option set.
 */
export function boardSelectOptions(
  state: BoardControlsState,
): { value: string; label: string; selected: boolean }[] {
  const current = editBoardButtonVisible(state.currentBoard) ? state.currentBoard : null;
  const options = [{ value: "", label: "No board", selected: !current }];
  if (state.loadError) return options;
  for (const b of state.boards) {
    options.push({ value: b.key, label: b.key, selected: b.key === current });
  }
  return options;
}

/** HTML of the whole header control strip (selector + Create + Edit). */
export function boardControlsHTML(state: BoardControlsState): string {
  const options = boardSelectOptions(state)
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${o.selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");
  const hint = boardControlsHint(state);
  const showEdit = editBoardButtonVisible(state.currentBoard);
  return `
    <select id="${BOARD_SELECT_ID}" title="Filter by board" style="${selectStyle}">
      ${options}
    </select>
    ${
      state.metaLabel
        ? `<span id="kanban-board-meta" style="${metaStyle}">${escapeHtml(state.metaLabel)}</span>`
        : ""
    }
    ${hint ? `<span id="${BOARD_HINT_ID}" role="status" style="${hintStyle}">${escapeHtml(hint)}</span>` : ""}
    <button id="${CREATE_BOARD_BTN_ID}" type="button" title="Create a new board" style="${createBtnStyle}">+ New Board</button>
    <button id="${EDIT_BOARD_BTN_ID}" type="button" title="Edit the current board" style="display:${showEdit ? "inline-block" : "none"};${editBtnStyle}">Edit Board</button>
  `;
}
