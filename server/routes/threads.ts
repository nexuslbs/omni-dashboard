import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

export const threadsRouter = Router();

threadsRouter.get("/", (req: Request, res: Response) => {
  void (async () => {
    try {
      const limit = Math.min(Math.abs(parseInt(req.query.limit as string) || 50), 200);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const status = req.query.status as string;
      const cause = req.query.cause as string;

      let where = "WHERE 1=1";
      const params: any[] = [];
      let paramIdx = 1;

      if (status) {
        where += ` AND t.status = $${paramIdx++}`;
        params.push(status);
      }
      if (cause) {
        where += ` AND t.cause = $${paramIdx++}`;
        params.push(cause);
      }

      const countSql = `
        SELECT COUNT(*) as total
        FROM threads t
        ${where}
      `;

      const dataSql = `
        SELECT
          t.id,
          t.status,
          t.cause,
          t.channel_id,
          t.profile,
          t.provider,
          t.model,
          t.input_tokens,
          t.cached_tokens,
          t.output_tokens,
          t.duration_ms,
          COALESCE(t.created_at, NOW()) as created_at,
          t.started_at,
          t.ended_at,
          COALESCE(c.name, 'unknown') as channel_name,
          (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) as msg_count,
          LEFT(COALESCE(m_cause.content, ''), 200) as cause_content_preview
        FROM threads t
        LEFT JOIN channels c ON c.id = t.channel_id
        LEFT JOIN messages m_cause ON m_cause.thread_id = t.id AND m_cause.thread_sequence = 0
        ${where}
        ORDER BY t.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `;
      params.push(limit, offset);

      const [countRows] = await queryDb(countSql, params.slice(0, params.length - 2));
      const total = parseInt(countRows?.total || "0");

      const rows = await queryDb(dataSql, params);

      const result = rows.map((row: any) => ({
        id: row.id,
        status: row.status,
        cause: row.cause,
        channel_id: row.channel_id,
        profile: row.profile,
        provider: row.provider,
        model: row.model,
        input_tokens: row.input_tokens || 0,
        cached_tokens: row.cached_tokens || 0,
        output_tokens: row.output_tokens || 0,
        duration_ms: row.duration_ms,
        created_at: row.created_at,
        started_at: row.started_at,
        ended_at: row.ended_at,
        channel_name: row.channel_name,
        msg_count: row.msg_count || 0,
        cause_content_preview: row.cause_content_preview,
      }));

      res.json({ threads: result, total, offset, limit });
    } catch (err) {
      console.error("[threads] Error:", err);
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  })();
});

threadsRouter.get("/filters", (_req: Request, res: Response) => {
  void (async () => {
    try {
      const [statusRows, causeRows] = await Promise.all([
        queryDb("SELECT DISTINCT status FROM threads ORDER BY status"),
        queryDb("SELECT DISTINCT cause FROM threads ORDER BY cause"),
      ]);
      res.json({
        statuses: statusRows.map((r: any) => r.status),
        causes: causeRows.map((r: any) => r.cause),
      });
    } catch (err) {
      console.error("[threads/filters] Error:", err);
      res.status(500).json({ error: "Failed to fetch thread filters" });
    }
  })();
});
