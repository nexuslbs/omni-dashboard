// ── Regression tests: dashboard modals must scroll internally and lock the ──
//    page behind them (tall modal on a small/mobile viewport: Confirm/Cancel
//    reachable, background not scrollable). ──

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), "utf-8");

describe("Shared modal scroll contract (style.css + lib/modal.ts)", () => {
  const css = read("../src/style.css");
  const helper = read("../src/lib/modal.ts");
  const entry = read("../src/index.ts");

  it("caps modal panels to the viewport using dynamic viewport units (vh fallback)", () => {
    assert.match(css, /\.omni-modal-panel/, "the shared panel class must be styled");
    assert.match(
      css,
      /\.omni-modal > \.omni-modal-panel:not\(\.modal\)\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 32px\)\s*!important/,
      "panel max-height uses dvh",
    );
    assert.match(
      css,
      /\.omni-modal > \.omni-modal-panel:not\(\.modal\)\s*\{[\s\S]*?max-height:\s*calc\(100vh - 32px\)\s*!important/,
      "panel max-height has a vh fallback for old browsers",
    );
    assert.match(
      css,
      /\.modal,\s*\n\.upload-modal\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 32px\)/,
      ".modal / .upload-modal are capped too",
    );
  });

  it("makes the overlay the scroll container and contains scroll chaining", () => {
    assert.match(css, /\.omni-modal\s*\{[\s\S]*?overflow-y:\s*auto\s*!important/, "overlay scrolls itself");
    assert.match(css, /overscroll-behavior:\s*contain/, "no scroll chaining to the page");
    assert.match(
      css,
      /\.omni-modal\s*\{[\s\S]*?align-items:\s*flex-start\s*!important/,
      "flex-start + margin:auto avoids the clipped-top 'align-items:center' overflow bug",
    );
    assert.match(
      css,
      /\.omni-modal > \.omni-modal-panel:not\(\.modal\)\s*\{[\s\S]*?margin:\s*auto\s*!important/,
      "panel is centered while it fits and scrollable when it does not",
    );
  });

  it("locks the page behind an open modal (body/html + .main-content)", () => {
    assert.match(css, /(^|\n)body\.modal-open,[\s\S]{0,120}overflow:\s*hidden/, "body lock");
    assert.match(
      css,
      /body\.modal-open \.main-content,[\s\S]{0,80}overflow:\s*hidden\s*!important/,
      "the actual page scroller (.main-content) is locked too",
    );
    assert.match(helper, /classList\.toggle\("modal-open", open\)/, "helper toggles the lock class");
  });

  it("tags every overlay/panel at runtime so all modals (and future ones) inherit it", () => {
    assert.match(helper, /export function initModalScrollLock/, "init exported");
    assert.match(helper, /export function decorateModals/, "decorator exported");
    assert.match(
      helper,
      /\.modal-backdrop, \.modal-overlay, \.upload-modal-backdrop, \.omni-modal/,
      "class-based overlays detected",
    );
    assert.match(helper, /position\\s\*:\\s\*fixed/, "inline-styled overlays detected by fingerprint");
    assert.match(helper, /new MutationObserver/, "one DOM watcher syncs lock + decoration");
    assert.match(
      entry,
      /import\("\.\/lib\/modal"\)\.then\(\(\{ initModalScrollLock \}\) => initModalScrollLock\(\)\)/,
      "the entry point installs the watcher",
    );
  });

  it("keeps the sticky header of the shared .modal component and scrolls only its body", () => {
    assert.match(css, /\.modal\s*\{[\s\S]*?overflow:\s*hidden;/, ".modal clips so header/footer stay put");
    assert.match(
      css,
      /\.modal-body,[\s\S]{0,40}\.modal-content\s*\{[\s\S]*?overflow-y:\s*auto/,
      "only the body scrolls",
    );
  });
});
