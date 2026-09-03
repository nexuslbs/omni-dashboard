import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Regression tests: kanban UX fixes (archived filter, shared task modal,
//    custom board/workflow selects, modal latency) ──

describe("Kanban archived filter (show_archived)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");

  it("loadBoard filters tasks on the archived flag (not just the URL)", () => {
    assert.ok(
      /const visibleTasks = tasks\s*\.filter\(\(t: KanbanTask\) =>/.test(src),
      "loadBoard should build a visibleTasks filter from the fetched list",
    );
    assert.ok(
      /showArchived \? t\.archived === true : !t\.archived/.test(src),
      "default (Unarchived) must show ONLY non-archived; Show archived ONLY archived",
    );
  });
  it("loadBoard asks the API for archived tasks when showArchived is on", () => {
    assert.ok(
      /showArchived \? "&show_archived=true" : ""/.test(src),
      "board fetch must request archived tasks from the API",
    );
    assert.ok(
      /showArchived \? "\?show_archived=true" : ""/.test(src),
      "no-board fetch must request archived tasks too",
    );
  });

  it("columns and totals are computed from the filtered list", () => {
    assert.ok(
      /tasks:\s*visibleTasks\.filter\(\(t: KanbanTask\) => t\.status === col\.id\)/.test(src),
      "columns must be built from visibleTasks",
    );
    assert.ok(/total:\s*visibleTasks\.length/.test(src), "board total must reflect the filtered count");
    assert.ok(
      /showArchived \? "No archived tasks" :\s*"No tasks yet"/.test(src),
      "empty state should be mode-aware",
    );
  });
});

describe("Shared create/edit task modal (kanban-create.ts)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-create.ts", import.meta.url), "utf-8");

  it("exports one taskModalHTML(mode) used for both Create and Edit", () => {
    assert.ok(/export function taskModalHTML\(mode: TaskModalMode\)/.test(src), "taskModalHTML(mode)");
    assert.ok(/isEdit \? "Edit Task" : "Create Task"/.test(src), "same component, mode-driven title");
  });

  it("Board and Workflow selects exist in BOTH modes (custom select, not native)", () => {
    assert.ok(/id="\$\{p\}-board"/.test(src), "board select id is prefix-based (both modes)");
    assert.ok(/id="\$\{p\}-workflow"/.test(src), "workflow select id is prefix-based (both modes)");
    assert.ok(
      /populateBoardSelectCached\(`\$\{p\}-board`/.test(src),
      "board select must be populated via the custom-select path (dropdown re-enhanced)",
    );
    assert.ok(
      /populateWorkflowSelectCached\(`\$\{p\}-workflow`/.test(src),
      "workflow select must be populated via the custom-select path (dropdown re-enhanced)",
    );
    // The cached populators must re-enhance the select they just filled.
    assert.ok(
      /refreshEnhancedSelect\(selectId\)/.test(src),
      "populators re-enhance the select after filling options",
    );
  });

  it("openTaskModal shows the modal BEFORE populating selects (latency fix)", () => {
    assert.ok(/modal\.style\.display = "flex";/.test(src), "modal shown synchronously");
    // The show must come before the async populate call in the same function body.
    const showIdx = src.indexOf('modal.style.display = "flex";');
    const popIdx = src.indexOf("void populateTaskModalSelects");
    assert.ok(showIdx >= 0 && popIdx > showIdx, "show first, then populate in background");
  });

  it("wireTaskModal wires cancel + submit for both modes; submit differs by mode", () => {
    assert.ok(/export function wireTaskModal/.test(src), "wireTaskModal exported");
    assert.ok(/submitTaskModal\(mode\)/.test(src), "submit dispatches on the mode");
    assert.ok(/_editTaskId/.test(src), "edit mode PATCHes the task id");
  });

  it("submitTaskModal keeps an empty workflow selection so edit can clear to board default", () => {
    // The workflow select value must be read with `?? undefined` (NOT `|| undefined`):
    // the empty "(none)" option value "" must stay in the PATCH body so the server
    // (PATCH workflow:"") clears workflow_id back to the board default.
    assert.match(
      src,
      /getElementById\(`\$\{p\}-workflow`\) as HTMLSelectElement \| null\)\?\.value \?\? undefined/,
      "workflow must be read with `?.value ?? undefined` so the empty string survives",
    );
  });
});

