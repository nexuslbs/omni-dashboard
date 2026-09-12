import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Plugin card Download/Update mutual exclusion ──
// (task_omnidev_dashboard_plugin_cards_show_the)
//
// A remote plugin whose source has NOT been downloaded yet (server
// needs_download=true / has_source_code=false, card shows the "No code" badge)
// must offer ONLY Download. Once the source is on disk the same card must offer
// ONLY Update. Before the fix `showScriptUpdate` also fired in the
// not-downloaded case (isCompilable=false, isInstalled=!needsBuild=true), so
// Download and Update rendered together.
// The invariant lives in src/lib/plugin-ui.ts pluginActionState().

const plugin = (over: Record<string, unknown>): Record<string, unknown> => ({
  name: "demo",
  pluginType: "tool",
  source: "remote",
  status: "disabled",
  manifest: {},
  config: {},
  ...over,
});

const load = async () =>
  (await import("../src/lib/plugin-ui.ts")) as {
    pluginActionState: (p: unknown) => "download" | "update" | "none";
    renderActionButtons: (p: unknown) => string;
  };

const hasDownload = (html: string): boolean => html.includes("plugin-download-btn");
const hasUpdate = (html: string): boolean => html.includes("plugin-update-btn");

describe("plugin card Download/Update state", () => {
  it("remote + no source (needs_download) -> ONLY Download", async () => {
    const { pluginActionState, renderActionButtons } = await load();
    const p = plugin({ needsDownload: true, hasSourceCode: false, needsBuild: false });
    assert.equal(pluginActionState(p), "download");
    const html = renderActionButtons(p);
    assert.ok(hasDownload(html), "Download must be present");
    assert.ok(!hasUpdate(html), "Update must NOT be offered before the source exists");
    assert.ok(!html.includes("plugin-install-btn"), "no Install in the download state");
    assert.ok(!html.includes("plugin-reinstall-btn"), "no Reinstall in the download state");
  });

  it("remote + no source derived from has_source_code=false -> ONLY Download", async () => {
    const { pluginActionState, renderActionButtons } = await load();
    const p = plugin({ hasSourceCode: false, needsBuild: false });
    assert.equal(pluginActionState(p), "download");
    const html = renderActionButtons(p);
    assert.ok(hasDownload(html), "Download must be present");
    assert.ok(!hasUpdate(html), "Update must NOT be offered before the source exists");
  });

  it("remote + downloaded script source -> ONLY Update", async () => {
    const { pluginActionState, renderActionButtons } = await load();
    const p = plugin({ needsDownload: false, hasSourceCode: true, isScript: true, needsBuild: false });
    assert.equal(pluginActionState(p), "update");
    const html = renderActionButtons(p);
    assert.ok(hasUpdate(html), "Update must be present");
    assert.ok(!hasDownload(html), "Download must NOT be offered once downloaded");
  });

  it("remote + downloaded compilable source -> ONLY Update", async () => {
    const { pluginActionState, renderActionButtons } = await load();
    const p = plugin({ needsDownload: false, hasSourceCode: true, isScript: false, needsBuild: false });
    assert.equal(pluginActionState(p), "update");
    const html = renderActionButtons(p);
    assert.ok(hasUpdate(html), "Update must be present");
    assert.ok(!hasDownload(html), "Download must NOT be offered once downloaded");
  });

  it("built-in -> no action state, no buttons", async () => {
    const { pluginActionState, renderActionButtons } = await load();
    const p = plugin({ source: "built-in", hasSourceCode: true, needsBuild: false });
    assert.equal(pluginActionState(p), "none");
    assert.equal(renderActionButtons(p), "");
  });

  it("bundled installed -> no Download/Update (behaviour unchanged)", async () => {
    const { pluginActionState, renderActionButtons } = await load();
    const p = plugin({ source: "bundled", hasSourceCode: true, needsBuild: false });
    assert.equal(pluginActionState(p), "none");
    const html = renderActionButtons(p);
    assert.ok(!hasDownload(html) && !hasUpdate(html));
  });

  it("remote source downloaded but not built yet -> Install only", async () => {
    const { pluginActionState, renderActionButtons } = await load();
    const p = plugin({ needsDownload: false, hasSourceCode: true, isScript: false, needsBuild: true });
    assert.equal(pluginActionState(p), "none");
    const html = renderActionButtons(p);
    assert.ok(html.includes("plugin-install-btn"), "Install must be present");
    assert.ok(!hasDownload(html) && !hasUpdate(html), "neither Download nor Update");
  });

  it("invariant: Download and Update never render together (full state sweep)", async () => {
    const { renderActionButtons } = await load();
    const sources = ["built-in", "installed", "bundled", "remote", "mcp_config"];
    let cases = 0;
    for (const source of sources)
      for (const needsDownload of [true, false, undefined])
        for (const hasSourceCode of [true, false])
          for (const isScript of [true, false])
            for (const needsBuild of [true, false]) {
              const p = plugin({ source, needsDownload, hasSourceCode, isScript, needsBuild });
              const html = renderActionButtons(p);
              cases += 1;
              assert.ok(
                !(hasDownload(html) && hasUpdate(html)),
                `Download and Update rendered together for ${JSON.stringify(p)}`,
              );
            }
    assert.equal(cases, 120, "the whole state matrix must be covered");
  });
});
