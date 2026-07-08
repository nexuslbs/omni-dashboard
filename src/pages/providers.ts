import { apiGet, toCamelCase, type PluginData } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";
import { formatApiError } from "../lib/helpers";
import { getCurrentConfig, dirtyCheckSaveButton, wireRefToggles } from "../lib/plugin-config";
import { renderPluginCard, wirePluginButtons, showInstallModal } from "../lib/plugin-ui";

export function renderProviders(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Providers</h1>
        <p class="page-subtitle">AI model providers — built-in and plugin-based</p>
      </div>
      <button id="add-provider-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Add</button>
    </div>
    <div id="providers-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading providers...</div>
    </div>
  `;

  document.getElementById("add-provider-btn")?.addEventListener("click", () => showInstallModal("provider"));

  void loadProviders();
}

// ── State ──

const savedConfigs: Map<string, Record<string, any>> = new Map();

async function loadProviders(): Promise<void> {
  const content = document.getElementById("providers-content")!;
  try {
    const response = await apiGet<any>("/plugins");
    const allPlugins: PluginData[] = (response.data || response).map((p: Record<string, any>) =>
      toCamelCase<PluginData>(p),
    );
    const providers = allPlugins.filter((p: PluginData) => p.pluginType === "provider");
    content.innerHTML = renderProvidersPage(providers);
    wireProviders();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load providers: ${formatApiError(e)}</div>`;
  }
}

function renderProvidersPage(providers: PluginData[]): string {
  if (!providers || providers.length === 0) {
    return '<div class="empty-state">No providers found</div>';
  }

  const sourcePriority: Record<string, number> = {
    "built-in": 0,
    bundled: 1,
    remote: 2,
  };
  const sorted = [...providers].sort((a, b) => {
    if (a.name === b.name) {
      return (sourcePriority[a.source] ?? 99) - (sourcePriority[b.source] ?? 99);
    }
    return a.name.localeCompare(b.name);
  });

  return sorted
    .map((p) => {
      const isDuplicated = p.isDuplicated === true;
      const hasRemote: boolean = p.remote !== undefined;
      const hasCompilableSource: boolean = !p.isScript && !!p.hasSourceCode;

      return renderPluginCard(p, { hasRemote, hasCompilableSource, isDuplicated });
    })
    .join("");
}

function wireProviders(): void {
  wireRefToggles();

  // Wire all plugin action buttons via shared handler
  wirePluginButtons("provider", () => void loadProviders());

  // Card header click also toggles
  document.querySelectorAll(".card-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const btn = header.querySelector(".plugin-expand-btn") as HTMLElement;
      if (btn) btn.click();
    });
  });

  // Secret copy button
  document.querySelectorAll(".setting-secret-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;
      navigator.clipboard
        .writeText(input.value)
        .then(() => {
          const original = btn.innerHTML;
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
          setTimeout(() => {
            btn.innerHTML = original;
          }, 1500);
        })
        .catch(() => {
          input.select();
          document.execCommand("copy");
        });
    });
  });

  // Secret toggle (eye icon)
  document.querySelectorAll(".setting-secret-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.setAttribute("title", isPassword ? "Hide" : "Toggle visibility");
      btn.innerHTML = isPassword
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>`;
    });
  });

  // ── Config dirty-state tracking ──
  document.querySelectorAll(".plugin-config-form").forEach((formEl) => {
    const card = formEl.closest(".card") as HTMLElement;
    const pluginName = card?.getAttribute("data-plugin-name");
    if (!pluginName) return;
    savedConfigs.set(pluginName, getCurrentConfig(formEl as HTMLElement));
    formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
      input.addEventListener("input", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
      input.addEventListener("change", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
    });
    dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs);
  });

  // Enhance native select elements to styled custom dropdowns
  document.querySelectorAll(".plugin-config-form select.plugin-config-input[data-key]").forEach((el) => {
    enhanceSelectElement(el as HTMLSelectElement);
  });
}