describe("Kanban detail reuses the shared task modal", () => {
  const src = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");

  it('renders taskModalHTML("edit") instead of a bespoke edit modal', () => {
    assert.ok(/taskModalHTML\("edit"\)/.test(src), "edit modal comes from the shared component");
    assert.ok(/openTaskModal\(\{/.test(src), "Edit button opens the shared modal");
    assert.ok(/wireTaskModal\(\{ mode: "edit" \}\)/.test(src), "shared wiring used for edit");
  });

  it("no longer defines its own edit-modal field HTML", () => {
    assert.ok(!/<div id="edit-task-modal"/.test(src), "inline edit-task-modal container must be gone");
    assert.ok(!/task-edit-title/.test(src), "inline edit title input must be gone");
  });

  it("task details always renders the effective workflow from task.workflow (resolved), not the DB column name workflow_id", () => {
    // The API GET /kanban/tasks/{id} serializes the resolved effective workflow
    // (task explicit -> board default) under the JSON key `workflow` (serde
    // KanbanTaskEntry), NEVER as `workflow_id`. Reading task.workflow_id was
    // always falsy, so an explicitly-set workflow (e.g. dev-executor) never
    // rendered on the details page.
    assert.ok(!/task\.workflow_id/.test(src), "must not read the legacy workflow_id field");
    assert.match(
      src,
      /detail-label" style="font-size:0\.68rem;">Workflow<\/span>/,
      "details grid must show a clearly labeled Workflow entry",
    );
    assert.match(src, /task\.workflow\s*\?/, "workflow chip renders when the task has an effective workflow");
    assert.match(src, /None<\/em>"/, "tasks without any workflow show a muted None state");
  });
});

describe("Reusable message box used by message-rendering pages", () => {
  it("Messages page, kanban detail and schedule detail all use renderMessageCard", () => {
    for (const f of ["pages/messages.ts", "lib/kanban-detail.ts", "lib/schedule-detail.ts"]) {
      const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf-8");
      assert.ok(/renderMessageCard/.test(src), `${f} must use the shared renderMessageCard message box`);
    }
  });
});

describe("Modal latency: refcache prefetch", () => {
  it("refcache.ts exports cachedGet + prefetch", () => {
    const src = readFileSync(new URL("../src/lib/refcache.ts", import.meta.url), "utf-8");
    assert.ok(/export function cachedGet/.test(src), "cachedGet");
    assert.ok(/export function prefetch/.test(src), "prefetch");
  });

  it("pages prefetch modal option lists on load", () => {
    const kanban = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");
    assert.ok(
      /prefetch\(\["\/channels", "\/profiles", "\/templates", "\/boards", "\/workflows"\]\)/.test(kanban),
      "kanban prefetches task-modal refs",
    );
    const schedule = readFileSync(new URL("../src/pages/schedule.ts", import.meta.url), "utf-8");
    assert.ok(/prefetch\(/.test(schedule), "schedule prefetches cron-modal refs");
    const hooks = readFileSync(new URL("../src/pages/hooks.ts", import.meta.url), "utf-8");
    assert.ok(/prefetch\(/.test(hooks), "hooks prefetch hook-modal refs");
  });

  it("cron and hook modals load their option lists from the cache in parallel", () => {
    const cron = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
    assert.ok(
      /Promise\.all\(\[/.test(cron) && /cachedGet\("\/channels"\)/.test(cron),
      "cron modal parallel cachedGet",
    );
    const hook = readFileSync(new URL("../src/lib/hooks-detail.ts", import.meta.url), "utf-8");
    assert.ok(
      /Promise\.all\(\[/.test(hook) && /cachedGet\("\/channels"\)/.test(hook),
      "hook modal parallel cachedGet",
    );
  });
});

describe("Kanban tag filter (tag=)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
  const page = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");

  it("loadBoard AND-combines the tag filter with the archived filter", () => {
    assert.ok(
      /\.filter\(\(t: KanbanTask\) => !tag \|\| \(Array\.isArray\(t\.tags\) && t\.tags\.includes\(tag\)\)\)/.test(
        src,
      ),
      "visibleTasks must also filter by exact tag match",
    );
    assert.ok(
      /\.filter\(\(t: KanbanTask\) => \(showArchived \? t\.archived === true : !t\.archived\)\)/.test(src),
      "archived filter must stay in the chain (AND semantics)",
    );
  });

  it("loadBoard restores the tag filter from the URL so it survives navigation", () => {
    assert.ok(
      /new URLSearchParams\(window\.location\.search\)\.get\("tag"\)/.test(src),
      "tag filter is read back from the ?tag= URL param",
    );
    assert.ok(/const tag = tagFilter\.trim\(\)/.test(src), "tag is trimmed before matching");
  });

  it("kanban.ts exposes a tag input and a clear control wired to the URL", () => {
    assert.ok(/kanban-tag-filter/.test(page), "tag filter input must exist");
    assert.ok(/kanban-tag-clear/.test(page), "tag filter clear button must exist");
    assert.ok(/params\.set\("tag", filterTag\)/.test(page), "tag state is written to the URL");
    assert.ok(/params\.delete\("tag"\)/.test(page), "clearing the tag removes the URL param");
    assert.ok(/filterTag = ""/.test(page), "clear control resets the page state");
  });
});

describe("Kanban header layout: board controls below the subtitle", () => {
  const page = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");

  it("orders the header: title, then subtitle, then board controls (dropdown + info line)", () => {
    const titleIdx = page.indexOf("page-title");
    const subIdx = page.indexOf("kanban-page-subtitle");
    const controlsIdx = page.indexOf("kanban-board-controls");
    const summaryIdx = page.indexOf('id="kanban-summary"');
    assert.ok(titleIdx >= 0 && subIdx > titleIdx, "title comes before the subtitle");
    assert.ok(controlsIdx > subIdx, "board controls must appear BELOW the subtitle");
    assert.ok(
      summaryIdx > controlsIdx,
      "board controls must be OUTSIDE the summary row (moved below the subtitle)",
    );
  });

  it("keeps the subtitle a plain heading (no embedded workflow/channel meta)", () => {
    assert.ok(
      /kanban-page-subtitle">Task board<\/p>/.test(page),
      "subtitle should be plain 'Task board' text",
    );
    assert.ok(
      !/sub\.textContent = meta \? `Task board \(\$\{meta\}\)`/.test(page),
      "subtitle must not embed the board meta anymore (info line lives next to the dropdown)",
    );
  });
});
describe("Kanban drag+drop exact position (drop handler)", () => {
  const src = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");

  it("excludes the dragged card from the insert-index computation", () => {
    // The dragged card is still in the DOM while the drag is in flight; computing
    // the insertion index over the full list (dragged card included) made a
    // same-place drop resolve one slot too far down (drift toward the bottom).
    assert.match(
      src,
      /\.filter\(\(card\) => card\.getAttribute\("data-task-id"\) !== taskId\)/,
      "drop handler must exclude the dragged card before computing the insert index",
    );
  });

  it("computes the insert index from the actual drop Y (midpoint comparison, bottom default)", () => {
    assert.match(src, /let insertIndex = cards\.length/, "default must be the bottom of the column");
    assert.match(src, /if \(dropY < midY\)/, "insert index must come from the drop Y vs card midpoints");
  });

  it("sends the computed position to the /position endpoint", () => {
    assert.match(
      src,
      /body: JSON\.stringify\(\{ status: newStatus, position: insertIndex \}\)/,
      "move API must send the exact computed position",
    );
  });
});
