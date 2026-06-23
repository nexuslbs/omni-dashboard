import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Page render function smoke tests ──
// Verify that each page module exports a render function that exists

describe("Page modules exist and export render functions", () => {
  const pagesToCheck = [
    { name: "kanban", exports: ["renderKanban", "renderKanbanDetail"] },
    { name: "schedule", exports: ["renderSchedule", "renderScheduleDetail"] },
    { name: "channels", exports: ["renderChannels"] },
  ];

  for (const { name, exports: expected } of pagesToCheck) {
    it(`${name}.ts exports ${expected.join(", ")}`, () => {
      const content = readFileSync(new URL(`../src/pages/${name}.ts`, import.meta.url), "utf-8");
      for (const exp of expected) {
        const exportPattern = new RegExp(`export\\s+(function|const|async\\s+function)\\s+${exp}\\b`);
        const reExportPattern = new RegExp(`export\\s+\\{[^}]*\\b${exp}\\b[^}]*\\}\\s+from\\s+["']`);
        assert.ok(
          exportPattern.test(content) || reExportPattern.test(content),
          `${name}.ts should export ${exp}`,
        );
      }
    });
  }

  it("kanban.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");
    const lines = content.split("\n").length;
    assert.ok(lines <= 350, `kanban.ts has ${lines} lines (expected ≤ 350)`);
  });

  it("schedule.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/schedule.ts", import.meta.url), "utf-8");
    const lines = content.split("\n").length;
    assert.ok(lines <= 350, `schedule.ts has ${lines} lines (expected ≤ 350)`);
  });

  it("channels.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/channels.ts", import.meta.url), "utf-8");
    const lines = content.split("\n").length;
    assert.ok(lines <= 350, `channels.ts has ${lines} lines (expected ≤ 350)`);
  });
});

// ── Lib module smoke tests ──

describe("New kanban lib modules", () => {
  it("kanban-board.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "STATUS_LABELS",
      "statusBadge",
      "formatRelativeTime",
      "formatTaskDate",
      "renderColumn",
      "renderTaskCard",
      "moveTask",
      "loadBoard",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(const|function|async\\s+function)\\s+${exp}\\b`).test(content),
        `kanban-board.ts should export ${exp}`,
      );
    }
  });

  it("kanban-detail.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    const expectedExports = ["loadTaskDetail", "renderKanbanDetail"];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function)\\s+${exp}\\b`).test(content),
        `kanban-detail.ts should export ${exp}`,
      );
    }
  });

  it("kanban-subtasks.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/kanban-subtasks.ts", import.meta.url), "utf-8");
    const expectedExports = ["subtaskStatusEmoji", "subtaskStatusBadge", "loadKanbanSubtasks"];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function)\\s+${exp}\\b`).test(content),
        `kanban-subtasks.ts should export ${exp}`,
      );
    }
  });
});

describe("New schedule lib modules", () => {
  it("schedule-list.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/schedule-list.ts", import.meta.url), "utf-8");
    const expectedExports = ["formatActionLabel", "loadCronJobs"];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function)\\s+${exp}\\b`).test(content),
        `schedule-list.ts should export ${exp}`,
      );
    }
  });

  it("schedule-detail.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "formatDate",
      "loadScheduleDetail",
      "loadScheduleThreads",
      "showCronModal",
      "renderScheduleDetail",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|async\\s+function|const)\\s+${exp}\\b`).test(content),
        `schedule-detail.ts should export ${exp}`,
      );
    }
  });
});

describe("New channels lib modules", () => {
  it("channel-config.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/channel-config.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "planningModeLabel",
      "getModelsForProvider",
      "renderNameInput",
      "renderProfileSelect",
      "renderProviderSelect",
      "renderModelSelect",
      "renderPlanningModeSelect",
      "wireChannelConfigEditing",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|const|async\\s+function)\\s+${exp}\\b`).test(content),
        `channel-config.ts should export ${exp}`,
      );
    }
  });

  it("channel-status.ts exports expected functions", () => {
    const content = readFileSync(new URL("../src/lib/channel-status.ts", import.meta.url), "utf-8");
    const expectedExports = [
      "renderStatusControl",
      "renderChannelsPage",
      "wireChannelFilterControls",
      "wireChannelToggleButtons",
      "syncFiltersToUrl",
      "applyFiltersFromUrl",
    ];
    for (const exp of expectedExports) {
      assert.ok(
        new RegExp(`export\\s+(function|const|async\\s+function)\\s+${exp}\\b`).test(content),
        `channel-status.ts should export ${exp}`,
      );
    }
  });
});

// ── Smoke tests for plugin-config library ──

describe("plugin-config library functions", () => {
  it("plugin-config.ts exports renderConfigField", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+renderConfigField\b/.test(content));
  });

  it("plugin-config.ts exports renderPluginConfig", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+renderPluginConfig\b/.test(content));
  });

  it("plugin-config.ts exports getCurrentConfig", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+getCurrentConfig\b/.test(content));
  });

  it("plugin-config.ts exports dirtyCheckSaveButton", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+dirtyCheckSaveButton\b/.test(content));
  });

  it("plugin-config.ts exports renderBuiltinSection", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+renderBuiltinSection\b/.test(content));
  });
});
