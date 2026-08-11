import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Database page (src/pages/database.ts + src/style.css) ──
// Regression tests for: hidden-override (Loading… always visible), pagination
// placement for 0-row results, and the Run button not looking like a button.

const page = readFileSync(new URL("../src/pages/database.ts", import.meta.url), "utf-8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

describe("Database page fixes", () => {
  it("Loading indicator is hidden by default and only shown during a query", () => {
    assert.ok(
      page.includes('<div id="db-loading" class="loading" hidden>Loading…</div>'),
      "db-loading starts with the hidden attribute",
    );
    assert.ok(page.includes('el("db-loading").hidden = false'), "loading is revealed when a query starts");
    assert.ok(
      page.includes('el("db-loading").hidden = true'),
      "loading is hidden again when the query finishes",
    );
    assert.ok(
      css.includes("[hidden] {\n  display: none !important;\n}"),
      "CSS makes the hidden attribute win over .loading's display:flex",
    );
  });

  it("pagination renders at the top and bottom even when a query returns 0 rows", () => {
    assert.ok(page.includes('id="db-pagination-top"'), "top pagination slot");
    assert.ok(page.includes('id="db-pagination-bottom"'), "bottom pagination slot");
    assert.ok(
      page.includes(
        "// renderPagination is only called after a query result (renderResult), so\n  // always show it",
      ),
      "pagination is always shown after a query, including 0-row results",
    );
    assert.ok(page.includes("const show = true;"), "pagination no longer hidden for 0-row results");
  });

  it("Run button has a visible purple background (--accent defined)", () => {
    assert.ok(page.includes('id="db-run-sql" class="btn btn-primary"'), "Run uses btn btn-primary");
    assert.ok(
      css.includes("--accent: #8b5cf6;"),
      "the --accent variable is defined so .btn-primary gets a real background",
    );
    assert.ok(
      css.includes(".btn-primary {\n  background: var(--accent);"),
      "btn-primary resolves its background from --accent",
    );
  });

  it("secondary / action buttons use the neutral slate tint, never a white background", () => {
    assert.ok(
      css.includes(".btn-secondary {\n  background: rgba(148, 163, 184, 0.1);"),
      "btn-secondary uses the neutral tint",
    );
    assert.ok(
      css.includes(".channel-action-btn {\n  display: inline-flex;"),
      "channel action buttons (Close/Stop) still styled as buttons",
    );
    assert.ok(
      css.includes("background: rgba(148, 163, 184, 0.1);"),
      "neutral tint present in the stylesheet",
    );
    assert.ok(
      !css.includes(".btn-secondary {\n  background: var(--glass-bg);"),
      "btn-secondary no longer uses the near-invisible glass background",
    );
  });
});
