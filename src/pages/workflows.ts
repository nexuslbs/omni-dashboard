import { showToast } from "../lib/utils";
import {
  fetchWorkflows,
  upsertWorkflow,
  deleteWorkflow,
  type Workflow,
  type WorkflowEntry,
  type WorkflowRoleConfig,
} from "../lib/api";
import { escapeHtml, formatApiError } from "../lib/helpers";

const ROLE_KEYS = ["executor", "tester", "reviewer"] as const;

export function renderWorkflows(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Workflows</h1>
        <p class="page-subtitle">Workflow definitions — stored in <code>workflows.yml</code> (OMNI_DIR); no database tables</p>
      </div>
    </div>
    <div class="wf-precedence">
      <strong>Field precedence:</strong> workflow role &gt; workflow field &gt; kanban task &gt; channel &gt; global.
      A per-role <code>template</code> falls back to the kanban task template, then the channel template, then the global template.
    </div>
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;">
      <button id="wf-new-btn" class="btn btn-primary">+ New Workflow</button>
      <span class="db-hint">Changes are written to workflows.yml and apply on save.</span>
    </div>
    <div id="workflow-form-wrap" style="display:none;"></div>
    <div id="workflows-content"><div class="loading" style="padding:3rem;text-align:center;">Loading workflows...</div></div>
  `;
  const newBtn = document.getElementById("wf-new-btn");
  newBtn?.addEventListener("click", () => openForm(null));
  void loadWorkflows();
}

// ── State ──

let currentWorkflows: WorkflowEntry[] = [];
let editingKey: string | null = null;

// ── List ──

async function loadWorkflows(): Promise<void> {
  const content = document.getElementById("workflows-content");
  if (!content) return;
  try {
    currentWorkflows = await fetchWorkflows();
    content.innerHTML = renderWorkflowList(currentWorkflows);
    wireListActions(content);
  } catch (e) {
    content.innerHTML = `<div class="empty-state" style="color:#e55;">Failed to load workflows: ${escapeHtml(formatApiError(e))}</div>`;
  }
}

function renderWorkflowList(entries: WorkflowEntry[]): string {
  if (entries.length === 0) {
    return `<div class="empty-state" style="padding:3rem;text-align:center;color:#99a;">
      No workflows yet. Create one with “New Workflow” — workflows.yml doesn’t exist until you save.
    </div>`;
  }
  return entries.map(renderWorkflowCard).join("");
}

function renderWorkflowCard(entry: WorkflowEntry): string {
  const wf = entry.workflow ?? {};
  const roles = wf.roles ?? {};
  const clearBadge = wf.clear_executions_on_review
    ? `<span class="wf-badge">clear executions on review</span>`
    : "";
  const summary = [
    wf.profile ? `profile ${wf.profile}` : null,
    wf.provider ? `provider ${wf.provider}` : null,
    wf.model ? `model ${wf.model}` : null,
    wf.retries !== undefined && wf.retries !== null ? `retries ${wf.retries}` : null,
    wf.plan_mode ? `plan_mode ${wf.plan_mode}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const roleChips = ROLE_KEYS.map((role) => {
    const cfg = roles[role];
    if (!cfg) return "";
    const tpl = cfg.template ? escapeHtml(cfg.template) : "<em>no template</em>";
    return `<span class="wf-role"><strong>${role}</strong> ${tpl}</span>`;
  }).join("");
  const extraRoles = Object.keys(roles)
    .filter((k) => !(ROLE_KEYS as readonly string[]).includes(k))
    .map((k) => `<span class="wf-role"><strong>${escapeHtml(k)}</strong></span>`)
    .join("");
  return `
    <div class="card wf-card" style="margin-bottom:.75rem;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;">
        <div style="min-width:0;">
          <span class="wf-key">${escapeHtml(entry.key)}</span> ${clearBadge}
          ${summary ? `<div class="wf-sub" style="color:#99a;font-size:.82rem;">${escapeHtml(summary)}</div>` : ""}
        </div>
        <div style="display:flex;gap:.5rem;flex-shrink:0;">
          <button class="btn btn-sm wf-edit" data-key="${escapeHtml(entry.key)}">Edit</button>
          <button class="btn btn-sm btn-danger wf-delete" data-key="${escapeHtml(entry.key)}">Delete</button>
        </div>
      </div>
      ${roleChips || extraRoles ? `<div class="card-body" style="display:flex;flex-wrap:wrap;gap:.4rem;">${roleChips}${extraRoles}</div>` : ""}
    </div>`;
}

