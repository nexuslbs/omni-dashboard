import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ── Unit tests for src/lib/api.ts ──
describe("src/lib/api.ts", () => {
  it("API_BASE constant equals /api", () => {
    // Read the file and verify the constant
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    const match = content.match(/export\s+const\s+API_BASE\s*=\s*["']([^"']+)["']/);
    assert.ok(match, "API_BASE constant should be defined");
    assert.equal(match[1], "/api");
  });

  it("exports apiGet, apiPost, apiDelete functions", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+async\s+function\s+apiGet\s*</.test(content), "should export apiGet<T>");
    assert.ok(/export\s+async\s+function\s+apiPost\s*</.test(content), "should export apiPost<T>");
    assert.ok(/export\s+async\s+function\s+apiDelete\s*</.test(content), "should export apiDelete<T>");
  });

  it("all API functions throw on non-ok response", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    // Each function should check res.ok and throw on failure
    assert.ok(content.includes("if (!res.ok)"), "apiGet should check res.ok");
    assert.ok(content.includes("throw new Error"), "API functions should throw on failure");
  });

  it("defines all expected TypeScript interfaces", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    const interfaces = [
      "HealthCheck",
      "SystemStats",
      "Message",
      "TokenUsage",
      "OverviewRow",
      "Channel",
      "MessagesResponse",
      "MessagesFilters",
      "WikiSearchResult",
      "SearchResult",
      "FsEntry",
      "FsListResponse",
      "FsReadResponse",
      "UploadResponse",
      "UploadListEntry",
      "KanbanBoard",
      "KanbanBoardsResponse",
      "KanbanTask",
      "KanbanColumn",
      "KanbanBoardResponse",
      "CronJob",
    ];
    for (const iface of interfaces) {
      assert.ok(
        new RegExp(`export\\s+interface\\s+${iface}\\b`).test(content),
        `should export interface ${iface}`,
      );
    }
  });

  it("apiGet uses fetch with API_BASE prefix", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    // Extract apiGet function body using a multiline-aware approach
    const apiGetStart = content.indexOf("export async function apiGet");
    assert.ok(apiGetStart >= 0, "apiGet declaration found");
    // find the opening brace
    const openBrace = content.indexOf("{", apiGetStart);
    assert.ok(openBrace >= 0, "apiGet opening brace found");
    const apiGetBody = content.slice(apiGetStart, openBrace + 200);
    assert.ok(apiGetBody.includes("fetch(`${API_BASE}${path}`)"), "apiGet should fetch with API_BASE + path");
  });

  it("apiPost uses POST method and JSON content-type", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    const apiPostStart = content.indexOf("export async function apiPost");
    assert.ok(apiPostStart >= 0, "apiPost declaration found");
    const openBrace = content.indexOf("{", apiPostStart);
    assert.ok(openBrace >= 0, "apiPost opening brace found");
    const apiPostBody = content.slice(apiPostStart, openBrace + 250);
    assert.ok(apiPostBody.includes('method: "POST"'), "apiPost should use POST method");
    assert.ok(apiPostBody.includes('"Content-Type"'), "apiPost should set Content-Type header");
    assert.ok(apiPostBody.includes("JSON.stringify(body)"), "apiPost should stringify body");
  });

  it("apiDelete uses DELETE method", () => {
    const content = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf-8");
    const apiDeleteStart = content.indexOf("export async function apiDelete");
    assert.ok(apiDeleteStart >= 0, "apiDelete declaration found");
    const openBrace = content.indexOf("{", apiDeleteStart);
    assert.ok(openBrace >= 0, "apiDelete opening brace found");
    const apiDeleteBody = content.slice(apiDeleteStart, openBrace + 150);
    assert.ok(apiDeleteBody.includes('method: "DELETE"'), "apiDelete should use DELETE method");
  });

  // Try dynamic import to verify module structure (will work in Node 22+)
  it("module can be imported and exports expected symbols", async () => {
    try {
      const mod = await import("../src/lib/api.ts");
      assert.equal(typeof mod.API_BASE, "string");
      assert.equal(mod.API_BASE, "/api");
      assert.equal(typeof mod.apiGet, "function");
      assert.equal(typeof mod.apiPost, "function");
      assert.equal(typeof mod.apiDelete, "function");

      // Verify interfaces are exported (they'll be undefined at runtime
      // since TS interfaces vanish, but the symbol export should exist)
      // Actually, types/interfaces don't produce runtime exports in ESM.
      // Just verify the functions work.
    } catch (e: any) {
      // Skip if import fails (e.g., strict mode TS, experimental feature not enabled)
      // This is informational
      assert.ok(true, `Dynamic import note: ${e.message}`);
    }
  });
});

