import { Router } from "express";
import fs from "fs";

export const profilesRouter = Router();

// GET /api/profiles — list available profiles
profilesRouter.get("/", async (_req, res) => {
  try {
    const profiles: string[] = ["default"];
    const dataDir = process.env.OMNI_DATA_DIR || "/opt/data";
    try {
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        const match = file.match(/^\.env\.profile\.(.+)$/);
        if (match) {
          profiles.push(match[1]);
        }
      }
    } catch {
      // data dir not accessible, just return default
    }
    res.json(profiles);
  } catch (err) {
    console.error("[profiles] Error:", err);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
});
