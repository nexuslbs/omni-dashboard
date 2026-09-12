/**
 * Hook details page (mirror of the schedule details page).
 *
 * Route: /hooks/:id (param route "hooks/" in src/lib/router.ts). Shows the
 * hook's configuration, its counters (live counter + trigger count) and the
 * threads the hook spawned (GET /hooks/{id}/threads, parity with
 * GET /schedule/{id}/threads). Top action buttons mirror the schedule details
 * page: Fire, Activate/Deactivate, Delete (red hue), Edit, Back.
 */
import { escapeHtml, formatApiError } from "./helpers";
import { router } from "./router";
import { showToast } from "./utils";
import {
  fetchHook,
  formatHookCounter,
  formatHookCounterJson,
  formatHookDate,
  hookName,
  EVENT_LABELS,
  SCOPE_LABELS,
  MODE_LABELS,
  eventBadgeClass,
  scopeBadgeClass,
  modeBadgeClass,
} from "./hooks";
import { renderMessageCard, wireMessageCardToggles } from "./message-card";

// ── Pagination state (one details page at a time) ──
let threadsOffset = 0;
const threadsLimit = 10;
let threadsOrder: "desc" | "asc" = "desc";

/** Shared red/hue danger button style (same look as the hooks list Delete). */
const DANGER_STYLE =
  "background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);color:var(--accent-rose,#fb7185);border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.78rem;line-height:1.4;font-weight:500;";
const TOP_BTN_STYLE =
  "border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.78rem;line-height:1.4;font-weight:500;";

