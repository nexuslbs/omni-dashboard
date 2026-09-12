/**
 * Models page: provider/model overrides from config/models.yml.
 *
 * Modeled on the /channels page (same appearance + functionality: list rows,
 * inline add/edit/delete, save behavior) but driven by the models API
 * (GET/PUT /api/models) which reads/writes config/models.yml instead of the
 * channels API / channels.yml.
 *
 * Renders models.yml content: provider definitions + fields + models list +
 * per-model config. Import button mirrors the plugins pages import flow
 * (shared implementation in lib/plugin-import.ts, showModelsImportModal).
 */
import { apiGet, apiPost, apiPut } from "../lib/api";
import { escapeHtml, formatApiError } from "../lib/helpers";
import { showToast } from "../lib/utils";
import { showModelsImportModal } from "../lib/plugin-import";
import { enhanceSelectElement } from "../lib/dropdown";

// ── Types (mirror of omniagent src/models_yaml.rs) ──

export interface ModelConfig {
  api_mode?: string;
  supports_reasoning?: boolean;
  token_budget_soft?: number;
  token_budget_hard?: number;
  max_tokens?: number;
  max_tokens_on_truncation?: number;
}

export interface ProviderOverride {
  plugin?: boolean | string;
  models?: string[];
  api_mode?: string;
  supports_reasoning?: boolean;
  default_base_url?: string;
  refresh_url?: string;
  default_model?: string;
  api_key?: string;
  token_budget_soft?: number;
  token_budget_hard?: number;
  max_tokens?: number;
  max_tokens_on_truncation?: number;
  model_config?: Record<string, ModelConfig>;
}

export interface ModelsFile {
  providers: Record<string, ProviderOverride>;
}

const API_MODES = ["chat_completions", "anthropic_messages"];

// ── Main render ──

