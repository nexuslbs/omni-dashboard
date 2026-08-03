// Batch import/override/remove of plugins from a remote.yml URL.
//
// Flow (shown in showImportModal):
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
import { apiDelete, apiGet, apiPost, toCamelCase, type PluginData } from "./api";
import { escapeHtml, formatApiError } from "./helpers";
import { showToast } from "./utils";
import type { PluginPageType } from "./plugin-ui";

// ── Types ──

export type ImportAction = "add" | "override" | "remove";

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
  spec: RemotePluginSpec;
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

// ── Minimal YAML parser (subset matching remote.yml) ──
//
// Handles:
//   platforms: / tools: / providers:        top-level sections
//     some-plugin:                          plugin entry
//       url: https://github.com/org/repo.git
//       path: tools/some-plugin
//       ref: main                           (optional)
// Also tolerates: comments (#), quoted values, CRLF, "---"/"..." markers,
// unknown top-level sections (ignored with their children).

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
      throw new Error(
        `Invalid YAML: cannot parse line ${i + 1}: "${truncateForError(content)}"`,
      );
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

// ── Action determination ──

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

// ── URL fetching (with server-proxy fallback) ──

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
      // not JSON — keep the generic HTTP message
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
 * Fetch a remote.yml URL.
 * - Direct browser fetch first.
 * - If CORS/network blocks the direct fetch (status === null), retry through
 *   the dashboard server proxy (GET /api/fetch-remote?url=...).
 * - HTTP error statuses (404/5xx) and empty bodies are reported as errors and
 *   never proceed to parsing.
 */
export async function fetchRemoteYml(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const direct = await attemptFetch(url, fetchImpl);
  if (direct.ok) {
    return { ok: true, text: direct.text, status: direct.status, error: null, usedProxy: false };
  }
  if (direct.errorType === "network") {
    // CORS/DNS/connection failure: try the server-side proxy.
    const proxied = await attemptFetch(
      `/api/fetch-remote?url=${encodeURIComponent(url)}`,
      fetchImpl,
    );
    if (proxied.ok) {
      return { ok: true, text: proxied.text, status: proxied.status, error: null, usedProxy: true };
    }
    return { ok: false, text: "", status: proxied.status, error: proxied.error, usedProxy: true };
  }
  // HTTP error from the origin — authoritative, do not proceed.
  return { ok: false, text: "", status: direct.status, error: direct.error, usedProxy: false };
}

// ── Batch execution ──

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
 * Execute marked actions sequentially (one at a time, in list order).
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
    try {
      if (item.action === "remove") {
        await executor.remove({ typeDir, source: item.source || "remote", name: item.name });
      } else {
        await executor.install({ url: item.spec.url, path: item.spec.path, ref: item.spec.ref, name: item.name });
      }
      results.push({ name: item.name, action: item.action, ok: true });
    } catch (e: unknown) {
      results.push({ name: item.name, action: item.action, ok: false, error: formatApiError(e) });
    }
  }
  return results;
}

// ── Import modal ──

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
};

const MODAL_CSS =
  "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:3rem 1rem;overflow-y:auto;";

