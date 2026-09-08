/**
 * Main kanban page: rendering, wiring, and create-task modal.
 * Delegates to lib/kanban-board.ts, lib/kanban-detail.ts, lib/kanban-subtasks.ts
 * and lib/kanban-create.ts (create-task modal + board/workflow fields).
 */
import { loadBoard } from "../lib/kanban-board";
import { getStoredBoard, setStoredBoard, wireBoardControls } from "../lib/kanban-boards";
import { taskModalHTML, wireTaskModal } from "../lib/kanban-create";
import { prefetch } from "../lib/refcache";
import { enhanceSelect } from "../lib/dropdown";
import {
  tagsManagerModalHTML,
  wireTagsManager,
  primeRegistryColors,
} from "../lib/kanban-tags";

// ── State ──
let showArchived = false;
let filterTag = "";
let currentBoard: string | null = null;

// ── URL sync ──

function updateKanbanUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (showArchived) {
    params.set("show_archived", "true");
  } else {
    params.delete("show_archived");
  }
  if (filterTag) {
    params.set("tag", filterTag);
  } else {
    params.delete("tag");
  }
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function updateArchivedButton(): void {
  const btn = document.getElementById("toggle-archived-btn");
  if (!btn) return;
  if (showArchived) {
    btn.textContent = "Showing archived";
    btn.classList.add("showing-archived");
  } else {
    btn.textContent = "Show archived";
    btn.classList.remove("showing-archived");
  }
}

/** Keep the tag filter input and clear button in sync with the page state. */
function updateTagFilterUI(): void {
  const input = document.getElementById("kanban-tag-filter") as HTMLInputElement | null;
  const clear = document.getElementById("kanban-tag-clear");
  if (!input) return;
  if (input.value !== filterTag) input.value = filterTag;
  if (clear) clear.style.display = filterTag ? "" : "none";
}

// ── Main render ──

