import { apiGet, type ChannelData, type PluginData } from "../lib/api";
import { enhanceSelect, unenhanceSelect } from "../lib/dropdown";

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
  void loadChannels();
}

let _profiles: any[] = [];
let _providers: string[] = [];
let _providerModels: Record<string, string[]> = {};

// ── Filter state ──
interface ChannelFilters {
  channelId: string;
  platform: string;
  status: string;
}
let _channelFilters: ChannelFilters = { channelId: "", platform: "all", status: "all" };

async function loadChannels(): Promise<void> {
  const content = document.getElementById("channels-content")!;
  try {
    const channels = await apiGet<ChannelData[]>("/channels");
    try {
      _profiles = await apiGet<any[]>("/profiles");
    } catch {
      _profiles = [];
    }
    // Load provider names and their model lists
    try {
      const pluginResp = await apiGet<any>("/plugins");
      const allPlugins: PluginData[] = pluginResp.data || pluginResp;
      const providers = allPlugins.filter((p: PluginData) => p.plugin_type === "provider");
      _providers = providers.map((p: PluginData) => p.name).sort() as string[];
      // Fetch each provider's config for model options
      const modelMap: Record<string, string[]> = {};
      for (const p of providers) {
        try {
          const detailResp = await apiGet<any>(`/plugins/${p.name}`);
          const detail = detailResp.data || detailResp;
          // Check both data and manifest config schemas
          const schema = [
            ...((detail.config_schema || []) as any[]),
            ...((detail.manifest?.config_schema || []) as any[]),
          ];
          const modelField = schema.find((f: any) => f.key === "default_model");
          if (modelField && modelField.allowed_values && modelField.allowed_values.length > 0) {
            modelMap[p.name] = modelField.allowed_values as string[];
          } else if (modelField && modelField.default) {
            modelMap[p.name] = [modelField.default as string];
          } else if (modelField && modelField.refresh_url && modelField.type === "enum") {
            // Provider has a refresh_url but no cached models — leave empty, user can click refresh
            modelMap[p.name] = [];
          } else {
            modelMap[p.name] = [];
          }
        } catch {
          modelMap[p.name] = [];
        }
      }
      _providerModels = modelMap;
    } catch {
      _providers = [];
      _providerModels = {};
    }
    // Populate platform filter from data
    const platformSel = document.getElementById("filter-platform") as HTMLSelectElement | null;
    if (platformSel) {
      const platforms = [
        ...new Set(channels.map((c: ChannelData) => c.platform).filter(Boolean)),
      ].sort() as string[];
      platformSel.innerHTML = '<option value="all">All</option>';
      for (const p of platforms) {
        platformSel.innerHTML += '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + "</option>";
      }
      platformSel.value = _channelFilters.platform;
    }
    // Restore filter inputs
    const chIdInput = document.getElementById("filter-channel-id") as HTMLInputElement | null;
    if (chIdInput) chIdInput.value = _channelFilters.channelId;
    const statusSel = document.getElementById("filter-channel-status") as HTMLSelectElement | null;
    if (statusSel) statusSel.value = _channelFilters.status;

    // Enhance filter selects with custom dropdowns
    enhanceSelect("filter-platform");
    enhanceSelect("filter-channel-status");

    content.innerHTML = renderChannelsPage(channels);
    wireChannels();
    // Enhance channel card selects (profile, provider, model)
    document.querySelectorAll(".channel-field-group select").forEach((el) => {
      enhanceSelect(el.id);
    });
    wireChannelFilterToggle();
  } catch (e) {
    content.innerHTML =
      '<div class="error-state" style="padding:3rem;text-align:center;">Failed to load channels: ' +
      (e instanceof Error ? e.message : "Unknown error") +
      "</div>";
  }
}

