/**
 * Common utility functions for the dashboard.
 */

// ── Toast notification ──

export function showToast(message: string, type: "success" | "error" = "success"): void {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Inner structure: body (text + expand) + close button
  const body = document.createElement("div");
  body.className = "toast-body";

  const textSpan = document.createElement("div");
  textSpan.className = "toast-text";
  textSpan.textContent = message;
  body.appendChild(textSpan);

  // Expand/collapse for long messages
  const needsExpand = message.length > 100 && type === "error";
  if (needsExpand) {
    textSpan.classList.add("clamped");
    void textSpan.offsetHeight;
    if (textSpan.scrollHeight > textSpan.clientHeight) {
      const expandBtn = document.createElement("button");
      expandBtn.className = "toast-expand-btn";
      expandBtn.textContent = "Show more";
      expandBtn.addEventListener("click", () => {
        const expanded = textSpan.classList.toggle("expanded");
        expandBtn.textContent = expanded ? "Show less" : "Show more";
      });
      body.appendChild(expandBtn);
    } else {
      textSpan.classList.remove("clamped");
    }
  }

  toast.appendChild(body);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.addEventListener("click", () => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.2s";
    setTimeout(() => toast.remove(), 200);
  });
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // Auto-dismiss only for success toasts
  if (type === "success") {
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

/**
 * Wrap an async operation with error handling.
 * Shows a toast on failure and returns null.
 */
export async function withErrorHandling<T>(fn: () => Promise<T>, fallbackMsg: string): Promise<T | null> {
  try {
    return await fn();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`${fallbackMsg}: ${msg}`, "error");
    return null;
  }
}

/**
 * Format an API error for display.
 */
export function formatApiError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Parse JSON safely, returning a fallback on failure.
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
