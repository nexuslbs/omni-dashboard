import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Toolsets page (task_omnidev in omnidev backlog, 2026-09-12) ──
// Operator (verbatim, three merged sub-prompts):
//  1. "make the Edit and Delete buttons follow the dashboard buttons styling
//      (see the Actions page Edit and Delete buttons as reference)"
//  2. "should allow to collapse a toolset box in the Toolsets page, to show only
//      the header (see the collapse of kanban panels (status) as reference)"
//  3. "should show \"{current} tools / {total} total\" in the header instead of
//      just \"{current} tools\""
//
// These are source-level guards: the rendered verification on the omnidev dev
// stack is the acceptance evidence for the UI, this suite pins the contract so a
// later edit cannot silently regress the buttons, the collapse or the counts.

const toolsets = readFileSync(new URL("../src/pages/toolsets.ts", import.meta.url), "utf-8");
const actions = readFileSync(new URL("../src/pages/actions.ts", import.meta.url), "utf-8");
const style = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

/** Whole source of the `function <name>(` renderer in toolsets.ts. */
const fnBody = (fnName: string): string => {
  const start = toolsets.indexOf(`function ${fnName}(`);
  assert.ok(start >= 0, `${fnName} must exist in toolsets.ts`);
  const nextFn = toolsets.indexOf("\nfunction ", start + 1);
  return toolsets.slice(start, nextFn === -1 ? undefined : nextFn);
};

/** Declaration block of a CSS rule, asserting the rule exists. */
const cssRule = (selector: string): string => {
  const at = style.indexOf(selector + " {");
  assert.ok(at >= 0, `style.css must define ${selector}`);
  const block = style.slice(at + selector.length + 2);
  return block.slice(0, block.indexOf("}"));
};