function wireChannelFilterToggle(): void {
  const refreshBtn = document.getElementById("refresh-channels-btn");
  if (refreshBtn && !refreshBtn.getAttribute("data-wired")) {
    refreshBtn.setAttribute("data-wired", "1");
    refreshBtn.addEventListener("click", () => {
      void loadChannels();
    });
  }
  const resetBtn = document.getElementById("reset-channels-filter");
  if (resetBtn && !resetBtn.getAttribute("data-wired")) {
    resetBtn.setAttribute("data-wired", "1");
    resetBtn.addEventListener("click", () => {
      _channelFilters = { channelId: "", platform: "all", status: "all" };
      void loadChannels();
    });
  }
  // Filter inputs
  const chIdInput = document.getElementById("filter-channel-id");
  if (chIdInput && !chIdInput.getAttribute("data-wired")) {
    chIdInput.setAttribute("data-wired", "1");
    chIdInput.addEventListener("input", () => {
      _channelFilters.channelId = (chIdInput as HTMLInputElement).value;
      applyChannelFilters();
    });
  }
  const platformSel = document.getElementById("filter-platform");
  if (platformSel && !platformSel.getAttribute("data-wired")) {
    platformSel.setAttribute("data-wired", "1");
    platformSel.addEventListener("change", () => {
      _channelFilters.platform = (platformSel as HTMLSelectElement).value;
      applyChannelFilters();
    });
  }
  const statusSel = document.getElementById("filter-channel-status");
  if (statusSel && !statusSel.getAttribute("data-wired")) {
    statusSel.setAttribute("data-wired", "1");
    statusSel.addEventListener("change", () => {
      _channelFilters.status = (statusSel as HTMLSelectElement).value;
      applyChannelFilters();
    });
  }
}

function applyChannelFilters(): void {
  // Re-filter the cards by re-rendering from existing data
  // We stored the full channel list in the session — re-fetch for simplicity
  void loadChannels();
}

