import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Threads page: channel + profile filters (task_omnidev_dashboard_threads_page_filters) ──
//
// Operator request (2026-09-17): the Threads page must filter threads by
// channel and profile, rendered as selects using the SAME custom initialized
// and styled select component as every other dashboard page (dropdown.ts
// enhanceSelect). Options come from the real /channels and /profiles
// endpoints, the filters combine with each other and with the existing
// status/cause filters (all sent as query params to GET /threads), and the
// selection is persisted in the URL like the other filters.
//
// These assertions pin the wiring so a refactor cannot silently drop the new
// filters or introduce a different select style.

const read = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf-8");

const threadsSrc = read("pages/threads.ts");
const dropdownSrc = read("lib/dropdown.ts");

describe("Threads page channel + profile filters", () => {
  it("renders Channel and Profile filter selects in the filter bar", () => {
    assert.match(threadsSrc, /<select class="filter-select" id="filter-channel">/, "channel select markup");
    assert.match(threadsSrc, /<select class="filter-select" id="filter-profile">/, "profile select markup");
    assert.match(threadsSrc, /<label class="filter-label">Channel<\/label>/, "channel label");
    assert.match(threadsSrc, /<label class="filter-label">Profile<\/label>/, "profile label");
    // The native selects are hidden and replaced by the shared custom dropdown
    assert.match(threadsSrc, /enhanceSelect\("filter-channel"\)/, "channel select enhanced");
    assert.match(threadsSrc, /enhanceSelect\("filter-profile"\)/, "profile select enhanced");
    assert.match(dropdownSrc, /export function enhanceSelect\(/, "enhanceSelect is the shared custom select");
  });

  it("populates the options from the real /channels and /profiles endpoints", () => {
    assert.match(threadsSrc, /cachedGet<Record<string, unknown>\[\]>\("\/channels"\)/, "channels fetched");
    assert.match(threadsSrc, /cachedGet<unknown\[\]>\("\/profiles"\)/, "profiles fetched");
    assert.match(threadsSrc, /chAny\.id \|\| chAny\.name/, "channel option value = channel id/name");
    assert.match(threadsSrc, /\(p as \{ name\?: string \}\)\.name/, "profile option value = profile name");
  });

  it("sends channel and profile query params to GET /threads (combined with status/cause)", () => {
    assert.match(threadsSrc, /if \(currentChannel !== "all"\) params\.set\("channel", currentChannel\)/, "channel param");
    assert.match(threadsSrc, /if \(currentProfile !== "all"\) params\.set\("profile", currentProfile\)/, "profile param");
    // channel and profile are ANDed together with the existing filters in one request
    const loadIdx = threadsSrc.indexOf("async function loadThreads");
    const loadBlock = threadsSrc.slice(loadIdx, loadIdx + 1200);
    assert.ok(
      loadBlock.includes('params.set("status", currentStatus)') &&
        loadBlock.includes('params.set("cause", currentCause)') &&
        loadBlock.includes('params.set("channel", currentChannel)') &&
        loadBlock.includes('params.set("profile", currentProfile)'),
      "status, cause, channel and profile params are built in the same loadThreads request",
    );
  });

  it("persists channel/profile in the URL and restores them from it", () => {
    assert.match(threadsSrc, /params\.set\("channel", currentChannel\)/, "URL sync writes channel");
    assert.match(threadsSrc, /params\.set\("profile", currentProfile\)/, "URL sync writes profile");
    assert.match(threadsSrc, /const channel = p\.get\("channel"\);[\s\S]*?if \(channel\) currentChannel = channel/, "URL restore reads channel");
    assert.match(threadsSrc, /const profile = p\.get\("profile"\);[\s\S]*?if \(profile\) currentProfile = profile/, "URL restore reads profile");
  });

  it("wires change handlers and the Reset button clears the new filters", () => {
    assert.match(threadsSrc, /document\.getElementById\("filter-channel"\)!\.addEventListener\("change"/, "channel change handler");
    assert.match(threadsSrc, /document\.getElementById\("filter-profile"\)!\.addEventListener\("change"/, "profile change handler");
    assert.match(threadsSrc, /currentChannel = "all";[\s\S]*?currentProfile = "all";/, "reset clears both");
    assert.match(threadsSrc, /syncSelectDisplay\("filter-channel"\);[\s\S]*?syncSelectDisplay\("filter-profile"\);/, "reset resyncs both custom dropdowns");
  });
});