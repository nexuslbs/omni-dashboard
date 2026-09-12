import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Dashboard header-button polish (task_omnidev_dashboard_ui_polish_header_button) ──
// Items 1-2: the Models/Channels header "↻ Refresh" (green) and "✕ Reset" (red)
// must reuse the shared header-button geometry AND the dashboard's existing
// Enable green / danger red, inside the same right-aligned group as "Import".
// Item 3: "+ Create Profile" sits in the right-aligned page-header group and the
// Create Profile modal no longer asks for a provider and documents the real
// default (all enabled tools unless a toolset is assigned).
// Item 4: the Actions "Import" sits in the right-aligned header group with
// "+ New Action".

const page = (f: string): string => readFileSync(new URL("../src/pages/" + f, import.meta.url), "utf-8");
const style = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

const btnLine = (content: string, id: string): string => {
  const line = content.split("\n").find((l) => l.includes(`id="${id}"`));
  assert.ok(line, `button #${id} must be rendered`);
  return line as string;
};

// Shared header-button geometry (the Import reference on every page).
const SHARED_SIZE = ["border-radius:6px", "padding:0.375rem 0.9rem", "font-size:0.8rem"];
// The existing hues reused (never a new hex): Providers "Enable" green + danger red.
const GREEN = ["background:rgba(16,185,129,0.1)", "border:1px solid rgba(16,185,129,0.2)", "color:#34d399"];
const RED = ["background:rgba(244,63,94,0.1)", "border:1px solid rgba(244,63,94,0.2)", "color:#fb7185"];
const HELP_TEXT =
  "By default all enabled tools are available to the profile. You can restrict them by assigning a toolset after creation in the profile settings.";

describe("Models header buttons (item 1)", () => {
  const content = page("models.ts");

  it("↻ Refresh reuses the shared .btn geometry of Import / + Add Provider", () => {
    const refresh = btnLine(content, "refresh-models-btn");
    const imp = btnLine(content, "models-import-btn");
    const add = btnLine(content, "add-provider-btn");
    assert.ok(/class="btn"/.test(refresh), "refresh keeps the shared .btn class");
    for (const tok of SHARED_SIZE) {
      assert.ok(refresh.includes(tok), `refresh must carry ${tok}`);
      assert.ok(imp.includes(tok), `Import reference must carry ${tok}`);
      assert.ok(add.includes(tok), `+ Add Provider reference must carry ${tok}`);
    }
  });

  it("↻ Refresh uses the existing Enable green (no new hue)", () => {
    const refresh = btnLine(content, "refresh-models-btn");
    for (const tok of GREEN) assert.ok(refresh.includes(tok), `refresh must carry ${tok}`);
    assert.ok(style.includes("#34d399"), "the Enable green already exists in style.css");
  });

  it("Import / + Add Provider / ↻ Refresh share ONE right-aligned header group", () => {
    assert.ok(
      /class="filter-actions" style="margin-left:auto;"/.test(content),
      "the header group is right-aligned",
    );
    const i = content.indexOf('id="models-import-btn"');
    const block = content.slice(i, i + 900);
    assert.ok(block.includes('id="add-provider-btn"') && block.includes('id="refresh-models-btn"'));
  });
});

describe("Channels header buttons (item 2)", () => {
  const content = page("channels.ts");

  it("↻ Refresh and ✕ Reset reuse the shared .btn geometry of Import", () => {
    const imp = btnLine(content, "channels-import-btn");
    for (const id of ["refresh-channels-btn", "reset-channels-filter"]) {
      const b = btnLine(content, id);
      assert.ok(/class="btn"/.test(b), `${id} keeps the shared .btn class`);
      for (const tok of SHARED_SIZE) assert.ok(b.includes(tok), `${id} must carry ${tok}`);
    }
    for (const tok of SHARED_SIZE) assert.ok(imp.includes(tok), `Import reference must carry ${tok}`);
  });

  it("↻ Refresh is the Enable green and ✕ Reset the dashboard danger red", () => {
    for (const tok of GREEN)
      assert.ok(btnLine(content, "refresh-channels-btn").includes(tok), `refresh must carry ${tok}`);
    for (const tok of RED)
      assert.ok(btnLine(content, "reset-channels-filter").includes(tok), `reset must carry ${tok}`);
    assert.ok(style.includes("244, 63, 94"), "the danger red already exists in style.css");
  });

  it("Import / ↻ Refresh / ✕ Reset sit together in the header group", () => {
    const i = content.indexOf('id="channels-import-btn"');
    const block = content.slice(i, i + 1200);
    assert.ok(block.includes('id="refresh-channels-btn"') && block.includes('id="reset-channels-filter"'));
  });
});

describe("Profiles header + Create Profile modal (item 3)", () => {
  const content = page("profiles.ts");

  it("+ Create Profile and Import form the RIGHT-aligned page-header group", () => {
    assert.ok(
      /class="page-header"[\s\S]{0,700}?display:flex;align-items:center;gap:0\.5rem;[\s\S]{0,1500}?id="create-profile-btn"[\s\S]{0,1500}?id="profiles-import-btn"/.test(
        content,
      ),
      "both buttons must live in the flex group inside .page-header",
    );
  });

  it("the Create Profile modal asks for the name only (no provider field, no model section)", () => {
    assert.ok(!/create-profile-provider/.test(content), "no provider field id in the modal");
    assert.ok(!/create-profile-model/.test(content), "no model field id in the modal");
    assert.ok(!/No tools will be enabled by default/.test(content), "the old misleading text is gone");
  });

  it("creation posts the name only, so a provider-less profile is legal", () => {
    assert.ok(/id="create-profile-name"/.test(content));
    assert.ok(/apiPost\("\/profiles", \{ name \}\)/.test(content), "create sends { name } only");
  });

  it("the helper text documents the real default (all enabled tools unless a toolset is set)", () => {
    assert.ok(content.includes(HELP_TEXT), "the exact intended sentence must be present");
  });
});

describe("Actions header button (item 4)", () => {
  const content = page("actions.ts");

  it("Import sits in the RIGHT-aligned page-header group next to + New Action", () => {
    assert.ok(
      /class="page-header"[\s\S]{0,700}?display:flex;align-items:center;gap:0\.5rem;[\s\S]{0,1200}?id="actions-import-btn"[\s\S]{0,1200}?id="btn-create-action"/.test(
        content,
      ),
      "Import and + New Action must share the right-aligned page-header flex group",
    );
  });
});
