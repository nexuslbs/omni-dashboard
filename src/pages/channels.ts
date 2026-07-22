/**
 * Main channels page: rendering, data loading, filter state management.
 * Delegates to lib/channel-config.ts and lib/channel-status.ts.
 */
import { apiGet, toCamelCase, type ChannelData, type PluginData } from "../lib/api";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";
import { escapeHtml, fixMissingSelectOptions, formatApiError, getDefaultProfile } from "../lib/helpers";
import {
  _profiles,
  _providers,
  _providerModels,
  _templates,
  wireChannelConfigEditing,
} from "../lib/channel-config";
import {
  _channelFilters,
  setChannelFilters,
  syncFiltersToUrl,
  applyFiltersFromUrl,
  renderChannelsPage,
  wireChannelFilterControls,
  wireChannelToggleButtons,
} from "../lib/channel-status";

// ── Main render ──

export function renderChannels(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Channels</h1>
        <p class="page-subtitle">Agent channels across all platforms</p>
      </div>
    </div>
    <div class="filter-bar" id="channels-filter-bar">
      <div class="filter-section">
        <label class="filter-label">Channel ID</label>
        <input type="text" id="filter-channel-id" class="filter-input" placeholder="Search by ID or name..." />
      </div>
      <div class="filter-section">
        <label class="filter-label">Platform</label>
        <select id="filter-platform" class="filter-select">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Status</label>
        <select id="filter-channel-status" class="filter-select">
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div class="filter-actions" style="margin-left:auto;">
        <button id="refresh-channels-btn" class="btn btn-secondary">↻ Refresh</button>
        <button id="reset-channels-filter" class="btn btn-secondary">✕ Reset</button>
      </div>
    </div>
    <div id="channels-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading channels...</div>
    </div>
  `;
  setChannelFilters({ channelId: "", platform: "all", status: "all" });
  applyFiltersFromUrl();
  void loadChannels();
}

// ── Data loading ──

async function loadChannels(): Promise<void> {
  const content = document.getElementById("channels-content")!;
  content.innerHTML = '<div class="loading">Loading channels...</div>';
  try {
    const channels = await apiGet<ChannelData[]>("/channels");
    try {
      const p = (await apiGet("/profiles")) as Record<string, unknown>[];
      _profiles.length = 0;
      _profiles.push(...(p as any));
    } catch {
      _profiles.length = 0;
    }
    // Load provider names and their model lists
    try {
      const pluginResp = await apiGet<any>("/plugins");
      const allPlugins: PluginData[] = (pluginResp.data || pluginResp).map((p: Record<string, any>) =>
        toCamelCase<PluginData>(p),
      );
      const providers = allPlugins.filter((p: PluginData) => p.pluginType === "provider");
      _providers.length = 0;
      _providers.push(...providers.map((p: PluginData) => p.name).sort());
      const modelMap: Record<string, string[]> = {};
      for (const p of providers) {
        try {
          // Use data already returned in the plugin list response instead of
          // fetching /api/plugins/:name individually (which may 404)
          const schema = [
            ...((p.configSchema || []) as any[]),
            ...((p.manifest?.config_schema || []) as any[]),
          ];
          const modelField = schema.find((f: any) => f.key === "default_model");
          if (modelField && modelField.allowed_values && modelField.allowed_values.length > 0) {
            modelMap[p.name] = modelField.allowed_values as string[];
          } else if (modelField && modelField.default) {
            modelMap[p.name] = [modelField.default as string];
          } else if (modelField && modelField.refresh_url && modelField.type === "enum") {
            modelMap[p.name] = [];
          } else {
            modelMap[p.name] = [];
          }
        } catch {
          modelMap[p.name] = [];
        }
      }
      Object.keys(_providerModels).forEach((k) => delete _providerModels[k]);
      Object.assign(_providerModels, modelMap);
    } catch {
      _providers.length = 0;
      Object.keys(_providerModels).forEach((k) => delete _providerModels[k]);
    }
    // Populate platform filter from data
    const platformSel = document.getElementById("filter-platform") as HTMLSelectElement | null;
    if (platformSel) {
      const platforms = Array.from(
        new Set(channels.map((c: ChannelData) => c.platform).filter(Boolean)),
      ).sort() as string[];
      platformSel.innerHTML = '<option value="all">All</option>';
      for (const p of platforms) {
        platformSel.innerHTML += '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>";
      }
      platformSel.value = _channelFilters.platform;
      syncSelectDisplay("filter-platform");
    }
    // Restore filter inputs
    const chIdInput = document.getElementById("filter-channel-id") as HTMLInputElement | null;
    if (chIdInput) chIdInput.value = _channelFilters.channelId;
    const statusSel = document.getElementById("filter-channel-status") as HTMLSelectElement | null;
    if (statusSel) {
      statusSel.value = _channelFilters.status;
      syncSelectDisplay("filter-channel-status");
    }

    // Enhance filter selects
    enhanceSelect("filter-platform");
    enhanceSelect("filter-channel-status");

    // Load templates for template select
    try {
      const t = await apiGet<any[]>("/templates");
      _templates.length = 0;
      _templates.push(...t);
    } catch {
      _templates.length = 0;
    }

    const defaultProfile = await getDefaultProfile();
    content.innerHTML = renderChannelsPage(channels, defaultProfile);
    wireChannels();
    // Enhance channel card selects
    document.querySelectorAll(".channel-field-group select").forEach((el) => {
      enhanceSelect(el.id);
    });
    fixMissingSelectOptions();
    wireChannelFilterControls(() => loadChannels());
    // Sync current filters to URL
    syncFiltersToUrl();
  } catch (e) {
    content.innerHTML =
      '<div class="error-state" style="padding:3rem;text-align:center;">Failed to load channels: ' +
      formatApiError(e) +
      "</div>";
  }
}

// ── Wire all channel interactions ──

function wireChannels(): void {
  wireChannelConfigEditing();
  wireChannelToggleButtons(() => loadChannels());
}