// ── Hook info card ──
async function loadHookInfo(hookId: string): Promise<Record<string, any> | null> {
  const el = document.getElementById("hook-detail");
  if (!el) return null;
  try {
    const hook = (await fetchHook(hookId)) as unknown as Record<string, any>;
    const scope = String(hook.scope || "global");
    const infoRow = (label: string, value: string) => `
      <div style="padding:0.5rem 0;border-bottom:1px solid var(--border-primary);">
        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">${label}</div>
        <div style="font-size:0.85rem;color:var(--text-primary);word-break:break-word;">${value}</div>
      </div>`;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 1.5rem;">
        <div>
          ${infoRow("Name", escapeHtml(hookName(hook)))}
          ${infoRow(
            "Event",
            `<span class="badge ${eventBadgeClass(String(hook.event || ""))}">${escapeHtml(EVENT_LABELS[hook.event] || hook.event || "-")}</span>`,
          )}
          ${infoRow(
            "Scope",
            `<span class="badge ${scopeBadgeClass(scope)}">${escapeHtml(SCOPE_LABELS[hook.scope] || hook.scope || "-")}</span>`,
          )}
          ${infoRow("Target", escapeHtml(hook.target || "-"))}
          ${infoRow(
            "Mode",
            `<span class="badge ${modeBadgeClass(String(hook.mode || ""))}">${escapeHtml(MODE_LABELS[hook.mode] || hook.mode || "-")}</span>`,
          )}
          ${infoRow("Status", hook.enabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge badge-neutral">Disabled</span>')}
        </div>
        <div>
          ${infoRow("Profile", escapeHtml(hook.profile || "- (Default)"))}
          ${infoRow("Channel", escapeHtml(hook.channel || "- (Inherit from event)"))}
          ${infoRow("Template", escapeHtml(hook.template || "- (None)"))}
          ${infoRow("Toolset", escapeHtml(hook.toolset || "- (Default)"))}
          ${infoRow("Action ID", escapeHtml(hook.action_id || "-"))}
          ${infoRow("Updated", escapeHtml(formatHookDate(hook.updated_at || hook.created_at || null)))}
        </div>
      </div>
      ${
        hook.prompt
          ? `<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
              <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.375rem;">Prompt</div>
              <pre style="background:var(--bg-card);border:1px solid var(--border-primary);border-radius:6px;padding:0.625rem;font-size:0.78rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;margin:0;">${escapeHtml(String(hook.prompt))}</pre>
            </div>`
          : ""
      }
      <div id="hook-counters" style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.375rem;">Counters</div>
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.5rem;">
          <div style="font-size:1.35rem;font-weight:600;color:var(--accent-cyan,#22d3ee);">${escapeHtml(formatHookCounter(hook.counter, scope))}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">trigger count: ${escapeHtml(String(hook.count ?? 1))}</div>
        </div>
        <pre style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:6px;padding:0.625rem;font-size:0.75rem;color:var(--accent-cyan,#22d3ee);white-space:pre-wrap;word-break:break-word;margin:0;">${escapeHtml(formatHookCounterJson(hook.counter))}</pre>
      </div>
    `;
    return hook;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load hook details: ${formatApiError(e)}</div>`;
    return null;
  }
}

// ── Threads spawned by the hook ──
async function loadHookThreads(hookId: string): Promise<void> {
  const el = document.getElementById("hook-threads");
  if (!el) return;
  try {
    const res = await fetch(
      `/api/hooks/${encodeURIComponent(hookId)}/threads?offset=${threadsOffset}&limit=${threadsLimit}&order=${threadsOrder}`,
    );
    if (!res.ok) throw new Error("Failed to load thread activity");
    const data = await res.json();
    const total = parseInt(data.total) || 0;
    const rows = data.rows || [];

    if (rows.length === 0) {
      el.innerHTML =
        '<div style="color:var(--text-muted);font-size:0.8rem;padding:1rem 0;">No threads from this hook yet.</div>';
    } else {
      el.innerHTML =
        '<div class="events-scroll">' + rows.map((row: any) => renderMessageCard(row)).join("") + "</div>";
      wireMessageCardToggles(el);
    }

    const currentPage = Math.floor(threadsOffset / threadsLimit) + 1;
    const pageInfo = document.getElementById("hook-threads-page-info");
    const prevBtn = document.getElementById("hook-threads-prev-page") as HTMLButtonElement | null;
    const nextBtn = document.getElementById("hook-threads-next-page") as HTMLButtonElement | null;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} (${total} total)`;
    if (prevBtn) prevBtn.disabled = threadsOffset <= 0;
    if (nextBtn) nextBtn.disabled = threadsOffset + threadsLimit >= total;

    const countEl = document.getElementById("hook-threads-count");
    if (countEl) {
      const start = total > 0 ? threadsOffset + 1 : 0;
      const end = Math.min(threadsOffset + rows.length, total);
      countEl.textContent = total > 0 ? `Showing ${start}-${end} of ${total}` : "No activity found";
    }
    const pageInfoBottom = document.getElementById("hook-threads-page-info-bottom");
    const prevBottom = document.getElementById("hook-threads-prev-page-bottom") as HTMLButtonElement | null;
    const nextBottom = document.getElementById("hook-threads-next-page-bottom") as HTMLButtonElement | null;
    if (pageInfoBottom) pageInfoBottom.textContent = `Page ${currentPage} (${total} total)`;
    if (prevBottom) prevBottom.disabled = threadsOffset <= 0;
    if (nextBottom) nextBottom.disabled = threadsOffset + threadsLimit >= total;

    // Rebind (clone removes old listeners)
    const rebind = (btn: HTMLButtonElement | null, fn: () => void) => {
      if (!btn || !btn.parentNode) return;
      const clone = btn.cloneNode(true) as HTMLButtonElement;
      btn.parentNode.replaceChild(clone, btn);
      clone.addEventListener("click", fn);
    };
    rebind(prevBtn, () => {
      threadsOffset = Math.max(0, threadsOffset - threadsLimit);
      void loadHookThreads(hookId);
    });
    rebind(nextBtn, () => {
      threadsOffset += threadsLimit;
      void loadHookThreads(hookId);
    });
    rebind(prevBottom, () => {
      threadsOffset = Math.max(0, threadsOffset - threadsLimit);
      void loadHookThreads(hookId);
    });
    rebind(nextBottom, () => {
      threadsOffset += threadsLimit;
      void loadHookThreads(hookId);
    });

    const orderBtn = document.getElementById("hook-threads-order-btn");
    const orderBtnBottom = document.getElementById("hook-threads-order-btn-bottom");
    const arrow = threadsOrder === "desc" ? "\u2193" : "\u2191";
    const label = threadsOrder === "desc" ? "Recent" : "Oldest";
    for (const b of [orderBtn, orderBtnBottom]) {
      if (!b) continue;
      b.querySelector(".arrow")!.textContent = arrow;
      b.childNodes[1].textContent = " " + label;
    }
    const toggleOrder = () => {
      threadsOrder = threadsOrder === "desc" ? "asc" : "desc";
      threadsOffset = 0;
      void loadHookThreads(hookId);
    };
    rebind(orderBtn as HTMLButtonElement | null, toggleOrder);
    rebind(orderBtnBottom as HTMLButtonElement | null, toggleOrder);
  } catch {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Failed to load activity.</div>';
  }
}

// ── Details page ──
export async function renderHookDetail(container: HTMLElement, hookId: string): Promise<void> {
  threadsOffset = 0;
  threadsOrder = "desc";

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Hook Details</h1>
        <p class="page-subtitle" id="hook-detail-subtitle">Hook: ${escapeHtml(hookId)}</p>
      </div>
      <div id="hook-detail-action-buttons" style="display:flex;gap:0.5rem;">
        <button id="hook-detail-fire-btn" style="${TOP_BTN_STYLE}background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:var(--accent-green,#10b981);">&#9654; Fire</button>
        <button id="hook-detail-toggle-active" style="${TOP_BTN_STYLE}background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);">N/A</button>
        <button id="hook-detail-delete-btn" style="${DANGER_STYLE}">Delete</button>
        <button id="hook-detail-edit-btn" style="${TOP_BTN_STYLE}background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:var(--accent-purple);">Edit</button>
        <a href="/hooks" class="back-link" id="back-to-hooks" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);color:var(--accent-cyan);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.85rem;text-decoration:none;">&#8592; Back to Hooks</a>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Hook Info</span></div>
      <div class="card-body" id="hook-detail">
        <div class="loading">Loading hook details</div>
      </div>
    </div>
    <div class="card" id="hook-activity-card">
      <div class="card-header">
        <span class="card-title">Threads</span>
        <span class="events-nav" id="hook-threads-nav">
          <button class="nav-btn" id="hook-threads-prev-page" disabled>&#8592; Prev</button>
          <span id="hook-threads-page-info">Page 1</span>
          <button class="nav-btn" id="hook-threads-next-page" disabled>Next &#8594;</button>
          <button class="nav-btn order-btn" id="hook-threads-order-btn"><span class="arrow">&#8595;</span> Recent</button>
        </span>
      </div>
      <div class="card-body" id="hook-threads">
        <div class="loading">Loading activity...</div>
      </div>
      <div class="card-footer" id="hook-threads-bottom-nav" style="padding:0.75rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <span class="events-count" id="hook-threads-count"></span>
        <span class="events-nav">
          <button class="nav-btn" id="hook-threads-prev-page-bottom" disabled>&#8592; Prev</button>
          <span id="hook-threads-page-info-bottom">Page 1</span>
          <button class="nav-btn" id="hook-threads-next-page-bottom" disabled>Next &#8594;</button>
          <button class="nav-btn order-btn" id="hook-threads-order-btn-bottom"><span class="arrow">&#8595;</span> Recent</button>
        </span>
      </div>
    </div>
  `;

  document.getElementById("back-to-hooks")?.addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState({}, "", "/hooks");
    router.go("hooks");
  });

  const hook = await loadHookInfo(hookId);

  // Toggle button label now that we know the state
  const toggleBtn = document.getElementById("hook-detail-toggle-active") as HTMLButtonElement | null;
  if (toggleBtn && hook) toggleBtn.textContent = hook.enabled ? "Disable" : "Enable";

  // ── Fire button ──
  document.getElementById("hook-detail-fire-btn")?.addEventListener("click", async () => {
    try {
      const res = await fetch(`/api/hooks/${encodeURIComponent(hookId)}/fire`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      showToast("Hook fired", "success");
      threadsOffset = 0;
      void loadHookThreads(hookId);
    } catch (e) {
      showToast("Failed: " + formatApiError(e), "error");
    }
  });

  // ── Activate / Deactivate ──
  toggleBtn?.addEventListener("click", async () => {
    try {
      const res = await fetch(`/api/hooks/${encodeURIComponent(hookId)}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error(await res.text());
      const reloaded = await loadHookInfo(hookId);
      if (toggleBtn && reloaded) toggleBtn.textContent = reloaded.enabled ? "Disable" : "Enable";
      showToast("Hook updated", "success");
    } catch (e) {
      showToast("Failed: " + formatApiError(e), "error");
    }
  });

  // ── Delete (confirm, then DELETE /api/hooks/{id} which removes the entry
  // from the hooks section of tasks.yml on the core) ──
  document.getElementById("hook-detail-delete-btn")?.addEventListener("click", async () => {
    const name = hook ? hookName(hook) : hookId;
    if (!confirm(`Delete hook "${name}"? This removes it from tasks.yml and cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/hooks/${encodeURIComponent(hookId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      showToast("Hook deleted", "success");
      history.pushState({}, "", "/hooks");
      router.go("hooks");
    } catch (e) {
      showToast("Failed: " + formatApiError(e), "error");
    }
  });

  // ── Edit ──
  document.getElementById("hook-detail-edit-btn")?.addEventListener("click", async () => {
    const { showHookModal } = await import("./hooks-detail");
    const fresh = hook ?? ((await fetchHook(hookId)) as unknown as Record<string, any>);
    void showHookModal(fresh as Record<string, unknown>, () => {
      void loadHookInfo(hookId);
    });
  });

  void loadHookThreads(hookId);
}
