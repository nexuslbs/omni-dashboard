import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Canonical item-action contract ──
// task_omnidev_dashboard_unify_item_action_buttons (operator, 2026-09-14):
// the Schedule and Hooks pages must expose the SAME action NAMES in the SAME
// left-to-right order on their LIST pages and on their DETAILS pages:
//
//     Run | Disable/Enable | Edit | Delete | Details
//
// - the 2nd button toggles Disable <-> Enable IN PLACE (position 2 is stable);
// - no alternative wording (no "Trigger now", no "Remove", no glyph prefixes);
// - the Actions page keeps the prefix Run | Disable | Edit | Delete.
// The same task also replaced the details-page field labels with the shared
// kanban `.detail-label` class and removed the border-bottom separators from the
// Hook task-details FIELDS (matching the Schedule task-details page).
//
// The rendered acceptance evidence is the browser gate on the omnidev dev stack
// (thread 1969). These assertions pin the markup contract so a later refactor
// cannot silently reorder or relabel the buttons again.
const src = (p: string) => readFileSync(new URL("../src/" + p, import.meta.url), "utf-8");
const scheduleList = src("lib/schedule-list.ts");
const scheduleDetail = src("lib/schedule-detail.ts");
const hooksList = src("lib/hooks-list.ts");
const hookDetail = src("lib/hook-detail-page.ts");
const actions = src("pages/actions.ts");

