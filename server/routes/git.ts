import { Router } from "express";
import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync } from "fs";
import { createSign } from "crypto";
import { join } from "path";

export const gitRouter = Router();

const OMNI_DIR = process.env.OMNI_DIR;

// ── GitHub App token generation ──

/** Read env var from /opt/data/.env (mounted :ro in the dashboard container) */
function readDotEnvVar(name: string): string | null {
  const envPath = "/opt/data/.env";
  if (!existsSync(envPath)) return null;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(name + "=")) {
      return trimmed
        .slice(name.length + 1)
        .replace(/["']/g, "")
        .trim();
    }
  }
  return null;
}

/** Generate a fresh GitHub App installation access token */
async function getGitHubToken(): Promise<string | null> {
  const appId = readDotEnvVar("GITHUB_APP_ID");
  const instId = readDotEnvVar("GITHUB_INSTALLATION_ID");
  if (!appId || !instId) return null;

  // Find private key file
  const credDir = "/opt/data/credentials";
  let keyPath = "";
  if (existsSync(credDir)) {
    const files = readdirSync(credDir);
    keyPath = files.find((f: string) => f.endsWith(".private-key.pem")) || "";
    if (keyPath) keyPath = join(credDir, keyPath);
  }
  if (!keyPath || !existsSync(keyPath)) return null;

  const privateKey = readFileSync(keyPath, "utf-8");
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 600, iss: appId };

  const base64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url").replace(/=+$/, "");

  const signingInput = base64url(header) + "." + base64url(payload);

  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const sig = sign.sign(privateKey, "base64url");
  const jwt = signingInput + "." + sig;

  // Exchange JWT for installation token
  const url = `https://api.github.com/app/installations/${instId}/access_tokens`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "hermes-agent",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[git-token] HTTP ${resp.status}: ${text}`);
      return null;
    }
    const data = (await resp.json()) as { token: string };
    return data.token;
  } catch (e) {
    console.error("[git-token] Fetch error:", e);
    return null;
  }
}

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

function gitCmd(args: string, cwd?: string): string {
  const dir = cwd || OMNI_DIR;
  if (!dir) throw new Error("OMNI_DIR not set");
  // --git-dir and --work-tree ensure the command runs in OMNI_DIR regardless of cwd
  return execSync(`git ${args}`, {
    cwd: dir,
    timeout: 30000,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Convert any SSH-style remotes (git@github.com:...) to HTTPS so they work
 *  without the ssh binary. Idempotent : safe to call on every request. */
function ensureHttpsRemotes(): void {
  const dir = OMNI_DIR;
  if (!dir) return;
  try {
    const remotes = execSync(`git remote`, { cwd: dir, encoding: "utf-8", timeout: 5000 })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const remote of remotes) {
      try {
        const url = execSync(`git remote get-url ${remote}`, {
          cwd: dir,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();
        if (url.startsWith("git@github.com:")) {
          const httpsUrl = url.replace(/^git@github\.com:/, "https://github.com/");
          execSync(`git remote set-url ${remote} "${httpsUrl}"`, {
            cwd: dir,
            encoding: "utf-8",
            timeout: 5000,
          });
          console.log(`[git] Converted SSH→HTTPS for remote '${remote}'`);
        }
      } catch {
        // skip remotes that fail to read/set
      }
    }
  } catch {
    // Not a git repo or no remotes
  }
}

function parsePorcelainLine(
  line: string,
): { stagedStatus: string | null; unstagedStatus: string; path: string } | null {
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
    case "M":
      return "M";
    case "?":
    case "U":
      return "U";
    case "D":
      return "D";
    case "R":
      return "R";
    default:
      return "M";
  }
}

// GET /api/git/status: returns branch, ahead/behind, staged and unstaged files
gitRouter.get("/status", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }

    ensureHttpsRemotes();

    // Get branch name
    let branch: string;
    try {
      branch = gitCmd("rev-parse --abbrev-ref HEAD").trim();
    } catch {
      res.json({ branch: "(no repo)", ahead: 0, behind: 0, staged: [], unstaged: [] });
      return;
    }

    // Get ahead/behind counts: fetch first to ensure tracking branch is current
    let ahead = 0;
    let behind = 0;
    try {
      gitCmd("fetch --all --no-tags 2>/dev/null || true");
      const upstream = gitCmd(
        "rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true",
      ).trim();
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
  } catch (e: unknown) {
    res.json({ branch: "(error)", ahead: 0, behind: 0, staged: [], unstaged: [], error: e.message });
  }
});

// POST /api/git/commit: commits all staged changes
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
    // If no staged changes, stage everything first; otherwise commit only staged
    const porcelain = gitCmd("status --porcelain");
    const hasStaged = porcelain.split("\n").some((l: string) => l.trim() && l[0] !== " ");
    if (!hasStaged) {
      gitCmd("add -A");
    }
    // Commit
    const safeMsg = message.replace(/'/g, "'\\''");
    gitCmd(`commit -m '${safeMsg}'`);
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e.message || "Commit failed" });
  }
});

// POST /api/git/stage: stages all unstaged changes (git add -A)
gitRouter.post("/stage", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    gitCmd("add -A");
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e.message || "Stage failed" });
  }
});

// POST /api/git/discard: discards all unstaged changes
gitRouter.post("/discard", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    gitCmd("checkout -- .");
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e.message || "Discard failed" });
  }
});

// POST /api/git/unstage: unstages all staged changes (keeps file changes)
gitRouter.post("/unstage", (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    gitCmd("reset HEAD -- .");
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e.message || "Unstage failed" });
  }
});

// POST /api/git/sync: fetch → pull (rebase) → push
gitRouter.post("/sync", async (_req, res) => {
  try {
    if (!OMNI_DIR) {
      res.status(500).json({ error: "OMNI_DIR not set" });
      return;
    }
    ensureHttpsRemotes();

    // Fetch all
    gitCmd("fetch --all");

    // Pull with rebase
    try {
      gitCmd("pull --rebase");
    } catch {
      // Pull may fail if there's nothing to pull or merge conflicts
    }

    // Generate a fresh token and update the remote URL
    const token = await getGitHubToken();
    if (token) {
      gitCmd(`remote set-url nexuslbs "https://x-access-token:${token}@github.com/nexuslbs/omni-stack.git"`);
    } else {
      console.warn("[git-sync] Could not generate fresh token, using existing remote URL");
    }

    // Push
    try {
      gitCmd("push nexuslbs");
    } catch (e: unknown) {
      res.status(500).json({ error: `Push failed: ${e.message}` });
      return;
    }
    res.json({ success: true });
  } catch (e: unknown) {
    res.status(500).json({ error: e.message || "Sync failed" });
  }
});
