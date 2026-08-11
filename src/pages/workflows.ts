import { showToast } from "../lib/utils";
import {
  apiGet,
  toCamelCase,
  fetchWorkflows,
  upsertWorkflow,
  deleteWorkflow,
  type PluginData,
  type Workflow,
  type WorkflowEntry,
  type WorkflowRoleConfig,
} from "../lib/api";
import { escapeHtml, formatApiError, getDefaultProfile } from "../lib/helpers";
import { enhanceSelectElement, unenhanceSelect } from "../lib/dropdown";
import { renderMarkdown } from "../lib/markdown";
import {
  _profiles,
  _providers,
  _providerModels,
  _templates,
  getModelsForProvider,
} from "../lib/channel-config";

const ROLE_KEYS = ["executor", "tester", "reviewer"] as const;

export function renderWorkflows(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Workflows</h1>
        <p class="page-subtitle">Workflow definitions stored in <code>workflows.yml</code></p>
      </div>
    </div>
    <div class="wf-note">
      <span class="wf-note-icon">ℹ️</span>
      <span><strong>Field precedence:</strong> workflow role &gt; workflow field &gt; kanban task &gt; channel &gt; global.</span>
    </div>
    <div style="margin-bottom:1rem;">
      <button id="wf-new-btn" class="btn-primary" style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ New Workflow</button>
      <div class="db-hint" style="margin-top:.4rem;">Changes are written to workflows.yml and apply on save.</div>
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
let _defaultProfile = "omni";

// ── Data loading ──

async function loadWorkflowData(): Promise<void> {
  try {
    const p = (await apiGet("/profiles")) as Record<string, unknown>[];
    _profiles.length = 0;
    _profiles.push(...(p as never[]));
  } catch {
    _profiles.length = 0;
  }
  try {
    const pluginResp = await apiGet<any>("/plugins");
    const allPlugins: PluginData[] = (pluginResp.data || pluginResp).map((p: Record<string, unknown>) =>
      toCamelCase<PluginData>(p),
    );
    const providers = allPlugins.filter((p: PluginData) => p.pluginType === "provider");
    _providers.length = 0;
    _providers.push(...providers.map((p: PluginData) => p.name).sort());
    const modelMap: Record<string, string[]> = {};
    for (const p of providers) {
      try {
        const schema = [
          ...((p.configSchema || []) as never[]),
          ...((p.manifest?.config_schema || []) as never[]),
        ];
        const modelField = (schema as any[]).find((f: any) => f.key === "default_model");
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
    Object.keys(_providerModels).forEach((k) => delete _providerModels[k]);
    Object.assign(_providerModels, modelMap);
  } catch {
    _providers.length = 0;
    Object.keys(_providerModels).forEach((k) => delete _providerModels[k]);
  }
  try {
    const t = await apiGet<{ profile: string; name: string; label: string }[]>("/templates");
    _templates.length = 0;
    _templates.push(...t);
  } catch {
    _templates.length = 0;
  }
  _defaultProfile = await getDefaultProfile();
}

// ── List ──

async function loadWorkflows(): Promise<void> {
  const content = document.getElementById("workflows-content");
  if (!content) return;
  try {
    currentWorkflows = await fetchWorkflows();
    await loadWorkflowData();
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
    ? `<span class="wf-badge" title="clear_executions_on_review">clear executions on review</span>`
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
  const roleLines = ROLE_KEYS.map((role) => {
    const cfg = roles[role];
    if (!cfg) return "";
    const tpl = cfg.template ? escapeHtml(cfg.template) : "<em>no template</em>";
    const fields = [
      cfg.profile ? `profile ${escapeHtml(cfg.profile)}` : null,
      cfg.provider ? `provider ${escapeHtml(cfg.provider)}` : null,
      cfg.model ? `model ${escapeHtml(cfg.model)}` : null,
      cfg.retries !== undefined && cfg.retries !== null ? `retries ${cfg.retries}` : null,
      cfg.plan_mode ? `plan_mode ${escapeHtml(cfg.plan_mode)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return `<div class="wf-role-line"><strong>${role}</strong> - ${tpl}${fields ? ` · ${fields}` : ""}</div>`;
  }).join("");
  const extraRoles = Object.keys(roles)
    .filter((k) => !(ROLE_KEYS as readonly string[]).includes(k))
    .map((k) => `<div class="wf-role-line"><strong>${escapeHtml(k)}</strong></div>`)
    .join("");
  const hasTemplates = ROLE_KEYS.some((role) => roles[role]?.template);
  return `
    <div class="card wf-card" style="margin-bottom:.75rem;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;">
        <div style="min-width:0;">
          <span class="wf-key">${escapeHtml(entry.key)}</span> ${clearBadge}
          ${summary ? `<div class="wf-sub" style="color:#99a;font-size:.82rem;">${escapeHtml(summary)}</div>` : ""}
        </div>
        <div style="display:flex;gap:.5rem;flex-shrink:0;">
          ${hasTemplates ? `<button class="btn btn-sm wf-show-templates" data-key="${escapeHtml(entry.key)}" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);">Show templates</button>` : ""}
          <button class="btn btn-sm wf-edit" data-key="${escapeHtml(entry.key)}" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);">Edit</button>
          <button class="btn btn-sm btn-danger wf-delete" data-key="${escapeHtml(entry.key)}">Delete</button>
        </div>
      </div>
      ${roleLines || extraRoles ? `<div class="card-body" style="display:flex;flex-direction:column;gap:.3rem;">${roleLines}${extraRoles}</div>` : ""}
      ${hasTemplates ? `<div class="wf-templates" data-key="${escapeHtml(entry.key)}" style="display:none;"></div>` : ""}
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
  content.querySelectorAll<HTMLButtonElement>(".wf-show-templates").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key ?? "";
      void toggleTemplates(key);
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

// ── Template content display (cards) ──

async function toggleTemplates(key: string): Promise<void> {
  const entry = currentWorkflows.find((e) => e.key === key);
  const container = document.querySelector(
    `.wf-templates[data-key="${CSS.escape(key)}"]`,
  ) as HTMLElement | null;
  const btn = document.querySelector(
    `.wf-show-templates[data-key="${CSS.escape(key)}"]`,
  ) as HTMLButtonElement | null;
  if (!entry || !container) return;
  if (container.style.display !== "none") {
    container.style.display = "none";
    container.innerHTML = "";
    if (btn) btn.textContent = "Show templates";
    return;
  }
  container.style.display = "block";
  container.innerHTML = '<div class="loading">Loading templates...</div>';
  if (btn) btn.textContent = "Hide templates";
  const roles = entry.workflow?.roles ?? {};
  const resolved = entry.resolved ?? {};
  const blocks: string[] = [];
  for (const role of ROLE_KEYS) {
    const cfg = roles[role];
    if (!cfg?.template) continue;
    const profile = resolved[role]?.profile || _defaultProfile;
    blocks.push(await renderTemplateBlock(role, cfg.template, profile));
  }
  container.innerHTML = blocks.join("");
}

async function renderTemplateBlock(role: string, name: string, profile: string): Promise<string> {
  const head = `<div class="wf-template-head"><strong>${role}</strong> <code>${escapeHtml(name)}</code> <span class="db-hint">(${escapeHtml(profile)})</span></div>`;
  try {
    const resp = await apiGet<{ content?: string }>(
      `/templates/content?profile=${encodeURIComponent(profile)}&name=${encodeURIComponent(name)}`,
    );
    const content = resp?.content ?? "";
    if (!content.trim()) {
      return `<div class="wf-template-block">${head}<div class="empty-state" style="color:#99a;">Empty or missing template file.</div></div>`;
    }
    return `<div class="wf-template-block">${head}<div class="markdown-content">${renderMarkdown(content)}</div></div>`;
  } catch (e) {
    return `<div class="wf-template-block">${head}<div class="empty-state" style="color:#e55;">Failed to load template: ${escapeHtml(formatApiError(e))}</div></div>`;
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
  wireFormEvents();
  const saveBtn = document.getElementById("wf-save-btn");
  saveBtn?.addEventListener("click", () => void handleSave());
  const cancelBtn = document.getElementById("wf-cancel-btn");
  cancelBtn?.addEventListener("click", closeForm);
  // Enhance every select AFTER wiring so the custom dropdown dispatches
  // change events to the native selects with their listeners attached.
  document.querySelectorAll("#workflow-form-wrap select").forEach((el) => {
    enhanceSelectElement(el as HTMLSelectElement);
  });
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

// ── Option builders ──

function opt(value: string, label: string, selected: boolean): string {
  return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function profileOptions(current: string): string {
  const cur = current || "";
  const inList = _profiles.some((p) => p.name === cur);
  return (
    opt("", "- (Default) -", cur === "") +
    (cur && !inList ? opt(cur, cur, true) : "") +
    _profiles.map((p) => opt(p.name ?? "", p.name ?? "", p.name === cur)).join("")
  );
}

function providerOptions(current: string): string {
  const cur = current || "";
  const inList = _providers.includes(cur);
  return (
    opt("", "- (Default) -", cur === "") +
    (cur && !inList ? opt(cur, cur, true) : "") +
    _providers.map((p) => opt(p, p, p === cur)).join("")
  );
}

function modelOptions(provider: string, current: string): string {
  const cur = current || "";
  const models = getModelsForProvider(provider);
  const inList = cur && models.includes(cur);
  return (
    opt("", "- (Default) -", cur === "") +
    (cur && !inList ? opt(cur, cur, true) : "") +
    models.map((m) => opt(m, m, m === cur)).join("")
  );
}

function templateOptions(profile: string, current: string): string {
  const cur = current || "";
  const list = _templates.filter((t) => t.profile === profile);
  const inList = cur && list.some((t) => t.name === cur);
  return (
    opt("", "- (None) -", cur === "") +
    (cur && !inList ? opt(cur, cur, true) : "") +
    list.map((t) => opt(t.name, t.name, t.name === cur)).join("")
  );
}

function planOptions(current: string): string {
  const raw = (current || "").trim();
  // Legacy values (auto_plan | auto_subtasks | always) are removed — normalize
  // them to "on" so editing a workflow with old data cleans it up on save.
  const legacy = ["auto_plan", "auto_subtasks", "always"].includes(raw.toLowerCase());
  const cur = legacy ? "on" : raw;
  const known = cur === "" || cur === "on" || cur === "off";
  return (
    opt("", "- (Default) -", cur === "") +
    (cur && !known ? opt(cur, cur, true) : "") +
    opt("on", "On", cur === "on") +
    opt("off", "Off", cur === "off")
  );
}

// ── Form render ──

function renderForm(key: string, wf: Workflow, roles: Record<string, WorkflowRoleConfig>): string {
  const v = (s?: string | number | boolean | null) =>
    escapeHtml(s === undefined || s === null ? "" : String(s));
  const wfProfile = wf.profile || "";
  const wfProvider = wf.provider || "";
  const wfModel = wf.model || "";
  const wfPlan = wf.plan_mode || "";
  const wfRetries = wf.retries !== undefined && wf.retries !== null ? String(wf.retries) : "";

  const roleSections = ROLE_KEYS.map((role) => {
    const cfg = roles[role] ?? {};
    const enabled = role === "executor" ? true : editingKey !== null ? !!roles[role] : true;
    const hint =
      role === "executor"
        ? `<span class="db-hint">required role</span>`
        : `<span class="db-hint">template required when enabled</span>`;
    const checkbox =
      role === "executor"
        ? ""
        : `<input type="checkbox" class="wf-role-enabled" data-role="${role}" ${enabled ? "checked" : ""} title="Enable ${role} role">`;
    const profile = cfg.profile || "";
    const provider = cfg.provider || "";
    const model = cfg.model || "";
    const planMode = cfg.plan_mode || "";
    const retries = cfg.retries !== undefined && cfg.retries !== null ? String(cfg.retries) : "";
    const effProfile = profile || wfProfile || _defaultProfile;
    const effProvider = provider || wfProvider;
    return `
      <details class="wf-role-details" open style="margin-bottom:.6rem;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.6rem .8rem;">
        <summary style="cursor:pointer;font-weight:600;display:flex;align-items:center;gap:.5rem;list-style:none;">
          ${checkbox}
          <span>${role}</span>
          ${hint}
        </summary>
        <div class="wf-role-fields ${enabled ? "" : "wf-role-fields-disabled"}" data-role="${role}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem;margin-top:.6rem;">
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Template
            <select id="wf-${role}-template" class="filter-select wf-role-template" data-role="${role}">
              ${templateOptions(effProfile, cfg.template || "")}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Profile
            <select id="wf-${role}-profile" class="filter-select wf-role-profile" data-role="${role}">
              ${profileOptions(profile)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Provider
            <select id="wf-${role}-provider" class="filter-select wf-role-provider" data-role="${role}">
              ${providerOptions(provider)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Model
            <select id="wf-${role}-model" class="filter-select wf-role-model" data-role="${role}">
              ${modelOptions(effProvider, model)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Retries
            <input class="filter-input wf-role-retries" data-role="${role}" type="tel" inputmode="numeric" pattern="[0-9.-]*" placeholder="0" value="${v(retries)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Plan mode
            <select id="wf-${role}-plan-mode" class="filter-select wf-role-plan-mode" data-role="${role}">
              ${planOptions(planMode)}
            </select>
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
            <select id="wf-profile" class="filter-select">
              ${profileOptions(wfProfile)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default provider
            <select id="wf-provider" class="filter-select">
              ${providerOptions(wfProvider)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default model
            <select id="wf-model" class="filter-select">
              ${modelOptions(wfProvider, wfModel)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default retries
            <input id="wf-retries" class="filter-input" type="tel" inputmode="numeric" pattern="[0-9.-]*" placeholder="0" value="${v(wfRetries)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.82rem;color:#99a;">Default plan mode
            <select id="wf-plan-mode" class="filter-select">
              ${planOptions(wfPlan)}
            </select>
          </label>
        </div>
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.9rem;font-size:.88rem;">
          <input id="wf-clear-exec" type="checkbox" ${wf.clear_executions_on_review ? "checked" : ""}>
          <span>Clear workflow execution counters when the task moves to review (<code>clear_executions_on_review</code>, default off)</span>
        </label>
        <div style="margin-bottom:.5rem;font-weight:600;">Roles</div>
        ${roleSections}
        <div id="wf-form-error" style="display:none;color:#e55;font-size:.85rem;margin:.5rem 0;"></div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;">
          <button id="wf-save-btn" class="btn btn-primary" style="background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);">Save Workflow</button>
          <button id="wf-cancel-btn" class="btn btn-danger">Cancel</button>
        </div>
      </div>
    </div>`;
}

// ── Form wiring: cascades + enable toggles ──

function rebuildSelect(selectId: string, optionsHtml: string, value: string): void {
  const sel = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = optionsHtml;
  sel.value = value;
  unenhanceSelect(selectId);
  enhanceSelectElement(sel);
}

function roleEffectiveProfile(role: string): string {
  const roleProfile =
    document.querySelector<HTMLSelectElement>(`.wf-role-profile[data-role="${role}"]`)?.value || "";
  const wfProfile = (document.getElementById("wf-profile") as HTMLSelectElement | null)?.value || "";
  return roleProfile || wfProfile || _defaultProfile;
}

function roleEffectiveProvider(role: string): string {
  const roleProvider =
    document.querySelector<HTMLSelectElement>(`.wf-role-provider[data-role="${role}"]`)?.value || "";
  const wfProvider = (document.getElementById("wf-provider") as HTMLSelectElement | null)?.value || "";
  return roleProvider || wfProvider || "";
}

function refreshRoleTemplate(role: string): void {
  const sel = document.querySelector<HTMLSelectElement>(`.wf-role-template[data-role="${role}"]`);
  if (!sel) return;
  const cur = sel.value;
  rebuildSelect(sel.id, templateOptions(roleEffectiveProfile(role), cur), cur);
}

function refreshRoleModel(role: string): void {
  const sel = document.querySelector<HTMLSelectElement>(`.wf-role-model[data-role="${role}"]`);
  if (!sel) return;
  const cur = sel.value;
  rebuildSelect(sel.id, modelOptions(roleEffectiveProvider(role), cur), cur);
}

function toggleRoleEnabled(role: string): void {
  const cb = document.querySelector<HTMLInputElement>(`.wf-role-enabled[data-role="${role}"]`);
  const fields = document.querySelector<HTMLElement>(`.wf-role-fields[data-role="${role}"]`);
  if (!cb || !fields) return;
  const enabled = cb.checked;
  fields.classList.toggle("wf-role-fields-disabled", !enabled);
  fields.querySelectorAll("input, select").forEach((el) => {
    (el as HTMLInputElement | HTMLSelectElement).disabled = !enabled;
  });
}

function wireFormEvents(): void {
  document.querySelectorAll<HTMLInputElement>(".wf-role-enabled").forEach((cb) => {
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => toggleRoleEnabled(cb.dataset.role || ""));
  });

  const wfProvider = document.getElementById("wf-provider") as HTMLSelectElement | null;
  wfProvider?.addEventListener("change", () => {
    const prov = wfProvider.value;
    const wfModel = document.getElementById("wf-model") as HTMLSelectElement | null;
    if (wfModel) {
      const cur = wfModel.value;
      rebuildSelect("wf-model", modelOptions(prov, cur), cur);
    }
    for (const role of ROLE_KEYS) refreshRoleModel(role);
  });

  document.querySelectorAll<HTMLSelectElement>(".wf-role-provider").forEach((sel) => {
    sel.addEventListener("change", () => refreshRoleModel(sel.dataset.role || ""));
  });

  const wfProfile = document.getElementById("wf-profile") as HTMLSelectElement | null;
  wfProfile?.addEventListener("change", () => {
    for (const role of ROLE_KEYS) refreshRoleTemplate(role);
  });

  document.querySelectorAll<HTMLSelectElement>(".wf-role-profile").forEach((sel) => {
    sel.addEventListener("change", () => refreshRoleTemplate(sel.dataset.role || ""));
  });
}

// ── Collect & save ──

function formError(message: string): void {
  const el = document.getElementById("wf-form-error");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
}

function roleEnabled(role: string): boolean {
  if (role === "executor") return true;
  return document.querySelector<HTMLInputElement>(`.wf-role-enabled[data-role="${role}"]`)?.checked ?? false;
}

function collectRole(role: string): WorkflowRoleConfig {
  const cfg: WorkflowRoleConfig = {};
  const template =
    document.querySelector<HTMLSelectElement>(`.wf-role-template[data-role="${role}"]`)?.value ?? "";
  const profile =
    document.querySelector<HTMLSelectElement>(`.wf-role-profile[data-role="${role}"]`)?.value ?? "";
  const provider =
    document.querySelector<HTMLSelectElement>(`.wf-role-provider[data-role="${role}"]`)?.value ?? "";
  const model = document.querySelector<HTMLSelectElement>(`.wf-role-model[data-role="${role}"]`)?.value ?? "";
  const retries =
    document.querySelector<HTMLInputElement>(`.wf-role-retries[data-role="${role}"]`)?.value.trim() ?? "";
  const planMode =
    document.querySelector<HTMLSelectElement>(`.wf-role-plan-mode[data-role="${role}"]`)?.value ?? "";
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
  return (
    !cfg.template &&
    !cfg.profile &&
    !cfg.provider &&
    !cfg.model &&
    cfg.retries === undefined &&
    !cfg.plan_mode
  );
}

async function handleSave(): Promise<void> {
  formError("");
  const keyInput = document.getElementById("wf-key") as HTMLInputElement | null;
  const key = (keyInput?.value ?? editingKey ?? "").trim();
  if (!key) {
    formError("Workflow name is required.");
    return;
  }
  const workflow: Workflow = {};
  const profile = (document.getElementById("wf-profile") as HTMLSelectElement | null)?.value ?? "";
  const provider = (document.getElementById("wf-provider") as HTMLSelectElement | null)?.value ?? "";
  const model = (document.getElementById("wf-model") as HTMLSelectElement | null)?.value ?? "";
  const planMode = (document.getElementById("wf-plan-mode") as HTMLSelectElement | null)?.value ?? "";
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
  workflow.clear_executions_on_review =
    (document.getElementById("wf-clear-exec") as HTMLInputElement | null)?.checked ?? false;

  const roles: Record<string, WorkflowRoleConfig> = {};
  for (const role of ROLE_KEYS) {
    if (!roleEnabled(role)) continue;
    const cfg = collectRole(role);
    if (role === "executor" && isEmptyRole(cfg)) {
      formError("The executor role is required — fill at least one executor field (e.g. template).");
      return;
    }
    if ((role === "tester" || role === "reviewer") && !cfg.template) {
      formError(`The ${role} role requires a template when enabled.`);
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
