// ── Shared plugin UI helpers for tools/platforms/providers pages ──

import { apiDelete, apiPost, type PluginData } from "./api";
import { escapeHtml, formatApiError } from "./helpers";

export type PluginPageType = "tool" | "platform" | "provider";

// ── Status badge CSS ──

export function getStatusBadgeClass(status: string, needsBuild?: boolean): string {
  if (needsBuild) return "badge badge-warning";
  switch (status) {
    case "enabled":
      return "badge badge-success";
    case "disabled":
    case "not_found":
      return "badge badge-neutral";
    case "error":
      return "badge badge-error";
    default:
      return "badge badge-neutral";
  }
}

// ── Card template ──

export function renderPluginCard(
  p: PluginData,
  opts: {
    hasTools?: boolean;
    pluginTools?: string[];
    hasRemote?: boolean;
    hasCompilableSource?: boolean;
    isDuplicated?: boolean;
  },
): string {
  const { hasTools, pluginTools, hasRemote, hasCompilableSource, isDuplicated } = opts;

  return `
    <div class="card settings-card${p.status === "disabled" ? " plugin-disabled-card" : ""}" data-plugin-name="${escapeHtml(p.name)}" data-source="${escapeHtml(p.source)}" data-remote='${hasRemote ? escapeHtml(JSON.stringify(p.remote)) : ""}'>
      <div class="card-header" style="cursor:pointer;">
        <span class="card-title">
          <span class="plugin-name" style="font-weight:600;">${escapeHtml(p.name)}</span>
          ${p.manifest?.label && p.manifest.label !== p.name ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.125rem;">${escapeHtml(p.manifest.label)}</div>` : ""}
        </span>
        <span class="tool-actions" style="display:flex;gap:0.25rem;align-items:center;">
          <span class="badge ${getStatusBadgeClass(p.status, p.needsBuild)}">${p.needsBuild ? "○ Not Installed" : p.status === "enabled" ? "● Enabled" : p.status === "disabled" ? "○ Disabled" : p.status === "error" ? "● Error" : p.status === "not_found" ? "○ Not Found" : "○ Unknown"}</span>
          ${isDuplicated ? `<span class="badge badge-warning" style="margin-left:0.125rem;" title="Another source is already active for this plugin name">Duplicated</span>` : ""}
          ${!p.hasSourceCode && p.source !== "built-in" && !(p.manifest as any)?.api_mode ? `<span class="badge badge-warning" style="margin-left:0.125rem;" title="This plugin has no source code directory on disk (Cargo.toml or plugin.json). It exists only as a YAML config entry. Install it to fetch the source, or remove this entry if the plugin was removed.">No code</span>` : ""}
          ${p.isScript && !isDuplicated ? `<span class="badge badge-neutral" style="margin-left:0.125rem;">Script</span>` : ""}
          ${p.version ? `<span class="badge badge-info" style="margin-left:0.125rem;">v${escapeHtml(p.version)}</span>` : ""}
          ${p.language && p.language !== "unknown" ? `<span class="badge badge-neutral" style="margin-left:0.125rem;">${escapeHtml(p.language)}</span>` : ""}
          <span class="badge badge-neutral" style="margin-left:0.125rem;">${p.source === "built-in" ? "built-in tool" : `source: ${escapeHtml(p.source)}`}</span>
          ${hasTools ? `<span class="badge badge-neutral" style="margin-left:0.125rem;">${pluginTools!.length} tool${pluginTools!.length > 1 ? "s" : ""}</span>` : ""}
          ${renderActionButtons(p, hasRemote, hasCompilableSource)}
          ${!p.needsBuild && p.status === "enabled" ? `<button type="button" class="plugin-toggle-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:var(--text-secondary);">Disable</button>` : !p.needsBuild && (p.status === "disabled" || p.status === "error") ? `<button type="button" class="plugin-toggle-btn" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:#34d399;">Enable</button>` : ""}
          <button type="button" class="plugin-expand-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0.25rem;font-size:1rem;" title="Toggle config">▶</button>
        </span>
      </div>
      <div class="card-body plugin-body" style="display:none;">
        ${p.manifest?.description ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;">${escapeHtml(p.manifest.description)}</div>` : ""}
        ${p.manifest?.capabilities?.setup ? `<button type="button" class="plugin-setup-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:var(--accent-purple);margin-bottom:0.5rem;">Setup</button>` : ""}
        ${renderPluginConfig(p)}
        ${hasTools && pluginTools && pluginTools.length > 0 ? `<div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.25rem;">${pluginTools.map((t: string) => `<span class="badge badge-neutral" style="font-size:0.8rem;padding:0.25rem 0.5rem;">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      </div>
    </div>`;
}

// ── Action buttons ──

export function renderActionButtons(
  p: PluginData,
  _hasRemote?: boolean,
  hasCompilableSource?: boolean,
): string {
  const isBuiltin = p.source === "built-in";
  const isRemote = p.source === "remote";
  const isInstalled = !p.needsBuild;
  const rs = hasCompilableSource;

  if (isBuiltin) {
    return "";
  }

  // Determine which buttons to show
  const showInstall = isRemote && rs && !isInstalled;
  const showReinstall = rs && isInstalled;
  const showUninstall = rs && isInstalled;
  const showUpdate = isRemote;
  const showRemove = !showUninstall;

  // Render in fixed order: Install - Reinstall - Uninstall - Update - Remove
  const buttons: string[] = [];

  if (showInstall) {
    buttons.push(
      `<button type="button" class="plugin-install-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:var(--accent-purple);">Install</button>`,
    );
  }

  if (showReinstall) {
    buttons.push(
      `<button type="button" class="plugin-reinstall-btn" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:#22d3ee;">Reinstall</button>`,
    );
  }

  if (showUninstall) {
    buttons.push(
      `<button type="button" class="plugin-remove-btn" title="Uninstall" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:#fb7185;">Uninstall</button>`,
    );
  }

  if (showUpdate) {
    buttons.push(
      `<button type="button" class="plugin-update-btn" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:#22d3ee;">Update</button>`,
    );
  }

  if (showRemove) {
    buttons.push(
      `<button type="button" class="plugin-remove-btn" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);border-radius:6px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:#fb7185;">Remove</button>`,
    );
  }

  return buttons.join("");
}

