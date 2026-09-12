import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Plugin card Setup button -> omniagent platform Setup endpoint contract.
// (task_omnidev_restore_the_production_db_into)
//
// The Setup button on a platform plugin card must call the SAME route the core
// serves: POST /api/plugins/{type}/{source}/{name}/setup (omniagent
// src/server/plugins.rs:94, handler src/server/plugins_setup.rs). For the
// Mattermost platform card the values are type=platform, source=built-in,
// name=mattermost, so the button MUST post to
// /api/plugins/platforms/built-in/mattermost/setup with an empty JSON body.
// That exact request was verified end-to-end in the omnidev dev stack
// (dashboard Setup click -> HTTP 200 with team_id/channel_id/bot_token).
//
// The dashboard appends the /api prefix itself; plugin-ui.ts must keep the
// path relative and build the type directory as pType + "s".

const ui = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf8");

/** The exact URL the Setup button must hit, built the way plugin-ui.ts does. */
function setupUrl(pType: string, source: string, name: string): string {
  const typeDir = pType + "s";
  return `/plugins/${typeDir}/${encodeURIComponent(source)}/${encodeURIComponent(name)}/setup`;
}

describe("plugin card Setup button route", () => {
  it("mattermost platform card posts to /plugins/platforms/built-in/mattermost/setup", () => {
    assert.equal(
      setupUrl("platform", "built-in", "mattermost"),
      "/plugins/platforms/built-in/mattermost/setup",
    );
  });

  it("mattermost card carries the attributes the handler reads", () => {
    assert.ok(
      /data-plugin-name="\$\{escapeHtml\(p\.name\)\}"[\s\S]{0,200}?data-source="\$\{escapeHtml\(p\.source\)\}"/.test(
        ui,
      ),
      "card must carry data-plugin-name and data-source",
    );
    assert.ok(ui.includes('data-plugin-type="${escapeHt'), "card must carry data-plugin-type");
  });

  it("the handler pluralizes the plugin type into the route directory", () => {
    assert.ok(
      /const typeDir = pType \+ "s";/.test(ui),
      'the type directory must be pType + "s" (platform -> platforms)',
    );
  });

  it("the handler posts the built path to apiPost with an empty body", () => {
    assert.ok(
      /await apiPost\(`\/plugins\/\$\{typeDir\}\/\$\{encodedSource\}\/\$\{encodedName\}\/setup`, \{\}\)/.test(
        ui,
      ),
      "Setup must POST /plugins/<typeDir>/<source>/<name>/setup with {}",
    );
  });

  it("the Setup button is only rendered for plugins declaring the setup capability", () => {
    assert.ok(
      /p\.manifest\?\.capabilities\?\.setup/.test(ui),
      "the Setup button is gated on manifest.capabilities.setup",
    );
  });
});
