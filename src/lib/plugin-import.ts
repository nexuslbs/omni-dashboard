// Batch import/override/remove of plugins from a remote.yml URL, AND batch
// import of provider definitions from a models.yml-like file.
//
// ONE shared implementation: the modal flow (URL fetch with server-proxy
// fallback, parse -> compare -> mark -> execute) is generic; `showImportFlow`.
// The plugin flow (`showImportModal`) and the models flow
// (`showModelsImportModal`) are thin configs over the same modal. The ONLY
// differences are the parsed schema (url/path/ref specs vs provider
// definitions) and the write path (plugins API vs PUT /api/models).
//
// Plugin flow (shown in showImportModal):
//   1. User pastes a remote.yml URL -> Confirm.
//   2. Fetch the URL (direct browser fetch; falls back to the dashboard
//      server proxy /api/fetch-remote when CORS/network blocks it).
//   3. Parse the YAML, keep only the section matching the current page
//      (platforms/tools/providers).
//   4. For each entry, compare with local state (installed plugins from
//      GET /api/plugins plus the local remote.yml served at /api/remote-yml)
//      and determine the suggested action:
//        add      -> no local plugin with that name/key
//        override -> plugin exists locally but url/path/ref differs
//        remove   -> plugin exists locally with the SAME url+path+ref
//   5. Clicking an action button marks it as pending (does NOT execute).
//      A revert control restores the original action button.
//   6. "Confirm & Execute" runs all marked actions sequentially, collects
//      per-plugin results, shows a toast summary and refreshes the page.
//
// Models flow (shown in showModelsImportModal):
//   1-2. Same URL fetch.
//   3. Parse the YAML `providers` section (provider definitions).
//   4. Compare each remote provider against the LOCAL models.yml (GET
//      /api/models) and suggest per-provider actions:
//        add      -> not present locally
//        override -> present locally with a DIFFERENT definition
//                    ("will overwrite existing config")
//        same     -> present locally with IDENTICAL config
//                    ("already exists": removable from the import set)
//   5. Marking works like the plugin flow; "same" rows can be removed from
//      the import set (skip).
//   6. "Confirm & Execute" MERGES the marked providers into models.yml via
//      PUT /api/models (add + override; the rest of the file is untouched).
//      Import never deletes local entries; deletion stays a /models page
//      action.
import { apiGet, apiPost, apiDelete, apiPut, toCamelCase, type PluginData } from "./api";
import { escapeHtml, formatApiError } from "./helpers";
import { showToast } from "./utils";
import type { PluginPageType } from "./plugin-ui";

// ── Types ──

export type ImportAction = "add" | "override" | "remove" | "same";

export interface RemotePluginSpec {
  url: string;
  path: string;
  ref?: string;
}

export interface RemoteYmlData {
  platforms?: Record<string, RemotePluginSpec>;
  tools?: Record<string, RemotePluginSpec>;
  providers?: Record<string, RemotePluginSpec>;
}

export interface RemoteYmlEntry {
  name: string;
  spec: RemotePluginSpec;
}

export interface PlannedImport extends RemoteYmlEntry {
  action: ImportAction;
  /** Local plugin's source, needed for DELETE /plugins/{typeDir}/{source}/{name} */
  source?: string;
}

export interface FetchOutcome {
  ok: boolean;
  text: string;
  status: number | null;
  error: string | null;
  usedProxy: boolean;
}

export interface BatchItem {
  name: string;
  action: ImportAction;
  /** Plugin import: the url/path/ref spec. */
  spec?: RemotePluginSpec;
  /** Models import: the raw provider definition. */
  data?: Record<string, unknown>;
  source?: string;
}

export interface BatchResult {
  name: string;
  action: ImportAction;
  ok: boolean;
  error?: string;
}

export interface ImportExecutor {
  install(opts: { url: string; path?: string; ref?: string; name?: string }): Promise<unknown>;
  remove(opts: { typeDir: string; source: string; name: string }): Promise<unknown>;
}

export const SECTION_FOR_TYPE: Record<PluginPageType, keyof RemoteYmlData> = {
  tool: "tools",
  platform: "platforms",
  provider: "providers",
};

export const TYPE_DIR: Record<PluginPageType, string> = {
  tool: "tools",
  platform: "platforms",
  provider: "providers",
};

