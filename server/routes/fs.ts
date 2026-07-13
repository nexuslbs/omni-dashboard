import { Router } from "express";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "fs";
import { join, basename, relative, resolve, sep } from "path";
import { execSync } from "child_process";

export const fsRouter = Router();

const ROOT = (process.env.EXPLORER_DIR || "/opt").replace(/\/+$/, "");
const OMNI_DIR = process.env.OMNI_DIR || ROOT;

interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
}

// GET /api/fs/config: returns filesystem root and OMNI_DIR for path computation
fsRouter.get("/config", (_req, res) => {
  res.json({
    root: ROOT,
    omniDir: OMNI_DIR,
  });
});

// GET /api/fs/list?path=<relative-path>
// Lists directory contents. Path is relative to ROOT (use "/" for root).
fsRouter.get("/list", (req, res) => {
  try {
    const rawPath = (req.query.path as string) || "/";
    const absPath = sanitizePath(rawPath);

    if (!existsSync(absPath)) {
      res.status(404).json({ error: "Path not found" });
      return;
    }

    const entries: FsEntry[] = readdirSync(absPath)
      .filter((name) => !name.startsWith("."))
      .map((name) => {
        const full = join(absPath, name);
        let type: "file" | "directory" = "file";
        let size: number | null = null;
        try {
          const stat = lstatSync(full);
          type = stat.isDirectory() ? "directory" : "file";
          if (type === "file") size = stat.size;
        } catch {
          // Permission denied or broken symlink
        }
        const relativePath = join("/", relative(ROOT, full));
        return { name, path: relativePath, type, size };
      })
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    res.json({ entries, path: rawPath, root: ROOT });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to list directory" });
  }
});

// GET /api/fs/read?path=<relative-path>
// Reads a file's text content. Path is relative to ROOT.
fsRouter.get("/read", (req, res) => {
  try {
    const rawPath = (req.query.path as string) || "";
    const absPath = sanitizePath(rawPath);

    if (!existsSync(absPath)) {
      res.status(404).json({ error: "File not found or not readable (404)" });
      return;
    }

    const stat = statSync(absPath);
    if (!stat.isFile()) {
      res.status(400).json({ error: "Not a file" });
      return;
    }

    // Try reading as UTF-8; if it fails, mark as binary
    try {
      const content = readFileSync(absPath, "utf-8");
      res.json({
        content,
        size: stat.size,
        binary: false,
      });
    } catch {
      // Binary file: return the size and a binary flag
      res.json({
        content: "",
        size: stat.size,
        binary: true,
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to read file" });
  }
});

// GET /api/fs/diff?path=<relative-path>&staged=true&full=true
// Returns the git diff for a file. Path is relative to ROOT.
// full=true uses -U99999 to show the entire file with changes highlighted.
// full=false (or omit) uses git's default context (3 lines).
fsRouter.get("/diff", (req, res) => {
  try {
    const rawPath = (req.query.path as string) || "";
    const absPath = sanitizePath(rawPath);
    const staged = req.query.staged === "true";
    const full = req.query.full !== "false"; // default true

    if (!existsSync(absPath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Run git diff
    const diffFlag = staged ? "--cached" : "";
    const contextFlag = full ? "-U99999" : "";
    try {
      const diff = execSync(`git -C "${OMNI_DIR}" diff ${contextFlag} ${diffFlag} -- "${absPath}"`, {
        timeout: 15000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      // If the result is empty but we're asking for staged, try showing new file
      if (!diff && staged) {
        // Check if it's a new file that was staged (git diff --cached alone would work,
        // but per-file diff might return empty for a new untracked file)
        // Try git diff --cached --name-status to verify
        try {
          const nameStatus = execSync(`git -C "${OMNI_DIR}" diff --cached --name-status -- "${absPath}"`, {
            timeout: 5000,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
          if (nameStatus.startsWith("A")) {
            // Added file: show the full content as addition
            const content = readFileSync(absPath, "utf-8");
            const relPath = relative(OMNI_DIR, absPath);
            const header = `diff --git a/${relPath} b/${relPath}\nnew file mode 100644\nindex 0000000..0000000\n--- /dev/null\n+++ b/${relPath}\n`;
            const lines = content.split("\n");
            const body = lines
              .map((l: string, i: number) => {
                const lineNum = String(i + 1).padStart(4);
                return `+${lineNum}\t${l}`;
              })
              .join("\n");
            res.json({ diff: header + body });
            return;
          }
        } catch {
          // fall through to return empty
        }
      }

      res.json({ diff });
    } catch {
      // git diff failed (file not tracked, etc)
      res.json({ diff: "" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to get diff" });
  }
});

// GET /api/fs/download?path=<relative-path>
// Downloads a file. Path is relative to ROOT.
fsRouter.get("/download", (req, res) => {
  try {
    const rawPath = (req.query.path as string) || "";
    const absPath = sanitizePath(rawPath);

    if (!existsSync(absPath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const fileName = basename(absPath);
    res.download(absPath, fileName);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to download file" });
  }
});

/**
 * Sanitize and resolve a path relative to ROOT.
 * Accepts paths starting with / (relative to ROOT) or bare filenames.
 * Prevents directory traversal outside ROOT.
 */
function sanitizePath(raw: string): string {
  // Remove ROOT prefix if present (paths may come as /opt/omni/... or /omni/...)
  let clean = raw;
  if (clean.startsWith(ROOT)) {
    clean = clean.slice(ROOT.length);
  }
  // Ensure it starts with /
  if (!clean.startsWith("/")) {
    clean = "/" + clean;
  }
  // Resolve and prevent traversal
  const resolved = resolve(join(ROOT, "." + clean));
  // Double-check the resolved path starts with ROOT
  if (!resolved.startsWith(ROOT + sep) && resolved !== ROOT) {
    throw new Error("Invalid path: traversal detected");
  }
  return resolved;
}
