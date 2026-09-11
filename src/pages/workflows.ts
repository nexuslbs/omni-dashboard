import { showToast } from "../lib/utils";
import { allSettledOrNull } from "../lib/parallel";
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
import { showWorkflowsImportModal } from "../lib/config-import";
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
      <button id="wf-import-btn" class="btn" style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;margin-left:0.5rem;">Import</button>
      <div class="db-hint" style="margin-top:.4rem;">Changes are written to workflows.yml and apply on save.</div>
    </div>
    <div id="workflow-form-wrap" style="display:none;"></div>
    <div id="workflows-content"><div class="loading" style="padding:3rem;text-align:center;">Loading workflows...</div></div>
  `;
  const newBtn = document.getElementById("wf-new-btn");
  newBtn?.addEventListener("click", () => openForm(null));
  const importBtn = document.getElementById("wf-import-btn");
  importBtn?.addEventListener("click", () => {
    showWorkflowsImportModal(() => void loadWorkflows());
  });
  void loadWorkflows();
}

// ── State ──

let currentWorkflows: WorkflowEntry[] = [];
let editingKey: string | null = null;
let _defaultProfile = "omni";
const _actions: { id: string; name: string }[] = [];
// Tool catalogue + toolset (server_name) map for the per-role allowed_tools
// selector, loaded from /profiles (same source the profiles page uses).
let _wfAllTools: string[] = [];
let _wfToolServerMap: Record<string, string> = {};

// ── Data loading ──

// /profiles, /plugins, /templates, /actions and /settings are INDEPENDENT:
// they are started in the SAME tick (allSettledOrNull) so the page pays the MAX
// call instead of the sum of five sequential round trips. Failures keep the
// previous behaviour (null result + empty fallback for that source).
export async function loadWorkflowData(): Promise<void> {
  const [profilesRes, pluginsRes, templatesRes, actionsRes, defaultProfileRes] = await allSettledOrNull([
    apiGet("/profiles"),
    apiGet<any>("/plugins"),
    apiGet<{ profile: string; name: string; label: string }[]>("/templates"),
    apiGet<{ id: string; name: string }[]>("/actions"),
    getDefaultProfile(),
  ]);
  _profiles.length = 0;
  if (Array.isArray(profilesRes)) _profiles.push(...(profilesRes as never[]));
  // Tool catalogue for the per-role allowed_tools selector: every /profiles
  // entry carries all_tools + all_tool_details (name + server_name).
  _wfAllTools = [];
  _wfToolServerMap = {};
  if (Array.isArray(profilesRes)) {
    const tools = new Set<string>();
    for (const p of profilesRes as Array<Record<string, unknown>>) {
      const list = (p?.all_tools as string[] | undefined) ?? [];
      for (const t of list) tools.add(t);
      const details =
        (p?.all_tool_details as Array<{ name?: string; server_name?: string | null }> | undefined) ?? [];
      for (const d of details) {
        if (d?.name) _wfToolServerMap[d.name] = d.server_name || "builtin";
      }
    }
    _wfAllTools = [...tools].sort();
  }
  if (pluginsRes) {
    const pluginResp = pluginsRes;
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
  } else {
    _providers.length = 0;
    Object.keys(_providerModels).forEach((k) => delete _providerModels[k]);
  }
  _templates.length = 0;
  if (Array.isArray(templatesRes)) _templates.push(...templatesRes);
  _actions.length = 0;
  if (Array.isArray(actionsRes)) _actions.push(...actionsRes);
  if (defaultProfileRes) _defaultProfile = defaultProfileRes;
}

// ── List ──

async function loadWorkflows(): Promise<void> {
  const content = document.getElementById("workflows-content");
  if (!content) return;
  try {
    // The workflow list and the option sources are independent: start both now
    // (page pays max, not sum) instead of awaiting them one after the other.
    const [workflows] = await Promise.all([fetchWorkflows(), loadWorkflowData()]);
    currentWorkflows = workflows;
    content.innerHTML = renderWorkflowList(currentWorkflows);
    wireListActions(content);
  } catch (e) {
    content.innerHTML = `<div class="empty-state" style="color:#e55;">Failed to load workflows: ${escapeHtml(formatApiError(e))}</div>`;
  }
}

function renderWorkflowList(entries: WorkflowEntry[]): string {
  if (entries.length === 0) {
    return `<div class="empty-state" style="padding:3rem;text-align:center;color:#99a;">
      No workflows yet. Create one with “New Workflow”: workflows.yml doesn’t exist until you save.
    </div>`;
  }
  return entries.map(renderWorkflowCard).join("");
}

function renderWorkflowCard(entry: WorkflowEntry): string {
  const wf = entry.workflow ?? {};
  const roles = wf.roles ?? {};
  const reviewOnFailBadge = wf.review_on_fail
    ? `<span class="wf-badge" title="review_on_fail: failed steps go to review instead of blocked">review on fail</span>`
    : "";
  const clearBadge = wf.clear_executions_on_review
    ? `<span class="wf-badge" title="clear_executions_on_review">clear executions on review</span>`
    : "";
  const autoApproveBadge = wf.auto_approve
    ? `<span class="wf-badge" title="auto_approve: no reviewer: review-bound tasks go straight to done">auto-approve</span>`
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
    const modeBadge =
      cfg.mode === "action"
        ? ` · <span class="wf-badge" title="mode: action">action: ${escapeHtml(cfg.action_id || "")}</span>`
        : "";
    const tpl =
      cfg.mode === "action"
        ? "<em>action mode</em>"
        : cfg.template
          ? escapeHtml(cfg.template)
          : "<em>no template</em>";
    const fields = [
      cfg.profile ? `profile ${escapeHtml(cfg.profile)}` : null,
      cfg.provider ? `provider ${escapeHtml(cfg.provider)}` : null,
      cfg.model ? `model ${escapeHtml(cfg.model)}` : null,
      cfg.retries !== undefined && cfg.retries !== null ? `retries ${cfg.retries}` : null,
      cfg.plan_mode ? `plan_mode ${escapeHtml(cfg.plan_mode)}` : null,
      Array.isArray(cfg.allowed_tools) ? `allowed_tools ${cfg.allowed_tools.length}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return `<div class="wf-role-line"><strong>${role}</strong> - ${tpl}${modeBadge}${fields ? ` · ${fields}` : ""}</div>`;
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
          <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
            <span class="wf-key">${escapeHtml(entry.key)}</span> ${reviewOnFailBadge}${clearBadge}${autoApproveBadge}
          </div>
          ${summary ? `<div class="wf-sub" style="color:#99a;font-size:.82rem;">${escapeHtml(summary)}</div>` : ""}
        </div>
        <div class="wf-card-actions" style="display:flex;gap:.5rem;flex-shrink:0;">
          ${hasTemplates ? `<button class="btn btn-sm wf-show-templates" data-key="${escapeHtml(entry.key)}" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);color:#fbbf24;">Show templates</button>` : ""}
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

