import { apiGet, apiPost, apiDelete, type PluginData, type ConfigField } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";

export function renderProviders(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Providers</h1>
        <p class="page-subtitle">LLM providers — built-in and plugin-based</p>
      </div>
    </div>
    <div id="providers-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading providers...</div>
    </div>
  `;

  void loadProviders();
}

// ── State ──

let pluginsData: PluginData[] = [];
const savedConfigs: Map<string, Record<string, any>> = new Map();

async function loadProviders(): Promise<void> {
  const content = document.getElementById("providers-content")!;
  try {
    const response = await apiGet<any>("/plugins");
    const allPlugins: PluginData[] = response.data || response;
    const providers = allPlugins.filter((p: PluginData) => p.plugin_type === "provider");
    pluginsData = providers;
    content.innerHTML = renderProvidersPage(providers);
    wireProviders();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load providers: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderProvidersPage(providers: PluginData[]): string {
  if (!providers || providers.length === 0) {
    return '<div class="empty-state">No providers found</div>';
  }

  return providers
    .map(
      (p) => `
    <div class="card settings-card" data-plugin-name="${escapeHtml(p.name)}">
      <div class="card-header" style="cursor:pointer;">
        <span class="card-title">
          <span class="plugin-name" style="font-weight:600;">${escapeHtml(p.manifest?.label || p.name)}</span>
          <span class="badge ${getStatusBadgeClass(p.status)}" style="margin-left:0.5rem;">${p.status === "enabled" ? "● Enabled" : p.status === "disabled" ? "● Disabled" : "● Error"}</span>
          ${p.version ? `<span class="badge badge-info" style="margin-left:0.375rem;">v${escapeHtml(p.version)}</span>` : ""}
          <span class="badge badge-neutral" style="margin-left:0.375rem;">source: ${escapeHtml(p.source)}</span>
        </span>
        <span style="display:flex;gap:0.25rem;align-items:center;">
          <button type="button" class="plugin-expand-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0.25rem;font-size:1rem;" title="Toggle config">▶</button>
        </span>
      </div>
      <div class="card-body plugin-body" style="display:none;">
        ${renderPluginConfig(p)}
      </div>
    </div>
  `,
    )
    .join("");
}

function renderPluginConfig(p: PluginData): string {
  if (p.source === "built-in") {
    return `<p class="text-muted" style="font-size:0.85rem;color:var(--text-muted);padding:0.5rem 0;">Built-in provider, no configuration needed.</p>`;
  }

  const schema = p.manifest?.config_schema;
  if (!schema || schema.length === 0) {
    return `<p class="text-muted" style="font-size:0.85rem;color:var(--text-muted);padding:0.5rem 0;">No config fields declared.</p>`;
  }

  const config = p.config || {};

  const fieldsHtml = schema
    .map((field) => {
      const envVal = p.resolved_env?.[field.key];
      const currentVal =
        config[field.key] !== undefined ? config[field.key] : (envVal ?? field.default ?? "");
      const envBadge =
        envVal !== undefined && (config[field.key] === undefined || config[field.key] === "")
          ? '<span class="badge badge-info" style="margin-left:0.375rem;font-size:0.65rem;vertical-align:middle;">env</span>'
          : "";
      return renderConfigField(field, currentVal, p.name, envBadge);
    })
    .join("");

  return `
    <div class="plugin-config-form" data-plugin="${escapeHtml(p.name)}">
      ${fieldsHtml}
      <div style="display:flex;gap:0.5rem;margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--glass-border);">
        <button type="button" class="plugin-save-btn btn-primary" style="background:var(--accent-purple);border:none;color:white;border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Save Config</button>
        <button type="button" class="plugin-toggle-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">${p.status === "enabled" ? "Disable" : "Enable"}</button>
        ${p.source !== "built-in" ? `<button type="button" class="plugin-remove-btn" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--accent-rose);">🗑 Remove</button>` : ""}
      </div>
    </div>
  `;
}

function renderConfigField(field: ConfigField, value: any, pluginName: string, envBadge?: string): string {
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
        <input type="number" id="${fieldId}" class="filter-input setting-input plugin-config-input"
          value="${escapeHtml(String(value ?? ""))}" data-key="${escapeHtml(field.key)}"
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
      <div class="setting-controls">
        <div class="setting-name">${escapeHtml(field.label)}${requiredMark}${envBadge ?? ""}</div>
        <div class="setting-input-group">${inputHtml}</div>
      </div>
      ${descHtml}
    </div>
  `;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "enabled":
      return "badge-success";
    case "disabled":
      return "badge-neutral";
    case "error":
      return "badge-error";
    default:
      return "badge-neutral";
  }
}

