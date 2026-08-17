#!/usr/bin/env python3
"""Dashboard: workflow role mode (agent|action) + auto_approve + review_on_fail UI."""
import sys

def patch(path, anchor, replacement, count=1):
    with open(path, encoding="utf-8") as f:
        s = f.read()
    n = s.count(anchor)
    if n != count:
        print(f"FAIL {path}: anchor found {n} times (expected {count}): {anchor[:80]!r}")
        sys.exit(1)
    s = s.replace(anchor, replacement)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"OK {path}: {anchor[:60]!r}")

API = "/workspace/omni-dashboard/src/lib/api.ts"
WF = "/workspace/omni-dashboard/src/pages/workflows.ts"

# ── 1. api.ts: WorkflowRoleConfig gets mode/action_id ──
patch(API, """export interface WorkflowRoleConfig {
  template?: string;
  profile?: string;
  provider?: string;
  model?: string;
  plan_mode?: string;
  retries?: number;
}""", """export interface WorkflowRoleConfig {
  template?: string;
  profile?: string;
  provider?: string;
  model?: string;
  plan_mode?: string;
  retries?: number;
  /** Role execution mode: 'agent' (default, LLM loop) | 'action' (runs an actions.yml tool). */
  mode?: string;
  /** actions.yml action id; required when mode === 'action'. */
  action_id?: string;
}""")

# ── 2. api.ts: Workflow gets auto_approve/review_on_fail ──
patch(API, """  /** Top-level (outside roles): clear `workflow_state.executions` when the task moves to review. Default: false. */
  clear_executions_on_review?: boolean;
  roles?: Record<string, WorkflowRoleConfig>;
}""", """  /** Top-level (outside roles): clear `workflow_state.executions` when the task moves to review. Default: false. */
  clear_executions_on_review?: boolean;
  /** Top-level: no reviewer — review-bound tasks go straight to done; review_on_fail forced false. Default: false. */
  auto_approve?: boolean;
  /** Top-level: failed steps go to review instead of blocked (ignored when auto_approve). Default: false. */
  review_on_fail?: boolean;
  roles?: Record<string, WorkflowRoleConfig>;
}""")

# ── 3. workflows.ts: state for actions list ──
patch(WF, """let currentWorkflows: WorkflowEntry[] = [];
let editingKey: string | null = null;
let _defaultProfile = "omni";""", """let currentWorkflows: WorkflowEntry[] = [];
let editingKey: string | null = null;
let _defaultProfile = "omni";
let _actions: { id: string; name: string }[] = [];""")

# ── 4. workflows.ts: load actions in loadWorkflowData ──
patch(WF, """  try {
    const t = await apiGet<{ profile: string; name: string; label: string }[]>("/templates");
    _templates.length = 0;
    _templates.push(...t);
  } catch {
    _templates.length = 0;
  }
  _defaultProfile = await getDefaultProfile();""", """  try {
    const t = await apiGet<{ profile: string; name: string; label: string }[]>("/templates");
    _templates.length = 0;
    _templates.push(...t);
  } catch {
    _templates.length = 0;
  }
  try {
    const a = await apiGet<{ id: string; name: string }[]>("/actions");
    _actions.length = 0;
    _actions.push(...a);
  } catch {
    _actions.length = 0;
  }
  _defaultProfile = await getDefaultProfile();""")