// ── Shared import-flow types (generic modal) ──

/** A parsed entry from a remote definitions file (plugins or models). */
export interface ImportEntry {
  name: string;
  /** Raw definition: {url,path,ref} for plugins; provider fields for models. */
  data: Record<string, unknown>;
}

export interface PlannedEntry extends ImportEntry {
  action: ImportAction;
  source?: string;
}

/**
 * A flow configuration for the shared import modal. The modal implements
 * fetch/parse/compare/mark/execute ONCE; each flow supplies its own schema
 * (parse), local state (fetchLocal), comparison (plan) and write path
 * (execute).
 */
export interface ImportFlowConfig {
  title: string;
  urlLabel: string;
  urlPlaceholder: string;
  /** Singular noun for the entry type, e.g. "plugin" / "provider". */
  entryNoun: string;
  /** Parse the fetched text into entries. Throws on invalid content. */
  parse: (text: string) => ImportEntry[];
  /** Load the local state used by `plan` (e.g. installed plugins, models.yml). */
  fetchLocal: () => Promise<unknown>;
  /** Determine the suggested action for every entry against local state. */
  plan: (entries: ImportEntry[], local: unknown) => PlannedEntry[];
  /** Subtitle lines shown under the entry name in the modal rows. */
  describe: (p: PlannedEntry) => { subtitle: string; extra?: string };
  /** Execute the marked actions (in list order, continuing on error). */
  execute: (items: BatchItem[]) => Promise<BatchResult[]>;
}

// ── Minimal YAML line utilities (shared by both parsers) ──
//
// Handles: top-level sections, plugin/provider entries, key: value fields,
// quoted values, comments (#), CRLF, "---"/"..." markers, unknown top-level
// sections (ignored with their children).

