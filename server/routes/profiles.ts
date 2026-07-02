import { Router } from "express";
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";

const OMNI_DIR = process.env.OMNI_DIR;
if (!OMNI_DIR) {
  throw new Error("OMNI_DIR environment variable must be set");
}

export const profilesRouter = Router();

// ── Helpers ──

function getProfilesDir(): string {
  return join(OMNI_DIR!, "profiles");
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

/**
 * Map from display name to the raw config key.
 * Both display and raw are the tool's full_name from the MCP API
 * (e.g. "actions_hindsight-populator"), which already includes the
 * server name with underscore separator. No : prefix is needed.
 */
let DISPLAY_TO_RAW: Record<string, string> = {};
let RAW_TO_DISPLAY: Record<string, string> = {};
let toolMapLastFetch = 0;
const TOOL_MAP_TTL = 300_000; // 5 min cache

// Separate cache for tool details (incl. server_name), used by the frontend for toolset grouping
let TOOL_DETAILS_CACHE: Record<string, { name: string; server_name: string | null }> = {};

/** All known tools in display format, built from MCP tools API. */
async function getAllTools(): Promise<string[]> {
  await refreshToolMappings();
  return Object.keys(DISPLAY_TO_RAW).sort();
}

/** All tool details (name + server_name) for toolset grouping in the frontend. */
async function getAllToolDetails(): Promise<{ name: string; server_name: string | null }[]> {
  await refreshToolMappings();
  return Object.values(TOOL_DETAILS_CACHE).sort((a, b) => a.name.localeCompare(b.name));
}

/** Fetch MCP tools from omniagent and rebuild both display↔raw mappings and tool details. */
async function refreshToolMappings(): Promise<void> {
  const now = Date.now();
  if (now - toolMapLastFetch < TOOL_MAP_TTL && Object.keys(DISPLAY_TO_RAW).length > 0) return;
  try {
    const omniagentUrl = process.env.OMNIAGENT_URL || "http://omniagent:8080";
    const response = await fetch(`${omniagentUrl}/mcp/tools`);
    if (!response.ok) return;
    const data: any = await response.json();
    const toolsList: any[] = Array.isArray(data) ? data : data?.tools || data?.data || [];
    const newDisplayToRaw: Record<string, string> = {};
    const newToolDetails: Record<string, { name: string; server_name: string | null }> = {};
    for (const t of toolsList) {
      const rawName = t.name || t.tool || "";
      newDisplayToRaw[rawName] = rawName;
      newToolDetails[rawName] = {
        name: rawName,
        server_name: t.server_name || t.source || null,
      };
    }
    DISPLAY_TO_RAW = newDisplayToRaw;
    const newRawToDisplay: Record<string, string> = {};
    for (const [display, raw] of Object.entries(DISPLAY_TO_RAW)) {
      newRawToDisplay[raw] = display;
    }
    RAW_TO_DISPLAY = newRawToDisplay;
    TOOL_DETAILS_CACHE = newToolDetails;
    toolMapLastFetch = now;
  } catch {
    // keep existing mappings on error
  }
}

/** Normalize an array of tool names: convert display names to raw names for storage. */
function toRawNames(tools: string[]): string[] {
  return tools.map((t) => DISPLAY_TO_RAW[t] || t);
}

/** Normalize config stored names: convert raw names to display format for API response. */
function toDisplayNames(tools: string[] | null): string[] {
  if (!tools) return [];
  return tools.map((t) => RAW_TO_DISPLAY[t] || t);
}

// ── Routes ──

// GET /api/profiles
profilesRouter.get("/", async (_req, res) => {
  try {
    const names = listFsProfiles();
    const allTools = await getAllTools();
    const allToolDetails = await getAllToolDetails();
    const result = names.map((name) => {
      const config = readProfileConfig(name);
      return {
        name,
        provider: config.provider,
        model: config.model,
        allowed_tools: toDisplayNames(config.allowed_tools as any),
        skills: readProfileSkills(name),
        all_tools: allTools,
        all_tool_details: allToolDetails, // for toolset grouping in frontend
      };
    });
    res.json(result);
  } catch (err) {
    console.error("[profiles] GET error:", err);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
});

// POST /api/profiles — create a new profile
profilesRouter.post("/", async (req, res) => {
  try {
    const { name, provider, model } = req.body as any;

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
        allowed_tools: [],
        skills: [],
        all_tools: await getAllTools(),
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
    const { provider, model, allowed_tools } = req.body as any;

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
      // Convert display names to raw names for storage
      config.allowed_tools =
        Array.isArray(allowed_tools) && allowed_tools.length > 0 ? toRawNames(allowed_tools) : []; // reset to empty (no tools allowed)
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    res.json({ success: true });
  } catch (err) {
    console.error("[profiles] PATCH error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});
