import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Profiles page: Toolset select width (task_omnidev_profiles_page_toolset) ──
// Operator (verbatim): "In the profiles page, the toolset field should have a max
// width as the other select fields, like provider and model".
//
// Root cause: the Toolset row renders its own `.setting-controls` with an inline
// `max-width:none` (so the long help text below spans the card). The provider /
// model rows keep the default `.setting-controls { max-width: 420px }`, and that
// cap is what bounds their selects. The Toolset select therefore stretched to the
// full card width. The fix gives the Toolset control the same 420px cap via the
// `.profile-toolset-control` wrapper class, leaving the row itself uncapped.

const profiles = readFileSync(new URL("../src/pages/profiles.ts", import.meta.url), "utf-8");
const style = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

/** Source of the template literal returned by the `function <name>(` renderer. */
const renderReturn = (fnName: string): string => {
  const start = profiles.indexOf(`function ${fnName}(`);
  assert.ok(start >= 0, `${fnName} must exist in profiles.ts`);
  const nextFn = profiles.indexOf("\nfunction ", start + 1);
  const body = profiles.slice(start, nextFn === -1 ? undefined : nextFn);
  const retAt = body.indexOf("return `");
  assert.ok(retAt >= 0, `${fnName} must return a template literal`);
  const code = body.slice(retAt + "return `".length);
  const end = code.indexOf("`;");
  assert.ok(end >= 0, `${fnName} template literal must terminate`);
  return code.slice(0, end);
};

/** Whole source of the `function <name>(` renderer (body + returned template). */
const renderBody = (fnName: string): string => {
  const start = profiles.indexOf(`function ${fnName}(`);
  assert.ok(start >= 0, `${fnName} must exist in profiles.ts`);
  const nextFn = profiles.indexOf("\nfunction ", start + 1);
  return profiles.slice(start, nextFn === -1 ? undefined : nextFn);
};

/** Declaration block of a CSS rule, asserting the rule exists. */
const cssRule = (selector: string): string => {
  const at = style.indexOf(selector + " {");
  assert.ok(at >= 0, `style.css must define ${selector}`);
  const block = style.slice(at + selector.length + 2);
  return block.slice(0, block.indexOf("}"));
};

// The exact row wrapper used by the Provider / Model selects (consistency reference).
const FLEX_WRAPPER = "display:flex;align-items:center;gap:0.375rem";

describe("Profiles toolset select width", () => {
  it("root cause: .setting-controls is a column flex container capped at 420px", () => {
    const rule = cssRule(".setting-controls");
    assert.ok(/flex-direction:\s*column/.test(rule), ".setting-controls must stay a column flex container");
    assert.ok(/max-width:\s*420px/.test(rule), ".setting-controls still caps its width at 420px");
  });

  it("the Toolset row keeps its uncapped .setting-controls (help text spans the card)", () => {
    assert.ok(
      profiles.includes('<div class="setting-controls" style="max-width:none;">'),
      "the Toolset/Skills rows must keep the inline max-width:none override",
    );
    assert.ok(/<div class="setting-name">Toolset<\/div>/.test(profiles), "the Toolset row must still render");
  });

  it("toolset renderer wraps the select in .profile-toolset-control", () => {
    const code = renderReturn("renderProfileToolsetField");
    assert.ok(
      /<div class="profile-toolset-control">\s*<select[^>]*class="profile-toolset-select"/.test(code),
      "the toolset select must be wrapped in the capped control box",
    );
    assert.ok(/\n\s*<\/div>\s*$/.test(code), "the wrapper div must be closed after the select");
  });

  it("the wrapper rule matches the provider/model width regime (flex row + 420px cap)", () => {
    const rule = cssRule(".profile-toolset-control");
    assert.ok(/display:\s*flex/.test(rule), "wrapper must be a flex container");
    assert.ok(/align-items:\s*center/.test(rule), "wrapper must center its content");
    assert.ok(
      /max-width:\s*420px/.test(rule),
      "wrapper must cap at the same 420px the provider/model selects inherit",
    );
    assert.ok(
      /max-width:\s*420px/.test(cssRule(".setting-controls")),
      "the cap must equal the .setting-controls cap (no new magic value)",
    );
  });

  it("provider and model selects keep their inline flex wrapper (reference behaviour)", () => {
    for (const fn of ["renderProviderSelect", "renderModelSelect"]) {
      const code = renderReturn(fn);
      assert.ok(code.includes(FLEX_WRAPPER), `${fn} must keep the row flex wrapper`);
      assert.ok(
        /<div style="display:flex[^>]*>\s*<select/.test(code),
        `${fn}: select must be a flex item in the wrapper`,
      );
    }
  });

  it("toolset select keeps its options, attributes and save wiring", () => {
    const body = renderBody("renderProfileToolsetField");
    const code = renderReturn("renderProfileToolsetField");
    assert.ok(body.includes("None (All tools allowed)"), "empty option label unchanged");
    assert.ok(body.includes("(undefined)"), "unknown-value fallback option unchanged");
    assert.ok(body.includes("_toolsetIds"), "known toolsets still listed");
    assert.ok(/class="profile-toolset-select"/.test(code), "class kept (change handler selector)");
    assert.ok(/data-profile-name="\$\{escapeHtml\(profileName\)\}"/.test(code), "data-profile-name kept");
    assert.ok(/data-original="\$\{escapeHtml\(current \|\| ""\)\}"/.test(code), "data-original kept");

    const wiring = profiles.slice(profiles.indexOf('document.querySelectorAll(".profile-toolset-select")'));
    const handler = wiring.slice(0, wiring.indexOf("document.querySelectorAll(", 10));
    assert.ok(/select\.addEventListener\("change"/.test(handler), "change handler kept");
    assert.ok(
      /method: "PATCH"/.test(handler) && /toolset: select\.value/.test(handler),
      "PATCH toolset kept",
    );
    assert.ok(
      /select\.setAttribute\("data-original", select\.value\)/.test(handler),
      "data-original update kept",
    );
  });
});
