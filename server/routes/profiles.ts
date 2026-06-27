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

/**
 * Map from display name (with `:`) to the raw config key (underscore).
 * e.g. "filesystem:read" → "filesystem_read" so the config stores the
 * actual MCP tool name that the backend's allowed() filter uses.
 */
const DISPLAY_TO_RAW: Record<string, string> = {
  // Filesystem
  "filesystem:read": "filesystem_read",
  "filesystem:write": "filesystem_write",
  "filesystem:list": "filesystem_list",
  "filesystem:search": "filesystem_search",
  "filesystem:info": "filesystem_info",
  // Web / Fetch
  "web:fetch": "fetch",
  // Search
  "agent:search_messages": "search_messages",
  "agent:search_wiki": "search_wiki",
  // Skills
  "tools:create_skill": "create_skill",
  // Memory
  "memory:promote_to_memory": "promote_to_memory",
  "memory:list_memories": "list_memories",
  "memory:review_memories": "review_memories",
  "memory:manage_memory": "manage_memory",
  // Cron
  "cron:create_cron_job": "create_cron_job",
  "cron:list_cron_jobs": "list_cron_jobs",
  "cron:delete_cron_job": "delete_cron_job",
  "cron:update_cron_job": "update_cron_job",
  // Kanban
  "kanban:create_kanban_task": "create_kanban_task",
  "kanban:list_kanban_tasks": "list_kanban_tasks",
  "kanban:update_kanban_task": "update_kanban_task",
  "kanban:delete_kanban_task": "delete_kanban_task",
  "kanban:add_kanban_dependency": "add_kanban_dependency",
  "kanban:remove_kanban_dependency": "remove_kanban_dependency",
  // Git
  "git:create_github_repo": "create_github_repo",
  "git:clone_repo": "clone_repo",
  "git:commit_and_push": "commit_and_push",
  "git:status": "status",
  // Docker
  "docker:compose": "docker_compose",
  // Query / Metrics / Plugin manager
  "data:query_database": "query_database",
  "system:get_metrics": "get_metrics",
  "system:plugin_manager": "plugin_manager",
  // Subtasks
  "subtasks:add_subtask": "add_subtask",
  "subtasks:list_subtasks": "list_subtasks",
  "subtasks:update_subtask": "update_subtask",
  "subtasks:delete_subtask": "delete_subtask",
  "subtasks:get_subtask_counts": "get_subtask_counts",
  // Hindsight
  "hindsight:recall": "hindsight_recall",
  "hindsight:retain": "hindsight_retain",
  "hindsight:reflect": "hindsight_reflect",
  // Built-in actions
  "actions:kanban_dispatcher": "kanban_dispatcher",
  "actions:relevance_indexer": "relevance_indexer",
  "actions:hindsight_populator": "hindsight_populator",
  "actions:setup_knowledge_pipeline": "setup_knowledge_pipeline",
};

/** Reverse map: raw name → display name */
const RAW_TO_DISPLAY: Record<string, string> = {};
for (const [display, raw] of Object.entries(DISPLAY_TO_RAW)) {
  RAW_TO_DISPLAY[raw] = display;
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

/** All known tools in display format (with server:name prefix) */
const ALL_TOOLS = Object.keys(DISPLAY_TO_RAW).sort();

/** Return raw tool names for matching against config values (used only internally). */
const ALL_TOOLS_RAW = Object.values(DISPLAY_TO_RAW).sort();

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
        allowed_tools: toDisplayNames(config.allowed_tools as any),
        skills: readProfileSkills(name),
        all_tools: ALL_TOOLS, // for multi-select display
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