function actionOptions(current: string): string {
  const cur = current || "";
  const inList = _actions.some((a) => a.id === cur);
  return (
    opt("", "- (None) -", cur === "") +
    (cur && !inList ? opt(cur, cur, true) : "") +
    _actions.map((a) => opt(a.id, a.name || a.id, a.id === cur)).join("")
  );
}

function planOptions(current: string): string {
  const raw = (current || "").trim();
  // Legacy values (auto_plan | auto_subtasks | always) are removed; normalize
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
  const isCreate = editingKey === null;
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
        ? `<span class="db-hint wf-role-hint">required role</span>`
        : `<span class="db-hint wf-role-hint">template required when enabled (unless mode=action)</span>`;
    const checkbox =
      role === "executor"
        ? ""
        : `<input type="checkbox" class="wf-role-enabled" data-role="${role}" ${enabled ? "checked" : ""} title="Enable ${role} role">`;
    const profile = cfg.profile || "";
    const provider = cfg.provider || "";
    const model = cfg.model || "";
    const planMode = cfg.plan_mode || "";
    const retries = cfg.retries !== undefined && cfg.retries !== null ? String(cfg.retries) : "";
    const mode = cfg.mode || "";
    const actionId = cfg.action_id || "";
    const effProfile = profile || wfProfile || _defaultProfile;
    const effProvider = provider || wfProvider;
    return `
      <details class="wf-role-details" open style="margin-bottom:.6rem;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:.6rem .8rem;">
        <summary style="cursor:pointer;font-weight:600;display:flex;align-items:baseline;gap:.5rem;list-style:none;">
          ${checkbox}
          <span>${role}</span>
          ${hint}
        </summary>
        <div class="wf-role-fields ${enabled ? "" : "wf-role-fields-disabled"}" data-role="${role}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem;margin-top:.6rem;">
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Mode
            <select id="wf-${role}-mode" class="filter-select wf-role-mode" data-role="${role}">
              ${opt("agent", "Agent (LLM loop)", mode !== "action")}
              ${opt("action", "Action (actions.yml tool)", mode === "action")}
            </select>
          </label>
          <label id="wf-${role}-tpl-wrap" style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Template
            <select id="wf-${role}-template" class="filter-select wf-role-template" data-role="${role}">
              ${templateOptions(effProfile, cfg.template || "")}
            </select>
          </label>
          <label id="wf-${role}-act-wrap" style="display:none;flex-direction:column;font-size:.88rem;color:#99a;">Action
            <select id="wf-${role}-action" class="filter-select wf-role-action" data-role="${role}">
              ${actionOptions(actionId)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Profile
            <select id="wf-${role}-profile" class="filter-select wf-role-profile" data-role="${role}">
              ${profileOptions(profile)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Provider
            <select id="wf-${role}-provider" class="filter-select wf-role-provider" data-role="${role}">
              ${providerOptions(provider)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Model
            <select id="wf-${role}-model" class="filter-select wf-role-model" data-role="${role}">
              ${modelOptions(effProvider, model)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Retries
            <input class="filter-input wf-role-retries" data-role="${role}" type="tel" inputmode="numeric" pattern="[0-9.-]*" placeholder="0" value="${v(retries)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Plan mode
            <select id="wf-${role}-plan-mode" class="filter-select wf-role-plan-mode" data-role="${role}">
              ${planOptions(planMode)}
            </select>
          </label>
        </div>
        ${renderRoleTools(role, cfg.allowed_tools === undefined ? null : cfg.allowed_tools)}
      </details>`;
  }).join("");

  return `
    <div class="card" style="margin-bottom:1rem;">
      <div class="card-header">
        <span class="card-title">${editingKey ? "Edit workflow" : "New workflow"}</span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.6rem;margin-bottom:.75rem;">
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Name (workflow key)
            <input id="wf-key" class="filter-input" placeholder="default" value="${v(key)}" ${editingKey ? "disabled" : ""}>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Default profile
            <select id="wf-profile" class="filter-select">
              ${profileOptions(wfProfile)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Default provider
            <select id="wf-provider" class="filter-select">
              ${providerOptions(wfProvider)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Default model
            <select id="wf-model" class="filter-select">
              ${modelOptions(wfProvider, wfModel)}
            </select>
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Default retries
            <input id="wf-retries" class="filter-input" type="tel" inputmode="numeric" pattern="[0-9.-]*" placeholder="0" value="${v(wfRetries)}">
          </label>
          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Default plan mode
            <select id="wf-plan-mode" class="filter-select">
              ${planOptions(wfPlan)}
            </select>
          </label>
        </div>
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.9rem;font-size:.88rem;">
          <input id="wf-review-on-fail" type="checkbox" ${(isCreate || wf.review_on_fail) && !wf.auto_approve ? "checked" : ""} ${wf.auto_approve ? "disabled" : ""}>
          <span>Review on fail (<code>review_on_fail</code>): failed steps go to review instead of blocked (ignored while auto-approve is on, as if disabled)</span>
        </label>
<label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;font-size:.88rem;">
          <input id="wf-clear-exec" type="checkbox" ${isCreate || wf.clear_executions_on_review ? "checked" : ""}>
          <span>Clear workflow execution counters when the task moves to review (<code>clear_executions_on_review</code>)</span>
        </label>
<label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;font-size:.88rem;">
          <input id="wf-auto-approve" type="checkbox" ${wf.auto_approve ? "checked" : ""}>
          <span>Auto-approve (<code>auto_approve</code>): no reviewer: review-bound tasks go straight to <code>done</code>; <code>review_on_fail</code> ignored</span>
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

function applyRoleMode(role: string): void {
  const modeSel = document.querySelector<HTMLSelectElement>(`.wf-role-mode[data-role="${role}"]`);
  const tplWrap = document.getElementById(`wf-${role}-tpl-wrap`);
  const actWrap = document.getElementById(`wf-${role}-act-wrap`);
  if (!modeSel || !tplWrap || !actWrap) return;
  const isAction = modeSel.value === "action";
  tplWrap.style.display = isAction ? "none" : "flex";
  actWrap.style.display = isAction ? "flex" : "none";
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

  document.querySelectorAll<HTMLSelectElement>(".wf-role-mode").forEach((sel) => {
    sel.addEventListener("change", () => applyRoleMode(sel.dataset.role || ""));
  });

  const autoApprove = document.getElementById("wf-auto-approve") as HTMLInputElement | null;
  const reviewOnFail = document.getElementById("wf-review-on-fail") as HTMLInputElement | null;
  autoApprove?.addEventListener("change", () => {
    if (!reviewOnFail) return;
    if (autoApprove.checked) {
      reviewOnFail.checked = false;
      reviewOnFail.disabled = true;
    } else {
      reviewOnFail.disabled = false;
    }
  });

  // ── Per-role allowed_tools (tri-state: all tools / explicit list) ──
  document.querySelectorAll<HTMLInputElement>(".wf-role-all-cb").forEach((cb) => {
    cb.addEventListener("change", () => setRoleAllTools(cb.dataset.role || "", cb.checked));
  });
  document.querySelectorAll<HTMLInputElement>(".wf-role-tool-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      const role = cb.dataset.role || "";
      updateRoleToolChips(role);
      refreshRoleToolsetChips(role);
      updateRoleToolsSummary(role);
    });
  });
  document.querySelectorAll<HTMLElement>(".wf-role-toolset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const role = chip.dataset.role || "";
      const toolset = chip.dataset.toolset || "";
      const state = chip.getAttribute("data-state");
      if (!role || !toolset) return;
      // Narrowing a toolset turns the explicit list on ("all tools" off).
      if (roleAllTools(role)) setRoleAllTools(role, false);
      document.querySelectorAll<HTMLInputElement>(`.wf-role-tool-cb[data-role="${role}"]`).forEach((cb) => {
        if (wfToolsetOf(cb.value) === toolset) cb.checked = state === "none";
      });
      updateRoleToolChips(role);
      refreshRoleToolsetChips(role);
      updateRoleToolsSummary(role);
    });
  });

  for (const role of ROLE_KEYS) applyRoleMode(role);
}

// ── Per-role allowed_tools selector ──

function wfToolsetOf(tool: string): string {
  return _wfToolServerMap[tool] || "builtin";
}

function wfToolsetChipStyle(state: "full" | "partial" | "none"): string {
  switch (state) {
    case "full":
      return "background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.35);color:var(--accent-purple);";
    case "partial":
      return "background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.35);color:#eab308;";
    default:
      return "background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.2);color:var(--text-muted);";
  }
}

function wfComputeToolsetStates(
  selected: string[],
  allTools: string[],
): Record<string, "full" | "partial" | "none"> {
  const sets: Record<string, { total: number; allowed: number }> = {};
  for (const t of allTools) {
    const s = wfToolsetOf(t);
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

/** Role tool selector: tri-state (all tools / explicit list, possibly empty). */
function renderRoleTools(role: string, selected: string[] | null): string {
  const allMode = selected === null;
  const effective = selected ?? _wfAllTools;
  const states = wfComputeToolsetStates(effective, _wfAllTools);
  const toolsetChips = Object.keys(states)
    .sort()
    .map(
      (ts) =>
        `<span class="toolset-chip wf-role-toolset-chip" data-role="${role}" data-toolset="${escapeHtml(ts)}" data-state="${states[ts]}" style="${wfToolsetChipStyle(states[ts])}">${escapeHtml(ts)}</span>`,
    )
    .join("");
  const toolChips = [..._wfAllTools]
    .sort()
    .map(
      (tool) =>
        `<label class="tool-chip ${effective.includes(tool) ? "tool-chip-active" : ""}" data-tool="${escapeHtml(tool)}">
          <input type="checkbox" class="tool-chip-cb wf-role-tool-cb" value="${escapeHtml(tool)}" data-role="${role}" ${effective.includes(tool) ? "checked" : ""} ${allMode ? "disabled" : ""} />
          ${escapeHtml(tool)}
        </label>`,
    )
    .join("");
  return `
    <div style="margin-top:.6rem;border-top:1px dashed rgba(255,255,255,.12);padding-top:.5rem;">
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;color:#99a;">
        <input type="checkbox" class="wf-role-all-cb" data-role="${role}" ${allMode ? "checked" : ""} />
        <span>Allowed tools: <strong>${allMode ? "all tools (no restriction)" : `${effective.length} selected`}</strong></span>
      </label>
      <div class="db-hint" style="margin:.2rem 0 .4rem;">Uncheck to restrict the role: the agent then gets these tools intersected with its profile tools. Nothing checked = NO tools for this role.</div>
      <div class="toolset-chip-group" data-role="${role}">${toolsetChips}</div>
      <div class="tool-chip-group wf-role-tool-group" data-role="${role}" data-all-mode="${allMode ? "1" : "0"}" style="margin-top:.4rem;">${toolChips}</div>
    </div>`;
}

function roleToolGroup(role: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.wf-role-tool-group[data-role="${role}"]`);
}

