// ── Shared UI helpers ──

/**
 * Escape HTML special characters in a string.
 */
export function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Convert a date string to a human-friendly format.
 */
export function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

/**
 * Format a number compactly (e.g. 1500 -> "1.5k").
 */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toString();
}

/**
 * Format a token count (same as formatCompact but more descriptive).
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toString();
}

/**
 * Scan all select elements on the page and fix any that have a value
 * not present in their options. If a display-name mapping exists for the
 * value, it's added as an option. Otherwise a red warning is shown below
 * the select.
 *
 * @param container - Optional container to scope the scan (e.g. a modal element)
 */
export function fixMissingSelectOptions(container?: HTMLElement): void {
  const root = container || document;
  const selects = root.querySelectorAll<HTMLSelectElement>("select");
  selects.forEach((sel) => {
    // Skip selects that have already been fixed
    if (sel.dataset._selectFixed) return;

    const currentVal = sel.value;
    if (!currentVal) return; // empty value is fine

    const options = Array.from(sel.options);
    const hasMatch = options.some((o) => o.value === currentVal);

    if (!hasMatch) {
      // Check if this looks like a known value from the options' patterns
      // The value might be a profile name, provider name, model name, channel id, etc.
      // Try to infer a display label from the existing options' patterns
      let displayLabel = currentVal;
      const existingLabels = options.map((o) => o.label).filter(Boolean);
      // If the current value looks like it should be an option label (not a code value),
      // just add it directly
      if (!existingLabels.includes(currentVal)) {
        // Check if options have label patterns like "name (platform)" or "label (profile)"
        // If so, we can't easily construct one, so just use the raw value
        displayLabel = currentVal;
      }

      // Add the missing value as an option
      const opt = document.createElement("option");
      opt.value = currentVal;
      opt.textContent = displayLabel;
      opt.selected = true;
      opt.style.fontWeight = "bold";
      sel.appendChild(opt);

      // Show a subtle warning indicator
      const warning = document.createElement("div");
      warning.style.cssText =
        "font-size:0.7rem;color:#ef4444;margin-top:0.2rem;display:flex;align-items:center;gap:0.25rem;";
      warning.innerHTML = `⚠ Current value "<strong>${escapeHtml(currentVal)}</strong>" not in options — auto-added`;
      sel.parentNode?.insertBefore(warning, sel.nextSibling);
    }

    sel.dataset._selectFixed = "1";
  });
}