function stripYamlComment(line: string): string {
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquoteYaml(value: string): string {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

function truncateForError(s: string, max = 60): string {
  const single = s.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

const KNOWN_SECTIONS = ["platforms", "tools", "providers"] as const;

// ── Plugin parser: remote.yml url/path/ref specs ──

export function parseRemoteYml(text: string): RemoteYmlData {
  if (!text || !text.trim()) {
    throw new Error("Invalid YAML: empty document");
  }
  const sections: RemoteYmlData = {};
  let currentSection: keyof RemoteYmlData | null = null;
  let currentEntry: { name: string; spec: RemotePluginSpec } | null = null;

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripYamlComment(raw).trimEnd();
    if (!line.trim()) continue;
    const content = line.trim();
    if (content === "---" || content === "...") continue;
    const indent = line.length - line.trimStart().length;

    const sectionMatch = content.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (indent === 0) {
      if (!sectionMatch) {
        throw new Error(
          `Invalid YAML: expected a section header at line ${i + 1}, got "${truncateForError(content)}"`,
        );
      }
      const key = sectionMatch[1] as keyof RemoteYmlData;
      currentEntry = null;
      if (KNOWN_SECTIONS.includes(key as (typeof KNOWN_SECTIONS)[number])) {
        if (!sections[key]) sections[key] = {};
        currentSection = key;
      } else {
        currentSection = null; // unknown section: skip its children
      }
      continue;
    }

    if (!currentSection) continue; // inside an unknown/ignored section

    const kv = content.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!kv) {
      throw new Error(`Invalid YAML: cannot parse line ${i + 1}: "${truncateForError(content)}"`);
    }
    const key = kv[1];
    const value = unquoteYaml(kv[2] ?? "");

    if (value === "") {
      // `name:` starts a new plugin entry
      const spec: RemotePluginSpec = { url: "", path: "" };
      currentEntry = { name: key, spec };
      sections[currentSection]![key] = spec;
    } else if (currentEntry && (key === "url" || key === "path" || key === "ref" || key === "git_ref")) {
      if (key === "git_ref") {
        currentEntry.spec.ref = value;
      } else {
        currentEntry.spec[key as "url" | "path" | "ref"] = value;
      }
    }
    // Other keys are ignored (extra metadata inside an entry).
  }

  // Validate entries: every plugin needs at least a url (path is optional).
  for (const sec of KNOWN_SECTIONS) {
    const map = sections[sec];
    if (!map) continue;
    for (const [name, spec] of Object.entries(map)) {
      if (!spec.url) {
        throw new Error(`Invalid YAML: entry "${name}" under "${sec}" is missing "url"`);
      }
    }
  }

  return sections;
}

// ── Models parser: models.yml-like provider definitions ──
//
// Parses a `providers:` section of a models.yml-LIKE file (any filename).
// Provider entries carry arbitrary scalar fields plus a `models:` list and a
// nested `model_config:` map. Scalars are normalized (numbers/bools parsed) so
// comparison with the live GET /api/models payload is byte-faithful.

export type ModelsProviderDef = Record<string, unknown>;

export interface ModelsYmlData {
  providers?: Record<string, ModelsProviderDef>;
}

/** Parse a bracket list like `[a, b, "c"]` (quotes stripped, trimmed). */
function parseYamlList(value: string): string[] {
  const inner = value
    .trim()
    .replace(/^\[/, "")
    .replace(/\]\s*$/, "")
    .trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((s) => unquoteYaml(s.trim()))
    .filter(Boolean);
}

/** Normalize a scalar string from the YAML line parser. */
function normalizeScalar(value: string): unknown {
  const v = unquoteYaml(value);
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  return v;
}

export function parseModelsYml(text: string): ModelsYmlData {
  if (!text || !text.trim()) {
    throw new Error("Invalid YAML: empty document");
  }
  const providers: Record<string, ModelsProviderDef> = {};
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let currentSection: string | null = null;
  let currentProvider: string | null = null;
  let currentModel: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = stripYamlComment(raw).trimEnd();
    if (!line.trim()) continue;
    const content = line.trim();
    if (content === "---" || content === "...") continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      const m = content.match(/^([A-Za-z0-9_-]+):\s*$/);
      if (!m) {
        throw new Error(
          `Invalid YAML: expected a section header at line ${i + 1}, got "${truncateForError(content)}"`,
        );
      }
      currentProvider = null;
      currentModel = null;
      currentSection = m[1] === "providers" ? "providers" : null;
      continue;
    }
    if (currentSection !== "providers") continue;

    const kv = content.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!kv) {
      throw new Error(`Invalid YAML: cannot parse line ${i + 1}: "${truncateForError(content)}"`);
    }
    const key = kv[1];
    const value = unquoteYaml(kv[2] ?? "").trim();

    // provider entry at indent 2
    if (indent === 2 && value === "") {
      currentProvider = key;
      currentModel = null;
      if (!providers[currentProvider]) providers[currentProvider] = {};
      continue;
    }
    if (!currentProvider) continue;

    // model_config sub-entries at indent 4+ (nested under the provider)
    if (key === "model_config" && value === "") {
      continue; // children handled below via indentation
    }
    // model entry at indent 4 (a key with no value directly under model_config)
    if (indent === 4 && value === "" && key !== "model_config") {
      currentModel = key;
      const mc =
        (providers[currentProvider]!.model_config as Record<string, ModelsProviderDef> | undefined) ?? {};
      mc[key] = {};
      providers[currentProvider]!.model_config = mc;
      continue;
    }
    if (indent === 6 && value === "" && currentModel) {
      // nested model field with empty value: treat as model-level sub-map (rare): skip
      continue;
    }

    const target =
      indent >= 4 && currentModel
        ? ((providers[currentProvider]!.model_config as Record<string, ModelsProviderDef>)[currentModel] = {
            ...((providers[currentProvider]!.model_config as Record<string, ModelsProviderDef>)[
              currentModel
            ] ?? {}),
          })
        : providers[currentProvider]!;

    if (key === "models" && value.startsWith("[")) {
      target.models = parseYamlList(value);
    } else if (value === "") {
      // empty scalar: skip (could be a nested map we do not model)
    } else {
      target[key] = normalizeScalar(value);
    }
  }
  return { providers };
}

// ── Action determination (plugin flow) ──

function normalizeSpec(spec: Partial<RemotePluginSpec>): RemotePluginSpec {
  return {
    url: (spec.url || "").trim(),
    path: (spec.path || "").trim(),
    ref: (spec.ref || "").trim(),
  };
}

export function specsEqual(a: RemotePluginSpec, b: RemotePluginSpec): boolean {
  const na = normalizeSpec(a);
  const nb = normalizeSpec(b);
  return na.url === nb.url && na.path === nb.path && (na.ref || "") === (nb.ref || "");
}

