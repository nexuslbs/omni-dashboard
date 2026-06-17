import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

export const messagesRouter = Router();

const quoteValue = (val: string): string => `'${val.replace(/'/g, "''")}'`;

messagesRouter.get("/filters", (req: Request, res: Response) => {
  void (async () => {
    try {
      const channels = await queryDb(`
        SELECT DISTINCT c.id, c.name, COUNT(m.id) as count
        FROM channels c
        JOIN messages m ON m.channel_id = c.id
        GROUP BY c.id, c.name
        ORDER BY c.name
      `);

      const roles = await queryDb(`
        SELECT DISTINCT role FROM messages WHERE role IS NOT NULL ORDER BY role
      `);

      const providers = await queryDb(`
        SELECT DISTINCT provider FROM messages WHERE provider IS NOT NULL ORDER BY provider
      `);

      const models = await queryDb(`
        SELECT DISTINCT model FROM messages WHERE model IS NOT NULL ORDER BY model
      `);

      const types = await queryDb(`
        SELECT DISTINCT msg_type FROM messages WHERE msg_type IS NOT NULL ORDER BY msg_type
      `);

      const subtypes = await queryDb(`
        SELECT DISTINCT msg_subtype FROM messages WHERE msg_subtype IS NOT NULL AND msg_subtype != '' ORDER BY msg_subtype
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

      if (channelId && channelId !== "all") {
        conds.push(`m.channel_id = ${quoteValue(channelId)}`);
      }
      if (threadId) {
        conds.push(`m.thread_id = ${quoteValue(threadId)}`);
      }
      if (role && role !== "all") {
        conds.push(`m.role = ${quoteValue(role)}`);
      }
      if (provider && provider !== "all") {
        conds.push(`m.provider = ${quoteValue(provider)}`);
      }
      if (model && model !== "all") {
        conds.push(`m.model = ${quoteValue(model)}`);
      }
      const whereClause = conds.length > 0 ? `WHERE ${conds.join(" AND \n      ")}` : "";

      const countRows = await queryDb(
        `SELECT COUNT(*) as total FROM messages m JOIN channels c ON c.id = m.channel_id ${whereClause}`,
      );
      const total = countRows.length > 0 ? Number(countRows[0].total) || 0 : 0;

      const rows = await queryDb(
        `SELECT m.*, c.name as channel_name FROM messages m JOIN channels c ON c.id = m.channel_id ${whereClause} ORDER BY m.id DESC LIMIT ${limit} OFFSET ${offset}`,
      );

      const messages = rows.map((row: any) => {
        let tokenUsage = null;
        if (row.token_usage) {
          try {
            tokenUsage = typeof row.token_usage === "string" ? JSON.parse(row.token_usage) : row.token_usage;
          } catch {
            tokenUsage = { prompt_tokens: 0, completion_tokens: 0 };
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
          processing_time_ms: row.processing_time_ms,
          token_usage: tokenUsage,
          channel_name: row.channel_name,
          type: row.msg_type || null,
          subtype: row.msg_subtype || null,
        };
      });

      res.json({ messages, total, offset, limit });
    } catch (err) {
      console.error("[messages] Error fetching events:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  })();
});
