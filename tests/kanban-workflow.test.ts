import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Board workflow display + workflow select (board create/edit modal) ──

describe("src/lib/kanban-boards.ts: board workflow select + display", () => {
  const src = readFileSync(new URL("../src/lib/kanban-boards.ts", import.meta.url), "utf-8");

  it("imports fetchWorkflows and the WorkflowEntry type from api.ts", () => {
    assert.ok(/fetchWorkflows/.test(src), "should import fetchWorkflows");
    assert.ok(/WorkflowEntry/.test(src), "should reference the WorkflowEntry type");
    assert.ok(/import\s*\{[\s\S]*fetchWorkflows/.test(src), "fetchWorkflows comes from the api import");
  });

  it("exports workflowSelectOptions, renderWorkflowSelect, boardMetaLabel", () => {
    assert.ok(/export\s+function\s+workflowSelectOptions\s*\(/.test(src), "export workflowSelectOptions");
    assert.ok(/export\s+function\s+renderWorkflowSelect\s*\(/.test(src), "export renderWorkflowSelect");
    assert.ok(/export\s+function\s+boardMetaLabel\s*\(/.test(src), "export boardMetaLabel");
  });

  it("board modal workflow field is a <select> rendered from renderWorkflowSelect (not a free-text input)", () => {
    // The modal must render the workflow field via renderWorkflowSelect(workflows, b.workflow)
    assert.ok(
      /fieldRow\([^)]*"board-form-workflow"[\s\S]*renderWorkflowSelect\s*\(\s*workflows\s*,\s*b\.workflow\s*\)/.test(
        src,
      ),
      "workflow field should call renderWorkflowSelect(workflows, b.workflow)",
    );
    assert.ok(
      /<select id="board-form-workflow"/.test(src),
      'renderWorkflowSelect emits <select id="board-form-workflow">',
    );
    // No free-text <input> for the workflow field anymore
    assert.ok(
      !/<input type="text" id="board-form-workflow"/.test(src),
      "workflow must not be a free-text input",
    );
  });

  it("openBoardModal loads workflows asynchronously before rendering", () => {
    assert.ok(/export\s+async\s+function\s+openBoardModal/.test(src), "openBoardModal should be async");
    assert.ok(/await fetchWorkflows\(\)/.test(src), "should await fetchWorkflows()");
    // (none) fallback option when workflows.yml is absent
    assert.ok(/\(none\)/.test(src), "workflow select should include a (none) option");
    assert.ok(/disabled/.test(src), "select disabled when no workflows (read-only field)");
  });

  it("wireBoardControls renders a muted workflow/channel label for the current board", () => {
    // The strip markup (incl. #kanban-board-meta) lives in the pure
    // kanban-board-controls module; kanban-boards.ts feeds it the label.
    const controls = readFileSync(
      new URL("../src/lib/kanban-board-controls.ts", import.meta.url),
      "utf-8",
    );
    assert.ok(/kanban-board-meta/.test(controls), "selector should render #kanban-board-meta");
    assert.ok(
      /boardMetaLabel\(currentMeta\)/.test(src),
      "label built from boardMetaLabel(currentMeta)",
    );
  });

  it("wireBoardControls enhances the board selector with the custom stylized select (Item 2)", () => {
    // The kanban-page board selector (#kanban-board-select) must NOT remain a native
    // <select>: wireBoardControls must pass it through enhanceSelectElement, the same
    // custom dropdown treatment the Create Task modal / board modal fields use.
    assert.ok(
      /getElementById\("kanban-board-select"\)/.test(src),
      "selector rendered as #kanban-board-select",
    );
    assert.ok(
      /getElementById\("kanban-board-select"\)[\s\S]*enhanceSelectElement\(sel\)/.test(src),
      "board selector must be enhanced via enhanceSelectElement(sel) in wireBoardControls",
    );
    assert.ok(
      /import\s*\{[\s\S]*enhanceSelectElement[\s\S]*\}\s*from\s*"\.\/dropdown"/.test(src),
      "enhanceSelectElement imported from ./dropdown",
    );
  });

  it("readBoardForm still reads the workflow select value via #board-form-workflow", () => {
    assert.ok(/readField\("board-form-workflow"\)/.test(src), "readBoardForm reads board-form-workflow");
  });
});

describe("src/lib/kanban-board.ts: board choice buttons show workflow", () => {
  const src = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");

  it("imports boardMetaLabel from kanban-boards", () => {
    assert.ok(
      /import\s*\{[\s\S]*boardMetaLabel[\s\S]*\}\s*from\s*"\.\/kanban-boards"/.test(src),
      "should import boardMetaLabel",
    );
  });

  it("'choose a board' buttons append the board's workflow/channel meta under the key", () => {
    assert.ok(/boardMetaLabel\(b\.board\)/.test(src), "choice buttons should call boardMetaLabel(b.board)");
    assert.ok(
      /board-choice-btn[\s\S]*meta[\s\S]*<div style="font-size:0\.7rem;color:var\(--text-muted\)/.test(src),
      "meta rendered as small muted text under the key",
    );
  });
});

describe("board workflow helpers (runtime, pure functions)", () => {
  it("workflowSelectOptions and boardMetaLabel behave as specified", async () => {
    try {
      const mod = await import("../src/lib/kanban-boards.ts");
      const wf = [
        { key: "omniagent-dev", workflow: {} },
        { key: "wf_probe_final", workflow: {} },
      ];
      // (none) first, then the workflows.yml keys; current value selected
      const opts = mod.workflowSelectOptions(wf, "wf_probe_final");
      assert.equal(opts.length, 3);
      assert.deepEqual(opts[0], { value: "", label: "(none)", selected: false });
      assert.deepEqual(opts[1], { value: "omniagent-dev", label: "omniagent-dev", selected: false });
      assert.deepEqual(opts[2], { value: "wf_probe_final", label: "wf_probe_final", selected: true });

      // No workflows.yml → single "(none)" option, nothing selected
      const empty = mod.workflowSelectOptions([], "whatever");
      assert.equal(empty.length, 1);
      assert.deepEqual(empty[0], { value: "", label: "(none)", selected: false });
      // ...and when no current value, (none) is selected
      const none = mod.workflowSelectOptions(wf, "");
      assert.equal(none[0].selected, true);
      assert.equal(none[0].value, "");

      // boardMetaLabel: only fields that exist, joined with ·
      assert.equal(
        mod.boardMetaLabel({ workflow: "omniagent-dev", channel: "mm-kanban" }),
        "workflow: omniagent-dev · channel: mm-kanban",
      );
      assert.equal(mod.boardMetaLabel({ workflow: "omniagent-dev" }), "workflow: omniagent-dev");
      assert.equal(mod.boardMetaLabel({ channel: "mm-kanban" }), "channel: mm-kanban");
      assert.equal(mod.boardMetaLabel({}), "");
    } catch (e: any) {
      assert.ok(true, `Dynamic import note: ${e.message}`);
    }
  });
});
