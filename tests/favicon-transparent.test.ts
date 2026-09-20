import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Browser-tab favicon must be TRANSPARENT ──
// Regression test for task task_omnidev_dashboard_browser_tab_favicon_has_a.
//
// The PWA install work (commits a023117 + 0701831) added to index.html:
//   <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
// so Chrome rendered the navy-background INSTALL icon as the browser-tab favicon
// (the operator saw a navy square in the tab). Commit 4447c09 removed that link
// again: the tab favicon must come from the transparent /favicon.svg only, while
// the navy PNGs stay INSTALL assets (manifest icons + apple-touch-icon).

const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
const faviconSvg = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf-8");

const iconLinks = [...html.matchAll(/<link\b[^>]*\brel="icon"[^>]*>/g)].map((m) => m[0]);

describe("browser-tab favicon (index.html)", () => {
  it("declares exactly one rel=icon link", () => {
    assert.equal(
      iconLinks.length,
      1,
      `expected exactly 1 rel="icon" link, got ${iconLinks.length}: ${JSON.stringify(iconLinks)}`,
    );
  });

  it("points rel=icon at the transparent SVG, not a PNG install icon", () => {
    assert.match(iconLinks[0], /type="image\/svg\+xml"/);
    assert.match(iconLinks[0], /href="\/favicon\.svg"/);
    assert.doesNotMatch(iconLinks[0], /\.png/);
  });

  it("never declares a PNG rel=icon (the navy install PNG must not paint the tab)", () => {
    for (const link of iconLinks) {
      assert.doesNotMatch(
        link,
        /\/icons\/icon-(192|512)\.png/,
        `${link} would render the navy install square in the browser tab`,
      );
    }
  });

  it("keeps the navy install assets wired: manifest link + apple-touch-icon", () => {
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/icon-192\.png" \/>/);
  });
});

describe("transparent favicon asset (public/favicon.svg)", () => {
  it("has no background rect/paint covering the canvas", () => {
    assert.doesNotMatch(faviconSvg, /<rect\b/, "a <rect> would give the tab favicon an opaque background");
    assert.doesNotMatch(faviconSvg, /#0a0f1e/i, "the navy install background must not appear in the tab favicon");
    assert.doesNotMatch(faviconSvg, /background\s*[:=]/i);
  });

  it("draws the hexagon glyph as polygons", () => {
    assert.match(faviconSvg, /<polygon\b/);
  });
});