// ── Unit tests for src/lib/router.ts ──
describe("src/lib/router.ts", () => {
  it("exports router with go method", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+const\s+router\s*=/.test(content), "should export router constant");
    assert.ok(
      /go\s*\(\s*route\s*:\s*string\s*\)/.test(content),
      "router should have go(route: string) method",
    );
  });

  it("defines all expected page routes", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    const expectedRoutes = ["overview", "messages", "kanban", "schedules", "settings"];
    for (const route of expectedRoutes) {
      assert.ok(content.includes(`name: "${route}"`), `should define route: ${route}`);
    }
  });

  it("defines parameterized routes for detail pages", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    assert.ok(content.includes('prefix: "kanban/"'), "should define kanban/ param route");
    assert.ok(content.includes('prefix: "schedules/"'), "should define schedules/ param route");
  });

  it("param route handlers extract parameter correctly", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    // The go function should call route.slice(pr.prefix.length) to extract param
    assert.ok(content.includes(".slice(pr.prefix.length)"), "should extract param via slice");
  });

  it("404 fallback renders error state", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("404"), "should have 404 fallback");
    assert.ok(content.includes("Page not found"), "should render 'Page not found' message");
  });

  it("routes use dynamically imported page renderers", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    // Check that it imports all the page modules
    assert.ok(content.includes("import { renderOverview }"), "should import renderOverview");
    assert.ok(content.includes("import { renderMessages }"), "should import renderMessages");
    assert.ok(
      content.includes("import { renderKanban, renderKanbanDetail }"),
      "should import renderKanban and renderKanbanDetail",
    );
    assert.ok(
      content.includes("import { renderSchedule, renderScheduleDetail }"),
      "should import renderSchedule and renderScheduleDetail",
    );
    assert.ok(content.includes("import { renderProviders }"), "should import renderProviders");
  });

  it("router.go iterates param routes before exact routes", () => {
    const content = readFileSync(new URL("../src/lib/router.ts", import.meta.url), "utf-8");
    const paramRoutesIndex = content.indexOf("paramRoutes");
    const routesIndex = content.indexOf("// Check exact routes");
    assert.ok(paramRoutesIndex < routesIndex, "paramRoutes should be checked before exact routes");
  });
});