/** Markup of the action cell / button row, from `from` up to (incl.) `to`. */
function block(source: string, from: string, to: string, what: string): string {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${what}: "${from}" must be present`);
  const end = source.indexOf(to, start);
  assert.ok(end >= 0, `${what}: "${to}" must terminate the block`);
  return source.slice(start, end + to.length);
}

/** Assert the needles appear in `source` in exactly this order. */
function orderOf(source: string, needles: string[], what: string): void {
  let last = -1;
  for (const n of needles) {
    const at = source.indexOf(n);
    assert.ok(at >= 0, `${what}: "${n}" must be present`);
    assert.ok(at > last, `${what}: "${n}" must come after the previous action`);
    last = at;
  }
}

const GLYPH_PREFIXES = /&#9654; Run|▶ Run|✎ Edit|✕ Delete|⏸ Disable|⏸ Enable/;

describe("Item action buttons: canonical names + left-to-right order", () => {
  it("schedules list row renders Run | Disable/Enable | Edit | Delete | Details", () => {
    const row = block(scheduleList, '<button class="cron-run-btn"', "</td>", "schedules actions cell");
    orderOf(
      row,
      [
        'class="cron-run-btn"',
        'class="cron-toggle-active"',
        'class="cron-edit-btn"',
        'class="cron-delete-btn"',
        'class="cron-details-btn"',
      ],
      "schedules list order",
    );
    assert.ok(/>Run<\/button>/.test(row), "1st action label must be exactly Run");
    assert.ok(
      /\$\{j\.active \? "Disable" : "Enable"\}/.test(row),
      "2nd action must toggle Disable/Enable in place",
    );
    assert.ok(/>Edit<\/button>/.test(row), "3rd action label must be exactly Edit");
    assert.ok(/>Delete<\/button>/.test(row), "4th action label must be exactly Delete");
    assert.ok(/>Details<\/a>/.test(row), "5th action label must be exactly Details");
    assert.ok(!GLYPH_PREFIXES.test(row), "no glyph-prefixed label may survive on the list row");
  });

  it("schedule details page keeps the same order, ending with the back-link", () => {
    const bar = block(
      scheduleDetail,
      '<div id="detail-action-buttons"',
      "</div>",
      "schedule detail action bar",
    );
    orderOf(
      bar,
      [
        'id="detail-run-btn"',
        'id="detail-toggle-active"',
        'id="detail-edit-btn"',
        'id="detail-delete-btn"',
        'id="back-to-schedule"',
      ],
      "schedule details order",
    );
    assert.ok(/>Run<\/button>/.test(bar), "details Run must be exactly Run");
    assert.ok(/>Edit<\/button>/.test(bar), "details Edit must be exactly Edit");
    assert.ok(/>Delete<\/button>/.test(bar), "details Delete must be exactly Delete");
    assert.ok(
      /toggleBtn\.textContent = job\.active \? "Disable" : "Enable";/.test(scheduleDetail),
      "details toggle must read Disable/Enable (verb follows the current state)",
    );
    assert.ok(!GLYPH_PREFIXES.test(bar), "no glyph-prefixed label in the schedule details bar");
  });

  it("hooks list row renders Run | Disable/Enable | Edit | Delete | Details", () => {
    const row = block(hooksList, '<button class="hook-fire-btn"', "</td>", "hooks actions cell");
    orderOf(
      row,
      [
        'class="hook-fire-btn"',
        'class="hook-toggle-btn"',
        'class="hook-edit-btn"',
        'class="hook-delete-btn"',
        'class="hook-details-btn"',
      ],
      "hooks list order",
    );
    assert.ok(/>Run<\/button>/.test(row), "1st action label must be exactly Run (not Fire)");
    assert.ok(
      /\$\{h\.enabled \? "Disable" : "Enable"\}/.test(row),
      "2nd action must toggle Disable/Enable in place",
    );
    assert.ok(/>Edit<\/button>/.test(row), "3rd action label must be exactly Edit");
    assert.ok(/>Delete<\/button>/.test(row), "4th action label must be exactly Delete");
    assert.ok(/>Details<\/a>/.test(row), "5th action label must be exactly Details");
    assert.ok(!GLYPH_PREFIXES.test(row), "no glyph-prefixed label may survive on the hooks row");
  });

  it("hook details page keeps the same order, ending with the back-link", () => {
    const bar = block(
      hookDetail,
      '<div id="hook-detail-action-buttons"',
      "</div>",
      "hook detail action bar",
    );
    orderOf(
      bar,
      [
        'id="hook-detail-fire-btn"',
        'id="hook-detail-toggle-active"',
        'id="hook-detail-edit-btn"',
        'id="hook-detail-delete-btn"',
        'id="back-to-hooks"',
      ],
      "hook details order",
    );
    assert.ok(/>Run<\/button>/.test(bar), "details Run must be exactly Run (not Fire)");
    assert.ok(/>Edit<\/button>/.test(bar), "details Edit must be exactly Edit");
    assert.ok(/>Delete<\/button>/.test(bar), "details Delete must be exactly Delete");
    assert.ok(
      /toggleBtn\.textContent = hook\.enabled \? "Disable" : "Enable";/.test(hookDetail),
      "hook details toggle must read Disable/Enable",
    );
    assert.ok(!GLYPH_PREFIXES.test(bar), "no glyph-prefixed label in the hook details bar");
  });

  it("actions page keeps the prefix Run | Disable/Enable | Edit | Delete", () => {
    orderOf(
      actions,
      [
        'id="action-run-${i}"',
        'id="action-toggle-${i}"',
        'id="action-edit-${i}"',
        'id="action-delete-${i}"',
      ],
      "actions page order",
    );
    assert.ok(/>Run<\/button>/.test(actions), "actions Run must be exactly Run");
    assert.ok(
      /\$\{isDisabled \? "Enable" : "Disable"\}/.test(actions),
      "actions toggle must toggle Disable/Enable in place",
    );
    assert.ok(/>Edit<\/button>/.test(actions), "actions Edit must be exactly Edit");
    assert.ok(/>Delete<\/button>/.test(actions), "actions Delete must be exactly Delete");
    assert.ok(!GLYPH_PREFIXES.test(actions), "no glyph-prefixed label on the actions page");
  });
});

describe("Task-details pages: shared .detail-label + no field separator borders", () => {
  it("schedule details labels every field with the shared .detail-label class", () => {
    const labels = scheduleDetail.match(/<div class="detail-label">/g) ?? [];
    assert.ok(
      labels.length >= 12,
      `.detail-label must label every schedule field (found ${labels.length}, expected >= 12)`,
    );
  });

  it("hook details labels every field with .detail-label and drops the field border-bottom", () => {
    // The hook info fields are generated by the `infoRow` helper (12 call
    // sites) plus the two literal labels of the Prompt and Counters blocks = 14
    // rendered labels - count both shapes.
    const labels = hookDetail.match(/infoRow\(|<div class="detail-label">/g) ?? [];
    assert.ok(
      labels.length >= 14,
      `.detail-label must label every hook field (found ${labels.length}, expected >= 14)`,
    );
    assert.ok(
      !/font-size:0\.72rem;color:var\(--text-muted\)/.test(hookDetail),
      "no leftover inline muted label style on the hook details page",
    );
    const row = block(
      hookDetail,
      "const infoRow = (label: string, value: string) => `",
      "`;",
      "hook info row",
    );
    assert.ok(/class="detail-label"/.test(row), "the hook field row must use .detail-label");
    assert.ok(
      !/border-bottom/.test(row),
      "the hook task-details FIELD row must NOT carry a border-bottom separator",
    );
  });

  it("the hook details page keeps its OTHER legitimate borders (targeted removal)", () => {
    // Only the field rows lost their separator; the surrounding sections still
    // separate themselves with border-top, and nothing was removed globally.
    assert.ok(
      /id="hook-counters" style="margin-top:1rem;padding-top:1rem;border-top:1px solid var\(--border-primary\);"/.test(
        hookDetail,
      ),
      "the counters block keeps its separator",
    );
    assert.ok(
      /padding-top:1rem;border-top:1px solid var\(--border-primary\);/.test(hookDetail),
      "the prompt block keeps its separator",
    );
  });
});
