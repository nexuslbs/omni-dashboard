import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";
import multer from "multer";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export const memoryRouter = Router();

const OMNI_DATA_DIR = process.env.OMNI_DATA_DIR || "/opt/data";

// Multer config for file uploads
const upload = multer({ dest: "/tmp/uploads/" });

// ─── GET /stats ────────────────────────────────────────────────────────────────
memoryRouter.get("/stats", async (req: Request, res: Response) => {
  try {
    const profile = (req.query.profile as string) || null;
    const channelId = req.query.channel ? parseInt(req.query.channel as string, 10) : null;

    // Build the thread filter subquery conditions
    const threadConds: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (profile) {
      threadConds.push(`profile = $${paramIdx++}`);
      params.push(profile);
    }
    if (channelId !== null && !isNaN(channelId)) {
      threadConds.push(`channel_id = $${paramIdx++}`);
      params.push(channelId);
    }

    const threadWhere = threadConds.length > 0 ? `WHERE ${threadConds.join(" AND ")}` : "";

    // Count threads
    const threadsResult = await queryDb(`SELECT COUNT(*) as cnt FROM threads ${threadWhere}`, params);
    const threads = Number(threadsResult[0]?.cnt) || 0;

    // Count completed threads
    const threadsCompletedResult = await queryDb(
      `SELECT COUNT(*) as cnt FROM threads ${threadWhere}${threadConds.length > 0 ? " AND" : " WHERE"} status = 'completed'`,
      params,
    );
    const threads_completed = Number(threadsCompletedResult[0]?.cnt) || 0;

    // Count failed threads
    const threadsFailedResult = await queryDb(
      `SELECT COUNT(*) as cnt FROM threads ${threadWhere}${threadConds.length > 0 ? " AND" : " WHERE"} status = 'failed'`,
      params,
    );
    const threads_failed = Number(threadsFailedResult[0]?.cnt) || 0;

    // Count messages — same filter via thread_id IN subquery
    const messagesResult = await queryDb(
      `SELECT COUNT(*) as cnt FROM messages WHERE thread_id IN (SELECT id FROM threads ${threadWhere})`,
      params,
    );
    const messages = Number(messagesResult[0]?.cnt) || 0;

    // Count vectors (messages with non-empty embedding)
    const vectorsResult = await queryDb(
      `SELECT COUNT(*) as cnt FROM messages WHERE embedding IS NOT NULL AND embedding != '' AND thread_id IN (SELECT id FROM threads ${threadWhere})`,
      params,
    );
    const vectors = Number(vectorsResult[0]?.cnt) || 0;

    // Count Qdrant wiki collections
    let qdrantWikis = 0;
    try {
      const response = await fetch("http://qdrant:6333/collections/wiki");
      if (response.ok) {
        const data = await response.json();
        qdrantWikis = (data as any)?.result?.points_count ?? 0;
      }
    } catch (err) {
      console.error("[memory] Failed to fetch Qdrant wiki count:", err);
    }

    res.json({
      threads,
      threads_completed,
      threads_failed,
      messages,
      vectors,
      qdrant_wikis: qdrantWikis,
    });
  } catch (err) {
    console.error("[memory] GET /stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── GET /search-messages ───────────────────────────────────────────────────────
memoryRouter.get("/search-messages", async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const profile = (req.query.profile as string) || null;
    const channel = (req.query.channel as string) || null;
    const limit = Math.min(parseInt((req.query.limit as string) || "10", 10), 500);
    const pattern = `%${q}%`;

    // Build conditions
    const conds: string[] = [`m.content ILIKE $1`];
    const params: any[] = [pattern];
    let paramIdx = 2;

    if (profile) {
      conds.push(`t.profile = $${paramIdx++}`);
      params.push(profile);
    }
    if (channel) {
      const chId = parseInt(channel, 10);
      if (!isNaN(chId)) {
        conds.push(`t.channel_id = $${paramIdx++}`);
        params.push(chId);
      }
    }

    const whereClause = conds.join(" AND ");
    const sql = `
      SELECT
        m.id, m.thread_id, m.role, m.content, m.thread_sequence,
        m.external_id, m.metadata, m.created_at, m.msg_type, m.msg_subtype,
        t.channel_id, t.status, t.profile, t.provider, t.model,
        t.duration_ms as thread_duration_ms,
        t.input_tokens as thread_input_tokens,
        t.output_tokens as thread_output_tokens,
        t.cached_tokens as thread_cached_tokens,
        m.processing_time_ms, m.token_usage,
        c.name as channel_name
      FROM messages m
      JOIN threads t ON t.id = m.thread_id
      JOIN channels c ON c.id = t.channel_id
      WHERE ${whereClause}
      ORDER BY m.id DESC
      LIMIT $${paramIdx}
    `;
    params.push(limit);

    const rows = await queryDb(sql, params);

    // Parse messages with same format as messages.ts /events
    const messages = rows.map((row: any) => {
      let tokenUsage = null;
      if (row.token_usage && row.token_usage !== "null" && row.token_usage !== "") {
        try {
          const parsed = typeof row.token_usage === "string" ? JSON.parse(row.token_usage) : row.token_usage;
          const pt = parseInt(parsed.prompt_tokens) || 0;
          const ot = parseInt(parsed.completion_tokens) || 0;
          const ct = parseInt(parsed.cached_tokens) || 0;
          const rt = parseInt(parsed.reasoning_tokens) || 0;
          if (pt > 0 || ot > 0 || ct > 0 || rt > 0) {
            tokenUsage = {
              prompt_tokens: pt,
              completion_tokens: ot,
              cached_tokens: ct,
              reasoning_tokens: rt,
            };
          }
        } catch {
          // Ignore parse errors
        }
      }

      return {
        id: row.id,
        channel_id: row.channel_id,
        role: row.role,
        content: row.content,
        status: row.status,
        thread_id: row.thread_id,
        thread_sequence: row.thread_sequence,
        external_id: row.external_id,
        metadata: row.metadata,
        created_at: row.created_at,
        profile: row.profile,
        provider: row.provider,
        model: row.model,
        processing_time_ms: row.processing_time_ms ? parseInt(row.processing_time_ms) : null,
        token_usage: tokenUsage,
        channel_name: row.channel_name,
        type: row.msg_type || null,
        subtype: row.msg_subtype || null,
      };
    });

    res.json({ messages, total: messages.length });
  } catch (err) {
    console.error("[memory] GET /search-messages error:", err);
    res.status(500).json({ error: "Failed to search messages" });
  }
});

// ─── GET /text/:profile/:type ───────────────────────────────────────────────────
memoryRouter.get("/text/:profile/:type", async (req: Request, res: Response) => {
  try {
    const profile = req.params.profile as string;
    const type = req.params.type as string;

    if (type !== "memory" && type !== "soul") {
      res.status(400).json({ error: "Type must be 'memory' or 'soul'" });
      return;
    }

    const fileName = type === "soul" ? "USER.md" : "MEMORY.md";
    // Check profile-specific memories first, then fall back to global memories
    let filePath = join(OMNI_DATA_DIR, "profiles", profile, "memories", fileName);
    if (!existsSync(filePath)) {
      filePath = join(OMNI_DATA_DIR, "memories", fileName);
    }

    if (!existsSync(filePath)) {
      res.status(404).json({ error: `${type} file not found for profile '${profile}'` });
      return;
    }

    const content = readFileSync(filePath, "utf-8");
    res.json({ content });
  } catch (err) {
    console.error("[memory] GET /text/:profile/:type error:", err);
    res.status(500).json({ error: "Failed to read memory file" });
  }
});

// ─── POST /upload/:profile/:type ────────────────────────────────────────────────
memoryRouter.post("/upload/:profile/:type", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const profile = req.params.profile as string;
    const type = req.params.type as string;

    if (type !== "memory" && type !== "soul") {
      res.status(400).json({ error: "Type must be 'memory' or 'soul'" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const file = req.file;
    const ext = file.originalname.toLowerCase().split(".").pop();

    if (ext !== "md" && ext !== "txt") {
      // Clean up temp file
      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: "Only .md and .txt files are supported" });
      return;
    }

    // Read uploaded file content
    let content: string;
    try {
      content = readFileSync(file.path, "utf-8");
    } catch {
      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: "Failed to read uploaded file content" });
      return;
    }

    // Validate it's text (not binary) — check for null bytes
    if (content.includes("\0")) {
      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: "Uploaded file appears to be binary, not text" });
      return;
    }

    // Determine destination path
    const fileName = type === "soul" ? "USER.md" : "MEMORY.md";
    const destDir = join(OMNI_DATA_DIR, "profiles", profile, "memories");

    // Ensure directory exists
    const { mkdirSync } = await import("fs");
    mkdirSync(destDir, { recursive: true });

    const destPath = join(destDir, fileName);

    // Write the file
    writeFileSync(destPath, content, "utf-8");

    // Clean up temp file
    try {
      const { unlinkSync } = await import("fs");
      unlinkSync(file.path);
    } catch {
      /* ignore */
    }

    res.json({
      success: true,
      size: content.length,
    });
  } catch (err) {
    console.error("[memory] POST /upload/:profile/:type error:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ─── GET /context/:channelName ──────────────────────────────────────────────────
// Returns the real dynamic context blocks (recent messages, summaries, skills,
// retrieved content, wiki references, hindsight memories) via Rust's
// `/api/context/{channelName}` endpoint.
memoryRouter.get("/context/:channelName", async (req: Request, res: Response) => {
  try {
    const channelName = req.params.channelName as string;
    const response = await fetch(`http://omniagent:8080/api/context/${encodeURIComponent(channelName)}`);
    if (!response.ok) {
      res.status(response.status).json({ error: `OmniAgent returned ${response.status}` });
      return;
    }
    const data: any = await response.json();
    res.json({ context: data.context || "(empty context)" });
  } catch (err) {
    console.error("[memory] GET /context/:channelName error:", err);
    res
      .status(502)
      .json({ error: "Failed to fetch context: " + (err instanceof Error ? err.message : String(err)) });
  }
});
