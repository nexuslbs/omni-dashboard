/**
 * Shared SVG icons and wiring for secret fields (copy button, eye toggle).
 * Used by plugin-config.ts (plugin config fields) and plugin-list.ts (page-level wiring).
 */

/** Clipboard/copy SVG icon */
export const COPY_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

/** Visible eye SVG (password shown as text) */
export const EYE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

/** Eye-off SVG (password hidden) */
export const EYE_OFF_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

/** Checkmark SVG (brief success indicator after copy) */
export const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

/**
 * Return HTML for a copy-to-clipboard button targeting an input by ID.
 */
export function copyButtonHTML(targetId: string): string {
  return `<button type="button" class="setting-secret-copy" title="Copy to clipboard" data-target="${targetId}">${COPY_SVG}</button>`;
}

/**
 * Return HTML for a password visibility toggle button targeting an input by ID.
 */
export function toggleButtonHTML(targetId: string): string {
  return `<button type="button" class="setting-secret-toggle" title="Toggle visibility" data-target="${targetId}">${EYE_SVG}</button>`;
}

/**
 * Wire all .setting-secret-copy buttons to copy their target input's value.
 * Shows a brief checkmark on success.
 */
export function wireCopyButtons(): void {
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
          btn.innerHTML = CHECK_SVG;
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
}

/**
 * Wire all .setting-secret-toggle buttons to toggle password/visibility.
 * Swaps between EYE_SVG (visible) and EYE_OFF_SVG (hidden).
 */
export function wireToggleButtons(): void {
  document.querySelectorAll(".setting-secret-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.setAttribute("title", isPassword ? "Hide" : "Toggle visibility");
      btn.innerHTML = isPassword ? EYE_OFF_SVG : EYE_SVG;
    });
  });
}
