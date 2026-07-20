/**
 * Channel config editing: name, profile, provider, model, plan controls.
 * Extracted from src/pages/channels.ts
 */
import { escapeHtml, formatApiError } from "./helpers";
import { enhanceSelect, unenhanceSelect } from "./dropdown";
import { apiGet, apiPost } from "./api";
import type { SettingDefinition, ProfileData } from "./types";
import { showToast } from "./utils";

// ── Module-level data shared across channel modules ──
export let _profiles: ProfileData[] = [];
export let _providers: string[] = [];
export let _providerModels: Record<string, string[]> = {};
export const _templates: { profile: string; name: string; label: string }[] = [];

export function setChannelData(
  profiles: ProfileData[],
  providers: string[],
  providerModels: Record<string, string[]>,
): void {
  _profiles = profiles;
  _providers = providers;
  _providerModels = providerModels;
}

// ── Helper functions ──

export function getModelsForProvider(provider: string): string[] {
  return _providerModels[provider] || [];
}

// ── Render functions ──

export function renderNameInput(channelId: number, currentName: string, readonly: boolean): string {
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

export function renderProfileSelect(channelId: number, current: string): string {
  const selectId = `ch-${channelId}-profile`;
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select channel-edit-input"
        data-channel-id="${channelId}" data-field="profile" data-original="${escapeHtml(current)}">
        ${_profiles
          .map(
            (p: ProfileData) =>
              `<option value="${escapeHtml(p.name!)}" ${p.name === current ? "selected" : ""}>${escapeHtml(p.name!)}</option>`,
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

export function renderProviderSelect(channelId: number, currentProvider: string): string {
  const selectId = `ch-${channelId}-provider`;
  const currentInList = currentProvider && (_providers as string[]).includes(currentProvider);
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select channel-provider-select channel-edit-input"
        data-channel-id="${channelId}" data-field="provider" data-original="${escapeHtml(currentProvider)}">
        ${currentProvider && !currentInList ? `<option value="${escapeHtml(currentProvider)}" selected>${escapeHtml(currentProvider)}</option>` : ""}
        ${_providers
          .map(
            (p: string) =>
              `<option value="${escapeHtml(p)}" ${!currentInList && p === (_providers[0] || "") && !currentProvider ? "selected" : p === currentProvider ? "selected" : ""}>${escapeHtml(p)}</option>`,
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

export function renderModelSelect(channelId: number, currentProvider: string, currentModel: string): string {
  const selectId = `ch-${channelId}-model`;
  const refreshId = `ch-${channelId}-refresh`;
  const models = getModelsForProvider(currentProvider);
  const currentInModels = currentModel && models.includes(currentModel);
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select channel-edit-input"
        data-channel-id="${channelId}" data-field="model" data-original="${escapeHtml(currentModel)}">
        <option value="" ${!currentModel ? "selected" : ""}>- (Default) -</option>
        ${currentModel && !currentInModels ? `<option value="${escapeHtml(currentModel)}" selected>${escapeHtml(currentModel)}</option>` : ""}
        ${
          models.length > 0
            ? models
                .map(
                  (m: string) =>
                    `<option value="${escapeHtml(m)}" ${m === currentModel ? "selected" : ""}>${escapeHtml(m)}</option>`,
                )
                .join("")
            : ""
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

export function planBadge(plan: boolean): string {
  const color = plan ? "#22c55e" : "#64748b";
  const label = plan ? "On" : "Off";
  return `<span class="channel-status-badge" style="--type-color:${color};background:${color}22;border-color:${color}44;color:${color};font-size:0.7rem;padding:0.125rem 0.5rem;">${label}</span>`;
}

export function renderPlanSelect(channelId: number, current: boolean): string {
  const selectId = `ch-${channelId}-plan`;
  const selectedVal = current ? "true" : "false";
  const options = [
    { value: "", label: "- (Default)" },
    { value: "true", label: "On" },
    { value: "false", label: "Off" },
  ];
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select channel-edit-input"
        data-channel-id="${channelId}" data-field="plan" data-original="${escapeHtml(selectedVal)}">
        ${options
          .map(
            (opt) =>
              `<option value="${escapeHtml(opt.value)}" ${opt.value === selectedVal ? "selected" : ""}>${escapeHtml(opt.label)}</option>`,
          )
          .join("")}
      </select>
      <button type="button" class="channel-edit-btn save" data-channel-id="${channelId}" data-field="plan" style="display:none;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="channel-edit-btn cancel" data-channel-id="${channelId}" data-field="plan" style="display:none;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

export function renderTemplateInput(
  channelId: number,
  current: string,
  readonly: boolean,
  templates?: { profile: string; name: string; label: string }[],
): string {
  if (readonly) {
    return `
      <div class="channel-field-group">
        <code class="setting-readonly-code">${current ? escapeHtml(current) : "-"}</code>
      </div>
    `;
  }
  const selectId = `ch-${channelId}-template`;
  return `
    <div class="channel-field-group">
      <select id="${selectId}" class="filter-select channel-edit-input"
        data-channel-id="${channelId}" data-field="template" data-original="${escapeHtml(current)}">
        <option value="">- (None) -</option>
        ${(templates || []).map((t: { name: string; profile: string }) => `<option value="${escapeHtml(t.name)}" ${t.name === current ? "selected" : ""}>${escapeHtml(t.name)} (${escapeHtml(t.profile)})</option>`).join("")}
      </select>
      <button type="button" class="channel-edit-btn save" data-channel-id="${channelId}" data-field="template" style="display:none;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="channel-edit-btn cancel" data-channel-id="${channelId}" data-field="template" style="display:none;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

// ── Wire config editing events ──
export function wireChannelConfigEditing(): void {
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
      const prevModel = modelSelect.getAttribute("data-original") || modelSelect.value;
      const prevModelValid = prevModel && models.includes(prevModel);
      modelSelect.innerHTML =
        models.length > 0
          ? (prevModel && !prevModelValid
              ? `<option value="${escapeHtml(prevModel)}" selected>${escapeHtml(prevModel)}</option>`
              : "") +
            models
              .filter((m: string) => m !== prevModel || !prevModelValid)
              .map((m: string) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
              .join("")
          : '<option value="">N/A</option>';
      const newVal = prevModelValid ? prevModel : models.length > 0 ? models[0] : "";
      modelSelect.value = newVal;
      modelSelect.setAttribute("data-original", newVal);
      unenhanceSelect(modelSelect.id);
      enhanceSelect(modelSelect.id);
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

  // Refresh Models button
  document.querySelectorAll(".channel-refresh-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const el = btn as HTMLElement;
      const channelId = el.getAttribute("data-channel-id");
      const provider = el.getAttribute("data-provider");
      if (!channelId || !provider) return;
      el.textContent = "⟳";
      el.style.opacity = "0.5";
      try {
        await apiPost(`/plugins/providers/bundled/${encodeURIComponent(provider)}/refresh-models`, {});
        // Re-fetch the plugin list to get updated config_schema
        const freshResp = await apiGet("/plugins") as Record<string, unknown>;
        const freshPlugins = (freshResp.data || freshResp).map(
          (p: Record<string, unknown>): Record<string, unknown> => {
            const r: Record<string, unknown> = {};
            for (const k of Object.keys(p)) {
              r[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = p[k];
            }
            return r;
          },
        );
        const providerPlugin = freshPlugins.find(
          (fp: Record<string, unknown>) => fp.pluginType === "provider" && fp.name === provider,
        );
        if (!providerPlugin) throw new Error(`Provider "${provider}" not found`);
        const schema = [
          ...((providerPlugin.config_schema || []) as any[]),
          ...((providerPlugin.manifest?.config_schema || []) as any[]),
        ];
        const modelField = schema.find((f: SettingDefinition) => f.key === "default_model");
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
          const currentValValid = currentVal && models.includes(currentVal);
          modelSelect.innerHTML =
            models.length > 0
              ? (currentVal && !currentValValid
                  ? `<option value="${escapeHtml(currentVal)}" selected>${escapeHtml(currentVal)}</option>`
                  : "") +
                models
                  .filter((m: string) => !currentValValid || m !== currentVal)
                  .map((m: string) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
                  .join("")
              : '<option value="">N/A</option>';
          const finalVal = currentValValid ? currentVal : models.length > 0 ? models[0] : "";
          modelSelect.value = finalVal;
          modelSelect.setAttribute("data-original", finalVal);
        }
        showToast(`Models refreshed for ${provider} (${models.length} models)`, "success");
      } catch (e) {
        showToast("Failed to refresh models: " + formatApiError(e), "error");
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
      const body: Record<string, any> = {};
      let key = field === "name" ? "name" : `current_${field}`;
      if (field === "plan") {
        // 3-way: empty = omit (use default), "true"/"false" = set value
        if (value === "") {
          // skip: don't send plan, let backend use default
          // The button click should not proceed with empty body
          return;
        }
        key = "plan";
      }
      body[key] = field === "plan" ? value === "true" : value;
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
        showToast("Channel updated", "success");
      } catch (e) {
        showToast("Failed: " + formatApiError(e), "error");
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
}