function roleAllTools(role: string): boolean {
  return roleToolGroup(role)?.getAttribute("data-all-mode") === "1";
}

function setRoleAllTools(role: string, on: boolean): void {
  const group = roleToolGroup(role);
  if (!group) return;
  group.setAttribute("data-all-mode", on ? "1" : "0");
  group.querySelectorAll<HTMLInputElement>(".wf-role-tool-cb").forEach((cb) => {
    if (on) cb.checked = true;
    cb.disabled = on;
  });
  const box = document.querySelector<HTMLInputElement>(`.wf-role-all-cb[data-role="${role}"]`);
  if (box) box.checked = on;
  updateRoleToolChips(role);
  refreshRoleToolsetChips(role);
  updateRoleToolsSummary(role);
}

function updateRoleToolChips(role: string): void {
  const group = roleToolGroup(role);
  if (!group) return;
  group.querySelectorAll<HTMLElement>(".tool-chip").forEach((chip) => {
    const cb = chip.querySelector<HTMLInputElement>(".wf-role-tool-cb");
    if (cb) chip.classList.toggle("tool-chip-active", cb.checked);
  });
}

function refreshRoleToolsetChips(role: string): void {
  const group = roleToolGroup(role);
  const container = document.querySelector<HTMLElement>(`.toolset-chip-group[data-role="${role}"]`);
  if (!group || !container) return;
  const selected: string[] = [];
  const allTools: string[] = [];
  group.querySelectorAll<HTMLInputElement>(".wf-role-tool-cb").forEach((cb) => {
    allTools.push(cb.value);
    if (cb.checked) selected.push(cb.value);
  });
  const states = wfComputeToolsetStates(selected, allTools);
  container.querySelectorAll<HTMLElement>(".toolset-chip").forEach((chip) => {
    const ts = chip.getAttribute("data-toolset");
    if (!ts || !states[ts]) return;
    chip.setAttribute("data-state", states[ts]);
    chip.setAttribute("style", wfToolsetChipStyle(states[ts]));
  });
}

