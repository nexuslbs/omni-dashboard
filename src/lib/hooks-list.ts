/**
 * Hooks list rendering.
 * Clone of src/lib/schedule-list.ts backed by the omniagent hooks REST API.
 */
import { escapeHtml, formatApiError } from "./helpers";
import { showToast } from "./utils";
import {
  fetchHook,
  fetchHooks,
  formatHookCounter,
  formatHookDate,
  hookField,
  hookName,
  EVENT_LABELS,
  SCOPE_LABELS,
  MODE_LABELS,
  eventBadgeClass,
  scopeBadgeClass,
  modeBadgeClass,
} from "./hooks";

/**
 * Load and render the hooks table.
 * @param onStateChange called after mutations (kept for parity with schedule-list)
 */
export async function loadHooks(onStateChange?: () => void): Promise<void> {
  const el = document.getElementById("hooks-table");
  const countEl = document.getElementById("hooks-count");
  if (!el) return;
  try {
    const hooks = await fetchHooks();
    if (countEl) countEl.textContent = `${hooks.length} hook${hooks.length !== 1 ? "s" : ""}`;
    if (hooks.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;margin:0 auto 0.75rem;display:block;">
            <path d="M18 6V5a2 2 0 00-2-2H8a2 2 0 00-2 2v1"/><path d="M18 6a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2"/><path d="M9 12h6"/><path d="M9 16h6"/>
          </svg>
          <div>No hooks yet</div>
          <button id="empty-create-hook" style="margin-top:0.75rem;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">+ Create Hook</button>
        </div>`;
      document.getElementById("empty-create-hook")?.addEventListener("click", () => {
        void (async () => {
          const { showHookModal } = await import("./hooks-detail");
          void showHookModal(null, () => loadHooks(onStateChange));
        })();
      });
      return;
    }
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Event</th>
              <th>Scope</th>
              <th>Target</th>
              <th>Mode</th>
              <th>Counter</th>
              <th>Updated</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${hooks
              .map(
                (h: Record<string, any>) => `
              <tr data-hook-id="${escapeHtml(h.id)}">
                <td style="color:var(--text-primary);font-weight:500;">
                  <div>${escapeHtml(hookName(h))}</div>
                  <div style="font-size:0.7rem;color:var(--text-muted);font-weight:400;">${escapeHtml(h.id)}</div>
                </td>
                <td><span class="badge ${eventBadgeClass(String(h.event || ""))}">${escapeHtml(EVENT_LABELS[h.event] || h.event || "-")}</span></td>
                <td><span class="badge ${scopeBadgeClass(String(h.scope || ""))}">${escapeHtml(SCOPE_LABELS[h.scope] || h.scope || "-")}</span></td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(h.target || "-")}</td>
                <td><span class="badge ${modeBadgeClass(String(h.mode || ""))}">${escapeHtml(MODE_LABELS[h.mode] || h.mode || "-")}</span></td>
                <td style="font-size:0.8rem;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(formatHookCounter(h.counter, String(h.scope || "global")))}">
                  <span style="color:var(--accent-cyan);font-weight:500;">${escapeHtml(formatHookCounter(h.counter, String(h.scope || "global")))}</span>
                  <span style="color:var(--text-muted);"> / ${escapeHtml(String(h.count ?? 1))}</span>
                </td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${formatHookDate(h.updated_at || h.created_at || null)}</td>
                <td>
                  <span class="badge ${h.enabled ? "badge-success" : "badge-neutral"}" style="cursor:pointer;" title="Click to toggle">
                    ${h.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <button class="hook-fire-btn" title="Manually trigger this hook" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:var(--accent-green,#10b981);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;">▶ Fire</button>
                  <button class="hook-toggle-btn" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;color:var(--text-secondary);">${h.enabled ? "Disable" : "Enable"}</button>
                  <button class="hook-edit-btn" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:var(--accent-purple);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;">Edit</button>
                  <button class="hook-delete-btn" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);color:var(--accent-rose,#fb7185);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;">Delete</button>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    wireHookButtons(onStateChange);
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load hooks: ${formatApiError(e)}</div>`;
  }
}

function wireHookButtons(onStateChange?: () => void): void {
  const reload = () => loadHooks(onStateChange);

  // Edit buttons
  document.querySelectorAll(".hook-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const hookId = row?.getAttribute("data-hook-id");
      if (!hookId) return;
      const { showHookModal } = await import("./hooks-detail");
      const hook = await fetchHook(hookId);
      void showHookModal(hook as Record<string, unknown>, reload);
    });
  });

  // Fire buttons: POST /hooks/{id}/fire
  document.querySelectorAll(".hook-fire-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const hookId = row?.getAttribute("data-hook-id");
      if (!hookId) return;
      const fireBtn = btn as HTMLButtonElement;
      const originalText = fireBtn.textContent;
      fireBtn.disabled = true;
      fireBtn.textContent = "Firing...";
      try {
        const res = await fetch(`/api/hooks/${encodeURIComponent(hookId)}/fire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const payload = data && typeof data === "object" && "data" in data ? data.data : data;
        showToast(
          payload?.thread_id != null
            ? `Hook fired: thread #${payload.thread_id}`
            : "Hook fired (no thread created)",
          "success",
        );
      } catch (err) {
        showToast("Failed: " + formatApiError(err), "error");
      } finally {
        fireBtn.disabled = false;
        fireBtn.textContent = originalText;
      }
    });
  });

  // Toggle enabled buttons
  document.querySelectorAll(".hook-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const hookId = row?.getAttribute("data-hook-id");
      if (!hookId) return;
      const enabling = btn.textContent === "Enable";
      try {
        const res = await fetch(`/api/hooks/${encodeURIComponent(hookId)}/toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(await res.text());
        showToast(enabling ? "Hook enabled" : "Hook disabled", "success");
        void reload();
      } catch (err) {
        showToast("Failed: " + formatApiError(err), "error");
      }
    });
  });

  // Status badge toggle (click the badge to toggle, like schedule)
  document.querySelectorAll(".badge[title='Click to toggle']").forEach((badge) => {
    badge.addEventListener("click", async () => {
      const row = (badge as HTMLElement).closest("tr") as HTMLElement;
      const hookId = row?.getAttribute("data-hook-id");
      if (!hookId) return;
      try {
        const res = await fetch(`/api/hooks/${encodeURIComponent(hookId)}/toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(await res.text());
        void reload();
      } catch (err) {
        showToast("Failed: " + formatApiError(err), "error");
      }
    });
  });

  // Delete buttons (with confirm)
  document.querySelectorAll(".hook-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const hookId = row?.getAttribute("data-hook-id");
      if (!hookId) return;
      const name =
        hookField<string>(
          { display_name: row.querySelector("td")?.textContent?.trim() || "" },
          "display_name",
          "displayName",
        ) || hookId;
      if (!confirm(`Delete hook "${name}"? This cannot be undone.`)) return;
      try {
        const res = await fetch(`/api/hooks/${encodeURIComponent(hookId)}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        showToast("Hook deleted", "success");
        void reload();
      } catch (err) {
        showToast("Failed: " + formatApiError(err), "error");
      }
    });
  });
}