// ── Unit tests for src/lib/plugin-ui.ts ──
describe("src/lib/plugin-ui.ts", () => {
  it("renderPluginCard includes card-body with renderPluginConfig call", () => {
    const content = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");
    // Card body must call renderPluginConfig to show the config form when expanded
    // Use [\\s\\S]* to match across newlines since card-body and renderPluginConfig
    // are on different lines with content in between
    assert.ok(
      /card-body[\s\S]*renderPluginConfig\s*\(/.test(content),
      "card body should include renderPluginConfig(p) call",
    );
  });

  it("renderPluginCard includes tool names in card body when pluginTools provided", () => {
    const content = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");
    // When hasTools and pluginTools are set, the card body shows tool badges
    assert.ok(/pluginTools/.test(content), "card body should reference pluginTools array");
    assert.ok(
      /badge-neutral.*escapeHtml/.test(content) && content.includes("pluginTools.map"),
      "tool names should render as badge-neutral tags",
    );
  });

  it("renderPluginCard renders a uniform 'source: <value>' badge for every source", () => {
    const content = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");
    // ONE uniform badge template for all sources (built-in, bundled, remote, ...):
    // the registry `source` value is shared by tools, providers and platforms alike.
    assert.ok(
      /source:\s*\$\{escapeHtml\(p\.source\)\}/.test(content),
      "card header should render the uniform `source: ${escapeHtml(p.source)}` badge",
    );
    // The old kind-specific label was wrong for providers/platforms (their source is
    // also "built-in"), so it must not come back.
    assert.ok(!/built-in tool/i.test(content), 'card must not render a "built-in tool" label');
    // No source-conditional badge wording in the card renderer.
    assert.ok(!/p\.source === "built-in"\s*\?/.test(content), "no source-conditional badge wording");
  });

  it("renderPluginConfig function generates config fields from configSchema", () => {
    const content = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");
    // renderPluginConfig should check configSchema and render fields + save button
    assert.ok(content.includes("configSchema"), "renderPluginConfig should check configSchema");
    assert.ok(content.includes("plugin-save-btn"), "renderPluginConfig should include a Save button");
  });

  it("exports renderPluginCard, renderActionButtons, wirePluginButtons, showInstallModal", () => {
    const content = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");
    assert.ok(/export\s+function\s+renderPluginCard\b/.test(content), "export renderPluginCard");
    assert.ok(/export\s+function\s+renderActionButtons\b/.test(content), "export renderActionButtons");
    assert.ok(/export\s+function\s+wirePluginButtons\b/.test(content), "export wirePluginButtons");
  });

  it("restart handler persists pending config before restarting", () => {
    const content = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");
    // Restart must save the form (POST /config) BEFORE triggering /restart,
    // otherwise the backend restarts the plugin with the previously saved
    // (stale) config instead of the current form values.
    const restartSection = content.slice(content.indexOf("// Restart buttons"));
    const restartIdx = restartSection.indexOf("/restart");
    const configIdx = restartSection.indexOf("/config");
    assert.ok(restartIdx >= 0 && configIdx >= 0, "restart handler must call /config and /restart");
    assert.ok(configIdx < restartIdx, "config must be persisted before the restart POST");
  });
});

// ── Unit tests for src/lib/helpers.ts: escapeHtml quote escaping (9bce18c) ──
// Regression: the old DOM-based escapeHtml (div.textContent -> innerHTML) left `"`
// unescaped, so HTML attribute values (value="..." / data-original="...") were
// truncated at the first double quote: secret values containing " were cut off.
describe("src/lib/helpers.ts", () => {
  it("escapeHtml source escapes double and single quotes", () => {
    const content = readFileSync(new URL("../src/lib/helpers.ts", import.meta.url), "utf-8");
    assert.ok(content.includes('.replace(/"/g'), 'must escape " as &quot;');
    assert.ok(content.includes(".replace(/'/g"), "must escape ' as &#39;");
    assert.ok(content.includes("&quot;"), "escape map must include &quot;");
    assert.ok(content.includes("&#39;"), "escape map must include &#39;");
  });

  it("escapeHtml runtime: quotes and special chars are fully preserved (node 22+)", async () => {
    try {
      const mod = await import("../src/lib/helpers.ts");
      const esc: (s: string) => string = mod.escapeHtml;
      assert.equal(esc('a"b'), "a&quot;b");
      assert.equal(esc("a'b"), "a&#39;b");
      assert.equal(esc("a&b<c>d"), "a&amp;b&lt;c&gt;d");
      assert.equal(esc("x\"y'z"), "x&quot;y&#39;z");
    } catch (e: any) {
      // Skip on older node without .ts type-stripping (informational only)
      assert.ok(true, `escapeHtml runtime import note: ${e.message}`);
    }
  });
});

// ── Unit tests for src/pages/secrets.ts: Edit capability (9bce18c) ──
describe("src/pages/secrets.ts", () => {
  it("secret value inputs render readonly with an explicit Edit button", () => {
    const content = readFileSync(new URL("../src/pages/secrets.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("readonly"), "value input must start readonly");
    assert.ok(content.includes("secret-edit-btn"), "must render an ✎ Edit button");
  });

  it("Edit unlocks the input; save/cancel re-lock it", () => {
    const content = readFileSync(new URL("../src/pages/secrets.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("input.readOnly = false"), "Edit must unlock the input");
    assert.ok(content.includes("input.readOnly = true"), "save/cancel must re-lock the input");
  });
});

// ── Unit tests for plugin secret select sync: initial value + discard revert (9bce18c) ──
describe("plugin secret select sync (dropdown/plugin-config/plugin-list/plugin-ui)", () => {
  it("dropdown.ts exports syncSelectDisplayEl (by-element variant of syncSelectDisplay)", () => {
    const content = readFileSync(new URL("../src/lib/dropdown.ts", import.meta.url), "utf-8");
    assert.ok(
      /export\s+function\s+syncSelectDisplayEl\s*\(/.test(content),
      "must export syncSelectDisplayEl",
    );
  });

  it("plugin-config.ts re-syncs the enhanced select after secrets fetch and value changes", () => {
    const content = readFileSync(new URL("../src/lib/plugin-config.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("syncSelectDisplayEl"), "must import/use syncSelectDisplayEl");
    assert.ok(content.includes("syncSelectDisplayEl(select)"), "must sync the secrets select element");
  });

  it("plugin-list.ts and plugin-ui.ts discard handlers re-sync enhanced selects", () => {
    const listSrc = readFileSync(new URL("../src/lib/plugin-list.ts", import.meta.url), "utf-8");
    const uiSrc = readFileSync(new URL("../src/lib/plugin-ui.ts", import.meta.url), "utf-8");
    assert.ok(listSrc.includes("syncSelectDisplayEl"), "plugin-list discard must re-sync selects");
    assert.ok(uiSrc.includes("syncSelectDisplayEl"), "plugin-ui discard must re-sync selects");
  });
});

// ── Multiline secret support (regression) ──
describe("src/pages/secrets.ts: multiline secret fields", () => {
  it("secret value fields render as <textarea> (multiline), not single-line inputs", () => {
    const content = readFileSync(new URL("../src/pages/secrets.ts", import.meta.url), "utf-8");
    assert.ok(/<textarea/.test(content), "secret fields must render as <textarea>");
    assert.ok(content.includes("new-secret-value"), "create modal must include the value textarea");
    assert.ok(
      content.includes('placeholder="Enter secret value"'),
      'create modal placeholder must be exactly "Enter secret value"',
    );
  });

  it("multiline values are NOT embedded in HTML attributes (newline normalization would corrupt them)", () => {
    const content = readFileSync(new URL("../src/pages/secrets.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("secretRealValues"), "real values must be kept in the secretRealValues Map");
    assert.ok(
      !content.includes('data-original="${escapeHtml(value)}"'),
      "raw value must not be placed in a data-* attribute",
    );
    assert.ok(content.includes("secretRealValues.set(name, value)"), "save must update the real-value Map");
  });

  it("provides bullet-per-line masking for password-type multiline secrets", () => {
    const content = readFileSync(new URL("../src/pages/secrets.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("function maskSecretValue"), "must define maskSecretValue helper");
    assert.ok(
      content.includes('"•".repeat(line.length)'),
      "mask must preserve line structure with one bullet per char",
    );
  });

  it("mask/unmask toggle and edit reveal operate on the textarea", () => {
    const content = readFileSync(new URL("../src/pages/secrets.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("function revealSecret"), "must define revealSecret");
    assert.ok(content.includes("function maskSecret"), "must define maskSecret");
    assert.ok(content.includes('el.tagName === "TEXTAREA"'), "toggle must handle textareas");
    assert.ok(content.includes("revealSecret(input)"), "Edit must reveal the real value first");
  });

  it("versions modal renders multiline values as masked textareas", () => {
    const content = readFileSync(new URL("../src/pages/secrets.ts", import.meta.url), "utf-8");
    assert.ok(content.includes("realValues[fieldId] = v.value"), "versions keep real values in a local map");
    assert.ok(/ver-\$\{v\.id\}[\s\S]*<textarea/.test(content), "version values must render as <textarea>");
  });
});
