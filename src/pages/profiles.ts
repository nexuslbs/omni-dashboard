import { showToast } from "../lib/utils";
import { apiGet, apiPost } from "../lib/api";
import { enhanceSelect, unenhanceSelect } from "../lib/dropdown";
import { escapeHtml, formatApiError } from "../lib/helpers";
import type { PluginBase, ProfileData } from "../lib/types";
import { allSettledOrNull } from "../lib/parallel";

// ── Cached provider/model data ──
let _providers: string[] = [];
let _providerModels: Record<string, string[]> = {};
let _explorerPrefix = ""; // OMNI_DIR path relative to EXPLORER_DIR
// Toolset ids defined in config/toolsets.yml (None = all tools allowed).
let _toolsetIds: string[] = [];

export function renderProfiles(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Profiles</h1>
        <p class="page-subtitle">LLM profiles: provider, model, and tool configuration</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button id="create-profile-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Profile</button>
        <button id="profiles-import-btn" class="btn" style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">Import</button>
      </div>
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
    // /fs/config, /profiles and /plugins are INDEPENDENT: they are started in
    // the SAME tick (allSettledOrNull) so the page pays the MAX call instead of
    // the sum of three sequential round trips.
    const [fsConfig, profilesRes, pluginResp, toolsetsRes] = await allSettledOrNull([
      _explorerPrefix ? Promise.resolve(null) : apiGet<{ root: string; omniDir: string }>("/fs/config"),
      apiGet<ProfileData[]>("/profiles"),
      apiGet<{ data: PluginBase[] }>("/plugins"),
      apiGet<{ toolsets?: Record<string, string[]> }>("/api/toolsets"),
    ]);
    _toolsetIds = Object.keys(toolsetsRes?.toolsets ?? {}).sort();
    // Load filesystem config to compute explorer URL prefix
    if (fsConfig && fsConfig.omniDir.startsWith(fsConfig.root)) {
      _explorerPrefix = fsConfig.omniDir.slice(fsConfig.root.length);
    }
    if (!profilesRes) throw new Error("Failed to load profiles");
    const profiles = profilesRes;
    // Load provider names and their model lists (same pattern as channels)
    if (pluginResp) {
      const rawPlugins: Record<string, any>[] = ((pluginResp as any).data || pluginResp || []).map(
        (p: Record<string, any>) => {
          const r: Record<string, unknown> = {};
          for (const k of Object.keys(p)) {
            r[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = p[k];
          }
          return r;
        },
      );
      const providers = rawPlugins.filter((p) => p.pluginType === "provider");
      _providers = (providers as { name: string }[]).map((p) => p.name).sort();
      const modelMap: Record<string, string[]> = {};
      for (const p of providers) {
        try {
          // Use data already returned in the plugin list response instead of
          // fetching /api/plugins/:name individually (which may 404)
          const schema = [
            ...((p.configSchema || []) as any[]),
            ...((p.manifest?.config_schema || []) as any[]),
          ];
          const modelField = schema.find((f: Record<string, unknown>) => f.key === "default_model");
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
    } else {
      _providers = [];
      _providerModels = {};
    }

    // Build tool→server_name lookup BEFORE rendering so toolsetOf()
    // uses the map instead of the fallback (which would produce "list"
    // from the underscore prefix of "list_tool_details").
    if (profiles && profiles.length > 0 && profiles[0].all_tool_details) {
      _toolServerMap = {};
      for (const td of profiles[0].all_tool_details) {
        _toolServerMap[td.name] = td.server_name || "builtin";
      }
    }
    content.innerHTML = renderProfilesPage(profiles);
    wireProfiles();
    // Enhance provider and model selects
    document.querySelectorAll("#profiles-content select").forEach((el) => {
      enhanceSelect(el.id);
    });
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load profiles: ${formatApiError(e)}</div>`;
  }
}

function getModelsForProvider(provider: string): string[] {
  return _providerModels[provider] || [];
}

function renderProfilesPage(profiles: ProfileData[]): string {
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
            <div class="setting-name">Default Provider</div>
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
            <div class="setting-name">Toolset</div>
            ${renderProfileToolsetField(p.name, typeof p.toolset === "string" ? p.toolset : null)}
            <div class="text-muted" style="font-size:0.75rem;margin-top:0.25rem;">First match wins: workflow role &gt; workflow &gt; task &gt; channel &gt; profile. "None (All tools allowed)" leaves every tool available.</div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls" style="max-width:none;">
            <div class="setting-name">Skills</div>
            <div class="text-muted" style="font-size:0.75rem;margin-bottom:0.5rem;">
              Skills are stored on the filesystem at <code>profiles/${escapeHtml(p.name)}/skills/</code>. Add or remove files there to manage skills.
            </div>
            ${renderSkillsList(p.name, p.skills || [])}
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
  const currentInList = currentProvider && _providers.includes(currentProvider);
  const options =
    '<option value="" ' +
    (!currentProvider ? "selected" : "") +
    ">- (Default) -</option>" +
    (currentProvider && !currentInList
      ? `<option value="${escapeHtml(currentProvider)}" selected>${escapeHtml(currentProvider)}</option>`
      : "") +
    (_providers.length > 0
      ? _providers
          .map(
            (p) =>
              `<option value="${escapeHtml(p)}" ${p === currentProvider ? "selected" : ""}>${escapeHtml(p)}</option>`,
          )
          .join("")
      : "");
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

function renderSkillsList(profileName: string, skills: string[]): string {
  if (!skills || skills.length === 0) {
    return '<span class="text-muted" style="font-size:0.85rem;">No skills found on filesystem</span>';
  }
  return `<div class="channel-tag-list">${skills
    .map((s) => {
      // Strip extension if present, then add .md
      const skillName = s.endsWith(".md") ? s.slice(0, -3) : s;
      const prefix = _explorerPrefix ? "/" + encodeURIComponent(_explorerPrefix.slice(1)) : "";
      return `<a class="channel-tag skill-link" href="/explorer?file=${prefix}%2Fprofiles%2F${encodeURIComponent(profileName)}%2Fskills%2F${encodeURIComponent(skillName)}.md" style="text-decoration:none;cursor:pointer;">${escapeHtml(s)}</a>`;
    })
    .join("")}</div>`;
}

/**
 * Extract the toolset name from a tool's server_name.
 * Uses the all_tool_details lookup map which maps each tool name
 * to its server_name from the MCP API (e.g. "test-rust-tool-2_hello" → "test-rust-tool-2").
 * Tools with no server (builtin) → "builtin".
 *
 * The map is populated from the API BEFORE rendering (see loadProfiles()),
 * so every tool with a server_name IS in the map when this runs.
 * If a tool is NOT in the map (defensive edge case), safe-default to
 * "builtin": external tools always have server_name and will be present.
 */
function toolsetOf(tool: string): string {
  const server = _toolServerMap[tool];
  return server || "builtin";
}

// Lookup: full tool name → server_name (populated from profile data)
let _toolServerMap: Record<string, string> = {};

function renderProfileToolsetField(profileName: string, current: string | null): string {
  const selectId = `prof-toolset-${escapeHtml(profileName)}`;
  const currentInList = !!current && _toolsetIds.includes(current);
  const options =
    '<option value=""' +
    (!current ? " selected" : "") +
    ">None (All tools allowed)</option>" +
    (current && !currentInList
      ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (undefined)</option>`
      : "") +
    _toolsetIds
      .map(
        (id) =>
          `<option value="${escapeHtml(id)}" ${id === current ? "selected" : ""}>${escapeHtml(id)}</option>`,
      )
      .join("");
  return `
    <select id="${selectId}" class="profile-toolset-select" data-profile-name="${escapeHtml(profileName)}" data-original="${escapeHtml(current || "")}">
      ${options}
    </select>
  `;
}

function wireProfiles(): void {
  // ── Select edits (profile-provider-select) ──
  document.querySelectorAll(".profile-provider-select").forEach((el) => {
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

  // ── Select edits (profile-model-select) ──
  document.querySelectorAll(".profile-model-select").forEach((el) => {
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
      const prevModel = modelSelect.getAttribute("data-original") || modelSelect.value;
      const prevModelValid = prevModel && models.includes(prevModel);
      modelSelect.innerHTML =
        models.length > 0
          ? '<option value="">- (Default) -</option>' +
            (prevModel && !prevModelValid
              ? `<option value="${escapeHtml(prevModel)}" selected>${escapeHtml(prevModel)}</option>`
              : "") +
            models
              .filter((m: string) => m !== prevModel || !prevModelValid)
              .map((m: string) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`)
              .join("")
          : '<option value="">- (Default) -</option>';
      const newVal = prevModelValid ? prevModel : "";
      modelSelect.value = newVal;
      modelSelect.setAttribute("data-original", newVal);
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

  // ── Toolset select (first-match toolset resolution; "" = all tools) ──
  document.querySelectorAll(".profile-toolset-select").forEach((el) => {
    const select = el as HTMLSelectElement;
    select.addEventListener("change", async () => {
      const profileName = select.getAttribute("data-profile-name");
      if (!profileName) return;
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(profileName)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolset: select.value }),
        });
        if (!res.ok) throw new Error(await res.text());
        select.setAttribute("data-original", select.value);
        showToast("Toolset updated", "success");
      } catch (e) {
        showToast("Failed: " + formatApiError(e), "error");
      }
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
        showToast("Profile updated", "success");
      } catch (e) {
        showToast("Failed: " + formatApiError(e), "error");
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

  // ── "All tools" tri-state checkbox: checked = `allowed_tools` undefined in
  // profiles.yml (no restriction); unchecking stores an explicit list so
  // `undefined` (all) and `[]` (none) stay distinguishable. ──
  document.querySelectorAll(".prof-all-tools-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const profileName = cb.getAttribute("data-profile-name");
      if (!profileName) return;
      setProfileAllMode(profileName, (cb as HTMLInputElement).checked);
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
      // Narrowing a toolset turns the explicit list on ("All tools" off).
      if (profileAllMode(profileName)) setProfileAllMode(profileName, false);
      const allCbs = document.querySelectorAll(
        `.tool-chip-cb[data-profile-name="${profileName}"]`,
      ) as NodeListOf<HTMLInputElement>;
      const allTools: string[] = [];
      allCbs.forEach((cb) => allTools.push(cb.value));
      // Find tools in this toolset: match by server_name in _toolServerMap.
      // The map is populated before rendering, so every tool with a
      // server_name is present. If not in map (defensive), treat as builtin.
      const toolsInSet = allTools.filter((t) => {
        const mapped = _toolServerMap[t];
        return mapped ? mapped === toolset : toolset === "builtin";
      });
      if (toolsInSet.length === 0) return;
      // Toggle: if none allowed → allow all; otherwise → disallow all
      const shouldEnable = currentState === "none";
      allCbs.forEach((cb) => {
        const t = cb.value;
        const mapped = _toolServerMap[t];
        const matches = mapped ? mapped === toolset : toolset === "builtin";
        if (matches) {
          cb.checked = shouldEnable;
        }
      });
      // Update chip styling
      updateToolChipClasses(profileName);
      refreshToolsetChips(profileName);
      void saveTools(profileName);
    });
  });

  // ── Focus / Blur save on inline edits ──
  const createBtn = document.getElementById("create-profile-btn");
  if (createBtn && !createBtn.getAttribute("data-wired")) {
    createBtn.setAttribute("data-wired", "1");
    createBtn.addEventListener("click", () => showCreateProfileModal());
  }

  // ── Import button (mirrors the plugins/channels import UX) ──
  const importBtn = document.getElementById("profiles-import-btn");
  if (importBtn && !importBtn.getAttribute("data-wired")) {
    importBtn.setAttribute("data-wired", "1");
    importBtn.addEventListener("click", () => showProfilesImportModal());
  }

  // ── Profile model refresh buttons ──
  document.querySelectorAll(".channel-refresh-btn[id^='prof-model-refresh-']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      if (!profileName) return;
      const providerInput = document.querySelector(
        `.profile-provider-input[data-profile-name="${profileName}"]`,
      ) as HTMLInputElement | null;
      if (!providerInput) return;
      const provider = providerInput.value;
      if (!provider) return;
      const modelSelect = document.getElementById(`prof-model-${profileName}`) as HTMLSelectElement | null;
      if (!modelSelect) return;
      (btn as HTMLElement).style.opacity = "0.5";
      try {
        // Trigger server-side model refresh first (same as channels handler)
        await apiPost(`/plugins/providers/bundled/${encodeURIComponent(provider)}/refresh-models`, {});
        // Re-fetch the plugin list to get updated config_schema
        const freshResp = await apiGet<{ data: PluginBase[] }>("/plugins");
        const freshPlugins: Record<string, any>[] = ((freshResp as any).data || freshResp || []).map(
          (p: Record<string, any>) => {
            const r: Record<string, unknown> = {};
            for (const k of Object.keys(p)) {
              r[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = p[k];
            }
            return r;
          },
        );
        const providerPlugin = freshPlugins.find(
          (fp: Record<string, unknown>) => fp.pluginType === "provider" && fp.name === provider,
        );
        if (!providerPlugin) throw new Error(`Provider "${provider}" not found`);
        const schema = [
          ...((providerPlugin.config_schema || []) as any[]),
          ...((providerPlugin.manifest?.config_schema || []) as any[]),
        ];
        const modelField = schema.find((f: Record<string, unknown>) => f.key === "default_model");
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
        showToast(`Models refreshed for ${provider} (${models.length} models)`, "success");
      } catch (e) {
        showToast("Failed to refresh: " + formatApiError(e), "error");
      } finally {
        (btn as HTMLElement).style.opacity = "1";
      }
    });
  });
}

// ── Profiles Import Modal ──
// Posts a profiles.yml-structured document (pasted YAML or a fetched URL) to
// the /profiles/import endpoint (server-side validation + atomic merge into
// config/profiles.yml), then reloads the profile list so newly imported
// profiles appear (including YAML-only profiles with no directory).

function showProfilesImportModal(): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <h2>Import profiles</h2>
        <button class="modal-close" id="profiles-import-modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <label class="filter-label">profiles.yml URL (optional)</label>
          <input class="filter-input" id="profiles-import-url" type="text" placeholder="https://raw.githubusercontent.com/user/repo/main/config/profiles.yml" style="width:100%;" />
        </div>
        <div class="settings-section" style="margin-top:0.75rem;">
          <label class="filter-label">Or paste a profiles.yml document</label>
          <textarea class="filter-input" id="profiles-import-yaml" rows="12" placeholder="profiles:
  research:
    provider: opencode-go
    model: deepseek-v4-flash
    plan: true
    template: researcher
    allowed_tools:
      - search_messages" style="width:100%;font-family:monospace;font-size:0.8rem;"></textarea>
          <div class="text-muted" style="font-size:0.75rem;margin-top:0.25rem;">
            The document must follow the profiles.yml structure (top-level <code>profiles:</code> map).
            Entries with the same name as an existing profile are overwritten; new names are added.
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="profiles-import-cancel">Cancel</button>
        <button class="btn btn-primary" id="profiles-import-save">Import</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector("#profiles-import-modal-close")?.addEventListener("click", close);
  backdrop.querySelector("#profiles-import-cancel")?.addEventListener("click", close);

  const urlInput = backdrop.querySelector("#profiles-import-url") as HTMLInputElement;
  const yamlInput = backdrop.querySelector("#profiles-import-yaml") as HTMLTextAreaElement;
  const saveBtn = backdrop.querySelector("#profiles-import-save") as HTMLButtonElement;

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "Importing...";
    try {
      let text = yamlInput.value;
      const url = urlInput.value.trim();
      if (!text.trim() && url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
        text = await res.text();
      }
      if (!text.trim()) throw new Error("Paste a profiles.yml document or provide a URL");
      const result = await apiPost<{ data?: { message?: string }; message?: string }>("/profiles/import", {
        yaml: text,
      });
      const msg = result?.data?.message || result?.message || "Profiles imported";
      showToast(msg, "success");
      close();
      void loadProfiles();
    } catch (e) {
      showToast("Import failed: " + formatApiError(e), "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Import";
    }
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
          <div class="text-muted" style="font-size:0.75rem;margin-top:0.25rem;">Letters, numbers, hyphens, and underscores only: no spaces or special characters.</div>
        </div>
        <div class="settings-section" style="margin-top:0.75rem;">
          <div class="text-muted" style="font-size:0.8rem;padding:0.5rem;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid var(--glass-border);">
            By default all enabled tools are available to the profile. You can restrict them by assigning a toolset after creation in the profile settings.
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
  const saveBtn = backdrop.querySelector("#create-profile-save") as HTMLButtonElement;

  // Validate on input change
  function validate(): void {
    const name = nameInput.value.trim();
    const nameValid = /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0;
    saveBtn.disabled = !nameValid;
  }

  nameInput.addEventListener("input", validate);

  // Save
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    saveBtn.disabled = true;
    saveBtn.textContent = "Creating...";
    try {
      await apiPost("/profiles", { name });
      showToast(`Profile '${name}' created`, "success");
      close();
      void loadProfiles();
    } catch (e) {
      showToast("Failed: " + formatApiError(e), "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Create";
    }
  });
}

// ── Tool helpers ──

/** True when the profile has NO allow-list (allowed_tools undefined = all tools). */
function profileAllMode(profileName: string): boolean {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  return group?.getAttribute("data-all-mode") === "1";
}

/** Toggle a profile between "all tools" (undefined) and an explicit list. */
function setProfileAllMode(profileName: string, on: boolean): void {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return;
  group.setAttribute("data-all-mode", on ? "1" : "0");
  group.querySelectorAll(".tool-chip-cb").forEach((el) => {
    const cb = el as HTMLInputElement;
    if (on) cb.checked = true;
    cb.disabled = on;
  });
  const box = document.querySelector(
    `.prof-all-tools-cb[data-profile-name="${profileName}"]`,
  ) as HTMLInputElement | null;
  if (box) box.checked = on;
  updateToolChipClasses(profileName);
  refreshToolsetChips(profileName);
}

function updateToolChipClasses(profileName: string): void {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return;
  group.querySelectorAll(".tool-chip").forEach((chip) => {
    const cb = chip.querySelector(".tool-chip-cb") as HTMLInputElement;
    chip.classList.toggle("tool-chip-active", cb.checked);
  });
}

async function saveTools(profileName: string): Promise<void> {
  // `null` = no allow-list restriction (stored as an absent `allowed_tools`
  // in profiles.yml); an explicit array (possibly empty) is stored verbatim.
  const selected: string[] | null = profileAllMode(profileName) ? null : getSelectedTools(profileName);
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
    showToast("Tools updated", "success");
  } catch (e) {
    showToast("Failed: " + formatApiError(e), "error");
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
