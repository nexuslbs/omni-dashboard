import { apiGet, toCamelCase, type PluginData } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";
import { formatApiError } from "../lib/helpers";
import { getCurrentConfig, dirtyCheckSaveButton, wireRefToggles } from "../lib/plugin-config";
import { renderPluginCard, wirePluginButtons, showInstallModal } from "../lib/plugin-ui";

export function renderPlatforms(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Platforms</h1>
        <p class="page-subtitle">Communication platforms — built-in and plugin-based</p>
      </div>
      <button id="add-platform-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Add</button>
    </div>
    <div id="platforms-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading platforms...</div>
    </div>
  `;

  document.getElementById("add-platform-btn")?.addEventListener("click", () => showInstallModal("platform"));

  void loadPlatforms();
}

// ── State ──

// savedConfigs and pending changes map
const savedConfigs: Map<string, Record<string, any>> = new Map();

async function loadPlatforms(): Promise<void> {
  const content = document.getElementById("platforms-content")!;
  try {
    const response = await apiGet<any>("/plugins");
    // Backend wraps in { success, data } — extract data array
    const allPlugins: PluginData[] = (response.data || response).map((p: Record<string, any>) =>
      toCamelCase<PluginData>(p),
    );
    // Filter to platforms only, plus always include cli as built-in
    const platforms = allPlugins.filter((p: PluginData) => p.pluginType === "platform");
    // Ensure cli is always shown even if not returned by API
    if (!platforms.find((p) => p.name === "cli")) {
      platforms.unshift({
        name: "cli",
        pluginType: "platform",
        source: "built-in",
        status: "enabled",
        manifest: {
          name: "cli",
          type: "platform",
          description: "Command-line interface platform",
        },
        config: {},
      });
    }
    content.innerHTML = renderPlatformsPage(platforms);
    wirePlatforms();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load platforms: ${formatApiError(e)}</div>`;
  }
}

function renderPlatformsPage(platforms: PluginData[]): string {
  if (!platforms || platforms.length === 0) {
    return '<div class="empty-state">No platforms found</div>';
  }

  // Sort: same-name plugins ordered built-in → bundled → remote
  const sourcePriority: Record<string, number> = {
    "built-in": 0,
    bundled: 1,
    remote: 2,
  };
  const sorted = [...platforms].sort((a, b) => {
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

function wirePlatforms(): void {
  // ── Ref toggles for $secret:/$env: references ──
  wireRefToggles();

  // Wire all plugin action buttons via shared handler
  wirePluginButtons("platform", () => void loadPlatforms());

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
    // Store the currently-rendered values as the saved baseline
    savedConfigs.set(pluginName, getCurrentConfig(formEl as HTMLElement));
    // Re-check dirty state on every input change
    formEl.querySelectorAll(".plugin-config-input").forEach((input) => {
      input.addEventListener("input", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
      input.addEventListener("change", () =>
        dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs),
      );
    });
    // Initial dirty check (should be grayed out)
    dirtyCheckSaveButton(formEl as HTMLElement, pluginName, savedConfigs);
  });

  // Enhance native select elements to styled custom dropdowns
  document.querySelectorAll(".plugin-config-form select.plugin-config-input[data-key]").forEach((el) => {
    enhanceSelectElement(el as HTMLSelectElement);
  });
}