export function renderModels(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Models</h1>
        <p class="page-subtitle">Provider/model overrides via config/models.yml</p>
      </div>
    </div>
    <div class="filter-bar" id="models-filter-bar">
      <div class="filter-section">
        <label class="filter-label">Provider</label>
        <input type="text" id="filter-provider" class="filter-input" placeholder="Search provider..." />
      </div>
      <div class="filter-actions" style="margin-left:auto;">
        <button id="models-import-btn" class="btn" style="background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;">Import</button>
        <button id="add-provider-btn" class="btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:#a78bfa;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;">+ Add Provider</button>
        <button id="refresh-models-btn" class="btn" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:#34d399;border-radius:6px;padding:0.375rem 0.9rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">↻ Refresh</button>
      </div>
    </div>
    <div id="models-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading models.yml...</div>
    </div>
  `;
  wireModelsPage();
  void loadModels();
}

// ── Data loading ──

let currentFile: ModelsFile = { providers: {} };
let editName: string | null = null; // provider name currently in edit mode

async function loadModels(): Promise<void> {
  const content = document.getElementById("models-content")!;
  content.innerHTML = '<div class="loading">Loading models.yml...</div>';
  try {
    const file = await apiGet<ModelsFile>("/models");
    currentFile = file && file.providers ? file : { providers: {} };
    content.innerHTML = renderProviders(currentFile);
    wireRows();
    const filterInput = document.getElementById("filter-provider") as HTMLInputElement | null;
    if (filterInput) filterInput.value = "";
  } catch (e) {
    content.innerHTML =
      '<div class="error-state" style="padding:3rem;text-align:center;">Failed to load models.yml: ' +
      formatApiError(e) +
      "</div>";
  }
}

function providerSubtitle(p: ProviderOverride): string {
  const bits: string[] = [];
  if (p.plugin === false) bits.push("no plugin (builtin)");
  else if (typeof p.plugin === "string") bits.push(`plugin: ${p.plugin}`);
  else if (p.plugin === true || p.plugin === undefined) bits.push("plugin-backed");
  if (p.api_mode) bits.push(`api_mode: ${p.api_mode}`);
  if (p.default_base_url) bits.push(p.default_base_url);
  if (p.supports_reasoning !== undefined) bits.push(`reasoning: ${p.supports_reasoning}`);
  return bits.join(" · ") || "provider definition";
}

function renderModelConfigInline(mc: Record<string, ModelConfig> | undefined): string {
  if (!mc || Object.keys(mc).length === 0) return "";
  const lines = Object.entries(mc)
    .map(([model, cfg]) => {
      const parts: string[] = [];
      if (cfg.api_mode) parts.push(`api_mode: ${cfg.api_mode}`);
      if (cfg.supports_reasoning !== undefined) parts.push(`supports_reasoning: ${cfg.supports_reasoning}`);
      if (cfg.token_budget_soft !== undefined) parts.push(`soft: ${cfg.token_budget_soft}`);
      if (cfg.token_budget_hard !== undefined) parts.push(`hard: ${cfg.token_budget_hard}`);
      if (cfg.max_tokens !== undefined) parts.push(`max_tokens: ${cfg.max_tokens}`);
      if (cfg.max_tokens_on_truncation !== undefined)
        parts.push(`max_tok_trunc: ${cfg.max_tokens_on_truncation}`);
      const detail = parts.length ? parts.join(", ") : "(no overrides)";
      return `<div style="padding-left:1rem;"><code style="background:rgba(255,255,255,0.05);padding:0.0625rem 0.25rem;border-radius:2px;font-size:0.75rem;">${escapeHtml(model)}</code>: <span style="color:var(--text-muted);font-size:0.78rem;">${escapeHtml(detail)}</span></div>`;
    })
    .join("");
  return `<div style="margin-top:0.25rem;"><span style="color:var(--text-muted);">model_config:</span>${lines}</div>`;
}

function renderProviders(file: ModelsFile): string {
  const names = Object.keys(file.providers).sort();
  if (names.length === 0) {
    return `<div class="empty-state" style="padding:3rem;text-align:center;color:var(--text-muted);">
      No provider overrides in models.yml yet.
      <div style="margin-top:0.75rem;font-size:0.85rem;">Use <b>+ Add Provider</b> to define one, or <b>Import</b> a models.yml-like file.</div>
    </div>`;
  }
  return names
    .map((name) => {
      const p = file.providers[name];
      if (editName === name) return renderEditor(name, p);
      const models = (p.models || []).join(", ");
      return `
        <div class="channel-card" data-provider-card="${escapeHtml(name)}" style="border:1px solid var(--glass-border,rgba(255,255,255,0.1));border-radius:10px;padding:1rem;margin-bottom:0.75rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:1rem;">${escapeHtml(name)}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);word-break:break-all;">${escapeHtml(providerSubtitle(p))}</div>
            </div>
            <button class="btn btn-sm channel-refresh-btn" data-provider="${escapeHtml(name)}" title="Refresh models (writes models.yml)" style="border-radius:4px;padding:0.2rem 0.5rem;font-size:0.75rem;line-height:1.4;background:rgba(6,182,212,0.15);border:1px solid rgba(6,182,212,0.3);color:#22d3ee;cursor:pointer;">⟳ Refresh</button>
            <button class="btn btn-sm" data-edit-provider="${escapeHtml(name)}" title="Edit" style="border-radius:4px;padding:0.2rem 0.5rem;font-size:0.75rem;line-height:1.4;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);cursor:pointer;">✎ Edit</button>
            <button class="btn btn-sm" data-delete-provider="${escapeHtml(name)}" title="Delete provider" style="border-radius:4px;padding:0.2rem 0.5rem;font-size:0.75rem;line-height:1.4;background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);color:#fb7185;cursor:pointer;">🗑 Delete</button>
          </div>
          <div style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
            ${models ? `<div><span style="color:var(--text-muted);">models:</span> ${escapeHtml(models)}</div>` : ""}
            ${renderModelConfigInline(p.model_config)}
          </div>
        </div>`;
    })
    .join("");
}

// ── Inline editor ──

function fieldRow(key: string, label: string, value: string, placeholder: string, extra = ""): string {
  return `
    <div class="channel-field-group" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
      <label style="width:11rem;flex-shrink:0;font-size:0.8rem;color:var(--text-secondary);">${label}</label>
      <input type="text" id="m-${key}" class="filter-input channel-edit-input" value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}" style="flex:1;min-width:0;" />
      ${extra}
    </div>`;
}

function selectRow(
  key: string,
  label: string,
  options: string[],
  value: string | undefined,
  placeholder: string,
): string {
  const opts = options
    .map((o) => `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`)
    .join("");
  return `
    <div class="channel-field-group" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
      <label style="width:11rem;flex-shrink:0;font-size:0.8rem;color:var(--text-secondary);">${label}</label>
      <select id="m-${key}" class="filter-select" style="flex:1;min-width:0;">
        <option value="">${escapeHtml(placeholder)}</option>
        ${opts}
      </select>
    </div>`;
}

function renderModelConfigEditor(_provider: string, mc: Record<string, ModelConfig> | undefined): string {
  const entries = Object.entries(mc || {});
  const rows = entries
    .map(([model, cfg]) => {
      const input = (k: string, v: string | undefined, ph: string) =>
        `<input type="text" data-mcmodel="${escapeHtml(model)}" data-mcfield="${k}" class="filter-input" value="${escapeHtml(
          v ?? "",
        )}" placeholder="${escapeHtml(ph)}" style="width:7.5rem;" />`;
      return `
        <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.35rem;">
          <span style="font-weight:600;font-size:0.78rem;width:10rem;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(model)}</span>
          ${input("api_mode", cfg.api_mode, "api_mode")}
          ${input("supports_reasoning", cfg.supports_reasoning === undefined ? "" : String(cfg.supports_reasoning), "reasoning")}
          ${input("token_budget_soft", cfg.token_budget_soft === undefined ? "" : String(cfg.token_budget_soft), "soft")}
          ${input("token_budget_hard", cfg.token_budget_hard === undefined ? "" : String(cfg.token_budget_hard), "hard")}
          ${input("max_tokens", cfg.max_tokens === undefined ? "" : String(cfg.max_tokens), "max_tokens")}
          ${input("max_tokens_on_truncation", cfg.max_tokens_on_truncation === undefined ? "" : String(cfg.max_tokens_on_truncation), "max_tok_trunc")}
          <button type="button" data-mc-remove="${escapeHtml(model)}" title="Remove model config" style="background:none;border:none;color:#fb7185;cursor:pointer;">✕</button>
        </div>`;
    })
    .join("");
  return `
    <div style="margin-top:0.5rem;">
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.35rem;">model_config (per-model overrides; highest precedence)</div>
      ${rows || '<div style="font-size:0.78rem;color:var(--text-muted);">No per-model config yet.</div>'}
      <div style="display:flex;gap:0.4rem;align-items:center;margin-top:0.4rem;">
        <input type="text" id="m-new-mc-model" class="filter-input" placeholder="model name" style="width:10rem;" />
        <button type="button" id="m-add-mc" style="background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.25);color:#a78bfa;border-radius:6px;padding:0.25rem 0.6rem;cursor:pointer;font-size:0.78rem;">+ model config</button>
      </div>
    </div>`;
}

