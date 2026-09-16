import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_HINT_ID,
  BOARD_SELECT_ID,
  CREATE_BOARD_BTN_ID,
  EDIT_BOARD_BTN_ID,
  boardControlsHTML,
  boardControlsHint,
  boardSelectOptions,
  editBoardButtonVisible,
} from "../src/lib/kanban-board-controls.ts";

// ── Kanban page header board controls: the strip (board selector + Create
//    Board + Edit Board) must be rendered in EVERY state ──
//
// Bug (operator, 2026-09-15): the Kanban page lost the board selector and the
// Create/Edit board buttons because wireBoardControls() did
// `container.innerHTML = ""` when the boards list was empty (and fetchBoards()
// turned a /boards failure into an empty list). These tests pin the rendered
// markup directly (no DOM needed: boardControlsHTML is a pure function).

const omnidev = { key: "omnidev" };
const ops = { key: "ops" };

describe("Kanban board controls HTML: always rendered", () => {
  const states = {
    "no board, empty list": { boards: [], currentBoard: null },
    "board selected, empty list": { boards: [], currentBoard: "omnidev" },
    "no board, boards loaded": { boards: [omnidev, ops], currentBoard: null },
    "board selected, boards loaded": { boards: [omnidev, ops], currentBoard: "omnidev" },
    "boards fetch failed": { boards: [], currentBoard: null, loadError: "502: upstream unavailable" },
    "board selected, fetch failed": { boards: [], currentBoard: "omnidev", loadError: "502" },
  };

  it("renders the selector and the Create Board button in every state", () => {
    for (const [name, state] of Object.entries(states)) {
      const html = boardControlsHTML(state);
      assert.match(html, new RegExp(`id="${BOARD_SELECT_ID}"`), `selector missing (${name})`);
      assert.match(html, new RegExp(`id="${CREATE_BOARD_BTN_ID}"`), `create button missing (${name})`);
      assert.match(html, />\+ New Board</, `create button label missing (${name})`);
      // The Edit button is always rendered; only its display differs.
      assert.match(html, new RegExp(`id="${EDIT_BOARD_BTN_ID}"`), `edit button missing (${name})`);
    }
  });

  it("always offers the 'No board' option", () => {
    for (const [name, state] of Object.entries(states)) {
      assert.match(
        boardControlsHTML(state),
        /<option value=""[^>]*>No board<\/option>/,
        `No board option missing (${name})`,
      );
    }
  });

  it("lists every board key when the list loaded", () => {
    const html = boardControlsHTML({ boards: [omnidev, ops], currentBoard: null });
    assert.match(html, /<option value="omnidev">omnidev<\/option>/);
    assert.match(html, /<option value="ops">ops<\/option>/);
  });

  it("marks the selected board", () => {
    const html = boardControlsHTML({ boards: [omnidev, ops], currentBoard: "ops" });
    assert.match(html, /<option value="ops" selected>ops<\/option>/);
    assert.ok(!/<option value="omnidev" selected/.test(html), "only the current board is selected");
  });

  it("keeps the selector usable on a failed fetch (only 'No board' offered)", () => {
    const options = boardSelectOptions({ boards: [omnidev], currentBoard: null, loadError: "502" });
    assert.deepEqual(options, [{ value: "", label: "No board", selected: true }]);
    const html = boardControlsHTML({ boards: [omnidev], currentBoard: null, loadError: "502" });
    assert.ok(!/option value="omnidev"/.test(html), "a failed list must not offer stale boards");
  });

  it("shows a non-blocking hint when the list is empty or failed", () => {
    assert.equal(boardControlsHint({ boards: [], currentBoard: null }), "No boards yet - use Create Board to add one.");
    assert.match(
      boardControlsHint({ boards: [], currentBoard: null, loadError: "502" }) ?? "",
      /^Could not load boards: 502$/,
    );
    assert.equal(
      boardControlsHint({ boards: [omnidev], currentBoard: "omnidev" }),
      null,
      "no hint when the boards list loaded",
    );
    const html = boardControlsHTML({ boards: [], currentBoard: null, loadError: "502" });
    assert.match(html, new RegExp(`id="${BOARD_HINT_ID}"`), "hint element rendered");
    assert.match(html, /Could not load boards: 502/);
  });
});

describe("Kanban Edit Board button visibility", () => {
  it("is visible whenever a board is selected", () => {
    assert.equal(editBoardButtonVisible("omnidev"), true);
    const html = boardControlsHTML({ boards: [omnidev], currentBoard: "omnidev" });
    assert.match(html, /id="kanban-edit-board-btn" type="button" title="Edit the current board" style="display:inline-block;/);
  });

  it("is rendered but hidden when no board is selected", () => {
    assert.equal(editBoardButtonVisible(null), false);
    assert.equal(editBoardButtonVisible(""), false);
    assert.equal(editBoardButtonVisible("   "), false);
    const html = boardControlsHTML({ boards: [omnidev], currentBoard: null });
    assert.match(html, /id="kanban-edit-board-btn" type="button" title="Edit the current board" style="display:none;/);
  });

  it("stays visible after a re-render with the same selected board (boards reloaded)", () => {
    // A re-render happens after every board change / create / edit: the Edit
    // button must not depend on the first render pass only.
    let html = boardControlsHTML({ boards: [], currentBoard: "omnidev", loadError: "503" });
    assert.match(html, /id="kanban-edit-board-btn"[^>]*style="display:inline-block;/);
    html = boardControlsHTML({ boards: [omnidev, ops], currentBoard: "omnidev" });
    assert.match(html, /id="kanban-edit-board-btn"[^>]*style="display:inline-block;/);
  });
});
