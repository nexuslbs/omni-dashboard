/**
 * Kanban Task Details: the Thread status row.
 *
 * Pins the contract added by "feat(kanban): show the workflow thread status on
 * the Task Details page": the task DETAIL payload carries `thread_status`
 * (`scheduled` = a workflow thread is queued, `running` = it is processing),
 * rendered as a badge; when the value is absent or outside the active statuses
 * the row shows "No status defined" and NO badge.
 *
 * The rendered behaviour is additionally proven against the live dev stack
 * (playwright against the Task Details page); these assertions keep the
 * contract from regressing in a plain `npm test` run.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVE_THREAD_STATUSES,
  isActiveThreadStatus,
  normalizeThreadStatus,
  renderThreadStatus,
} from "../src/lib/thread-status.ts";

const detail = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
const api = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");

describe("Task Details thread status", () => {
  test("api.ts declares the thread_status contract of the detail endpoint", () => {
    assert.match(api, /thread_status\?: string \| null;/);
    assert.ok(
      api.includes("Live thread status of the task's workflow thread"),
      "the thread_status field must be documented on KanbanTask",
    );
  });

  test("active statuses are exactly scheduled + running", () => {
    assert.deepEqual([...ACTIVE_THREAD_STATUSES], ["scheduled", "running"]);
    assert.ok(isActiveThreadStatus("scheduled"));
    assert.ok(isActiveThreadStatus("running"));
    assert.ok(!isActiveThreadStatus("done"), "done is not a live thread status");
    assert.ok(!isActiveThreadStatus("skipped"));
    assert.ok(!isActiveThreadStatus(""));
    assert.ok(!isActiveThreadStatus(null));
    assert.ok(!isActiveThreadStatus(undefined));
  });

  test("renders a badge for a defined (active) thread status", () => {
    for (const status of ["scheduled", "running"]) {
      const html = renderThreadStatus({ thread_status: status });
      assert.match(html, /class="badge /, `${status} must render a badge`);
      assert.ok(html.includes(`>${status}</span>`), `${status} must be the badge text`);
      assert.ok(
        !html.includes("No status defined"),
        `${status} must not fall back to "No status defined"`,
      );
    }
    assert.ok(
      renderThreadStatus({ thread_status: "running" }).includes("badge-warning"),
      "running is the live/active status (warning tone)",
    );
  });

  test('renders "No status defined" and NO badge when absent or inactive', () => {
    for (const value of [undefined, null, "", "   ", "done", "skipped", "IDLE", 42]) {
      const html = renderThreadStatus({ thread_status: value as unknown });
      assert.ok(
        html.includes("No status defined"),
        `${JSON.stringify(value)} must render "No status defined"`,
      );
      assert.ok(
        !html.includes('class="badge'),
        `${JSON.stringify(value)} must NOT render a badge`,
      );
    }
    // A task object without the key at all (non-workflow task) behaves the same.
    assert.ok(renderThreadStatus({}).includes("No status defined"));
  });

  test("normalises the raw value (trim + non-string safe)", () => {
    assert.equal(normalizeThreadStatus({ thread_status: " running " }), "running");
    assert.equal(normalizeThreadStatus({ thread_status: null }), "");
    assert.equal(normalizeThreadStatus({}), "");
    assert.ok(renderThreadStatus({ thread_status: " running " }).includes("badge-warning"));
  });

  test("the detail page renders the row into the detail grid", () => {
    assert.match(detail, /<div class="detail-label">Thread status<\/div>/);
    assert.match(detail, /<div>\$\{renderThreadStatus\(task\)\}<\/div>/);
    assert.ok(
      detail.includes('import { renderThreadStatus } from "./thread-status";'),
      "kanban-detail.ts must use the shared thread-status renderer",
    );
  });
});
