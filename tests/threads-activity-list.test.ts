import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Schedule details Activity (envelope bug) + shared threads list ──
//
// Operator report (2026-09-12): /schedules/cron-daily-backup showed
// "No activity from this task yet." even though the job HAD generated threads.
// Root cause: schedule-detail.ts loaded GET /schedule/{id}/threads with a raw
// fetch() + res.json() and read `data.rows` off the RAW body, but omniagent
// wraps every response in {"success":true,"data":{rows,total}} (ok_json). So
// rows were always undefined and the empty state rendered forever.
//
// The fix routes kanban, schedule and hook details through ONE shared list
// (src/lib/threads-list.ts) whose loader goes through apiGet() (envelope-safe),
// removes the schedule Subtasks section (subtasks are per-thread, and a cron
// job can have many threads) and keeps the hook list in parity.
//
// The rendered behaviour was verified on the omnidev dev stack with a real
// browser (Activity lists the threads with their last message, pagination and
// the Recent/Oldest toggle work, the Subtasks card is gone, console clean).
// These assertions pin the wiring so a refactor cannot reintroduce a second
// raw-fetch path that silently renders empty lists.

const read = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf-8");

const threadsListSrc = read("lib/threads-list.ts");
const scheduleDetailSrc = read("lib/schedule-detail.ts");
const kanbanDetailSrc = read("lib/kanban-detail.ts");
const hookDetailSrc = read("lib/hook-detail-page.ts");

describe("Shared threads list is envelope-safe", () => {
  it("loads pages through apiGet (which unwraps {success,data})", () => {
    assert.match(threadsListSrc, /import \{[^}]*apiGet[^}]*\} from "\.\/api"/, "apiGet import");
    assert.ok(!/await fetch\(/.test(threadsListSrc), "threads-list.ts must not fall back to a raw fetch()");
  });

  it("renders the last message of each thread with the shared message card", () => {
    assert.ok(/renderMessageCard\(row\)/.test(threadsListSrc), "rows render via renderMessageCard");
    assert.ok(/wireMessageCardToggles\(el\)/.test(threadsListSrc), "card toggles wired");
    assert.ok(/events-scroll/.test(threadsListSrc), "same scroll container as kanban activity");
  });

  it("has pagination, an order toggle and the Showing X of Z counter", () => {
    assert.ok(/Page \$\{currentPage\} \(\$\{total\} total\)/.test(threadsListSrc), "page info");
    assert.ok(/Showing \$\{start\}\\u2013\$\{end\} of \$\{total\}/.test(threadsListSrc), "counter");
    assert.ok(/order = "desc"/.test(threadsListSrc) && /toggleOrder/.test(threadsListSrc), "order toggle");
  });
});

describe("Schedule details page", () => {
  it("Activity is wired to the shared threads list against /schedule/{id}/threads", () => {
    assert.ok(/createThreadsList\(/.test(scheduleDetailSrc), "uses the shared list");
    assert.match(scheduleDetailSrc, /apiThreadsLoader\(/, "uses the envelope-safe loader");
    assert.match(
      scheduleDetailSrc,
      /\/schedule\/\$\{encodeURIComponent\([^)]*\)\}\/threads/,
      "threads endpoint",
    );
    assert.match(
      scheduleDetailSrc,
      /loadScheduleThreads\(job\.id\)/,
      "details page loads activity for the job",
    );
  });

  it("keeps the kanban-style Activity markup ids (schedule-threads-*)", () => {
    for (const id of [
      'id="schedule-threads"',
      'id="schedule-threads-nav"',
      'id="schedule-threads-prev-page"',
      'id="schedule-threads-next-page"',
      'id="schedule-threads-page-info"',
      'id="schedule-threads-order-btn"',
      'id="schedule-threads-count"',
      'id="schedule-threads-prev-page-bottom"',
      'id="schedule-threads-next-page-bottom"',
      'id="schedule-threads-page-info-bottom"',
      'id="schedule-threads-order-btn-bottom"',
    ]) {
      assert.ok(scheduleDetailSrc.includes(id), `markup must contain ${id}`);
    }
    assert.match(scheduleDetailSrc, /threadsListIds\("schedule"\)/, "ids come from the shared convention");
  });

  it("no raw fetch reads .rows/.total off an enveloped body any more", () => {
    assert.ok(
      !/const\s+data\s*=\s*await\s+res\.json\(\)/.test(scheduleDetailSrc),
      "the raw res.json() body parse that caused the always-empty Activity must be gone",
    );
    assert.ok(!/data\.rows/.test(scheduleDetailSrc), "no unenveloped data.rows read");
  });

  it("drops the per-thread Subtasks section entirely", () => {
    assert.ok(!/schedule-subtasks/.test(scheduleDetailSrc), "#schedule-subtasks container removed");
    assert.ok(!/Subtasks/.test(scheduleDetailSrc), "Subtasks card removed");
    assert.ok(!/loadScheduleSubtasks/.test(scheduleDetailSrc), "loadScheduleSubtasks helper removed");
    assert.ok(
      !/scheduleSubtaskEmoji|scheduleSubtaskBadgeStyle/.test(scheduleDetailSrc),
      "dead helpers removed",
    );
    assert.ok(
      !/\/schedule\/[^`"]*\/subtasks/.test(scheduleDetailSrc),
      "the details page must not call GET /schedule/{id}/subtasks",
    );
  });

  it("still exports the public helpers the pages depend on", () => {
    for (const exp of [
      "formatDate",
      "loadScheduleDetail",
      "loadScheduleThreads",
      "showCronModal",
      "renderScheduleDetail",
    ]) {
      assert.ok(new RegExp(`export (async )?function ${exp}\\b`).test(scheduleDetailSrc), `export ${exp}`);
    }
  });

  it("run-outcome responses are unwrapped too (fireScheduleRun)", () => {
    assert.match(scheduleDetailSrc, /unwrapEnvelope<\{\s*run_id\?: string; thread_id\?: number \}>/);
  });
});

describe("Hook and kanban details share the same list", () => {
  it("hook details loads /hooks/{id}/threads through the shared list", () => {
    assert.ok(/createThreadsList\(/.test(hookDetailSrc), "hook details uses the shared list");
    assert.match(
      hookDetailSrc,
      /apiThreadsLoader\(`\/hooks\/\$\{encodeURIComponent\([^)]*\)\}\/threads`\)/,
      "hooks threads endpoint",
    );
    assert.ok(
      !/await fetch\(\s*`\/api\/hooks\/\$\{encodeURIComponent\([^)]*\)\}\/threads/.test(hookDetailSrc),
      "no raw fetch for hook threads",
    );
  });

  it("kanban details keeps its activity on the shared list", () => {
    assert.ok(/createThreadsList\(/.test(kanbanDetailSrc), "kanban details uses the shared list");
    assert.match(
      kanbanDetailSrc,
      /apiThreadsLoader\(`\/kanban\/tasks\/\$\{encodeURIComponent\([^)]*\)\}\/threads`\)/,
    );
    assert.match(kanbanDetailSrc, /threadsListIds\("kanban"\)/);
  });

  it("all three pages use the SAME element-id convention", () => {
    assert.match(scheduleDetailSrc, /threadsListIds\("schedule"\)/);
    assert.match(hookDetailSrc, /threadsListIds\("hook"\)/);
    assert.match(kanbanDetailSrc, /threadsListIds\("kanban"\)/);
  });
});
