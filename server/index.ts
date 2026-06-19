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