function wireListActions(content: HTMLElement): void {
  content.querySelectorAll<HTMLButtonElement>(".wf-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const entry = currentWorkflows.find((e) => e.key === btn.dataset.key);
      if (entry) openForm(entry);
    });
  });
  content.querySelectorAll<HTMLButtonElement>(".wf-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key ?? "";
      void handleDelete(key);
    });
  });
}

async function handleDelete(key: string): Promise<void> {
  if (!confirm(`Delete workflow "${key}" from workflows.yml?`)) return;
  try {
    await deleteWorkflow(key);
    showToast(`Workflow "${key}" deleted`);
    void loadWorkflows();
  } catch (e) {
    showToast(`Failed to delete workflow: ${formatApiError(e)}`, "error");
  }
}

// ── Form ──

function openForm(entry: WorkflowEntry | null): void {
  editingKey = entry ? entry.key : null;
  const wrap = document.getElementById("workflow-form-wrap");
  if (!wrap) return;
  const wf = entry?.workflow ?? {};
  const roles = wf.roles ?? {};
  wrap.innerHTML = renderForm(editingKey ?? "", wf, roles);
  wrap.style.display = "block";
  const saveBtn = document.getElementById("wf-save-btn");
  saveBtn?.addEventListener("click", () => void handleSave());
  const cancelBtn = document.getElementById("wf-cancel-btn");
  cancelBtn?.addEventListener("click", closeForm);
  wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeForm(): void {
  const wrap = document.getElementById("workflow-form-wrap");
  if (wrap) {
    wrap.style.display = "none";
    wrap.innerHTML = "";
  }
  editingKey = null;
}

function renderForm(key: string, wf: Workflow, roles: Record<string, WorkflowRoleConfig>): string {
  const v = (s?: string | number | boolean | null) => escapeHtml(s === undefined || s === null ? "" : String(s));
  const roleSections = ROLE_KEYS.map((role) => {
    const cfg = roles[role] ?? {};
    const hint =
      role === "executor"
        ? `<span class="db-hint">required role</span>`
        : `<span class="db-hint">template required when defined</span>`;
    return `
      <details class="wf-role-details" ${role === "executor" ? "open" : ""} style="margin-bottom:.6rem;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.6rem .8rem;">
        <summary style="cursor:pointer;font-weight:600;">${role} ${hint}</summary>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem;margin-top:.6rem;">
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Template
            <input class="filter-input wf-role-template" data-role="${role}" placeholder="path/to/template.md" value="${v(cfg.template)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Profile
            <input class="filter-input wf-role-profile" data-role="${role}" placeholder="omni" value="${v(cfg.profile)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Provider
            <input class="filter-input wf-role-provider" data-role="${role}" placeholder="openai" value="${v(cfg.provider)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Model
            <input class="filter-input wf-role-model" data-role="${role}" placeholder="gpt-4o" value="${v(cfg.model)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Retries
            <input class="filter-input wf-role-retries" data-role="${role}" type="number" min="0" placeholder="2" value="${v(cfg.retries)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Plan mode
            <input class="filter-input wf-role-plan-mode" data-role="${role}" placeholder="auto" value="${v(cfg.plan_mode)}">
          </label>
        </div>
      </details>`;
  }).join("");
  return `
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-header">
        <span class="card-title">${editingKey ? "Edit workflow" : "New workflow"}</span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem;margin-bottom:.75rem;">
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Name (workflow key)
            <input id="wf-key" class="filter-input" placeholder="default" value="${v(key)}" ${editingKey ? "disabled" : ""}>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default profile
            <input id="wf-profile" class="filter-input" placeholder="omni" value="${v(wf.profile)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default provider
            <input id="wf-provider" class="filter-input" placeholder="openai" value="${v(wf.provider)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default model
            <input id="wf-model" class="filter-input" placeholder="gpt-4o" value="${v(wf.model)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default retries
            <input id="wf-retries" class="filter-input" type="number" min="0" placeholder="2" value="${v(wf.retries)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default plan mode
            <input id="wf-plan-mode" class="filter-input" placeholder="auto" value="${v(wf.plan_mode)}">
          </label>
        </div>
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.9rem;font-size:.88rem;">
          <input id="wf-clear-exec" type="checkbox" ${wf.clear_executions_on_review ? "checked" : ""}>
          Clear workflow executions when the task moves to review (<code>clear_executions_on_review</code>, default off)
        </label>
        <div style="margin-bottom:.5rem;font-weight:600;">Roles</div>
        ${roleSections}
        <div id="wf-form-error" style="display:none;color:#e55;font-size:.85rem;margin:.5rem 0;"></div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;">
          <button id="wf-save-btn" class="btn btn-primary">Save Workflow</button>
          <button id="wf-cancel-btn" class="btn">Cancel</button>
        </div>
      </div>
    </div>`;
}

function formError(message: string): void {
  const el = document.getElementById("wf-form-error");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
}

function collectRole(role: string): WorkflowRoleConfig {
  const cfg: WorkflowRoleConfig = {};
  const template = document.querySelector<HTMLInputElement>(`.wf-role-template[data-role="${role}"]`)?.value.trim() ?? "";
  const profile = document.querySelector<HTMLInputElement>(`.wf-role-profile[data-role="${role}"]`)?.value.trim() ?? "";
  const provider = document.querySelector<HTMLInputElement>(`.wf-role-provider[data-role="${role}"]`)?.value.trim() ?? "";
  const model = document.querySelector<HTMLInputElement>(`.wf-role-model[data-role="${role}"]`)?.value.trim() ?? "";
  const retries = document.querySelector<HTMLInputElement>(`.wf-role-retries[data-role="${role}"]`)?.value.trim() ?? "";
  const planMode = document.querySelector<HTMLInputElement>(`.wf-role-plan-mode[data-role="${role}"]`)?.value.trim() ?? "";
  if (template) cfg.template = template;
  if (profile) cfg.profile = profile;
  if (provider) cfg.provider = provider;
  if (model) cfg.model = model;
  if (retries !== "") {
    const n = Number(retries);
    if (!Number.isNaN(n)) cfg.retries = n;
  }
  if (planMode) cfg.plan_mode = planMode;
  return cfg;
}

function isEmptyRole(cfg: WorkflowRoleConfig): boolean {
  return !cfg.template && !cfg.profile && !cfg.provider && !cfg.model && cfg.retries === undefined && !cfg.plan_mode;
}

async function handleSave(): Promise<void> {
  formError("");
  const keyInput = document.getElementById("wf-key") as HTMLInputElement | null;
  const key = (keyInput?.value ?? (editingKey ?? "")).trim();
  if (!key) {
    formError("Workflow name is required.");
    return;
  }
  const workflow: Workflow = {};
  const profile = (document.getElementById("wf-profile") as HTMLInputElement | null)?.value.trim() ?? "";
  const provider = (document.getElementById("wf-provider") as HTMLInputElement | null)?.value.trim() ?? "";
  const model = (document.getElementById("wf-model") as HTMLInputElement | null)?.value.trim() ?? "";
  const planMode = (document.getElementById("wf-plan-mode") as HTMLInputElement | null)?.value.trim() ?? "";
  const retriesRaw = (document.getElementById("wf-retries") as HTMLInputElement | null)?.value.trim() ?? "";
  if (profile) workflow.profile = profile;
  if (provider) workflow.provider = provider;
  if (model) workflow.model = model;
  if (planMode) workflow.plan_mode = planMode;
  if (retriesRaw !== "") {
    const n = Number(retriesRaw);
    if (Number.isNaN(n)) {
      formError("Retries must be a number.");
      return;
    }
    workflow.retries = n;
  }
  workflow.clear_executions_on_review = (document.getElementById("wf-clear-exec") as HTMLInputElement | null)?.checked ?? false;

  const roles: Record<string, WorkflowRoleConfig> = {};
  for (const role of ROLE_KEYS) {
    const cfg = collectRole(role);
    if (role === "executor" && isEmptyRole(cfg)) {
      formError("The executor role is required — fill at least one executor field (e.g. template).");
      return;
    }
    if ((role === "tester" || role === "reviewer") && !isEmptyRole(cfg) && !cfg.template) {
      formError(`The ${role} role requires a template when defined.`);
      return;
    }
    if (!isEmptyRole(cfg)) roles[role] = cfg;
  }
  workflow.roles = roles;

  try {
    await upsertWorkflow(key, workflow);
    showToast(`Workflow "${key}" saved to workflows.yml`);
    closeForm();
    void loadWorkflows();
  } catch (e) {
    formError(`Save failed: ${formatApiError(e)}`);
  }
}
