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
    assert.ok(
      /loadBoard\(\s*showArchived: boolean,\s*boardKey: string \| null = null,\s*tagFilter\?: string,\s*\)/.test(
        content,
      ),
    );
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

// ── Threads page: merged-into badge for skipped threads (task_18cfafb9cf566e31) ──

describe("Threads page merged-into badge", () => {
  it("threads.ts declares merged_into_thread_id on ThreadRow", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/merged_into_thread_id:\s*number\s*\|\s*null;/.test(content));
  });

  it("mergedIntoBadge renders for skipped/merged threads with a recorded target (acceptance 3)", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    // Early return when status is neither skipped nor merged, or no target is
    // recorded (the merged terminal state reuses the skipped badge + link).
    assert.ok(/row\.status\s*!==\s*"skipped"\s*&&\s*row\.status\s*!==\s*"merged"/.test(content));
    assert.ok(/function\s+mergedIntoBadge/.test(content));
  });

  it("badge links to the target thread on the Threads page (acceptance 1+2)", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/→ merged into thread #/.test(content));
    assert.ok(/\/threads\?thread_id=/.test(content));
    assert.ok(/merged-into-link/.test(content));
    assert.ok(/encodeURIComponent\(target\)/.test(content));
    assert.ok(/stopPropagation/.test(content));
  });
});

// ── Kanban task tags on the dashboard (task_18cfb485d7601e5e) ──

describe("Kanban task tags on the dashboard", () => {
  it("KanbanTask type carries an optional tags array (api.ts)", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    assert.ok(/tags\?:\s*string\[\];/.test(content));
  });

  it("board cards render colored tag badges derived from the tag name (kanban-board.ts)", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/export function tagColor\(tag: string\): string/.test(content));
    assert.ok(/String\(Math\.abs\(h\) % 360\)/.test(content)); // deterministic hue per tag name
    assert.ok(/function renderTaskTags\(task: KanbanTask\): string/.test(content));
    assert.ok(/class="kanban-card-tags"/.test(content)); // badges container div
    assert.ok(/background:hsl\(\$\{hue\},55%,24%\)/.test(content)); // colored badge style
    assert.ok(/escapeHtml\(t\)/.test(content)); // XSS-safe tag label
    assert.ok(/renderTaskTags\(task\)/.test(content)); // embedded in every task card
  });
});

