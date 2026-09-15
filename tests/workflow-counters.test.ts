/**
 * Kanban Task Details: workflow counters block.
 *
 * Pins the contract added by "feat(kanban): render workflow counters on the
 * Task Details page": the per-role attempt counters (executor/running,
 * tester/testing, reviewer/review) plus the executions/retries counter, fed by
 * the `counters` object of the task DETAIL endpoint (no extra request), and
 * hidden when the server does not return it.
 *
 * The rendered behaviour is additionally proven against the live dev stack
 * (playwright against the Task Details page); these assertions keep the
 * contract from regressing in a plain `npm test` run.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detail = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
const api = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");

describe("Task Details workflow counters", () => {
  test("api.ts declares the counters contract of the detail endpoint", () => {
    assert.match(api, /export interface KanbanTaskCounters \{/);
    for (const field of ["executor", "tester", "reviewer", "executions", "retries"]) {
      assert.match(api, new RegExp(`${field}: number;`), `counters.${field} must be declared`);
    }
    // Present on the detail payload only (the board list stays lean).
    assert.match(api, /counters\?: KanbanTaskCounters;/);
  });

  test("renders the per-role chips and the executions/retries counter", () => {
    assert.match(detail, /function renderWorkflowCounters\(/);
    assert.ok(
      detail.includes('id="task-workflow-counters"'),
      "the counters block must carry its #task-workflow-counters id",
    );
    for (const label of [
      "Executor (running)",
      "Tester (testing)",
      "Reviewer (review)",
      "Executions/retries:",
    ]) {
      assert.ok(detail.includes(label), `the counters block must render "${label}"`);
    }
    assert.ok(detail.includes("(retries: ${retries})"), "retries must be shown explicitly");
  });

  test("hides the block when the server returns no counters", () => {
    assert.match(detail, /const c = task\.counters;/);
    assert.match(detail, /if \(!c\) return "";/);
  });

  test("tooltips document the per-attempt semantics", () => {
    assert.ok(
      detail.includes("Counts are per attempt, not threads currently in that status."),
      "the row tooltip must spell out the attempt semantics",
    );
    assert.ok(
      detail.includes("executions - 1"),
      "the executions/retries tooltip must explain retries = executions - 1",
    );
  });

  test("loadTaskDetail injects the counters block into the detail grid", () => {
    assert.match(detail, /\$\{renderWorkflowCounters\(task as \{ counters\?: KanbanTaskCounters \}\)\}/);
  });
});
