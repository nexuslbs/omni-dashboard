import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

export const overviewRouter = Router();

// ── Existing overview (recent threads) ──
overviewRouter.get("/", (req: Request, res: Response) => {
  void (async () => {
    try {
      const sql = `
        SELECT
          t.id,
          t.channel_id,
          t.id as thread_id,
          LEFT(COALESCE(m.content, ''), 200) as content_preview,
          COALESCE(t.status, 'unknown') as status,
          t.duration_ms as processing_time_ms,
          (t.input_tokens + t.output_tokens) as total_tokens,
          COALESCE(t.created_at, NOW()) as created_at,
          COALESCE(c.name, 'unknown') as channel_name,
          t.model,
          (SELECT COUNT(*) FROM messages sub WHERE sub.thread_id = t.id) as thread_count
        FROM threads t
        JOIN messages m ON m.thread_id = t.id AND m.thread_sequence = 0
        LEFT JOIN channels c ON c.id = t.channel_id
        ORDER BY t.id DESC
        LIMIT 50
      `;
      const rows = await queryDb(sql);
      const result = rows.map((row: any) => ({
        id: row.id,
        channel_id: row.channel_id,
        thread_id: row.thread_id,
        content_preview: row.content_preview,
        status: row.status,
        processing_time_ms: row.processing_time_ms,
        prompt_tokens: 0,
        completion_tokens: row.total_tokens || 0,
        created_at: row.created_at,
        channel_name: row.channel_name,
        thread_count: row.thread_count || 0,
        model: row.model || null,
      }));

      res.json(result);
    } catch (err) {
      console.error("[overview] Error:", err);
      res.status(500).json({ error: "Failed to fetch overview data" });
    }
  })();
});

