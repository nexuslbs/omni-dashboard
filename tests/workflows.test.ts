import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Phase 5: Workflows page CRUD vs workflows.yml + reset-executions API ──

const api = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
const router = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
const page = readFileSync(new URL("../src/pages/workflows.ts", import.meta.url), "utf-8");
const detail = readFileSync(new URL("../src/lib/kanban-detail.ts", import.meta.url), "utf-8");

describe("Phase 5 API client (src/lib/api.ts)", () => {
  it("exports workflow data-fetch functions", () => {
    assert.ok(/export\s+async\s+function\s+fetchWorkflows\s*\(/.test(api), "fetchWorkflows");
    assert.ok(/export\s+async\s+function\s+upsertWorkflow\s*\(/.test(api), "upsertWorkflow");
    assert.ok(/export\s+async\s+function\s+deleteWorkflow\s*\(/.test(api), "deleteWorkflow");
    assert.ok(
      /export\s+async\s+function\s+resetWorkflowExecutions\s*\(/.test(api),
      "resetWorkflowExecutions",
    );
  });

  it("defines workflow TypeScript interfaces", () => {
    for (const iface of [
      "Workflow",
      "WorkflowRoleConfig",
      "WorkflowEntry",
      "WorkflowListResponse",
      "ResetExecutionsResponse",
    ]) {
      assert.ok(
        new RegExp(`export\\s+interface\\s+${iface}\\b`).test(api),
        `should export interface ${iface}`,
      );
    }
  });

  it("Workflow interface includes top-level clear_executions_on_review (default off, outside roles)", () => {
    const wf = api.slice(
      api.indexOf("export interface Workflow "),
      api.indexOf("export interface WorkflowEntry "),
    );
    assert.ok(wf.includes("clear_executions_on_review"), "Workflow should carry clear_executions_on_review");
  });

  it("uses the workflows.yml CRUD endpoints (GET/PUT/DELETE /workflows)", () => {
    assert.ok(api.includes('apiGet<WorkflowListResponse>("/workflows")'), "GET /workflows");
    assert.ok(
      api.includes("apiPut<WorkflowListResponse>(`/workflows/${encodeURIComponent(key)}`, workflow)"),
      "PUT /workflows/{key}",
    );
    assert.ok(
      api.includes("apiDelete<WorkflowListResponse>(`/workflows/${encodeURIComponent(key)}`)"),
      "DELETE /workflows/{key}",
    );
  });

  it("resetWorkflowExecutions calls POST /kanban/tasks/{id}/workflow/executions/reset", () => {
    assert.ok(
      api.includes("`/kanban/tasks/${encodeURIComponent(String(taskId))}/workflow/executions/reset`"),
      "reset URL must be /kanban/tasks/{id}/workflow/executions/reset",
    );
  });
});

describe("Phase 5 routing (src/lib/router.ts)", () => {
  it("imports renderWorkflows from pages/workflows", () => {
    assert.ok(router.includes('import { renderWorkflows } from "../pages/workflows";'), "workflows import");
  });
  it("registers the workflows route", () => {
    assert.ok(router.includes('{ name: "workflows", handler: renderWorkflows }'), "workflows route entry");
  });
});

describe("Phase 5 navigation (index.html)", () => {
  it("adds Workflows nav items for desktop and mobile", () => {
    assert.ok(
      html.includes('<a href="/workflows" class="nav-item" data-route="workflows">'),
      "desktop nav item",
    );
    assert.ok(
      html.includes('<a href="/workflows" class="mobile-nav-item" data-route="workflows">'),
      "mobile nav item",
    );
  });
});

describe("Phase 5 Workflows page (src/pages/workflows.ts)", () => {
  it("exports renderWorkflows", () => {
    assert.ok(/export\s+function\s+renderWorkflows\s*\(/.test(page), "renderWorkflows export");
  });
  it("form includes top-level clear_executions_on_review checkbox (outside roles)", () => {
    assert.ok(page.includes('id="wf-clear-exec"'), "checkbox id");
    assert.ok(page.includes("Clear workflow executions when the task moves to review"), "checkbox label");
  });
  it("shows field precedence hints", () => {
    assert.ok(page.includes("Field precedence:"), "precedence hint box");
    assert.ok(page.includes("workflow role"), "role-level precedence mention");
  });
  it("supports CRUD: list, upsert, delete against workflows.yml", () => {
    assert.ok(page.includes("fetchWorkflows"), "loads via fetchWorkflows");
    assert.ok(page.includes("upsertWorkflow"), "saves via upsertWorkflow");
    assert.ok(page.includes("deleteWorkflow"), "deletes via deleteWorkflow");
  });
  it("notes that workflows are stored in workflows.yml, not the DB", () => {
    assert.ok(page.includes("workflows.yml"), "mentions workflows.yml");
    assert.ok(page.includes("no database tables"), "no DB tables note");
  });
  it("validates: executor role required, tester/reviewer template required when enabled", () => {
    assert.ok(page.includes("executor role is required"), "executor required");
    assert.ok(page.includes("requires a template"), "tester/reviewer template required");
    assert.ok(
      page.includes("template required when enabled"),
      "wording: required when enabled (not when defined)",
    );
  });
});

describe("Workflows page form (selects, checkboxes, tel, role sections)", () => {
  it("uses customized selects (enhanceSelectElement) for all form selects", () => {
    assert.ok(page.includes("enhanceSelectElement"), "enhances selects via enhanceSelectElement");
    assert.ok(page.includes("unenhanceSelect"), "re-enhances after option rebuilds");
  });

  it("renders template as a select filtered by the resolved profile", () => {
    assert.ok(page.includes('class="filter-select wf-role-template"'), "role template select");
    assert.ok(
      page.includes("_templates.filter((t) => t.profile === profile)"),
      "templates filtered by profile",
    );
    assert.ok(page.includes('"- (None) -"'), "no-template option");
  });

  it("renders provider and model selects with cascade", () => {
    assert.ok(page.includes('class="filter-select wf-role-provider"'), "role provider select");
    assert.ok(page.includes('class="filter-select wf-role-model"'), "role model select");
    assert.ok(page.includes("refreshRoleModel"), "provider -> model cascade");
    assert.ok(page.includes("getModelsForProvider"), "model options come from the provider plugin");
  });

  it("renders planning mode as a 3-option select (Default/On/Off)", () => {
    assert.ok(page.includes('opt("on", "On"'), "On option");
    assert.ok(page.includes('opt("off", "Off"'), "Off option");
    assert.ok(page.includes('"- (Default) -"'), "Default option");
  });

  it("uses type=tel for retries (no browser number spinner)", () => {
    assert.ok(
      page.includes('type="tel" inputmode="numeric" pattern="[0-9.-]*"'),
      "retries fields use tel input",
    );
  });

  it("has enable checkboxes for tester/reviewer, checked by default on create", () => {
    assert.ok(page.includes('class="wf-role-enabled"'), "enable checkbox class");
    assert.ok(page.includes("editingKey !== null ? !!roles[role] : true"), "checked by default on create");
    assert.ok(page.includes("wf-role-fields-disabled"), "disabled section style when unchecked");
  });

  it("opens all role sections by default (executor, tester, reviewer)", () => {
    assert.ok(page.includes('class="wf-role-details" open'), "all role details open");
  });

  it("shows template texts only on demand, rendered as markdown", () => {
    assert.ok(page.includes("wf-show-templates"), "Show templates toggle button");
    assert.ok(page.includes("renderMarkdown"), "uses the shared markdown renderer");
    assert.ok(page.includes('class="markdown-content"'), "markdown content container");
    assert.ok(page.includes("/templates/content?profile="), "fetches template file content by profile+name");
  });

  it("styles clear executions on review as a bordered badge", () => {
    assert.ok(page.includes('class="wf-badge"'), "bordered badge for clear executions on review");
  });

  it("renders each role on its own line with only defined fields", () => {
    assert.ok(page.includes("wf-role-line"), "role line container");
    assert.ok(page.includes("${role}</strong> - "), "role - template separator");
    assert.ok(page.includes("plan_mode"), "plan mode shown when defined");
  });
});

describe("Phase 5 Kanban Task Details (src/lib/kanban-detail.ts)", () => {
  it("renders a Reset Workflow Executions button", () => {
    assert.ok(detail.includes('id="task-reset-workflow-btn"'), "reset button id");
    assert.ok(detail.includes("Reset Workflow Executions"), "button label");
  });
  it("calls the reset-executions API", () => {
    assert.ok(
      detail.includes("`/kanban/tasks/${encodeURIComponent(taskId)}/workflow/executions/reset`"),
      "reset API URL",
    );
    assert.ok(
      detail.includes("apiPost<ResetExecutionsResponse>"),
      "uses apiPost with ResetExecutionsResponse",
    );
  });
});
