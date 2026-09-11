import { Router } from "express";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

const OMNI_DIR = process.env.OMNI_DIR;
if (!OMNI_DIR) {
  throw new Error("OMNI_DIR environment variable must be set");
}

const OMNIAGENT = process.env.OMNIAGENT_URL || "http://omniagent:8080";

export const profilesRouter = Router();

// ── Helpers ──

function getProfilesDir(): string {
  return join(OMNI_DIR!, "profiles");
}

function getSkillsDir(name: string): string {
  return join(getProfilesDir(), name, "skills");
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
    const response = await fetch(`${OMNIAGENT}/mcp/tools`);
    if (!response.ok) return;
    const data = (await response.json()) as
      | { tools?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>;
    const toolsList: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : data?.tools || data?.data || [];
    const newDisplayToRaw: Record<string, string> = {};
    const newToolDetails: Record<string, { name: string; server_name: string | null }> = {};
    for (const t of toolsList) {
      const tAny = t as Record<string, string>;
      const rawName = tAny.name || tAny.tool || tAny.full_name || "";
      // Use full_name for display (prefixes builtin tools like "builtin_list-memories")
      const displayName = tAny.full_name || rawName;
      newDisplayToRaw[displayName] = rawName;
      newToolDetails[rawName] = {
        name: displayName,
        server_name: tAny.server_name || tAny.source || null,
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

/**
 * Profile definitions are DECLARED in `{OMNI_DIR}/config/profiles.yml`.
 * the single source of truth (omniagent owns read/write/validation). This
 * router delegates every storage operation to the omniagent /profiles API
 * (which mirrors the channels.yml pattern) and keeps only the dashboard
 * enrichment: MCP tool display↔raw mapping, tool lists and filesystem
 * skills (profile FILES live in profiles/<name>/, the declaration in yml).
 */

interface OmniProfile {
  name: string;
  provider?: string | null;
  model?: string | null;
  plan?: boolean | null;
  template?: string | null;
  allowed_tools?: string[] | null;
  skills?: string[];
}

/** GET {OMNIAGENT}/profiles → declared profiles (bare array). */
async function omniProfiles(): Promise<OmniProfile[]> {
  const res = await fetch(`${OMNIAGENT}/profiles`);
  if (!res.ok) throw new Error(`omniagent /profiles returned ${res.status}`);
  const data = (await res.json()) as OmniProfile[] | { data?: OmniProfile[] };
  const list = Array.isArray(data) ? data : data?.data || [];
  return list;
}

// ── Routes ──

// GET /api/profiles: YAML-declared profiles (incl. YAML-only profiles with
// no directory), enriched with the tool map + filesystem skills.
profilesRouter.get("/", async (_req, res) => {
  try {
    const profiles = await omniProfiles();
    const allTools = await getAllTools();
    const allToolDetails = await getAllToolDetails();
    const result = profiles.map((p) => ({
      name: p.name,
      provider: p.provider ?? null,
      model: p.model ?? null,
      // `null` (allowed_tools undefined in profiles.yml) = NO allow-list
      // restriction (all tools); `[]` = explicit empty list (no tools).
      // The two states must stay distinguishable for the UI.
      allowed_tools: p.allowed_tools == null ? null : toDisplayNames(p.allowed_tools),
      skills: readProfileSkills(p.name),
      all_tools: allTools,
      all_tool_details: allToolDetails, // for toolset grouping in frontend
    }));
    res.json(result);
  } catch (err) {
    console.error("[profiles] GET error:", err);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
});

// POST /api/profiles: create a new profile (upsert into config/profiles.yml
// via the omniagent API; NO profiles/<name>/config.json is written).
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

    // Check if the profile is already declared (409, mirrors the old
    // filesystem-exists check).
    const declared = await omniProfiles();
    if (declared.some((p) => p.name === trimmedName)) {
      res.status(409).json({ error: `Profile '${trimmedName}' already exists` });
      return;
    }

    const fwd = await fetch(`${OMNIAGENT}/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        provider: provider && typeof provider === "string" && provider.trim() ? provider.trim() : null,
        model: model && typeof model === "string" && model.trim() ? model.trim() : null,
      }),
    });
    if (!fwd.ok) {
      const text = await fwd.text();
      res.status(fwd.status).json({ error: text || "Failed to create profile" });
      return;
    }

    res.status(201).json({
      success: true,
      profile: {
        name: trimmedName,
        provider: provider && typeof provider === "string" && provider.trim() ? provider.trim() : null,
        model: model && typeof model === "string" && model.trim() ? model.trim() : null,
        allowed_tools: null,
        skills: [],
        all_tools: await getAllTools(),
      },
    });
  } catch (err) {
    console.error("[profiles] POST error:", err);
    res.status(500).json({ error: "Failed to create profile" });
  }
});

// PATCH /api/profiles/:name: update profile fields in config/profiles.yml
// (YAML-only profiles with no directory are perfectly patchable).
profilesRouter.patch("/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { provider, model, allowed_tools, plan, template } = req.body as any;

    const body: Record<string, unknown> = {};
    if (provider !== undefined) body.provider = provider || null;
    if (model !== undefined) body.model = model || null;
    if (plan !== undefined) body.plan = plan;
    if (template !== undefined) body.template = template || null;
    if (allowed_tools !== undefined) {
      // Tri-state: `null` clears the allow-list back to "undefined" (all
      // tools); an array (including []) is stored as an explicit list.
      // Display names are converted to raw names for storage.
      body.allowed_tools =
        allowed_tools === null ? null : toRawNames(Array.isArray(allowed_tools) ? allowed_tools : []);
    }

    const fwd = await fetch(`${OMNIAGENT}/profiles/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!fwd.ok) {
      const text = await fwd.text();
      res.status(fwd.status).json({ error: text || "Failed to update profile" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[profiles] PATCH error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// POST /api/profiles/import: forward an external profiles.yml-structured
// document to the omniagent import endpoint (server-side validation + atomic
// merge into config/profiles.yml), returning its success/imported/updated
// payload verbatim.
profilesRouter.post("/import", async (req, res) => {
  try {
    const { yaml } = (req.body ?? {}) as any;
    if (!yaml || typeof yaml !== "string" || !yaml.trim()) {
      res
        .status(400)
        .json({ error: "Import body must contain a `yaml` field with the profiles.yml document" });
      return;
    }
    const fwd = await fetch(`${OMNIAGENT}/profiles/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml }),
    });
    const text = await fwd.text();
    res.status(fwd.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    console.error("[profiles] import error:", err);
    res.status(500).json({ error: "Failed to import profiles" });
  }
});
