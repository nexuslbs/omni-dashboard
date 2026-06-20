import { apiGet } from "../lib/api";

export function renderProfiles(container: HTMLElement): void {
  const currentRoute = window.location.pathname.slice(1) || "settings";
  container.innerHTML = `
    <div class="settings-tabs">
      <a href="/settings" class="settings-tab ${currentRoute === "settings" ? "active" : ""}" data-route="settings">Settings</a>
      <a href="/profiles" class="settings-tab ${currentRoute === "profiles" ? "active" : ""}" data-route="profiles">Profiles</a>
      <a href="/channels" class="settings-tab ${currentRoute === "channels" ? "active" : ""}" data-route="channels">Channels</a>
      <a href="/platforms" class="settings-tab ${currentRoute === "platforms" ? "active" : ""}" data-route="platforms">Platforms</a>
    </div>
    <div id="profiles-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading profiles...</div>
    </div>
  `;
  void loadProfiles();
}

function loadProfiles(): Promise<void> {
  const content = document.getElementById("profiles-content")!;
  return apiGet<any[]>("/profiles")
    .then((profiles) => {
      content.innerHTML = renderProfilesPage(profiles);
      wireProfiles();
    })
    .catch((e) => {
      content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load profiles: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
    });
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
            ${renderEditableField("provider", p.provider || "", p.name)}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            ${renderEditableField("model", p.model || "", p.name)}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Allowed Tools</div>
            ${renderToolSelect(p.name, p.allowed_tools || [], p.all_tools || [])}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Skills</div>
            <div class="setting-readonly-value">
              ${renderSkillsList(p.skills)}
              <div class="text-muted" style="font-size:0.75rem;margin-top:0.25rem;">
                Skills are stored on the filesystem at <code>profiles/${escapeHtml(p.name)}/skills/</code>. Add or remove files there to manage skills.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderSkillsList(skills: string[]): string {
  if (!skills || skills.length === 0) {
    return '<span class="text-muted" style="font-size:0.85rem;">No skills found on filesystem</span>';
  }
  return `<div class="channel-tag-list">${skills
    .map((s) => `<span class="channel-tag">${escapeHtml(s)}</span>`)
    .join("")}</div>`;
}

function renderEditableField(field: string, value: string, profileName: string): string {
  const inputId = `prof-${field}-${escapeHtml(profileName)}`;
  return `
    <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:wrap;">
      <input type="text" id="${inputId}" class="filter-input profile-edit-input"
        value="${escapeHtml(value)}" style="min-width:140px;max-width:240px;"
        data-profile-name="${escapeHtml(profileName)}" data-field="${field}" data-original="${escapeHtml(value)}" />
      <button type="button" class="profile-edit-confirm" data-profile-name="${escapeHtml(profileName)}" data-field="${field}" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#10b981;padding:0;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="profile-edit-cancel" data-profile-name="${escapeHtml(profileName)}" data-field="${field}" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#f43f5e;padding:0;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
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
        <button type="button" class="profile-tools-save btn btn-sm" data-profile-name="${escapeHtml(profileName)}" style="display:none;background:var(--accent);color:white;border:none;border-radius:4px;padding:0.25rem 0.75rem;cursor:pointer;font-size:0.8rem;">Save Tools</button>
        <button type="button" class="profile-tools-reset btn btn-sm" data-profile-name="${escapeHtml(profileName)}" style="display:none;background:rgba(255,255,255,0.1);color:var(--text-secondary);border:1px solid var(--glass-border);border-radius:4px;padding:0.25rem 0.75rem;cursor:pointer;font-size:0.8rem;">Reset to Defaults</button>
      </div>
    </div>
  `;
}

function wireProfiles(): void {
  // ── Text field edits ──
  document.querySelectorAll(".profile-edit-input").forEach((el) => {
    const input = el as HTMLInputElement;
    input.addEventListener("input", () => {
      const profileName = input.getAttribute("data-profile-name");
      const field = input.getAttribute("data-field");
      const original = input.getAttribute("data-original") || "";
      const confirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const cancelBtn = document.querySelector(
        `.profile-edit-cancel[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const changed = input.value !== original;
      if (confirmBtn) confirmBtn.style.display = changed ? "inline-flex" : "none";
      if (cancelBtn) cancelBtn.style.display = changed ? "inline-flex" : "none";
    });
  });

  // Confirm text edits
  document.querySelectorAll(".profile-edit-confirm").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      const field = btn.getAttribute("data-field");
      if (!profileName || !field) return;
      const input = document.querySelector(
        `.profile-edit-input[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLInputElement | null;
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

  // Cancel text edits
  document.querySelectorAll(".profile-edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const profileName = btn.getAttribute("data-profile-name");
      const field = btn.getAttribute("data-field");
      if (!profileName || !field) return;
      const input = document.querySelector(
        `.profile-edit-input[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLInputElement | null;
      if (!input) return;
      input.value = input.getAttribute("data-original") || "";
      (btn as HTMLElement).style.display = "none";
      const confirmBtn = document.querySelector(
        `.profile-edit-confirm[data-profile-name="${profileName}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      if (confirmBtn) confirmBtn.style.display = "none";
    });
  });

  // ── Tool chips ──
  document.querySelectorAll(".tool-chip-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const profileName = cb.getAttribute("data-profile-name");
      toggleToolChip(profileName);
    });
  });

  // Tool save button
  document.querySelectorAll(".profile-tools-save").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const profileName = btn.getAttribute("data-profile-name");
      if (!profileName) return;
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
        // Update origins
        updateToolOrigins(profileName, selected);
        hideToolButtons(profileName);
        (window as any).showToast?.("Tools updated", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
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
        // Reload page to reflect defaults
        await loadProfiles();
        (window as any).showToast?.("Tools reset to defaults", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });
}

// ── Tool helpers ──

function toggleToolChip(profileName: string | null): void {
  if (!profileName) return;
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return;
  group.querySelectorAll(".tool-chip").forEach((chip) => {
    const cb = chip.querySelector(".tool-chip-cb") as HTMLInputElement;
    chip.classList.toggle("tool-chip-active", cb.checked);
  });
  // Show save/reset buttons when any checkbox changes
  const changed = hasToolChanges(profileName);
  const saveBtn = document.querySelector(
    `.profile-tools-save[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  const resetBtn = document.querySelector(
    `.profile-tools-reset[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  if (saveBtn) saveBtn.style.display = changed ? "inline-block" : "none";
  if (resetBtn) resetBtn.style.display = changed ? "inline-block" : "none";
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

function hasToolChanges(profileName: string): boolean {
  // Compare current selection to the original active state
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return false;
  let changed = false;
  group.querySelectorAll(".tool-chip-cb").forEach((cb) => {
    const chip = cb.closest(".tool-chip") as HTMLElement;
    const wasActive = chip.classList.contains("tool-chip-active");
    const isChecked = (cb as HTMLInputElement).checked;
    if (wasActive !== isChecked) changed = true;
  });
  return changed;
}

function updateToolOrigins(profileName: string, selected: string[]): void {
  const group = document.querySelector(`.tool-chip-group[data-profile-name="${profileName}"]`);
  if (!group) return;
  group.querySelectorAll(".tool-chip").forEach((chip) => {
    const tool = chip.getAttribute("data-tool");
    const active = selected.includes(tool || "");
    chip.classList.toggle("tool-chip-active", active);
    const cb = chip.querySelector(".tool-chip-cb") as HTMLInputElement;
    if (cb) cb.checked = active;
  });
}

function hideToolButtons(profileName: string): void {
  const saveBtn = document.querySelector(
    `.profile-tools-save[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  const resetBtn = document.querySelector(
    `.profile-tools-reset[data-profile-name="${profileName}"]`,
  ) as HTMLElement | null;
  if (saveBtn) saveBtn.style.display = "none";
  if (resetBtn) resetBtn.style.display = "none";
}

let _lastLoadProfiles: (() => Promise<void>) | null = null;
// Re-export loadProfiles so buttons can call it
async function reloadProfiles(): Promise<void> {
  const content = document.getElementById("profiles-content")!;
  try {
    const profiles = await apiGet<any[]>("/profiles");
    content.innerHTML = renderProfilesPage(profiles);
    wireProfiles();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load profiles: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
