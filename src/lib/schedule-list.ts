/**
 * Schedule job list rendering.
 * Extracted from src/pages/schedule.ts
 */
import { apiGet } from "./api";
import { escapeHtml } from "./helpers";
import { formatDate } from "./schedule-detail";
import { router } from "./router";

// ── Action label formatting ──
export function formatActionLabel(
  actionId: string | null,
  actionName: string | null,
  fallback: string,
): string {
  if (!actionId) return actionName || fallback;
  const name = actionName || fallback;
  return `[${actionId}] ${name}`;
}

/**
 * Load and render the cron job list.
 */
export async function loadCronJobs(
  activeOnly: boolean,
  onStateChange: (active: boolean) => void,
): Promise<void> {
  const el = document.getElementById("cron-table")!;
  const countEl = document.getElementById("schedule-count")!;
  try {
    const query = activeOnly ? "" : "?active=false";
    const jobs = await apiGet<any[]>("/schedule" + query);
    countEl.textContent = `${jobs.length} job${jobs.length !== 1 ? "s" : ""}`;
    if (jobs.length === 0) {
      el.innerHTML = `<div class="empty-state">${activeOnly ? "No active jobs" : "No scheduled jobs"}</div>`;
      return;
    }
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Schedule</th>
              <th>Prompt / Task</th>
              <th>Channel</th>
              <th>Profile</th>
              <th>Last Run</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${jobs
              .map(
                (j: any) => `
              <tr data-cron-id="${escapeHtml(j.id)}">
                <td style="color:var(--text-primary);font-weight:500;">${escapeHtml(j.name || j.id)}</td>
                <td><code style="background:var(--bg-card);padding:0.125rem 0.375rem;border-radius:3px;font-size:0.75rem;">${escapeHtml(j.schedule)}</code></td>
                <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.8rem;">
                  ${
                    j.mode === "action"
                      ? `<span style="color:var(--accent-cyan);font-weight:500;">${escapeHtml(j.action_id ? formatActionLabel(j.action_id, j.action_name, "Action") : "Action")}</span>`
                      : escapeHtml(j.prompt_preview || "")
                  }
                </td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${j.channel_name ? escapeHtml(j.channel_name) : j.channel_id ? `#${j.channel_id}` : "—"}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${j.profile ? escapeHtml(j.profile) : "—"}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${formatDate(j.last_run)}</td>
                <td>
                  <span class="badge ${j.active ? "badge-success" : "badge-neutral"}" style="cursor:pointer;" title="Click to toggle">
                    ${j.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style="text-align:right;white-space:nowrap;">
                  <button class="cron-run-btn" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:var(--accent-green,#10b981);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;">Run</button>
                  <button class="cron-edit-btn" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:var(--accent-purple);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;">Edit</button>
                  <button class="cron-toggle-active" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;color:var(--text-secondary);">${j.active ? "Deactivate" : "Activate"}</button>
                  <a href="/schedule/${encodeURIComponent(j.id)}" class="cron-details-btn" data-cron-id="${encodeURIComponent(j.id)}" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);color:var(--accent-cyan);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;line-height:1.4;text-decoration:none;display:inline-block;">Details</a>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    wireCronButtons(activeOnly, onStateChange);
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load schedules: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function wireCronButtons(activeOnly: boolean, onStateChange: (active: boolean) => void): void {
  // Details buttons
  document.querySelectorAll(".cron-details-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const cronId = btn.getAttribute("data-cron-id");
      if (!cronId) return;
      if ((e as MouseEvent).button === 1) return;
      e.preventDefault();
      e.stopPropagation();
      history.pushState({}, "", "/schedule/" + cronId);
      router.go("schedule/" + cronId);
    });
  });

  // Edit buttons
  document.querySelectorAll(".cron-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const cronId = row?.getAttribute("data-cron-id");
      if (!cronId) return;
      // Dynamic import to avoid circular dependency
      const { showCronModal } = await import("./schedule-detail");
      const job = await apiGet<any>("/schedule/" + encodeURIComponent(cronId));
      void showCronModal(job, () => loadCronJobs(activeOnly, onStateChange));
    });
  });

  // Run buttons
  document.querySelectorAll(".cron-run-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const cronId = row?.getAttribute("data-cron-id");
      if (!cronId) return;

      const runBtn = btn as HTMLButtonElement;
      const originalText = runBtn.textContent;
      runBtn.disabled = true;
      runBtn.textContent = "Running...";

      // Check if job is inactive — ask for confirmation with force
      const jobRes = await fetch(`/api/schedule/${encodeURIComponent(cronId)}`);
      const job = jobRes.ok ? await jobRes.json() : null;
      let force = false;

      if (job && !job.active) {
        if (!confirm(`Job "${job.name}" is inactive. Run anyway?`)) {
          runBtn.disabled = false;
          runBtn.textContent = originalText;
          return;
        }
        force = true;
      }

      try {
        const res = await fetch(`/api/schedule/${encodeURIComponent(cronId)}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) {
          const errData = await res.text();
          throw new Error(errData);
        }
        const data = await res.json();
        (window as any).showToast?.(
          data.mode === "action"
            ? `Job fired (action mode)`
            : `Job fired — thread #${data.thread_id} (${data.mode})`,
          "success",
        );
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = originalText;
      }
    });
  });

  // Toggle active buttons
  document.querySelectorAll(".cron-toggle-active").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const cronId = row?.getAttribute("data-cron-id");
      if (!cronId) return;
      const isActive = btn.textContent === "Activate";
      try {
        const res = await fetch(`/api/schedule/${encodeURIComponent(cronId)}/toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: isActive }),
        });
        if (!res.ok) throw new Error(await res.text());
        (window as any).showToast?.(isActive ? "Activated" : "Deactivated", "success");
        void loadCronJobs(activeOnly, onStateChange);
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Status badge toggle
  document.querySelectorAll(".badge[title='Click to toggle']").forEach((badge) => {
    badge.addEventListener("click", async () => {
      const row = (badge as HTMLElement).closest("tr") as HTMLElement;
      const cronId = row?.getAttribute("data-cron-id");
      if (!cronId) return;
      const isActive = badge.classList.contains("badge-neutral");
      try {
        const res = await fetch(`/api/schedule/${encodeURIComponent(cronId)}/toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: isActive }),
        });
        if (!res.ok) throw new Error(await res.text());
        void loadCronJobs(activeOnly, onStateChange);
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });
}
