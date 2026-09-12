// Regression guard for task_omnidev_dashboard_messages_page_break_long_words_subtasks.
//
// The Messages page Subtasks display must WRAP an over-long unbreakable token
// instead of widening its container (which gave the page a horizontal
// scrollbar). The rendered proof lives in the tester report (playwright run
// against the dev dashboard, thread 1895, token
// /opt/omni/data/backups/omniagent/omniagent.dump); these assertions keep the
// fix in the source so a later refactor cannot silently drop the rules.
//
// Before: the subtask items were built from ad-hoc inline layout styles with no
// min-width:0 / overflow-wrap, so the flex item could not shrink below its
// content width. After: shared .msg-subtask-* classes carry the breaking rules.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const messages = readFileSync(new URL("../src/pages/messages.ts", import.meta.url), "utf-8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

// Returns the body of a CSS rule, e.g. rule(".msg-subtask-desc") -> "flex: 1 1 0%; ...".
// Plain indexOf parsing: no regex escaping, so it cannot silently return "".
function rule(selector: string): string {
  const at = css.indexOf(selector + " {");
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) return "";
  return css.slice(open + 1, close);
}

describe("Messages page subtasks break long words (no horizontal overflow)", () => {
  it("renderSubtasks uses the shared .msg-subtask-* classes", () => {
    assert.ok(messages.includes("async function renderSubtasks"), "renderSubtasks should exist");
    assert.ok(messages.includes('class="msg-subtasks"'), "subtask card uses .msg-subtasks");
    assert.ok(messages.includes('class="msg-subtask-row"'), "subtask row uses .msg-subtask-row");
    assert.ok(messages.includes('class="msg-subtask-desc"'), "subtask text uses .msg-subtask-desc");
    assert.ok(
      /class="msg-subtask-desc">\$\{escapeHtml\(st\.description\)\}/.test(messages),
      "subtask description stays escaped and wrapped by .msg-subtask-desc",
    );
  });

  it("renderSubtasks no longer relies on ad-hoc inline layout styles", () => {
    assert.ok(
      !messages.includes('style="flex:1;font-size:0.85rem;"'),
      "the pre-fix inline flex item (no min-width:0 / overflow-wrap) must be gone",
    );
    assert.ok(
      !messages.includes('style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;'),
      "the pre-fix inline subtask row layout must be gone",
    );
  });

  it(".msg-subtask-desc breaks over-long tokens and can shrink", () => {
    const desc = rule(".msg-subtask-desc");
    assert.ok(desc, ".msg-subtask-desc rule should exist in src/style.css");
    assert.match(desc, /overflow-wrap:\s*anywhere/, "overflow-wrap:anywhere breaks over-long tokens");
    assert.match(desc, /word-break:\s*break-word/, "word-break:break-word as fallback");
    assert.match(
      desc,
      /min-width:\s*0/,
      "min-width:0 lets the flex item shrink (flex items default to auto)",
    );
  });

  it("the subtask flex chain can shrink (min-width:0 on row and card)", () => {
    assert.match(rule(".msg-subtask-row"), /min-width:\s*0/, ".msg-subtask-row needs min-width:0");
    assert.match(rule(".msg-subtasks"), /min-width:\s*0/, ".msg-subtasks needs min-width:0");
    assert.match(rule(".msg-subtask-status"), /flex-shrink:\s*0/, "the status emoji must not shrink");
    assert.match(rule(".msg-subtask-badge"), /flex-shrink:\s*0/, "the status badge must not shrink");
  });
});
