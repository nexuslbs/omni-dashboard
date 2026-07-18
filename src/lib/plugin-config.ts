import { escapeHtml } from "./helpers";
import { apiGet } from "./api";
import { enhanceSelectElement } from "./dropdown";
import { copyButtonHTML, toggleButtonHTML } from "./secret-buttons";
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

  /**
   * Strip $secret: or $env: prefix for display, keeping the full value intact.
   */
  function displayLabel(value: string): string {
    return value.startsWith("$secret:") || value.startsWith("$env:")
      ? value.substring(value.indexOf(":") + 1)
      : value;
  }

  /**
   * If the current value doesn't match any option in allowed_values,
   * return a visible selected option showing the secret/env name (without the $secret:/$env: prefix).
   */
  function fallbackOption(value: string, allowed: string[] | undefined): string {
    if (!value || (allowed || []).includes(value)) return "";
    return `<option value="${escapeHtml(value)}" selected>${escapeHtml(displayLabel(value))}</option>`;
  }

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
            ${copyButtonHTML(fieldId)}
            ${toggleButtonHTML(fieldId)}
            <button type="button" class="ref-toggle-btn" data-key="${escapeHtml(field.key)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.8rem;padding:0.375rem 0.5rem;color:var(--text-secondary);flex-shrink:0;">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
          </div>
          <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
            <select class="ref-type-select filter-select setting-input" data-key="${escapeHtml(field.key)}">
              <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
              <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
            </select>
            <input type="text" class="ref-name-input ref-name-text filter-input" data-key="${escapeHtml(field.key)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:0;display:${isRef && refType === "env" ? "block" : "none"};" />
            <select class="ref-name-input ref-name-select filter-select setting-input" data-key="${escapeHtml(field.key)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
              <option value="">Select secret...</option>
              ${isRef && refType === "secret" && refName ? `<option value="${escapeHtml(refName)}" selected>${escapeHtml(refName)}</option>` : ""}
            </select>
            ${copyButtonHTML(fieldId)}
          </div>
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
    case "integer": {
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
            <input type="tel" id="${fieldId}" class="filter-input setting-input ref-literal-input"
              value="${escapeHtml(literalVal)}" inputmode="numeric" pattern="-?[0-9]*[.]?[0-9]*" data-key="${escapeHtml(field.key)}"
              ${field.min !== undefined ? `min="${field.min}"` : ""}
              ${field.max !== undefined ? `max="${field.max}"` : ""}
              style="flex:1;max-width:120px;" />
            ${copyButtonHTML(fieldId)}
            <button type="button" class="ref-toggle-btn" data-key="${escapeHtml(field.key)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.8rem;padding:0.375rem 0.5rem;color:var(--text-secondary);flex-shrink:0;">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
          </div>
          <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
            <select class="ref-type-select filter-select setting-input" data-key="${escapeHtml(field.key)}">
              <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
              <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
            </select>
            <input type="text" class="ref-name-input ref-name-text filter-input" data-key="${escapeHtml(field.key)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:0;display:${isRef && refType === "env" ? "block" : "none"};" />
            <select class="ref-name-input ref-name-select filter-select setting-input" data-key="${escapeHtml(field.key)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
              <option value="">Select secret...</option>
              ${isRef && refType === "secret" && refName ? `<option value="${escapeHtml(refName)}" selected>${escapeHtml(refName)}</option>` : ""}
            </select>
            ${copyButtonHTML(fieldId)}
          </div>
        </div>
      `;
      break;
    }
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
          ${fallbackOption(String(value ?? ""), field.allowed_values)}
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
    case "provider":
    case "tool":
    case "platform": {
      const options = (field.allowed_values || []).map(
        (opt: string) =>
          `<option value="${escapeHtml(opt)}" ${String(value) === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`,
      );
      inputHtml = `
        <select id="${fieldId}" class="plugin-config-input filter-input" data-key="${escapeHtml(field.key)}" data-depends-on="${escapeHtml(field.depends_on || "")}">
          <option value="">N/A</option>
          ${fallbackOption(String(value ?? ""), field.allowed_values)}
          ${options.join("")}
        </select>`;
      break;
    }
    case "model": {
      const options = (field.allowed_values || []).map(
        (opt: string) =>
          `<option value="${escapeHtml(opt)}" ${String(value) === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`,
      );
      inputHtml = `
        <div style="display:flex;gap:0.25rem;align-items:center;flex:1;">
          <select id="${fieldId}" class="plugin-config-input filter-input" data-key="${escapeHtml(field.key)}" data-depends-on="${escapeHtml(field.depends_on || "")}" style="flex:1;">
            <option value="">N/A</option>
            ${fallbackOption(String(value ?? ""), field.allowed_values)}
            ${options.join("")}
          </select>
          <button type="button" class="plugin-refresh-models-btn" title="Refresh models" data-plugin-config="true" data-key="${escapeHtml(field.key)}" data-depends-on="${escapeHtml(field.depends_on || "")}" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.85rem;color:#22d3ee;white-space:nowrap;line-height:1;">⟳</button>
        </div>`;
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
          <div class="ref-literal-mode" style="display:${isRef ? "none" : "flex"};flex:1;gap:0.25rem;align-items:center;">
            <input type="text" id="${fieldId}" class="filter-input setting-input ref-literal-input"
              value="${escapeHtml(literalVal)}" data-key="${escapeHtml(field.key)}" placeholder="Literal value..."
              style="flex:1;" />
            ${copyButtonHTML(fieldId)}
            <button type="button" class="ref-toggle-btn" data-key="${escapeHtml(field.key)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.8rem;padding:0.375rem 0.5rem;color:var(--text-secondary);flex-shrink:0;">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
          </div>
          <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
            <select class="ref-type-select filter-select setting-input" data-key="${escapeHtml(field.key)}">
              <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
              <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
            </select>
            <input type="text" class="ref-name-input ref-name-text filter-input" data-key="${escapeHtml(field.key)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:0;display:${isRef && refType === "env" ? "block" : "none"};" />
            <select class="ref-name-input ref-name-select filter-select setting-input" data-key="${escapeHtml(field.key)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
              <option value="">Select secret...</option>
              ${isRef && refType === "secret" && refName ? `<option value="${escapeHtml(refName)}" selected>${escapeHtml(refName)}</option>` : ""}
            </select>
            ${copyButtonHTML(fieldId)}
          </div>
        </div>
      `;
      break;
    }
  }

  return `
    <div class="setting-row" data-field-key="${escapeHtml(field.key)}">
      <div class="setting-label">
        <div class="setting-name">${escapeHtml(field.label)}${requiredMark}${envBadge ?? ""}</div>
        <div class="setting-key-name" style="font-size:0.7rem;color:var(--text-muted);margin-top:0.125rem;">${escapeHtml(field.key)}</div>
        ${descHtml}
        ${field.default !== undefined && field.default !== null && field.default !== "" ? `<div class="setting-default" style="font-size:0.7rem;color:var(--text-muted);margin-top:0.125rem;">Default: <code style="background:rgba(255,255,255,0.05);padding:0.0625rem 0.25rem;border-radius:2px;">${escapeHtml(String(field.default))}</code></div>` : ""}
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
      const currentVal = isFromEnv ? envVal : values[field.key] !== undefined ? values[field.key] : "";
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
        <button type="button" class="plugin-discard-btn" style="display:none;background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">Discard</button>
        <button type="button" class="plugin-toggle-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">${status === "enabled" ? "Disable" : "Enable"}</button>
        ${extraButtons}
      </div>
    </div>
  `;
}