export function pluginRemoteToSpec(p: PluginData | null | undefined): RemotePluginSpec | null {
  const r = p?.remote;
  if (!r || !r.url) return null;
  return normalizeSpec({ url: r.url, path: r.path || "", ref: r.git_ref || undefined });
}

export function determineAction(
  fetched: RemotePluginSpec,
  localPlugin: PluginData | null | undefined,
  localYmlEntry: RemotePluginSpec | null | undefined,
): ImportAction {
  const installedSpec = pluginRemoteToSpec(localPlugin);
  const exists = !!(installedSpec || localYmlEntry);
  if (!exists) return "add";
  const compare = installedSpec ?? localYmlEntry ?? null;
  if (compare && specsEqual(fetched, compare)) return "remove";
  return "override";
}

export function planImportActions(
  entries: RemoteYmlEntry[],
  localPlugins: Array<{ name: string; source?: string } & Partial<PluginData>>,
  localYmlSection: Record<string, RemotePluginSpec> | null | undefined,
): PlannedImport[] {
  const byName = new Map(localPlugins.map((p) => [p.name, p]));
  return entries.map((entry) => {
    const local = byName.get(entry.name) as PluginData | undefined;
    const localYml = localYmlSection?.[entry.name] ?? null;
    return {
      ...entry,
      action: determineAction(entry.spec, local ?? null, localYml),
      source: local?.source,
    };
  });
}

// ── Action determination (models flow) ──

function definitionsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

export function planModelsImportActions(
  entries: ImportEntry[],
  localProviders: Record<string, Record<string, unknown>> | null | undefined,
): PlannedEntry[] {
  return entries.map((entry) => {
    const local = localProviders?.[entry.name];
    if (!local) return { ...entry, action: "add" };
    if (definitionsEqual(entry.data, local)) return { ...entry, action: "same" };
    return { ...entry, action: "override" };
  });
}

// URL fetching (with server-proxy fallback): shared by both flows

interface AttemptOutcome {
  ok: boolean;
  text: string;
  status: number | null;
  error: string | null;
  errorType: "network" | "http" | null;
}

async function attemptFetch(url: string, fetchImpl: typeof fetch): Promise<AttemptOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(url, { redirect: "follow" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, text: "", status: null, error: `Network error: ${msg}`, errorType: "network" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    try {
      const json = JSON.parse(body) as { error?: unknown };
      if (json && typeof json.error === "string" && json.error) msg = json.error;
    } catch {
      // not JSON; keep the generic HTTP message
    }
    return { ok: false, text: "", status: res.status, error: msg, errorType: "http" };
  }
  const text = await res.text().catch(() => "");
  if (!text.trim()) {
    return {
      ok: false,
      text: "",
      status: res.status,
      error: "Empty response from URL",
      errorType: "http",
    };
  }
  return { ok: true, text, status: res.status, error: null, errorType: null };
}

/**
 * Fetch a remote definitions URL.
 * - Direct browser fetch first.
 * - If CORS/network blocks the direct fetch (status === null), retry through
 *   the dashboard server proxy (GET /api/fetch-remote?url=...).
 * - HTTP error statuses (404/5xx) and empty bodies are reported as errors and
 *   never proceed to parsing.
 */
