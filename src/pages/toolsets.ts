/**
 * Toolsets page: named tool allow-lists defined in config/toolsets.yml.
 *
 * A toolset is a reusable list of tool names (exactly the names exposed to the
 * agent, e.g. `plugin__tool`). An EMPTY list is valid and means "no tool
 * allowed". A thread resolves its toolset with the first-match priority
 * workflow_role > workflow > task > channel > profile; when no level defines one
 * every tool is allowed.
 *
 * The page renders each toolset as a box (like the profiles page boxes) with a
 * "Plugins" section: every plugin exposes its tools as selectable chips.
 * Selection colours: gray = not selected, purple = selected, and a plugin box
 * turns golden while only PART of its tools are selected.
 *
 * The whole file is rewritten atomically through PUT /api/toolsets.
 */
import { apiGet, apiPut } from "../lib/api";
import { escapeHtml, formatApiError } from "../lib/helpers";
import { showToast } from "../lib/utils";
import { allSettledOrNull } from "../lib/parallel";
import type { ProfileData } from "../lib/types";

interface ToolsetsFile {
  toolsets: Record<string, string[]>;
}

interface PluginGroup {
  name: string;
  tools: string[];
}

/** The whole toolsets.yml document, mutated locally then PUT back. */
let _toolsets: Record<string, string[]> = {};
/** Every exposed tool grouped by plugin (server_name), sorted. */
let _plugins: PluginGroup[] = [];

export function renderToolsets(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Toolsets</h1>
        <p class="page-subtitle">Named tool allow-lists (config/toolsets.yml). A thread uses the first toolset defined by workflow role, workflow, task, channel or profile.</p>
      </div>
      <button id="create-toolset-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Toolset</button>
    </div>
    <div id="toolsets-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading toolsets...</div>
    </div>
  `;
  document.getElementById("create-toolset-btn")?.addEventListener("click", () => {
    showToolsetModal(null);
  });
  void loadToolsets();
}

async function loadToolsets(): Promise<void> {
  const content = document.getElementById("toolsets-content")!;
  try {
    // /api/toolsets and /profiles are independent: fetch them in the same tick.
    const [toolsetsRes, profilesRes] = await allSettledOrNull([
      apiGet<ToolsetsFile>("/api/toolsets"),
      apiGet<ProfileData[]>("/profiles"),
    ]);
    _toolsets = toolsetsRes?.toolsets ?? {};
    _plugins = buildPlugins(profilesRes);
    content.innerHTML = renderToolsetsPage();
    wireToolsets();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load toolsets: ${formatApiError(e)}</div>`;
  }
}

