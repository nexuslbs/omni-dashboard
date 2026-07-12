import { Router } from "express";
import { execSync } from "child_process";

export const gitRouter = Router();

const OMNI_DIR = process.env.OMNI_DIR;

interface GitFileEntry {
  path: string;
  status: "M" | "U" | "D" | "R";
}

interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
}

interface GitError {
  error: string;
}

function gitCmd(args: string, cwd?: string): string {
  const dir = cwd || OMNI_DIR;
  if (!dir) throw new Error("OMNI_DIR not set");
  // --git-dir and --work-tree ensure the command runs in OMNI_DIR regardless of cwd
  return execSync(`git ${args}`, {
    cwd: dir,
    timeout: 30000,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function parsePorcelainLine(line: string): { stagedStatus: string | null; unstagedStatus: string; path: string } | null {
  if (!line.trim()) return null;
  // Format: XY filename
  // X = staged status, Y = unstaged status
  const stagedStatus = line[0] === " " ? null : line[0];
  const unstagedStatus = line[1];
  const path = line.substring(3).trim();
  return { stagedStatus, unstagedStatus, path };
}

function porcelainStatusToEntry(status: string): GitFileEntry["status"] {
  switch (status) {
    case "M": return "M";
    case "?":
    case "U": return "U";
    case "D": return "D";
    case "R": return "R";
    default: return "M";
  }
}

// GET /api/git/status — returns branch, ahead/behind, staged and unstaged files
gitRouter.get("/status", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }

    // Get branch name
    let branch: string;
    try {
      branch = gitCmd("rev-parse --abbrev-ref HEAD");
    } catch {
      res.json({ branch: "(no repo)", ahead: 0, behind: 0, staged: [], unstaged: [] });
      return;
    }

    // Get ahead/behind counts
    let ahead = 0;
    let behind = 0;
    try {
      const upstream = gitCmd("rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true");
      if (upstream) {
        const aheadOutput = gitCmd(`rev-list --count HEAD..${upstream} 2>/dev/null || echo 0`);
        behind = parseInt(aheadOutput, 10) || 0;
        const behindOutput = gitCmd(`rev-list --count ${upstream}..HEAD 2>/dev/null || echo 0`);
        ahead = parseInt(behindOutput, 10) || 0;
      }
    } catch {
      // No upstream
    }

    // Get staged and unstaged files via status --porcelain
    const porcelain = gitCmd("status --porcelain");
    const staged: GitFileEntry[] = [];
    const unstaged: GitFileEntry[] = [];

    for (const line of porcelain.split("\n")) {
      const parsed = parsePorcelainLine(line);
      if (!parsed) continue;

      if (parsed.stagedStatus) {
        staged.push({ path: parsed.path, status: porcelainStatusToEntry(parsed.stagedStatus) });
      }
      if (parsed.unstagedStatus && parsed.unstagedStatus !== " ") {
        unstaged.push({ path: parsed.path, status: porcelainStatusToEntry(parsed.unstagedStatus) });
      }
    }

    const result: GitStatusResponse = { branch, ahead, behind, staged, unstaged };
    res.json(result);
  } catch (e: any) {
    res.json({ branch: "(error)", ahead: 0, behind: 0, staged: [], unstaged: [], error: e.message });
  }
});

// POST /api/git/commit — commits all staged changes
gitRouter.post("/commit", (req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    const message = req.body?.message;
    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Commit message is required" });
      return;
    }
    // Stage all changes
    gitCmd("add -A");
    // Commit
    const safeMsg = message.replace(/'/g, "'\\''");
    gitCmd(`commit -m '${safeMsg}'`);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Commit failed" });
  }
});

// POST /api/git/discard — discards all unstaged changes
gitRouter.post("/discard", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    gitCmd("checkout -- .");
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Discard failed" });
  }
});

// POST /api/git/sync — fetch → pull (rebase) → push
gitRouter.post("/sync", async (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    // Fetch all
    gitCmd("fetch --all");
    // Pull with rebase
    try {
      gitCmd("pull --rebase");
    } catch (e: any) {
      // Pull may fail if there's nothing to pull or merge conflicts
    }
    // Push
    try {
      gitCmd("push");
    } catch (e: any) {
      res.status(500).json({ error: `Push failed: ${e.message}` });
      return;
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Sync failed" });
  }
});