describe("Kanban history events for tags and dependencies", () => {
  it("tag add/remove render colored badges with 'was Tagged' / 'had Tag Removed' texts", () => {
    const content = readFileSync(new URL("../src/pages/kanban-history.ts", import.meta.url), "utf-8");
    assert.ok(/function tagBadge\(tag: string\): string/.test(content));
    assert.ok(/case "tag_added":\s*\{/.test(content));
    assert.ok(/was Tagged \$\{tag \? tagBadge\(tag\)/.test(content));
    assert.ok(/case "tag_removed":\s*\{/.test(content));
    assert.ok(/had Tag Removed/.test(content));
  });

  it("dependency add/remove render target id + title texts", () => {
    const content = readFileSync(new URL("../src/pages/kanban-history.ts", import.meta.url), "utf-8");
    assert.ok(/case "dependency_added":\s*\{/.test(content));
    assert.ok(/gained a dependency on/.test(content));
    assert.ok(/depends_on_id/.test(content));
    assert.ok(/case "dependency_removed":\s*\{/.test(content));
    assert.ok(/lost a dependency on/.test(content));
  });

  it("action filter dropdown exposes the four new actions", () => {
    const content = readFileSync(new URL("../src/pages/kanban-history.ts", import.meta.url), "utf-8");
    assert.ok(/value="tag_added">Tag Added<\/option>/.test(content));
    assert.ok(/value="tag_removed">Tag Removed<\/option>/.test(content));
    assert.ok(/value="dependency_added">Dependency Added<\/option>/.test(content));
    assert.ok(/value="dependency_removed">Dependency Removed<\/option>/.test(content));
  });
});

// ── Overview page widgets (task_18cfbf1ea5841a89) ──

describe("Overview page widgets", () => {
  it("api.ts declares the token-trend 3-series breakdown + kanban snapshot types", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    assert.ok(/input_cache_hit:\s*number;/.test(content));
    assert.ok(/input_cache_miss:\s*number;/.test(content));
    assert.ok(/output_tokens:\s*number;/.test(content));
    assert.ok(/interface KanbanSnapshotEntry/.test(content));
    assert.ok(/kanban_snapshot:\s*KanbanSnapshotEntry\[\];/.test(content));
  });

  it("Token Trend renders a stacked block chart with exactly 3 series (cache hit / cache miss / output)", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/function renderTokenTrendChart\(/.test(content));
    assert.ok(/id="chart-token"/.test(content));
    assert.ok(/Input \(cache hit\)/.test(content));
    assert.ok(/Input \(cache miss\)/.test(content));
    assert.ok(/name: "Output"/.test(content));
    // The old line chart must be gone
    assert.ok(!/renderLineChart/.test(content));
    assert.ok(!/chart-line/.test(content));
  });

  it("Token Trend x-axis renders real dates (Invalid Date guard)", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/T00:00:00Z/.test(content)); // dateStr normalization
    assert.ok(/isNaN\(d\.getTime\(\)\)/.test(content)); // fallback instead of "Invalid Date"
  });

  it("Kanban Snapshot rows link to the task detail page with board/task/status/tags/date columns", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/function renderKanbanSnapshotRow/.test(content));
    assert.ok(/\/kanban\/\$\{encodeURIComponent\(k\.task_id\)\}/.test(content));
    assert.ok(/role="columnheader">Board<\/div>/.test(content));
    assert.ok(/role="columnheader">Task<\/div>/.test(content));
    assert.ok(/role="columnheader">Status<\/div>/.test(content));
    assert.ok(/role="columnheader">Tags<\/div>/.test(content));
    assert.ok(/role="columnheader" style="text-align:right">Date<\/div>/.test(content));
  });

  it("Top Tools render real tool names with counts (no Unknown)", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/escapeHtml\(t\.tool\)/.test(content));
    assert.ok(/No tools used in 7 days/.test(content));
  });

  it("All 4 KPI stat cards have a short description instead of '-'", () => {
    const content = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");
    assert.ok(/New threads created today/.test(content));
    assert.ok(/Average time to completion/.test(content));
    assert.ok(/Tokens consumed today/.test(content));
    assert.ok(/Channels with activity in 24h/.test(content));
  });
});

// ── Threads page 'Show details' toggle + kanban workflow linkage (task_omnidev_dashboard_ui_workflow_below_board_in) ──

