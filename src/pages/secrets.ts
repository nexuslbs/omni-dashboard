import { apiGet, apiPost, apiPut, apiDelete } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";
import { escapeHtml, formatDate } from "../lib/helpers";

export function renderSecrets(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Secrets</h1>
        <p class="page-subtitle">User-managed key/value store with versioning</p>
      </div>
      <button id="add-secret-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Add Secret</button>
    </div>
    <div id="secrets-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading secrets...</div>
    </div>
  `;

  document.getElementById("add-secret-btn")?.addEventListener("click", () => showCreateModal());

  void loadSecrets();
}

// ── Types ──

interface SecretEntry {
  id: number;
  name: string;
  field_type: string;
  current_value: string;
  created_at: string;
  updated_at: string;
}

interface SecretVersion {
  id: number;
  version_number: number;
  value: string;
  created_at: string;
}

// ── State ──

interface ChangedSecret {
  newValue: string;
  originalValue: string;
}
const changedSecrets = new Map<string, ChangedSecret>();

// ── Load ──

async function loadSecrets(): Promise<void> {
  const content = document.getElementById("secrets-content")!;
  try {
    const response = await apiGet<any>("/secrets");
    const secrets: SecretEntry[] = response.data || [];
    changedSecrets.clear();
    content.innerHTML =
      secrets.length === 0
        ? '<div class="empty-state" style="padding:2rem;text-align:center;color:var(--text-muted);">No secrets yet. Click "+ Add Secret" to create one.</div>'
        : renderSecretsPage(secrets);
    wireSecrets();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load secrets: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderSecretsPage(secrets: SecretEntry[]): string {
  return secrets.map((s) => renderSecretRow(s)).join("");
}

function renderSecretRow(s: SecretEntry): string {
  const name = s.name;
  const value = s.current_value;
  const fieldType = s.field_type;
  const inputId = `secret-${escapeHtml(name)}`;
  const safeName = CSS.escape(name);

  const isPassword = fieldType === "password";

  const inputHtml = `
    <div class="setting-secret-wrapper" style="flex:1;">
      <input type="${isPassword ? "password" : "text"}" id="${inputId}" class="filter-input setting-input setting-secret-input"
        value="${escapeHtml(value)}"
        data-name="${escapeHtml(name)}" data-original="${escapeHtml(value)}" style="flex:1;" />
      ${
        isPassword
          ? `<button type="button" class="setting-secret-toggle" title="Toggle visibility" data-target="${inputId}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>`
          : ""
      }
    </div>
  `;

  // Actions row: confirm/cancel (for value changes) + versions + delete
  const actionsHtml = `
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
    <button type="button" class="secret-versions-btn" title="View version history" data-name="${escapeHtml(name)}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0.25rem;font-size:0.9rem;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    </button>
    <button type="button" class="secret-delete-btn" title="Delete secret" data-name="${escapeHtml(name)}" style="background:none;border:none;color:var(--accent-rose);cursor:pointer;padding:0.25rem;font-size:0.9rem;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
  `;

  const typeBadge =
    fieldType === "password"
      ? `<span class="badge badge-neutral" style="vertical-align:middle;font-size:0.75rem;margin-left:0.5rem;">password</span>`
      : `<span class="badge badge-info" style="vertical-align:middle;font-size:0.75rem;margin-left:0.5rem;">text</span>`;

  return `
    <div class="card settings-card" data-secret-name="${escapeHtml(name)}">
      <div class="card-body" style="padding:0;">
        <div class="setting-row" data-name="${safeName}">
          <div class="setting-label">
            <div class="setting-name">${escapeHtml(name)}${typeBadge}</div>
            <div class="setting-description" style="color:var(--text-muted);font-size:0.75rem;">
              Updated: ${escapeHtml(formatDate(s.updated_at))}
            </div>
          </div>
          <div class="setting-controls">
            <div class="setting-input-group">
              ${inputHtml}
              <div style="display:flex;gap:0.25rem;align-items:center;">
                ${actionsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

// ── Wiring ──

function wireSecrets(): void {
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

  // Change detection
  document.querySelectorAll(".setting-input").forEach((el) => {
    const input = el as HTMLInputElement;
    const name = input.getAttribute("data-name");
    if (!name) return;

    const handler = () => {
      const original = input.getAttribute("data-original") || "";
      const currentVal = input.value;
      const actionsEl = document.querySelector(`#actions-${CSS.escape(name)}`) as HTMLElement | null;

      if (currentVal !== original) {
        changedSecrets.set(name, { newValue: currentVal, originalValue: original });
        if (actionsEl) actionsEl.style.display = "flex";
      } else {
        changedSecrets.delete(name);
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
      const entry = changedSecrets.get(name);
      if (!entry) return;
      void saveSecret(name, entry.newValue);
    });
  });

  // Cancel buttons
  document.querySelectorAll(".setting-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      if (!name) return;
      changedSecrets.delete(name);
      const input = document.querySelector(
        `.setting-input[data-name="${CSS.escape(name)}"]`,
      ) as HTMLInputElement | null;
      if (input) {
        const original = input.getAttribute("data-original") || "";
        input.value = original;
      }
      const actionsEl = document.querySelector(`#actions-${CSS.escape(name)}`) as HTMLElement | null;
      if (actionsEl) actionsEl.style.display = "none";
    });
  });

  // Versions buttons
  document.querySelectorAll(".secret-versions-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      if (!name) return;
      void showVersionsModal(name);
    });
  });

  // Delete buttons
  document.querySelectorAll(".secret-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      if (!name) return;
      if (!confirm(`Delete secret "${name}"? This cannot be undone.`)) return;
      void deleteSecret(name);
    });
  });
}

