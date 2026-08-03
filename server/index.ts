import express from "express";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

import { healthRouter } from "./routes/health.js";
import { wikiSearchRouter } from "./routes/wiki-search.js";
import { uploadsRouter } from "./routes/uploads.js";
import { fsRouter } from "./routes/fs.js";
import { profilesRouter } from "./routes/profiles.js";
import { gitRouter } from "./routes/git.js";
import { dbRouter } from "./routes/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// JSON body parser
app.use(express.json());

// ────────────────────────────────────────────────────────────────────────────
// Local (non-proxied) API routes: these don't hit the omniagent backend
// ────────────────────────────────────────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/wiki-search", wikiSearchRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/fs", fsRouter);
app.use("/api/git", gitRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/db", dbRouter);

// GET /api/fetch-remote?url=<http(s) url>: fetch a remote text resource
// (used by the plugin Import modal to bypass browser CORS restrictions).
// Only http(s) URLs are allowed; the upstream status and body are forwarded
// so the frontend can distinguish "HTTP 404" from "network error".
app.get("/api/fetch-remote", async (req, res) => {
  const target = String(req.query.url || "").trim();
  if (!target) {
    res.status(400).json({ error: "Missing required query parameter: url" });
    return;
  }
  if (!/^https?:\/\//i.test(target)) {
    res.status(400).json({ error: "Only http(s) URLs are allowed" });
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(target, { redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    const text = await response.text();
    res.status(response.status).type("text/plain").send(text);
  } catch (err: unknown) {
    const isTimeout =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error &&
        (err.name === "AbortError" || err.message?.includes("abort") || err.message?.includes("timeout")));
    if (isTimeout) {
      res.status(504).json({ error: "Timed out fetching URL (30s)" });
    } else {
      res.status(502).json({ error: "Network error: " + (err instanceof Error ? err.message : String(err)) });
    }
  }
});

// GET /api/remote-yml: serve the local remote.yml (host data dir) as text/plain.
// The plugin Import modal compares fetched entries against this file's section.
app.get("/api/remote-yml", (_req, res) => {
  const candidates = [
    process.env.OMNI_DIR ? join(process.env.OMNI_DIR, "remote.yml") : "",
    "/opt/omni/remote.yml",
    "/opt/workspace/omni-stack/remote.yml",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        const text = readFileSync(candidate, "utf-8");
        res.status(200).type("text/plain").send(text);
        return;
      }
    } catch {
      // try next candidate
    }
  }
  res.status(404).json({ error: "remote.yml not found on server" });
});

// ────────────────────────────────────────────────────────────────────────────
// Proxy to OmniAgent (Rust backend): endpoints with irregular path mapping
// ────────────────────────────────────────────────────────────────────────────
const OMNIAGENT = process.env.OMNIAGENT_URL || "http://omniagent:8080";
const PROXY_TIMEOUT = 600000; // 10 minutes: plugin install/reinstall can take 2-3 min

async function fetchAndForward(
  req: express.Request,
  res: express.Response,
  targetUrl: string,
): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT);
    const fetchOpts: RequestInit = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOpts.body = JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, fetchOpts);
    clearTimeout(timeout);
    const text = await response.text();
    if (text) {
      try {
        const data = JSON.parse(text);
        res.status(response.status).json(data);
      } catch {
        res.status(response.status).send(text);
      }
    } else {
      res.status(response.status).end();
    }
  } catch (err: unknown) {
    // console.error(`[omniagent-proxy] Error proxying ${req.method} ${req.path}:`, err);
    const isTimeout =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error &&
        (err.name === "AbortError" || err.message?.includes("abort") || err.message?.includes("timeout")));
    if (isTimeout) {
      res.status(408).json({
        error: `Request to OmniAgent timed out after ${PROXY_TIMEOUT}ms. Plugin operations (install, reinstall, download) compile Rust code which can take several minutes. Try again: the backend may still be processing the request.`,
      });
    } else {
      res
        .status(502)
        .json({ error: "Failed to reach OmniAgent: " + (err instanceof Error ? err.message : String(err)) });
    }
  }
}

// Stop channel
app.post("/api/channels/:channelId/stop", (req, res) => {
  const { channelId } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/stop/${encodeURIComponent(channelId)}`);
});

// Stop thread
app.post("/api/threads/:threadId/stop", (req, res) => {
  const { threadId } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/stop-thread/${encodeURIComponent(threadId)}`);
});

// Memory context preview
app.get("/api/memory/context/:channelName", (req, res) => {
  const { channelName } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/api/context/${encodeURIComponent(channelName)}`);
});

// Schedule run (manual cron trigger)
app.post("/api/schedule/:id/run", (req, res) => {
  const { id } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/run-cron/${encodeURIComponent(id)}`);
});