export async function fetchRemoteYml(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchOutcome> {
  const direct = await attemptFetch(url, fetchImpl);
  if (direct.ok) {
    return { ok: true, text: direct.text, status: direct.status, error: null, usedProxy: false };
  }
  if (direct.errorType === "network") {
    // CORS/DNS/connection failure: try the server-side proxy.
    const proxied = await attemptFetch(`/api/fetch-remote?url=${encodeURIComponent(url)}`, fetchImpl);
    if (proxied.ok) {
      return { ok: true, text: proxied.text, status: proxied.status, error: null, usedProxy: true };
    }
    return { ok: false, text: "", status: proxied.status, error: proxied.error, usedProxy: true };
  }
  // HTTP error from the origin: authoritative, do not proceed.
  return { ok: false, text: "", status: direct.status, error: direct.error, usedProxy: false };
}

// ── Batch execution: plugin flow (existing behavior) ──

export const defaultExecutor: ImportExecutor = {
  async install(opts) {
    return apiPost("/plugins/install-git", {
      url: opts.url,
      ...(opts.ref ? { git_ref: opts.ref } : {}),
      ...(opts.path ? { path: opts.path } : {}),
      ...(opts.name ? { name: opts.name } : {}),
    });
  },
  async remove(opts) {
    return apiDelete(
      `/plugins/${opts.typeDir}/${encodeURIComponent(opts.source)}/${encodeURIComponent(opts.name)}`,
    );
  },
};

/**
 * Execute marked plugin actions sequentially (one at a time, in list order).
 * Failures are collected per-plugin; the batch continues on error.
 */
export async function executeImportBatch(
  items: BatchItem[],
  type: PluginPageType,
  executor: ImportExecutor = defaultExecutor,
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  const typeDir = TYPE_DIR[type];
  for (const item of items) {
    const spec = item.spec || { url: "", path: "" };
    try {
      if (item.action === "remove") {
        await executor.remove({ typeDir, source: item.source || "remote", name: item.name });
      } else {
        await executor.install({ url: spec.url, path: spec.path, ref: spec.ref, name: item.name });
      }
      results.push({ name: item.name, action: item.action, ok: true });
    } catch (e: unknown) {
      results.push({ name: item.name, action: item.action, ok: false, error: formatApiError(e) });
    }
  }
  return results;
}

// ── Batch execution: models flow (merge into models.yml via PUT /api/models) ──

export interface ModelsFile {
  providers: Record<string, Record<string, unknown>>;
}

/**
 * Merge the marked add/override providers into the local models.yml and PUT
 * the result via /api/models. Only the marked providers change; every other
 * entry in the file is untouched. Never deletes local entries.
 */
export async function executeModelsImport(items: BatchItem[]): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  // Load the current file first so the merge never replaces the whole file.
  let current: ModelsFile;
  try {
    current = (await apiGet<ModelsFile>("/models")) || { providers: {} };
  } catch {
    current = { providers: {} };
  }
  if (!current.providers) current.providers = {};
  const toMerge: BatchItem[] = items.filter((i) => i.action === "add" || i.action === "override");
  for (const item of toMerge) {
    try {
      if (!item.data) throw new Error(`No definition for provider "${item.name}"`);
      current.providers[item.name] = item.data;
      results.push({ name: item.name, action: item.action, ok: true });
    } catch (e: unknown) {
      results.push({ name: item.name, action: item.action, ok: false, error: formatApiError(e) });
    }
  }
  try {
    await apiPut("/models", current);
  } catch (e: unknown) {
    // PUT failure affects the whole merge; mark every planned item failed.
    const msg = formatApiError(e);
    return toMerge.map((item) => ({ name: item.name, action: item.action, ok: false, error: msg }));
  }
  return results;
}

// ── Import modal (shared by both flows) ──

const ACTION_META: Record<ImportAction, { label: string; bg: string; border: string; color: string }> = {
  add: {
    label: "Add",
    bg: "rgba(139,92,246,0.15)",
    border: "rgba(139,92,246,0.3)",
    color: "var(--accent-purple,#a78bfa)",
  },
  override: {
    label: "Override",
    bg: "rgba(245,158,11,0.15)",
    border: "rgba(245,158,11,0.35)",
    color: "#fbbf24",
  },
  remove: {
    label: "Remove",
    bg: "rgba(244,63,94,0.1)",
    border: "rgba(244,63,94,0.2)",
    color: "#fb7185",
  },
  same: {
    label: "Already exists",
    bg: "rgba(148,163,184,0.1)",
    border: "rgba(148,163,184,0.25)",
    color: "var(--text-secondary)",
  },
};

const MODAL_CSS =
  "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:3rem 1rem;overflow-y:auto;";

/**
 * The shared import modal. Fetches the URL, parses via `config.parse`, plans
 * via `config.plan`, renders rows with action buttons (click to mark pending,
 * revert to restore) and executes marked actions via `config.execute`.
 * `same` rows (models flow) show "Already exists" and can be removed from the
 * import set (skipped); they are never executed.
 */
