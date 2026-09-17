import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Regression tests: a FAILED plugin enable must fail LOUD ──
//    (task_omnidev_memory_plugin_remote_python_fix)
//
// The API is the single source of truth and now returns a non-2xx +
// {success:false, error} when a plugin does not end up running; the dashboard
// toast must still never paint a green "Enabled" card unless the response
// really says the plugin is enabled. These tests pin that defensive check in
// the toggle handler (a 200 whose detail is still error/not_found is a FAILURE).

const pluginUiSrc = readFileSync(
  new URL("../src/lib/plugin-ui.ts", import.meta.url),
  "utf-8",
);

describe("plugin enable fail-loud (no false green 'Enabled' card)", () => {
  it("inspects the returned plugin status after enabling", () => {
    // The toggle handler must read the response body of the enable call.
    assert.match(
      pluginUiSrc,
      /const result = \(await apiPost\(`\/plugins\/\$\{typeDir\}\/\$\{encodedSource\}\/\$\{encodedName\}\/\$\{endpoint\}`/,
      "enable/disable call must capture its response",
    );
    // and refuse to report success for anything that is not `enabled`.
    assert.match(
      pluginUiSrc,
      /result\.status !== "enabled"/,
      "must check the returned status is enabled",
    );
  });

  it("throws with the real status_message instead of showing green", () => {
    assert.match(
      pluginUiSrc,
      /result\.status_message \|\| `plugin did not start \(status: \$\{result\.status\}\)`/,
      "must surface the API status_message (or the raw status) as the error",
    );
    // The thrown error flows into the existing error toast path.
    assert.match(
      pluginUiSrc,
      /showToast\("Failed: " \+ formatApiError\(e\), "error"\);/,
      "failed enable must render the error toast",
    );
  });

  it("only shows the green success toast after the status check", () => {
    const statusCheck = pluginUiSrc.indexOf('result.status !== "enabled"');
    const greenToast = pluginUiSrc.indexOf(
      'showToast(isCurrentlyEnabled ? "Disabled" : "Enabled", "success")',
    );
    assert.ok(statusCheck > 0, "status check present");
    assert.ok(greenToast > 0, "green toast present");
    assert.ok(
      statusCheck < greenToast,
      "the status check must run BEFORE the green toast",
    );
  });
});
