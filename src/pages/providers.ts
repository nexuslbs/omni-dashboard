import { apiGet, apiPost, apiDelete, type PluginData } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";
import { escapeHtml } from "../lib/helpers";
import {
  renderPluginConfig as sharedRenderPluginConfig,
  getCurrentConfig,
  dirtyCheckSaveButton,
} from "../lib/plugin-config";

export function renderProviders(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Providers</h1>
        <p class="page-subtitle">LLM providers — built-in and plugin-based</p>
      </div>
      <button id="add-provider-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Add</button>
    </div>
    <div id="providers-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading providers...</div>
    </div>
  `;

  document.getElementById("add-provider-btn")?.addEventListener("click", () => showInstallModal("provider"));

  void loadProviders();
}

// ── State ──

const savedConfigs: Map<string, Record<string, any>> = new Map();

async function loadProviders(): Promise<void> {
  const content = document.getElementById("providers-content")!;
  try {
    const response = await apiGet<any>("/plugins");
    const allPlugins: PluginData[] = response.data || response;
    const providers = allPlugins.filter((p: PluginData) => p.plugin_type === "provider");
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

  // Use root config_schema (has enriched allowed_values from DYNAMIC_ENUM_CACHE)
  // falling back to manifest.config_schema for static field definitions
  const schema = p.config_schema && p.config_schema.length > 0 ? p.config_schema : p.manifest?.config_schema;

  const extraButtons = hasRefreshUrl(p)
    ? '<button type="button" class="plugin-refresh-models-btn" style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--accent-blue);" title="Refresh model list from provider">⟳ Refresh Models</button>'
    : "";

  return sharedRenderPluginConfig({
    schema,
    values: p.config || {},
    pluginName: p.name,
    resolvedEnv: p.resolved_env,
    status: p.status,
    isBuiltIn: false,
    extraButtons,
  });
}

function hasRefreshUrl(p: PluginData): boolean {
  const rootSchema = (p.config_schema || []) as any[];
  const manifestSchema = (p.manifest?.config_schema || []) as any[];
  return [...rootSchema, ...manifestSchema].some((f: any) => f.refresh_url);
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
    savedConfigs.set(pluginName, getCurrentConfig(formEl as HTMLElement));
    formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
      input.addEventListener("input", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
      input.addEventListener("change", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
    });
    dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs);
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
        dirtyCheckSaveButton(formEl, pluginName, savedConfigs);
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

  // Refresh models buttons
  document.querySelectorAll(".plugin-refresh-models-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      if (!pluginName) return;

      const originalText = btn.textContent || "";
      btn.innerHTML = "⟳ Refreshing...";
      (btn as HTMLButtonElement).disabled = true;

      try {
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/refresh-models`, {});
        (window as any).showToast?.("Models refreshed", "success");
        void loadProviders();
      } catch (e) {
        (window as any).showToast?.(
          "Failed to refresh: " + (e instanceof Error ? e.message : "Unknown"),
          "error",
        );
        btn.innerHTML = originalText;
        (btn as HTMLButtonElement).disabled = false;
      }
    });
  });
}

// ── Install from URL Modal ──

function showInstallModal(pluginType: "platform" | "mcp" | "provider"): void {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;";

  const typeLabel = pluginType === "platform" ? "Platform" : pluginType === "provider" ? "Provider" : "Tool";

  backdrop.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:12px;width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.5);">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:1.1rem;margin:0;color:var(--text-primary);">Install ${typeLabel} Plugin</h2>
        <button class="modal-close-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;padding:0.25rem;">✕</button>
      </div>
      <div style="padding:1.25rem;">
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Plugin URL <span style="color:var(--accent-rose);">*</span></label>
          <input id="install-url-input" type="url" class="filter-input" placeholder="https://example.com/plugin.tar.gz" style="width:100%;" />
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">URL to a plugin archive (.tar.gz) or a git repository URL</div>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Name Override <span style="font-size:0.75rem;color:var(--text-muted);">(optional)</span></label>
          <input id="install-name-input" type="text" class="filter-input" placeholder="Leave empty to extract from manifest" style="width:100%;" />
        </div>
        <div id="install-status" style="display:none;padding:0.5rem;margin-bottom:0.75rem;border-radius:6px;font-size:0.85rem;"></div>
      </div>
      <div style="padding:1rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;justify-content:flex-end;gap:0.5rem;">
        <button class="modal-cancel-btn" style="background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">Cancel</button>
        <button id="install-confirm-btn" style="background:var(--accent-purple);border:none;color:white;border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;font-weight:500;">Install</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Wire close buttons
  backdrop.querySelector(".modal-close-btn")?.addEventListener("click", () => backdrop.remove());
  backdrop.querySelector(".modal-cancel-btn")?.addEventListener("click", () => backdrop.remove());

  // Wire install
  const installBtn = backdrop.querySelector("#install-confirm-btn") as HTMLButtonElement;
  const urlInput = backdrop.querySelector("#install-url-input") as HTMLInputElement;
  const nameInput = backdrop.querySelector("#install-name-input") as HTMLInputElement;
  const statusEl = backdrop.querySelector("#install-status") as HTMLElement;

  function showStatus(el: HTMLElement, msg: string, type: "info" | "error" | "success") {
    el.style.display = "block";
    el.textContent = msg;
    const colors: Record<string, string> = {
      info: "background:rgba(59,130,246,0.15);color:#60a5fa;",
      error: "background:rgba(244,63,94,0.15);color:#fb7185;",
      success: "background:rgba(16,185,129,0.15);color:#34d399;",
    };
    el.style.cssText += colors[type] || "";
  }

  installBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      showStatus(statusEl, "Please enter a plugin URL", "error");
      return;
    }

    const body: Record<string, string> = { url };
    const nameOverride = nameInput.value.trim();
    if (nameOverride) body.name = nameOverride;

    installBtn.disabled = true;
    installBtn.textContent = "Installing...";
    showStatus(statusEl, "Installing plugin...", "info");

    try {
      const res = await fetch("/api/plugins/install-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Install failed");
        throw new Error(errText);
      }
      showStatus(statusEl, "Plugin installed successfully!", "success");
      installBtn.textContent = "Done";
      setTimeout(() => {
        backdrop.remove();
        void loadProviders();
      }, 1500);
    } catch (e) {
      showStatus(statusEl, "Install failed: " + (e instanceof Error ? e.message : "Unknown error"), "error");
      installBtn.disabled = false;
      installBtn.textContent = "Install";
    }
  });
}