function wireProviders(): void {
  // Expand/collapse cards
  document.querySelectorAll(".plugin-expand-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const body = card?.querySelector(".plugin-body") as HTMLElement;
      if (body) {
        const isVisible = body.style.display !== "none";
        body.style.display = isVisible ? "none" : "block";
        btn.innerHTML = isVisible ? "▶" : "▼";
      }
    });
  });

  // Card header click also toggles
  document.querySelectorAll(".card-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const btn = header.querySelector(".plugin-expand-btn") as HTMLElement;
      if (btn) btn.click();
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
    savedConfigs.set(pluginName, getCurrentConfig(formEl));
    formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
      input.addEventListener("input", () => dirtyCheckSaveButton(formEl, pluginName));
      input.addEventListener("change", () => dirtyCheckSaveButton(formEl, pluginName));
    });
    dirtyCheckSaveButton(formEl, pluginName);
  });

  // Enhance native select elements to styled custom dropdowns
  document.querySelectorAll(".plugin-config-form select.plugin-config-input[data-key]").forEach((el) => {
    enhanceSelectElement(el as HTMLSelectElement);
  });

  // Save buttons
  document.querySelectorAll(".plugin-save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      if (!pluginName) return;
      const formEl = card.querySelector(".plugin-config-form") as HTMLElement;
      if (!formEl) return;

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

      try {
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/config`, { config });
        savedConfigs.set(pluginName, { ...config });
        dirtyCheckSaveButton(formEl, pluginName);
        (window as any).showToast?.("Configuration saved", "success");
      } catch (e) {
        (window as any).showToast?.(
          "Failed to save: " + (e instanceof Error ? e.message : "Unknown"),
          "error",
        );
      }
    });
  });

  // Toggle enable/disable buttons
  document.querySelectorAll(".plugin-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      if (!pluginName) return;
      const isCurrentlyEnabled = btn.textContent === "Disable";
      const action = isCurrentlyEnabled ? "disable" : "enable";

      try {
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/${action}`, {});
        (window as any).showToast?.(isCurrentlyEnabled ? "Disabled" : "Enabled", "success");
        void loadProviders();
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Remove buttons
  document.querySelectorAll(".plugin-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      if (!pluginName) return;
      if (!confirm(`Remove plugin "${pluginName}"?`)) return;

      try {
        await apiDelete(`/plugins/${encodeURIComponent(pluginName)}`);
        (window as any).showToast?.("Plugin removed", "success");
        void loadProviders();
      } catch (e) {
        (window as any).showToast?.(
          "Failed to remove: " + (e instanceof Error ? e.message : "Unknown"),
          "error",
        );
      }
    });
  });
}

// ── Helpers ──

/** Collect current form values from a plugin config form, matching save logic. */
function getCurrentConfig(formEl: HTMLElement): Record<string, any> {
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

/** Gray out save button when config matches saved baseline. */
function dirtyCheckSaveButton(formEl: HTMLElement, pluginName: string): void {
  const current = getCurrentConfig(formEl);
  const saved = savedConfigs.get(pluginName);
  const saveBtn = formEl.querySelector(".plugin-save-btn") as HTMLButtonElement | null;
  if (!saveBtn) return;
  const isDirty = JSON.stringify(current) !== JSON.stringify(saved);
  saveBtn.style.opacity = isDirty ? "1" : "0.4";
  saveBtn.style.pointerEvents = isDirty ? "auto" : "none";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