describe("Toolsets page: Edit/Delete buttons follow the Actions-page styling", () => {
  it("Actions page keeps the reference markup (Edit purple / Delete danger)", () => {
    // The Actions page is the reference and must NOT be changed by this task.
    assert.ok(
      /class="btn btn-sm action-btn-table"[^>]*>✎ Edit<\/button>/.test(actions),
      "Actions Edit button intact",
    );
    assert.ok(
      /class="btn btn-sm btn-danger"[^>]*>✕ Delete<\/button>/.test(actions),
      "Actions Delete button intact",
    );
  });

  it("Toolsets Edit/Delete reuse the shared classes (no ad-hoc inline colours)", () => {
    const card = fnBody("renderToolsetCard");
    assert.ok(
      /class="btn btn-sm btn-action ts-edit"[^>]*>✎ Edit<\/button>/.test(card),
      "Edit must use the shared .btn .btn-sm .btn-action classes with the Actions-page label",
    );
    assert.ok(
      /class="btn btn-sm btn-danger ts-delete"[^>]*>✕ Delete<\/button>/.test(card),
      "Delete must use the shared .btn .btn-sm .btn-danger classes with the Actions-page label",
    );
    assert.ok(!/#f43f5e/.test(card), "no ad-hoc inline red hex on the Toolsets buttons");
    assert.ok(
      !/ts-edit"[^>]*style="/.test(card) && !/ts-delete"[^>]*style="/.test(card),
      "no inline style on the Toolsets Edit/Delete buttons",
    );
  });

  it(".btn-sm matches the compact size the Actions-page buttons use inline", () => {
    const rule = cssRule(".btn-sm");
    for (const decl of [
      "border-radius: 4px",
      "padding: 0.2rem 0.5rem",
      "font-size: 0.75rem",
      "line-height: 1.4",
    ]) {
      assert.ok(rule.includes(decl), `.btn-sm must declare ${decl}`);
    }
  });

  it(".btn-action is the shared purple variant of the Actions-page Edit button", () => {
    const rule = cssRule(".btn-action");
    assert.ok(/background:\s*rgba\(139, 92, 246, 0\.15\)/.test(rule), "purple background");
    assert.ok(/border:\s*1px solid rgba\(139, 92, 246, 0\.3\)/.test(rule), "purple border");
    assert.ok(/color:\s*var\(--accent-purple\)/.test(rule), "accent-purple text");
  });

  it("Delete keeps the existing shared danger variant", () => {
    const rule = cssRule(".btn-danger");
    assert.ok(/rgba\(244, 63, 94/.test(rule), ".btn-danger stays the shared red variant");
  });
});

describe("Toolsets page: collapsible toolset boxes", () => {
  it("each card renders a chevron toggle in the header with aria state", () => {
    const card = fnBody("renderToolsetCard");
    assert.ok(/class="ts-collapse-toggle"/.test(card), "toggle button rendered");
    assert.ok(/aria-expanded="\$\{!collapsed\}"/.test(card), "aria-expanded reflects the state");
    assert.ok(/CHEVRON_DOWN_SVG/.test(card), "same chevron as the kanban panels");
    assert.ok(
      /toolsets-card\$\{collapsed \? " collapsed" : ""\}/.test(card),
      "card carries the collapsed class",
    );
  });

  it("the collapsed box keeps its header (title + counts + Edit/Delete)", () => {
    const card = fnBody("renderToolsetCard");
    const header = card.slice(card.indexOf('<div class="card-header">'));
    for (const sel of ["card-title", "ts-tool-count", "ts-edit", "ts-delete"]) {
      assert.ok(header.includes(sel), `${sel} stays in the header (visible while collapsed)`);
    }
  });

  it("collapse state is per box, kept in a module Set and mirrored to sessionStorage", () => {
    assert.ok(/COLLAPSE_LS_KEY = "toolsets-card-collapsed"/.test(toolsets), "sessionStorage key");
    assert.ok(/function collapseState\(\)/.test(toolsets), "module Set accessor");
    assert.ok(/window\.sessionStorage\.setItem\(COLLAPSE_LS_KEY/.test(toolsets), "state persisted");
    assert.ok(/function persistCollapseState\(\)/.test(toolsets), "persist helper");
  });

  it("the toggle flips the class, the aria state and the persisted set", () => {
    const wiring = toolsets.slice(
      toolsets.indexOf('querySelectorAll<HTMLButtonElement>(".ts-collapse-toggle")'),
    );
    const handler = wiring.slice(0, wiring.indexOf('querySelectorAll<HTMLButtonElement>(".ts-edit")'));
    assert.ok(handler.length > 0, "toggle wiring must exist before the edit wiring");
    assert.ok(/card\.classList\.toggle\("collapsed", nowCollapsed\)/.test(handler), "class toggled");
    assert.ok(
      /state\.add\(id\)/.test(handler) && /state\.delete\(id\)/.test(handler),
      "per-box state updated",
    );
    assert.ok(
      /setAttribute\("aria-expanded", String\(!nowCollapsed\)\)/.test(handler),
      "aria-expanded updated",
    );
    assert.ok(/persistCollapseState\(\)/.test(handler), "state persisted on toggle");
  });

  it("style: collapsed box hides the body and rotates the chevron up", () => {
    assert.ok(
      /display:\s*none/.test(cssRule(".toolsets-card.collapsed .card-body")),
      "body hidden while collapsed",
    );
    assert.ok(
      /rotate\(180deg\)/.test(cssRule(".toolsets-card.collapsed .ts-collapse-toggle svg")),
      "chevron flips",
    );
    assert.ok(
      /cursor:\s*pointer/.test(cssRule(".toolsets-card .ts-collapse-toggle")),
      "toggle is a clickable affordance",
    );
  });
});

describe("Toolsets page: header count '{current} tools / {total} total'", () => {
  it("total is derived from the plugin catalogue, not hard-coded", () => {
    const helper = fnBody("totalToolCount");
    assert.ok(/_plugins/.test(helper), "total comes from the tool catalogue");
    assert.ok(/reduce/.test(helper), "total sums every plugin's tools");
  });

  it("the header renders current / total with the existing pluralisation", () => {
    const card = fnBody("renderToolsetCard");
    assert.ok(/const current = selected\.length;/.test(card), "current = tools selected in this toolset");
    assert.ok(/const total = totalToolCount\(\);/.test(card), "total = available tools");
    assert.ok(
      /\$\{current\} tool\$\{current === 1 \? "" : "s"\} \/ \$\{total\} total/.test(card),
      "header label is exactly '{current} tool(s) / {total} total'",
    );
    assert.ok(
      /\$\{current === 0 \? " \(none allowed\)" : ""\}/.test(card),
      "the existing '(none allowed)' hint is kept",
    );
  });
});
