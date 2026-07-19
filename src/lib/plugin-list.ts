import { apiGet, toCamelCase, type PluginData } from "./api";
import { enhanceSelectElement, enhanceSelect, syncSelectDisplay } from "./dropdown";
import { formatApiError } from "./helpers";
import { getCurrentConfig, dirtyCheckSaveButton, wireRefToggles } from "./plugin-config";
import { renderPluginCard, wirePluginButtons, showInstallModal } from "./plugin-ui";
import { wireCopyButtons, wireToggleButtons } from "./secret-buttons";

const RELOAD_URL = "/api/reload";

// ── Per-type config ──

export type PluginPageType = "tool" | "platform" | "provider";

interface PluginPageConfig {
  type: PluginPageType;
  /** Plural noun for titles (e.g. "Tools") */
  title: string;
  subtitle: string;
  /** Fetch /mcp/tools and show tool names/amounts per plugin */
  showMcpTools?: boolean;
  /** Extra built-in entities to inject into the list (e.g. cli for platforms) */
  builtinFallbacks?: Partial<PluginData>[];
}

const PAGE_CONFIGS: Record<PluginPageType, PluginPageConfig> = {
  tool: {
    type: "tool",
    title: "Tools",
    subtitle: "MCP tools and servers: built-in and plugin-based",
    showMcpTools: true,
  },
  platform: {
    type: "platform",
    title: "Platforms",
    subtitle: "Communication platforms: built-in and plugin-based",
    builtinFallbacks: [
      {
        name: "cli",
        pluginType: "platform",
        source: "built-in",
        status: "enabled",
        manifest: {
          name: "cli",
          type: "platform",
          description: "Command-line interface platform",
        },
        config: {},
      },
    ],
  },
  provider: {
    type: "provider",
    title: "Providers",
    subtitle: "AI model providers: built-in and plugin-based",
  },
};

// ── Derived element IDs ──

function contentId(type: PluginPageType): string {
  return `${type}s-content`;
}
function filterBarId(type: PluginPageType): string {
  return `${type}s-filter-bar`;
}
function addBtnId(type: PluginPageType): string {
  return `add-${type}-btn`;
}

// ── Filter state (shared between all plugin pages) ──

let currentSource = "all";
let currentStatus = "all";
let currentName = "";

