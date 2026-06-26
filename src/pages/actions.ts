import { apiGet, apiPost, apiPut, apiDelete } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";
import { escapeHtml } from "../lib/helpers";

// ── Types ──
interface Action {
  id: string;
  name: string;
  tool_name: string;
  params: Record<string, any>;
  enabled: boolean;
  is_builtin: boolean;
}

interface McpToolInfo {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

// ── State ──
let currentActions: Action[] = [];
let availableTools: McpToolInfo[] = [];

// ── Main render ──
export function renderActions(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Actions</h1>
        <p class="page-subtitle">Saved tool invocations — run without calling the agent</p>
      </div>
      <button id="btn-create-action" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ New Action</button>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Saved Actions</span>
      </div>
      <div class="card-body" id="actions-list">
        <div class="loading">Loading actions</div>
      </div>
    </div>
  `;

  document.getElementById("btn-create-action")!.addEventListener("click", () => {
    void showActionModal(null);
  });

  void loadActions();
}

// ── Load ──
async function loadActions(): Promise<void> {
  const listEl = document.getElementById("actions-list")!;
  try {
    const [actions, tools] = await Promise.all([
      apiGet<Action[]>("/actions"),
      apiGet<McpToolInfo[]>("/mcp/tools"),
    ]);
    currentActions = actions;
    availableTools = tools;
    renderActionList(listEl);
  } catch (e: any) {
    listEl.innerHTML = `<div class="error-state">Failed to load: ${escapeHtml(e?.message || "Unknown error")}</div>`;
  }
}

function renderActionList(listEl: HTMLElement): void {
  if (currentActions.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No actions saved. Click "+ New Action" to create one.</div>';
    return;
  }

  listEl.innerHTML = `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Tool</th>
            <th>Params</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${currentActions.map((a, i) => renderActionRow(a, i)).join("")}
        </tbody>
      </table>
    </div>
  `;

  // Wire Run/Edit/Toggle/Delete buttons
  currentActions.forEach((a, i) => {
    document.getElementById(`action-run-${i}`)?.addEventListener("click", () => void runAction(a, i));
    document.getElementById(`action-edit-${i}`)?.addEventListener("click", () => void showActionModal(a));
    document.getElementById(`action-toggle-${i}`)?.addEventListener("click", () => void toggleAction(a));
    document.getElementById(`action-delete-${i}`)?.addEventListener("click", () => void deleteAction(a));
  });
}

function renderActionRow(a: Action, i: number): string {
  const paramsStr =
    Object.keys(a.params).length > 0 ? escapeHtml(JSON.stringify(a.params)) : "<em>No params</em>";
  const isDisabled = !a.enabled;

  return `<tr class="${isDisabled ? "action-disabled" : ""}" style="${isDisabled ? "opacity:0.55" : ""}">
    <td><strong>${escapeHtml(a.name)}</strong>${isDisabled ? ' <span class="badge badge-neutral" style="font-size:0.7rem;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);padding:0.05rem 0.35rem;border-radius:4px;margin-left:0.35rem;vertical-align:middle">Disabled</span>' : ""}</td>
    <td><code>${escapeHtml(a.tool_name)}</code></td>
    <td style="font-size:0.8rem;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${paramsStr}</td>
    <td style="text-align:right;white-space:nowrap">
      <button class="btn btn-sm btn-primary" id="action-run-${i}" title="${isDisabled ? "Action is disabled" : "Run this action"}" ${isDisabled ? "disabled" : ""}>▶ Run</button>
      <button class="btn btn-sm btn-secondary" id="action-edit-${i}" title="Edit action">✎ Edit</button>
      <button class="btn btn-sm ${isDisabled ? "btn-primary" : "btn-warning"}" id="action-toggle-${i}" title="${isDisabled ? "Enable action" : "Disable action"}" style="${isDisabled ? "" : "background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#f59e0b"}">${isDisabled ? "▶ Enable" : "⏸ Disable"}</button>
      <button class="btn btn-sm btn-danger" id="action-delete-${i}" title="Delete action">🗑 Delete</button>
    </td>
  </tr>`;
}

// ── Run ──
async function runAction(action: Action, index: number): Promise<void> {
  const btn = document.getElementById(`action-run-${index}`) as HTMLButtonElement;
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = "Running...";
  try {
    const result = await apiPost<any>(`/actions/${action.id}/run`, {});
    const isError = result.is_error;
    const msg = isError
      ? `Failed: ${result.result || result.error || "Unknown error"}`
      : `Success: ${JSON.stringify(result.result || "Done")}`;
    // Show result in a modal
    showResultModal(action.name, msg, isError);
  } catch (e: any) {
    showResultModal(action.name, `Error: ${e?.message || "Request failed"}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ Run";
  }
}

