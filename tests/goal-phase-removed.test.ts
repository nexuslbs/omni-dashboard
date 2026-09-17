import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Regression guard (tester, thread 2245): the per-task GOAL STATE
// (goal_phase + goal_blocked_code/message + goal_max_rounds/goal_revision) was
// removed end-to-end — dispatch and the status-change thread lifecycle are
// driven by `status` alone. The Task Details page must therefore no longer
// render a "Goal phase" / "Blocked reason" block, and no goal field may come
// back into the dashboard source. ──

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Recursively collect all .ts files under src/ (skips nothing goal-related). */
function srcFiles(dir: string = SRC): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const GOAL_FIELD = /goal_phase|goal_blocked|goal_max_rounds|goal_revision|VALID_GOAL_PHASES/;

describe("Task Details: goal state is gone", () => {
  const files = srcFiles();

  it("no dashboard source file references a goal state field any more", () => {
    const hits: string[] = [];
    for (const p of files) {
      const src = readFileSync(p, "utf-8");
      src.split("\n").forEach((line, i) => {
        if (GOAL_FIELD.test(line)) hits.push(`${p}:${i + 1}: ${line.trim()}`);
      });
    }
    assert.deepEqual(hits, [], `stale goal-state references:\n${hits.join("\n")}`);
  });

  it("the Task Details renderer no longer renders a Goal phase / Blocked reason block", () => {
    const detail = readFileSync(join(SRC, "lib", "kanban-detail.ts"), "utf-8");
    assert.ok(!/Goal phase/i.test(detail), "the 'Goal phase' block must be removed");
    assert.ok(!/Blocked reason/i.test(detail), "the 'Blocked reason' block must be removed");
  });

  it("no dashboard source file renders a Goal phase / Blocked reason label", () => {
    const hits: string[] = [];
    for (const p of files) {
      const src = readFileSync(p, "utf-8");
      if (/Goal phase|Blocked reason/i.test(src)) hits.push(p);
    }
    assert.deepEqual(hits, [], `stale Goal phase / Blocked reason blocks in: ${hits.join(", ")}`);
  });
});