// ── Wire button click handlers ──

/**
 * Wire all plugin action buttons for a given page type.
 * Call this after setting innerHTML with renderPluginCard() results.
 */
export function wirePluginButtons(_pluginType: PluginPageType, loadFn: () => void): void {
  // Uninstall buttons
  document.querySelectorAll(".plugin-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      const source = card?.getAttribute("data-source") || "bundled";
      if (!pluginName) return;
      const isUninstall = btn.getAttribute("title") === "Uninstall";
      if (isUninstall && !confirm(`Uninstall plugin "${pluginName}"?`)) return;
      if (!isUninstall && !confirm(`Remove plugin "${pluginName}"?`)) return;

      try {
        const encodedName = encodeURIComponent(pluginName);
        const url = isUninstall
          ? `/plugins/${encodedName}?mode=uninstall&source=${encodeURIComponent(source)}`
          : `/plugins/${encodedName}?source=${encodeURIComponent(source)}`;
        await apiDelete(url);
        (window as any).showToast?.(isUninstall ? "Plugin uninstalled" : "Plugin removed", "success");
        loadFn();
      } catch (e) {
        (window as any).showToast?.(
          "Failed to " + (isUninstall ? "uninstall" : "remove") + ": " + formatApiError(e),
          "error",
        );
        loadFn();
      }
    });
  });

  // Reinstall buttons
  document.querySelectorAll(".plugin-reinstall-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      const source = card?.getAttribute("data-source") || "bundled";
      if (!pluginName) return;

      const originalText = btn.textContent || "Reinstall";
      btn.textContent = "Reinstalling...";
      (btn as HTMLButtonElement).disabled = true;

      try {
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/reinstall`, { source });
        (window as any).showToast?.("Plugin reinstalled", "success");
        loadFn();
      } catch (e) {
        (window as any).showToast?.("Failed to reinstall: " + formatApiError(e), "error");
        btn.textContent = originalText;
        (btn as HTMLButtonElement).disabled = false;
        loadFn();
      }
    });
  });

  // Install buttons
  document.querySelectorAll(".plugin-install-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      const source = card?.getAttribute("data-source") || "bundled";
      if (!pluginName) return;

      const originalText = btn.textContent || "Install";
      btn.textContent = "Compiling...";
      (btn as HTMLButtonElement).disabled = true;

      try {
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/install`, { source });
        (window as any).showToast?.("Plugin installed", "success");
        loadFn();
      } catch (e) {
        (window as any).showToast?.("Failed to install: " + formatApiError(e), "error");
        btn.textContent = originalText;
        (btn as HTMLButtonElement).disabled = false;
        loadFn();
      }
    });
  });

  // Update buttons
  document.querySelectorAll(".plugin-update-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      const source = card?.getAttribute("data-source") || "bundled";
      if (!pluginName) return;

      const originalText = btn.textContent || "Update";
      btn.textContent = "Updating...";
      (btn as HTMLButtonElement).disabled = true;

      try {
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/download`, { source });
        (window as any).showToast?.("Plugin updated", "success");
        loadFn();
      } catch (e) {
        (window as any).showToast?.("Failed to update: " + formatApiError(e), "error");
        btn.textContent = originalText;
        (btn as HTMLButtonElement).disabled = false;
        loadFn();
      }
    });
  });

  // Enable/Disable toggle buttons
  document.querySelectorAll(".plugin-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      const source = card?.getAttribute("data-source") || "bundled";
      if (!pluginName) return;
      const isCurrentlyEnabled = btn.textContent?.trim() === "Disable";

      const originalText = btn.textContent || "";
      btn.textContent = isCurrentlyEnabled ? "Disabling..." : "Enabling...";
      (btn as HTMLButtonElement).disabled = true;

      try {
        const endpoint = isCurrentlyEnabled ? "disable" : "enable";
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/${endpoint}`, { source });
        (window as any).showToast?.(isCurrentlyEnabled ? "Disabled" : "Enabled", "success");
        loadFn();
      } catch (e) {
        (window as any).showToast?.("Failed: " + formatApiError(e), "error");
        btn.textContent = originalText;
        (btn as HTMLButtonElement).disabled = false;
        // Refresh state — backend may have rolled back (e.g., enabling
        // bundled source failed and reverted to the old source).
        loadFn();
      }
    });
  });

  // Expand/collapse buttons
  document.querySelectorAll(".plugin-expand-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const body = card?.querySelector(".card-body") as HTMLElement;
      if (body) {
        const isHidden = body.style.display === "none" || body.style.display === "";
        body.style.display = isHidden ? "block" : "none";
        btn.textContent = isHidden ? "▼" : "▶";
      }
    });
  });

  // Config save buttons
  document.querySelectorAll(".plugin-save-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      if (!pluginName) return;

      try {
        const config: Record<string, any> = {};
        card?.querySelectorAll(".plugin-config-input").forEach((input) => {
          const el = input as HTMLInputElement;
          config[el.getAttribute("data-key") || el.name] = el.value;
        });
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/config`, { config });
        (window as any).showToast?.("Configuration saved", "success");
        loadFn();
      } catch (e) {
        (window as any).showToast?.("Failed to save: " + formatApiError(e), "error");
      }
    });
  });

  // Setup buttons
  document.querySelectorAll(".plugin-setup-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = (btn as HTMLElement).closest(".card") as HTMLElement;
      const pluginName = card?.getAttribute("data-plugin-name");
      if (!pluginName) return;

      const originalText = btn.textContent || "Setup";
      btn.textContent = "Setting up...";
      (btn as HTMLButtonElement).disabled = true;

      try {
        await apiPost(`/plugins/${encodeURIComponent(pluginName)}/setup`, {});
        (window as any).showToast?.("Setup completed successfully", "success");
        loadFn();
      } catch (e) {
        (window as any).showToast?.("Setup failed: " + formatApiError(e), "error");
        btn.textContent = originalText;
        (btn as HTMLButtonElement).disabled = false;
        loadFn();
      }
    });
  });
}

// ── Config section rendering ──

/**
 * Render config fields and save button for a plugin.
 * Place this inside the card body after setting innerHTML.
 */
export function renderPluginConfig(p: PluginData): string {
  if (!p.configSchema || p.configSchema.length === 0) {
    return '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;">No configuration options available</div>';
  }
  return `<div class="plugin-config-form" style="margin-top:0.5rem;">
    ${p.configSchema.map((field: any) => renderConfigField(p.name, field, p.config || {})).join("")}
    <button type="button" class="plugin-save-btn" style="margin-top:0.5rem;background:rgba(34,211,238,0.1);border:1px solid rgba(34,211,238,0.2);border-radius:6px;padding:0.3rem 0.75rem;cursor:pointer;font-size:0.8rem;color:#22d3ee;">Save</button>
  </div>`;
}

function renderConfigField(pluginName: string, field: any, config: Record<string, any>): string {
  const fieldId = `cfg-${escapeHtml(pluginName)}-${escapeHtml(field.key)}`;
  const value = config[field.key] ?? field.default ?? "";
  const requiredAttr = field.required ? "required" : "";

  let inputHtml: string;
  switch (field.type) {
    case "boolean":
      inputHtml = `<input type="checkbox" id="${fieldId}" class="plugin-config-input" data-key="${escapeHtml(field.key)}" ${value ? "checked" : ""} />`;
      break;
    case "integer":
      inputHtml = `<input type="tel" id="${fieldId}" class="filter-input setting-input plugin-config-input" value="${escapeHtml(String(value))}" inputmode="numeric" pattern="-?[0-9]*[.]?[0-9]*" data-key="${escapeHtml(field.key)}" ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.max !== undefined ? `max="${field.max}"` : ""} style="max-width:120px;" />`;
      break;
    case "enum": {
      const options = field.allowed_values || [];
      inputHtml = `<select id="${fieldId}" class="filter-input setting-input plugin-config-input" data-key="${escapeHtml(field.key)}">
        ${!field.required ? '<option value="">Select...</option>' : ""}
        ${options
          .map((opt: any) => {
            const optValue = typeof opt === "object" ? (opt.value ?? opt) : opt;
            const optLabel = typeof opt === "object" ? (opt.label ?? optValue) : opt;
            const selected = String(value) === String(optValue) ? "selected" : "";
            return `<option value="${escapeHtml(String(optValue))}" ${selected}>${escapeHtml(String(optLabel))}</option>`;
          })
          .join("")}
      </select>`;
      break;
    }
    case "secret":
      inputHtml = `<div style="display:flex;gap:0.25rem;align-items:center;">
        <input type="password" id="${fieldId}" class="filter-input setting-input plugin-config-input" value="${escapeHtml(String(value))}" data-key="${escapeHtml(field.key)}" ${requiredAttr} style="flex:1;min-width:0;" />
        <button type="button" class="toggle-pwd-btn" data-target="${escapeHtml(fieldId)}" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.85rem;padding:0.25rem;" title="Toggle visibility">👁</button>
      </div>`;
      break;
    default:
      inputHtml = `<input type="text" id="${fieldId}" class="filter-input setting-input plugin-config-input" value="${escapeHtml(String(value))}" data-key="${escapeHtml(field.key)}" ${requiredAttr} style="width:100%;" />`;
      break;
  }

  const label = field.label || field.key;
  const description = field.description
    ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.125rem;">${escapeHtml(field.description)}</div>`
    : "";

  return `<div class="setting-row" style="margin-bottom:0.5rem;">
    <label for="${fieldId}" style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.25rem;">${escapeHtml(label)}</label>
    ${inputHtml}
    ${description}
  </div>`;
}