// ── Create / Edit Modal ──
async function showActionModal(existing: Action | null): Promise<void> {
  const isEdit = existing !== null;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <h2>${isEdit ? "Edit Action" : "Create Action"}</h2>
        <button class="modal-close" id="modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="setting-row">
          <div class="setting-label">
            <div class="setting-name">Name</div>
          </div>
          <div class="setting-controls">
            <div class="setting-input-group">
              <input class="filter-input" id="action-name" type="text" value="${isEdit ? escapeHtml(existing!.name) : ""}" placeholder="My Action" />
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-label">
            <div class="setting-name">Tool</div>
          </div>
          <div class="setting-controls">
            <div class="setting-input-group">
              <select class="filter-select" id="action-tool">
                <option value="">— Select a tool —</option>
                ${availableTools
                  .map(
                    (t) =>
                      `<option value="${escapeHtml(t.name)}"${isEdit && existing!.tool_name === t.name ? " selected" : ""}>${escapeHtml(t.name)}</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
        </div>
        <div class="settings-section" id="action-params-section" style="display:none;margin-top:0.75rem;">
          <div class="setting-label" style="margin-bottom:0.5rem;">
            <div class="setting-name">Parameters</div>
          </div>
          <div id="action-params-form"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save" disabled>${isEdit ? "Update" : "Create"}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeModal = () => backdrop.remove();
  backdrop.querySelector("#modal-close")?.addEventListener("click", closeModal);
  backdrop.querySelector("#modal-cancel")?.addEventListener("click", closeModal);
  // Form modals MUST NOT close on outside click (user constraint)

  const nameInput = backdrop.querySelector("#action-name") as HTMLInputElement;
  const toolSelect = backdrop.querySelector("#action-tool") as HTMLSelectElement;
  const saveBtn = backdrop.querySelector("#modal-save") as HTMLButtonElement;
  const paramsSection = backdrop.querySelector("#action-params-section") as HTMLElement;
  const paramsForm = backdrop.querySelector("#action-params-form") as HTMLElement;

  enhanceSelectElement(toolSelect);

  // When tool is selected, show its parameters
  let currentParamValues: Record<string, string> = {};

  function updateParamsForm(): void {
    const toolName = toolSelect.value;
    const tool = availableTools.find((t) => t.name === toolName);
    const props = tool?.input_schema?.properties || {};
    if (!tool || Object.keys(props).length === 0) {
      paramsSection.style.display = "none";
      paramsForm.innerHTML = "";
      return;
    }

    paramsSection.style.display = "block";
    const schema = tool.input_schema;
    const properties = schema.properties || {};
    const required = new Set<string>(schema.required || []);

    let html = "";
    for (const [key, prop] of Object.entries<any>(properties)) {
      const value = currentParamValues[key] ?? "";
      const type = prop.type || "string";
      const isRequired = required.has(key);
      const label = `${escapeHtml(key)}${isRequired ? " *" : ""}`;
      const desc = prop.description
        ? `<span style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(prop.description)}</span>`
        : "";

      if (type === "boolean") {
        html += `<div class="setting-row">
          <div class="setting-label">
            <div class="setting-name">${label}</div>
            ${desc}
          </div>
          <div class="setting-controls">
            <div class="setting-input-group">
              <select class="filter-select param-input" data-key="${escapeHtml(key)}">
                <option value="true"${value === "true" ? " selected" : ""}>true</option>
                <option value="false"${value === "false" || !value ? " selected" : ""}>false</option>
              </select>
            </div>
          </div>
        </div>`;
      } else if (type === "array" && prop.items?.enum) {
        html += `<div class="setting-row">
          <div class="setting-label">
            <div class="setting-name">${label}</div>
            ${desc}
          </div>
          <div class="setting-controls">
            <div class="setting-input-group">
              <select class="filter-select param-input" data-key="${escapeHtml(key)}">
                ${prop.items.enum
                  .map(
                    (opt: string) =>
                      `<option value="${escapeHtml(opt)}"${value === opt ? " selected" : ""}>${escapeHtml(opt)}</option>`,
                  )
                  .join("")}
              </select>
            </div>
          </div>
        </div>`;
      } else if (type === "integer" || type === "number") {
        html += `<div class="setting-row">
          <div class="setting-label">
            <div class="setting-name">${label}</div>
            ${desc}
          </div>
          <div class="setting-controls">
            <div class="setting-input-group">
              <input class="filter-input param-input" data-key="${escapeHtml(key)}" type="tel" value="${escapeHtml(value)}" placeholder="${escapeHtml(key)}" />
            </div>
          </div>
        </div>`;
      } else {
        html += `<div class="setting-row">
          <div class="setting-label">
            <div class="setting-name">${label}</div>
            ${desc}
          </div>
          <div class="setting-controls">
            <div class="setting-input-group">
              <input class="filter-input param-input" data-key="${escapeHtml(key)}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(key)}" />
            </div>
          </div>
        </div>`;
      }
    }
    paramsForm.innerHTML = html;

    // Live-update param values on input
    paramsForm.querySelectorAll(".param-input").forEach((el) => {
      el.addEventListener("input", () => {
        currentParamValues[(el as HTMLElement).dataset.key || ""] = (el as HTMLInputElement).value;
        validateForm();
      });
      el.addEventListener("change", () => {
        currentParamValues[(el as HTMLElement).dataset.key || ""] = (el as HTMLInputElement).value;
        validateForm();
      });
    });
  }

  function validateForm(): void {
    const name = nameInput.value.trim();
    const tool = toolSelect.value;
    saveBtn.disabled = !name || !tool;
  }

  // Pre-populate params if editing
  if (isEdit && existing) {
    currentParamValues = {};
    for (const [k, v] of Object.entries(existing.params)) {
      currentParamValues[k] = String(v);
    }
  }

  toolSelect.addEventListener("change", () => {
    updateParamsForm();
    validateForm();
  });

  nameInput.addEventListener("input", validateForm);

  // Trigger initial param form population if editing
  if (isEdit && existing) {
    setTimeout(() => {
      updateParamsForm();
    }, 100);
  }

  // Save
  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const toolName = toolSelect.value;
    if (!name || !toolName) return;

    // Build params from the form
    const params: Record<string, any> = {};
    const tool = availableTools.find((t) => t.name === toolName);
    const properties = tool?.input_schema?.properties || {};
    for (const [key, prop] of Object.entries<any>(properties)) {
      const value = currentParamValues[key];
      if (value !== undefined && value !== "") {
        const type = prop.type || "string";
        if (type === "integer") {
          params[key] = parseInt(value, 10);
        } else if (type === "number") {
          params[key] = parseFloat(value);
        } else if (type === "boolean") {
          params[key] = value === "true";
        } else {
          params[key] = value;
        }
      }
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      if (isEdit) {
        await apiPut(`/actions/${existing!.id}`, { name, tool_name: toolName, params });
      } else {
        await apiPost("/actions", { name, tool_name: toolName, params });
      }
      closeModal();
      void loadActions();
    } catch (e: any) {
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? "Update" : "Create";
      alert(`Failed to save: ${e?.message || "Unknown error"}`);
    }
  });
}

// ── Delete ──
async function deleteAction(action: Action): Promise<void> {
  if (!confirm(`Delete action "${action.name}"?`)) return;
  try {
    await apiDelete(`/actions/${action.id}`);
    void loadActions();
  } catch (e: any) {
    alert(`Failed to delete: ${e?.message || "Unknown error"}`);
  }
}

// ── Toggle Enable/Disable ──
async function toggleAction(action: Action): Promise<void> {
  const newEnabled = !action.enabled;
  try {
    await apiPut(`/actions/${action.id}`, {
      name: action.name,
      tool_name: action.tool_name,
      params: action.params,
      enabled: newEnabled,
    });
    void loadActions();
  } catch (e: any) {
    alert(`Failed to toggle action: ${e?.message || "Unknown error"}`);
  }
}

// ── Result Modal ──
function showResultModal(name: string, message: string, isError: boolean): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h2>${isError ? "❌ Action Failed" : "✅ Action Executed"}</h2>
        <button class="modal-close" id="result-modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <p><strong>${escapeHtml(name)}</strong></p>
        <pre style="background:var(--bg-secondary, #0f1629);padding:0.75rem;border-radius:6px;font-size:0.8rem;overflow-x:auto;white-space:pre-wrap;word-break:break-word;color:${isError ? "var(--danger, #f43f5e)" : "var(--text-primary, #e2e8f0)"}">${escapeHtml(message)}</pre>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="result-modal-ok">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector("#result-modal-close")?.addEventListener("click", close);
  backdrop.querySelector("#result-modal-ok")?.addEventListener("click", close);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
}
