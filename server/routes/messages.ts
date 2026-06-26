import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

export const messagesRouter = Router();

const quoteValue = (val: string): string => `'${val.replace(/'/g, "''")}'`;

messagesRouter.get("/filters", (_req: Request, res: Response) => {
  void (async () => {
    try {
      const channels = await queryDb(`
        SELECT DISTINCT c.id, c.name, COUNT(t.id) as count
        FROM channels c
        JOIN threads t ON t.channel_id = c.id
        GROUP BY c.id, c.name
        ORDER BY c.name
      `);

      const roles = await queryDb(`
        SELECT DISTINCT role FROM messages WHERE role IS NOT NULL ORDER BY role
      `);

      const types = await queryDb(`
        SELECT DISTINCT msg_type FROM messages WHERE msg_type IS NOT NULL ORDER BY msg_type
      `);

      const subtypes = await queryDb(`
        SELECT DISTINCT msg_subtype FROM messages WHERE msg_subtype IS NOT NULL AND msg_subtype != '' ORDER BY msg_subtype
      `);

      const providers = await queryDb(`
        SELECT DISTINCT provider FROM threads WHERE provider IS NOT NULL ORDER BY provider
      `);

      const models = await queryDb(`
        SELECT DISTINCT model FROM threads WHERE model IS NOT NULL ORDER BY model
      `);

      res.json({
        channels: channels.map((r: any) => ({
          id: r.id,
          name: r.name,
          count: r.count || 0,
        })),
        roles: roles.map((r: any) => r.role),
        providers: providers.map((r: any) => r.provider),
        models: models.map((r: any) => r.model),
        types: types.map((r: any) => r.msg_type),
        subtypes: subtypes.map((r: any) => r.msg_subtype),
      });
    } catch (err) {
      console.error("[messages] Error fetching filters:", err);
      res.status(500).json({ error: "Failed to fetch filters" });
    }
  })();
});

messagesRouter.get("/events", (req: Request, res: Response) => {
  void (async () => {
    try {
      const channelId = req.query.channel_id as string | undefined;
      const threadId = req.query.thread_id as string | undefined;
      const role = req.query.role as string | undefined;
      const provider = req.query.provider as string | undefined;
      const model = req.query.model as string | undefined;
      const typeParam = req.query.type;
      const subtypeParam = (req.query.subtype as string) || "";
      const seq0 = req.query.seq0 as string | undefined;
      const order = (req.query.order as string) === "asc" ? "ASC" : "DESC";
      const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 500);
      const offset = parseInt((req.query.offset as string) || "0", 10);

      const conds: string[] = [];

      // Type filter — query m.msg_type directly from messages table
      const selectedTypes: string[] = Array.isArray(typeParam)
        ? (typeParam as string[])
        : typeParam && typeParam !== "all"
          ? [typeParam as string]
          : [];
      if (selectedTypes.length > 0) {
        const quoted = selectedTypes.map((t) => quoteValue(t));
        conds.push(`m.msg_type IN (${quoted.join(",")})`);
      }

      // Subtype filter — LIKE on m.msg_subtype
      if (subtypeParam && subtypeParam.trim() !== "") {
        conds.push(`m.msg_subtype LIKE '%${subtypeParam.replace(/'/g, "''")}%'`);
      }

      // Channel filter via threads join
      if (channelId && channelId !== "all") {
        conds.push(`t.channel_id = ${quoteValue(channelId)}`);
      }
      if (threadId) {
        conds.push(`m.thread_id = ${quoteValue(threadId)}`);
      }
      if (role && role !== "all") {
        conds.push(`m.role = ${quoteValue(role)}`);
      }
      if (provider && provider !== "all") {
        conds.push(`t.provider = ${quoteValue(provider)}`);
      }
      if (model && model !== "all") {
        conds.push(`t.model = ${quoteValue(model)}`);
      }
      if (seq0 === "true") {
        conds.push("m.thread_sequence = 0");
      }
      const whereClause = conds.length > 0 ? `WHERE ${conds.join(" AND \n      ")}` : "";

      const countSql = `
        SELECT COUNT(*) as total
        FROM messages m
        JOIN threads t ON t.id = m.thread_id
        JOIN channels c ON c.id = t.channel_id
        ${whereClause}
      `;
      const countRows = await queryDb(countSql);
      const total = countRows.length > 0 ? Number(countRows[0].total) || 0 : 0;

      const dataSql = `
        SELECT
          m.id,
          m.thread_id,
          m.role,
          m.content,
          m.thread_sequence,
          m.external_id,
          m.metadata,
          m.created_at,
          m.msg_type,
          m.msg_subtype,
          m.iteration_number,
          t.channel_id,
          t.status,
          t.profile,
          t.provider,
          t.model,
          t.duration_ms as thread_duration_ms,
          t.input_tokens as thread_input_tokens,
          t.output_tokens as thread_output_tokens,
          t.cached_tokens as thread_cached_tokens,
          m.processing_time_ms as processing_time_ms,
          m.token_usage as token_usage,
          c.name as channel_name
        FROM messages m
        JOIN threads t ON t.id = m.thread_id
        JOIN channels c ON c.id = t.channel_id
        ${whereClause}
        ORDER BY m.id ${order}
        LIMIT ${limit} OFFSET ${offset}
      `;
      const rows = await queryDb(dataSql);

      const messages = rows.map((row: any) => {
        let tokenUsage = null;
        // Parse per-message token_usage (JSONB) — different schema than thread-level fields
        if (row.token_usage && row.token_usage !== "null" && row.token_usage !== "") {
          try {
            const parsed =
              typeof row.token_usage === "string" ? JSON.parse(row.token_usage) : row.token_usage;
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
        // No thread-level fallback — only per-message token_usage is shown.
        // Messages without their own token_usage (tool, tool-result, etc.) show null.

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
          iteration_number: row.iteration_number != null ? parseInt(row.iteration_number) : 0,
        };
      });

      res.json({ messages, total, offset, limit });
    } catch (err) {
      console.error("[messages] Error fetching events:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  })();
});