export function showImportModal(pluginType: PluginPageType, onDone?: () => void): void {
  const section = SECTION_FOR_TYPE[pluginType];
  const typeLabel = pluginType === "tool" ? "Tool" : pluginType === "platform" ? "Platform" : "Provider";
  const sectionLabel = typeLabel.toLowerCase();

  const backdrop = document.createElement("div");
  backdrop.style.cssText = MODAL_CSS;
  backdrop.innerHTML = `
    <div style="background:var(--bg-card,#1e1e2e);border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:12px;padding:2rem;width:680px;max-width:94vw;">
      <h2 style="margin:0 0 0.75rem;font-size:1.2rem;color:var(--text-primary);">Import ${typeLabel}s from remote.yml</h2>
      <div id="import-status" style="display:none;padding:0.75rem;border-radius:8px;margin-bottom:1rem;font-size:0.85rem;word-break:break-word;"></div>

      <div id="import-step-url">
        <label style="display:flex;flex-direction:column;gap:0.35rem;font-size:0.8rem;color:var(--text-secondary);">
          remote.yml URL
          <input id="import-url" type="url" class="filter-input" style="width:100%;" placeholder="https://raw.githubusercontent.com/user/repo/main/remote.yml" />
        </label>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1.25rem;">
          <button id="import-cancel" class="btn btn-ghost" style="border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="import-fetch" class="btn-primary" style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Fetch &amp; Preview</button>
        </div>
      </div>

      <div id="import-step-list" style="display:none;flex-direction:column;gap:0.75rem;">
        <div id="import-list-head" style="font-size:0.85rem;color:var(--text-secondary);"></div>
        <div id="import-rows" style="display:flex;flex-direction:column;gap:0.5rem;max-height:46vh;overflow-y:auto;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:8px;padding:0.75rem;"></div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button id="import-batch-cancel" class="btn btn-ghost" style="border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
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
      kind === "error" ? "rgba(244,63,94,0.1)" : kind === "success" ? "rgba(34,197,94,0.1)" : "rgba(148,163,184,0.1)";
    statusEl.style.color = kind === "error" ? "#fb7185" : kind === "success" ? "#4ade80" : "var(--text-secondary)";
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

  // Pending marks: plugin name -> chosen action (one per plugin).
  const marks = new Map<string, ImportAction>();
  let planned: PlannedImport[] = [];

  const renderRows = (): void => {
    rowsEl.innerHTML = planned
      .map((p, i) => {
        const meta = ACTION_META[p.action];
        const pending = marks.has(p.name);
        return `
          <div data-import-row="${i}" style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:0.9rem;">${escapeHtml(p.name)}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);word-break:break-all;">${escapeHtml(p.spec.url)}</div>
              <div style="font-size:0.75rem;color:var(--text-secondary);">path: ${escapeHtml(p.spec.path || "-")}${p.spec.ref ? ` · ref: ${escapeHtml(p.spec.ref)}` : ""}</div>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
              <button data-import-action="${i}" class="btn" style="background:${meta.bg};border:1px solid ${meta.border};color:${meta.color};border-radius:6px;padding:0.3rem 0.7rem;cursor:pointer;font-size:0.78rem;font-weight:500;${pending ? "display:none;" : ""}">${meta.label}</button>
              <span data-import-pending="${i}" style="${pending ? "display:inline-flex;" : "display:none;"}align-items:center;gap:0.4rem;font-size:0.78rem;color:${meta.color};">
                <span>✓ ${meta.label} pending</span>
                <button data-import-revert="${i}" title="Cancel this action" style="background:none;border:none;color:inherit;cursor:pointer;font-size:0.85rem;padding:0;">✕</button>
              </span>
            </div>
          </div>`;
      })
      .join("");

    rowsEl.querySelectorAll<HTMLButtonElement>("[data-import-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.importAction);
        const row = planned[idx];
        if (!row) return;
        marks.set(row.name, row.action); // mark pending (no execution yet)
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
      showStatus("Please enter a remote.yml URL", "error");
      return;
    }
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Fetching…";
    showStatus("Fetching remote.yml…", "info");
    try {
      const fetched = await fetchRemoteYml(url);
      if (!fetched.ok) {
        showStatus(fetched.error || `Failed to fetch URL (HTTP ${fetched.status ?? "?"})`, "error");
        return;
      }
      let yml: RemoteYmlData;
      try {
        yml = parseRemoteYml(fetched.text);
      } catch (e: unknown) {
        showStatus(e instanceof Error ? e.message : `Invalid YAML: ${String(e)}`, "error");
        return;
      }
      const entries: RemoteYmlEntry[] = Object.entries(yml[section] ?? {}).map(([name, spec]) => ({
        name,
        spec,
      }));

      // Local state: installed plugins (matching this page type) + local remote.yml.
      let localPlugins: Array<{ name: string; source?: string } & Partial<PluginData>> = [];
      try {
        const resp = (await apiGet(`/plugins?plugin_type=${pluginType}`)) as Record<string, unknown>;
        const data = (resp?.data ?? resp) as unknown[];
        localPlugins = Array.isArray(data)
          ? (data as PluginData[]).map((p) => toCamelCase<PluginData>(p)).filter((p) => p.pluginType === pluginType)
          : [];
      } catch {
        // plugin list unavailable — treat as empty local state
      }
      let localYmlSection: Record<string, RemotePluginSpec> | null | undefined;
      try {
        const res = await fetch("/api/remote-yml");
        if (res.ok) {
          localYmlSection = parseRemoteYml(await res.text())[section];
        }
      } catch {
        // local remote.yml unavailable — comparison falls back to installed plugins only
      }

      planned = planImportActions(entries, localPlugins, localYmlSection);
      marks.clear();

      hideStatus();
      stepUrl.style.display = "none";
      stepList.style.display = "flex";

      if (planned.length === 0) {
        listHead.textContent = `No "${section}" entries found in this remote.yml.`;
        rowsEl.innerHTML =
          '<div style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">Nothing to import for this page — the remote.yml has no "' +
          section +
          '" section, or it is empty.</div>';
        confirmBtn.style.display = "none";
        return;
      }
      confirmBtn.style.display = "";
      listHead.textContent = `${planned.length} ${sectionLabel}(s) found. Click an action button to mark it, then Confirm & Execute.`;
      renderRows();
    } catch (e: unknown) {
      showStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = "Fetch & Preview";
    }
  });

  confirmBtn.addEventListener("click", async () => {
    const marked = planned.filter((p) => marks.has(p.name));
    if (marked.length === 0) {
      showStatus("No actions marked — click an action button next to a plugin first.", "error");
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Executing…";
    const items: BatchItem[] = marked.map((p) => ({
      name: p.name,
      action: marks.get(p.name)!,
      spec: p.spec,
      source: p.source,
    }));
    const results = await executeImportBatch(items, pluginType);
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
