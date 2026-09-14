import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Kanban: clicking a board panel of the "select a board" prompt must also
// reflect the board in the header board select (#kanban-board-select) ──
//
// Bug (operator, 2026-09-13): with no board selected the kanban page shows the
// boards as panels; clicking one opened the board page but the board select
// field kept showing "No board".
//
// Fix: the panel click routes through the select's own change handler via
// selectBoardInControls() (single source of truth for board state + URL +
// reload), and only falls back to the direct URL/reload path when the select
// is not rendered.

describe("Board panel click keeps the header board select in sync", () => {
  const board = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
  const boards = readFileSync(new URL("../src/lib/kanban-boards.ts", import.meta.url), "utf-8");

  it("kanban-boards.ts exports selectBoardInControls", () => {
    assert.ok(
      /export\s+function\s+selectBoardInControls\s*\(\s*board:\s*string\s*\)/.test(boards),
      "selectBoardInControls(board: string) should be exported",
    );
  });

  it("selectBoardInControls sets the select value, syncs the custom dropdown and fires change", () => {
    assert.ok(
      /getElementById\("kanban-board-select"\)/.test(boards),
      "selectBoardInControls targets #kanban-board-select",
    );
    assert.ok(
      /sel\.value\s*=\s*board[\s\S]{0,400}syncSelectDisplayEl\(sel\)[\s\S]{0,400}dispatchEvent\(new Event\("change"/.test(
        boards,
      ),
      "it must set the value, sync the custom dropdown display and dispatch a change event",
    );
  });

  it("kanban-board.ts imports selectBoardInControls and uses it in the board-choice click handler", () => {
    assert.ok(
      /import\s*\{[\s\S]*selectBoardInControls[\s\S]*\}\s*from\s*"\.\/kanban-boards"/.test(board),
      "kanban-board.ts imports selectBoardInControls from ./kanban-boards",
    );
    assert.ok(
      /data-board[\s\S]{0,900}if\s*\(\s*!selectBoardInControls\(b\)\s*\)[\s\S]{0,400}history\.replaceState/.test(
        board,
      ),
      "the panel click handler must call selectBoardInControls(b), falling back to replaceState + loadBoard",
    );
  });
});
