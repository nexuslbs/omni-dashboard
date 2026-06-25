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

export const scheduleRouter = Router();

// ── GET /api/schedule/actions — Return available actions for schedule mode.
// Proxies through omniagent backend which reads from YAML.
scheduleRouter.get("/actions", async (_req: Request, res: Response) => {
  try {
    const omniagentUrl = process.env.OMNIAGENT_URL || "http://omniagent:8080";
    const response = await fetch(`${omniagentUrl}/actions`);
    if (!response.ok) {
      res.status(response.status).json({ error: `Omniagent error: ${await response.text()}` });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    console.error("Schedule actions proxy error:", e?.message || e);
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
              cj.mode, cj.action_id, cj.channel_id, ch.name as channel_name, cj.profile,
              cj.last_run_at, cj.next_run_at, cj.created_at, cj.silent,
              cj.instruction_file, cj.planning_mode
       FROM cron_jobs cj
       LEFT JOIN channels ch ON ch.id = cj.channel_id
       WHERE cj.active = true
       ORDER BY cj.name, cj.created_at DESC`;
      params = [];
    } else {
      sql = `SELECT DISTINCT ON (cj.name) cj.id, cj.name, cj.display_name, cj.schedule, cj.prompt, cj.skills, cj.enabled, cj.active,
              cj.mode, cj.action_id, cj.channel_id, ch.name as channel_name, cj.profile,
              cj.last_run_at, cj.next_run_at, cj.created_at, cj.silent,
              cj.instruction_file, cj.planning_mode
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
      action_id: job.action_id || null,
      action_name: job.action_name || null,
      channel_id: job.channel_id,
      channel_name: job.channel_name || null,
      profile: job.profile,
      last_run: job.last_run_at,
      next_run: job.next_run_at,
      last_run_at: job.last_run_at,
      next_run_at: job.next_run_at,
      created_at: job.created_at,
      status: job.enabled ? "active" : "paused",
      silent: !!job.silent,
      instruction_file: job.instruction_file || null,
      planning_mode: job.planning_mode || "",
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
              cj.mode, cj.action_id, cj.channel_id, ch.name as channel_name, cj.profile,
              cj.last_run_at, cj.next_run_at, cj.created_at, cj.silent,
              cj.instruction_file, cj.planning_mode
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
      action_id: job.action_id || null,
      action_name: job.action_name || null,
      channel_id: job.channel_id,
      channel_name: job.channel_name || null,
      profile: job.profile,
      last_run: job.last_run_at,
      next_run: job.next_run_at,
      last_run_at: job.last_run_at,
      next_run_at: job.next_run_at,
      created_at: job.created_at,
      status: job.enabled ? "active" : "paused",
      silent: !!job.silent,
      instruction_file: job.instruction_file || null,
      planning_mode: job.planning_mode || "",
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
      action_id,
      enabled,
      silent,
      instruction_file,
      planning_mode,
    } = req.body;

    if (!name || !schedule) {
      res.status(400).json({ error: "Name and schedule are required" });
      return;
    }

    // Validate 5-field cron format
    const cronFields = schedule.trim().split(/\s+/);
    if (cronFields.length !== 5) {
      res.status(400).json({
        error: `Invalid cron expression: expected 5 fields (min hour dom month dow), got ${cronFields.length}. Use 5-field Linux format, e.g. '0 9 * * 1-5' for weekdays at 9am.`,
      });
      return;
    }

    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const displayName = display_name || name;

    await queryDb(
      `INSERT INTO cron_jobs (id, name, display_name, schedule, prompt, active, channel_id, profile, mode, action_id, enabled, silent, instruction_file, planning_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         display_name = EXCLUDED.display_name,
         schedule = EXCLUDED.schedule,
         prompt = EXCLUDED.prompt,
         active = EXCLUDED.active,
         channel_id = EXCLUDED.channel_id,
         profile = EXCLUDED.profile,
         mode = EXCLUDED.mode,
         action_id = EXCLUDED.action_id,
         enabled = EXCLUDED.enabled,
         silent = EXCLUDED.silent,
         instruction_file = EXCLUDED.instruction_file,
         planning_mode = EXCLUDED.planning_mode,
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
        action_id || null,
        enabled !== false, // default true
        silent === true, // default false
        instruction_file || null,
        planning_mode || "",
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
      action_id,
      silent,
      instruction_file,
      planning_mode,
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
      // Validate 5-field cron format
      const cronFields = schedule.trim().split(/\s+/);
      if (cronFields.length !== 5) {
        res.status(400).json({
          error: `Invalid cron expression: expected 5 fields (min hour dom month dow), got ${cronFields.length}. Use 5-field Linux format, e.g. '0 9 * * 1-5' for weekdays at 9am.`,
        });
        return;
      }
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
    if (action_id !== undefined) {
      sets.push(`action_id = $${paramIdx++}`);
      params.push(action_id);
    }
    if (silent !== undefined) {
      sets.push(`silent = $${paramIdx++}`);
      params.push(silent);
    }
    if (instruction_file !== undefined) {
      sets.push(`instruction_file = $${paramIdx++}`);
      params.push(instruction_file);
    }
    if (planning_mode !== undefined) {
      sets.push(`planning_mode = $${paramIdx++}`);
      params.push(planning_mode);
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
    const countResult = await queryDb(`SELECT COUNT(*) AS total FROM threads WHERE schedule_task_id = $1`, [
      scheduleTaskId,
    ]);
    const total = parseInt(countResult[0]?.total) || 0;

    // Paginated rows — last message per thread with all message fields
    const rows = await queryDb(
      `SELECT last_msg.*, t.status AS thread_status
       FROM threads t
       LEFT JOIN LATERAL (
         SELECT m.id, m.thread_id, m.role, m.content, m.msg_type AS type,
                m.msg_subtype AS subtype, m.provider, m.model,
                m.processing_time_ms, m.token_usage,
                m.created_at, m.metadata
         FROM messages m
         WHERE m.thread_id = t.id
         ORDER BY m.id DESC
         LIMIT 1
       ) last_msg ON true
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

// ── GET /api/schedule/:id/subtasks — Subtasks for all threads of a schedule job ──
scheduleRouter.get("/:id/subtasks", async (req: Request, res: Response) => {
  try {
    const scheduleTaskId = req.params.id;
    const rows = await queryDb(
      `SELECT ts.id, ts.description, ts.status, ts.priority, ts.thread_id,
              COALESCE(NULLIF(t.cause, ''), t.id::text) AS thread_title,
              ts.created_at, ts.updated_at
       FROM thread_subtasks ts
       JOIN threads t ON t.id = ts.thread_id
       WHERE t.schedule_task_id = $1
       ORDER BY t.id, ts.priority DESC, ts.id ASC`,
      [scheduleTaskId],
    );
    res.json({ subtasks: rows });
  } catch (e: any) {
    console.error("Schedule subtasks error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── POST /api/schedule/:id/run — Manually trigger a cron job via omniagent backend ──
scheduleRouter.post("/:id/run", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { force } = req.body;

    // Proxy to the omniagent backend's run-cron endpoint,
    // which uses the same scheduler logic as the scheduled tick.
    const omniagentUrl = process.env.OMNIAGENT_URL || "http://omniagent:8080";
    const jobId = String(id);
    const url = `${omniagentUrl}/run-cron/${jobId}${force ? "?force=true" : ""}`;
    const response = await fetch(url, { method: "POST" });

    if (!response.ok) {
      const errData = await response.text();
      res.status(response.status).json({ error: `Run cron failed: ${errData}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (e: any) {
    console.error("Schedule run error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
