import { Router } from "express";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

export const fsRouter = Router();

const ROOT = "/opt/data";

function sanitizePath(userPath: string): string {
  // Strip any prefix that matches ROOT to prevent double-prefixing
  const clean = userPath.replace(new RegExp("^" + ROOT.replace(/\//g, "\\/")), "");
  // Resolve and ensure it stays within ROOT
  const resolved = resolve(join(ROOT, clean));
  if (!resolved.startsWith(ROOT)) {
    throw new Error("Access denied: path traversal detected");
  }
  return resolved;
}

interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
}

// GET /api/fs/list?path=<relative-path>
// Lists directory contents. Path is relative to /host (use "/" for root).
fsRouter.get("/list", (req, res) => {
  try {
    const userPath = (req.query.path as string) || "/";
    const dirPath = sanitizePath(userPath);

    let entries: (FsEntry | null)[];
    try {
      entries = readdirSync(dirPath).map((name) => {
        const fullPath = join(dirPath, name);
        let stat;
        try {
          stat = statSync(fullPath);
        } catch {
          return null;
        }
        return {
          name,
          path: fullPath.replace(new RegExp("^" + ROOT), ""),
          type: stat.isDirectory() ? ("directory" as const) : ("file" as const),
          size: stat.isFile() ? stat.size : null,
        };
      });
    } catch {
      res.json({ entries: [], path: userPath, error: "Cannot read directory" });
      return;
    }

    // Filter out nulls (inaccessible entries) and sort: directories first, then alphabetical
    const validEntries: FsEntry[] = entries.filter((e): e is FsEntry => e !== null);
    validEntries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ entries: validEntries, path: userPath });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// GET /api/fs/read?path=<relative-path>
// Reads a file and returns its content.
fsRouter.get("/read", (req, res) => {
  try {
    const userPath = (req.query.path as string) || "";
    if (!userPath) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const filePath = sanitizePath(userPath);

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      res.status(404).json({ error: "File not found or not readable" });
      return;
    }

    res.json({
      path: userPath,
      content,
      size: statSync(filePath).size,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// GET /api/fs/download?path=<relative-path>
// Downloads a file as an attachment.
fsRouter.get("/download", (req, res) => {
  try {
    const userPath = (req.query.path as string) || "";
    if (!userPath) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    const filePath = sanitizePath(userPath);

    if (!statSync(filePath).isFile()) {
      res.status(404).json({ error: "Not a file" });
      return;
    }

    const basename = userPath.split("/").pop() || "download";
    const content = readFileSync(filePath);

    const ext = basename.split(".").pop()?.toLowerCase() || "";
    const mimeMap: Record<string, string> = {
      md: "text/markdown",
      txt: "text/plain",
      js: "application/javascript",
      ts: "application/typescript",
      py: "text/x-python",
      json: "application/json",
      yaml: "text/yaml",
      yml: "text/yaml",
      css: "text/css",
      html: "text/html",
      sh: "application/x-sh",
      xml: "application/xml",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      ico: "image/x-icon",
      pdf: "application/pdf",
      zip: "application/zip",
      gz: "application/gzip",
      tar: "application/x-tar",
      db: "application/octet-stream",
      log: "text/plain",
      toml: "text/toml",
      conf: "text/plain",
      env: "text/plain",
      go: "text/x-go",
      rs: "text/x-rust",
      rb: "text/x-ruby",
      java: "text/x-java",
      kt: "text/x-kotlin",
      swift: "text/x-swift",
      pl: "text/x-perl",
      lua: "text/x-lua",
      sql: "application/sql",
    };
    const mime = mimeMap[ext] || "application/octet-stream";

    res.setHeader("Content-Disposition", `attachment; filename="${basename}"`);
    res.setHeader("Content-Type", mime);
    res.send(content);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