# ── 5. workflows.ts: card badges (auto_approve / review_on_fail) ──
patch(WF, """  const clearBadge = wf.clear_executions_on_review
    ? `<span class="wf-badge" title="clear_executions_on_review">clear executions on review</span>`
    : """;""", """  const clearBadge = wf.clear_executions_on_review
    ? `<span class="wf-badge" title="clear_executions_on_review">clear executions on review</span>`
    : "";
  const autoApproveBadge = wf.auto_approve
    ? `<span class="wf-badge" title="auto_approve: no reviewer, review-bound tasks go straight to done">auto-approve</span>`
    : "";
  const reviewOnFailBadge = wf.review_on_fail
    ? `<span class="wf-badge" title="review_on_fail: failed steps go to review instead of blocked">review on fail</span>`
    : "";""")

patch(WF, """            <span class="wf-key">${escapeHtml(entry.key)}</span> ${clearBadge}""", """            <span class="wf-key">${escapeHtml(entry.key)}</span> ${clearBadge}${autoApproveBadge}${reviewOnFailBadge}""")

# ── 6. workflows.ts: card role lines show mode/action ──
patch(WF, """  const roleLines = ROLE_KEYS.map((role) => {
    const cfg = roles[role];
    if (!cfg) return "";
    const tpl = cfg.template ? escapeHtml(cfg.template) : "<em>no template</em>";""", """  const roleLines = ROLE_KEYS.map((role) => {
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
          : "<em>no template</em>";""")

patch(WF, """    return `<div class="wf-role-line"><strong>${role}</strong> - ${tpl}${fields ? ` · ${fields}` : ""}</div>`;""", """    return `<div class="wf-role-line"><strong>${role}</strong> - ${tpl}${modeBadge}${fields ? ` · ${fields}` : ""}</div>`;""")

# ── 7. workflows.ts: actionOptions builder after templateOptions ──
patch(WF, """function templateOptions(profile: string, current: string): string {
  const cur = current || "";
  const list = _templates.filter((t) => t.profile === profile);
  const inList = cur && list.some((t) => t.name === cur);
  return (
    opt("", "- (None) -", cur === "") +
    (cur && !inList ? opt(cur, cur, true) : "") +
    list.map((t) => opt(t.name, t.name, t.name === cur)).join("")
  );
}""", """function templateOptions(profile: string, current: string): string {
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
}""")

# ── 8. workflows.ts: renderForm role section — mode + action selects ──
patch(WF, """    const profile = cfg.profile || "";
    const provider = cfg.provider || "";
    const model = cfg.model || "";
    const planMode = cfg.plan_mode || "";
    const retries = cfg.retries !== undefined && cfg.retries !== null ? String(cfg.retries) : "";
    const effProfile = profile || wfProfile || _defaultProfile;
    const effProvider = provider || wfProvider;""", """    const profile = cfg.profile || "";
    const provider = cfg.provider || "";
    const model = cfg.model || "";
    const planMode = cfg.plan_mode || "";
    const retries = cfg.retries !== undefined && cfg.retries !== null ? String(cfg.retries) : "";
    const mode = cfg.mode || "";
    const actionId = cfg.action_id || "";
    const effProfile = profile || wfProfile || _defaultProfile;
    const effProvider = provider || wfProvider;""")

patch(WF, """          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Template
            <select id="wf-${role}-template" class="filter-select wf-role-template" data-role="${role}">
              ${templateOptions(effProfile, cfg.template || "")}
            </select>
          </label>""", """          <label style="display:flex;flex-direction:column;font-size:.88rem;color:#99a;">Mode
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
          </label>""")

# ── 9. workflows.ts: workflow-level checkboxes (auto_approve + review_on_fail) ──
patch(WF, """        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.9rem;font-size:.88rem;">
          <input id="wf-clear-exec" type="checkbox" ${wf.clear_executions_on_review ? "checked" : ""}>
          <span>Clear workflow execution counters when the task moves to review (<code>clear_executions_on_review</code>, default off)</span>
        </label>""", """        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.9rem;font-size:.88rem;">
          <input id="wf-clear-exec" type="checkbox" ${wf.clear_executions_on_review ? "checked" : ""}>
          <span>Clear workflow execution counters when the task moves to review (<code>clear_executions_on_review</code>, default off)</span>
        </label>
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;font-size:.88rem;">
          <input id="wf-auto-approve" type="checkbox" ${wf.auto_approve ? "checked" : ""}>
          <span>Auto-approve (<code>auto_approve</code>): no reviewer — review-bound tasks go straight to <code>done</code>, <code>review_on_fail</code> ignored</span>
        </label>
        <label style="display:flex;align-items:center;gap:.5rem;margin-bottom:.9rem;font-size:.88rem;">
          <input id="wf-review-on-fail" type="checkbox" ${wf.review_on_fail && !wf.auto_approve ? "checked" : ""} ${wf.auto_approve ? "disabled" : ""}>
          <span>Review on fail (<code>review_on_fail</code>): failed steps go to review instead of blocked (disabled while auto-approve is on)</span>
        </label>""")

# ── 10. workflows.ts: wireFormEvents — mode toggles + auto_approve gate + initial state ──
patch(WF, """  document.querySelectorAll<HTMLSelectElement>(".wf-role-profile").forEach((sel) => {
    sel.addEventListener("change", () => refreshRoleTemplate(sel.dataset.role || ""));
  });
}""", """  document.querySelectorAll<HTMLSelectElement>(".wf-role-profile").forEach((sel) => {
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

  for (const role of ROLE_KEYS) applyRoleMode(role);
}

function applyRoleMode(role: string): void {
  const modeSel = document.querySelector<HTMLSelectElement>(`.wf-role-mode[data-role="${role}"]`);
  const tplWrap = document.getElementById(`wf-${role}-tpl-wrap`);
  const actWrap = document.getElementById(`wf-${role}-act-wrap`);
  if (!modeSel || !tplWrap || !actWrap) return;
  const isAction = modeSel.value === "action";
  tplWrap.style.display = isAction ? "none" : "flex";
  actWrap.style.display = isAction ? "flex" : "none";
}""")

# ── 11. workflows.ts: collectRole — mode/action_id ──
patch(WF, """function collectRole(role: string): WorkflowRoleConfig {
  const cfg: WorkflowRoleConfig = {};
  const template =
    document.querySelector<HTMLSelectElement>(`.wf-role-template[data-role="${role}"]`)?.value ?? "";""", """function collectRole(role: string): WorkflowRoleConfig {
  const cfg: WorkflowRoleConfig = {};
  const mode =
    document.querySelector<HTMLSelectElement>(`.wf-role-mode[data-role="${role}"]`)?.value ?? "";
  const actionId =
    document.querySelector<HTMLSelectElement>(`.wf-role-action[data-role="${role}"]`)?.value ?? "";
  const template =
    document.querySelector<HTMLSelectElement>(`.wf-role-template[data-role="${role}"]`)?.value ?? "";""")

patch(WF, """  if (template) cfg.template = template;
  if (profile) cfg.profile = profile;""", """  if (template && mode !== "action") cfg.template = template;
  if (mode) cfg.mode = mode;
  if (mode === "action" && actionId) cfg.action_id = actionId;
  if (profile) cfg.profile = profile;""")

# ── 12. workflows.ts: isEmptyRole — mode/action_id ──
patch(WF, """function isEmptyRole(cfg: WorkflowRoleConfig): boolean {
  return (
    !cfg.template &&
    !cfg.profile &&
    !cfg.provider &&
    !cfg.model &&
    cfg.retries === undefined &&
    !cfg.plan_mode
  );
}""", """function isEmptyRole(cfg: WorkflowRoleConfig): boolean {
  return (
    !cfg.template &&
    !cfg.profile &&
    !cfg.provider &&
    !cfg.model &&
    cfg.retries === undefined &&
    !cfg.plan_mode &&
    !cfg.mode &&
    !cfg.action_id
  );
}""")

# ── 13. workflows.ts: handleSave — mode-aware validation + flags ──
patch(WF, """    if ((role === "tester" || role === "reviewer") && !cfg.template) {
      formError(`The ${role} role requires a template when enabled.`);
      return;
    }""", """    if ((role === "tester" || role === "reviewer") && !cfg.template && cfg.mode !== "action") {
      formError(`The ${role} role requires a template when enabled (or set mode to "action").`);
      return;
    }
    if (cfg.mode === "action" && !cfg.action_id) {
      formError(`The ${role} role requires an Action when mode is "action".`);
      return;
    }""")

patch(WF, """  workflow.clear_executions_on_review =
    (document.getElementById("wf-clear-exec") as HTMLInputElement | null)?.checked ?? false;""", """  workflow.clear_executions_on_review =
    (document.getElementById("wf-clear-exec") as HTMLInputElement | null)?.checked ?? false;
  workflow.auto_approve =
    (document.getElementById("wf-auto-approve") as HTMLInputElement | null)?.checked ?? false;
  const reviewOnFail =
    (document.getElementById("wf-review-on-fail") as HTMLInputElement | null)?.checked ?? false;
  if (!workflow.auto_approve && reviewOnFail) workflow.review_on_fail = true;""")

print("ALL DASHBOARD PATCHES APPLIED")