function updateRoleToolsSummary(role: string): void {
  const box = document.querySelector<HTMLInputElement>(`.wf-role-all-cb[data-role="${role}"]`);
  const strong = box?.parentElement?.querySelector("strong");
  if (!strong) return;
  const all = roleAllTools(role);
  const selected = document.querySelectorAll(`.wf-role-tool-cb[data-role="${role}"]:checked`).length;
  strong.textContent = all ? "all tools (no restriction)" : `${selected} selected`;
}

function collectRoleTools(role: string): string[] {
  const out: string[] = [];
  document
    .querySelectorAll<HTMLInputElement>(`.wf-role-tool-cb[data-role="${role}"]:checked`)
    .forEach((cb) => out.push(cb.value));
  return out;
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
  const mode = document.querySelector<HTMLSelectElement>(`.wf-role-mode[data-role="${role}"]`)?.value ?? "";
  const actionId =
    document.querySelector<HTMLSelectElement>(`.wf-role-action[data-role="${role}"]`)?.value ?? "";
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
  if (template && mode !== "action") cfg.template = template;
  if (mode) cfg.mode = mode;
  if (mode === "action" && actionId) cfg.action_id = actionId;
  if (profile) cfg.profile = profile;
  if (provider) cfg.provider = provider;
  if (model) cfg.model = model;
  if (retries !== "") {
    const n = Number(retries);
    if (!Number.isNaN(n)) cfg.retries = n;
  }
  if (planMode) cfg.plan_mode = planMode;
  // Tri-state role allow-list: "all tools" on = undefined (no restriction);
  // off = explicit list (possibly empty = no tools for this role).
  if (!roleAllTools(role)) {
    const group = roleToolGroup(role);
    const hasChips = !!group && group.querySelectorAll(".wf-role-tool-cb").length > 0;
    // No catalogue loaded: keep the role unrestricted instead of wiping it to [].
    cfg.allowed_tools = hasChips ? collectRoleTools(role) : null;
  }
  return cfg;
}

