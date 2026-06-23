import { apiGet, apiPost, apiDelete, type PluginData } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";
import { escapeHtml } from "../lib/helpers";
import {
  renderPluginConfig as sharedRenderPluginConfig,
  getCurrentConfig,
  dirtyCheckSaveButton,
} from "../lib/plugin-config";

export function renderTools(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Tools</h1>
        <p class="page-subtitle">MCP tools and servers — built-in and plugin-based</p>
      </div>
      <button id="add-tool-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Add</button>
    </div>
    <div id="tools-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading tools...</div>
    </div>
  `;

  document.getElementById("add-tool-btn")?.addEventListener("click", () => showInstallModal("mcp"));

  void loadTools();
}

// ── Built-in tools (hardcoded) ──

const BUILT_IN_TOOLS = [
  "filesystem",
  "fetch",
  "search",
  "kanban",
  "cron",
  "memory",
  "git",
  "docker",
  "query",
  "skills",
];

// ── State ──

const savedConfigs: Map<string, Record<string, any>> = new Map();

async function loadTools(): Promise<void> {
  const content = document.getElementById("tools-content")!;
  try {
    const response = await apiGet<any>("/plugins");
    // Backend wraps in { success, data } — extract data array
    const allPlugins: PluginData[] = response.data || response;
    // Filter to MCP type plugins
    const mcpPlugins = allPlugins.filter((p: PluginData) => p.plugin_type === "mcp");

    // Build final list: built-in + plugin tools
    const allTools: PluginData[] = [];

    // Add built-in tools
    for (const name of BUILT_IN_TOOLS) {
      // Don't add if a plugin with same name already exists
      if (!mcpPlugins.find((p) => p.name === name)) {
        allTools.push({
          name,
          plugin_type: "mcp",
          source: "built-in",
          status: "enabled",
          manifest: {
            name,
            type: "mcp",
            description: `Built-in ${name} tool`,
          },
          config: {},
        });
      }
    }

    // Add plugin-based tools
    allTools.push(...mcpPlugins);

    content.innerHTML = renderToolsPage(allTools);
    wireTools();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load tools: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderToolsPage(tools: PluginData[]): string {
  if (!tools || tools.length === 0) {
    return '<div class="empty-state">No tools found</div>';
  }

  return tools
    .map(
      (p) => `
    <div class="card settings-card" data-plugin-name="${escapeHtml(p.name)}">
      <div class="card-header" style="cursor:pointer;">
        <span class="card-title">
          <span class="plugin-name" style="font-weight:600;">${escapeHtml(p.manifest?.label || p.name)}</span>
          <span class="badge ${getStatusBadgeClass(p.status)}" style="margin-left:0.5rem;">${p.status === "enabled" ? "● Enabled" : p.status === "disabled" ? "● Disabled" : "● Error"}</span>
          ${p.version ? `<span class="badge badge-info" style="margin-left:0.375rem;">v${escapeHtml(p.version)}</span>` : ""}
          <span class="badge badge-neutral" style="margin-left:0.375rem;">${p.source === "built-in" ? "built-in tool" : `source: ${escapeHtml(p.source)}`}</span>
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
  // Built-in tools with no config
  if (p.source === "built-in") {
    return `<p class="text-muted" style="font-size:0.85rem;color:var(--text-muted);padding:0.5rem 0;">Built-in tool, no configuration needed.</p>`;
  }

  return sharedRenderPluginConfig({
    schema: p.manifest?.config_schema,
    values: p.config || {},
    pluginName: p.name,
    resolvedEnv: p.resolved_env,
    status: p.status,
    isBuiltIn: p.source === "built-in",
  });
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

function wireTools(): void {
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
    // Store the currently-rendered values as the saved baseline
    savedConfigs.set(pluginName, getCurrentConfig(formEl));
    // Re-check dirty state on every input change
    formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
      input.addEventListener("input", () => dirtyCheckSaveButton(formEl, pluginName, savedConfigs));
      input.addEventListener("change", () => dirtyCheckSaveButton(formEl, pluginName, savedConfigs));
    });
    // Initial dirty check (should be grayed out)
    dirtyCheckSaveButton(formEl, pluginName, savedConfigs);
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
        // Update saved baseline to current values, re-check dirty state
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
        void loadTools();
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
        void loadTools();
      } catch (e) {
        (window as any).showToast?.(
          "Failed to remove: " + (e instanceof Error ? e.message : "Unknown"),
          "error",
        );
      }
    });
  });
}

// ── Install from URL Modal ──

function showInstallModal(pluginType: "platform" | "mcp"): void {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;";

  backdrop.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:12px;width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.5);">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:1.1rem;margin:0;color:var(--text-primary);">Install ${pluginType === "platform" ? "Platform" : "Tool"} Plugin</h2>
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

  const installBtn = backdrop.querySelector("#install-confirm-btn") as HTMLButtonElement;
  const urlInput = backdrop.querySelector("#install-url-input") as HTMLInputElement;
  const nameInput = backdrop.querySelector("#install-name-input") as HTMLInputElement;
  const statusEl = backdrop.querySelector("#install-status") as HTMLElement;

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
        const evt = new CustomEvent("plugins-reloaded");
        window.dispatchEvent(evt);
        void loadTools();
      }, 1000);
    } catch (e) {
      showStatus(statusEl, "Error: " + (e instanceof Error ? e.message : "Unknown error"), "error");
      installBtn.disabled = false;
      installBtn.textContent = "Install";
    }
  });
}

function showStatus(el: HTMLElement, message: string, type: "success" | "error" | "info"): void {
  el.style.display = "block";
  el.textContent = message;
  if (type === "success") {
    el.style.background = "rgba(16,185,129,0.15)";
    el.style.color = "#34d399";
    el.style.border = "1px solid rgba(16,185,129,0.3)";
  } else if (type === "error") {
    el.style.background = "rgba(244,63,94,0.15)";
    el.style.color = "#fb7185";
    el.style.border = "1px solid rgba(244,63,94,0.3)";
  } else {
    el.style.background = "rgba(6,182,212,0.15)";
    el.style.color = "#22d3ee";
    el.style.border = "1px solid rgba(6,182,212,0.3)";
  }
}
