// Board toolset tier: `config/boards.yml` boards accept an OPTIONAL `toolset`
// (a toolset id defined in `config/toolsets.yml`). The Create/Edit Board modal
// exposes a Toolset select, and the board meta line appends
// `toolset: <id>` ONLY when the board defines one (no "none" noise).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boardsSrc = readFileSync(new URL("../src/lib/kanban-boards.ts", import.meta.url), "utf-8");
const apiSrc = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");

describe("board toolset field (Create/Edit Board modal)", () => {
  it("BoardConfig carries the board-tier toolset", () => {
    assert.ok(
      /export interface BoardConfig[\s\S]*?toolset\?: string \| null;/.test(apiSrc),
      "BoardConfig.toolset?: string | null",
    );
  });

  it("the modal renders a Toolset select fed from /api/toolsets", () => {
    assert.ok(/board-form-toolset/.test(boardsSrc), "board-form-toolset field id");
    assert.ok(
      /renderToolsetSelect\(toolsetIds, b\.toolset\)/.test(boardsSrc),
      "the modal renders renderToolsetSelect(toolsetIds, b.toolset)",
    );
    assert.ok(/fetchToolsets/.test(boardsSrc), "the toolset ids come from /api/toolsets");
  });

  it("readBoardForm persists a set toolset and omits the default entry", () => {
    assert.ok(/readField\("board-form-toolset"\)/.test(boardsSrc), "reads board-form-toolset");
    assert.ok(/if \(toolset\) board\.toolset = toolset;/.test(boardsSrc), '"" (default) is omitted');
  });
});

describe("renderToolsetSelect semantics", () => {
  it("offers an explicit default entry plus every toolset id", async () => {
    const mod = await import("../src/lib/kanban-boards.ts");
    const html = mod.renderToolsetSelect(["toolset_2", "toolset_3"], "toolset_3");
    assert.ok(html.includes('<option value="">None (use default toolset)</option>'));
    assert.ok(html.includes('<option value="toolset_2"'), "every toolsets.yml id is offered");
    assert.ok(html.includes('<option value="toolset_3" selected>'), "the saved id is selected");
    // A saved id that no longer exists stays selectable (never silently dropped).
    const stale = mod.renderToolsetSelect(["toolset_2"], "gone-ts");
    assert.ok(stale.includes('value="gone-ts" selected'), "stale id kept + selected");
  });
});

describe("board meta line (resolved toolset next to the board buttons)", () => {
  it("appends toolset only when the board defines one", async () => {
    const mod = await import("../src/lib/kanban-boards.ts");
    assert.equal(
      mod.boardMetaLabel({ workflow: "omniagent-dev", channel: "omnidev", toolset: "my-toolset" }),
      "workflow: omniagent-dev · channel: omnidev · toolset: my-toolset",
    );
    assert.equal(
      mod.boardMetaLabel({ workflow: "omniagent-dev", channel: "omnidev" }),
      "workflow: omniagent-dev · channel: omnidev",
      "no toolset defined -> the line is unchanged",
    );
    assert.equal(mod.boardMetaLabel({}), "");
  });
});

describe("dashboard toolset-chain hints name the board tier", () => {
  it("hooks/schedule/kanban-create hints read task > board > channel > profile", () => {
    for (const f of ["hooks-detail.ts", "schedule-detail.ts", "kanban-create.ts"]) {
      const s = readFileSync(new URL(`../src/lib/${f}`, import.meta.url), "utf-8");
      assert.ok(s.includes("task &gt; board &gt; channel"), `${f} names the board tier`);
    }
  });
});