describe("Threads page 'Show details' toggle + workflow details (dashboard UI polish)", () => {
  it("threads.ts declares the new kanban/hook linkage fields on ThreadRow", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/task_id:\s*string \| null;/.test(content));
    assert.ok(/schedule_task_id:\s*string \| null;/.test(content));
    assert.ok(/workflow_step:\s*string \| null;/.test(content));
    assert.ok(/workflow:\s*string \| null;/.test(content));
    assert.ok(/kanban_board:\s*string \| null;/.test(content));
    assert.ok(/hook_id:\s*string \| null;/.test(content));
  });

  it("threads.ts row has a purple 'Show details' toggle that swaps to 'Hide details'", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/class="thread-details-toggle"/.test(content));
    assert.ok(/Show details/.test(content));
    assert.ok(/open \? "Hide details" : "Show details"/.test(content));
    // Each row wraps a real thread-row link plus an expandable details box.
    assert.ok(/<a href="\$\{url\}" class="thread-row"/.test(content));
    assert.ok(/classList\.toggle\("open"\)/.test(content));
  });

  it("threads.ts moves Cause/Type/Subtype/Plan Mode out of the header row", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    // The compact header no longer renders these column headers...
    assert.ok(!/<div role="columnheader">Cause<\/div>/.test(content));
    assert.ok(!/<div role="columnheader">Type<\/div>/.test(content));
    assert.ok(!/<div role="columnheader">Subtype<\/div>/.test(content));
    assert.ok(!/<div role="columnheader">Plan Mode<\/div>/.test(content));
    // ...and the Details column header was added.
    assert.ok(/<div role="columnheader">Details<\/div>/.test(content));
  });

  it("threads.ts details box shows Cause, Type, Subtype and Plan Mode", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/function\s+threadDetailsContent\(row: ThreadRow\): string/.test(content));
    assert.ok(/thread-detail-label">Cause</.test(content));
    assert.ok(/thread-detail-label">Type</.test(content));
    assert.ok(/thread-detail-label">Subtype</.test(content));
    assert.ok(/thread-detail-label">Plan Mode</.test(content));
  });

  it("threads.ts details box shows kanban board, workflow and workflow role for kanban threads", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/thread-detail-label">Kanban board</.test(content));
    assert.ok(/thread-detail-label">Workflow</.test(content));
    assert.ok(/thread-detail-label">Workflow role</.test(content));
    assert.ok(/row\.task_id\s*\?/.test(content));
  });

  it("workflowRole maps kanban workflow steps to executor/tester/reviewer", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/function\s+workflowRole\(step: string \| null\): string/.test(content));
    assert.ok(/case "running":\s*return "executor";/.test(content));
    assert.ok(/case "testing":\s*return "tester";/.test(content));
    assert.ok(/case "review":\s*return "reviewer";/.test(content));
  });

  it("threads.ts links kanban/cron/hook threads to their task pages", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    assert.ok(/href="\/kanban\/\$\{encodeURIComponent\(row\.task_id\)\}"/.test(content));
    assert.ok(/href="\/schedules\/\$\{encodeURIComponent\(row\.schedule_task_id\)\}"/.test(content));
    assert.ok(/href="\/hooks"/.test(content));
    assert.ok(/function\s+threadTaskLink\(row: ThreadRow\): string/.test(content));
  });

  it("kanban-detail.ts always shows the effective workflow below the board name", () => {
    const content = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    // The API serializes the RESOLVED effective workflow as `workflow` (task
    // explicit -> board default), never as `workflow_id`; reading workflow_id
    // was always falsy so an explicit workflow (e.g. dev-executor) never
    // rendered. The Workflow entry must be always present, chip or muted None.
    assert.ok(/detail-label" style="font-size:0\.68rem;">Workflow<\/span>/.test(content));
    assert.ok(/escapeHtml\(String\(task\.workflow\)\)/.test(content));
    assert.ok(
      !/task\.workflow_id/.test(content),
      "must read the resolved task.workflow, not the DB column name",
    );
  });

  it("kanban/schedule/hook pages emphasize their titles with .emphasized-title", () => {
    const kanban = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    const scheduleDetail = readFileSync(new URL("../src/lib/schedule-detail.ts", import.meta.url), "utf-8");
    const scheduleList = readFileSync(new URL("../src/lib/schedule-list.ts", import.meta.url), "utf-8");
    const hooksList = readFileSync(new URL("../src/lib/hooks-list.ts", import.meta.url), "utf-8");
    assert.ok(/<span class="emphasized-title">\${escapeHtml\(task\.title\)}<\/span>/.test(kanban));
    assert.ok(/Job: <span class="emphasized-title">/.test(scheduleDetail));
    assert.ok(/<span class="emphasized-title">\$\{escapeHtml\(j\.name \|\| j\.id\)\}/.test(scheduleList));
    assert.ok(/<span class="emphasized-title">\$\{escapeHtml\(hookName\(h\)\)\}/.test(hooksList));
  });

  it("style.css provides the threads grid, details box and emphasized-title styles", () => {
    const content = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");
    assert.ok(/\.data-table\.threads-table/.test(content));
    assert.ok(/grid-template-columns: 72px 108px 128px/.test(content));
    assert.ok(/\.threads-table \.thread-details \{/.test(content));
    assert.ok(/\.thread-item\.open \.thread-details \{/.test(content));
    assert.ok(/\.thread-details-toggle \{/.test(content));
    assert.ok(/rgba\(139, 92, 246, 0\.15\)/.test(content)); // purple button, matching other purple buttons
    assert.ok(/\.emphasized-title \{/.test(content));
    assert.ok(/font-weight: 700;/.test(content));
  });
});

// ── Kanban board/detail UI fixes (task_omnidev_dashboard_ui_fixes_kanban_card) ──

describe("Kanban mobile overflow, keep-board on move, topmost drop, tags in details", () => {
  it("style.css keeps kanban board/columns/cards within the page width on mobile", () => {
    const content = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");
    assert.ok(
      /\.kanban-board \{\n {2}margin-top: 0;\n {2}max-width: 100%;\n {2}overflow-x: hidden;\n\}/.test(
        content,
      ),
    );
    assert.ok(/\.kanban-column \{\n {2}min-width: 0;\n {2}max-width: 100%;\n\}/.test(content));
    assert.ok(
      /\.kanban-task-id \{\n {2}overflow: hidden;\n {2}text-overflow: ellipsis;\n {2}white-space: nowrap;\n {2}min-width: 0;\n\}/.test(
        content,
      ),
    );
    assert.ok(
      /\.kanban-card \{\n {2}flex-shrink: 0;\n {2}min-width: 0;\n {2}max-width: 100%;\n {2}overflow: hidden;/.test(
        content,
      ),
    );
  });

  it("style.css never clamps the kanban column height and never shrinks cards (Done column collapse fix)", () => {
    const content = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");
    // No max-height (or equivalent height clamp) may constrain the status
    // column: cards must always render at their normal height no matter how
    // many cards the column holds.
    assert.ok(
      !/\.kanban-column \{[^}]*max-height:/.test(content),
      "kanban column must not be height-clamped",
    );
    // Cards are never flex-shrunk inside the column body (the sliver collapse).
    assert.ok(/\.kanban-card \{\n {2}flex-shrink: 0;/.test(content), "kanban cards must never shrink");
  });

  it("kanban-board.ts loadBoard keeps the current board after a move (URL ?board= then stored board)", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/new URLSearchParams\(window\.location\.search\)\.get\("board"\)/.test(content));
    assert.ok(/function currentBoardKey\(\): string \| null/.test(content));
    assert.ok(/urlBoard && urlBoard !== "" \? urlBoard : getStoredBoard\(\)/.test(content));
  });

  it("kanban-board.ts shows a success toast after moving a task (touch or drop)", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(
      /showToast\(`Task moved to \$\{STATUS_LABELS\[newStatus\] \|\| newStatus\}`, "success"\)/.test(content),
    );
    assert.ok(/showToast\("Failed to move task", "error"\)/.test(content));
  });

  it("kanban-board.ts cross-column drop lands the task topmost (PATCH /status without position)", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/let dragSourceColumn: string \| null = null;/.test(content));
    assert.ok(
      /const crossColumn = dragSourceColumn !== null && dragSourceColumn !== newStatus;/.test(content),
    );
    assert.ok(/await moveTask\(taskId, newStatus\);/.test(content));
    assert.ok(/Same-column drops keep the drop position/.test(content));
  });

  it("kanban-detail.ts renders the task's tags as chips on the details page", () => {
    const content = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    assert.ok(/renderTagChips/.test(content));
    assert.ok(/detail-label">Tags<\/div>/.test(content));
    assert.ok(/grid-column:1 \/ -1;/.test(content));
  });

  it("kanban-detail.ts drops the 'Task: ' prefix from the header subtitle", () => {
    const content = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
    assert.ok(!/Task: <span class="emphasized-title">/.test(content));
    assert.ok(
      /subtitle\.innerHTML = `<span class="emphasized-title">\$\{escapeHtml\(task\.title\)\}<\/span>`;/.test(
        content,
      ),
    );
  });

  it("threads.ts places the Show details toggle as the 2nd field of each row", () => {
    const content = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
    // Header: Details column comes right after ID and before Status.
    const headerIdx = content.indexOf('columnheader">Details</div>');
    const statusHeaderIdx = content.indexOf('columnheader">Status</div>');
    assert.ok(headerIdx !== -1 && statusHeaderIdx !== -1 && headerIdx < statusHeaderIdx);
    // Row: the toggle button cell sits before the status badge cell.
    const rowToggleIdx = content.indexOf('class="thread-details-toggle"');
    const rowStatusIdx = content.indexOf("status-badge-", rowToggleIdx);
    assert.ok(rowToggleIdx !== -1 && rowStatusIdx !== -1 && rowToggleIdx < rowStatusIdx);
  });

  it("style.css lays the threads details box fields side by side (auto-fit grid, mobile-friendly)", () => {
    const content = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");
    assert.ok(/grid-template-columns: repeat\(auto-fit, minmax\(130px, 1fr\)\)/.test(content));
  });
});

// ── Kanban drag micro-move keeps the board (task_omnidev_really_fix_dragging_a_kanban_card) ──

describe("Kanban drag micro-move click suppression (drag keeps the selected board)", () => {
  it("kanban-board.ts treats any >2px mousemove while pressed as drag intent", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    // The intent threshold (2 px) must sit BELOW Chromium's native dragstart
    // threshold (~4-5 px): a 1-4 px micro-drag never fires dragstart, so the
    // mousemove intent is the only layer that stops its release-click from
    // navigating away from the board.
    const mousemoveBlock = content.slice(
      content.indexOf('card.addEventListener("mousemove"'),
      content.indexOf('card.addEventListener("dragstart"'),
    );
    assert.ok(
      /if \(Math\.hypot\(dx, dy\) > 2\) \{[\s\S]*?mouseDragIntent = true;/.test(mousemoveBlock),
      "mousemove intent threshold must be 2 px",
    );
  });

  it("kanban-board.ts keeps drag intent armed until the release click is consumed", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    // Intent must cover the whole press-release cycle: cleared by the click
    // handler when consumed, never expired by a timer mid-hold.
    const mousemoveBlock = content.slice(
      content.indexOf('card.addEventListener("mousemove"'),
      content.indexOf('card.addEventListener("dragstart"'),
    );
    assert.ok(
      !/setTimeout\([\s\S]*?mouseDragIntent = false/.test(mousemoveBlock),
      "no expiry timer may clear the intent while the button is still held",
    );
    // The click handler consumes and clears the flag when suppressing.
    const clickBlock = content.slice(
      content.indexOf('card.addEventListener("click"'),
      content.indexOf("// ── Touch-based drag-and-drop"),
    );
    assert.ok(/if \(suppressClickAfterDrag \|\| mouseDragIntent\) \{/.test(clickBlock));
    assert.ok(/suppressClickAfterDrag = false;\n\s*mouseDragIntent = false;\n\s*return;/.test(clickBlock));
  });

  it("kanban-board.ts genuine (zero-movement) clicks still open the task detail page", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/history\.pushState\(\{\}, "", `\/kanban\/\$\{taskId\}`\)/.test(content));
  });

  it("kanban-board.ts touch drags also arm click suppression for micro-moves (>2px)", () => {
    const content = readFileSync(new URL("../src/lib/kanban-board.ts", import.meta.url), "utf-8");
    assert.ok(/if \(dist > 2\) \{[\s\S]*?touchMoved = true;/.test(content));
    assert.ok(/if \(isTouchDragging \|\| touchMoved\) armClickSuppression\(\);/.test(content));
  });
});
