import { Router } from "express";
import { queryDb } from "../db.js";

export const channelsRouter = Router();

// POST /api/channels/:channelId/stop — stop all pending/processing threads in a channel
channelsRouter.post("/:channelId/stop", async (req, res) => {
  try {
    const { channelId } = req.params;
    const omniagentUrl = `${
      process.env.OMNIAGENT_URL || "http://omniagent:8080"
    }/stop/${encodeURIComponent(channelId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(omniagentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.text().catch(() => "");
    res.status(response.status).json({ success: response.ok, data });
  } catch (err) {
    console.error("[channels] Stop proxy error:", err);
    res
      .status(502)
      .json({ error: "Failed to reach OmniAgent: " + (err instanceof Error ? err.message : String(err)) });
  }
});

// GET /api/channels — list all channels with full details
channelsRouter.get("/", async (_req, res) => {
  try {
    const rows = await queryDb(
      `SELECT id, name, platform, resource_identifier, closed, current_profile, current_provider, current_model, readonly, planning_mode, template
       FROM channels ORDER BY name`,
    );
    res.json(rows);
  } catch (err) {
    console.error("[channels] Error:", err);
    res.status(500).json({ error: "Failed to fetch channels" });
  }
});

// PATCH /api/channels/:id — update channel fields
channelsRouter.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, current_profile, current_provider, current_model, closed, planning_mode, template } =
      req.body;

    // Check if channel is readonly
    const existing = await queryDb(`SELECT readonly, closed FROM channels WHERE id = $1`, [id]);
    if (existing.length === 0) {
      res.status(404).json({ error: "Channel not found" });
      return;
    }
    const channel = existing[0];

    // Permanent channels cannot be renamed or deleted, but open/close,
    // profile, provider, and model can still be modified.
    // Only block editing if there are no actual updateable fields.
    if (channel.readonly) {
      const canEdit =
        closed !== undefined ||
        current_profile !== undefined ||
        current_provider !== undefined ||
        current_model !== undefined;
      if (!canEdit || name !== undefined) {
        res
          .status(403)
          .json({ error: "Permanent channels can only update status, profile, provider, and model" });
        return;
      }
    }

    // Build SET clause dynamically
    const sets: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) {
      sets.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (current_profile !== undefined) {
      sets.push(`current_profile = $${paramIdx++}`);
      params.push(current_profile);
    }
    if (current_provider !== undefined) {
      sets.push(`current_provider = $${paramIdx++}`);
      params.push(current_provider);
    }
    if (current_model !== undefined) {
      sets.push(`current_model = $${paramIdx++}`);
      params.push(current_model);
    }
    if (closed !== undefined) {
      sets.push(`closed = $${paramIdx++}`);
      params.push(closed);
    }
    if (planning_mode !== undefined) {
      sets.push(`planning_mode = $${paramIdx++}`);
      params.push(planning_mode);
    }
    if (template !== undefined) {
      sets.push(`template = $${paramIdx++}`);
      params.push(template);
    }

    if (sets.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    params.push(id);
    const sql = `UPDATE channels SET ${sets.join(", ")} WHERE id = $${paramIdx}`;
    await queryDb(sql, params);
    res.json({ success: true });
  } catch (err) {
    console.error("[channels] PATCH error:", err);
    res.status(500).json({ error: "Failed to update channel" });
  }
});