function syncPluginFiltersToUrl(): void {
  const params = new URLSearchParams();
  if (currentSource !== "all") params.set("source", currentSource);
  if (currentStatus !== "all") params.set("status", currentStatus);
  if (currentName) params.set("name", currentName);
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function applyPluginFiltersFromUrl(): void {
  const p = new URLSearchParams(window.location.search);
  const source = p.get("source");
  if (source) currentSource = source;
  const status = p.get("status");
  if (status) currentStatus = status;
  const name = p.get("name");
  if (name) currentName = name;
}

// ── Card-level config dirty tracking ──

const savedConfigs: Map<string, Record<string, unknown>> = new Map();

// ── Page renderer factory ──

export function createPluginPage(cfg: PluginPageConfig) {
  const { type, title, subtitle } = cfg;
  const cId = contentId(type);
  const fbId = filterBarId(type);
  const abId = addBtnId(type);

  return function renderPage(container: HTMLElement): void {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${title}</h1>
          <p class="page-subtitle">${subtitle}</p>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button id="btn-reload-plugins" class="btn-secondary" title="Reload all plugins from disk configuration" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;color:var(--text-secondary);">⟳ Reload</button>
          <button id="${abId}" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Add</button>
        </div>
      </div>
      <div class="filter-bar" id="${fbId}">
        <div class="filter-section">
          <label class="filter-label">Source</label>
          <select class="filter-select" id="filter-source">
            <option value="all">All</option>
            <option value="built-in">Built-in</option>
            <option value="bundled">Bundled</option>
            <option value="remote">Remote</option>
          </select>
        </div>
        <div class="filter-section">
          <label class="filter-label">Status</label>
          <select class="filter-select" id="filter-status">
            <option value="all">All</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="error">Error</option>
            <option value="duplicated">Duplicated</option>
            <option value="not_installed">Not Installed</option>
            <option value="no_code">No code</option>
            <option value="not_found">Not found</option>
          </select>
        </div>
        <div class="filter-section">
          <label class="filter-label">Name</label>
          <input type="text" class="filter-input" id="filter-name" placeholder="Plugin key..." />
        </div>
        <div class="filter-actions">
          <button class="btn btn-secondary" id="btn-reset-filters">✕ Reset</button>
        </div>
      </div>
      <div id="${cId}">
        <div class="loading" style="padding:3rem;text-align:center;">Loading ${title.toLowerCase()}...</div>
      </div>
    `;

    document.getElementById(abId)?.addEventListener("click", () => showInstallModal(type));

    // Wire reload button
    const reloadBtn = document.getElementById("btn-reload-plugins");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", async () => {
        reloadBtn.textContent = "⟳ Reloading...";
        (reloadBtn as HTMLButtonElement).disabled = true;
        try {
          const resp = await fetch(RELOAD_URL, { method: "POST" });
          if (!resp.ok) {
            alert(`Reload failed (HTTP ${resp.status}): expected success`);
            return;
          }
          const text = await resp.text();
          if (!text.trim()) {
            alert(`Reload failed: server returned empty response (HTTP ${resp.status})`);
            return;
          }
          const data = JSON.parse(text);
          if (data.success) {
            // Re-fetch and re-render all plugins
            await loadPage(type, cfg);
          } else {
            alert(`Reload failed: ${data.error || "Unknown error"}`);
          }
        } catch (e: unknown) {
          alert(`Reload request failed: ${(e as Error).message}`);
        } finally {
          reloadBtn.textContent = "⟳ Reload";
          (reloadBtn as HTMLButtonElement).disabled = false;
        }
      });
    }

    // Restore filter state from URL and set input values
    currentSource = "all";
    currentStatus = "all";
    currentName = "";
    applyPluginFiltersFromUrl();

    const sourceSel = document.getElementById("filter-source") as HTMLSelectElement | null;
    if (sourceSel) sourceSel.value = currentSource;
    const statusSel = document.getElementById("filter-status") as HTMLSelectElement | null;
    if (statusSel) statusSel.value = currentStatus;
    const nameInput = document.getElementById("filter-name") as HTMLInputElement | null;
    if (nameInput) nameInput.value = currentName;

    void loadPage(type, cfg);
  };
}

async function loadPage(type: PluginPageType, cfg: PluginPageConfig, background?: boolean): Promise<void> {
  const { showMcpTools, builtinFallbacks } = cfg;
  const cId = contentId(type);
  const content = document.getElementById(cId)!;
  if (!background) {
    content.innerHTML = '<div class="loading" style="padding:3rem;text-align:center;">Loading...</div>';
  }
  try {
    // Fetch plugins and optionally MCP tools
    const pluginsResponse = await apiGet("/plugins") as Record<string, unknown>;

    // Parse plugins
    const pluginsData = (pluginsResponse as Record<string, unknown>).data || pluginsResponse;
    const rawPlugins = Array.isArray(pluginsData) ? pluginsData : [];
    const allPlugins: PluginData[] = (rawPlugins as PluginData[]).map((p) => toCamelCase<PluginData>(p));
    const pluginTypeKey = type === "tool" ? "tool" : type;
    const filteredPlugins = allPlugins.filter((p: PluginData) => p.pluginType === pluginTypeKey);

    // Inject built-in fallbacks
    if (builtinFallbacks) {
      for (const fb of builtinFallbacks) {
        if (!filteredPlugins.find((p) => p.name === fb.name)) {
          filteredPlugins.unshift(fb as PluginData);
        }
      }
    }

    // Build tool map for tools page
    const toolMap: Record<string, string[]> = {};
    if (showMcpTools) {
      try {
        const toolsResponse = await apiGet("/mcp/tools") as { tools?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
        const toolsList = Array.isArray(toolsResponse)
          ? toolsResponse
          : (toolsResponse?.tools || toolsResponse?.data || []) as Record<string, unknown>[];
        for (const t of toolsList) {
          const server = t.server_name || t.source || "unknown";
          if (!toolMap[server]) toolMap[server] = [];
          toolMap[server].push(t.full_name || t.name || t.tool || "?");
        }
      } catch {
        // MCP tools endpoint may not be available: continue without tools data
      }
    }

    content.innerHTML = renderPluginsPage(filteredPlugins, type, toolMap);
    wirePage(type);
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load ${type}s: ${formatApiError(e)}</div>`;
  }
}

function filterPlugins(plugins: PluginData[]): PluginData[] {
  return plugins.filter((p: PluginData) => {
    if (currentSource !== "all" && p.source !== currentSource) return false;
    if (currentStatus !== "all" && p.status !== currentStatus) return false;
    if (currentName && !p.name.toLowerCase().includes(currentName.toLowerCase())) return false;
    return true;
  });
}

function getPluginTools(p: PluginData, toolMap: Record<string, string[]>): string[] {
  const exact = toolMap[p.name];
  if (exact) return exact;
  const altName = p.name.includes("_") ? p.name.replace(/_/g, "-") : p.name.replace(/-/g, "_");
  if (altName !== p.name) {
    const alt = toolMap[altName];
    if (alt) return alt;
  }
  return [];
}

function renderPluginsPage(
  plugins: PluginData[],
  type: PluginPageType,
  toolMap: Record<string, string[]>,
): string {
  const filtered = filterPlugins(plugins);

  if (!filtered || filtered.length === 0) {
    return `<div class="empty-state">No ${type}s match the current filters</div>`;
  }

  const sourcePriority: Record<string, number> = {
    "built-in": 0,
    bundled: 1,
    remote: 2,
  };
  const sorted = [...filtered].sort((a, b) => {
    if (a.name === b.name) {
      return (sourcePriority[a.source] ?? 99) - (sourcePriority[b.source] ?? 99);
    }
    return a.name.localeCompare(b.name);
  });

  // For tools page, also show MCP tool names/amounts
  const showTools = type === "tool";

  return sorted
    .map((p) => {
      const pluginTools = showTools ? getPluginTools(p, toolMap) : [];
      const hasTools = pluginTools.length > 0;
      const isDuplicated = p.isDuplicated === true;
      const hasRemote = p.remote !== undefined;
      const hasCompilableSource = !p.isScript && !!p.hasSourceCode;

      return renderPluginCard(p, {
        hasTools,
        pluginTools,
        hasRemote,
        hasCompilableSource,
        isDuplicated,
      });
    })
    .join("");
}

function wireFilterEvents(type: PluginPageType): void {
  document.getElementById("filter-source")?.addEventListener("change", (e) => {
    currentSource = (e.target as HTMLSelectElement).value;
    syncPluginFiltersToUrl();
    void loadPage(type, PAGE_CONFIGS[type]);
  });
  document.getElementById("filter-status")?.addEventListener("change", (e) => {
    currentStatus = (e.target as HTMLSelectElement).value;
    syncPluginFiltersToUrl();
    void loadPage(type, PAGE_CONFIGS[type]);
  });
  const nameInput = document.getElementById("filter-name") as HTMLInputElement;
  nameInput?.addEventListener("input", () => {
    currentName = nameInput.value.trim();
    syncPluginFiltersToUrl();
    void loadPage(type, PAGE_CONFIGS[type]);
  });
  document.getElementById("btn-reset-filters")?.addEventListener("click", () => {
    currentSource = "all";
    currentStatus = "all";
    currentName = "";
    const sourceSel = document.getElementById("filter-source") as HTMLSelectElement | null;
    const statusSel = document.getElementById("filter-status") as HTMLSelectElement | null;
    const nameInp = document.getElementById("filter-name") as HTMLInputElement | null;
    if (sourceSel) sourceSel.value = "all";
    if (statusSel) statusSel.value = "all";
    if (nameInp) nameInp.value = "";
    syncSelectDisplay("filter-source");
    syncSelectDisplay("filter-status");
    history.replaceState(null, "", window.location.pathname);
    void loadPage(type, PAGE_CONFIGS[type]);
  });
}

function wirePage(type: PluginPageType): void {
  wireFilterEvents(type);

  wireRefToggles();

  wirePluginButtons(type, () => void loadPage(type, PAGE_CONFIGS[type], true));

  // Card header click also toggles
  document.querySelectorAll(".card-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const btn = header.querySelector(".plugin-expand-btn") as HTMLElement;
      if (btn) btn.click();
    });
  });

  // Secret copy and toggle buttons (shared wiring from secret-buttons.ts)
  wireCopyButtons();
  wireToggleButtons();

  // Config dirty-state tracking
  document.querySelectorAll(".plugin-config-form").forEach((formEl) => {
    const card = formEl.closest(".card") as HTMLElement;
    const pluginName = card?.getAttribute("data-plugin-name");
    if (!pluginName) return;
    savedConfigs.set(pluginName, getCurrentConfig(formEl as HTMLElement));
    formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
      input.addEventListener("input", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
      input.addEventListener("change", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
    });
    dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs);
  });

  // Discard buttons: revert all fields to the saved (original) config
  document.querySelectorAll(".plugin-discard-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const formEl = (btn as HTMLElement).closest(".plugin-config-form") as HTMLElement;
      if (!formEl) return;
      const card = formEl.closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      if (!pluginName) return;
      const saved = savedConfigs.get(pluginName);
      if (!saved) return;
      // Restore each field from saved config
      formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
        const el = input as HTMLInputElement | HTMLSelectElement;
        const key = el.getAttribute("data-key");
        if (!key) return;
        if (el.type === "checkbox") {
          el.checked = !!saved[key];
        } else {
          el.value = saved[key] !== undefined ? String(saved[key]) : "";
        }
      });
      // Re-evaluate dirty state
      dirtyCheckSaveButton(formEl, pluginName, savedConfigs);
    });
  });

  // Enhance native select elements to styled custom dropdowns
  document.querySelectorAll(".plugin-config-form select.plugin-config-input[data-key]").forEach((el) => {
    enhanceSelectElement(el as HTMLSelectElement);
  });

  // Enhance filter selects
  enhanceSelect("filter-source");
  enhanceSelect("filter-status");
}
