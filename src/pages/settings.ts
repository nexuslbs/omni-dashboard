import { showToast } from "../lib/utils";
import { apiGet, apiPut, type SettingCategory } from "../lib/api";
import { enhanceSelect, enhanceSelectElement, syncSelectDisplay } from "../lib/dropdown";
import { escapeHtml, formatApiError } from "../lib/helpers";
import { copyButtonHTML, toggleButtonHTML } from "../lib/secret-buttons";

export function renderSettings(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">System configuration and environment variables</p>
      </div>
    </div>
    <div id="settings-content"><div class="loading" style="padding:3rem;text-align:center;">Loading settings...</div></div>
  `;
  void loadSettings();
}

// ── State ──

interface ChangedValue {
  newValue: string;
  originalValue: string;
}
const changedValues = new Map<string, ChangedValue>();

// ── Main Loader ──

async function loadSettings(): Promise<void> {
  const content = document.getElementById("settings-content")!;
  try {
    const data = await apiGet<{ categories: SettingCategory[] }>("/settings");
    changedValues.clear();

    content.innerHTML = renderSettingsPage(data.categories);
    wireSettings();
    // Enhance setting selects (boolean, select types)
    document.querySelectorAll(".setting-input[data-name]").forEach((el) => {
      if (el.tagName === "SELECT") {
        enhanceSelect(el.id);
      }
    });
    // Enhance secret name selects by element reference (they have no id)
    document.querySelectorAll(".ref-name-select").forEach((el) => {
      if (el.tagName === "SELECT") {
        const select = el as HTMLSelectElement;
        const wasVisible = select.style.display !== "none";
        enhanceSelectElement(select);
        const wrapper = select.nextElementSibling as HTMLElement | null;
        if (wrapper && wrapper.classList.contains("custom-select")) {
          wrapper.style.display = wasVisible ? "block" : "none";
        }
      }
    });
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load settings: ${formatApiError(e)}</div>`;
  }
}

// ── Render ──

function renderSettingsPage(categories: SettingCategory[]): string {
  if (!categories || categories.length === 0) {
    return '<div class="empty-state">No settings available</div>';
  }

  // Put "general" first, then sort the rest alphabetically by name
  const sorted = [...categories].sort((a, b) => {
    if (a.name === "general") return -1;
    if (b.name === "general") return 1;
    return a.name.localeCompare(b.name);
  });

  return sorted
    .map(
      (cat) => `
    <div class="card settings-card" data-category="${escapeHtml(cat.name)}">
      <div class="card-header"><span class="card-title">${escapeHtml(cat.label)}</span></div>
      <div class="card-body settings-card-body">
        ${cat.settings.map((s) => renderSettingRow(s)).join("")}
      </div>
    </div>
  `,
    )
    .join("");
}