// Prompt preview
app.post("/api/prompt-preview/:channelName", (req, res) => {
  const { channelName } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/prompt-preview/${encodeURIComponent(channelName)}`);
});

// Raw prompt template
app.get("/api/prompt/:channelName", (req, res) => {
  const { channelName } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/prompt/${encodeURIComponent(channelName)}`);
});

// Close channel
app.post("/api/channels/:channelId/close", (req, res) => {
  const { channelId } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/close/${encodeURIComponent(channelId)}`);
});

// Open channel
app.post("/api/channels/:channelId/open", (req, res) => {
  const { channelId } = req.params;
  void fetchAndForward(req, res, `${OMNIAGENT}/open/${encodeURIComponent(channelId)}`);
});

// ────────────────────────────────────────────────────────────────────────────
// Plugin routes: preserve /api prefix (Rust backend serves plugins at /api/plugins/*)
app.all(/^\/api\/plugins(?:\/.*)?$/, async (req, res) => {
  // Keep the /api prefix: /api/plugins → /api/plugins
  const queryStr = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const targetUrl = `${OMNIAGENT}${req.path}${queryStr}`;
  await fetchAndForward(req, res, targetUrl);
});

// Reload plugins : preserve /api prefix (Rust backend serves at /api/reload)
app.post("/api/reload", (req, res) => {
  void fetchAndForward(req, res, `${OMNIAGENT}/api/reload`);
});

// ────────────────────────────────────────────────────────────────────────────
// Generic proxy: all other /api/* routes go to OmniAgent with /api prefix stripped
// ────────────────────────────────────────────────────────────────────────────
app.all(
  /^\/api\/(?!health|wiki-search|uploads|fs|git|profiles|plugins|templates|db)(?:.*)$/,
  async (req, res) => {
    try {
      // Strip the /api prefix: /api/messages/filters → /messages/filters
      const targetPath = req.path.replace(/^\/api/, "");
      // Preserve query string
      const queryStr = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
      const targetUrl = `${OMNIAGENT}${targetPath}${queryStr}`;
      await fetchAndForward(req, res, targetUrl);
    } catch (err) {
      // console.error(`[generic-proxy] Error ${req.method} ${req.path}:`, err);
      res
        .status(502)
        .json({ error: "Failed to reach OmniAgent: " + (err instanceof Error ? err.message : String(err)) });
    }
  },
);

// ────────────────────────────────────────────────────────────────────────────
// File-system based API routes
// ────────────────────────────────────────────────────────────────────────────

// GET /api/templates: List available template files across all profiles
app.get("/api/templates", (_req, res) => {
  try {
    const dataDir = process.env.OMNI_DIR;
    if (!dataDir) {
      res.status(500).json({ error: "OMNI_DIR environment variable must be set" });
      return;
    }
    const profilesDir = join(dataDir, "profiles");
    const templates: { profile: string; name: string; label: string }[] = [];

    if (existsSync(profilesDir)) {
      const profiles = readdirSync(profilesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const profile of profiles) {
        const templatesDir = join(profilesDir, profile.name, "templates");
        if (!existsSync(templatesDir)) continue;
        const files = readdirSync(templatesDir).filter((f) => f.endsWith(".md"));
        for (const file of files) {
          const name = basename(file, ".md");
          let label = name;
          try {
            const content = readFileSync(join(templatesDir, file), "utf-8");
            const firstLine = content.split("\n")[0]?.trim();
            if (firstLine && firstLine.startsWith("# ")) {
              label = firstLine.replace(/^#\s*/, "").trim();
            }
          } catch {
            /* use name as fallback */
          }
          templates.push({ profile: profile.name, name, label });
        }
      }
    }

    res.json(templates);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // console.error("[templates] Error listing templates:", errMsg);
    res.status(500).json({ error: errMsg || "Unknown error" });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Static files
// ────────────────────────────────────────────────────────────────────────────
const distPath = join(__dirname, "..", "dist");
if (existsSync(distPath)) {
  app.use(
    "/assets",
    express.static(join(distPath, "assets"), {
      maxAge: "365d",
      immutable: true,
    }),
  );
  app.use(
    express.static(distPath, {
      maxAge: "1h",
      setHeaders(res: express.Response, filePath: string) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      },
    }),
  );
}

// SPA fallback
app.use((_req, res) => {
  const indexPath = join(distPath, "index.html");
  if (existsSync(indexPath)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Not found" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  // console.log(`[server] Omni-dashboard server running on http://0.0.0.0:${PORT}`);
});
