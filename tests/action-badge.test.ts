import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Golden `action: <action_key>` badge (task_omnidev_dashboard_golden_action_action_key) ──
//
// Schedule and hook tasks of type "action" carry an action key + an action
// description. The dashboard must render a GOLDEN badge (same family as the
// Active/Inactive badges) with the text `action: <action_key>` and the html
// title set to the action description, wherever the task's description field
// renders (list and detail pages).
const styleCss = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");
const scheduleList = readFileSync(new URL("../src/lib/schedule-list.ts", import.meta.url), "utf-8");
const scheduleDetail = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
const hooksList = readFileSync(new URL("../src/lib/hooks-list.ts", import.meta.url), "utf-8");
const hookDetailPage = readFileSync(new URL("../src/lib/hook-detail-page.ts", import.meta.url), "utf-8");
const hooksLib = readFileSync(new URL("../src/lib/hooks.ts", import.meta.url), "utf-8");

describe("golden action badge: shared style", () => {
  it("defines a .badge-golden variant in the same family as the status badges", () => {
    assert.ok(styleCss.includes(".badge-golden"), ".badge-golden class must exist in style.css");
    // Same visual family as .badge / .badge-success: translucent bg + border + colored text.
    // The pill shape (border-radius) comes from the shared .badge base class.
    const block = styleCss.slice(styleCss.indexOf(".badge-golden"), styleCss.indexOf(".badge-golden") + 200);
    assert.ok(block.includes("background"), "badge-golden must set a background");
    assert.ok(block.includes("color"), "badge-golden must set a text color");
    assert.match(block, /background:\s*rgba\(/, "badge-golden must use a translucent background");
    assert.match(block, /border:\s*1px solid/, "badge-golden must use a 1px border");
    // Golden hue (yellow/gold, distinct from badge-warning's amber): the badge
    // element carries the shared .badge base class which provides the pill shape.
    assert.match(block, /rgba\(\s*2[45][0-9],\s*2[0-4][0-9],\s*[0-3][0-9],/,
      "badge-golden must have a golden (yellow) background tint");
    assert.ok(styleCss.includes(".badge {\n  display: inline-flex;"), "shared .badge base must still define the pill family");
  });

  it("does not touch the Active/Inactive badge classes", () => {
    assert.ok(styleCss.includes(".badge-success"), ".badge-success must still exist");
    assert.ok(styleCss.includes(".badge-neutral"), ".badge-neutral must still exist");
  });
});

describe("golden action badge: schedule list", () => {
  it("renders `action: <action_key>` as a badge-golden span for action-mode jobs", () => {
    assert.ok(
      scheduleList.includes('j.mode === "action"'),
      "schedule list must branch on action mode",
    );
    assert.ok(
      scheduleList.includes('class="badge badge-golden"'),
      "schedule list must use the golden badge for action jobs",
    );
    assert.ok(
      scheduleList.includes("action: ${escapeHtml(j.action_id"),
      "badge text must be `action: <action_key>`",
    );
  });

  it("sets the html title to the action description", () => {
    assert.ok(
      scheduleList.includes('title="${escapeHtml(j.action_name || j.action_id || "")}"'),
      "badge title must be the action description (action_name)",
    );
  });
});

describe("golden action badge: schedule detail", () => {
  it("renders the golden badge in the Action row", () => {
    assert.ok(
      scheduleDetail.includes('class="badge badge-golden" title="${escapeHtml(job.action_name'),
      "schedule detail Action row must render the golden badge with the description as title",
    );
    assert.ok(
      scheduleDetail.includes("action: ${escapeHtml(job.action_id || \"-\")}"),
      "schedule detail badge text must be `action: <action_key>`",
    );
  });

  it("renders the golden badge in the bottom Action section", () => {
    assert.ok(
      scheduleDetail.includes('job.mode === "action" && job.action_id'),
      "bottom Action section must still be gated on action mode",
    );
    // The bottom section shows the badge above the description box.
    const section = scheduleDetail.slice(scheduleDetail.indexOf("job.mode === \"action\" && job.action_id"));
    assert.ok(
      section.includes('class="badge badge-golden"'),
      "bottom Action section must include the golden badge",
    );
  });
});

describe("golden action badge: hooks list", () => {
  it("renders the golden badge in the Target column for action-mode hooks", () => {
    assert.ok(
      hooksList.includes('h.mode === "action"'),
      "hooks list must branch on action mode",
    );
    assert.ok(
      hooksList.includes('class="badge badge-golden"'),
      "hooks list must use the golden badge for action hooks",
    );
    assert.ok(
      hooksList.includes("action: ${escapeHtml(h.action_id"),
      "hooks list badge text must be `action: <action_key>`",
    );
    assert.ok(
      hooksList.includes('title="${escapeHtml(h.action_name || h.action_id || "")}"'),
      "hooks list badge title must be the action description",
    );
  });

  it("keeps the Target text for non-action hooks", () => {
    assert.ok(
      hooksList.includes("escapeHtml(h.target || \"-\")"),
      "non-action hooks must keep rendering the plain target",
    );
  });
});

describe("golden action badge: hook detail", () => {
  it("renders the golden badge in the Action ID row for action hooks", () => {
    assert.ok(
      hookDetailPage.includes('hook.mode === "action"'),
      "hook detail must branch on action mode",
    );
    assert.ok(
      hookDetailPage.includes('class="badge badge-golden"'),
      "hook detail must use the golden badge for action hooks",
    );
    assert.ok(
      hookDetailPage.includes("action: ${escapeHtml(hook.action_id"),
      "hook detail badge text must be `action: <action_key>`",
    );
    assert.ok(
      hookDetailPage.includes('title="${escapeHtml(hook.action_name || hook.action_id || "")}"'),
      "hook detail badge title must be the action description",
    );
  });
});

describe("golden action badge: payload plumbing", () => {
  it("declares action_name on the Hook interface (backend exposes it)", () => {
    assert.ok(
      hooksLib.includes("action_name: string | null;"),
      "Hook interface must declare action_name so the badge title can read it",
    );
  });
});