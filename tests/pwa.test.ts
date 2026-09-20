import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── PWA install splash: navy #0a0f1e background ──
// The Android PWA install splash renders the manifest background_color/theme_color
// (plus the theme-color meta tag). Regression test for task
// task_omnidev_dashboard_pwa_install_background_navy.

const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
const manifest = JSON.parse(
  readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf-8"),
);

describe("PWA manifest (public/manifest.webmanifest)", () => {
  it("declares navy background_color #0a0f1e", () => {
    assert.equal(manifest.background_color, "#0a0f1e");
  });

  it("declares navy theme_color #0a0f1e", () => {
    assert.equal(manifest.theme_color, "#0a0f1e");
  });

  it("is installable: standalone display + start_url + icons", () => {
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "/");
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  });
});

describe("index.html PWA wiring", () => {
  it("links the web app manifest", () => {
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  });

  it("sets theme-color meta to #0a0f1e", () => {
    assert.match(html, /<meta name="theme-color" content="#0a0f1e" \/>/);
  });
});

describe("PWA install icons (public/icons)", () => {
  const pngIcons = (
    manifest.icons as Array<{
      src: string;
      sizes: string;
      type: string;
      purpose?: string;
    }>
  ).filter((icon) => icon.type === "image/png");

  it("declares raster PNG icons with sizes 192x192 and 512x512", () => {
    const sizes = pngIcons.map((icon) => icon.sizes);
    assert.ok(sizes.includes("192x192"), "a 192x192 PNG icon must be declared");
    assert.ok(sizes.includes("512x512"), "a 512x512 PNG icon must be declared");
  });

  it("declares PNG icons for purpose any and purpose maskable", () => {
    const purposes = pngIcons.map((icon) => icon.purpose ?? "any");
    assert.ok(purposes.includes("any"), "an 'any' purpose PNG icon must be declared");
    assert.ok(purposes.includes("maskable"), "a 'maskable' purpose PNG icon must be declared");
  });

  for (const icon of pngIcons) {
    it(`icon file exists, is a non-empty PNG and matches its declared size: ${icon.src}`, () => {
      const filePath = new URL(`../public${icon.src}`, import.meta.url);
      const data = readFileSync(filePath);
      assert.ok(data.length > 1000, `${icon.src} must not be empty`);
      assert.deepEqual(
        [...data.subarray(0, 8)],
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        `${icon.src} must be a PNG file`,
      );
      const width = data.readUInt32BE(16);
      const height = data.readUInt32BE(20);
      const [declaredWidth, declaredHeight] = icon.sizes.split("x").map((part) => Number(part));
      assert.equal(width, declaredWidth, `${icon.src} width must match its declared size`);
      assert.equal(height, declaredHeight, `${icon.src} height must match its declared size`);
    });
  }
});

// ── PWA installability: service worker with a fetch handler ──
// Android Chrome only offers "Install app" (manifest icon + navy splash) when
// the page registers a service worker with a fetch handler; without one the
// browser degrades to "Add to Home screen" with a browser-generated icon.
// Regression test for task task_omnidev_dashboard_pwa_install_shows_no_app
// (reopened 2026-09-20, ships in v0.3.2).

describe("PWA service worker (public/sw.js)", () => {
  const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf-8");

  it("registers a fetch handler (Chrome install criterion)", () => {
    assert.match(sw, /addEventListener\(\s*["']fetch["']/);
  });

  it("skips waiting so an update goes live on the next load", () => {
    assert.match(sw, /skipWaiting\(\)/);
    assert.match(sw, /clients\.claim\(\)/);
  });

  it("never intercepts the dashboard API", () => {
    assert.match(sw, /startsWith\(\s*["']\/api\/["']\s*\)/);
  });

  it("precaches the manifest and the raster install icons", () => {
    for (const asset of [
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-192.png",
      "/icons/icon-maskable-512.png",
    ]) {
      assert.ok(sw.includes(`"${asset}"`), `${asset} must be precached`);
    }
  });
});

describe("PWA service worker registration", () => {
  const entry = readFileSync(new URL("../src/index.ts", import.meta.url), "utf-8");

  it("registers /sw.js from the app entry point", () => {
    assert.match(entry, /navigator\.serviceWorker/);
    assert.match(entry, /register\(\s*["']\/sw\.js["']/);
  });
});

describe("PWA manifest install metadata", () => {
  it("declares an install id and keeps the root scope", () => {
    assert.equal(manifest.id, "/");
    assert.equal(manifest.scope, "/");
  });

  it("lists a raster PNG icon before the SVG fallback", () => {
    const types = (manifest.icons as Array<{ type: string }>).map((icon) => icon.type);
    assert.equal(types[0], "image/png", "the first declared icon must be a raster PNG");
    assert.ok(types.includes("image/svg+xml"), "the SVG fallback must stay declared");
  });
});
