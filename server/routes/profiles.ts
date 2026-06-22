import { Router } from "express";
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";

const OMNI_DATA_DIR = process.env.OMNI_DATA_DIR || "/opt/data";

export const profilesRouter = Router();

// ── Helpers ──

function getProfilesDir(): string {
  return join(OMNI_DATA_DIR, "profiles");
}

function getConfigPath(name: string): string {
  return join(getProfilesDir(), name, "config.json");
}

function getSkillsDir(name: string): string {
  return join(getProfilesDir(), name, "skills");
}

function listFsProfiles(): string[] {
  const dir = getProfilesDir();
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((f) => {
      try {
        return statSync(join(dir, f)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function readProfileSkills(name: string): string[] {
  const dir = getSkillsDir(name);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter(
      (f) => f.endsWith(".md") || f.endsWith(".yaml") || f.endsWith(".yml") || !f.includes("."),
    );
  } catch {
    return [];
  }
}

function readProfileConfig(name: string): {
  provider: string | null;
  model: string | null;
  allowed_tools: string[];
} {
  const configPath = getConfigPath(name);
  if (!existsSync(configPath)) {
    return { provider: null, model: null, allowed_tools: null as any };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const cfg = JSON.parse(raw);
    return {
      provider: cfg.provider ?? null,
      model: cfg.model ?? null,
      allowed_tools: Array.isArray(cfg.allowed_tools) ? cfg.allowed_tools : (null as any),
    };
  } catch {
    return { provider: null, model: null, allowed_tools: null as any };
  }
}

/** All known tools — must match Rust profile::ALL_KNOWN_TOOLS */
const ALL_TOOLS = [
  "filesystem:read",
  "filesystem:write",
  "filesystem:list",
  "filesystem:search",
  "filesystem:info",
  "web:fetch",
  "agent:search_messages",
  "agent:search_wiki",
  "agent:promote_to_memory",
  "agent:list_memories",
  "agent:review_memories",
  "agent:get_metrics",
  "agent:query_database",
  "git:create_repo",
  "git:clone",
  "git:commit_push",
  "git:status",
  "docker:compose",
];

// ── Routes ──

// GET /api/profiles
profilesRouter.get("/", (_req, res) => {
  try {
    const names = listFsProfiles();
    const result = names.map((name) => {
      const config = readProfileConfig(name);
      return {
        name,
        provider: config.provider,
        model: config.model,
        allowed_tools: config.allowed_tools,
        skills: readProfileSkills(name),
        all_tools: ALL_TOOLS, // for multi-select options
      };
    });
    res.json(result);
  } catch (err) {
    console.error("[profiles] GET error:", err);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
});

// POST /api/profiles — create a new profile
profilesRouter.post("/", (req, res) => {
  try {
    const { name, provider, model } = req.body;

    // Validate name
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Profile name is required" });
      return;
    }
    const trimmedName = name.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      res.status(400).json({
        error:
          "Profile name must only contain letters, numbers, hyphens, and underscores (no spaces or special characters)",
      });
      return;
    }

    // Provider + model validation
    if (provider && typeof provider === "string" && provider.trim()) {
      if (!model || typeof model !== "string" || !model.trim()) {
        res.status(400).json({ error: "Model is required when a provider is specified" });
        return;
      }
    }

    // Check if profile already exists
    const configDir = join(getProfilesDir(), trimmedName);
    if (existsSync(configDir)) {
      res.status(409).json({ error: `Profile '${trimmedName}' already exists` });
      return;
    }

    // Create directory and config.json
    mkdirSync(configDir, { recursive: true });
    const config = {
      provider: provider && typeof provider === "string" && provider.trim() ? provider.trim() : null,
      model: model && typeof model === "string" && model.trim() ? model.trim() : null,
      allowed_tools: [],
    };
    writeFileSync(getConfigPath(trimmedName), JSON.stringify(config, null, 2) + "\n");

    res.status(201).json({
      success: true,
      profile: {
        name: trimmedName,
        provider: config.provider,
        model: config.model,
        allowed_tools: config.allowed_tools,
        skills: [],
        all_tools: ALL_TOOLS,
      },
    });
  } catch (err) {
    console.error("[profiles] POST error:", err);
    res.status(500).json({ error: "Failed to create profile" });
  }
});

// PATCH /api/profiles/:name — update profile config.json fields
profilesRouter.patch("/:name", (req, res) => {
  try {
    const { name } = req.params;
    const { provider, model, allowed_tools } = req.body;

    // Ensure profile directory exists
    const configPath = getConfigPath(name);
    const configDir = join(getProfilesDir(), name);
    if (!existsSync(configDir)) {
      res.status(404).json({ error: `Profile '${name}' not found on filesystem` });
      return;
    }

    // Read existing config or start fresh
    let config: any = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        config = {};
      }
    }

    // Merge updates
    if (provider !== undefined) config.provider = provider || null;
    if (model !== undefined) config.model = model || null;
    if (allowed_tools !== undefined) {
      // If empty array or null, set to ALL_TOOLS (reset to defaults)
      config.allowed_tools =
        Array.isArray(allowed_tools) && allowed_tools.length > 0 ? allowed_tools : ALL_TOOLS;
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    res.json({ success: true });
  } catch (err) {
    console.error("[profiles] PATCH error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});