export function showImportFlow(config: ImportFlowConfig, onDone?: () => void): void {
  const entryNoun = config.entryNoun;
  const backdrop = document.createElement("div");
  backdrop.style.cssText = MODAL_CSS;
  backdrop.innerHTML = `
    <div style="background:var(--bg-card,#1e1e2e);border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:12px;padding:2rem;width:680px;max-width:94vw;">
      <h2 style="margin:0 0 0.75rem;font-size:1.2rem;color:var(--text-primary);">${config.title}</h2>
      <div id="import-status" style="display:none;padding:0.75rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;word-break:break-word;"></div>

      <div id="import-step-url">
        <label style="display:flex;flex-direction:column;gap:0.35rem;font-size:0.8rem;color:var(--text-secondary);">
          ${config.urlLabel}
          <input id="import-url" type="url" class="filter-input" style="width:100%;" placeholder="${config.urlPlaceholder}" />
        </label>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1.25rem;">
          <button id="import-cancel" class="btn btn-danger" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);color:#fb7185;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="import-fetch" class="btn-primary" style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Fetch &amp; Preview</button>
        </div>
      </div>

      <div id="import-step-list" style="display:none;flex-direction:column;gap:0.75rem;">
        <div id="import-list-head" style="font-size:0.85rem;color:var(--text-secondary);"></div>
        <div id="import-rows" style="display:flex;flex-direction:column;gap:0.5rem;max-height:46vh;overflow-y:auto;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:8px;padding:0.75rem;"></div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button id="import-batch-cancel" class="btn btn-danger" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);color:#fb7185;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="import-batch-confirm" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple,#a78bfa);border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Confirm &amp; Execute</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const statusEl = backdrop.querySelector("#import-status") as HTMLElement;
  const stepUrl = backdrop.querySelector("#import-step-url") as HTMLElement;
  const stepList = backdrop.querySelector("#import-step-list") as HTMLElement;
  const listHead = backdrop.querySelector("#import-list-head") as HTMLElement;
  const rowsEl = backdrop.querySelector("#import-rows") as HTMLElement;
  const fetchBtn = backdrop.querySelector("#import-fetch") as HTMLButtonElement;
  const confirmBtn = backdrop.querySelector("#import-batch-confirm") as HTMLButtonElement;
  const urlInput = backdrop.querySelector("#import-url") as HTMLInputElement;

  const showStatus = (msg: string, kind: "error" | "success" | "info"): void => {
    statusEl.style.display = "block";
    statusEl.textContent = msg;
    statusEl.style.background =
      kind === "error"
        ? "rgba(244,63,94,0.1)"
        : kind === "success"
          ? "rgba(34,197,94,0.1)"
          : "rgba(148,163,184,0.1)";
    statusEl.style.color =
      kind === "error" ? "#fb7185" : kind === "success" ? "#4ade80" : "var(--text-secondary)";
  };
  const hideStatus = (): void => {
    statusEl.style.display = "none";
  };
  const close = (): void => backdrop.remove();

  backdrop.querySelector("#import-cancel")?.addEventListener("click", close);
  backdrop.querySelector("#import-batch-cancel")?.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  // Pending marks: entry name -> "include" (execute) | "exclude" (skip, for
  // "same" rows). Unmarked entries are NOT executed.
  const marks = new Map<string, "include" | "exclude">();
  let planned: PlannedEntry[] = [];

  const renderRows = (): void => {
    rowsEl.innerHTML = planned
      .map((p, i) => {
        const meta = ACTION_META[p.action];
        const marked = marks.get(p.name);
        const desc = config.describe(p);
        const isSame = p.action === "same";
        return `
          <div data-import-row="${i}" style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(p.name)}${isSame ? ' <span style="font-weight:400;font-size:0.75rem;color:var(--text-muted);">(already in models.yml)</span>' : ""}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);word-break:break-all;">${escapeHtml(desc.subtitle)}</div>
              ${desc.extra ? `<div style="font-size:0.75rem;color:var(--text-secondary);">${desc.extra}</div>` : ""}
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
              ${
                marked
                  ? `<span data-import-pending="${i}" style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:${meta.color};">
                       <span>${marked === "exclude" ? "✕ Removed from set" : `✓ ${meta.label} pending`}</span>
                       <button data-import-revert="${i}" title="Restore the original action" style="background:none;border:none;color:inherit;cursor:pointer;font-size:0.85rem;padding:0;">✕</button>
                     </span>`
                  : isSame
                    ? `<button data-import-skip="${i}" class="btn" style="background:${meta.bg};border:1px solid ${meta.border};color:${meta.color};border-radius:6px;padding:0.3rem 0.7rem;cursor:pointer;font-size:0.78rem;font-weight:500;" title="Remove this entry from the import set">${meta.label} · Remove from set</button>`
                    : `<button data-import-action="${i}" class="btn" style="background:${meta.bg};border:1px solid ${meta.border};color:${meta.color};border-radius:6px;padding:0.3rem 0.7rem;cursor:pointer;font-size:0.78rem;font-weight:500;">${meta.label}</button>`
              }
            </div>
          </div>`;
      })
      .join("");

    rowsEl.querySelectorAll<HTMLButtonElement>("[data-import-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.importAction);
        const row = planned[idx];
        if (!row) return;
        marks.set(row.name, "include"); // mark pending (no execution yet)
        renderRows();
      });
    });
    rowsEl.querySelectorAll<HTMLButtonElement>("[data-import-skip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.importSkip);
        const row = planned[idx];
        if (!row) return;
        marks.set(row.name, "exclude"); // remove from the import set
        renderRows();
      });
    });
    rowsEl.querySelectorAll<HTMLButtonElement>("[data-import-revert]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.importRevert);
        const row = planned[idx];
        if (!row) return;
        marks.delete(row.name); // revert to the original action button
        renderRows();
      });
    });
  };

  fetchBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showStatus("Please enter a URL", "error");
      return;
    }
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Fetching…";
    showStatus("Fetching…", "info");
    try {
      const fetched = await fetchRemoteYml(url);
      if (!fetched.ok) {
        showStatus(fetched.error || `Failed to fetch URL (HTTP ${fetched.status ?? "?"})`, "error");
        return;
      }
      let entries: ImportEntry[];
      try {
        entries = config.parse(fetched.text);
      } catch (e: unknown) {
        showStatus(e instanceof Error ? e.message : `Invalid YAML: ${String(e)}`, "error");
        return;
      }
      const local = await config.fetchLocal();
      planned = config.plan(entries, local);
      marks.clear();

      hideStatus();
      stepUrl.style.display = "none";
      stepList.style.display = "flex";

      if (planned.length === 0) {
        listHead.textContent = `No ${entryNoun} entries found in this file.`;
        rowsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">Nothing to import: the file has no entries for this page.</div>`;
        confirmBtn.style.display = "none";
        return;
      }
      confirmBtn.style.display = "";
      listHead.textContent = `${planned.length} ${entryNoun}(s) found. Click an action button to mark it, then Confirm & Execute.`;
      renderRows();
    } catch (e: unknown) {
      showStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = "Fetch & Preview";
    }
  });

  confirmBtn.addEventListener("click", async () => {
    const marked = planned.filter((p) => marks.get(p.name) === "include");
    if (marked.length === 0) {
      showStatus("No actions marked: click an action button next to an entry first.", "error");
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Executing…";
    const items: BatchItem[] = marked.map((p) => ({
      name: p.name,
      action: p.action,
      spec: (p as unknown as PlannedImport).spec,
      data: p.data,
      source: (p as unknown as PlannedImport).source,
    }));
    const results = await config.execute(items);
    close();
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    showToast(`Import: ${ok.length} succeeded, ${failed.length} failed`, failed.length ? "error" : "success");
    if (failed.length) {
      console.warn("Import failures:", failed.map((f) => `${f.name} (${f.action}): ${f.error}`).join(" | "));
    }
    onDone?.();
  });
}

