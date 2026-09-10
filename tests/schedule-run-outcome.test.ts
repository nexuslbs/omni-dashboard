import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

// ── Schedule run outcome (action-mode fire-and-poll) ──
//
// Regression guard for the "forced action-mode run returns a transport error and
// records no outcome" bug: the dashboard must NOT treat an action trigger as
// fire-and-forget.  It has to poll the recorded run (schedule_runs via
// GET /schedule/{id}/runs) until it is terminal and then report
// success / FAILED with the exit code, plus show the recorded status badge in
// the "Last Run" column.
const detailSrc = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
const listSrc = readFileSync(new URL("../src/lib/schedule-list.ts", import.meta.url), "utf-8");

// Type annotations are stripped first so the declaration can be executed/inspected
// as plain JS (the first `{` after the parameter list is then the body brace).
const detailJs = transformSync(detailSrc, { loader: "ts", format: "esm" }).code;

/** Extract the full declaration (`function name(...) { ... }`) of a top-level function. */
function extractFunction(src: string, name: string): string {
  const start = src.search(new RegExp(`function\\s+${name}\\s*[<(]`));
  assert.ok(start >= 0, `${name} should be declared`);
  let i = src.indexOf("(", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const bodyStart = src.indexOf("{", i);
  depth = 0;
  for (let j = bodyStart; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

// Execute the REAL implementation so the mapping is verified behaviourally
// rather than by text matching alone.
const fnSrc = extractFunction(detailJs, "runOutcomeMessage");
assert.ok(fnSrc.length > 0);
const { runOutcomeMessage } = (await import(
  "data:text/javascript," + encodeURIComponent(fnSrc + "\nexport { runOutcomeMessage };")
)) as { runOutcomeMessage: (o: Record<string, unknown>) => { text: string; isError: boolean } };

function run(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "r1",
    task_key: "job-1",
    trigger: "manual",
    status: "success",
    started_at: null,
    finished_at: null,
    exit_code: 0,
    output: "t-start\nt-done",
    thread_id: 3404,
    error: null,
    ...overrides,
  };
}

describe("runOutcomeMessage (schedule run outcome)", () => {
  it("reports success with exit code and result thread", () => {
    const r = runOutcomeMessage({ runId: "r1", threadId: 3404, timedOut: false, run: run() });
    assert.equal(r.isError, false);
    assert.equal(r.text, "Run succeeded (exit 0) - thread #3404");
  });

  it("reports FAILED with exit code and the first error line", () => {
    const r = runOutcomeMessage({
      runId: "r2",
      threadId: 3445,
      timedOut: false,
      run: run({
        run_id: "r2",
        status: "failed",
        exit_code: 1,
        output: null,
        error: "docker compose command failed (exit 3):\n\n--- stdout (18 chars) ---",
      }),
    });
    assert.equal(r.isError, true);
    assert.equal(r.text, "Run FAILED (exit 1): docker compose command failed (exit 3): - thread #3445");
  });

  it("truncates a very long error line and never reports silence", () => {
    const longError = "E".repeat(400);
    const r = runOutcomeMessage({
      runId: "r3",
      threadId: null,
      timedOut: false,
      run: run({ status: "failed", exit_code: 3, error: longError }),
    });
    assert.equal(r.isError, true);
    assert.match(r.text, /^Run FAILED \(exit 3\): E{160}$/);
  });

  it("reports a failing run with no error text as FAILED (not silence)", () => {
    const r = runOutcomeMessage({
      runId: "r4",
      threadId: null,
      timedOut: false,
      run: run({ status: "failed", exit_code: 2, error: null, output: null }),
    });
    assert.equal(r.isError, true);
    assert.equal(r.text, "Run FAILED (exit 2)");
  });

  it("reports a still-running run when polling hit its deadline", () => {
    const r = runOutcomeMessage({ runId: "r5", threadId: null, timedOut: true, run: null });
    assert.equal(r.isError, false);
    assert.equal(r.text, "Run r5 still running - check run history");
  });

  it("reports an agentic fire (no run record) as a plain thread fire", () => {
    const fired = runOutcomeMessage({ runId: null, threadId: 99, timedOut: false, run: null });
    assert.equal(fired.isError, false);
    assert.equal(fired.text, "Job fired: thread #99");
    const none = runOutcomeMessage({ runId: null, threadId: null, timedOut: false, run: null });
    assert.equal(none.text, "Job fired (no thread created)");
  });
});

describe("fireScheduleRun contract (action runs are polled, not fire-and-forget)", () => {
  const body = extractFunction(detailJs, "fireScheduleRun");

  it("POSTs the trigger and honours the force flag", () => {
    assert.ok(
      body.includes("/api/schedule/${encodeURIComponent(scheduleId)}/run"),
      "must POST the run endpoint",
    );
    assert.ok(body.includes('force ? "?force=true" : ""'), "must forward force=true");
    assert.ok(body.includes('method: "POST"'), "must use POST");
  });

  it("polls the recorded run until it is terminal", () => {
    assert.ok(body.includes("data.run_id"), "must read the run handle from the 202 response");
    assert.ok(body.includes("/runs?limit=10"), "must poll the runs endpoint");
    assert.ok(body.includes('run.status !== "running"'), "must wait for a terminal status");
    assert.ok(body.includes("timedOut: true"), "must report a timeout instead of hanging forever");
  });
});

describe("schedule list wiring (Run button + Last Run badge)", () => {
  it("shows the outcome toast from the polled run", () => {
    assert.ok(listSrc.includes("fireScheduleRun(cronId"), "Run handler must call fireScheduleRun");
    assert.ok(
      listSrc.includes('showToast(msg.text, msg.isError ? "error" : "success")'),
      "must surface the outcome as an error/success toast",
    );
    assert.ok(listSrc.includes(".cron-run-btn"), "Run button must exist");
  });

  it("renders the recorded last_run_status for action jobs", () => {
    assert.ok(listSrc.includes('j.mode === "action" && j.last_run_status'), "badge is action-only");
    assert.ok(listSrc.includes('j.last_run_status === "success"'), "success styling");
  });
});
