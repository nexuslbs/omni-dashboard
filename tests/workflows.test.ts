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
    assert.ok(
      page.includes("Clear workflow execution counters when the task moves to review"),
      "checkbox label mentions execution counters",
    );
    assert.ok(
      page.includes("<span>Clear workflow execution counters"),
      "label text wrapped in a span so the flex gap does not split around the code element",
    );
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
  it("notes that workflows are stored in workflows.yml", () => {
    assert.ok(page.includes("workflows.yml"), "mentions workflows.yml");
    assert.ok(page.includes("Workflow definitions stored in"), "subtitle: no emdash, no OMNI_DIR");
    assert.ok(!page.includes("no database tables"), "removed 'no database tables'");
    assert.ok(!page.includes("OMNI_DIR);"), "removed OMNI_DIR from subtitle");
  });
  it("renders field precedence as an actual note (callout box)", () => {
    assert.ok(page.includes('class="wf-note"'), "note callout box");
    assert.ok(page.includes("Field precedence:"), "precedence line kept");
    assert.ok(!page.includes("falls back to the kanban task template"), "removed template fallback sentence");
  });
  it("places the save hint below the + New Workflow button", () => {
    assert.ok(page.includes("wf-new-btn"), "new workflow button");
    assert.ok(page.includes("Changes are written to workflows.yml and apply on save."), "save hint text");
    const btnIdx = page.indexOf("wf-new-btn");
    const hintIdx = page.indexOf("Changes are written to workflows.yml and apply on save.");
    assert.ok(btnIdx !== -1 && hintIdx !== -1 && btnIdx < hintIdx, "hint comes after the button");
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

describe("Workflows page provider-error banner (regression: no dangling identifiers)", () => {
  // Regression for: "Failed to load workflows: _providerErrors is not defined".
  // loadWorkflows() renders providerErrorBanner(_providerErrors), so the
  // identifier MUST be declared in THIS module (mirrors profiles.ts).
  // channel-config.ts exports a same-named variable, but module scope is not
  // shared: a missing local declaration is a runtime ReferenceError that a
  // transpile-only build (vite/esbuild) cannot catch.
  it("declares _providerErrors at module scope with the ProviderError[] type", () => {
    assert.ok(
      /let\s+_providerErrors:\s*ProviderError\[\]\s*=\s*\[\]/.test(page),
      "module-scope declaration exists in workflows.ts",
    );
    assert.ok(
      /type\s+ProviderError\s*\}?\s*from\s*"\.\.\/lib\/providers"/.test(page),
      "imports the ProviderError type from lib/providers",
    );
  });
  it("assigns _providerErrors from the merged provider resolution", () => {
    assert.ok(page.includes("_providerErrors = merged.errors;"), "loadWorkflowData stores merged.errors");
  });
  it("banner render path references only declared identifiers", () => {
    assert.ok(page.includes("providerErrorBanner(_providerErrors)"), "banner uses the local _providerErrors");
    const declIdx = page.indexOf("let _providerErrors");
    const useIdx = page.indexOf("providerErrorBanner(_providerErrors)");
    assert.ok(
      declIdx !== -1 && useIdx !== -1 && declIdx < useIdx,
      "declaration precedes the banner use in the module",
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

  it("retries placeholders default to 0 (default value when omitted)", () => {
    assert.ok(page.includes('id="wf-retries"'), "workflow-level Default retries input");
    assert.ok(page.includes('class="filter-input wf-role-retries"'), "role-level Retries inputs");
    const zeros = page.match(/placeholder="0"/g) ?? [];
    assert.ok(zeros.length >= 2, `all retries inputs use placeholder 0 (found ${zeros.length})`);
    assert.ok(!page.includes('placeholder="2"'), "no retries input still shows placeholder 2");
  });

  it("has enable checkboxes for tester/reviewer, checked by default on create", () => {
    assert.ok(page.includes('class="wf-role-enabled"'), "enable checkbox class");
    assert.ok(page.includes("editingKey !== null ? !!roles[role] : true"), "checked by default on create");
    assert.ok(page.includes("wf-role-fields-disabled"), "disabled section style when unchecked");
  });

  it("opens all role sections by default (executor, tester, reviewer)", () => {
    assert.ok(page.includes('class="wf-role-details" open'), "all role details open");
  });

  it("aligns role hints on the text baseline (no superscript look)", () => {
    assert.ok(
      page.includes("display:flex;align-items:baseline;gap:.5rem;list-style:none"),
      "role summary uses baseline alignment so the hint sits on the role name baseline",
    );
  });

  it("shows template texts only on demand, rendered as markdown", () => {
    assert.ok(page.includes("wf-show-templates"), "Show templates toggle button");
    assert.ok(
      page.includes("background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);color:#fbbf24"),
      "Show templates is golden (matches the clear executions on review badge)",
    );
    assert.ok(page.includes("renderMarkdown"), "uses the shared markdown renderer");
    assert.ok(page.includes('class="markdown-content"'), "markdown content container");
    assert.ok(page.includes("/templates/content?profile="), "fetches template file content by profile+name");
  });

  it("styles clear executions on review as a bordered badge, centered with the key", () => {
    assert.ok(page.includes('class="wf-badge"'), "bordered badge for clear executions on review");
    assert.ok(
      page.includes('style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;"'),
      "key + badge wrapped in a flex row so the badge is vertically centered with the key text",
    );
  });

  it("sizes up the roles box labels and role hints", () => {
    assert.ok(page.includes('class="db-hint wf-role-hint"'), "role hints use the wf-role-hint class");
    const labelMatches = page.match(/font-size:.88rem;color:#99a;/g) ?? [];
    assert.ok(
      labelMatches.length >= 12,
      `role/workflow labels use the bigger .88rem font (found ${labelMatches.length})`,
    );
  });

  it("renders each role on its own line with only defined fields", () => {
    assert.ok(page.includes("wf-role-line"), "role line container");
    assert.ok(page.includes("${role}</strong> - "), "role - template separator");
    assert.ok(page.includes("plan_mode"), "plan mode shown when defined");
  });

  it("styles the action buttons: purple Edit, cyan New, green Save, red Cancel", () => {
    assert.ok(page.includes('class="btn btn-sm wf-edit"'), "edit keeps btn-sm size (same as Delete)");
    assert.ok(
      page.includes(
        "background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple)",
      ),
      "edit is purple (Create Schedule / + Add style)",
    );
    assert.ok(page.includes('id="wf-new-btn" class="btn-primary"'), "new workflow button");
    assert.ok(
      page.includes("background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee"),
      "new workflow is cyan (Import style)",
    );
    assert.ok(
      page.includes("background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2)"),
      "save is green (Enabled label style)",
    );
    assert.ok(page.includes('id="wf-cancel-btn" class="btn btn-danger"'), "cancel is red (Delete style)");
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

describe("Workflows page responsive layout (small screens)", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

  it("marks the workflow card action buttons with wf-card-actions", () => {
    assert.ok(page.includes('class="wf-card-actions"'), "actions class present");
  });

  it("wraps the card header and moves actions above roles below 900px", () => {
    assert.ok(css.includes(".wf-card .card-header"), "card header wrap rule for wf-card");
    const mqStart = css.lastIndexOf("@media (max-width: 899px)");
    assert.ok(mqStart !== -1, "899px media query exists");
    const tail = css.slice(mqStart);
    assert.ok(tail.includes(".wf-card-actions"), "actions styled inside a 899px media query");
    assert.ok(tail.includes("width: 100%"), "actions take a full row below 900px");
    assert.ok(tail.includes("justify-content: flex-start"), "actions left-aligned when stacked");
  });
});

// ── Workflow nav icon: outlined workflow diagram (square -> circle -> diamond -> circle) ──

describe("Workflow nav icon (index.html)", () => {
  it("renders the outlined workflow diagram in the desktop and mobile icons", () => {
    // Both the desktop (nav-item) and mobile (mobile-nav-item) icons render the
    // same 24x24 workflow diagram (mirrors icons8 id=2603): a square bottom-left,
    // circle top-left, diamond (losangle) top-right and circle bottom-right, all
    // outline-only (border, empty inside), joined by arrows:
    // square -> circle (up), circle -> diamond (right), diamond -> circle (down).
    const squares = html.match(/<rect x="2" y="16" width="6" height="6" \/>/g) ?? [];
    assert.equal(squares.length, 2, "workflow square present in both nav icons");
    const circles = html.match(/<circle cx="5" cy="5" r="3" \/>/g) ?? [];
    assert.equal(circles.length, 2, "top-left circle present in both nav icons");
    const diamonds = html.match(/<polygon points="19,1.5 22.5,5 19,8.5 15.5,5" \/>/g) ?? [];
    assert.equal(diamonds.length, 2, "top-right diamond present in both nav icons");
    const endCircles = html.match(/<circle cx="19" cy="19" r="3" \/>/g) ?? [];
    assert.equal(endCircles.length, 2, "bottom-right circle present in both nav icons");
    const upArrows = html.match(/<path d="M5 14.5v-2.7" \/>/g) ?? [];
    assert.equal(upArrows.length, 2, "square->circle up arrow present in both nav icons");
    const rightArrows = html.match(/<path d="M9.5 5h3.2" \/>/g) ?? [];
    assert.equal(rightArrows.length, 2, "circle->diamond right arrow present in both nav icons");
    const downArrows = html.match(/<path d="M19 10.5v3.2" \/>/g) ?? [];
    assert.equal(downArrows.length, 2, "diamond->circle down arrow present in both nav icons");
    // The old three-circle icon must be gone.
    assert.ok(!html.includes("M6 9v6"), "no old vertical connector remains");
    assert.ok(!html.includes("M9 6h6"), "no old horizontal connector remains");
    assert.ok(!html.includes("M6 10h5a4"), "no dangling arc path remains");
    assert.ok(!html.includes("M18 9v.01"), "no stray dot path remains");
  });
});
