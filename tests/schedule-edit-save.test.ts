import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Schedule edit save payload uses `cron` (regression, thread 2114) ──
//
// The schedule edit form sent the cron expression under the legacy `schedule`
// key, but the omniagent /schedule API (GET/PATCH) reads `cron` (the tasks.yml
// property name). Serde silently dropped the unknown `schedule` key, so an
// edited cron expression never stuck while other fields (e.g. `silent`) saved
// fine. The same stale-key bug class existed on the channels page, which sent
// `current_profile`/`current_provider`/... while the API reads the bare names.
const scheduleSrc = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
const channelSrc = readFileSync(new URL("../src/lib/channel-config.ts", import.meta.url), "utf-8");

describe("schedule edit form save payload", () => {
  it("sends the cron expression under the API field name `cron`", () => {
    assert.ok(
      scheduleSrc.includes("cron: schedule,"),
      "save body must map the schedule input to the `cron` API field",
    );
  });

  it("no longer sends the legacy `schedule` key in the save body", () => {
    // The object literal body must not contain a bare `schedule,` entry
    // (the local variable named `schedule` is fine, the KEY must be `cron`).
    const bodyStart = scheduleSrc.indexOf("const body: Record<string, unknown> = {");
    assert.ok(bodyStart >= 0, "save body object literal must exist");
    const bodyChunk = scheduleSrc.slice(bodyStart, bodyStart + 400);
    assert.ok(
      !/^\s*schedule,/m.test(bodyChunk),
      "save body must not contain the legacy `schedule` key",
    );
  });

  it("still sends the other form fields that already worked (silent, active, etc.)", () => {
    const bodyStart = scheduleSrc.indexOf("const body: Record<string, unknown> = {");
    const bodyChunk = scheduleSrc.slice(bodyStart, bodyStart + 500);
    for (const key of ["name", "prompt", "active", "channel", "profile", "mode", "silent"]) {
      // Keys are either shorthand (`prompt,`) or explicit (`name: nameVal,`).
      assert.ok(
        new RegExp(`\\b${key}\\s*(:[^,]+)?,`).test(bodyChunk),
        `save body must include ${key}`,
      );
    }
  });
});

describe("channel edit form save payload (same bug class)", () => {
  it("sends bare yml property names, not the legacy `current_*` prefix", () => {
    assert.ok(
      channelSrc.includes("let key = field;"),
      "channel save handler must send the bare field name as the API key",
    );
    assert.ok(
      !channelSrc.includes("current_${field}"),
      "legacy current_* key construction must be gone",
    );
  });
});