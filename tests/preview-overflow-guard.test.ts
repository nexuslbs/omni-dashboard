import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Threads/Overview Preview cells: a long unbroken token must not invade neighbours ──
// Operator (verbatim, telegram thread 2055): "When the preview in the threads page has a
// big word, it is invading the other fields; e.g. `G27-META` /
// `Event: {"channel":"cron","current_message":148722,...}`".
//
// Root cause (measured on the dev dashboard, thread 2073): `.data-table` cells carried no
// `min-width:0` and no `overflow-wrap`, so the threads grid (rows are `display:contents`,
// every cell is a direct grid item) kept `min-width:auto`; the 100-char preview token was
// painted 357px past the preview cell box, over the next columns, and the grid row
// scrollWidth grew to 1318px in a 1107px table. The fix is a row-wide guard
// (`min-width:0` + `overflow-wrap:anywhere`) on every `.data-table` cell.

const style = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");
const threads = readFileSync(new URL("../src/pages/threads.ts", import.meta.url), "utf-8");
const overview = readFileSync(new URL("../src/pages/overview.ts", import.meta.url), "utf-8");

/** Declaration block of a CSS rule, asserting the rule exists. */
const cssRule = (selector: string): string => {
  const at = style.indexOf(selector + " {");
  assert.ok(at >= 0, `style.css must define ${selector}`);
  const block = style.slice(at + selector.length + 2);
  return block.slice(0, block.indexOf("}"));
};

/** Declaration block of the row-wide long-token guard (both selectors in one rule). */
const guardRule = (): string => {
  const selector = '.data-table [role="cell"],\n.data-table [role="columnheader"] {';
  const at = style.indexOf(selector);
  assert.ok(at >= 0, "the row-wide long-token guard must exist in style.css");
  const block = style.slice(at + selector.length);
  return block.slice(0, block.indexOf("}"));
};

describe("Long unbroken preview tokens stay inside their column", () => {
  it("root cause context: threads-table is a grid and the preview is one of its tracks", () => {
    const grid = cssRule(".data-table.threads-table");
    assert.ok(/display:\s*grid/.test(grid), ".data-table.threads-table must stay a grid");
    assert.ok(/grid-template-columns/.test(grid), "the threads column tracks must stay explicit");
  });

  it("guard: cells may shrink below their min-content width (min-width:0)", () => {
    assert.ok(
      /min-width:\s*0\b/.test(guardRule()),
      "grid/flex children need min-width:0, otherwise an unbreakable token widens the cell",
    );
  });

  it("guard: an unbreakable token can break (overflow-wrap:anywhere)", () => {
    assert.ok(
      /overflow-wrap:\s*anywhere/.test(guardRule()),
      "overflow-wrap:anywhere must break the token so it can never paint over the next cell",
    );
  });

  it("guard is row-wide (cells AND headers), not only the preview cell", () => {
    const at = style.indexOf('.data-table [role="cell"],\n.data-table [role="columnheader"] {');
    assert.ok(
      style.slice(at).startsWith('.data-table [role="cell"],\n.data-table [role="columnheader"] {'),
      "the guard must cover every cell and columnheader of .data-table",
    );
    assert.ok(
      threads.includes('<div role="cell" class="cell-preview">'),
      "threads preview cell keeps its class (the guard hooks the generic role attribute)",
    );
    assert.ok(
      overview.includes('<div role="cell" class="cell-preview">'),
      "overview preview cell keeps its class",
    );
  });

  it("no later .data-table cell rule re-enables an unbreakable layout", () => {
    const after = style.slice(
      style.indexOf('.data-table [role="cell"],\n.data-table [role="columnheader"] {'),
    );
    const body = after.slice(after.indexOf("}") + 1);
    assert.ok(
      !/\.data-table\s+\[role="cell"\][^{]*\{[^}]*white-space:\s*nowrap/s.test(body),
      "no later rule may force .data-table cells back to nowrap",
    );
  });
});
