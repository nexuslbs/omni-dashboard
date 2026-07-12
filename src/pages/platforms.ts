import { apiGet, toCamelCase, type PluginData } from "../lib/api";
import { enhanceSelectElement, enhanceSelect, syncSelectDisplay } from "../lib/dropdown";
import { formatApiError } from "../lib/helpers";
import { getCurrentConfig, dirtyCheckSaveButton, wireRefToggles } from "../lib/plugin-config";
import { renderPluginCard, wirePluginButtons, showInstallModal } from "../lib/plugin-ui";

// ── Filter state ──
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

export function renderPlatforms(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Platforms</h1>
        <p class="page-subtitle">Communication platforms — built-in and plugin-based</p>
      </div>
      <button id="add-platform-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Add</button>
    </div>
    <div class="filter-bar" id="platforms-filter-bar">
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
    <div id="platforms-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading platforms...</div>
    </div>
  `;

  document.getElementById("add-platform-btn")?.addEventListener("click", () => showInstallModal("platform"));

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

  void loadPlatforms();
}

// ── State ──

// savedConfigs and pending changes map
const savedConfigs: Map<string, Record<string, any>> = new Map();

async function loadPlatforms(): Promise<void> {
  const content = document.getElementById("platforms-content")!;
  content.innerHTML =
    '<div class="loading" style="padding:3rem;text-align:center;">Loading platforms...</div>';
  try {
    const response = await apiGet<any>("/plugins");
    // Backend wraps in { success, data } — extract data array
    const allPlugins: PluginData[] = (response.data || response).map((p: Record<string, any>) =>
      toCamelCase<PluginData>(p),
    );
    // Filter to platforms only, plus always include cli as built-in
    const platforms = allPlugins.filter((p: PluginData) => p.pluginType === "platform");
    // Ensure cli is always shown even if not returned by API
    if (!platforms.find((p) => p.name === "cli")) {
      platforms.unshift({
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
      });
    }
    content.innerHTML = renderPlatformsPage(platforms);
    wirePlatforms();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load platforms: ${formatApiError(e)}</div>`;
  }
}

function filterPlugins(plugins: PluginData[]): PluginData[] {
  return plugins.filter((p: PluginData) => {
    // Source filter
    if (currentSource !== "all" && p.source !== currentSource) return false;
    // Status filter
    if (currentStatus !== "all" && p.status !== currentStatus) return false;
    // Name filter — free text search on plugin key
    if (currentName && !p.name.toLowerCase().includes(currentName.toLowerCase())) return false;
    return true;
  });
}

function renderPlatformsPage(platforms: PluginData[]): string {
  // Apply filters
  const filtered = filterPlugins(platforms);

  if (!filtered || filtered.length === 0) {
    return '<div class="empty-state">No platforms match the current filters</div>';
  }

  // Sort: same-name plugins ordered built-in → bundled → remote
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

  return sorted
    .map((p) => {
      const isDuplicated = p.isDuplicated === true;
      const hasRemote: boolean = p.remote !== undefined;
      const hasCompilableSource: boolean = !p.isScript && !!p.hasSourceCode;

      return renderPluginCard(p, { hasRemote, hasCompilableSource, isDuplicated });
    })
    .join("");
}

function wireFilterEvents(): void {
  document.getElementById("filter-source")?.addEventListener("change", (e) => {
    currentSource = (e.target as HTMLSelectElement).value;
    syncPluginFiltersToUrl();
    void loadPlatforms();
  });
  document.getElementById("filter-status")?.addEventListener("change", (e) => {
    currentStatus = (e.target as HTMLSelectElement).value;
    syncPluginFiltersToUrl();
    void loadPlatforms();
  });
  const nameInput = document.getElementById("filter-name") as HTMLInputElement;
  nameInput?.addEventListener("input", () => {
    currentName = nameInput.value.trim();
    syncPluginFiltersToUrl();
    void loadPlatforms();
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
    void loadPlatforms();
  });
}

function wirePlatforms(): void {
  // Wire filter events
  wireFilterEvents();

  // ── Ref toggles for $secret:/$env: references ──
  wireRefToggles();

  // Wire all plugin action buttons via shared handler
  wirePluginButtons("platform", () => void loadPlatforms());

  // Card header click also toggles
  document.querySelectorAll(".card-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const btn = header.querySelector(".plugin-expand-btn") as HTMLElement;
      if (btn) btn.click();
    });
  });

  // Secret copy button
  document.querySelectorAll(".setting-secret-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;
      navigator.clipboard
        .writeText(input.value)
        .then(() => {
          const original = btn.innerHTML;
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
          setTimeout(() => {
            btn.innerHTML = original;
          }, 1500);
        })
        .catch(() => {
          input.select();
          document.execCommand("copy");
        });
    });
  });

  // Secret toggle (eye icon)
  document.querySelectorAll(".setting-secret-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.setAttribute("title", isPassword ? "Hide" : "Toggle visibility");
      btn.innerHTML = isPassword
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>`;
    });
  });

  // ── Config dirty-state tracking ──
  document.querySelectorAll(".plugin-config-form").forEach((formEl) => {
    const card = formEl.closest(".card") as HTMLElement;
    const pluginName = card?.getAttribute("data-plugin-name");
    if (!pluginName) return;
    // Store the currently-rendered values as the saved baseline
    savedConfigs.set(pluginName, getCurrentConfig(formEl as HTMLElement));
    // Re-check dirty state on every input change
    formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
      input.addEventListener("input", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
      input.addEventListener("change", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
    });
    // Initial dirty check (should be grayed out)
    dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs);
  });

  // Enhance native select elements to styled custom dropdowns
  document.querySelectorAll(".plugin-config-form select.plugin-config-input[data-key]").forEach((el) => {
    enhanceSelectElement(el as HTMLSelectElement);
  });

  // Enhance filter selects
  enhanceSelect("filter-source");
  enhanceSelect("filter-status");
}