function renderSettingRow(setting: SettingCategory["settings"][0]): string {
  const meta = setting.metadata;
  const name = setting.name;
  const value = setting.value;
  const desc = meta.description || "";
  const isReadonly = meta.readonly;
  const inputId = `setting-${escapeHtml(name)}`;
  const safeName = CSS.escape(name);

  // Strip $secret: or $env: prefix for display, keeping full value intact
  function displayLabel(v: string): string {
    return v.startsWith("$secret:") || v.startsWith("$env:") ? v.substring(v.indexOf(":") + 1) : v;
  }

  let inputHtml: string;

  if (isReadonly) {
    inputHtml = `
      <div class="setting-readonly-value">
        <code class="setting-readonly-code">${escapeHtml(value)}</code>
        <svg class="setting-lock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
    `;
  } else {
    switch (meta.type) {
      case "number": {
        const strVal = String(value ?? "");
        const isSecretRef = strVal.startsWith("$secret:");
        const isEnvRef = strVal.startsWith("$env:");
        const isRef = isSecretRef || isEnvRef;
        const refType = isEnvRef ? "env" : "secret";
        const refName = isRef ? strVal.substring(strVal.indexOf(":") + 1) : "";
        const literalVal = isRef ? "" : strVal;
        inputHtml = `
          <div class="ref-toggle-container" style="display:flex;gap:0.25rem;align-items:center;flex:1;">
            <input type="hidden" class="setting-input" data-name="${escapeHtml(name)}" data-original="${escapeHtml(strVal)}" value="${escapeHtml(strVal)}" />
            <div class="ref-literal-mode" style="display:${isRef ? "none" : "flex"};flex:1;gap:0.25rem;align-items:center;">
              <input type="tel" id="${inputId}" class="filter-input setting-input ref-literal-input"
                value="${escapeHtml(literalVal)}" inputmode="numeric" pattern="[0-9.]*"
                data-name="${escapeHtml(name)}" data-original="${escapeHtml(literalVal)}" style="flex:1;" />
              ${copyButtonHTML(inputId)}
            </div>
            <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
              <select class="ref-type-select filter-select setting-input" data-name="${escapeHtml(name)}">
                <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
                <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
              </select>
              <input type="text" class="ref-name-input ref-name-text filter-input" data-name="${escapeHtml(name)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:0;display:${isRef && refType === "env" ? "block" : "none"};" />
              <select class="ref-name-input ref-name-select filter-select setting-input" data-name="${escapeHtml(name)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
                <option value="">Select secret...</option>
                ${isRef && refType === "secret" && refName ? `<option value="${escapeHtml(refName)}" selected>${escapeHtml(refName)}</option>` : ""}
              </select>
              ${copyButtonHTML(inputId)}
            </div>
            <button type="button" class="ref-toggle-btn" data-name="${escapeHtml(name)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.8rem;padding:0.375rem 0.5rem;color:var(--text-secondary);">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
          </div>
        `;
        break;
      }
      case "boolean":
        inputHtml = `
          <select id="${inputId}" class="filter-select setting-input"
            data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}">
            <option value="true"${value === "true" ? " selected" : ""}>Enabled</option>
            <option value="false"${value === "false" ? " selected" : ""}>Disabled</option>
          </select>
        `;
        break;
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
            <input type="hidden" class="setting-input" data-name="${escapeHtml(name)}" data-original="${escapeHtml(strVal)}" value="${escapeHtml(strVal)}" />
            <div class="ref-literal-mode" style="display:${isRef ? "none" : "flex"};flex:1;gap:0.25rem;align-items:center;">
              <input type="password" id="${inputId}" class="filter-input setting-input setting-secret-input ref-literal-input"
                value="${escapeHtml(literalVal)}"
                data-name="${escapeHtml(name)}" data-original="${escapeHtml(literalVal)}" style="flex:1;" />
              ${copyButtonHTML(inputId)}
              ${toggleButtonHTML(inputId)}
            </div>
            <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
              <select class="ref-type-select filter-select setting-input" data-name="${escapeHtml(name)}">
                <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
                <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
              </select>
              <input type="text" class="ref-name-input ref-name-text filter-input" data-name="${escapeHtml(name)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:0;display:${isRef && refType === "env" ? "block" : "none"};" />
              <select class="ref-name-input ref-name-select filter-select setting-input" data-name="${escapeHtml(name)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
                <option value="">Select secret...</option>
                ${isRef && refType === "secret" && refName ? `<option value="${escapeHtml(refName)}" selected>${escapeHtml(refName)}</option>` : ""}
              </select>
              ${copyButtonHTML(inputId)}
            </div>
            <button type="button" class="ref-toggle-btn" data-name="${escapeHtml(name)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.8rem;padding:0.375rem 0.5rem;color:var(--text-secondary);">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
          </div>
        `;
        break;
      }
      case "select": {
        const opts = (meta.options || [])
          .map((o: { id?: string; value?: string; name?: string; label?: string }) => {
            const optId = o.id || o.value || "";
            const optLabel = o.name || o.label || optId;
            return `<option value="${escapeHtml(optId)}"${optId === value ? " selected" : ""}>${escapeHtml(optLabel || "")}</option>`;
          })
          .join("");
        // If current value doesn't match any option, add it as a visible selected option
        // so $secret:NAME and $env:NAME references are shown rather than a blank select
        const hasValue = (meta.options || []).some(
          (o: Record<string, unknown>) => (o.id || o.value) === value,
        );
        const valueFallback = hasValue
          ? ""
          : `<option value="${escapeHtml(value)}" selected>${escapeHtml(displayLabel(value))}</option>`;
        inputHtml = `
          <select id="${inputId}" class="filter-select setting-input"
            data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}">
            ${valueFallback}${opts}
          </select>
        `;
        break;
      }
      case "textarea":
        inputHtml = `
          <textarea id="${inputId}" class="filter-input setting-input setting-textarea" rows="3"
            data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}">${escapeHtml(value)}</textarea>
        `;
        break;
      default: {
        // text
        const strVal = String(value ?? "");
        const isSecretRef = strVal.startsWith("$secret:");
        const isEnvRef = strVal.startsWith("$env:");
        const isRef = isSecretRef || isEnvRef;
        const refType = isEnvRef ? "env" : "secret";
        const refName = isRef ? strVal.substring(strVal.indexOf(":") + 1) : "";
        const literalVal = isRef ? "" : strVal;
        inputHtml = `
          <div class="ref-toggle-container" style="display:flex;gap:0.25rem;align-items:center;flex:1;">
            <input type="hidden" class="setting-input" data-name="${escapeHtml(name)}" data-original="${escapeHtml(strVal)}" value="${escapeHtml(strVal)}" />
            <div class="ref-literal-mode" style="display:${isRef ? "none" : "flex"};flex:1;gap:0.25rem;align-items:center;">
              <input type="text" id="${inputId}" class="filter-input setting-input ref-literal-input"
                value="${escapeHtml(literalVal)}"
                data-name="${escapeHtml(name)}" data-original="${escapeHtml(literalVal)}" style="flex:1;" />
              ${copyButtonHTML(inputId)}
            </div>
            <div class="ref-mode-controls" style="display:${isRef ? "flex" : "none"};flex:1;gap:0.375rem;align-items:center;">
              <select class="ref-type-select filter-select setting-input" data-name="${escapeHtml(name)}">
                <option value="secret" ${refType === "secret" ? "selected" : ""}>Secret</option>
                <option value="env" ${refType === "env" ? "selected" : ""}>Env Var</option>
              </select>
              <input type="text" class="ref-name-input ref-name-text filter-input" data-name="${escapeHtml(name)}" placeholder="Env var name..." value="${escapeHtml(isRef && refType === "env" ? refName : "")}" style="flex:2;min-width:0;display:${isRef && refType === "env" ? "block" : "none"};" />
              <select class="ref-name-input ref-name-select filter-select setting-input" data-name="${escapeHtml(name)}" style="flex:1;display:${isRef && refType === "secret" ? "block" : "none"};">
                <option value="">Select secret...</option>
                ${isRef && refType === "secret" && refName ? `<option value="${escapeHtml(refName)}" selected>${escapeHtml(refName)}</option>` : ""}
              </select>
              ${copyButtonHTML(inputId)}
            </div>
            <button type="button" class="ref-toggle-btn" data-name="${escapeHtml(name)}" title="${isRef ? "Use literal value" : "Use secret/env ref"}" style="background:none;border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:4px;cursor:pointer;font-size:0.8rem;padding:0.375rem 0.5rem;color:var(--text-secondary);">${isRef ? "\u270F\uFE0F" : "\uD83D\uDD17"}</button>
          </div>
        `;
        break;
      }
    }

    // Actions (confirm/cancel): hidden until change detected
    inputHtml += `
      <div class="setting-actions" id="actions-${safeName}" style="display:none;">
        <button type="button" class="setting-action-btn setting-confirm-btn" title="Save changes" data-name="${escapeHtml(name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button type="button" class="setting-action-btn setting-cancel-btn" title="Reset changes" data-name="${escapeHtml(name)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        ${
          meta.default !== undefined && meta.default !== null && meta.default !== ""
            ? `
        <button type="button" class="setting-action-btn setting-reset-btn" title="Reset to default" data-name="${escapeHtml(name)}" data-default="${escapeHtml(meta.default)}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
        `
            : ""
        }
      </div>
    `;
  }

  return `
    <div class="setting-row" data-name="${safeName}">
      <div class="setting-label">
        <div class="setting-name">${escapeHtml(name)}</div>
        <div class="setting-description">${escapeHtml(desc)}</div>
        ${meta.default !== undefined && meta.default !== null && meta.default !== "" ? `<div class="setting-default" style="font-size:0.7rem;color:var(--text-muted);margin-top:0.125rem;">Default: <code style="background:rgba(255,255,255,0.05);padding:0.0625rem 0.25rem;border-radius:2px;">${escapeHtml(String(meta.default))}</code></div>` : ""}
      </div>
      <div class="setting-controls">
        <div class="setting-input-group">
          ${inputHtml}
        </div>
      </div>
    </div>
  `;
}

// ── Wiring ──

function wireSettings(): void {
  // Change detection on all setting inputs
  document.querySelectorAll(".setting-input").forEach((el) => {
    const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const name = input.getAttribute("data-name");
    if (!name) return;

    const handler = () => {
      const original = input.getAttribute("data-original") || "";
      const currentVal = input.value;
      const actionsEl = document.querySelector(`#actions-${name}`) as HTMLElement | null;

      if (currentVal !== original) {
        changedValues.set(name, { newValue: currentVal, originalValue: original });
        if (actionsEl) actionsEl.style.display = "flex";
      } else {
        changedValues.delete(name);
        if (actionsEl) actionsEl.style.display = "none";
      }
    };

    input.addEventListener("change", handler);
    input.addEventListener("input", handler);
  });

  // Confirm buttons
  document.querySelectorAll(".setting-confirm-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      if (!name) return;
      const entry = changedValues.get(name);
      if (!entry) return;
      void saveSetting(name, entry.newValue);
    });
  });

  // Cancel buttons
  document.querySelectorAll(".setting-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      if (!name) return;
      changedValues.delete(name);
      const input = document.querySelector(`.setting-input[data-name="${name}"]`) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
      if (input) {
        const original = input.getAttribute("data-original") || "";
        input.value = original;
        // Sync custom select display (enhanced dropdown) back to original
        if (input.tagName === "SELECT") {
          syncSelectDisplay(input.id);
        }
      }
      const actionsEl = document.querySelector(`#actions-${name}`) as HTMLElement | null;
      if (actionsEl) actionsEl.style.display = "none";
    });
  });

  // Reset-to-default buttons
  document.querySelectorAll(".setting-reset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      const defaultVal = btn.getAttribute("data-default");
      if (!name || defaultVal === null) return;
      const input = document.querySelector(`.setting-input[data-name="${name}"]`) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
      if (!input) return;
      const original = input.getAttribute("data-original") || "";
      if (original === defaultVal) return; // already at default
      input.value = defaultVal;
      if (input.tagName === "SELECT") {
        syncSelectDisplay(input.id);
      }
      // Save immediately
      void saveSetting(name, defaultVal);
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
      // Swap eye icon between eye and eye-off
      btn.innerHTML = isPassword
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>`;
    });
  });

  // Ref toggle buttons
  document.querySelectorAll(".ref-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const container = (btn as HTMLElement).closest(".ref-toggle-container") as HTMLElement;
      if (!container) return;
      const hiddenInput = container.querySelector(".setting-input") as HTMLInputElement;
      const literalInput = container.querySelector(".ref-literal-input") as HTMLInputElement;
      const literalMode = container.querySelector(".ref-literal-mode") as HTMLElement;
      const refControls = container.querySelector(".ref-mode-controls") as HTMLElement;
      const isRefMode = refControls.style.display !== "none";
      if (isRefMode) {
        if (literalMode) literalMode.style.display = "flex";
        if (literalInput) literalInput.style.display = "block";
        refControls.style.display = "none";
        hiddenInput.value = literalInput ? literalInput.value : "";
        btn.textContent = "\uD83D\uDD17";
        btn.setAttribute("title", "Use secret/env ref");
      } else {
        if (literalMode) literalMode.style.display = "none";
        if (literalInput) literalInput.style.display = "none";
        refControls.style.display = "flex";
        const select = refControls.querySelector(".ref-type-select") as HTMLSelectElement;
        const nameText = refControls.querySelector(".ref-name-text") as HTMLInputElement;
        const nameSelect = refControls.querySelector(".ref-name-select") as HTMLSelectElement;
        const prefix = select.value === "secret" ? "$secret:" : "$env:";
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
          const wrapper = nameSelect.nextElementSibling as HTMLElement | null;
          if (wrapper && wrapper.classList.contains("custom-select")) {
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
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // Ref type select
  document.querySelectorAll(".ref-type-select").forEach((el) => {
    el.addEventListener("change", () => {
      const container = (el as HTMLElement).closest(".ref-mode-controls") as HTMLElement;
      if (!container) return;
      const hiddenInput = container
        .closest(".ref-toggle-container")
        ?.querySelector(".setting-input") as HTMLInputElement;
      const isSecret = (el as HTMLSelectElement).value === "secret";
      const nameText = container.querySelector(".ref-name-text") as HTMLElement;
      const nameSelect = container.querySelector(".ref-name-select") as HTMLElement;
      if (nameText) nameText.style.display = isSecret ? "none" : "block";
      if (nameSelect) {
        const wrapper = nameSelect.nextElementSibling as HTMLElement | null;
        if (wrapper && wrapper.classList.contains("custom-select")) {
          wrapper.style.display = isSecret ? "block" : "none";
        } else {
          nameSelect.style.display = isSecret ? "block" : "none";
        }
      }
      const activeInput = isSecret ? (nameSelect as HTMLSelectElement) : (nameText as HTMLInputElement);
      const prefix = isSecret ? "$secret:" : "$env:";
      hiddenInput.value = prefix + (activeInput ? activeInput.value : "");
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // Ref name inputs
  document.querySelectorAll(".ref-name-text").forEach((el) => {
    el.addEventListener("input", () => {
      const container = (el as HTMLElement).closest(".ref-mode-controls") as HTMLElement;
      if (!container) return;
      const select = container.querySelector(".ref-type-select") as HTMLSelectElement;
      const hiddenInput = container
        .closest(".ref-toggle-container")
        ?.querySelector(".setting-input") as HTMLInputElement;
      if (!hiddenInput) return;
      const prefix = select.value === "secret" ? "$secret:" : "$env:";
      hiddenInput.value = prefix + (el as HTMLInputElement).value;
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  document.querySelectorAll(".ref-name-select").forEach((el) => {
    el.addEventListener("change", () => {
      const container = (el as HTMLElement).closest(".ref-mode-controls") as HTMLElement;
      if (!container) return;
      const select = container.querySelector(".ref-type-select") as HTMLSelectElement;
      const hiddenInput = container
        .closest(".ref-toggle-container")
        ?.querySelector(".setting-input") as HTMLInputElement;
      if (!hiddenInput) return;
      const prefix = select.value === "secret" ? "$secret:" : "$env:";
      hiddenInput.value = prefix + (el as HTMLSelectElement).value;
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // Copy buttons
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

  // Fetch secrets and populate ref-name-select dropdowns
  void (async () => {
    try {
      const response = await apiGet("/secrets");
      const secrets: { name: string; fieldType?: string; value?: string }[] = Array.isArray(response)
        ? (response as { name: string; fieldType?: string; value?: string }[])
        : ((response as Record<string, unknown>)?.data as {
            name: string;
            fieldType?: string;
            value?: string;
          }[]) || [];
      const secretNames = secrets.map((s) => s.name);
      document.querySelectorAll(".ref-name-select").forEach((sel) => {
        const select = sel as HTMLSelectElement;
        // Read current secret name from the hidden input, not from select.value
        // (select.value is always empty : only has a placeholder before populate)
        const container = select.closest(".ref-toggle-container");
        let secretName = "";
        if (container) {
          const hiddenInput = container.querySelector(
            '.setting-input[type="hidden"]',
          ) as HTMLInputElement | null;
          if (hiddenInput) {
            const hv = hiddenInput.value;
            secretName = hv.startsWith("$secret:") ? hv.substring(8) : "";
          }
        }
        select.innerHTML = '<option value="">Select secret...</option>';
        for (const name of secretNames) {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          if (name === secretName) opt.selected = true;
          select.appendChild(opt);
        }
        // Sync enhanced select display after programmatic options update
        if (container) {
          // Use nextElementSibling to target THIS select's wrapper, not
          // container.querySelector which picks the FIRST custom-select (ref-type's).
          const enhancedSelect = select.nextElementSibling as HTMLElement | null;
          if (enhancedSelect && enhancedSelect.classList.contains("custom-select")) {
            const textEl = enhancedSelect.querySelector(".select-trigger-text") as HTMLElement | null;
            if (textEl) textEl.textContent = secretName || "Select secret...";
          }
        }
      });
    } catch {
      // Secrets not available
    }
  })();

  // Sync literal input to hidden input
  document.querySelectorAll(".ref-literal-input").forEach((el) => {
    el.addEventListener("input", () => {
      const input = el as HTMLInputElement;
      const container = input.closest(".ref-toggle-container") as HTMLElement;
      if (!container) return;
      const hiddenInput = container.querySelector(".setting-input") as HTMLInputElement;
      if (hiddenInput) {
        hiddenInput.value = input.value;
        hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });
}

// ── Save ──

async function saveSetting(name: string, value: string): Promise<void> {
  try {
    await apiPut("/settings", { updates: [{ name, value }] });
    const safeName = CSS.escape(name);
    // Update original value on the input
    const input = document.querySelector(`.setting-input[data-name="${safeName}"]`) as
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | null;
    if (input) {
      input.setAttribute("data-original", value);
    }
    changedValues.delete(name);
    const actionsEl = document.querySelector(`#actions-${safeName}`) as HTMLElement | null;
    if (actionsEl) actionsEl.style.display = "none";
    showToast("Setting saved", "success");
  } catch (e) {
    showToast("Failed to save: " + formatApiError(e), "error");
  }
}

// ── Helpers ──
