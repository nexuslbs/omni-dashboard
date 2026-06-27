import { apiGet, apiPost } from "../lib/api";
import { enhanceSelect, unenhanceSelect } from "../lib/dropdown";
import { escapeHtml } from "../lib/helpers";

// ── Cached provider/model data ──
let _providers: string[] = [];
let _providerModels: Record<string, string[]> = {};

export function renderProfiles(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Profiles</h1>
        <p class="page-subtitle">LLM profiles — provider, model, and tool configuration</p>
      </div>
      <button id="create-profile-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Profile</button>
    </div>
    <div id="profiles-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading profiles...</div>
    </div>
  `;
  void loadProfiles();
}

async function loadProfiles(): Promise<void> {
  const content = document.getElementById("profiles-content")!;
  try {
    const profiles = await apiGet<any[]>("/profiles");
    // Load provider names and their model lists (same pattern as channels)
    try {
      const pluginResp = await apiGet<any>("/plugins");
      const allPlugins: any[] = pluginResp.data || pluginResp;
      const providers = allPlugins.filter((p: any) => p.plugin_type === "provider");
      _providers = providers.map((p: any) => p.name).sort();
      const modelMap: Record<string, string[]> = {};
      for (const p of providers) {
        try {
          // Use data already returned in the plugin list response instead of
          // fetching /api/plugins/:name individually (which may 404)
          const schema = [
            ...((p.config_schema || []) as any[]),
            ...((p.manifest?.config_schema || []) as any[]),
          ];
          const modelField = schema.find((f: any) => f.key === "default_model");
          if (modelField && modelField.allowed_values && modelField.allowed_values.length > 0) {
            modelMap[p.name] = modelField.allowed_values as string[];
          } else if (modelField && modelField.default) {
            modelMap[p.name] = [modelField.default as string];
          } else {
            modelMap[p.name] = [];
          }
        } catch {
          modelMap[p.name] = [];
        }
      }
      _providerModels = modelMap;
    } catch {
      _providers = [];
      _providerModels = {};
    }

    content.innerHTML = renderProfilesPage(profiles);
    wireProfiles();
    // Enhance provider and model selects
    document.querySelectorAll("#profiles-content select").forEach((el) => {
      enhanceSelect(el.id);
    });
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load profiles: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function getModelsForProvider(provider: string): string[] {
  return _providerModels[provider] || [];
}

function renderProfilesPage(profiles: any[]): string {
  if (!profiles || profiles.length === 0) {
    return '<div class="empty-state">No profiles found on filesystem.</div>';
  }

  return profiles
    .map(
      (p) => `
    <div class="card settings-card" data-profile-name="${escapeHtml(p.name)}">
      <div class="card-header"><span class="card-title">${escapeHtml(p.name)}</span></div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Name</div>
            <div class="setting-readonly-value">
              <code class="setting-readonly-code">${escapeHtml(p.name)}</code>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Provider</div>
            ${renderProviderSelect(p.name, p.provider || "")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            ${renderModelSelect(p.name, p.provider || "", p.model || "")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls" style="max-width:none;">
            <div class="setting-name">Allowed Toolsets</div>
            ${renderToolsetSelect(p.name, p.allowed_tools || [], p.all_tools || [])}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls" style="max-width:none;">
            <div class="setting-name">Allowed Tools</div>
            ${renderToolSelect(p.name, p.allowed_tools || [], p.all_tools || [])}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls" style="max-width:none;">
            <div class="setting-name">Skills</div>
            <div class="text-muted" style="font-size:0.75rem;margin-bottom:0.5rem;">
              Skills are stored on the filesystem at <code>profiles/${escapeHtml(p.name)}/skills/</code>. Add or remove files there to manage skills.
            </div>
            ${renderSkillsList(p.skills)}
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderProviderSelect(profileName: string, currentProvider: string): string {
  const selectId = `prof-provider-${escapeHtml(profileName)}`;
  const options =
    _providers.length > 0
      ? _providers
          .map(
            (p) =>
              `<option value="${escapeHtml(p)}" ${p === currentProvider ? "selected" : ""}>${escapeHtml(p)}</option>`,
          )
          .join("")
      : `<option value="${escapeHtml(currentProvider)}" selected>${escapeHtml(currentProvider || "—")}</option>`;
  return `
    <div style="display:flex;align-items:center;gap:0.375rem;">
      <select id="${selectId}" class="profile-provider-select"
        data-profile-name="${escapeHtml(profileName)}" data-field="provider" data-original="${escapeHtml(currentProvider)}">
        ${options}
      </select>
      <button type="button" class="profile-edit-confirm" data-profile-name="${escapeHtml(profileName)}" data-field="provider" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#10b981;padding:0;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="profile-edit-cancel" data-profile-name="${escapeHtml(profileName)}" data-field="provider" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#f43f5e;padding:0;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function renderModelSelect(profileName: string, currentProvider: string, currentModel: string): string {
  const selectId = `prof-model-${escapeHtml(profileName)}`;
  const models = getModelsForProvider(currentProvider);
  const currentInModels = currentModel && models.includes(currentModel);
  const options =
    '<option value="" ' +
    (!currentModel ? "selected" : "") +
    ">- (Default) -</option>" +
    (currentModel && !currentInModels
      ? `<option value="${escapeHtml(currentModel)}" selected>${escapeHtml(currentModel)}</option>`
      : "") +
    (models.length > 0
      ? models
          .filter((m) => !currentInModels || m !== currentModel)
          .map(
            (m) =>
              `<option value="${escapeHtml(m)}" ${m === currentModel ? "selected" : ""}>${escapeHtml(m)}</option>`,
          )
          .join("")
      : "");
  return `
    <div style="display:flex;align-items:center;gap:0.375rem;">
      <select id="${selectId}" class="profile-model-select"
        data-profile-name="${escapeHtml(profileName)}" data-field="model" data-original="${escapeHtml(currentModel)}">
        ${options}
      </select>
      <button type="button" class="channel-refresh-btn" id="prof-model-refresh-${escapeHtml(profileName)}" data-profile-name="${escapeHtml(profileName)}" title="Refresh model list from provider">⟳</button>
      <button type="button" class="profile-edit-confirm" data-profile-name="${escapeHtml(profileName)}" data-field="model" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#10b981;padding:0;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="profile-edit-cancel" data-profile-name="${escapeHtml(profileName)}" data-field="model" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#f43f5e;padding:0;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function renderSkillsList(skills: string[]): string {
  if (!skills || skills.length === 0) {
    return '<span class="text-muted" style="font-size:0.85rem;">No skills found on filesystem</span>';
  }
  return `<div class="channel-tag-list">${skills
    .map((s) => `<span class="channel-tag">${escapeHtml(s)}</span>`)
    .join("")}</div>`;
}

/**
 * Extract the toolset name from a display tool name.
 * e.g. "actions:kanban_dispatcher" → "actions", "filesystem:read" → "filesystem"
 * Tools without a colon prefix get their own toolset name.
 */
function toolsetOf(tool: string): string {
  const idx = tool.indexOf(":");
  return idx > 0 ? tool.substring(0, idx) : "_other";
}

/**
 * Given allowed tools and all tools, compute each toolset's state:
 *   "full"  → all tools in that toolset are allowed (purple)
 *   "partial" → some, but not all (yellow)
 *   "none"  → none allowed (gray)
 */
function computeToolsetStates(
  selected: string[],
  allTools: string[],
): Record<string, "full" | "partial" | "none"> {
  const sets: Record<string, { total: number; allowed: number }> = {};
  for (const t of allTools) {
    const s = toolsetOf(t);
    if (!sets[s]) sets[s] = { total: 0, allowed: 0 };
    sets[s].total++;
    if (selected.includes(t)) sets[s].allowed++;
  }
  const result: Record<string, "full" | "partial" | "none"> = {};
  for (const [s, v] of Object.entries(sets)) {
    if (v.allowed === 0) result[s] = "none";
    else if (v.allowed === v.total) result[s] = "full";
    else result[s] = "partial";
  }
  return result;
}

function renderToolsetSelect(profileName: string, selected: string[], allTools: string[]): string {
  const states = computeToolsetStates(selected, allTools);
  const toolsetNames = Object.keys(states).sort();
  const chips = toolsetNames
    .map(
      (ts) =>
        `<span class="toolset-chip" data-toolset="${escapeHtml(ts)}" data-profile-name="${escapeHtml(profileName)}" data-state="${states[ts]}" style="${toolsetChipStyle(states[ts])}">${escapeHtml(ts)}</span>`,
    )
    .join("");

  return `<div class="toolset-chip-group" id="prof-toolsets-${escapeHtml(profileName)}" data-profile-name="${escapeHtml(profileName)}">${chips}</div>`;
}

function renderToolSelect(profileName: string, selected: string[], allTools: string[]): string {
  const id = `prof-tools-${escapeHtml(profileName)}`;
  const chips = [...allTools]
    .sort()
    .map(
      (tool) =>
        `<label class="tool-chip ${selected.includes(tool) ? "tool-chip-active" : ""}" data-tool="${escapeHtml(tool)}">
        <input type="checkbox" class="tool-chip-cb" value="${escapeHtml(tool)}"
          data-profile-name="${escapeHtml(profileName)}"
          ${selected.includes(tool) ? "checked" : ""} />
        ${escapeHtml(tool)}
      </label>`,
    )
    .join("");

  return `
    <div style="display:flex;flex-direction:column;gap:0.5rem;width:100%;">
      <div class="tool-chip-group" id="${id}" data-profile-name="${escapeHtml(profileName)}">
        ${chips}
      </div>
      <div style="display:flex;gap:0.375rem;">
        <button type="button" class="profile-tools-reset btn btn-sm" data-profile-name="${escapeHtml(profileName)}" style="background:rgba(255,255,255,0.1);color:var(--text-secondary);border:1px solid var(--glass-border);border-radius:4px;padding:0.25rem 0.75rem;cursor:pointer;font-size:0.8rem;">Reset to Defaults</button>
      </div>
    </div>
  `;
}

function wireProfiles(): void {
  // ── Select edits (profile-provider-select, profile-model-select) ──
  document.querySelectorAll(".profile-provider-select, .profile-model-select").forEach((el) => {
    const select = el as HTMLSelectElement;
    select.addEventListener("change", () => {
      const profileName = select.getAttribute("data-profile-name");
      const field = select.getAttribute("data-field");
      const original = select.getAttribute("data-original") || "";
      const confirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const cancelBtn = document.querySelector(
        `.profile-edit-cancel[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const changed = select.value !== original;
      if (confirmBtn) confirmBtn.style.display = changed ? "inline-flex" : "none";
      if (cancelBtn) cancelBtn.style.display = changed ? "inline-flex" : "none";
    });
  });

  // Provider change → update model dropdown in the same profile card
  document.querySelectorAll(".profile-provider-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const select = sel as HTMLSelectElement;
      const profileName = select.getAttribute("data-profile-name");
      if (!profileName) return;
      const newProvider = select.value;
      const models = getModelsForProvider(newProvider);
      const modelSelect = document.getElementById(
        `prof-model-${escapeHtml(profileName)}`,
      ) as HTMLSelectElement | null;
      if (!modelSelect) return;
      modelSelect.innerHTML =
        models.length > 0
          ? models.map((m: string) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")
          : '<option value="">—</option>';
      const firstModel = models.length > 0 ? models[0] : "";
      modelSelect.value = firstModel;
      modelSelect.setAttribute("data-original", firstModel);
      // Re-enhance model select after updating options
      unenhanceSelect(modelSelect.id);
      enhanceSelect(modelSelect.id);
      // Hide confirm/cancel for model
      const modelConfirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="model"]`,
      ) as HTMLElement | null;
      const modelCancelBtn = document.querySelector(
        `.profile-edit-cancel[data-profile-name="${profileName}"][data-field="model"]`,
      ) as HTMLElement | null;
      if (modelConfirmBtn) modelConfirmBtn.style.display = "none";
      if (modelCancelBtn) modelCancelBtn.style.display = "none";
    });
  });

  // Confirm edits
  document.querySelectorAll(".profile-edit-confirm").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      const field = btn.getAttribute("data-field");
      if (!profileName || !field) return;
      const input = document.querySelector(`[data-profile-name="${profileName}"][data-field="${field}"]`) as
        | HTMLSelectElement
        | HTMLInputElement
        | null;
      if (!input) return;
      const value = input.value;
      const body: Record<string, string> = {};
      body[field] = value;
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(profileName)}`, {
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
          `.profile-edit-cancel[data-profile-name="${profileName}"][data-field="${field}"]`,
        ) as HTMLElement | null;
        if (cancelBtn) cancelBtn.style.display = "none";
        (window as any).showToast?.("Profile updated", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Cancel edits
  document.querySelectorAll(".profile-edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const profileName = btn.getAttribute("data-profile-name");
      const field = btn.getAttribute("data-field");
      if (!profileName || !field) return;
      const input = document.querySelector(`[data-profile-name="${profileName}"][data-field="${field}"]`) as
        | HTMLSelectElement
        | HTMLInputElement
        | null;
      if (!input) return;
      input.value = input.getAttribute("data-original") || "";
      (btn as HTMLElement).style.display = "none";
      const confirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      if (confirmBtn) confirmBtn.style.display = "none";
    });
  });

  // ── Tool chips (auto-save on change) ──
  document.querySelectorAll(".tool-chip-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const profileName = cb.getAttribute("data-profile-name");
      if (!profileName) return;
      updateToolChipClasses(profileName);
      refreshToolsetChips(profileName);
      void saveTools(profileName);
    });
  });

  // ── Toolset chips (click to toggle all tools in a toolset, auto-save) ──
  document.querySelectorAll(".toolset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const profileName = chip.getAttribute("data-profile-name");
      const toolset = chip.getAttribute("data-toolset");
      const currentState = chip.getAttribute("data-state") as "full" | "partial" | "none" | null;
      if (!profileName || !toolset) return;
      const allCbs = document.querySelectorAll(
        `.tool-chip-cb[data-profile-name="${profileName}"]`,
      ) as NodeListOf<HTMLInputElement>;
      const allTools: string[] = [];
      allCbs.forEach((cb) => allTools.push(cb.value));
      // Find tools in this toolset
      const prefix = toolset + ":";
      const toolsInSet = allTools.filter((t) => t.startsWith(prefix));
      if (toolsInSet.length === 0) return;
      // Toggle: if none allowed → allow all; otherwise → disallow all
      const shouldEnable = currentState === "none";
      allCbs.forEach((cb) => {
        if (cb.value.startsWith(prefix)) {
          cb.checked = shouldEnable;
        }
      });
      // Update chip styling
      updateToolChipClasses(profileName);
      refreshToolsetChips(profileName);
      void saveTools(profileName);
    });
  });

  // Tool reset button
  document.querySelectorAll(".profile-tools-reset").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      if (!profileName) return;
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(profileName)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed_tools: [] }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        await loadProfiles();
        (window as any).showToast?.("Tools reset to defaults", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // ── Create Profile button ──
  const createBtn = document.getElementById("create-profile-btn");
  if (createBtn && !createBtn.getAttribute("data-wired")) {
    createBtn.setAttribute("data-wired", "1");
    createBtn.addEventListener("click", () => showCreateProfileModal());
  }

  // ── Profile model refresh buttons ──
  document.querySelectorAll(".channel-refresh-btn[id^='prof-model-refresh-']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      if (!profileName) return;
      const providerSelect = document.querySelector(
        `.profile-provider-select[data-profile-name="${profileName}"]`,
      ) as HTMLSelectElement | null;
      if (!providerSelect) return;
      const provider = providerSelect.value;
      if (!provider) return;
      const modelSelect = document.getElementById(`prof-model-${profileName}`) as HTMLSelectElement | null;
      if (!modelSelect) return;
      (btn as HTMLElement).style.opacity = "0.5";
      try {
        // Trigger server-side model refresh first (same as channels handler)
        await apiPost(`/plugins/${encodeURIComponent(provider)}/refresh-models`, {});
        // Re-fetch the plugin list to get updated config_schema
        const freshResp = await apiGet<any>("/plugins");
        const freshPlugins: any[] = freshResp.data || freshResp;
        const providerPlugin = freshPlugins.find(
          (fp: any) => fp.plugin_type === "provider" && fp.name === provider,
        );
        if (!providerPlugin) throw new Error(`Provider "${provider}" not found`);
        const schema = [
          ...((providerPlugin.config_schema || []) as any[]),
          ...((providerPlugin.manifest?.config_schema || []) as any[]),
        ];
        const modelField = schema.find((f: any) => f.key === "default_model");
        let models: string[] = [];
        if (modelField && modelField.allowed_values && modelField.allowed_values.length > 0) {
          models = modelField.allowed_values as string[];
        } else if (modelField && modelField.default) {
          models = [modelField.default as string];
        }
        _providerModels[provider] = models;
        const currentVal = modelSelect.getAttribute("data-original") || modelSelect.value;
        modelSelect.innerHTML =
          '<option value="">- (Default) -</option>' +
          (models.length > 0
            ? models
                .map(
                  (m) =>
                    `<option value="${escapeHtml(m)}" ${m === currentVal ? "selected" : ""}>${escapeHtml(m)}</option>`,
                )
                .join("")
            : "");
        modelSelect.value = currentVal && models.includes(currentVal) ? currentVal : "";
        (window as any).showToast?.(`Models refreshed for ${provider} (${models.length} models)`, "success");
      } catch (e) {
        (window as any).showToast?.(
          "Failed to refresh: " + (e instanceof Error ? e.message : "Unknown"),
          "error",
        );
      } finally {
        (btn as HTMLElement).style.opacity = "1";
      }
    });
  });
}

// ── Create Profile Modal ──

function showCreateProfileModal(): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h2>Create Profile</h2>
        <button class="modal-close" id="create-profile-modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <label class="filter-label">Name *</label>
          <input class="filter-input" id="create-profile-name" type="text" placeholder="my-profile" style="width:100%;" />
          <div class="text-muted" style="font-size:0.75rem;margin-top:0.25rem;">Letters, numbers, hyphens, and underscores only — no spaces or special characters.</div>
        </div>
        <div class="settings-section">
          <label class="filter-label">Provider <span class="text-muted" style="font-size:0.75rem;">(optional)</span></label>
          <select class="filter-select" id="create-profile-provider" style="width:100%;">
            <option value="">— None —</option>
            ${_providers.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
          </select>
        </div>
        <div class="settings-section" id="create-profile-model-section" style="display:none;">
          <label class="filter-label">Model *</label>
          <select class="filter-select" id="create-profile-model" style="width:100%;">
            <option value="">— Select a model —</option>
          </select>
        </div>
        <div class="settings-section" style="margin-top:0.75rem;">
          <div class="text-muted" style="font-size:0.8rem;padding:0.5rem;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid var(--glass-border);">
            No tools will be enabled by default. You can configure them after creation in the profile settings above.
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="create-profile-cancel">Cancel</button>
        <button class="btn btn-primary" id="create-profile-save" disabled>Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector("#create-profile-modal-close")?.addEventListener("click", close);
  backdrop.querySelector("#create-profile-cancel")?.addEventListener("click", close);

  const nameInput = backdrop.querySelector("#create-profile-name") as HTMLInputElement;
  const providerSelect = backdrop.querySelector("#create-profile-provider") as HTMLSelectElement;
  const modelSelect = backdrop.querySelector("#create-profile-model") as HTMLSelectElement;
  const modelSection = backdrop.querySelector("#create-profile-model-section") as HTMLElement;
  const saveBtn = backdrop.querySelector("#create-profile-save") as HTMLButtonElement;

  // Validate on input change
  function validate(): void {
    const name = nameInput.value.trim();
    const nameValid = /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0;
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const modelValid = !provider || (model && model.trim().length > 0);
    saveBtn.disabled = !(nameValid && modelValid);
  }

  nameInput.addEventListener("input", validate);

  // Provider change → update model dropdown, show/hide model section
  providerSelect.addEventListener("change", () => {
    const provider = providerSelect.value;
    if (provider) {
      const models = getModelsForProvider(provider);
      modelSelect.innerHTML =
        models.length > 0
          ? '<option value="">— Select a model —</option>' +
            models.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")
          : '<option value="">— No models available —</option>';
      modelSection.style.display = "block";
    } else {
      modelSelect.innerHTML = '<option value="">— Select a model —</option>';
      modelSection.style.display = "none";
    }
    validate();
  });

  modelSelect.addEventListener("change", validate);

  // Save
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const provider = providerSelect.value || null;
    const model = modelSelect.value || null;
    saveBtn.disabled = true;
    saveBtn.textContent = "Creating...";
    try {
      await apiPost("/profiles", { name, provider, model });
      (window as any).showToast?.(`Profile '${name}' created`, "success");
      close();
      void loadProfiles();
    } catch (e) {
      (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Create";
    }
  });
}

// ── Tool helpers ──

function updateToolChipClasses(profileName: string): void {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return;
  group.querySelectorAll(".tool-chip").forEach((chip) => {
    const cb = chip.querySelector(".tool-chip-cb") as HTMLInputElement;
    chip.classList.toggle("tool-chip-active", cb.checked);
  });
}

async function saveTools(profileName: string): Promise<void> {
  const selected = getSelectedTools(profileName);
  try {
    const res = await fetch(`/api/profiles/${encodeURIComponent(profileName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_tools: selected }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text);
    }
    (window as any).showToast?.("Tools updated", "success");
  } catch (e) {
    (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
  }
}

function getSelectedTools(profileName: string): string[] {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return [];
  const result: string[] = [];
  group.querySelectorAll(".tool-chip-cb:checked").forEach((cb) => {
    result.push((cb as HTMLInputElement).value);
  });
  return result;
}

/** Refresh toolset chips to reflect the current selection state of individual tools. */
function refreshToolsetChips(profileName: string): void {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  const toolsetContainer = document.querySelector(`.toolset-chip-group[data-profile-name="${profileName}"]`);
  if (!group || !toolsetContainer) return;
  // Gather current selection
  const selected: string[] = [];
  const allTools: string[] = [];
  group.querySelectorAll(".tool-chip-cb").forEach((cb) => {
    const input = cb as HTMLInputElement;
    allTools.push(input.value);
    if (input.checked) selected.push(input.value);
  });
  // Compute states
  const sets: Record<string, { total: number; allowed: number }> = {};
  for (const t of allTools) {
    const s = toolsetOf(t);
    if (!sets[s]) sets[s] = { total: 0, allowed: 0 };
    sets[s].total++;
    if (selected.includes(t)) sets[s].allowed++;
  }
  // Update chips
  const chips = toolsetContainer.querySelectorAll(".toolset-chip");
  chips.forEach((chip) => {
    const ts = chip.getAttribute("data-toolset");
    if (!ts || !sets[ts]) return;
    const v = sets[ts];
    let state: "full" | "partial" | "none";
    if (v.allowed === 0) state = "none";
    else if (v.allowed === v.total) state = "full";
    else state = "partial";
    chip.setAttribute("data-state", state);
    const colors = toolsetChipColors(state);
    (chip as HTMLElement).style.background = colors.background;
    (chip as HTMLElement).style.border = colors.border;
    (chip as HTMLElement).style.color = colors.color;
  });
}

function toolsetChipColors(state: "full" | "partial" | "none"): {
  background: string;
  border: string;
  color: string;
} {
  switch (state) {
    case "full":
      return {
        background: "rgba(139,92,246,0.15)",
        border: "1px solid rgba(139,92,246,0.35)",
        color: "var(--accent-purple)",
      };
    case "partial":
      return {
        background: "rgba(234,179,8,0.12)",
        border: "1px solid rgba(234,179,8,0.35)",
        color: "#eab308",
      };
    case "none":
      return {
        background: "rgba(148,163,184,0.08)",
        border: "1px solid rgba(148,163,184,0.2)",
        color: "var(--text-muted)",
      };
  }
}

function toolsetChipStyle(state: "full" | "partial" | "none"): string {
  const c = toolsetChipColors(state);
  return "background:" + c.background + ";border:" + c.border + ";color:" + c.color + ";";
}