// ── Plugin import modal (existing entry point, behavior-preserving) ──

export function showImportModal(pluginType: PluginPageType, onDone?: () => void): void {
  const section = SECTION_FOR_TYPE[pluginType];
  const typeLabel = pluginType === "tool" ? "Tool" : pluginType === "platform" ? "Platform" : "Provider";
  const sectionLabel = typeLabel.toLowerCase();

  const flow: ImportFlowConfig = {
    title: `Import ${typeLabel}s from remote.yml`,
    urlLabel: "remote.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/remote.yml",
    entryNoun: sectionLabel,

    parse(text: string): ImportEntry[] {
      const yml = parseRemoteYml(text);
      return Object.entries(yml[section] ?? {}).map(([name, spec]) => ({
        name,
        data: { url: spec.url, path: spec.path || "", ref: spec.ref || "" } as unknown as Record<
          string,
          unknown
        >,
      }));
    },

    async fetchLocal() {
      // Local state: installed plugins (matching this page type) + local remote.yml.
      let localPlugins: Array<{ name: string; source?: string } & Partial<PluginData>> = [];
      try {
        const resp = (await apiGet(`/plugins?plugin_type=${pluginType}`)) as Record<string, unknown>;
        const data = (resp?.data ?? resp) as unknown[];
        localPlugins = Array.isArray(data)
          ? (data as PluginData[])
              .map((p) => toCamelCase<PluginData>(p))
              .filter((p) => p.pluginType === pluginType)
          : [];
      } catch {
        // plugin list unavailable: treat as empty local state
      }
      let localYmlSection: Record<string, RemotePluginSpec> | null | undefined;
      try {
        const res = await fetch("/api/remote-yml");
        if (res.ok) {
          localYmlSection = parseRemoteYml(await res.text())[section];
        }
      } catch {
        // local remote.yml unavailable; comparison falls back to installed plugins only
      }
      return { localPlugins, localYmlSection };
    },

    plan(entries: ImportEntry[], local: unknown) {
      const { localPlugins, localYmlSection } = local as {
        localPlugins: Array<{ name: string; source?: string } & Partial<PluginData>>;
        localYmlSection: Record<string, RemotePluginSpec> | null | undefined;
      };
      const pluginEntries: RemoteYmlEntry[] = entries.map((e) => ({
        name: e.name,
        spec: {
          url: String(e.data.url || ""),
          path: String(e.data.path || ""),
          ref: e.data.ref ? String(e.data.ref) : undefined,
        },
      }));
      return planImportActions(pluginEntries, localPlugins, localYmlSection).map((p) => ({
        name: p.name,
        data: p.spec as unknown as Record<string, unknown>,
        action: p.action,
        source: p.source,
      }));
    },

    describe(p: PlannedEntry) {
      const spec = p.data as unknown as RemotePluginSpec;
      return {
        subtitle: spec.url || "",
        extra: `path: ${spec.path || "-"}${spec.ref ? ` · ref: ${spec.ref}` : ""}`,
      };
    },

    execute(items: BatchItem[]) {
      return executeImportBatch(items, pluginType);
    },
  };

  showImportFlow(flow, onDone);
}

