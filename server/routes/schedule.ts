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

// ── GET /api/schedule — List all cron jobs ──
scheduleRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const jobs = await queryDb(
      `SELECT DISTINCT ON (name) id, name, schedule, prompt, skills, enabled,
              last_run_at, next_run_at, created_at, script, context_from,
              no_agent, enabled_toolsets, workdir, profile
       FROM cron_jobs
       ORDER BY name, created_at DESC`,
    );

    const mapped = jobs.map((job: any) => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule,
      prompt_preview: job.prompt
        ? job.prompt.length > 100
          ? job.prompt.slice(0, 100) + "..."
          : job.prompt
        : "",
      prompt: job.prompt,
      skills: parseJsonArray(job.skills),
      enabled: job.enabled,
      script: job.script || null,
      context_from: parseJsonArray(job.context_from),
      no_agent: !!job.no_agent,
      enabled_toolsets: parseJsonArray(job.enabled_toolsets),
      workdir: job.workdir || null,
      profile: job.profile || null,
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
      `SELECT id, name, schedule, prompt, skills, enabled,
              last_run_at, next_run_at, created_at, script, context_from,
              no_agent, enabled_toolsets, workdir, profile, deliver, repeat
       FROM cron_jobs
       WHERE id = $1`,
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
      schedule: job.schedule,
      prompt: job.prompt || "",
      prompt_preview: job.prompt
        ? job.prompt.length > 100
          ? job.prompt.slice(0, 100) + "..."
          : job.prompt
        : "",
      skills: parseJsonArray(job.skills),
      enabled: job.enabled,
      script: job.script || null,
      context_from: parseJsonArray(job.context_from),
      no_agent: !!job.no_agent,
      enabled_toolsets: parseJsonArray(job.enabled_toolsets),
      workdir: job.workdir || null,
      profile: job.profile || null,
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
