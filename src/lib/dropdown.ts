/**
 * Custom floating dropdown — replaces native <select> with a dark-themed dropdown
 * appended to document.body to escape backdrop-filter stacking contexts.
 *
 * Usage:
 *   enhanceSelectElement(document.getElementById("my-select") as HTMLSelectElement);
 *   // or
 *   enhanceSelect("my-select-id");
 */

let _openFloatingDropdown: HTMLElement | null = null;

function closeFloatingDropdown(): void {
  if (_openFloatingDropdown) {
    _openFloatingDropdown.remove();
    _openFloatingDropdown = null;
  }
}

export function enhanceSelect(selectId: string): void {
  const el = document.getElementById(selectId) as HTMLSelectElement | null;
  if (el) enhanceSelectElement(el);
}

/**
 * Sync the custom dropdown display for a select element after programmatically
 * changing its value. Ensures the visible trigger text matches the new value.
 */
export function syncSelectDisplay(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  const wrapper = select.nextElementSibling as HTMLElement | null;
  if (!wrapper || !wrapper.classList.contains("custom-select")) return;
  const selected = Array.from(select.options).find((o) => o.selected) || select.options[0];
  const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement | null;
  if (textEl) textEl.textContent = selected ? selected.label : "";
  wrapper.querySelectorAll(".select-option").forEach((o) => {
    o.classList.toggle("selected", o.getAttribute("data-value") === select.value);
  });
}

/**
 * Remove an existing enhanced dropdown wrapper for a select, so it can be re-enhanced
 * after its options have changed. Returns the native select element.
 */
export function unenhanceSelect(selectId: string): HTMLSelectElement | null {
  const el = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!el) return null;
  const wrapper = el.nextElementSibling;
  if (wrapper && wrapper.classList.contains("custom-select")) {
    wrapper.remove();
  }
  el.style.display = "";
  delete (el as any).dataset._enhanced;
  return el;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function enhanceSelectElement(select: HTMLSelectElement): void {
  if (!select || (select as any).dataset._enhanced) return;
  (select as any).dataset._enhanced = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  wrapper.style.position = "relative";

  function buildOptions(): void {
    const selected = Array.from(select.options).find((o) => o.selected) || select.options[0];
    wrapper.innerHTML = `
      <div class="select-trigger">
        <span class="select-trigger-text">${selected ? escapeHtml(selected.label) : ""}</span>
        <span class="select-arrow">▾</span>
      </div>
    `;
  }

  buildOptions();

  select.style.display = "none";
  select.parentNode?.insertBefore(wrapper, select.nextSibling);

  const trigger = wrapper.querySelector(".select-trigger") as HTMLElement;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();

    // If this dropdown is already open, just close it
    if (_openFloatingDropdown) {
      closeFloatingDropdown();
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const float = document.createElement("div");
    float.className = "select-options";
    float.style.cssText = `
      position: fixed;
      z-index: 10000;
      left: ${rect.left}px;
      top: ${rect.bottom + 4}px;
      min-width: ${Math.max(rect.width, 200)}px;
      background: var(--bg-secondary, #1a1a2e);
      border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      max-height: 240px;
      overflow-y: auto;
    `;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 240 && spaceAbove > spaceBelow) {
      float.style.top = "auto";
      float.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      float.style.maxHeight = `${Math.min(spaceAbove - 8, 240)}px`;
    } else {
      float.style.maxHeight = `${Math.min(spaceBelow - 8, 240)}px`;
    }

    float.innerHTML = Array.from(select.options)
      .map(
        (o) =>
          `<div class="select-option${o.selected ? " selected" : ""}" data-value="${o.value}">${escapeHtml(o.label)}</div>`,
      )
      .join("");

    float.addEventListener("click", (ev) => {
      const opt = (ev.target as HTMLElement).closest(".select-option") as HTMLElement;
      if (!opt) return;
      const value = opt.getAttribute("data-value");
      if (value !== null) {
        select.value = value;
        const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement;
        if (textEl) textEl.textContent = opt.textContent;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      closeFloatingDropdown();
    });

    document.body.appendChild(float);
    _openFloatingDropdown = float;
  });

  document.addEventListener("click", () => closeFloatingDropdown());
}