function isEmptyRole(cfg: WorkflowRoleConfig): boolean {
  return (
    !cfg.template &&
    !cfg.profile &&
    !cfg.provider &&
    !cfg.model &&
    cfg.retries === undefined &&
    !cfg.plan_mode &&
    !cfg.mode &&
    !cfg.action_id &&
    (cfg.allowed_tools === undefined || cfg.allowed_tools === null || cfg.allowed_tools.length === 0)
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
  workflow.auto_approve =
    (document.getElementById("wf-auto-approve") as HTMLInputElement | null)?.checked ?? false;
  const reviewOnFail =
    (document.getElementById("wf-review-on-fail") as HTMLInputElement | null)?.checked ?? false;
  if (!workflow.auto_approve && reviewOnFail) workflow.review_on_fail = true;

  const roles: Record<string, WorkflowRoleConfig> = {};
  for (const role of ROLE_KEYS) {
    if (!roleEnabled(role)) continue;
    const cfg = collectRole(role);
    if (role === "executor" && isEmptyRole(cfg)) {
      formError(
        "The executor role is required: fill at least one executor field (e.g. template or mode=action).",
      );
      return;
    }
    if ((role === "tester" || role === "reviewer") && !cfg.template && cfg.mode !== "action") {
      formError(`The ${role} role requires a template when enabled (or set Mode to "Action").`);
      return;
    }
    if (cfg.mode === "action" && !cfg.action_id) {
      formError(`The ${role} role requires an Action when Mode is "Action".`);
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
