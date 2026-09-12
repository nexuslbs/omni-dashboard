// Regression tests: Markdown toggle for the Kanban Task Details description.
// Task: the task description must be rendered as Markdown by default, with a
// small messages-box style toggle (label "View original") placed to the RIGHT
// of the "Description" section title.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const detailSrc = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");
const markdownSrc = readFileSync(new URL("../src/lib/markdown.ts", import.meta.url), "utf-8");
const styleSrc = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

describe("Task Details description markdown toggle (kanban-detail.ts)", () => {
  it("imports the shared markdown toggle helper", () => {
    assert.ok(
      detailSrc.includes('import { createMarkdownToggle } from "./markdown";'),
      "must reuse the shared markdown toggle helper",
    );
  });

  it("keeps the Description section title", () => {
    assert.ok(detailSrc.includes('<div class="detail-label" style="margin-bottom:0;">Description</div>'));
  });

  it("places the toggle slot on the same row as the Description title", () => {
    assert.ok(detailSrc.includes('class="task-section-head"'), "section header row for title + button");
    const headIdx = detailSrc.indexOf('class="task-section-head"');
    const titleIdx = detailSrc.indexOf(">Description</div>");
    const slotIdx = detailSrc.indexOf('id="task-desc-toggle-slot"');
    assert.ok(headIdx !== -1 && titleIdx !== -1 && slotIdx !== -1, "row, title and slot must exist");
    assert.ok(headIdx < titleIdx && titleIdx < slotIdx, "title left, toggle slot right of it");
  });

  it("renders the description into a dedicated body element instead of raw escaped text", () => {
    assert.ok(detailSrc.includes('id="task-description-body"'), "description body element id");
    assert.ok(
      !detailSrc.includes('<div class="detail-body">${escapeHtml(task.body)}</div>'),
      "description must no longer be rendered as plain escaped text",
    );
  });

  it("wires the toggle with the raw task body", () => {
    assert.ok(
      detailSrc.includes("descToggleSlot.appendChild(createMarkdownToggle(String(task.body), descBody));"),
      "toggle must be created from the raw task body and the description element",
    );
  });

  it("handles an empty description (no button, no crash)", () => {
    assert.ok(
      detailSrc.includes("if (descBody && descToggleSlot && task.body)"),
      "toggle only when a description exists",
    );
  });
});

describe("createMarkdownToggle (markdown.ts)", () => {
  it("is exported and reuses the messages-box button style", () => {
    assert.ok(markdownSrc.includes("export function createMarkdownToggle("));
    assert.ok(
      markdownSrc.includes('btn.className = "ev-view-btn ev-view-md";'),
      "same stylized button classes as the messages boxes",
    );
  });

  it("renders Markdown by default and offers the way back to the original text", () => {
    assert.ok(markdownSrc.includes('btn.textContent = "View original";'), "rendered state label");
    assert.ok(markdownSrc.includes('btn.textContent = "See as Markdown";'), "raw state label");
    assert.ok(
      markdownSrc.includes(
        'contentEl.innerHTML = `<div class="markdown-content">${wrapper.innerHTML}</div>`;',
      ),
      "rendered view uses the shared markdown-content container",
    );
    assert.ok(markdownSrc.includes("contentEl.textContent = raw;"), "original view shows the raw text");
  });
});

describe("Description toggle layout (style.css)", () => {
  it("defines the section header row (title left, button right)", () => {
    assert.ok(styleSrc.includes(".task-section-head {"));
    assert.ok(styleSrc.includes("justify-content: space-between;"));
    assert.ok(styleSrc.includes("flex-wrap: wrap;"), "row wraps on narrow viewports");
    assert.ok(styleSrc.includes(".task-section-head .detail-label"), "title styling reset");
  });

  it("prevents horizontal overflow for long description words", () => {
    assert.ok(styleSrc.includes("#task-description-body {"));
    assert.ok(styleSrc.includes("overflow-wrap: anywhere;"));
    assert.ok(styleSrc.includes("word-break: break-word;"));
  });
});