export function renderKanban(container: HTMLElement): void {
  // Restore showArchived from URL on page load
  const p = new URLSearchParams(window.location.search);
  if (p.get("show_archived") === "true") {
    showArchived = true;
  }
  // Restore the tag filter from the URL (?tag=) so it survives navigation.
  const urlTag = p.get("tag");
  if (urlTag) filterTag = urlTag;
  // Board selection: URL ?board= wins; else restore last visited (localStorage).
  const urlBoard = p.get("board");
  const storedBoard = getStoredBoard();
  if (urlBoard && urlBoard !== "") {
    currentBoard = urlBoard;
    setStoredBoard(urlBoard);
  } else if (storedBoard) {
    currentBoard = storedBoard;
    history.replaceState(null, "", `/kanban?board=${encodeURIComponent(storedBoard)}`);
  } else currentBoard = null;
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban / Task board</h1>
        <p class="page-subtitle" id="kanban-page-subtitle">Task board</p>
        <span id="kanban-board-controls" style="display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin-top:0.5rem;"></span>
      </div>
      <div class="kanban-summary" id="kanban-summary" style="display:flex;align-items:center;gap:0.75rem;">
        <span id="kanban-count" style="font-size:0.85rem;color:var(--text-muted);margin-right:auto;"></span>
        <input id="kanban-tag-filter" type="text" placeholder="Filter by tag (exact match)" autocomplete="off" spellcheck="false" title="Show only tasks with this exact tag (case-sensitive)" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-primary);border-radius:6px;padding:0.375rem 0.5rem;font-size:0.8rem;width:11rem;outline:none;" />
        <button id="kanban-tag-clear" type="button" title="Clear tag filter" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.55rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;display:none;">Clear tag</button>
        <button id="toggle-archived-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">Show archived</button>
        <button id="kanban-history-btn" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:var(--accent-blue);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">History</button>
        <button id="kanban-tags-btn" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#34d399;border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Tags</button>
        <button id="create-task-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Task</button>
      </div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div class="loading">Loading board</div>
    </div>
    ${taskModalHTML("create")}
    ${tagsManagerModalHTML()}
  `;

  // Wire the shared create-task modal (also used for Edit on the detail page).
  wireTaskModal({
    mode: "create",
    getBoard: () => currentBoard,
    onSaved: () => {
      void loadBoard(showArchived, currentBoard);
    },
  });

  // Prefetch the modal option lists (channels/profiles/templates/boards/workflows)
  // so Create Task opens instantly from the refcache.
  prefetch(["/channels", "/profiles", "/templates", "/boards", "/workflows"]);

  // Toggle archived button
  document.getElementById("toggle-archived-btn")!.addEventListener("click", () => {
    showArchived = !showArchived;
    updateKanbanUrl();
    updateArchivedButton();
    void loadBoard(showArchived, currentBoard);
  });

  // Tag filter: text input + clear button. The tag is committed on Enter or
  // blur (change event) and stored in the URL (?tag=) so it survives board
  // switches and page reloads. Matching is exact (case-sensitive) against the
  // task's tag list and combines with the archived filter (AND semantics).
  const tagInput = document.getElementById("kanban-tag-filter") as HTMLInputElement | null;
  const tagClear = document.getElementById("kanban-tag-clear");
  const applyTagFilter = (): void => {
    const value = tagInput ? tagInput.value.trim() : "";
    if (value === filterTag) {
      updateTagFilterUI();
      return;
    }
    filterTag = value;
    updateKanbanUrl();
    updateTagFilterUI();
    void loadBoard(showArchived, currentBoard);
  };
  tagInput?.addEventListener("change", applyTagFilter);
  tagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyTagFilter();
      tagInput?.blur();
    }
  });
  tagInput?.addEventListener("input", () => {
    if (tagClear) tagClear.style.display = tagInput?.value ? "" : "none";
  });
  tagClear?.addEventListener("click", () => {
    if (tagInput) tagInput.value = "";
    filterTag = "";
    updateKanbanUrl();
    updateTagFilterUI();
    void loadBoard(showArchived, currentBoard);
  });
  updateTagFilterUI();

  // History button
  document.getElementById("kanban-history-btn")?.addEventListener("click", () => {
    history.pushState({}, "", "/kanban-history");
    void import("../lib/router").then(({ router }) => router.go("kanban-history"));
  });

  // "+ Tags" manager modal (elements recreated per render): wire the open
  // button, close/save/cancel-edit and the list's edit/delete delegation.
  wireTagsManager(() => {
    void loadBoard(showArchived, currentBoard);
  });

  // Apply initial URL state to button and URL
  updateArchivedButton();
  updateKanbanUrl();

  // Board controls: re-render after every change so the select + action
  // buttons (e.g. Edit Board) stay in sync with the URL immediately.
  const setupBoardControls = (): void => {
    void wireBoardControls({
      currentBoard,
      onBoardChange: (board) => {
        currentBoard = board;
        setStoredBoard(board);
        const params = new URLSearchParams(window.location.search);
        if (board) params.set("board", board);
        else params.delete("board");
        const qs = params.toString();
        history.replaceState(null, "", qs ? `/kanban?${qs}` : "/kanban");
        updateArchivedButton();
        setupBoardControls();
        void loadBoard(showArchived, board);
      },
      onBoardsChanged: () => {
        setupBoardControls();
        void loadBoard(showArchived, currentBoard);
      },
    });
  };
  setupBoardControls();
  // Board selector: custom stylized select, same enhancement as the other
  // pages. wireBoardControls renders the <select> asynchronously (and
  // enhances it); this page-level call is idempotent (guarded in
  // dropdown.ts) and keeps the enhancement explicit on the page path.
  const selectId = "kanban-board-select";
  enhanceSelect(selectId);
  // Prime chip colors from the tag registry, then render the board so chips
  // show the registry colors (fallback: deterministic hash hues).
  void primeRegistryColors().then(() => {
    void loadBoard(showArchived, currentBoard);
  });
}

// Re-export for router
export { renderKanbanDetail } from "../lib/kanban-detail";