// ── API Calls ──

async function saveSecret(name: string, value: string): Promise<void> {
  try {
    await apiPut(`/secrets/${encodeURIComponent(name)}`, { value });
    const input = document.querySelector(
      `.setting-input[data-name="${CSS.escape(name)}"]`,
    ) as HTMLInputElement | null;
    if (input) {
      input.setAttribute("data-original", value);
    }
    changedSecrets.delete(name);
    const actionsEl = document.querySelector(`#actions-${CSS.escape(name)}`) as HTMLElement | null;
    if (actionsEl) actionsEl.style.display = "none";
    (window as any).showToast?.("Secret updated", "success");
  } catch (e) {
    (window as any).showToast?.(
      "Failed to save: " + (e instanceof Error ? e.message : "Unknown error"),
      "error",
    );
  }
}

async function deleteSecret(name: string): Promise<void> {
  try {
    await apiDelete(`/secrets/${encodeURIComponent(name)}`);
    (window as any).showToast?.("Secret deleted", "success");
    void loadSecrets();
  } catch (e) {
    (window as any).showToast?.("Failed to delete: " + (e instanceof Error ? e.message : "Unknown"), "error");
  }
}

// ── Versions Modal ──

async function showVersionsModal(name: string): Promise<void> {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:10vh;";

  backdrop.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:12px;width:560px;max-width:90vw;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.5);">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <h2 style="font-size:1.1rem;margin:0;color:var(--text-primary);">Version History: ${escapeHtml(name)}</h2>
        <button class="modal-close-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;padding:0.25rem;">✕</button>
      </div>
      <div id="versions-list" style="padding:1.25rem;overflow-y:auto;flex:1;">
        <div style="text-align:center;padding:2rem;color:var(--text-muted);">Loading...</div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector(".modal-close-btn")?.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  try {
    const response = await apiGet<any>(`/secrets/${encodeURIComponent(name)}/versions`);
    const versions: SecretVersion[] = response.data || [];
    const listEl = backdrop.querySelector("#versions-list")!;

    if (versions.length === 0) {
      listEl.innerHTML =
        '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No previous versions.</div>';
      return;
    }

    listEl.innerHTML = versions
      .map((v, i) => {
        const isLatest = i === 0;
        const fieldId = `ver-${v.id}`;
        return `
          <div style="margin-bottom:0.75rem;${i > 0 ? "border-top:1px solid var(--glass-border);padding-top:0.75rem;" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.375rem;">
              <span style="font-size:0.875rem;font-weight:600;color:var(--text-secondary);">v${v.version_number}${isLatest ? ' <span class="badge badge-success" style="font-size:0.65rem;">current</span>' : ""}</span>
              <span style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(formatDate(v.created_at))}</span>
            </div>
            <div class="setting-secret-wrapper">
              <input type="password" id="${fieldId}" class="filter-input setting-input" value="${escapeHtml(v.value)}" readonly style="flex:1;font-size:0.8rem;" />
              <button type="button" class="setting-secret-toggle" title="Toggle visibility" data-target="${fieldId}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    // Wire version eye toggles
    listEl.querySelectorAll(".setting-secret-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        if (!targetId) return;
        const input = document.getElementById(targetId) as HTMLInputElement | null;
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
      });
    });
  } catch (e) {
    const listEl = backdrop.querySelector("#versions-list")!;
    listEl.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--accent-rose);">Failed to load versions: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Create Modal ──

function showCreateModal(): void {
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;";

  backdrop.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:12px;width:480px;max-width:90vw;box-shadow:0 12px 48px rgba(0,0,0,0.5);">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:1.1rem;margin:0;color:var(--text-primary);">Add Secret</h2>
        <button class="modal-close-btn" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;padding:0.25rem;">✕</button>
      </div>
      <div style="padding:1.25rem;">
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Name <span style="color:var(--accent-rose);">*</span></label>
          <input id="new-secret-name" type="text" class="filter-input" placeholder="e.g. MY_API_KEY" style="width:100%;" autocomplete="off" />
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Type</label>
          <select id="new-secret-type" class="filter-select" style="width:100%;">
            <option value="password" selected>Password (masked by default)</option>
            <option value="text">Text (visible by default)</option>
          </select>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Value <span style="color:var(--accent-rose);">*</span></label>
          <div class="setting-secret-wrapper">
            <input id="new-secret-value" type="password" class="filter-input" placeholder="Enter secret value" style="width:100%;flex:1;" />
            <span id="new-secret-toggle-wrap">
              <button type="button" class="setting-secret-toggle" title="Toggle visibility" data-target="new-secret-value">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </span>
          </div>
        </div>
        <div id="create-status" style="display:none;padding:0.5rem;border-radius:6px;font-size:0.85rem;margin-bottom:0.75rem;"></div>
      </div>
      <div style="padding:1rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;justify-content:flex-end;gap:0.5rem;">
        <button class="modal-cancel-btn" style="background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">Cancel</button>
        <button id="create-secret-confirm-btn" style="background:var(--accent-purple);border:none;color:white;border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;font-weight:500;">Create</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Wire close
  backdrop.querySelector(".modal-close-btn")?.addEventListener("click", () => backdrop.remove());
  backdrop.querySelector(".modal-cancel-btn")?.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // Enhance type select to styled custom dropdown
  const typeSelect = backdrop.querySelector("#new-secret-type") as HTMLSelectElement;
  enhanceSelectElement(typeSelect);

  // Wire secret toggle in create modal
  backdrop.querySelector(".setting-secret-toggle")?.addEventListener("click", () => {
    const input = document.getElementById("new-secret-value") as HTMLInputElement | null;
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  });

  // Wire type change to update value field type and toggle eye icon
  const valueInput = backdrop.querySelector("#new-secret-value") as HTMLInputElement;
  const toggleWrap = backdrop.querySelector("#new-secret-toggle-wrap") as HTMLElement;
  typeSelect.addEventListener("change", () => {
    const isPassword = typeSelect.value === "password";
    valueInput.type = isPassword ? "password" : "text";
    toggleWrap.style.display = isPassword ? "inline" : "none";
  });

  // Wire create
  const createBtn = backdrop.querySelector("#create-secret-confirm-btn") as HTMLButtonElement;
  const statusEl = backdrop.querySelector("#create-status") as HTMLElement;

  createBtn.addEventListener("click", async () => {
    const name = (document.getElementById("new-secret-name") as HTMLInputElement).value.trim();
    const fieldType = typeSelect.value;
    const value = valueInput.value;

    if (!name) {
      showStatus(statusEl, "Name is required", "error");
      return;
    }
    if (!value) {
      showStatus(statusEl, "Value is required", "error");
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = "Creating...";

    try {
      await apiPost("/secrets", { name, fieldType, value });
      backdrop.remove();
      (window as any).showToast?.("Secret created", "success");
      void loadSecrets();
    } catch (e) {
      showStatus(statusEl, "Error: " + (e instanceof Error ? e.message : "Unknown error"), "error");
      createBtn.disabled = false;
      createBtn.textContent = "Create";
    }
  });
}

function showStatus(el: HTMLElement, message: string, type: "success" | "error" | "info"): void {
  el.style.display = "block";
  el.textContent = message;
  const colors: Record<string, string> = {
    success: "background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);",
    error: "background:rgba(244,63,94,0.15);color:#fb7185;border:1px solid rgba(244,63,94,0.3);",
    info: "background:rgba(6,182,212,0.15);color:#22d3ee;border:1px solid rgba(6,182,212,0.3);",
  };
  el.style.cssText += colors[type] || colors.info;
}
