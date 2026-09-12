import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Profiles page: field-edit Confirm/Cancel buttons + skills links ──────────
// Operator (verbatim, telegram threads 2011 + 2012, 2026-09-12):
//  1. "In the profiles dashboard page, when editing a field, the Confirm and
//     Cancel buttons icons are not centered, they are at the top left of the
//     button area. Use the buttons in the settings page and plugins config edit
//     form in the plugins pages as reference."
//  2. "the skills link buttons at the bottom of the profile boxes lead to a
//     wrong link. It should go to SKILL.md."
//
// Root causes:
//  1. The profile confirm/cancel buttons carried a bare inline box
//     (`width:24px;height:24px;...;padding:0;`) with the SVG as a plain inline
//     child and no flex centering, so the glyph rendered at the top-left of the
//     box. Fix: reuse the shared settings-page action-button classes
//     (.setting-action-btn + .setting-confirm-btn/.setting-cancel-btn), whose
//     rule is `display:inline-flex; align-items:center; justify-content:center`.
//  2. renderSkillsList() linked `<skill>.md` while skills live on disk in a
//     per-skill DIRECTORY holding SKILL.md (`profiles/<name>/skills/<skill>/SKILL.md`),
//     so the explorer link opened a non-existent file.

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

/** Declaration block of a CSS rule, asserting the rule exists. */
const cssRule = (selector: string): string => {
  const at = style.indexOf(selector + " {");
  assert.ok(at >= 0, `style.css must define ${selector}`);
  const block = style.slice(at + selector.length + 2);
  return block.slice(0, block.indexOf("}"));
};

describe("Profiles field-edit Confirm/Cancel buttons", () => {
  it("reuses the shared settings-page action-button classes on both fields", () => {
    for (const fn of ["renderProviderSelect", "renderModelSelect"]) {
      const code = renderReturn(fn);
      assert.ok(
        /class="setting-action-btn setting-confirm-btn profile-edit-confirm"/.test(code),
        `${fn}: confirm button must use the shared centered action-button classes`,
      );
      assert.ok(
        /class="setting-action-btn setting-cancel-btn profile-edit-cancel"/.test(code),
        `${fn}: cancel button must use the shared centered action-button classes`,
      );
    }
  });

  it("dropped the bare 24x24 inline box that rendered the glyph top-left", () => {
    assert.ok(
      !profiles.includes("width:24px;height:24px"),
      "no profile button may keep the one-off inline 24x24 box",
    );
    assert.ok(
      !/style="display:none;width:/.test(profiles),
      "profile buttons must only carry the inline display toggle, not box styling",
    );
  });

  it("the shared .setting-action-btn rule centers the glyph on both axes", () => {
    const rule = cssRule(".setting-action-btn");
    assert.ok(/display:\s*inline-flex/.test(rule), "button must be an inline-flex box");
    assert.ok(/align-items:\s*center/.test(rule), "glyph must be vertically centered");
    assert.ok(/justify-content:\s*center/.test(rule), "glyph must be horizontally centered");
  });

  it("keeps the class selectors the edit wiring toggles", () => {
    assert.ok(
      profiles.includes('document.querySelectorAll(".profile-edit-confirm")'),
      "confirm wiring selector kept",
    );
    assert.ok(
      profiles.includes('document.querySelectorAll(".profile-edit-cancel")'),
      "cancel wiring selector kept",
    );
    assert.ok(
      /confirmBtn\.style\.display = changed \? "inline-flex" : "none"/.test(profiles),
      "the toggle must still show the buttons as inline-flex (matches the shared rule)",
    );
  });
});

describe("Profiles skills links", () => {
  it("points at the real on-disk skill file <skill>/SKILL.md", () => {
    const code = renderReturn("renderSkillsList");
    assert.ok(
      code.includes("%2Fskills%2F${encodeURIComponent(skillName)}%2FSKILL.md"),
      "the href must end with the skill directory + SKILL.md",
    );
    assert.ok(
      !code.includes("encodeURIComponent(skillName)}.md"),
      "the href must not truncate to a bare <skill>.md",
    );
  });

  it("normalises a .md-listed entry to the directory form", () => {
    const code = renderReturn("renderSkillsList");
    assert.ok(
      code.includes('const skillName = s.endsWith(".md") ? s.slice(0, -3) : s;'),
      "a <name>.md entry must be reduced to <name> before appending /SKILL.md",
    );
  });

  it("builds the explorer prefix as one fully encoded path (relative href, no host)", () => {
    const code = renderReturn("renderSkillsList");
    assert.ok(
      code.includes(
        'encodeURIComponent(_explorerPrefix.startsWith("/") ? _explorerPrefix : "/" + _explorerPrefix)',
      ),
      "the _explorerPrefix must be encoded whole, leading slash included",
    );
    assert.ok(
      code.includes("%2Fprofiles%2F${encodeURIComponent(profileName)}%2Fskills%2F"),
      "the profile path segments must stay URL-encoded",
    );
    assert.ok(
      code.includes('href="/explorer?file=${prefix}'),
      "the href must stay a relative /explorer link (no hard-coded host)",
    );
  });
});
