import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

export const overviewRouter = Router();

overviewRouter.get("/", (req: Request, res: Response) => {
  void (async () => {
    try {
      const sql = `
        SELECT m.id, m.channel_id, m.thread_id,
          LEFT(COALESCE(m.content, ''), 200) as content_preview,
          COALESCE(m.status, 'unknown') as status,
          m.processing_time_ms, m.token_usage::text,
          COALESCE(m.created_at, NOW()) as created_at,
          COALESCE(c.name, 'unknown') as channel_name,
          (SELECT COUNT(*) FROM messages sub WHERE sub.thread_id = m.thread_id) as thread_count
        FROM messages m
        LEFT JOIN channels c ON c.id = m.channel_id
        WHERE m.thread_sequence = 0
        ORDER BY m.id DESC
        LIMIT 50
      `;
      const rows = await queryDb(sql);
      const limited = rows.slice(0, 50);
      const result = limited.map((row: any) => {
        let promptTokens = 0;
        let completionTokens = 0;

        if (row.token_usage) {
          try {
            const parsed =
              typeof row.token_usage === "string" ? JSON.parse(row.token_usage) : row.token_usage;
            promptTokens = parsed.prompt_tokens ?? 0;
            completionTokens = parsed.completion_tokens ?? 0;
          } catch {
            // Invalid JSON, leave as 0
          }
        }

        return {
          id: row.id,
          channel_id: row.channel_id,
          thread_id: row.thread_id,
          content_preview: row.content_preview,
          status: row.status,
          processing_time_ms: row.processing_time_ms,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          created_at: row.created_at,
          channel_name: row.channel_name,
          thread_count: row.thread_count || 0,
        };
      });

      res.json(result);
    } catch (err) {
      console.error("[overview] Error:", err);
      res.status(500).json({ error: "Failed to fetch overview data" });
    }
  })();
});
