import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Schedules/Hooks Delete buttons + Hooks Details page (regression guard) ──
//
// Operator request (2026-09-12): Delete buttons (destructive, confirm first) on
// the Schedules and Hooks MAIN pages and on the two DETAILS pages, the entry
// really removed from tasks.yml by the core API, and a new Hooks Details page
// (hook counters + associated threads + top action buttons).
//
// The rendered behaviour was verified on the omnidev dev stack (real browser,
// real deletion against a live tasks.yml: entry gone, YAML still valid). These
// assertions pin the wiring - API URLs, confirmation text, shared rose/danger
// styling, button order and route registration - so a later refactor cannot
// silently drop the delete path or the details page again.
const listSrc = readFileSync(new URL("../src/lib/schedule-list.ts", import.meta.url), "utf-8");
const detailSrc = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
const hooksListSrc = readFileSync(new URL("../src/lib/hooks-list.ts", import.meta.url), "utf-8");
const hookDetailSrc = readFileSync(new URL("../src/lib/hook-detail-page.ts", import.meta.url), "utf-8");
const routerSrc = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
const hooksPageSrc = readFileSync(new URL("../src/pages/hooks.ts", import.meta.url), "utf-8");

/** Shared rose/danger button background (same variant as the Actions-page Delete). */
const DANGER_BG = "rgba(244,63,94,0.1)";
/** Row-action (small) button size used by the list pages. */
const ROW_BTN_PAD = "padding:0.2rem 0.5rem";
/** Top-action (header) button size used by the details pages. */
const TOP_BTN_PAD = "padding:0.3rem 0.6rem";

/** Slice a block of markup from the first occurrence of `from` up to (incl.) the next `to`. */
function block(src: string, from: string, to: string, what: string): string {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `${what}: "${from}" should be present`);
  const end = src.indexOf(to, start);
  assert.ok(end >= 0, `${what}: "${to}" should terminate the block`);
  return src.slice(start, end + to.length);
}

/** Slice the wired handler body that follows the given selector. */
function handler(src: string, selector: string, what: string, len = 1600): string {
  const start = src.indexOf(selector);
  assert.ok(start >= 0, `${what}: ${selector} wiring should be present`);
  return src.slice(start, start + len);
}

/** Assert the needles appear in `src` in the given order. */
function orderOf(src: string, needles: string[], what: string): void {
  const at = needles.map((n) => {
    const i = src.indexOf(n);
    assert.ok(i >= 0, `${what}: "${n}" should be present`);
    return i;
  });
  for (let i = 1; i < at.length; i++) {
    assert.ok(at[i] > at[i - 1], `${what}: "${needles[i]}" must come after "${needles[i - 1]}"`);
  }
}

