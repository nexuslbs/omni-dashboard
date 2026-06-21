import express from "express";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { healthRouter } from "./routes/health.js";
import { overviewRouter } from "./routes/overview.js";
import { messagesRouter } from "./routes/messages.js";
import { kanbanRouter } from "./routes/kanban.js";
import { scheduleRouter } from "./routes/schedule.js";
import { wikiSearchRouter } from "./routes/wiki-search.js";
import { uploadsRouter } from "./routes/uploads.js";
import { fsRouter } from "./routes/fs.js";
import { threadsRouter } from "./routes/threads.js";
import { channelsRouter } from "./routes/channels.js";
import { settingsRouter } from "./routes/settings.js";
import { profilesRouter } from "./routes/profiles.js";
import { platformsRouter } from "./routes/platforms.js";
import { pluginsRouter } from "./routes/plugins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

// JSON body parser
app.use(express.json());

// API routes
app.use("/api/health", healthRouter);
app.use("/api/overview", overviewRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/kanban", kanbanRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/wiki-search", wikiSearchRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/fs", fsRouter);
app.use("/api/threads", threadsRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/platforms", platformsRouter);
app.use("/api/plugins", pluginsRouter);

// Proxy for prompt-preview — forward to OmniAgent HTTP API
app.post("/api/prompt-preview/:channelName", async (req, res) => {
  try {
    const { channelName } = req.params;
    const { prompt, plan } = req.body;
    const omniagentUrl = `http://omniagent-omniagent-1:8080/prompt-preview/${encodeURIComponent(channelName)}`;
    const response = await fetch(omniagentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, plan }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("[prompt-preview] Proxy error:", err);
    res
      .status(502)
      .json({ error: "Failed to reach OmniAgent: " + (err instanceof Error ? err.message : String(err)) });
  }
});

// Proxy for OmniAgent HTTP API — forward /api/actions*, /api/mcp/tools
const OMNIAGENT_API = "http://omniagent-omniagent-1:8080";

async function omniagentProxy(req: express.Request, res: express.Response): Promise<void> {
  try {
    // Strip the /api prefix: /api/actions/5/run → /actions/5/run
    const targetPath = req.path.replace(/^\/api/, "");
    const targetUrl = new URL(targetPath, OMNIAGENT_API);
    const fetchOpts: RequestInit = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOpts.body = JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl.toString(), fetchOpts);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error(`[omniagent-proxy] Error proxying ${req.method} ${req.path}:`, err);
    res
      .status(502)
      .json({ error: "Failed to reach OmniAgent: " + (err instanceof Error ? err.message : String(err)) });
  }
}

app.get("/api/mcp/tools", omniagentProxy);
// Proxy ANY method for /api/actions and sub-paths — use middleware pattern for Express 5 compat
app.all(/^\/api\/actions(?:\/.*)?$/, omniagentProxy);

// Serve static files from ../dist (built frontend)
const distPath = join(__dirname, "..", "dist");
if (existsSync(distPath)) {
  // Hashed assets (in /assets/) — cache forever, immutable
  app.use(
    "/assets",
    express.static(join(distPath, "assets"), {
      maxAge: "365d",
      immutable: true,
    }),
  );
  // Other static files (favicon, .well-known, etc.) — moderate cache
  app.use(
    express.static(distPath, {
      maxAge: "1h",
      setHeaders(res: any, filePath: string) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      },
    }),
  );
}

// SPA fallback — serve index.html for any non-API, non-file route
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

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Omni-dashboard server running on http://0.0.0.0:${PORT}`);
});