function renderChannelsPage(channels: ChannelData[]): string {
  if (!channels || channels.length === 0) {
    return '<div class="empty-state">No channels configured</div>';
  }

  // Apply filters
  let filtered = channels;
  if (_channelFilters.channelId) {
    const q = _channelFilters.channelId.toLowerCase();
    filtered = filtered.filter((ch) => String(ch.id).includes(q) || ch.name.toLowerCase().includes(q));
  }
  if (_channelFilters.platform && _channelFilters.platform !== "all") {
    filtered = filtered.filter((ch) => ch.platform === _channelFilters.platform);
  }
  if (_channelFilters.status === "open") {
    filtered = filtered.filter((ch) => !ch.closed);
  } else if (_channelFilters.status === "closed") {
    filtered = filtered.filter((ch) => ch.closed);
  }

  if (filtered.length === 0) {
    return '<div class="empty-state">No channels match the current filters</div>';
  }

  return filtered
    .map(
      (ch) => `
    <div class="card settings-card" data-channel-id="${ch.id}" data-readonly="${ch.readonly}">
      <div class="card-header">
        <span class="card-title">${escapeHtml(ch.name)}</span>
        ${ch.readonly ? '<span style="flex:1;text-align:center;"><span class="channel-status-badge badge-neutral">Permanent</span></span>' : '<span style="flex:1;"></span>'}
        <span class="channel-status-badge ${ch.closed ? "badge-error" : "badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Name</div>
            ${renderNameInput(ch.id, ch.name, ch.readonly)}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Platform</div>
            <code class="setting-value-code">${escapeHtml(ch.platform || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Resource Identifier</div>
            <code class="setting-value-code">${escapeHtml(ch.resource_identifier || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Status</div>
            ${renderStatusControl(ch)}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Profile</div>
            ${renderProfileSelect(ch.id, ch.current_profile || "default")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Provider</div>
            ${renderProviderSelect(ch.id, ch.current_provider || "default")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            ${renderModelSelect(ch.id, ch.current_provider || "default", ch.current_model || "")}
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderNameInput(channelId: number, currentName: string, readonly: boolean): string {
  if (readonly) {
    return `
      <div class="channel-field-group">
        <code class="setting-readonly-code">${escapeHtml(currentName)}</code>
      </div>
    `;
  }
  const inputId = `ch-${channelId}-name-input`;
  return `
    <div class="channel-field-group">
      <input type="text" id="${inputId}" class="filter-input channel-edit-input"
        data-channel-id="${channelId}" data-field="name" data-original="${escapeHtml(currentName)}"
        value="${escapeHtml(currentName)}" style="width:280px;" />
      <button type="button" class="channel-edit-btn save" data-channel-id="${channelId}" data-field="name" style="display:none;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="channel-edit-btn cancel" data-channel-id="${channelId}" data-field="name" style="display:none;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function renderStatusControl(ch: ChannelData): string {
  const actionLabel = ch.closed ? "Open" : "Close";
  const nextClosed = !ch.closed;
  return `
    <div class="channel-field-group">
      <span class="status-badge ${ch.closed ? "status-badge-error" : "status-badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
      <button type="button" class="channel-action-btn channel-toggle-btn" data-channel-id="${ch.id}" data-closed="${nextClosed}">
        ${actionLabel}
      </button>
    </div>
  `;
}

function renderProfileSelect(channelId: number, current: string): string {
  const selectId = `ch-${channelId}-profile`;
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select"
        data-channel-id="${channelId}" data-field="profile" data-original="${escapeHtml(current)}">
        ${_profiles
          .map(
            (p: any) =>
              `<option value="${escapeHtml(p.name)}" ${p.name === current ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
          )
          .join("")}
      </select>
      <button type="button" class="channel-edit-btn save" data-channel-id="${channelId}" data-field="profile" style="display:none;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="channel-edit-btn cancel" data-channel-id="${channelId}" data-field="profile" style="display:none;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function renderProviderSelect(channelId: number, currentProvider: string): string {
  const selectId = `ch-${channelId}-provider`;
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select channel-provider-select"
        data-channel-id="${channelId}" data-field="provider" data-original="${escapeHtml(currentProvider)}">
        ${_providers
          .map(
            (p: string) =>
              `<option value="${escapeHtml(p)}" ${p === currentProvider ? "selected" : ""}>${escapeHtml(p)}</option>`,
          )
          .join("")}
      </select>
      <button type="button" class="channel-edit-btn save" data-channel-id="${channelId}" data-field="provider" style="display:none;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="channel-edit-btn cancel" data-channel-id="${channelId}" data-field="provider" style="display:none;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function getModelsForProvider(provider: string): string[] {
  return _providerModels[provider] || [];
}

function renderModelSelect(channelId: number, currentProvider: string, currentModel: string): string {
  const selectId = `ch-${channelId}-model`;
  const refreshId = `ch-${channelId}-refresh`;
  const models = getModelsForProvider(currentProvider);
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select"
        data-channel-id="${channelId}" data-field="model" data-original="${escapeHtml(currentModel)}">
        ${
          models.length > 0
            ? models
                .map(
                  (m: string) =>
                    `<option value="${escapeHtml(m)}" ${m === currentModel ? "selected" : ""}>${escapeHtml(m)}</option>`,
                )
                .join("")
            : `<option value="${escapeHtml(currentModel)}" selected>${escapeHtml(currentModel || "—")}</option>`
        }
      </select>
      <button type="button" id="${refreshId}" class="channel-refresh-btn" data-channel-id="${channelId}" data-provider="${escapeHtml(currentProvider)}" title="Refresh Models">⟳</button>
      <button type="button" class="channel-edit-btn save" data-channel-id="${channelId}" data-field="model" style="display:none;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="channel-edit-btn cancel" data-channel-id="${channelId}" data-field="model" style="display:none;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function wireChannels(): void {
  // Edit input change detection
  document.querySelectorAll(".channel-edit-input").forEach((el) => {
    const input = el as HTMLInputElement;
    const eventType = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(eventType, () => {
      const channelId = input.getAttribute("data-channel-id");
      const field = input.getAttribute("data-field");
      const original = input.getAttribute("data-original") || "";
      const confirmBtn = document.querySelector(
        `.channel-edit-btn.save[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const cancelBtn = document.querySelector(
        `.channel-edit-btn.cancel[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const changed = input.value !== original;
      if (confirmBtn) confirmBtn.style.display = changed ? "inline-flex" : "none";
      if (cancelBtn) cancelBtn.style.display = changed ? "inline-flex" : "none";
    });
  });

  // Provider change → update model dropdown
  document.querySelectorAll(".channel-provider-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const select = sel as HTMLSelectElement;
      const channelId = select.getAttribute("data-channel-id");
      if (!channelId) return;
      const newProvider = select.value;
      const models = getModelsForProvider(newProvider);
      const modelSelect = document.getElementById(`ch-${channelId}-model`) as HTMLSelectElement | null;
      if (!modelSelect) return;
      // Clear model options
      modelSelect.innerHTML =
        models.length > 0
          ? models.map((m: string) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")
          : '<option value="">—</option>';
      // Reset model original to first option
      const firstModel = models.length > 0 ? models[0] : "";
      modelSelect.value = firstModel;
      modelSelect.setAttribute("data-original", firstModel);
      // Re-enhance model select (remove old wrapper, re-create)
      unenhanceSelect(modelSelect.id);
      enhanceSelect(modelSelect.id);
      // Hide confirm/cancel for model since value auto-updates
      const modelConfirmBtn = document.querySelector(
        `.channel-edit-btn.save[data-channel-id="${channelId}"][data-field="model"]`,
      ) as HTMLElement | null;
      const modelCancelBtn = document.querySelector(
        `.channel-edit-btn.cancel[data-channel-id="${channelId}"][data-field="model"]`,
      ) as HTMLElement | null;
      if (modelConfirmBtn) modelConfirmBtn.style.display = "none";
      if (modelCancelBtn) modelCancelBtn.style.display = "none";
    });
  });

  // Refresh Models button — calls server endpoint (same as providers page)
  document.querySelectorAll(".channel-refresh-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const el = btn as HTMLElement;
      const channelId = el.getAttribute("data-channel-id");
      const provider = el.getAttribute("data-provider");
      if (!channelId || !provider) return;
      el.textContent = "⟳";
      el.style.opacity = "0.5";
      try {
        await apiPost(`/plugins/${encodeURIComponent(provider)}/refresh-models`, {});
        // Re-fetch plugin detail to get updated model list
        const detailResp = await apiGet<any>(`/plugins/${provider}`);
        const detail = detailResp.data || detailResp;
        const schema = [
          ...((detail.config_schema || []) as any[]),
          ...((detail.manifest?.config_schema || []) as any[]),
        ];
        const modelField = schema.find((f: any) => f.key === "default_model");
        let models: string[] = [];
        if (modelField && modelField.allowed_values && modelField.allowed_values.length > 0) {
          models = modelField.allowed_values as string[];
        } else if (modelField && modelField.default) {
          models = [modelField.default as string];
        }
        _providerModels[provider] = models;
        const modelSelect = document.getElementById(`ch-${channelId}-model`) as HTMLSelectElement | null;
        if (modelSelect) {
          const currentVal = modelSelect.value;
          modelSelect.innerHTML =
            models.length > 0
              ? models
                  .map((m: string) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
                  .join("")
              : '<option value="">—</option>';
          if (models.includes(currentVal)) {
            modelSelect.value = currentVal;
          }
          modelSelect.setAttribute("data-original", modelSelect.value);
        }
        (window as any).showToast?.(`Models refreshed for ${provider} (${models.length} models)`, "success");
      } catch (e) {
        (window as any).showToast?.(
          "Failed to refresh models: " + (e instanceof Error ? e.message : "Unknown"),
          "error",
        );
      }
      el.style.opacity = "1";
    });
  });

  // Confirm edits
  document.querySelectorAll(".channel-edit-btn.save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const channelId = btn.getAttribute("data-channel-id");
      const field = btn.getAttribute("data-field");
      if (!channelId || !field) return;
      const input = document.querySelector(
        `[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLInputElement | null;
      if (!input) return;
      const value = input.value;
      const body: Record<string, string> = {};
      const key = field === "name" ? "name" : `current_${field}`;
      body[key] = value;
      try {
        const res = await fetch(`/api/channels/${channelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        input.setAttribute("data-original", value);
        (btn as HTMLElement).style.display = "none";
        const cancelBtn = document.querySelector(
          `.channel-edit-btn.cancel[data-channel-id="${channelId}"][data-field="${field}"]`,
        ) as HTMLElement | null;
        if (cancelBtn) cancelBtn.style.display = "none";
        (window as any).showToast?.("Channel updated", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Cancel edits
  document.querySelectorAll(".channel-edit-btn.cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const channelId = btn.getAttribute("data-channel-id");
      const field = btn.getAttribute("data-field");
      if (!channelId || !field) return;
      const input = document.querySelector(
        `[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLInputElement | null;
      if (!input) return;
      input.value = input.getAttribute("data-original") || "";
      (btn as HTMLElement).style.display = "none";
      const confirmBtn = document.querySelector(
        `.channel-edit-btn.save[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      if (confirmBtn) confirmBtn.style.display = "none";
    });
  });

  // Open/Close toggle buttons
  document.querySelectorAll(".channel-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const channelId = btn.getAttribute("data-channel-id");
      const closed = btn.getAttribute("data-closed") === "true";
      if (!channelId) return;
      try {
        const res = await fetch(`/api/channels/${channelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ closed }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        (window as any).showToast?.(closed ? "Channel closed" : "Channel opened", "success");
        void loadChannels();
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