function renderEditor(name: string, p: ProviderOverride): string {
  const pluginVal =
    typeof p.plugin === "boolean"
      ? p.plugin
        ? "true"
        : "false"
      : typeof p.plugin === "string"
        ? p.plugin
        : "true";
  const boolRow = (key: string, label: string, value: boolean | undefined) =>
    selectRow(key, label, ["true", "false"], value === undefined ? undefined : String(value), "(unset)");
  return `
    <div class="channel-card" data-provider-card="${escapeHtml(name)}" style="border:1px solid rgba(139,92,246,0.4);border-radius:10px;padding:1rem;margin-bottom:0.75rem;">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
        <div style="flex:1;">
          <div style="font-weight:600;">Editing provider: ${escapeHtml(name)}</div>
        </div>
        <button class="btn btn-primary" id="m-save" data-provider="${escapeHtml(name)}">✓ Save</button>
        <button class="btn btn-secondary" id="m-cancel">✕ Cancel</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;">
        ${fieldRow("plugin", "plugin", pluginVal, "true | false | plugin name")}
        ${fieldRow("models", "models", (p.models || []).join(", "), "comma-separated model ids")}
        ${selectRow("api_mode", "api_mode", API_MODES, p.api_mode, "(inherit)")}
        ${boolRow("supports_reasoning", "supports_reasoning", p.supports_reasoning)}
        ${fieldRow("default_base_url", "default_base_url", p.default_base_url || "", "https://.../v1")}
        ${fieldRow("refresh_url", "refresh_url", p.refresh_url || "", "https://.../v1/models")}
        ${fieldRow("default_model", "default_model", p.default_model || "", "model id")}
        ${fieldRow("api_key", "api_key", p.api_key || "", "$env:X or $secret:Y")}
        ${fieldRow("token_budget_soft", "token_budget_soft", p.token_budget_soft === undefined ? "" : String(p.token_budget_soft), "e.g. 100000")}
        ${fieldRow("token_budget_hard", "token_budget_hard", p.token_budget_hard === undefined ? "" : String(p.token_budget_hard), "e.g. 500000")}
        ${fieldRow("max_tokens", "max_tokens", p.max_tokens === undefined ? "" : String(p.max_tokens), "e.g. 8192")}
        ${fieldRow("max_tokens_on_truncation", "max_tokens_on_truncation", p.max_tokens_on_truncation === undefined ? "" : String(p.max_tokens_on_truncation), "e.g. 16384")}
      </div>
      ${renderModelConfigEditor(name, p.model_config)}
    </div>`;
}

