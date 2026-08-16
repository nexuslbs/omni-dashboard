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
    { name: "database", exports: ["renderDatabase"] },
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
      "planBadge",
      "getModelsForProvider",
      "renderNameInput",
      "renderProfileSelect",
      "renderProviderSelect",
      "renderModelSelect",
      "renderPlanSelect",
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

// ── Hooks page + lib module smoke tests ──

describe("Hooks page and lib modules", () => {
  it("hooks.ts page exports renderHooks", () => {
    const content = readFileSync(new URL("../src/pages/hooks.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+(function|const|async\s+function)\s+renderHooks\b/.test(content));
  });

  it("hooks.ts is under 350 lines", () => {
    const content = readFileSync(new URL("../src/pages/hooks.ts", import.meta.url), "utf-8");
    assert.ok(content.split("\n").length <= 350);
  });

  it("hooks.ts lib exports helpers", () => {
    const content = readFileSync(new URL("../src/lib/hooks.ts", import.meta.url), "utf-8");
    for (const exp of [
      "hookField",
      "hookName",
      "formatHookCounter",
      "formatHookCounterJson",
      "parseHookCounter",
      "eventBadgeClass",
      "scopeBadgeClass",
      "modeBadgeClass",
      "fetchHooks",
      "fetchHook",
    ]) {
      assert.ok(
        new RegExp(`export\\s+(const|function|async\\s+function)\\s+${exp}\\b`).test(content),
        `hooks.ts should export ${exp}`,
      );
    }
  });

  it("hooks-list.ts exports loadHooks", () => {
    const content = readFileSync(new URL("../src/lib/hooks-list.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+async\s+function\s+loadHooks\b/.test(content));
  });

  it("hooks-detail.ts exports showHookModal", () => {
    const content = readFileSync(new URL("../src/lib/hooks-detail.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+async\s+function\s+showHookModal\b/.test(content));
  });

  it("router.ts registers the hooks route", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    assert.ok(/name:\s*"hooks"/.test(content));
    assert.ok(/import\s*\{[^}]*renderHooks[^}]*\}\s*from\s*"\.\.\/pages\/hooks"/.test(content));
  });
});

// ── Kanban Boards (config/boards.yml) ──

describe("Kanban boards lib", () => {
  it("kanban-boards.ts exports expected helpers", () => {
    const content = readFileSync(new URL("../src/lib/kanban-boards.ts", import.meta.url), "utf-8");
    const expected = [
      "KANBAN_BOARD_LS_KEY",
      "getStoredBoard",
      "setStoredBoard",
      "nextBoardOptions",
      "boardMoveEnabled",
      "fetchBoards",
      "upsertBoard",
      "deleteBoard",
      "openBoardModal",
      "populateBoardSelect",
      "wireBoardControls",
    ];
    for (const exp of expected) {
      assert.ok(
        new RegExp(`export\\s+(const|async\\s+function|function)\\s+${exp}\\b`).test(content),
        `kanban-boards.ts should export ${exp}`,
      );
    }
  });

  it("kanban-board.ts loadBoard accepts a board filter", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/loadBoard\(showArchived: boolean, boardKey: string \| null = null\)/.test(content));
    assert.ok(/\/kanban\/tasks\?board=/.test(content));
  });

  it("pages/kanban.ts wires board controls + localStorage", () => {
    const content = readFileSync(new URL("../src/pages/kanban.ts", import.meta.url), "utf-8");
    assert.ok(/kanban-board-controls/.test(content));
    assert.ok(/wireBoardControls/.test(content));
    assert.ok(/getStoredBoard/.test(content));
    assert.ok(/setStoredBoard/.test(content));
    assert.ok(/\?board=/.test(content));
  });

  it("kanban-detail.ts has move-to-another-board", () => {
    const content = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    assert.ok(/task-move-board/.test(content));
    assert.ok(/boardMoveEnabled/.test(content));
    assert.ok(/nextBoardOptions/.test(content));
  });

  it("api.ts declares board types + task.board", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    assert.ok(/interface BoardConfig/.test(content));
    assert.ok(/interface BoardEntry/.test(content));
    assert.ok(/board\?: string;/.test(content));
  });
});