// ── Install from Git Modal ──

/**
 * Show the "Install from Git" modal.
 * After the user completes the form, sends POST /api/plugins/install-git.
 */
export function showInstallModal(pluginType: PluginPageType): void {
  const typeLabel = pluginType === "platform" ? "Platform" : pluginType === "provider" ? "Provider" : "Tool";
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;";

  backdrop.innerHTML = `
    <div style="background:var(--bg-card,#1e1e2e);border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:12px;padding:2rem;width:520px;max-width:90vw;">
      <h2 style="margin:0 0 1rem;font-size:1.2rem;">Install ${typeLabel} from Git</h2>

      <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.25rem;">Git Repository URL</label>
      <input id="install-git-url" type="url" class="filter-input" placeholder="https://github.com/user/plugin-repo.git" style="width:100%;" />

      <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin:0.75rem 0 0.25rem;">Git Ref (optional)</label>
      <input id="install-git-ref" type="text" class="filter-input" placeholder="main, v1.0.0, or leave empty for default branch" style="width:100%;" />

      <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin:0.75rem 0 0.25rem;">Subdirectory Path (optional)</label>
      <input id="install-git-path" type="text" class="filter-input" placeholder="Subdirectory within repo (e.g. plugins/my-plugin)" style="width:100%;" />

      <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin:0.75rem 0 0.25rem;">Plugin Name (optional — leave empty to use name from plugin.json)</label>
      <input id="install-name-input" type="text" class="filter-input" placeholder="Leave empty to use name from plugin.json" style="width:100%;" />

      <div id="install-status" style="display:none;padding:0.5rem;margin-bottom:0.75rem;border-radius:6px;font-size:0.85rem;"></div>

      <div style="display:flex;gap:0.5rem;margin-top:1rem;">
        <button id="install-cancel-btn" style="flex:1;background:rgba(148,163,184,0.1);border:1px solid rgba(148,163,184,0.2);border-radius:6px;padding:0.5rem;cursor:pointer;color:var(--text-secondary);font-size:0.85rem;">Cancel</button>
        <button id="install-confirm-btn" style="flex:1;background:var(--accent-purple);border:none;color:white;border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;font-weight:500;">Install</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const statusEl = backdrop.querySelector("#install-status") as HTMLElement;
  const installBtn = backdrop.querySelector("#install-confirm-btn") as HTMLButtonElement;
  const cancelBtn = backdrop.querySelector("#install-cancel-btn") as HTMLButtonElement;

  function showStatus(msg: string, type: "success" | "error") {
    statusEl.style.display = "block";
    statusEl.textContent = msg;
    statusEl.style.background = type === "success" ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)";
    statusEl.style.color = type === "success" ? "#34d399" : "#fb7185";
  }

  cancelBtn.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  installBtn.addEventListener("click", async () => {
    const url = (document.querySelector("#install-git-url") as HTMLInputElement).value.trim();
    if (!url) {
      showStatus("Repository URL is required", "error");
      return;
    }
    const gitRef = (document.querySelector("#install-git-ref") as HTMLInputElement).value.trim() || undefined;
    const path = (document.querySelector("#install-git-path") as HTMLInputElement).value.trim() || undefined;
    const name =
      (document.querySelector("#install-name-input") as HTMLInputElement).value.trim() || undefined;

    installBtn.disabled = true;
    installBtn.textContent = "Installing...";
    showStatus("Cloning repository...", "success");

    try {
      const body: Record<string, any> = { url };
      if (gitRef) body.git_ref = gitRef;
      if (path) body.path = path;
      if (name) body.name = name;
      const result: any = await apiPost("/plugins/install-git", body);
      showStatus(
        `Installed "${result.name || name || "plugin"}" from git. Now install it from the list above.`,
        "success",
      );
      (window as any).showToast?.("Plugin cloned from git. Click Install to compile.", "success");
      installBtn.textContent = "Done";
      // Reload the page list after a moment
      setTimeout(() => {
        backdrop.remove();
        // The page loadFn should be called by the caller
      }, 1500);
    } catch (e) {
      showStatus("Failed: " + formatApiError(e), "error");
      installBtn.disabled = false;
      installBtn.textContent = "Install";
    }
  });
}