// ── Wire interactions ──

function wireModelsPage(): void {
  document.getElementById("refresh-models-btn")?.addEventListener("click", () => void loadModels());
  document.getElementById("models-import-btn")?.addEventListener("click", () => {
    showModelsImportModal(() => void loadModels());
  });
  document.getElementById("add-provider-btn")?.addEventListener("click", () => {
    const name = window.prompt("New provider name:");
    if (!name || !name.trim()) return;
    const n = name.trim();
    if (currentFile.providers[n]) {
      showToast(`Provider "${n}" already exists. Edit it instead`, "error");
      return;
    }
    currentFile.providers[n] = { plugin: true };
    editName = n;
    const content = document.getElementById("models-content")!;
    content.innerHTML = renderProviders(currentFile);
    wireRows();
    wireEditor(n);
  });
  const filterInput = document.getElementById("filter-provider") as HTMLInputElement | null;
  if (filterInput) {
    filterInput.addEventListener("input", () => {
      const q = filterInput.value.trim().toLowerCase();
      document.querySelectorAll<HTMLElement>("[data-provider-card]").forEach((card) => {
        const name = card.getAttribute("data-provider-card") || "";
        card.style.display = !q || name.toLowerCase().includes(q) ? "" : "none";
      });
    });
  }
}

function wireRows(): void {
  document.querySelectorAll<HTMLElement>("[data-edit-provider]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editName = btn.getAttribute("data-edit-provider");
      const content = document.getElementById("models-content")!;
      content.innerHTML = renderProviders(currentFile);
      wireRows();
      wireEditor(editName!);
    });
  });
  document.querySelectorAll<HTMLElement>("[data-delete-provider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-delete-provider")!;
      if (!window.confirm(`Delete provider "${name}" from models.yml?`)) return;
      try {
        delete currentFile.providers[name];
        await apiPut("/models", currentFile);
        showToast(`Deleted provider "${name}"`, "success");
        void loadModels();
      } catch (e) {
        showToast(`Delete failed: ${formatApiError(e)}`, "error");
      }
    });
  });
  document.querySelectorAll<HTMLElement>(".channel-refresh-btn[data-provider]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.getAttribute("data-provider")!;
      const prov = currentFile.providers[provider];
      if (!prov?.refresh_url) {
        showToast(
          `No refresh_url configured for "${provider}". Add one in Edit to enable model refresh`,
          "error",
        );
        return;
      }
      btn.textContent = "⟳";
      btn.style.opacity = "0.5";
      try {
        await apiPost(`/plugins/providers/bundled/${encodeURIComponent(provider)}/refresh-models`, {});
        showToast(`Refreshed models for "${provider}" (models.yml updated)`, "success");
        void loadModels();
      } catch (e) {
        showToast(`Refresh failed: ${formatApiError(e)}`, "error");
        btn.textContent = "⟳ Refresh";
        btn.style.opacity = "1";
      }
    });
  });
}