/**
 * Render a section listing built-in items (e.g. built-in tools list).
 * Optional: only used by pages that show built-in items.
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
        // Preserve current ref values from hidden input when available
        const hv = hiddenInput.value;
        const currentSecret = hv.startsWith("$secret:") ? hv.substring(8) : "";
        const currentEnv = hv.startsWith("$env:") ? hv.substring(5) : "";
        if (nameText) {
          nameText.style.display = isSecretMode ? "none" : "block";
          nameText.value = !isSecretMode && currentEnv ? currentEnv : "";
        }
        if (nameSelect) {
          nameSelect.value = currentSecret || "";
          // Don't toggle native select: enhanceSelectElement hides it permanently.
          // Toggle the enhanced wrapper instead.
          const wrapper = nameSelect.nextElementSibling as HTMLElement | null;
          const isEnhanced = wrapper && wrapper.classList.contains("custom-select");
          if (isEnhanced) {
            const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement | null;
            if (textEl) textEl.textContent = currentSecret || "Select secret...";
            wrapper.style.display = isSecretMode ? "block" : "none";
          } else {
            nameSelect.style.display = isSecretMode ? "block" : "none";
          }
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

  // Update hidden input when ref type changes: also toggle input/select visibility
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
        // Don't toggle native select: enhanceSelectElement hides it permanently.
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
      const secrets: any[] = Array.isArray(response) ? response : response?.data || [];
      const secretNames = secrets.map((s: any) => s.name);
      document.querySelectorAll(".ref-name-select").forEach((sel) => {
        const select = sel as HTMLSelectElement;
        // Read current secret name from the hidden input, not from select.value
        const container = select.closest(".ref-toggle-container");
        let secretName = "";
        if (container) {
          const hiddenInput = container.querySelector(
            '.plugin-config-input[type="hidden"]',
          ) as HTMLInputElement | null;
          if (hiddenInput) {
            const hv = hiddenInput.value;
            secretName = hv.startsWith("$secret:") ? hv.substring(8) : "";
          }
        }
        // Keep the first option (empty placeholder)
        select.innerHTML = '<option value="">Select secret...</option>';
        for (const name of secretNames) {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          if (name === secretName) opt.selected = true;
          select.appendChild(opt);
        }
        // Sync enhanced select display after populating options
        if (container) {
          // Use nextElementSibling to get the specific enhanced wrapper for THIS select,
          // NOT container.querySelector which picks the FIRST custom-select (ref-type's wrapper).
          const enhancedSelect = select.nextElementSibling as HTMLElement | null;
          if (enhancedSelect && enhancedSelect.classList.contains("custom-select")) {
            const textEl = enhancedSelect.querySelector(".select-trigger-text") as HTMLElement | null;
            if (textEl) textEl.textContent = secretName || "Select secret...";
          }
        }
      });
    } catch {
      // Secrets not available: leave selects with placeholder only
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
  // ── Provider→Model auto-populate ──
  // When a provider-type select changes, find any model-type select that depends_on
  // this provider's key and populate it with models from the selected provider.
  document.querySelectorAll(".plugin-config-input[data-key]").forEach((el) => {
    el.addEventListener("change", async () => {
      const select = el as HTMLSelectElement;
      const providerKey = select.getAttribute("data-key");
      if (!providerKey) return;
      const providerName = select.value;
      // Find model selects that depend on this provider key
      const modelSelects = document.querySelectorAll<HTMLSelectElement>(
        `.plugin-config-input[data-depends-on="${providerKey}"]`,
      );
      if (modelSelects.length === 0) return;
      // Fetch models for the selected provider
      let models: string[] = [];
      if (providerName) {
        try {
          const resp = await apiGet<any>(`/plugins/${encodeURIComponent(providerName)}`);
          const detail = resp && resp.data ? resp.data : resp;
          const schema = [
            ...((detail.configSchema || []) as any[]),
            ...((detail.manifest?.config_schema || []) as any[]),
          ];
          const modelField = schema.find((f: any) => f.key === "default_model");
          if (modelField?.allowed_values?.length) {
            models = modelField.allowed_values as string[];
          } else if (modelField?.default) {
            models = [modelField.default as string];
          }
        } catch {
          // Provider not found or not responding — leave models empty
        }
      }
      // Update all dependent model selects
      for (const ms of modelSelects) {
        const currentVal = ms.value;
        ms.innerHTML = '<option value="">N/A</option>';
        for (const m of models) {
          const opt = document.createElement("option");
          opt.value = m;
          opt.textContent = m;
          if (m === currentVal) opt.selected = true;
          ms.appendChild(opt);
        }
        // Sync enhanced display
        const wrapper = ms.nextElementSibling as HTMLElement | null;
        if (wrapper && wrapper.classList.contains("custom-select")) {
          const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement | null;
          if (textEl) textEl.textContent = ms.options[ms.selectedIndex]?.label || "N/A";
        }
        ms.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });
  // ── Initial provider→model sync ──
  // For each provider→model pair that already has a provider selected, populate
  // the model select immediately. Runs after all change handlers are registered.
  document.querySelectorAll<HTMLSelectElement>(".plugin-config-input[data-depends-on]").forEach((ms) => {
    const dependsOn = ms.getAttribute("data-depends-on");
    if (!dependsOn) return;
    const providerSelect = document.querySelector<HTMLSelectElement>(
      `.plugin-config-input[data-key="${dependsOn}"]`,
    );
    if (providerSelect && providerSelect.value) {
      // Trigger the same populate flow
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
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
