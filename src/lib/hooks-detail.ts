/**
 * Hooks create/edit modal.
 * Clone of showCronModal (src/lib/schedule-detail.ts) with hook-specific
 * fields, backed by the omniagent hooks REST API.
 */
import { apiGet } from "./api";
import { escapeHtml, formatApiError, fixMissingSelectOptions } from "./helpers";
import { enhanceSelectElement } from "./dropdown";
import { showToast } from "./utils";
import {
  formatHookCounterJson,
  hookField,
  EVENT_LABELS,
  SCOPE_LABELS,
  MODE_LABELS,
  PLANNING_MODE_LABELS,
} from "./hooks";

interface ChannelOption {
  id: number | string;
  name: string;
  platform?: string;
}

interface ProfileOption {
  name: string;
}

interface ActionOption {
  id: string;
  name: string;
  is_builtin?: boolean;
}

/**
 * Show the create (hook=null) or edit (hook!=null) modal for a hook.
 * @param hook existing hook record (snake_case keys) or null for create
 * @param onReload callback after a successful save
 */
export async function showHookModal(
  hook: Record<string, unknown> | null,
  onReload: () => void,
): Promise<void> {
  const isEdit = hook !== null;

  // Fetch available data (best-effort, like showCronModal)
  let channels: ChannelOption[] = [];
  let profiles: ProfileOption[] = [];
  let existingHooks: Record<string, unknown>[] = [];
  let actions: ActionOption[] = [];
  try {
    channels = (await apiGet("/channels")) as ChannelOption[];
  } catch {
    /* ok */
  }
  try {
    profiles = await apiGet<ProfileOption[]>("/profiles");
  } catch {
    /* ok */
  }
  try {
    existingHooks = await apiGet<Record<string, unknown>[]>("/hooks");
  } catch {
    /* ok */
  }
  try {
    actions = await apiGet<ActionOption[]>("/actions");
  } catch {
    /* ok */
  }

  // Current values (snake_case with camelCase fallback)
  const cur = {
    id: hook ? String(hookField<string>(hook, "id", "id") ?? "") : "",
    name: hook ? String(hookField<string>(hook, "name", "name") ?? "") : "",
    display_name: hook ? String(hookField<string>(hook, "display_name", "displayName") ?? "") : "",
    event: hook ? String(hookField<string>(hook, "event", "event") ?? "thread_started") : "thread_started",
    scope: hook ? String(hookField<string>(hook, "scope", "scope") ?? "global") : "global",
    target: hook ? String(hookField<string>(hook, "target", "target") ?? "") : "",
    count: hook ? Number(hookField<number>(hook, "count", "count") ?? 1) : 1,
    mode: hook ? String(hookField<string>(hook, "mode", "mode") ?? "agentic") : "agentic",
    prompt: hook ? String(hookField<string>(hook, "prompt", "prompt") ?? "") : "",
    action_id: hook ? String(hookField<string>(hook, "action_id", "actionId") ?? "") : "",
    profile: hook ? String(hookField<string>(hook, "profile", "profile") ?? "") : "",
    channel_id: hook ? Number(hookField<number>(hook, "channel_id", "channelId") ?? 0) || 0 : 0,
    planning_mode: hook ? String(hookField<string>(hook, "planning_mode", "planningMode") ?? "") : "",
    plan: hook ? Boolean(hookField<boolean>(hook, "plan", "plan") ?? false) : false,
    template: hook ? String(hookField<string>(hook, "template", "template") ?? "") : "",
    enabled: hook ? Boolean(hookField<boolean>(hook, "enabled", "enabled") ?? true) : true,
    counter: hook ? hookField<unknown>(hook, "counter", "counter") : undefined,
  };

  const modal = document.createElement("div");
  modal.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:5vh;";
  modal.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:12px;width:640px;max-width:92vw;max-height:86vh;overflow-y:auto;box-shadow:0 12px 48px rgba(0,0,0,0.5);">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg-secondary);z-index:2;">
        <h2 style="font-size:1.1rem;margin:0;color:var(--text-primary);">${isEdit ? "Edit Hook" : "Create Hook"}</h2>
        <button id="hook-modal-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;padding:0.25rem;">✕</button>
      </div>
      <div style="padding:1.25rem;">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;margin-bottom:1rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Name (internal)</label>
            <input id="hook-name" type="text" class="filter-input" value="${isEdit ? escapeHtml(cur.name) : ""}" ${isEdit ? "readonly" : ""} style="width:100%;${isEdit ? "opacity:0.6;" : ""}" />
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">${isEdit ? "Internal identifier, set at creation." : "Auto-generated from Display Name when left empty."}</div>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Display Name</label>
            <input id="hook-display" type="text" class="filter-input" value="${isEdit ? escapeHtml(cur.display_name || cur.name) : ""}" style="width:100%;" />
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;margin-bottom:1rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Event <span style="color:var(--accent-rose);">*</span></label>
            <select id="hook-event" class="filter-select" style="width:100%;">
              ${Object.entries(EVENT_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${cur.event === value ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Scope</label>
            <select id="hook-scope" class="filter-select" style="width:100%;">
              ${Object.entries(SCOPE_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${cur.scope === value ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
          </div>
        </div>

        <div id="hook-target-section" style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Target <span id="hook-target-hint-label" style="color:var(--text-muted);font-weight:400;"></span></label>
          <input id="hook-target" type="text" class="filter-input" value="${isEdit ? escapeHtml(cur.target) : ""}" placeholder='e.g. "general" or "all"' style="width:100%;" />
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.25rem;">
            <span id="hook-target-hint-text"></span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;margin-bottom:1rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Trigger Count (>= 1)</label>
            <input id="hook-count" type="number" min="1" step="1" class="filter-input" value="${cur.count}" style="width:100%;" />
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">Fire after this many matching events.</div>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Mode</label>
            <select id="hook-mode" class="filter-select" style="width:100%;">
              ${Object.entries(MODE_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${cur.mode === value ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
          </div>
        </div>

        <div id="hook-action-section" style="display:none;margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Action ID <span style="color:var(--accent-rose);">*</span></label>
          <select id="hook-action" class="filter-select" style="width:100%;">
            <option value="">Select action...</option>
            ${actions
              .map((a) => {
                const displayName =
                  a.is_builtin && a.name.startsWith("builtin_")
                    ? `actions:${a.name.replace(/^builtin_/, "")}`
                    : a.name || a.id;
                return `<option value="${escapeHtml(a.id)}" ${cur.action_id === a.id ? "selected" : ""}>${escapeHtml(displayName)}</option>`;
              })
              .join("")}
          </select>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.25rem;">Action mode runs this action without an agent when the hook fires.</div>
        </div>

        <div id="hook-prompt-section" style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Prompt</label>
          <textarea id="hook-prompt" class="filter-input" style="width:100%;min-height:80px;resize:vertical;font-family:monospace;font-size:0.8rem;" placeholder="Instructions for the agent when the hook fires.">${isEdit && cur.prompt ? escapeHtml(cur.prompt) : ""}</textarea>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.25rem;">Agentic mode: used as the thread cause prompt. Empty → default "Hook fired" message.</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;margin-bottom:1rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Profile</label>
            <select id="hook-profile" class="filter-select" style="width:100%;">
              <option value="">- (Default)</option>
              ${profiles
                .map(
                  (p) =>
                    `<option value="${escapeHtml(p.name)}" ${cur.profile === p.name ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Channel</label>
            <select id="hook-channel" class="filter-select" style="width:100%;">
              <option value="">- (Inherit from event)</option>
              ${channels
                .map(
                  (ch) =>
                    `<option value="${ch.id}" ${cur.channel_id === Number(ch.id) ? "selected" : ""}>${escapeHtml(ch.name)}${ch.platform ? ` (${escapeHtml(ch.platform)})` : ""}</option>`,
                )
                .join("")}
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;margin-bottom:1rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Planning Mode</label>
            <select id="hook-planning" class="filter-select" style="width:100%;">
              ${Object.entries(PLANNING_MODE_LABELS)
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${cur.planning_mode === value || (cur.planning_mode === "" && value === "") ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Template</label>
            <input id="hook-template" type="text" class="filter-input" value="${isEdit ? escapeHtml(cur.template) : ""}" placeholder="e.g. tasks/triage.md" style="width:100%;" />
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.25rem;">Template file injected into the agent prompt (agentic mode).</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:1.25rem;margin-bottom:1rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
            <input id="hook-plan" type="checkbox" ${cur.plan ? "checked" : ""} />
            <span style="font-size:0.85rem;color:var(--text-primary);">Plan (force planning on)</span>
          </label>
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
            <input id="hook-enabled" type="checkbox" ${cur.enabled ? "checked" : ""} />
            <span style="font-size:0.85rem;color:var(--text-primary);">Enabled</span>
          </label>
        </div>

        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Current Counter <span style="color:var(--text-muted);font-weight:400;">(read-only — resets automatically when the hook fires)</span></label>
          <pre id="hook-counter-view" style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:6px;padding:0.625rem;font-size:0.75rem;color:var(--accent-cyan);white-space:pre-wrap;word-break:break-word;margin:0;max-height:140px;overflow-y:auto;">${escapeHtml(formatHookCounterJson(cur.counter))}</pre>
        </div>

      </div>
      <div style="padding:1rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;justify-content:flex-end;gap:0.5rem;position:sticky;bottom:0;background:var(--bg-secondary);z-index:2;">
        <button id="hook-modal-cancel" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">Cancel</button>
        <button id="hook-modal-save" class="btn btn-primary" style="background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;font-weight:500;">${isEdit ? "Update" : "Create"}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Enhance selects
  [
    "hook-event",
    "hook-scope",
    "hook-mode",
    "hook-action",
    "hook-profile",
    "hook-channel",
    "hook-planning",
  ].forEach((id) => {
    enhanceSelectElement(modal.querySelector(`#${id}`) as HTMLSelectElement);
  });
  fixMissingSelectOptions(modal);

  // ── Conditional field visibility ──
  const scopeSelect = modal.querySelector("#hook-scope") as HTMLSelectElement;
  const targetSection = modal.querySelector("#hook-target-section") as HTMLElement;
  const targetInput = modal.querySelector("#hook-target") as HTMLInputElement;
  const targetHintText = modal.querySelector("#hook-target-hint-text") as HTMLElement;
  const targetHintLabel = modal.querySelector("#hook-target-hint-label") as HTMLElement;
  const modeSelect = modal.querySelector("#hook-mode") as HTMLSelectElement;
  const actionSection = modal.querySelector("#hook-action-section") as HTMLElement;
  const promptSection = modal.querySelector("#hook-prompt-section") as HTMLElement;

  const updateScopeHints = () => {
    const scope = scopeSelect.value;
    const isGlobal = scope === "global";
    targetSection.style.display = isGlobal ? "none" : "block";
    targetInput.disabled = isGlobal;
    if (scope === "channel") {
      targetHintLabel.textContent = "(channel name)";
      targetHintText.textContent =
        "Leave empty to count every channel (per-channel counters). Enter a channel name to only react to that channel. 'all' is equivalent to empty.";
    } else if (scope === "profile") {
      targetHintLabel.textContent = "(profile name)";
      targetHintText.textContent =
        "Leave empty to count every profile (per-profile counters). Enter a profile name to only react to that profile. 'all' is equivalent to empty.";
    }
  };

  const updateModeSections = () => {
    const isAction = modeSelect.value === "action";
    actionSection.style.display = isAction ? "block" : "none";
    promptSection.style.display = isAction ? "none" : "block";
  };

  scopeSelect.addEventListener("change", updateScopeHints);
  modeSelect.addEventListener("change", updateModeSections);
  updateScopeHints();
  updateModeSections();

  // Close handlers
  modal.querySelector("#hook-modal-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#hook-modal-cancel")?.addEventListener("click", () => modal.remove());
  modal.addEventListener("mousedown", (e) => {
    if (e.target === modal) modal.remove();
  });

  // ── Save handler ──
  modal.querySelector("#hook-modal-save")?.addEventListener("click", async () => {
    const saveBtn = modal.querySelector("#hook-modal-save") as HTMLButtonElement;
    const nameInput = modal.querySelector("#hook-name") as HTMLInputElement;
    const displayInput = modal.querySelector("#hook-display") as HTMLInputElement;
    const event = (modal.querySelector("#hook-event") as HTMLSelectElement).value;
    const scope = (modal.querySelector("#hook-scope") as HTMLSelectElement).value;
    const target = (modal.querySelector("#hook-target") as HTMLInputElement).value.trim();
    const countRaw = (modal.querySelector("#hook-count") as HTMLInputElement).value.trim();
    const mode = (modal.querySelector("#hook-mode") as HTMLSelectElement).value;
    const action_id = (modal.querySelector("#hook-action") as HTMLSelectElement).value;
    const prompt = (modal.querySelector("#hook-prompt") as HTMLTextAreaElement).value.trim();
    const profile = (modal.querySelector("#hook-profile") as HTMLSelectElement).value;
    const channelVal = (modal.querySelector("#hook-channel") as HTMLSelectElement).value;
    const planning_mode = (modal.querySelector("#hook-planning") as HTMLSelectElement).value;
    const plan = (modal.querySelector("#hook-plan") as HTMLInputElement).checked;
    const template = (modal.querySelector("#hook-template") as HTMLInputElement).value.trim();
    const enabled = (modal.querySelector("#hook-enabled") as HTMLInputElement).checked;

    // ── Validation ──
    let name = nameInput.value.trim();
    const display_name = displayInput.value.trim();
    if (!display_name && !name) {
      showToast("Display Name is required", "error");
      return;
    }
    if (isEdit) {
      name = cur.name;
    } else if (!name) {
      name = display_name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (!name) name = "unnamed";
      if (existingHooks.some((h: Record<string, unknown>) => h.id === name || h.name === name)) {
        name = name + "-" + Date.now();
      }
    }
    if (!event) {
      showToast("Event is required", "error");
      return;
    }
    const count = parseInt(countRaw, 10);
    if (!countRaw || Number.isNaN(count) || count < 1) {
      showToast("Trigger count must be an integer >= 1", "error");
      return;
    }
    if (mode === "action" && !action_id) {
      showToast("Action mode requires an Action ID", "error");
      return;
    }
    if (mode === "agentic" && scope === "channel" && !target && !channelVal) {
      showToast("Channel-scope agentic hooks need a target channel name or a Channel", "error");
      return;
    }

    const body: Record<string, unknown> = {
      name,
      display_name: display_name || name,
      event,
      scope,
      target: scope === "global" ? "" : target,
      count,
      mode,
      prompt,
      action_id,
      profile,
      channel_id: channelVal ? Number(channelVal) : null,
      planning_mode,
      plan,
      template,
      enabled,
    };

    saveBtn.disabled = true;
    try {
      const hookId = isEdit ? cur.id : "";
      const res = isEdit
        ? await fetch(`/api/hooks/${encodeURIComponent(hookId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/hooks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error(await res.text());
      showToast(isEdit ? "Hook updated" : "Hook created", "success");
      modal.remove();
      onReload();
    } catch (e) {
      showToast("Failed: " + formatApiError(e), "error");
      saveBtn.disabled = false;
    }
  });
}
