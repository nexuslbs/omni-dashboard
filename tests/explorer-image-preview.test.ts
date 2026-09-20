import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Regression tests: the Explorer must render IMAGE files as an actual image ──
//    (task_omnidev / "Explorer page: render image files as an actual image")
//
// Before this change opening a .png/.jpg/.svg showed the hardcoded
// "Binary or unsupported file type" placeholder. Images must now render an
// <img> fed by the inline raw-bytes endpoint, while non-image binaries keep the
// old placeholder and the download button keeps using the attachment endpoint.

const explorerSrc = readFileSync(new URL("../src/pages/explorer.ts", import.meta.url), "utf-8");
const fsRouteSrc = readFileSync(new URL("../server/routes/fs.ts", import.meta.url), "utf-8");
const styleSrc = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

const REQUIRED_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "avif"];

describe("Explorer image preview", () => {
  it("detects the required image extensions case-insensitively", () => {
    for (const ext of REQUIRED_EXTS) {
      assert.match(
        explorerSrc,
        new RegExp(`\\b${ext}:\\s*"image/`),
        `missing image extension mapping for .${ext}`,
      );
    }
    assert.match(explorerSrc, /toLowerCase\(\)/, "extension detection must be case-insensitive");
  });

  it("renders an <img> fed by the raw-bytes endpoint", () => {
    assert.match(
      explorerSrc,
      /<img class="image-preview-img"[^>]*src="\$\{rawUrl\}"/,
      "image preview must render an <img> whose src is the file URL",
    );
    assert.match(
      explorerSrc,
      /\/api\/fs\/raw\?path=\$\{encodeURIComponent\(path\)\}/,
      "image bytes must come from /api/fs/raw",
    );
  });

  it("checks the image branch BEFORE the binary placeholder branch", () => {
    const imageBranch = explorerSrc.indexOf("renderImagePreview(contentView, path, response.size)");
    const binaryBranch = explorerSrc.indexOf("<p>Binary or unsupported file type</p>");
    assert.ok(imageBranch > 0, "image branch present");
    assert.ok(binaryBranch > 0, "binary placeholder present");
    assert.ok(
      imageBranch < binaryBranch,
      "images (incl. text-ish SVG) must be handled before the binary/text branches",
    );
  });

  it("renders the normal error state when the image fails to load", () => {
    assert.match(explorerSrc, /addEventListener\("error"/, "img error handler required");
    assert.match(explorerSrc, /Could not load image/, "failed image must show the error state");
  });

  it("keeps the file header (path, size, download) on image previews", () => {
    const fn = explorerSrc.slice(explorerSrc.indexOf("function renderImagePreview"));
    assert.match(fn, /class="file-path"/);
    assert.match(fn, /class="file-size"/);
    assert.match(fn, /\/api\/fs\/download\?path=/, "download button must stay on /api/fs/download");
  });

  it("serves /api/fs/raw inline with an image content type", () => {
    assert.match(fsRouteSrc, /fsRouter\.get\("\/raw"/, "server must expose GET /raw");
    assert.match(fsRouteSrc, /IMAGE_MIME_BY_EXT/, "server must map extensions to image mime types");
    assert.match(
      fsRouteSrc,
      /res\.setHeader\("Content-Disposition", `inline/,
      "raw must be inline, never attachment",
    );
    assert.match(fsRouteSrc, /res\.sendFile\(absPath\)/, "raw must stream the real bytes");
  });

  it("styles the image preview container", () => {
    assert.match(styleSrc, /\.image-preview\s*\{/);
    assert.match(styleSrc, /\.image-preview-img\s*\{/);
  });
});