function parseNum(v: string): number | undefined {
  const t = v.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseBool(v: string): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function collectEditor(name: string): ProviderOverride | null {
  const get = (id: string): HTMLInputElement | HTMLSelectElement | null =>
    document.getElementById(`m-${id}`) as HTMLInputElement | null;
  const pluginRaw = (get("plugin") as HTMLInputElement)?.value.trim();
  let plugin: boolean | string = true;
  if (pluginRaw === "true") plugin = true;
  else if (pluginRaw === "false") plugin = false;
  else if (pluginRaw) plugin = pluginRaw;

  const p: ProviderOverride = { plugin };
  const modelsRaw = (get("models") as HTMLInputElement)?.value || "";
  p.models = modelsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const apiMode = (get("api_mode") as HTMLSelectElement)?.value || undefined;
  if (apiMode) p.api_mode = apiMode;
  const supports = parseBool((get("supports_reasoning") as HTMLSelectElement)?.value || "");
  if (supports !== undefined) p.supports_reasoning = supports;
  const set = (key: keyof ProviderOverride, raw: string | undefined): void => {
    const t = (raw || "").trim();
    if (!t) return;
    (p as Record<string, unknown>)[key] = t;
  };
  set("default_base_url", (get("default_base_url") as HTMLInputElement)?.value);
  set("refresh_url", (get("refresh_url") as HTMLInputElement)?.value);
  set("default_model", (get("default_model") as HTMLInputElement)?.value);
  set("api_key", (get("api_key") as HTMLInputElement)?.value);
  const num = (
    key: "token_budget_soft" | "token_budget_hard" | "max_tokens" | "max_tokens_on_truncation",
  ): void => {
    const v = parseNum((get(key) as HTMLInputElement)?.value || "");
    if (v !== undefined) p[key] = v;
  };
  num("token_budget_soft");
  num("token_budget_hard");
  num("max_tokens");
  num("max_tokens_on_truncation");

  // model_config entries from the editor inputs
  const mcEntries = document.querySelectorAll<HTMLInputElement>("[data-mcmodel]");
  const mcMap: Record<string, ModelConfig> = {};
  mcEntries.forEach((input) => {
    const model = input.getAttribute("data-mcmodel")!;
    const field = input.getAttribute("data-mcfield")!;
    if (!mcMap[model]) mcMap[model] = {};
    const t = input.value.trim();
    if (!t) return;
    if (field === "supports_reasoning") {
      const b = parseBool(t);
      if (b !== undefined) mcMap[model].supports_reasoning = b;
    } else if (field === "api_mode") {
      mcMap[model].api_mode = t;
    } else {
      const n = parseNum(t);
      if (n !== undefined) (mcMap[model] as Record<string, unknown>)[field] = n;
    }
  });
  if (Object.keys(mcMap).length > 0) p.model_config = mcMap;

  // Validate budget > 0
  for (const [k, v] of Object.entries(p)) {
    if ((k === "token_budget_soft" || k === "token_budget_hard") && v === 0) {
      showToast(`${name}: ${k} must be > 0`, "error");
      return null;
    }
  }
  return p;
}

function wireEditor(name: string): void {
  // Editor selects use the app's custom styled dropdown component
  document.querySelectorAll<HTMLSelectElement>("#m-api_mode, #m-supports_reasoning").forEach((el) => {
    enhanceSelectElement(el);
  });
  document.getElementById("m-cancel")?.addEventListener("click", () => {
    editName = null;
    const content = document.getElementById("models-content")!;
    content.innerHTML = renderProviders(currentFile);
    wireRows();
  });
  document.getElementById("m-save")?.addEventListener("click", async () => {
    const p = collectEditor(name);
    if (!p) return;
    try {
      currentFile.providers[name] = p;
      await apiPut("/models", currentFile);
      editName = null;
      showToast(`Saved provider "${name}"`, "success");
      void loadModels();
    } catch (e) {
      showToast(`Save failed: ${formatApiError(e)}`, "error");
    }
  });
  document.getElementById("m-add-mc")?.addEventListener("click", () => {
    const modelInput = document.getElementById("m-new-mc-model") as HTMLInputElement | null;
    const model = (modelInput?.value || "").trim();
    if (!model) return;
    const current = currentFile.providers[name];
    current.model_config = current.model_config || {};
    if (current.model_config[model]) {
      showToast(`Model "${model}" already has a config`, "error");
      return;
    }
    current.model_config[model] = {};
    const content = document.getElementById("models-content")!;
    content.innerHTML = renderProviders(currentFile);
    wireRows();
    wireEditor(name);
  });
  document.querySelectorAll<HTMLElement>("[data-mc-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const model = btn.getAttribute("data-mc-remove")!;
      const current = currentFile.providers[name];
      if (current.model_config) delete current.model_config[model];
      const content = document.getElementById("models-content")!;
      content.innerHTML = renderProviders(currentFile);
      wireRows();
      wireEditor(name);
    });
  });
}