// ── Dashboard KPIs and charts ──
overviewRouter.get("/dashboard", (req: Request, res: Response) => {
  void (async () => {
    try {
      // Single multi-CTE query for all KPIs + time series
      const sql = `
        WITH today_start AS (
          SELECT date_trunc('day', NOW()) AS ts
        ),
        yesterday_start AS (
          SELECT date_trunc('day', NOW() - INTERVAL '1 day') AS ts
        ),
        -- KPIs
        kpi AS (
          SELECT
            (SELECT COUNT(*) FROM threads t, today_start ts WHERE t.created_at >= ts.ts) AS threads_today,
            (SELECT COALESCE(AVG(t.duration_ms)::bigint, 0) FROM threads t, today_start ts WHERE t.status = 'completed' AND t.ended_at >= ts.ts) AS avg_response_time,
            (SELECT COALESCE(SUM(t.input_tokens + t.output_tokens), 0) FROM threads t, today_start ts WHERE t.created_at >= ts.ts) AS tokens_today,
            (SELECT COUNT(DISTINCT t.channel_id) FROM threads t, yesterday_start ys WHERE t.created_at >= ys.ts) AS active_channels,
            -- Yesterday for comparison
            (SELECT COUNT(*) FROM threads t, yesterday_start ys, today_start ts WHERE t.created_at >= ys.ts AND t.created_at < ts.ts) AS threads_yesterday,
            (SELECT COALESCE(AVG(t.duration_ms)::bigint, 0) FROM threads t, yesterday_start ys, today_start ts WHERE t.status = 'completed' AND t.ended_at >= ys.ts AND t.ended_at < ts.ts) AS avg_response_yesterday,
            (SELECT COALESCE(SUM(t.input_tokens + t.output_tokens), 0) FROM threads t, yesterday_start ys, today_start ts WHERE t.created_at >= ys.ts AND t.created_at < ts.ts) AS tokens_yesterday
        ),
        -- 7-day hourly thread counts (last 168 hours)
        hourly AS (
          SELECT
            date_trunc('hour', g) AS bucket,
            COALESCE(COUNT(t.id), 0) AS count
          FROM generate_series(
            date_trunc('hour', NOW() - INTERVAL '7 days'),
            date_trunc('hour', NOW()),
            INTERVAL '1 hour'
          ) g
          LEFT JOIN threads t ON date_trunc('hour', t.created_at) = g
          GROUP BY bucket
          ORDER BY bucket
        ),
        -- Status distribution
        status_dist AS (
          SELECT COALESCE(t.status, 'unknown') AS status, COUNT(*) AS count
          FROM threads t
          GROUP BY t.status
          ORDER BY count DESC
        ),
        -- 14-day daily token trend
        token_trend AS (
          SELECT
            g::date AS day,
            COALESCE(SUM(t.input_tokens + t.output_tokens), 0) AS tokens
          FROM generate_series(
            (NOW() - INTERVAL '13 days')::date,
            NOW()::date,
            INTERVAL '1 day'
          ) g
          LEFT JOIN threads t ON t.created_at::date = g::date
          GROUP BY g::date
          ORDER BY g::date
        ),
        -- Recent activity (last 10 threads)
        recent AS (
          SELECT
            t.id,
            t.id AS thread_id,
            LEFT(COALESCE(m.content, ''), 200) AS content_preview,
            COALESCE(t.status, 'unknown') AS status,
            t.duration_ms AS processing_time_ms,
            (t.input_tokens + t.output_tokens) AS total_tokens,
            COALESCE(t.created_at, NOW()) AS created_at,
            COALESCE(c.name, 'unknown') AS channel_name,
            t.model,
            (SELECT COUNT(*) FROM messages sub WHERE sub.thread_id = t.id) AS thread_count
          FROM threads t
          JOIN messages m ON m.thread_id = t.id AND m.thread_sequence = 0
          LEFT JOIN channels c ON c.id = t.channel_id
          ORDER BY t.id DESC
          LIMIT 10
        ),
        -- Channel health
        channel_health AS (
          SELECT
            COALESCE(c.name, 'unknown') AS name,
            COUNT(*) FILTER (WHERE t.created_at >= date_trunc('day', NOW()) AND t.status != 'system') AS threads_today,
            COALESCE(AVG(t.duration_ms) FILTER (WHERE t.status = 'completed')::bigint, 0) AS avg_duration,
            CASE
              WHEN COUNT(*) FILTER (WHERE t.status != 'system') > 0
              THEN ROUND(COUNT(*) FILTER (WHERE t.status = 'completed')::numeric / GREATEST(COUNT(*) FILTER (WHERE t.status != 'system'), 1), 2)
              ELSE 0
            END AS success_rate,
            COALESCE(MAX(t.created_at)::text, '') AS last_activity
          FROM threads t
          LEFT JOIN channels c ON c.id = t.channel_id
          GROUP BY c.name
          ORDER BY threads_today DESC
        ),
        -- Top tools (from messages where msg_type = 'tool')
        top_tools AS (
          SELECT
            COALESCE(m.msg_subtype, 'unknown') AS tool,
            COUNT(*) AS count
          FROM messages m
          WHERE m.msg_type = 'tool'
            AND m.created_at >= NOW() - INTERVAL '7 days'
          GROUP BY m.msg_subtype
          ORDER BY count DESC
          LIMIT 10
        )
        SELECT
          (SELECT row_to_json(kpi.*) FROM kpi) AS kpis,
          (SELECT json_agg(hourly.* ORDER BY hourly.bucket) FROM hourly) AS threads_over_time,
          (SELECT json_agg(status_dist.*) FROM status_dist) AS status_distribution,
          (SELECT json_agg(token_trend.*) FROM token_trend) AS token_trend,
          (SELECT json_agg(recent.*) FROM recent) AS recent_activity,
          (SELECT json_agg(channel_health.*) FROM channel_health) AS channel_health,
          (SELECT json_agg(top_tools.*) FROM top_tools) AS top_tools
      `;

      const rows = await queryDb(sql);
      const row = rows[0];

      // Parse each JSON field
      const result: any = {};
      for (const key of [
        "kpis",
        "threads_over_time",
        "status_distribution",
        "token_trend",
        "recent_activity",
        "channel_health",
        "top_tools",
      ]) {
        if (row[key]) {
          // The rows come as arrays from rowMode: "array", so fields map via column order
          // kpis is a JSON object, others are JSON arrays
          result[key] = typeof row[key] === "string" ? JSON.parse(row[key]) : row[key];
        } else {
          result[key] = key === "kpis" ? {} : [];
        }
      }

      // Normalize KPIs (they come as json object)
      const kpis = result.kpis || {};
      result.kpis = {
        threads_today: Number(kpis.threads_today) || 0,
        avg_response_time: Number(kpis.avg_response_time) || 0,
        tokens_today: Number(kpis.tokens_today) || 0,
        active_channels: Number(kpis.active_channels) || 0,
        threads_yesterday: Number(kpis.threads_yesterday) || 0,
        avg_response_yesterday: Number(kpis.avg_response_yesterday) || 0,
        tokens_yesterday: Number(kpis.tokens_yesterday) || 0,
      };

      // Normalize recent_activity (same shape as existing overview rows)
      result.recent_activity = (result.recent_activity || []).map((r: any) => ({
        id: r.id,
        thread_id: r.thread_id,
        content_preview: r.content_preview,
        status: r.status,
        processing_time_ms: r.processing_time_ms,
        prompt_tokens: 0,
        completion_tokens: r.total_tokens || 0,
        created_at: r.created_at,
        channel_name: r.channel_name,
        thread_count: r.thread_count || 0,
        model: r.model || null,
      }));

      res.json(result);
    } catch (err) {
      console.error("[dashboard] Error:", err);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  })();
});
