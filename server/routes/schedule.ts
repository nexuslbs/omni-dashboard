import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

/** Parse a JSONB field from the DB into a proper array, handling both string and null cases. */
function parseJsonArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Central list of known direct-mode task types (keep in sync with omniagent/src/scheduler.rs)
const DIRECT_TASK_TYPES = [
  { value: "kanban_dispatcher", label: "Kanban Dispatcher" },
  { value: "relevance_indexer", label: "Relevance Indexer" },
];

export const scheduleRouter = Router();

// ── GET /api/schedule/direct-task-types — Return known direct task types ──
scheduleRouter.get("/direct-task-types", (_req: Request, res: Response) => {
  res.json(DIRECT_TASK_TYPES);
});

// ── GET /api/schedule/actions — Return available actions for schedule mode ──
scheduleRouter.get("/actions", async (_req: Request, res: Response) => {
  try {
    const rows = await queryDb(
      `SELECT id, name, tool_name, is_builtin FROM actions ORDER BY is_builtin DESC, name ASC`,
    );
    res.json(rows);
  } catch (e: any) {
    console.error("Schedule actions error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/schedule — List cron jobs (optionally filter by active) ──
scheduleRouter.get("/", async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active !== "false";
    let sql: string;
    let params: any[];

    if (activeOnly) {
      sql = `SELECT DISTINCT ON (cj.name) cj.id, cj.name, cj.display_name, cj.schedule, cj.prompt, cj.skills, cj.enabled, cj.active,
              cj.mode, cj.direct_task_type, cj.action_id, cj.channel_id, ch.name as channel_name, cj.profile,
              cj.last_run_at, cj.next_run_at, cj.created_at, cj.script, cj.no_agent, cj.workdir, cj.deliver, cj.repeat
       FROM cron_jobs cj
       LEFT JOIN channels ch ON ch.id = cj.channel_id
       WHERE cj.active = true
       ORDER BY cj.name, cj.created_at DESC`;
      params = [];
    } else {
      sql = `SELECT DISTINCT ON (cj.name) cj.id, cj.name, cj.display_name, cj.schedule, cj.prompt, cj.skills, cj.enabled, cj.active,
              cj.mode, cj.direct_task_type, cj.action_id, cj.channel_id, ch.name as channel_name, cj.profile,
              cj.last_run_at, cj.next_run_at, cj.created_at, cj.script, cj.no_agent, cj.workdir, cj.deliver, cj.repeat
       FROM cron_jobs cj
       LEFT JOIN channels ch ON ch.id = cj.channel_id
       ORDER BY cj.name, cj.created_at DESC`;
      params = [];
    }

    const jobs = await queryDb(sql, params);

    const mapped = jobs.map((job: any) => ({
      id: job.id,
      name: job.name,
      display_name: job.display_name,
      schedule: job.schedule,
      prompt_preview: job.prompt
        ? job.prompt.length > 100
          ? job.prompt.slice(0, 100) + "..."
          : job.prompt
        : "",
      prompt: job.prompt,
      skills: parseJsonArray(job.skills),
      enabled: job.enabled,
      active: job.active,
      mode: job.mode,
      direct_task_type: job.direct_task_type,
      action_id: job.action_id || null,
      channel_id: job.channel_id,
      channel_name: job.channel_name || null,
      profile: job.profile,
      script: job.script || null,
      no_agent: !!job.no_agent,
      workdir: job.workdir || null,
      deliver: job.deliver || null,
      repeat: job.repeat || null,
      last_run: job.last_run_at,
      next_run: job.next_run_at,
      last_run_at: job.last_run_at,
      next_run_at: job.next_run_at,
      created_at: job.created_at,
      status: job.enabled ? "active" : "paused",
    }));

    res.json(mapped);
  } catch (e: any) {
    console.error("Schedule list error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/schedule/:id — Cron job detail ──
scheduleRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;
    if (!jobId) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }

    const jobs = await queryDb(
      `SELECT cj.id, cj.name, cj.display_name, cj.schedule, cj.prompt, cj.skills, cj.enabled, cj.active,
              cj.mode, cj.direct_task_type, cj.action_id, cj.channel_id, ch.name as channel_name, cj.profile,
              cj.last_run_at, cj.next_run_at, cj.created_at, cj.script, cj.no_agent, cj.workdir, cj.deliver, cj.repeat
       FROM cron_jobs cj
       LEFT JOIN channels ch ON ch.id = cj.channel_id
       WHERE cj.id = $1`,
      [jobId],
    );

    if (jobs.length === 0) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const job = jobs[0];
    res.json({
      id: job.id,
      name: job.name,
      display_name: job.display_name,
      schedule: job.schedule,
      prompt: job.prompt || "",
      prompt_preview: job.prompt
        ? job.prompt.length > 100
          ? job.prompt.slice(0, 100) + "..."
          : job.prompt
        : "",
      skills: parseJsonArray(job.skills),
      enabled: job.enabled,
      active: job.active,
      mode: job.mode,
      direct_task_type: job.direct_task_type,
      action_id: job.action_id || null,
      channel_id: job.channel_id,
      channel_name: job.channel_name || null,
      profile: job.profile,
      script: job.script || null,
      no_agent: !!job.no_agent,
      workdir: job.workdir || null,
      deliver: job.deliver || null,
      repeat: job.repeat || null,
      last_run: job.last_run_at,
      next_run: job.next_run_at,
      last_run_at: job.last_run_at,
      next_run_at: job.next_run_at,
      created_at: job.created_at,
      status: job.enabled ? "active" : "paused",
    });
  } catch (e: any) {
    console.error("Schedule detail error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── POST /api/schedule — Create a new cron job ──
scheduleRouter.post("/", async (req: Request, res: Response) => {
  try {
    const {
      name,
      display_name,
      schedule,
      prompt,
      active,
      channel_id,
      profile,
      mode,
      direct_task_type,
      action_id,
      enabled,
    } = req.body;

    if (!name || !schedule) {
      res.status(400).json({ error: "Name and schedule are required" });
      return;
    }

    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const displayName = display_name || name;

    await queryDb(
      `INSERT INTO cron_jobs (id, name, display_name, schedule, prompt, active, channel_id, profile, mode, direct_task_type, action_id, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         display_name = EXCLUDED.display_name,
         schedule = EXCLUDED.schedule,
         prompt = EXCLUDED.prompt,
         active = EXCLUDED.active,
         channel_id = EXCLUDED.channel_id,
         profile = EXCLUDED.profile,
         mode = EXCLUDED.mode,
         direct_task_type = EXCLUDED.direct_task_type,
         action_id = EXCLUDED.action_id,
         enabled = EXCLUDED.enabled,
         updated_at = NOW()`,
      [
        id,
        name,
        displayName,
        schedule,
        prompt || "",
        active !== false, // default true
        channel_id || null,
        profile || null,
        mode || "agentic",
        direct_task_type || null,
        action_id || null,
        enabled !== false, // default true
      ],
    );

    res.json({ success: true, id });
  } catch (e: any) {
    console.error("Schedule create error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/schedule/:id — Update a cron job ──
scheduleRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      display_name,
      schedule,
      prompt,
      active,
      enabled,
      channel_id,
      profile,
      mode,
      direct_task_type,
      action_id,
    } = req.body;

    // Check job exists
    const existing = await queryDb(`SELECT id FROM cron_jobs WHERE id = $1`, [id]);
    if (existing.length === 0) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Build SET clause dynamically
    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (display_name !== undefined) {
      sets.push(`display_name = $${paramIdx++}`);
      params.push(display_name);
    }
    if (schedule !== undefined) {
      sets.push(`schedule = $${paramIdx++}`);
      params.push(schedule);
    }
    if (prompt !== undefined) {
      sets.push(`prompt = $${paramIdx++}`);
      params.push(prompt);
    }
    if (active !== undefined) {
      sets.push(`active = $${paramIdx++}`);
      params.push(active);
    }
    if (enabled !== undefined) {
      sets.push(`enabled = $${paramIdx++}`);
      params.push(enabled);
    }
    if (channel_id !== undefined) {
      sets.push(`channel_id = $${paramIdx++}`);
      params.push(channel_id);
    }
    if (profile !== undefined) {
      sets.push(`profile = $${paramIdx++}`);
      params.push(profile);
    }
    if (mode !== undefined) {
      sets.push(`mode = $${paramIdx++}`);
      params.push(mode);
    }
    if (direct_task_type !== undefined) {
      sets.push(`direct_task_type = $${paramIdx++}`);
      params.push(direct_task_type);
    }
    if (action_id !== undefined) {
      sets.push(`action_id = $${paramIdx++}`);
      params.push(action_id);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    params.push(id);
    const sql = `UPDATE cron_jobs SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${paramIdx}`;
    await queryDb(sql, params);
    res.json({ success: true });
  } catch (e: any) {
    console.error("Schedule PATCH error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/schedule/:id/toggle — Toggle active state ──
scheduleRouter.patch("/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    if (active === undefined) {
      res.status(400).json({ error: "Missing 'active' field" });
      return;
    }

    await queryDb(`UPDATE cron_jobs SET active = $1, updated_at = NOW() WHERE id = $2`, [active, id]);
    res.json({ success: true, active });
  } catch (e: any) {
    console.error("Schedule toggle error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/schedule/:id/threads — Last message of each thread for a schedule task ──
scheduleRouter.get("/:id/threads", async (req: Request, res: Response) => {
  try {
    const scheduleTaskId = req.params.id;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    // Total count
    const countResult = await queryDb(
      `SELECT COUNT(*) AS total FROM threads WHERE schedule_task_id = $1`,
      [scheduleTaskId],
    );
    const total = parseInt(countResult[0]?.total) || 0;

    // Paginated rows — last message per thread with all message fields
    const rows = await queryDb(
      `SELECT last_msg.*, t.status AS thread_status
       FROM LATERAL (
         SELECT m.id, m.thread_id, m.role, m.content, m.msg_type AS type,
                m.msg_subtype AS subtype, m.provider, m.model,
                m.processing_time_ms, m.token_usage,
                m.created_at, m.metadata
         FROM messages m
         WHERE m.thread_id = t.id
         ORDER BY m.id DESC
         LIMIT 1
       ) last_msg
       RIGHT JOIN threads t ON t.id = last_msg.thread_id
       WHERE t.schedule_task_id = $1
       ORDER BY last_msg.created_at DESC NULLS LAST
       OFFSET $2
       LIMIT $3`,
      [scheduleTaskId, offset, limit],
    );

    res.json({ rows, total });
  } catch (e: any) {
    console.error("Schedule threads error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
