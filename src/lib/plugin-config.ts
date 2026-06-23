import { escapeHtml } from "./helpers";
import type { ConfigField } from "./api";

/**
 * Render a single config field (string, secret, boolean, integer, enum, multi_select).
 * Extracted from pages/tools.ts, pages/platforms.ts, pages/providers.ts.
 */
export function renderConfigField(
  field: ConfigField,
  value: any,
  pluginName: string,
  envBadge?: string,
): string {
  const fieldId = `cfg-${escapeHtml(pluginName)}-${escapeHtml(field.key)}`;
  const requiredMark = field.required
    ? '<span style="color:var(--accent-rose);margin-left:0.125rem;">*</span>'
    : "";
  const descHtml = field.description
    ? `<div class="setting-description">${escapeHtml(field.description)}</div>`
    : "";

  let inputHtml: string;

  switch (field.type) {
    case "secret":
      inputHtml = `
        <div class="setting-secret-wrapper">
          <input type="password" id="${fieldId}" class="filter-input setting-input setting-secret-input plugin-config-input"
            value="${escapeHtml(String(value ?? ""))}" data-key="${escapeHtml(field.key)}" style="flex:1;" />
          <button type="button" class="setting-secret-toggle" title="Toggle visibility" data-target="${fieldId}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      `;
      break;
    case "boolean":
      inputHtml = `
        <label class="checkbox-label" style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
          <input type="checkbox" id="${fieldId}" class="plugin-config-input" data-key="${escapeHtml(field.key)}" ${value ? "checked" : ""} />
          <span>${value ? "Enabled" : "Disabled"}</span>
        </label>
      `;
      break;
    case "integer":
      inputHtml = `
        <input type="tel" id="${fieldId}" class="filter-input setting-input plugin-config-input"
          value="${escapeHtml(String(value ?? ""))}" inputmode="numeric" pattern="[0-9.-]*" data-key="${escapeHtml(field.key)}"
          ${field.min !== undefined ? `min="${field.min}"` : ""}
          ${field.max !== undefined ? `max="${field.max}"` : ""}
          style="max-width:120px;" />
      `;
      break;
    case "enum":
      inputHtml = `
        <select id="${fieldId}" class="filter-select setting-input plugin-config-input" data-key="${escapeHtml(field.key)}" style="max-width:240px;">
          <option value="">Select...</option>
          ${(field.allowed_values || [])
            .map(
              (opt) =>
                `<option value="${escapeHtml(opt)}" ${String(value) === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`,
            )
            .join("")}
        </select>
      `;
      break;
    case "multi_select": {
      const selectedValues: string[] = Array.isArray(value) ? value : value ? String(value).split(",") : [];
      inputHtml = `
        <div style="display:flex;flex-wrap:wrap;gap:0.375rem;">
          ${(field.allowed_values || [])
            .map(
              (opt) => `
            <label class="checkbox-label" style="font-size:0.8rem;">
              <input type="checkbox" class="plugin-config-input plugin-multi-select" data-key="${escapeHtml(field.key)}" value="${escapeHtml(opt)}" ${selectedValues.includes(opt) ? "checked" : ""} />
              ${escapeHtml(opt)}
            </label>
          `,
            )
            .join("")}
        </div>
      `;
      break;
    }
    default: // string
      inputHtml = `
        <input type="text" id="${fieldId}" class="filter-input setting-input plugin-config-input"
          value="${escapeHtml(String(value ?? ""))}" data-key="${escapeHtml(field.key)}" style="flex:1;" />
      `;
      break;
  }

  return `
    <div class="setting-row" data-field-key="${escapeHtml(field.key)}">
      <div class="setting-label">
        <div class="setting-name">${escapeHtml(field.label)}${requiredMark}${envBadge ?? ""}</div>
        ${descHtml}
      </div>
      <div class="setting-controls">
        <div class="setting-input-group">${inputHtml}</div>
      </div>
    </div>
  `;
}

/**
 * Options for renderPluginConfig.
 */
export interface RenderPluginConfigOptions {
  /** Config field definitions (schema) */
  schema: ConfigField[] | undefined | null;
  /** Current config values */
  values: Record<string, any>;
  /** Plugin name (for HTML ids and data attributes) */
  pluginName: string;
  /** Resolved environment values for env-badge display */
  resolvedEnv?: Record<string, string>;
  /** Plugin status ("enabled" | "disabled" | "error") for toggle button text */
  status?: string;
  /** Whether the plugin is built-in (hides the Remove button) */
  isBuiltIn?: boolean;
  /** Extra HTML buttons to append in the action bar (e.g. "Refresh Models") */
  extraButtons?: string;
}

/**
 * Render the full plugin config form: field inputs + save/toggle action buttons.
 *
 * NOTE: The caller is responsible for handling the built-in "no config needed"
 * message before calling this function.
 */
export function renderPluginConfig(options: RenderPluginConfigOptions): string {
  const {
    schema,
    values,
    pluginName,
    resolvedEnv = {},
    status = "enabled",
    isBuiltIn = false,
    extraButtons = "",
  } = options;

  if (!schema || schema.length === 0) {
    return `<p class="text-muted" style="font-size:0.85rem;color:var(--text-muted);padding:0.5rem 0;">No config fields declared.</p>`;
  }

  const fieldsHtml = schema
    .map((field) => {
      const envVal = resolvedEnv[field.key];
      const currentVal =
        values[field.key] !== undefined ? values[field.key] : (envVal ?? field.default ?? "");
      const envBadge =
        envVal !== undefined && (values[field.key] === undefined || values[field.key] === "")
          ? '<span class="badge badge-info" style="margin-left:0.375rem;font-size:0.65rem;vertical-align:middle;">env</span>'
          : "";
      return renderConfigField(field, currentVal, pluginName, envBadge);
    })
    .join("");

  return `
    <div class="plugin-config-form" data-plugin="${escapeHtml(pluginName)}">
      ${fieldsHtml}
      <div style="display:flex;gap:0.5rem;margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--glass-border);">
        <button type="button" class="plugin-save-btn btn-primary" style="background:var(--accent-purple);border:none;color:white;border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Save Config</button>
        <button type="button" class="plugin-toggle-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">${status === "enabled" ? "Disable" : "Enable"}</button>
        ${extraButtons}
        ${!isBuiltIn ? `<button type="button" class="plugin-remove-btn" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--accent-rose);">🗑 Remove</button>` : ""}
      </div>
    </div>
  `;
}

/**
 * Render a section listing built-in items (e.g. built-in tools list).
 * Optional — only used by pages that show built-in items.
 */
export function renderBuiltinSection(items: string[], heading?: string): string {
  if (!items || items.length === 0) return "";
  const h = heading ? escapeHtml(heading) : "Built-in";
  return `
    <div class="builtin-section" style="margin-bottom:1rem;">
      <h3 style="font-size:0.9rem;margin-bottom:0.5rem;color:var(--text-muted);">${h}</h3>
      <div style="display:flex;flex-wrap:wrap;gap:0.375rem;">
        ${items
          .map(
            (item) =>
              `<span class="badge badge-neutral" style="font-size:0.8rem;padding:0.25rem 0.5rem;">${escapeHtml(item)}</span>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

/**
 * Collect current form values from a plugin config form, matching save logic.
 */
export function getCurrentConfig(formEl: HTMLElement): Record<string, any> {
  const config: Record<string, any> = {};
  formEl.querySelectorAll(".plugin-config-input:not(.plugin-multi-select)").forEach((input) => {
    const el = input as HTMLInputElement | HTMLSelectElement;
    const key = el.getAttribute("data-key");
    if (!key) return;
    if (el.type === "checkbox") {
      config[key] = el.checked;
    } else if (el.type === "number") {
      config[key] = el.value ? Number(el.value) : null;
    } else {
      config[key] = el.value;
    }
  });
  const multiGroups: Record<string, string[]> = {};
  formEl.querySelectorAll(".plugin-multi-select").forEach((input) => {
    const el = input as HTMLInputElement;
    const key = el.getAttribute("data-key");
    if (!key) return;
    if (!multiGroups[key]) multiGroups[key] = [];
    if (el.checked) multiGroups[key].push(el.value);
  });
  Object.assign(config, multiGroups);
  return config;
}

/**
 * Compare current form values against saved baseline and toggle save button.
 * Uses JSON.stringify comparison.
 */
export function dirtyCheckSaveButton(
  formEl: HTMLElement,
  pluginName: string,
  savedConfigs: Map<string, Record<string, any>>,
): void {
  const current = getCurrentConfig(formEl);
  const saved = savedConfigs.get(pluginName);
  const saveBtn = formEl.querySelector(".plugin-save-btn") as HTMLButtonElement | null;
  if (!saveBtn) return;
  const isDirty = JSON.stringify(current) !== JSON.stringify(saved);
  saveBtn.style.opacity = isDirty ? "1" : "0.4";
  saveBtn.style.pointerEvents = isDirty ? "auto" : "none";
}