describe("Schedules main page: Delete button", () => {
  it("renders Delete (rose danger) between Activate/Deactivate and Edit, all row buttons same size", () => {
    const row = block(listSrc, '<button class="cron-run-btn"', "</td>", "schedules actions cell");
    orderOf(
      row,
      [
        'class="cron-run-btn"',
        'class="cron-toggle-active"',
        'class="cron-delete-btn"',
        'class="cron-edit-btn"',
        'class="cron-details-btn"',
      ],
      "schedules action order",
    );
    const del = block(row, 'class="cron-delete-btn"', "</button>", "schedule delete button");
    assert.ok(del.includes(DANGER_BG), "Delete must use the shared red/rose danger variant");
    assert.ok(del.includes("accent-rose"), "Delete must use the rose accent colour");
    assert.ok(/>\s*Delete\s*</.test(del), "button label must be Delete");
    // Same size/shape as the sibling Activate/Deactivate button.
    const buttons = row.match(/<button[^>]*>/g) ?? [];
    assert.equal(buttons.length, 4, "row should render exactly 4 action buttons");
    for (const b of buttons) {
      assert.ok(b.includes(ROW_BTN_PAD), `every row button must share ${ROW_BTN_PAD}: ${b}`);
      assert.ok(b.includes("font-size:0.75rem"), "every row button must share the row font size");
    }
  });

  it("confirms first, then DELETEs /api/schedule/:id and reloads the list", () => {
    const h = handler(listSrc, '".cron-delete-btn"', "schedule delete", 1600);
    assert.ok(/confirm\(/.test(h), "must ask for confirmation before deleting");
    assert.ok(/Delete schedule/.test(h), "confirmation must name the destructive action");
    assert.ok(/This cannot be undone/.test(h), "confirmation must warn it is destructive");
    assert.ok(
      /\/api\/schedule\/\$\{encodeURIComponent\(cronId\)\}/.test(h),
      "must call DELETE /api/schedule/{id} (the core endpoint that rewrites tasks.yml)",
    );
    assert.ok(/method:\s*"DELETE"/.test(h), "must use the DELETE method");
    assert.ok(/Schedule deleted/.test(h), "must toast on success");
    assert.ok(/loadCronJobs\(/.test(h), "must reload the list after a successful delete");
    assert.ok(/Failed:/.test(h), "must surface an error toast on failure");
    assert.ok(
      /if \(!res\.ok\) throw/.test(h),
      "must treat a non-2xx response as a failure (no silent success)",
    );
  });
});

describe("Schedule details page: top Delete button", () => {
  it("places a same-size red Delete button between Activate/Deactivate and Edit", () => {
    orderOf(
      detailSrc,
      ['id="detail-toggle-active"', 'id="detail-delete-btn"', 'id="detail-edit-btn"'],
      "schedule details top buttons",
    );
    const del = block(detailSrc, 'id="detail-delete-btn"', "</button>", "detail delete button");
    assert.ok(del.includes(DANGER_BG), "top Delete must use the shared danger background");
    assert.ok(
      del.includes(TOP_BTN_PAD) && del.includes("font-size:0.78rem"),
      "top Delete must match the size of the other top buttons",
    );
  });

  it("confirms, DELETEs the schedule and navigates back to the list", () => {
    const h = handler(detailSrc, 'getElementById("detail-delete-btn")', "detail delete", 1400);
    assert.ok(/confirm\(/.test(h), "must confirm before deleting");
    assert.ok(/Delete schedule/.test(h), "confirmation must name the schedule");
    assert.ok(/method:\s*"DELETE"/.test(h), "must use the DELETE method");
    assert.ok(/\/api\/schedule\//.test(h), "must call the core delete endpoint");
    assert.ok(/Schedule deleted/.test(h), "must toast on success");
    assert.ok(/router\.go\("schedules"\)/.test(h), "must return to the schedules list");
  });
});

describe("Hooks main page: Details button (last) + Delete parity", () => {
  it("renders Delete (rose danger) and Details as the LAST action linking to /hooks/{id}", () => {
    const row = block(hooksListSrc, '<button class="hook-fire-btn"', "</td>", "hooks actions cell");
    orderOf(
      row,
      [
        'class="hook-fire-btn"',
        'class="hook-toggle-btn"',
        'class="hook-edit-btn"',
        'class="hook-delete-btn"',
        'class="hook-details-btn"',
      ],
      "hooks action order",
    );
    const del = block(row, 'class="hook-delete-btn"', "</button>", "hook delete button");
    assert.ok(del.includes(DANGER_BG), "hook Delete must use the shared danger background");
    assert.ok(/>\s*Delete\s*</.test(del), "hook Delete must be labelled Delete");
    const det = block(row, '<a href="/hooks/${encodeURIComponent(h.id)}"', "</a>", "hook details button");
    assert.ok(
      det.includes('href="/hooks/${encodeURIComponent(h.id)}"'),
      "Details must link to the hook details route /hooks/{id}",
    );
    assert.ok(det.includes('class="hook-details-btn"'), "Details keeps its details-btn class");
    assert.ok(/data-hook-id=/.test(det), "Details must carry the hook id for routing");
    assert.ok(/>\s*Details\s*</.test(det), "button label must be Details");
  });

  it("opens the details page through the router and still deletes via the API", () => {
    const wiring = handler(hooksListSrc, '".hook-details-btn"', "details wiring", 900);
    assert.ok(/router\.go\("hooks\/" \+ hookId\)/.test(wiring), "must route to hooks/{id}");
    assert.ok(/history\.pushState/.test(wiring), "must push the /hooks/{id} history entry");
    const del = handler(hooksListSrc, '".hook-delete-btn"', "hook delete wiring", 1200);
    assert.ok(/confirm\(/.test(del), "hook delete must confirm first");
    assert.ok(
      /\/api\/hooks\//.test(del) && /method:\s*"DELETE"/.test(del),
      "hook delete must DELETE /api/hooks/{id}",
    );
    assert.ok(/Hook deleted/.test(del), "hook delete must toast on success");
    assert.ok(/reload\(\)|loadHooks\(/.test(del), "hook delete must reload the list");
  });
});

describe("Hook details page", () => {
  it("is registered as a parameter route and exported", () => {
    assert.ok(
      /\{\s*prefix:\s*"hooks\/",\s*handler:\s*renderHookDetail\s*\}/.test(routerSrc),
      'router must register the "hooks/" parameter route with renderHookDetail',
    );
    assert.ok(
      /export\s*\{\s*renderHookDetail\s*\}/.test(hooksPageSrc),
      "pages/hooks.ts must re-export renderHookDetail",
    );
  });

  it("shows the hook counters, the associated threads and the top action buttons", () => {
    assert.ok(/id="hook-counters"/.test(hookDetailSrc), "must render a hook counters block");
    assert.ok(/Counters/.test(hookDetailSrc), "the counters block must be labelled Counters");
    assert.ok(
      /\/api\/hooks\/\$\{encodeURIComponent\(hookId\)\}\/threads/.test(hookDetailSrc),
      "must fetch the hook's threads from GET /hooks/{id}/threads",
    );
    for (const id of [
      "hook-detail-fire-btn",
      "hook-detail-toggle-active",
      "hook-detail-delete-btn",
      "hook-detail-edit-btn",
    ]) {
      assert.ok(hookDetailSrc.includes(id), `top action button ${id} must exist`);
    }
    const del = block(hookDetailSrc, 'id="hook-detail-delete-btn"', "</button>", "hook detail delete button");
    assert.ok(del.includes("DANGER_STYLE"), "top Delete must reuse the shared danger style");
    assert.ok(
      /const DANGER_STYLE =/.test(hookDetailSrc) && hookDetailSrc.includes(DANGER_BG),
      "the danger style must be the shared rose background",
    );
  });

  it("deletes the hook from its details page, with confirmation, and goes back", () => {
    const h = handler(
      hookDetailSrc,
      'getElementById("hook-detail-delete-btn")',
      "hook detail delete wiring",
      1400,
    );
    assert.ok(/confirm\(/.test(h), "must confirm before deleting");
    assert.ok(/removes it from tasks\.yml/.test(h), "confirmation must say the entry leaves tasks.yml");
    assert.ok(/method:\s*"DELETE"/.test(h), "must use the DELETE method");
    assert.ok(
      /\/api\/hooks\/\$\{encodeURIComponent\(hookId\)\}/.test(h),
      "must call the core hooks delete endpoint",
    );
    assert.ok(/router\.go\("hooks"\)/.test(h), "must navigate back to the hooks list");
  });
});
