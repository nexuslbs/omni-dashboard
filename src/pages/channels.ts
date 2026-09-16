/**
 * Main channels page: rendering, data loading, filter state management.
 * Delegates to lib/channel-config.ts and lib/channel-status.ts.
 */
import { apiGet, type ChannelData } from "../lib/api";
import { mergedProvidersFromApi } from "../lib/providers";
import { allSettledOrNull } from "../lib/parallel";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";
import { escapeHtml, fixMissingSelectOptions, formatApiError, getDefaultProfile } from "../lib/helpers";
import { showChannelsImportModal } from "../lib/config-import";
import {
  _profiles,
  _templates,
  _channelToolsets,
  setChannelData,
  setProviderErrors,
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
        <button id="channels-import-btn" class="btn" style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">Import</button>
        <button id="refresh-channels-btn" class="btn" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:#34d399;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">↻ Refresh</button>
        <button id="reset-channels-filter" class="btn" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);color:#fb7185;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;line-height:12px;white-space:nowrap;">✕ Reset</button>
      </div>
    </div>
    <div id="channels-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading channels...</div>
    </div>
  `;
  setChannelFilters({ channelId: "", platform: "all", status: "all" });
  applyFiltersFromUrl();
  wireChannelsImport();
  void loadChannels();
}

// ── Data loading ──

async function loadChannels(): Promise<void> {
  const content = document.getElementById("channels-content")!;
  content.innerHTML = '<div class="loading">Loading channels...</div>';
  try {
    // /channels, /profiles, /plugins, /templates and /settings are INDEPENDENT:
    // they are started in the SAME tick (allSettledOrNull) so the page pays the
    // MAX call instead of the sum of five sequential round trips.
    const [channels, profilesRes, pluginsRes, templatesRes, defaultProfileRes, toolsetsRes] =
      await allSettledOrNull([
        apiGet<ChannelData[]>("/channels"),
        apiGet("/profiles"),
        apiGet<any>("/plugins"),
        apiGet<any[]>("/templates"),
        getDefaultProfile(),
        apiGet<{ toolsets?: Record<string, string[]> }>("/api/toolsets"),
      ]);
    if (!channels) throw new Error("Failed to load channels");
    _profiles.length = 0;
    if (Array.isArray(profilesRes)) _profiles.push(...(profilesRes as any));
    // Provider options come from the SINGLE merged resolution served by the
    // omniagent API (`/plugins`): enabled provider plugins UNION the providers
    // defined in models.yml, deduplicated by provider id with models.yml
    // precedence. Never assembled locally, so models.yml-only (code-less)
    // providers are always selectable and merge-contract errors surface loudly.
    const merged = mergedProvidersFromApi(pluginsRes);
    setChannelData(_profiles, merged.providers, merged.models);
    setProviderErrors(merged.errors);
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

    _templates.length = 0;
    if (Array.isArray(templatesRes)) _templates.push(...templatesRes);
    _channelToolsets.length = 0;
    _channelToolsets.push(
      ...Object.keys((toolsetsRes as { toolsets?: Record<string, string[]> } | null)?.toolsets ?? {}).sort(),
    );

    const defaultProfile = defaultProfileRes ?? (await getDefaultProfile());
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

// ── Import (channels.yml) ──

export function wireChannelsImport(): void {
  document.getElementById("channels-import-btn")?.addEventListener("click", () => {
    showChannelsImportModal(() => void loadChannels());
  });
}

// Wire Import button after render (called from renderChannels)
// (kept inline in renderChannels via the button id; this hook is optional)
