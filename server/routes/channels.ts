import { Router } from "express";
import { queryDb } from "../db.js";

export const channelsRouter = Router();

// GET /api/channels — list all channels with full details
channelsRouter.get("/", async (_req, res) => {
  try {
    const rows = await queryDb(
      `SELECT id, name, platform, resource_identifier, closed, current_profile, current_provider, current_model, readonly
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
    const { current_profile, current_provider, current_model, closed } = req.body;

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
      if (!canEdit) {
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
