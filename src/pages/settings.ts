import { apiGet, apiPut, type SettingCategory } from "../lib/api";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";

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
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load settings: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Render ──

function renderSettingsPage(categories: SettingCategory[]): string {
  if (!categories || categories.length === 0) {
    return '<div class="empty-state">No settings available</div>';
  }

  return categories
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
      case "number":
        inputHtml = `
          <input type="tel" id="${inputId}" class="filter-input setting-input"
            value="${escapeHtml(value)}" inputmode="numeric" pattern="[0-9.]*"
            data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}" />
        `;
        break;
      case "boolean":
        inputHtml = `
          <select id="${inputId}" class="filter-select setting-input"
            data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}">
            <option value="true"${value === "true" ? " selected" : ""}>Enabled</option>
            <option value="false"${value === "false" ? " selected" : ""}>Disabled</option>
          </select>
        `;
        break;
      case "secret":
        inputHtml = `
          <div class="setting-secret-wrapper">
            <input type="password" id="${inputId}" class="filter-input setting-input setting-secret-input"
              value="${escapeHtml(value)}"
              data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}" />
            <button type="button" class="setting-secret-toggle" title="Toggle visibility" data-target="${inputId}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        `;
        break;
      case "select": {
        const opts = (meta.options || [])
          .map((o: any) => {
            const optId = o.id || o.value;
            const optLabel = (o as any).name || o.label || optId;
            return `<option value="${escapeHtml(optId)}"${optId === value ? " selected" : ""}>${escapeHtml(optLabel)}</option>`;
          })
          .join("");
        inputHtml = `
          <select id="${inputId}" class="filter-select setting-input"
            data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}">
            ${opts}
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
      default: // text
        inputHtml = `
          <input type="text" id="${inputId}" class="filter-input setting-input"
            value="${escapeHtml(value)}"
            data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}" />
        `;
        break;
    }

    // Actions (confirm/cancel) — hidden until change detected
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
      </div>
    `;
  }

  return `
    <div class="setting-row" data-name="${safeName}">
      <div class="setting-label">
        <div class="setting-name">${escapeHtml(name)}</div>
        <div class="setting-description">${escapeHtml(desc)}</div>
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
    (window as any).showToast?.("Setting saved", "success");
  } catch (e) {
    (window as any).showToast?.(
      "Failed to save: " + (e instanceof Error ? e.message : "Unknown error"),
      "error",
    );
  }
}

// ── Helpers ──

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