// ── Models import modal ──

export function showModelsImportModal(onDone?: () => void): void {
  const flow: ImportFlowConfig = {
    title: "Import providers from a models.yml-like file",
    urlLabel: "models.yml URL",
    urlPlaceholder: "https://raw.githubusercontent.com/user/repo/main/config/models.yml",
    entryNoun: "provider",

    parse(text: string): ImportEntry[] {
      const yml = parseModelsYml(text);
      return Object.entries(yml.providers ?? {}).map(([name, data]) => ({ name, data }));
    },

    async fetchLocal() {
      let file: ModelsFile;
      try {
        file = (await apiGet<ModelsFile>("/models")) || { providers: {} };
      } catch {
        file = { providers: {} };
      }
      return file.providers ?? {};
    },

    plan(entries: ImportEntry[], local: unknown) {
      return planModelsImportActions(entries, local as Record<string, Record<string, unknown>> | null);
    },

    describe(p: PlannedEntry) {
      const data = p.data;
      const models = Array.isArray(data.models) ? (data.models as string[]).join(", ") : "";
      const extraBits: string[] = [];
      if (data.api_mode) extraBits.push(`api_mode: ${String(data.api_mode)}`);
      if (data.default_base_url) extraBits.push(String(data.default_base_url));
      if (data.plugin === false) extraBits.push("no plugin (builtin)");
      if (data.plugin !== false && data.plugin !== undefined) extraBits.push("plugin-backed");
      return {
        subtitle: models ? `models: ${models}` : extraBits.join(" · ") || "provider definition",
        extra: p.action === "override" ? "will overwrite existing config" : undefined,
      };
    },

    execute(items: BatchItem[]) {
      return executeModelsImport(items);
    },
  };

  showImportFlow(flow, onDone);
}
