import { escapeHtml } from "./helpers";
import { apiGet } from "./api";
import { enhanceSelectElement } from "./dropdown";
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
    case "secret": {
      const strVal = String(value ?? "");
      const isSecretRef = strVal.startsWith("$secret:");
      const isEnvRef = strVal.startsWith("$env:");
      const isRef = isSecretRef || isEnvRef;
      const refType = isEnvRef ? "env" : "secret";
      const refName = isRef ? strVal.substring(strVal.indexOf(":") + 1) : "";
      const literalVal = isRef ? "" : strVal;
      inputHtml = `
        <div class="ref-toggle-container" style="display:flex;gap:0.25rem;align-items:center;flex:1;">
          <input type="hidden" class="plugin-config-input" data-key="${escapeHtml(field.key)}" value="${escapeHtml(strVal)}" />
          <div class="ref-literal-mode" style="display:${isRef ? "none" : "flex"};flex:1;gap:0.25rem;align-items:center;">
            <input type="password" id="${fieldId}" class="filter-input setting-input setting-secret-input ref-literal-input"
              value="${escapeHtml(literalVal)}" data-key="${escapeHtml(field.key)}" style="flex:1;" />
            <button type="button" class="setting-secret-copy" title="Copy to clipboard" data-target="${fieldId}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            <button type="button" class="setting-secret-toggle" title="Toggle visibility" data-target="${fieldId}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
            <select class="ref-type-select filter-select setting-input" data-key="${escapeHtml(field.key)}">
              <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
              <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
            </select>
            <input type="text" class="ref-name-input ref-name-text filter-input" data-key="${escapeHtml(field.key)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:200px;display:${isRef && refType === "env" ? "block" : "none"};" />
            <select class="ref-name-input ref-name-select filter-select setting-input" data-key="${escapeHtml(field.key)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
              <option value="">Select secret...</option>
            </select>
          </div>
          <button type="button" class="ref-toggle-btn" data-key="${escapeHtml(field.key)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.875rem;padding:0.25rem 0.375rem;color:var(--text-secondary);">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
        </div>
      `;
      break;
    }
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
    case "enum": {
      const hasDefault = field.default !== undefined && field.default !== null && field.default !== "";
      const showDefault = !value && hasDefault;
      inputHtml = `
        <select id="${fieldId}" class="filter-select setting-input plugin-config-input" data-key="${escapeHtml(field.key)}" style="max-width:240px;">
          ${
            showDefault
              ? `<option value="" selected>- (Default: ${escapeHtml(String(field.default))}) -</option>`
              : `<option value="">Select...</option>`
          }
          ${(field.allowed_values || [])
            .map(
              (opt) =>
                `<option value="${escapeHtml(opt)}" ${String(value) === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`,
            )
            .join("")}
        </select>
      `;
      break;
    }
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
    default: {
      // string
      const strVal = String(value ?? "");
      const isSecretRef = strVal.startsWith("$secret:");
      const isEnvRef = strVal.startsWith("$env:");
      const isRef = isSecretRef || isEnvRef;
      const refType = isEnvRef ? "env" : "secret";
      const refName = isRef ? strVal.substring(strVal.indexOf(":") + 1) : "";
      const literalVal = isRef ? "" : strVal;
      inputHtml = `
        <div class="ref-toggle-container" style="display:flex;gap:0.25rem;align-items:center;flex:1;">
          <input type="hidden" class="plugin-config-input" data-key="${escapeHtml(field.key)}" value="${escapeHtml(strVal)}" />
          <input type="text" id="${fieldId}" class="filter-input setting-input ref-literal-input"
            value="${escapeHtml(literalVal)}" data-key="${escapeHtml(field.key)}" placeholder="Literal value..."
            style="flex:1;display:${isRef ? "none" : "block"};" />
          <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
            <select class="ref-type-select filter-select setting-input" data-key="${escapeHtml(field.key)}">
              <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
              <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
            </select>
            <input type="text" class="ref-name-input ref-name-text filter-input" data-key="${escapeHtml(field.key)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:200px;display:${isRef && refType === "env" ? "block" : "none"};" />
            <select class="ref-name-input ref-name-select filter-select setting-input" data-key="${escapeHtml(field.key)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
              <option value="">Select secret...</option>
            </select>
          </div>
          <button type="button" class="ref-toggle-btn" data-key="${escapeHtml(field.key)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.875rem;padding:0.25rem 0.375rem;color:var(--text-secondary);">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
        </div>
      `;
      break;
    }
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
  const { schema, values, pluginName, resolvedEnv = {}, status = "enabled", extraButtons = "" } = options;

  if (!schema || schema.length === 0) {
    return `<p class="text-muted" style="font-size:0.85rem;color:var(--text-muted);padding:0.5rem 0;">No config fields declared.</p>`;
  }

  const fieldsHtml = schema
    .map((field) => {
      const envVal = resolvedEnv[field.key];
      const isFromEnv = envVal !== undefined && (values[field.key] === undefined || values[field.key] === "");
      const currentVal = isFromEnv
        ? envVal
        : values[field.key] !== undefined
          ? values[field.key]
          : (field.default ?? "");
      const envBadge = isFromEnv
        ? '<span class="badge badge-info" style="margin-left:0.375rem;font-size:0.65rem;vertical-align:middle;">env</span>'
        : "";

      // When the field value comes from an environment variable (not user-configured),
      // render ref-mode controls so the user can see and edit the env var name.
      if (isFromEnv) {
        return renderConfigField(field, `$env:${escapeHtml(field.key)}`, pluginName, envBadge);
      }

      return renderConfigField(field, currentVal, pluginName, envBadge);
    })
    .join("");

  return `
    <div class="plugin-config-form" data-plugin="${escapeHtml(pluginName)}">
      ${fieldsHtml}
      <div style="display:flex;gap:0.5rem;margin-top:1rem;padding-top:0.75rem;">
        <button type="button" class="plugin-save-btn btn-primary" style="background:var(--accent-purple);border:none;color:white;border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Save Config</button>
        <button type="button" class="plugin-toggle-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">${status === "enabled" ? "Disable" : "Enable"}</button>
        ${extraButtons}
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

/**
 * Wire up ref toggle buttons and inputs for $secret:/$env: reference mode.
 * Call this after rendering config forms (e.g. in wirePlatforms, wireTools, wireProviders).
 */
export function wireRefToggles(): void {
  // Toggle between literal mode and ref mode
  document.querySelectorAll(".ref-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const container = (btn as HTMLElement).closest(".ref-toggle-container") as HTMLElement;
      if (!container) return;

      const hiddenInput = container.querySelector(".plugin-config-input") as HTMLInputElement;
      const literalInput = container.querySelector(".ref-literal-input") as HTMLInputElement;
      const literalMode = container.querySelector(".ref-literal-mode") as HTMLElement;
      const refControls = container.querySelector(".ref-mode-controls") as HTMLElement;

      const isRefMode = refControls.style.display !== "none";

      if (isRefMode) {
        // Switch to literal mode
        if (literalMode) {
          literalMode.style.display = "flex";
        }
        if (literalInput) {
          literalInput.style.display = "block";
        }
        refControls.style.display = "none";
        hiddenInput.value = literalInput ? literalInput.value : "";
        btn.textContent = "\uD83D\uDD17";
        btn.setAttribute("title", "Use secret/env ref");
      } else {
        // Switch to ref mode
        if (literalMode) {
          literalMode.style.display = "none";
        }
        if (literalInput) {
          literalInput.style.display = "none";
        }
        refControls.style.display = "flex";
        const select = refControls.querySelector(".ref-type-select") as HTMLSelectElement;
        const nameText = refControls.querySelector(".ref-name-text") as HTMLInputElement;
        const nameSelect = refControls.querySelector(".ref-name-select") as HTMLSelectElement;
        const prefix = select.value === "secret" ? "$secret:" : "$env:";
        // Show the appropriate input based on ref type
        const isSecretMode = select.value === "secret";
        if (nameText) {
          nameText.style.display = isSecretMode ? "none" : "block";
          nameText.value = "";
        }
        if (nameSelect) {
          // Don't toggle native select — enhanceSelectElement hides it permanently.
          // Toggle the enhanced wrapper instead.
          const wrapper = nameSelect.nextElementSibling as HTMLElement | null;
          const isEnhanced = wrapper && wrapper.classList.contains("custom-select");
          if (isEnhanced) {
            wrapper.style.display = isSecretMode ? "block" : "none";
          } else {
            nameSelect.style.display = isSecretMode ? "block" : "none";
          }
          nameSelect.value = "";
        }
        const activeInput = isSecretMode ? nameSelect : nameText;
        hiddenInput.value = prefix + (activeInput ? activeInput.value : "");
        btn.textContent = "\u270F\uFE0F";
        btn.setAttribute("title", "Use literal value");
      }

      // Notify for dirty checking
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // Update hidden input when ref type changes — also toggle input/select visibility
  document.querySelectorAll(".ref-type-select").forEach((el) => {
    el.addEventListener("change", (e) => {
      updateHiddenFromRef(e);
      // Toggle visibility between text input and secret select
      const container = (el as HTMLElement).closest(".ref-mode-controls") as HTMLElement;
      if (!container) return;
      const isSecret = (el as HTMLSelectElement).value === "secret";
      const nameText = container.querySelector(".ref-name-text") as HTMLElement;
      const nameSelect = container.querySelector(".ref-name-select") as HTMLElement;
      if (nameText) nameText.style.display = isSecret ? "none" : "block";
      if (nameSelect) {
        // Don't toggle native select — enhanceSelectElement hides it permanently.
        // Toggle the enhanced wrapper instead.
        const wrapper = nameSelect.nextElementSibling as HTMLElement | null;
        const isEnhanced = wrapper && wrapper.classList.contains("custom-select");
        if (isEnhanced) {
          wrapper.style.display = isSecret ? "block" : "none";
        } else {
          nameSelect.style.display = isSecret ? "block" : "none";
        }
      }
    });
  });

  // Update hidden input when env var name changes
  document.querySelectorAll(".ref-name-text").forEach((el) => {
    el.addEventListener("input", (e) => updateHiddenFromRef(e));
  });

  // Update hidden input when secret name is selected
  document.querySelectorAll(".ref-name-select").forEach((el) => {
    el.addEventListener("change", (e) => updateHiddenFromRef(e));
  });

  // Fetch secrets and populate all secret selects
  void (async () => {
    try {
      const response = await apiGet<any>("/secrets");
      const secrets: any[] = response.data || [];
      const secretNames = secrets.map((s: any) => s.name);
      document.querySelectorAll(".ref-name-select").forEach((sel) => {
        const select = sel as HTMLSelectElement;
        const currentVal = select.value;
        // Keep the first option (empty placeholder)
        select.innerHTML = '<option value="">Select secret...</option>';
        for (const name of secretNames) {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          if (name === currentVal) opt.selected = true;
          select.appendChild(opt);
        }
      });
    } catch {
      // Secrets not available — leave selects with placeholder only
    }
  })();

  // Sync literal input to hidden input
  document.querySelectorAll(".ref-literal-input").forEach((el) => {
    el.addEventListener("input", () => {
      const input = el as HTMLInputElement;
      const container = input.closest(".ref-toggle-container") as HTMLElement;
      if (!container) return;
      const hiddenInput = container.querySelector(".plugin-config-input") as HTMLInputElement;
      if (hiddenInput) {
        hiddenInput.value = input.value;
        // Notify for dirty checking
        hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });

  // Enhance native selects in ref-mode-controls to custom dropdowns
  document.querySelectorAll(".ref-type-select, .ref-name-select").forEach((el) => {
    if (el.tagName === "SELECT") {
      const select = el as HTMLSelectElement;
      // Save intended visibility before enhance hides the native select
      const wasVisible = select.style.display !== "none";
      enhanceSelectElement(select);
      // Sync wrapper visibility to match the intended state
      const wrapper = select.nextElementSibling as HTMLElement | null;
      if (wrapper && wrapper.classList.contains("custom-select")) {
        wrapper.style.display = wasVisible ? "block" : "none";
      }
    }
  });
}

function updateHiddenFromRef(e: Event): void {
  const el = e.target as HTMLElement;
  const container = el.closest(".ref-toggle-container") as HTMLElement;
  if (!container) return;
  const hiddenInput = container.querySelector(".plugin-config-input") as HTMLInputElement;
  const select = container.querySelector(".ref-type-select") as HTMLSelectElement;
  const isSecret = select ? select.value === "secret" : false;
  const nameInput = isSecret
    ? (container.querySelector(".ref-name-select") as HTMLSelectElement)
    : (container.querySelector(".ref-name-text") as HTMLInputElement);
  const prefix = select ? (select.value === "secret" ? "$secret:" : "$env:") : "";
  if (hiddenInput) {
    hiddenInput.value = prefix + (nameInput ? nameInput.value : "");
    hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
    hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
