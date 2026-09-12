import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Kanban Task Details: "Move to another board" uses the custom stylized select ──
// The control must render through the shared .custom-select component
// (dropdown.ts enhanceSelectElement/syncSelectDisplayEl), never as a native
// <select> with its own one-off inline styling.

describe("src/lib/kanban-detail.ts: move-to-another-board uses the custom select", () => {
  const src = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");

  it("imports enhanceSelectElement + syncSelectDisplayEl from ./dropdown", () => {
    assert.match(
      src,
      /import\s*\{[^}]*\benhanceSelectElement\b[^}]*\}\s*from\s*"\.\/dropdown"/,
      "must import enhanceSelectElement from ./dropdown",
    );
    assert.match(
      src,
      /import\s*\{[^}]*\bsyncSelectDisplayEl\b[^}]*\}\s*from\s*"\.\/dropdown"/,
      "must import syncSelectDisplayEl from ./dropdown",
    );
  });

  it("renders #task-move-board as a plain native select, without one-off inline styling", () => {
    assert.match(
      src,
      /<select id="task-move-board">/,
      "native select element is kept as the single source of truth",
    );
    assert.ok(
      !/<select id="task-move-board"[^>]*style=/.test(src),
      "the native select must not carry inline styling (the custom component styles it)",
    );
    assert.match(src, /id="task-move-board-wrap"/, "the wrapper keeps its id so it can be hidden");
  });

  it("enhances the select AFTER populating the options, and syncs the custom display", () => {
    const populate = src.indexOf("sel.innerHTML");
    const enhance = src.indexOf("enhanceSelectElement(sel)");
    const sync = src.indexOf("syncSelectDisplayEl(sel)");
    assert.ok(populate > -1, "options are populated via sel.innerHTML");
    assert.ok(enhance > -1, "enhanceSelectElement(sel) is called");
    assert.ok(sync > -1, "the custom trigger is re-synced with syncSelectDisplayEl(sel)");
    assert.ok(
      populate < enhance,
      "options must be populated BEFORE enhancement (the trigger is built from the current options)",
    );
    assert.ok(enhance < sync, "the sync runs on the enhanced wrapper (same update() pass)");
  });

  it("keeps the previous behaviour: options, disabled state, PATCH move and wrap hiding", () => {
    assert.match(src, /nextBoardOptions\(boards, task\.board \|\| null\)/, "board options unchanged");
    assert.match(src, /Select a board\.\.\./, "the placeholder option is kept");
    assert.match(
      src,
      /btn\.disabled = !boardMoveEnabled\(sel\.value\)/,
      "Move stays disabled until a board is chosen",
    );
    assert.match(src, /method:\s*"PATCH"/, "still PATCHes the task");
    assert.match(src, /JSON\.stringify\(\{\s*board:\s*target\s*\}\)/, "still sends {board: target}");
    assert.match(
      src,
      /JSON\.stringify\(\{\s*board:\s*target\s*\}\)[\s\S]*loadTaskDetail\(taskId\)/,
      "still refreshes after the move",
    );
    assert.match(src, /moveBoardWrap\.style\.display = "none"/, "wrap still hides when there are no boards");
  });
});