/** Group every exposed tool by its plugin (server_name; builtin fallback). */
function buildPlugins(profiles: ProfileData[] | null): PluginGroup[] {
  const map = new Map<string, string[]>();
  const details =
    (profiles || []).find((p) => Array.isArray(p.all_tool_details) && p.all_tool_details.length > 0)
      ?.all_tool_details || [];
  for (const td of details) {
    const plugin = td.server_name || "builtin";
    if (!map.has(plugin)) map.set(plugin, []);
    map.get(plugin)!.push(td.name);
  }
  return [...map.entries()]
    .map(([name, tools]) => ({ name, tools: tools.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function pluginState(selected: string[], tools: string[]): "none" | "partial" | "full" {
  const hit = tools.filter((t) => selected.includes(t)).length;
  if (hit === 0) return "none";
  if (hit === tools.length) return "full";
  return "partial";
}

function renderToolsetsPage(): string {
  const ids = Object.keys(_toolsets).sort();
  if (ids.length === 0) {
    return '<div class="empty-state">No toolsets defined. Use "+ Create Toolset" to add one.</div>';
  }
  return ids.map((id) => renderToolsetCard(id, _toolsets[id] || [])).join("");
}

function renderToolsetCard(id: string, selected: string[]): string {
  const plugins = _plugins
    .map((pl) => {
      const state = pluginState(selected, pl.tools);
      const hit = pl.tools.filter((t) => selected.includes(t)).length;
      const chips = pl.tools
        .map(
          (t) =>
            `<span class="tool-chip ${selected.includes(t) ? "tool-chip-active" : ""}" data-toolset="${escapeHtml(id)}" data-tool="${escapeHtml(t)}" title="${escapeHtml(t)}">${escapeHtml(t)}</span>`,
        )
        .join("");
      return `
        <div class="ts-plugin-box" data-state="${state}" data-plugin="${escapeHtml(pl.name)}" data-toolset="${escapeHtml(id)}">
          <div class="ts-plugin-head">
            <span class="ts-plugin-name">${escapeHtml(pl.name)}</span>
            <span class="ts-plugin-count">${hit}/${pl.tools.length}</span>
            <button type="button" class="ts-plugin-toggle" data-toolset="${escapeHtml(id)}" data-plugin="${escapeHtml(pl.name)}">${state === "full" ? "clear" : "all"}</button>
          </div>
          <div class="tool-chip-group">${chips}</div>
        </div>`;
    })
    .join("");
  const pluginsBody =
    _plugins.length > 0
      ? `<div class="ts-plugin-grid">${plugins}</div>`
      : '<span class="text-muted" style="font-size:0.85rem;">No tools discovered from the plugin registry.</span>';
  return `
    <div class="card settings-card" data-toolset-id="${escapeHtml(id)}">
      <div class="card-header">
        <span class="card-title">${escapeHtml(id)}</span>
        <span class="db-hint" style="margin-left:0.5rem;">${selected.length} tool${selected.length === 1 ? "" : "s"}${selected.length === 0 ? " (none allowed)" : ""}</span>
        <div style="margin-left:auto;display:flex;gap:0.375rem;">
          <button type="button" class="btn btn-sm ts-edit" data-toolset="${escapeHtml(id)}" title="Rename toolset">Edit</button>
          <button type="button" class="btn btn-sm ts-delete" data-toolset="${escapeHtml(id)}" title="Delete toolset" style="color:#f43f5e;border-color:rgba(244,63,94,0.4);">Delete</button>
        </div>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls" style="max-width:none;">
            <div class="setting-name">Plugins</div>
            ${pluginsBody}
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireToolsets(): void {
  const content = document.getElementById("toolsets-content");
  if (!content) return;

  content.querySelectorAll<HTMLElement>(".tool-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.dataset.toolset || "";
      const tool = chip.dataset.tool || "";
      if (!id || !tool) return;
      const list = _toolsets[id] || [];
      const idx = list.indexOf(tool);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(tool);
      _toolsets[id] = list;
      rerender();
      void saveToolsets("Toolset updated");
    });
  });

  content.querySelectorAll<HTMLButtonElement>(".ts-plugin-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.toolset || "";
      const plugin = btn.dataset.plugin || "";
      const pl = _plugins.find((p) => p.name === plugin);
      if (!id || !pl) return;
      const list = _toolsets[id] || [];
      const all = pl.tools.every((t) => list.includes(t));
      if (all) {
        _toolsets[id] = list.filter((t) => !pl.tools.includes(t));
      } else {
        _toolsets[id] = [...new Set([...list, ...pl.tools])];
      }
      rerender();
      void saveToolsets("Toolset updated");
    });
  });

  content.querySelectorAll<HTMLButtonElement>(".ts-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.toolset || "";
      showToolsetModal(id);
    });
  });

  content.querySelectorAll<HTMLButtonElement>(".ts-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.toolset || "";
      if (!id) return;
      if (!window.confirm(`Delete toolset '${id}'?`)) return;
      delete _toolsets[id];
      rerender();
      void saveToolsets(`Toolset '${id}' deleted`);
    });
  });
}

function rerender(): void {
  const content = document.getElementById("toolsets-content");
  if (!content) return;
  content.innerHTML = renderToolsetsPage();
  wireToolsets();
}

async function saveToolsets(okMessage: string): Promise<void> {
  try {
    await apiPut("/api/toolsets", { toolsets: _toolsets });
    showToast(okMessage, "success");
  } catch (e) {
    showToast("Failed: " + formatApiError(e), "error");
  }
}

/** Add (current=null) or rename (current=id) a toolset. */
function showToolsetModal(current: string | null): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <h2>${current ? "Rename Toolset" : "Create Toolset"}</h2>
        <button class="modal-close" id="ts-modal-close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="settings-section">
          <label class="filter-label">Name *</label>
          <input class="filter-input" id="ts-modal-name" type="text" placeholder="my_toolset" style="width:100%;" value="${current ? escapeHtml(current) : ""}" />
          <div class="text-muted" style="font-size:0.75rem;margin-top:0.25rem;">Letters, numbers, hyphens, and underscores only.</div>
        </div>
        <div class="settings-section" style="margin-top:0.75rem;">
          <div class="text-muted" style="font-size:0.8rem;padding:0.5rem;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid var(--glass-border);">
            A new toolset starts empty: an empty toolset means no tool is allowed. Select tools in the toolsets list afterwards.
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="ts-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="ts-modal-save" ${current ? "" : "disabled"}>${current ? "Rename" : "Create"}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  const nameInput = backdrop.querySelector("#ts-modal-name") as HTMLInputElement;
  const saveBtn = backdrop.querySelector("#ts-modal-save") as HTMLButtonElement;
  backdrop.querySelector("#ts-modal-close")?.addEventListener("click", close);
  backdrop.querySelector("#ts-modal-cancel")?.addEventListener("click", close);

  const validate = () => {
    const name = nameInput.value.trim();
    saveBtn.disabled = !/^[a-zA-Z0-9_-]+$/.test(name);
  };
  nameInput.addEventListener("input", validate);
  validate();

  saveBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    if (name !== current) {
      if (current) {
        if (Object.prototype.hasOwnProperty.call(_toolsets, name)) {
          showToast(`Toolset '${name}' already exists`, "error");
          return;
        }
        _toolsets[name] = _toolsets[current] || [];
        delete _toolsets[current];
      } else {
        _toolsets[name] = _toolsets[name] || [];
      }
    }
    saveBtn.disabled = true;
    close();
    rerender();
    await saveToolsets(current ? `Toolset '${name}' renamed` : `Toolset '${name}' created`);
  });
}
