import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Task Details page: the Workflow badge in the main box must carry the SAME
// border as the workflow badges rendered in the message boxes at the bottom of
// the page (operator request, 2026-09-17). ──

const detail = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

/** First `border: ...;` declaration inside the given CSS rule block. */
function borderOf(stylesheet: string, selector: string): string {
  const start = stylesheet.indexOf(selector + " {");
  assert.ok(start >= 0, `CSS rule ${selector} must exist`);
  const block = stylesheet.slice(start, stylesheet.indexOf("}", start));
  const m = block.match(/border:\s*([^;]+);/);
  assert.ok(m, `${selector} must declare a border`);
  return m![1].trim();
}

describe("Task Details: main-box Workflow badge has a border", () => {
  const messageBoxBorder = borderOf(css, ".ev-workflow-badge");

  it("the message-box workflow badge (reference) declares a 1px cyan border", () => {
    const card = readFileSync(new URL("../src/lib/message-card.ts", import.meta.url), "utf-8");
    assert.ok(card.includes('class="ev-workflow-badge"'), "message boxes use .ev-workflow-badge");
    assert.equal(messageBoxBorder, "1px solid rgba(34, 211, 238, 0.25)");
  });

  it("kanban-detail renders the workflow value with that same border", () => {
    const m = detail.match(/task\.workflow[\s\S]{0,200}?<code style="([^"]*)">/);
    assert.ok(m, "the workflow value should render as a styled <code> when task.workflow is set");
    const border = m![1].match(/border:\s*([^;]+);/);
    assert.ok(border, "the main-box Workflow badge must declare a border");
    assert.equal(
      border![1].trim(),
      messageBoxBorder,
      "the main-box Workflow badge border must match the message-box .ev-workflow-badge border",
    );
  });
});
