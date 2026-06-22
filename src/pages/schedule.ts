import { apiGet } from "../lib/api";
import { enhanceSelectElement } from "../lib/dropdown";
import { router } from "../lib/router";
import { renderMessageCard, wireMessageCardToggles } from "../lib/message-card";

export function renderSchedule(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule</h1>
        <p class="page-subtitle">Scheduled tasks and cron jobs</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button id="toggle-all-filter" class="btn-filter" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">Show All</button>
        <button id="create-cron-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Schedule</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title" id="schedule-title">Active Jobs</span></div>
      <div class="card-body" id="cron-table">
        <div class="loading">Loading schedules</div>
      </div>
    </div>
  `;

  // Wire create button
  document.getElementById("create-cron-btn")?.addEventListener("click", () => showCronModal(null));
  document.getElementById("toggle-all-filter")?.addEventListener("click", () => {
    const btn = document.getElementById("toggle-all-filter") as HTMLElement;
    const showingAll = btn.textContent === "Active Only";
    btn.textContent = showingAll ? "Show All" : "Active Only";
    document.getElementById("schedule-title")!.textContent = showingAll ? "Active Jobs" : "All Jobs";
    void loadCronJobs(showingAll);
  });

  void loadCronJobs(true);
}

// ── Load jobs ──

let _activeOnly = true;

function formatActionLabel(actionId: string | null, actionName: string | null, fallback: string): string {
  if (!actionId) return actionName || fallback;
  const name = actionName || fallback;
  return `[${actionId}] ${name}`;
}

async function loadCronJobs(activeOnly: boolean): Promise<void> {
  _activeOnly = activeOnly;
  const el = document.getElementById("cron-table")!;
  try {
    const query = activeOnly ? "" : "?active=false";
    const jobs = await apiGet<any[]>("/schedule" + query);
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
                  <button class="cron-edit-btn" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:var(--accent-purple);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;">Edit</button>
                  <button class="cron-toggle-active" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;color:var(--text-secondary);">${j.active ? "Deactivate" : "Activate"}</button>
                  <a href="/schedule/${encodeURIComponent(j.id)}" class="cron-details-btn" data-cron-id="${encodeURIComponent(j.id)}" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);color:var(--accent-cyan);border-radius:4px;padding:0.2rem 0.5rem;cursor:pointer;font-size:0.75rem;text-decoration:none;display:inline-block;">Details</a>
                </td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
    wireCronButtons();
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load schedules: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function wireCronButtons(): void {
  // Details buttons — handle left-click for SPA navigation, middle-click opens in new tab via href
  document.querySelectorAll(".cron-details-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const cronId = btn.getAttribute("data-cron-id");
      if (!cronId) return;
      // For middle-click (button === 1), let browser handle via href (opens in new tab)
      if (e.button === 1) return;
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
      const job = await apiGet<any>("/schedule/" + encodeURIComponent(cronId));
      void showCronModal(job);
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
        void loadCronJobs(_activeOnly);
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Status badge toggle (click the Active/Inactive badge)
  document.querySelectorAll(".badge[title='Click to toggle']").forEach((badge) => {
    badge.addEventListener("click", async () => {
      const row = (badge as HTMLElement).closest("tr") as HTMLElement;
      const cronId = row?.getAttribute("data-cron-id");
      if (!cronId) return;
      const isActive = badge.classList.contains("badge-neutral"); // currently inactive
      try {
        const res = await fetch(`/api/schedule/${encodeURIComponent(cronId)}/toggle`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: isActive }),
        });
        if (!res.ok) throw new Error(await res.text());
        void loadCronJobs(_activeOnly);
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });
}

// ── Schedule detail view ──

export async function renderScheduleDetail(container: HTMLElement, cronId: string): Promise<void> {
  // Reset pagination state for fresh load
  threadsOffset = 0;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule Details</h1>
        <p class="page-subtitle" id="detail-subtitle">Job: ${escapeHtml(cronId)}</p>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button id="detail-edit-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Edit</button>
        <a href="/schedule" class="back-link" id="back-to-schedule" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);color:var(--accent-cyan);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.85rem;text-decoration:none;">← Back to Schedules</a>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Job Info</span></div>
      <div class="card-body" id="schedule-detail">
        <div class="loading">Loading job details</div>
      </div>
    </div>
    <div class="card" id="recent-activity-card">
      <div class="card-header">
        <span class="card-title">Recent Activity</span>
        <span class="events-nav" id="schedule-threads-nav">
          <button class="nav-btn" id="threads-prev-page" disabled>← Prev</button>
          <span id="threads-page-info">Page 1</span>
          <button class="nav-btn" id="threads-next-page" disabled>Next →</button>
        </span>
      </div>
      <div class="card-body" id="schedule-threads">
        <div class="loading">Loading activity...</div>
      </div>
      <div class="card-footer" id="threads-bottom-nav" style="padding:0.75rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <span class="events-count" id="schedule-threads-count"></span>
        <span class="events-nav">
          <button class="nav-btn" id="threads-prev-page-bottom" disabled>← Prev</button>
          <span id="threads-page-info-bottom">Page 1</span>
          <button class="nav-btn" id="threads-next-page-bottom" disabled>Next →</button>
        </span>
      </div>
    </div>
  `;

  document.getElementById("back-to-schedule")?.addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState({}, "", "/schedule");
    router.go("schedule");
  });

  // Load job details
  const job = await loadScheduleDetail(cronId);
  document.getElementById("detail-edit-btn")?.addEventListener("click", () => showCronModal(job));

  // Load threads (card already exists in the DOM)
  if (job) {
    void loadScheduleThreads(job.id);
  }
}

async function loadScheduleDetail(cronId: string): Promise<any> {
  const el = document.getElementById("schedule-detail")!;
  try {
    const job = await apiGet<any>("/schedule/" + encodeURIComponent(cronId));
    const detailEl = document.getElementById("detail-subtitle");
    if (detailEl) detailEl.textContent = `Job: ${escapeHtml(job.name || job.id)}`;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Name</div>
            <div style="color:var(--text-primary);font-weight:500;">${escapeHtml(job.name || job.id)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Display Name</div>
            <div style="color:var(--text-primary);">${escapeHtml(job.display_name || job.name || job.id)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Schedule</div>
            <code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.8rem;color:var(--accent-cyan);">${escapeHtml(job.schedule)}</code>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Mode</div>
            <div style="color:var(--text-primary);">${job.mode ? escapeHtml(job.mode) : "—"}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Status</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <span class="badge ${job.enabled ? "badge-success" : "badge-neutral"}">${job.enabled ? "Enabled" : "Disabled"}</span>
              <span class="badge ${job.active ? "badge-success" : "badge-warning"}">${job.active ? "Active" : "Inactive"}</span>
            </div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Channel</div>
            <div style="color:var(--text-primary);">${job.channel_name ? escapeHtml(job.channel_name) : job.channel_id ? `#${job.channel_id}` : "—"}</div>
          </div>
        </div>
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Profile</div>
            <div style="color:var(--text-primary);">${job.profile ? escapeHtml(job.profile) : "—"}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Last Run</div>
            <div style="color:var(--text-primary);">${formatDate(job.last_run)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Next Run</div>
            <div style="color:var(--text-primary);">${formatDate(job.next_run)}</div>
          </div>
          ${
            job.mode === "action"
              ? `
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Action</div>
            <div style="color:var(--accent-cyan);font-weight:500;">${escapeHtml(job.action_id ? formatActionLabel(job.action_id, job.action_name, "—") : "—")}</div>
          </div>`
              : ""
          }
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Created</div>
            <div style="color:var(--text-muted);font-size:0.8rem;">${formatDate(job.created_at)}</div>
          </div>
        </div>
      </div>

      ${
        job.mode === "agentic" && job.prompt
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Prompt</div>
        <pre style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:var(--radius-sm);padding:0.75rem;font-size:0.8rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;line-height:1.5;">${escapeHtml(job.prompt)}</pre>
      </div>`
          : ""
      }
      ${
        job.mode === "action" && job.action_id
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Action</div>
        <div style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:var(--radius-sm);padding:0.75rem;font-size:0.9rem;color:var(--accent-cyan);font-weight:500;">${escapeHtml(job.action_id ? formatActionLabel(job.action_id, job.action_name, "") : "")}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">This job runs without an agent — the scheduler executes the action directly.</div>
      </div>`
          : ""
      }

      ${
        job.skills && job.skills.length > 0
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.375rem;">
          ${job.skills.map((s: string) => `<span class="badge badge-info">${escapeHtml(s)}</span>`).join("")}
        </div>
      </div>`
          : ""
      }

      ${
        job.workdir
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Work Directory</div>
        <code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.8rem;color:var(--accent-cyan);">${escapeHtml(job.workdir)}</code>
      </div>`
          : ""
      }

    `;

    return job;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load job details: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
    return null;
  }
}

// ── Create/Edit Modal ──

async function showCronModal(job: any): Promise<void> {
  const isEdit = job !== null;

  // Fetch available channels, profiles, existing jobs, and actions
  let channels: any[] = [];
  let profiles: any[] = [];
  let existingJobs: any[] = [];
  let actions: { id: string; name: string; tool_name: string; is_builtin: boolean }[] = [];
  try {
    channels = await apiGet<any[]>("/channels");
  } catch {
    /* channels may not be available */
  }
  try {
    profiles = await apiGet<any[]>("/profiles");
  } catch {
    /* profiles may not be available */
  }
  try {
    existingJobs = await apiGet<any[]>("/schedule?active=false");
  } catch {
    /* existing jobs may not be available */
  }
  try {
    actions = await apiGet<any[]>("/schedule/actions");
  } catch {
    /* actions may not be available */
  }

  const modal = document.createElement("div");
  modal.style.cssText =
    "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding-top:8vh;";
  modal.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--glass-border);border-radius:12px;width:560px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 12px 48px rgba(0,0,0,0.5);">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <h2 style="font-size:1.1rem;margin:0;color:var(--text-primary);">${isEdit ? "Edit Schedule" : "Create Schedule"}</h2>
        <button id="modal-close" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;padding:0.25rem;">✕</button>
      </div>
      <div style="padding:1.25rem;">
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Display Name</label>
          <input id="cron-display" type="text" class="filter-input" value="${isEdit ? escapeHtml(job.display_name || job.name || "") : ""}" style="width:100%;" />
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">${isEdit ? "" : "The internal name is auto-generated from this value."}</div>
        </div>
        <div style="margin-bottom:1rem;">
          <div style="display:flex;align-items:center;gap:0.375rem;margin-bottom:0.375rem;">
            <label style="font-size:0.8rem;color:var(--text-muted);">Schedule (cron expression)</label>
            <button id="cron-help-btn" type="button" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.7rem;padding:0;line-height:1;width:14px;height:14px;border-radius:50%;border:1px solid var(--text-muted);display:inline-flex;align-items:center;justify-content:center;" title="Cron format help">?</button>
          </div>
          <input id="cron-schedule" type="text" class="filter-input" value="${isEdit ? escapeHtml(job.schedule) : "0 0 0 * * *"}" style="width:100%;font-family:monospace;" />
          <div id="cron-help-box" style="display:none;margin-top:0.5rem;padding:0.75rem;background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:6px;font-size:0.78rem;color:var(--text-secondary);line-height:1.6;">
            <div style="margin-bottom:0.5rem;"><strong style="color:var(--text-primary);">6-field format:</strong> <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">sec min hour dom month dow</code></div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:0.125rem 0.5rem 0.125rem 0;vertical-align:top;white-space:nowrap;color:var(--accent-purple);">sec</td><td style="padding:0.125rem 0;color:var(--text-muted);">Seconds (0-59)</td></tr>
              <tr><td style="padding:0.125rem 0.5rem 0.125rem 0;vertical-align:top;white-space:nowrap;color:var(--accent-purple);">min</td><td style="padding:0.125rem 0;color:var(--text-muted);">Minutes (0-59)</td></tr>
              <tr><td style="padding:0.125rem 0.5rem 0.125rem 0;vertical-align:top;white-space:nowrap;color:var(--accent-purple);">hour</td><td style="padding:0.125rem 0;color:var(--text-muted);">Hours (0-23)</td></tr>
              <tr><td style="padding:0.125rem 0.5rem 0.125rem 0;vertical-align:top;white-space:nowrap;color:var(--accent-purple);">dom</td><td style="padding:0.125rem 0;color:var(--text-muted);">Day of month (1-31)</td></tr>
              <tr><td style="padding:0.125rem 0.5rem 0.125rem 0;vertical-align:top;white-space:nowrap;color:var(--accent-purple);">month</td><td style="padding:0.125rem 0;color:var(--text-muted);">Month (1-12 or JAN-DEC)</td></tr>
              <tr><td style="padding:0.125rem 0.5rem 0.125rem 0;vertical-align:top;white-space:nowrap;color:var(--accent-purple);">dow</td><td style="padding:0.125rem 0;color:var(--text-muted);">Day of week (0-7 or SUN-SAT, 0=SUN)</td></tr>
            </table>
            <div style="margin-top:0.5rem;"><strong style="color:var(--text-primary);">Special:</strong> <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">*</code> = any, <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">*/N</code> = every N, <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">,</code> = list, <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">-</code> = range</div>
            <div style="margin-top:0.5rem;"><strong style="color:var(--text-primary);">Examples:</strong></div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 * * * * *</code> — every minute at :00</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 */10 * * * *</code> — every 10 minutes</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 0 * * * *</code> — every hour at :00</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 0 0 * * *</code> — daily at midnight</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 30 6 * * *</code> — daily at 06:30:00</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 0 9 * * 1-5</code> — weekdays at 09:00</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 0 0 1 * *</code> — 1st of every month at midnight</div>
          </div>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Channel</label>
          <select id="cron-channel" class="filter-select" style="width:100%;">
            <option value="">- (Default cron channel)</option>
            ${channels
              .map(
                (ch: any) =>
                  `<option value="${ch.id}" ${isEdit && job.channel_id === ch.id ? "selected" : ""}>${escapeHtml(ch.name)} (${escapeHtml(ch.platform || "")})</option>`,
              )
              .join("")}
          </select>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Profile</label>
          <select id="cron-profile" class="filter-select" style="width:100%;">
            <option value="">- (Default)</option>
            ${profiles
              .map(
                (p: any) =>
                  `<option value="${escapeHtml(p.name)}" ${isEdit && job.profile === p.name ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Mode</label>
          <select id="cron-mode" class="filter-select" style="width:100%;">
            <option value="agentic" ${isEdit && job.mode === "agentic" ? "selected" : ""}>Agentic</option>
            <option value="action" ${isEdit && job.mode === "action" ? "selected" : ""}>Action</option>
          </select>
        </div>
        <div id="cron-action-section" style="display:${isEdit && job.mode === "action" ? "block" : "none"};margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Action</label>
          <select id="cron-action" class="filter-select" style="width:100%;">
            <option value="">Select action...</option>
            ${actions
              .map(
                (a: any) =>
                  `<option value="${escapeHtml(a.id)}" ${isEdit && job.action_id === a.id ? "selected" : ""}>${escapeHtml(a.display || "[" + a.id + "] " + a.name)}${a.is_builtin ? " (built-in)" : ""}</option>`,
              )
              .join("")}
          </select>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Action mode runs this action without an agent — no prompt needed.</div>
        </div>
        <div id="cron-agentic-section" style="display:${isEdit ? (job.mode === "agentic" ? "block" : "none") : "block"};margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Prompt</label>
          <textarea id="cron-prompt" class="filter-input" style="width:100%;min-height:80px;resize:vertical;font-family:monospace;font-size:0.8rem;">${isEdit && job.prompt ? escapeHtml(job.prompt) : ""}</textarea>
        </div>
        <div style="margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
          <input id="cron-active" type="checkbox" ${isEdit ? (job.active ? "checked" : "") : "checked"} />
          <label for="cron-active" style="font-size:0.85rem;color:var(--text-primary);">Active</label>
        </div>
      </div>
      <div style="padding:1rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;justify-content:flex-end;gap:0.5rem;">
        <button id="modal-cancel" style="background:rgba(255,255,255,0.05);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;">Cancel</button>
        <button id="modal-save" style="background:var(--accent-purple);border:none;color:white;border-radius:6px;padding:0.5rem 1rem;cursor:pointer;font-size:0.85rem;font-weight:500;">${isEdit ? "Update" : "Create"}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Wire cron help button
  const helpBtn = document.getElementById("cron-help-btn");
  const helpBox = document.getElementById("cron-help-box");
  if (helpBtn && helpBox) {
    helpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      helpBox.style.display = helpBox.style.display === "none" ? "block" : "none";
    });
  }

  // Enhance selects with custom floating dropdown (matching other pages)
  enhanceSelectElement(document.getElementById("cron-channel") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-profile") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-mode") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-action") as HTMLSelectElement);

  // Wire mode selector to show/hide action vs agentic sections
  const modeSelect = modal.querySelector("#cron-mode") as HTMLSelectElement;
  const actionSection = modal.querySelector("#cron-action-section") as HTMLElement;
  const agenticSection = modal.querySelector("#cron-agentic-section") as HTMLElement;
  modeSelect.addEventListener("change", () => {
    const isAction = modeSelect.value === "action";
    actionSection.style.display = isAction ? "block" : "none";
    agenticSection.style.display = isAction ? "none" : "block";
  });

  // Close handlers
  modal.querySelector("#modal-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#modal-cancel")?.addEventListener("click", () => modal.remove());

  // Save handler
  modal.querySelector("#modal-save")?.addEventListener("click", async () => {
    const display_name = (modal.querySelector("#cron-display") as HTMLInputElement).value.trim();
    const schedule = (modal.querySelector("#cron-schedule") as HTMLInputElement).value.trim();
    const channelVal = (modal.querySelector("#cron-channel") as HTMLSelectElement).value;
    const profile = (modal.querySelector("#cron-profile") as HTMLSelectElement).value;
    const mode = (modal.querySelector("#cron-mode") as HTMLSelectElement).value;
    const action_id = (modal.querySelector("#cron-action") as HTMLSelectElement).value;
    const prompt = (modal.querySelector("#cron-prompt") as HTMLTextAreaElement).value.trim();
    const active = (modal.querySelector("#cron-active") as HTMLInputElement).checked;
    const channel_id = channelVal ? parseInt(channelVal, 10) : null;

    if (!display_name) {
      (window as any).showToast?.("Display Name is required", "error");
      return;
    }
    // Sanitize name: lowercase, no spaces/special chars, only alphanumeric and hyphens
    let name: string;
    if (isEdit) {
      name = job.name;
    } else {
      name = display_name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (!name) name = "unnamed";
      // Check for collision with existing jobs
      if (existingJobs.some((j: any) => j.id === name || j.name === name)) {
        name = name + "-" + Date.now();
      }
    }
    if (!schedule) {
      (window as any).showToast?.("Schedule is required", "error");
      return;
    }

    try {
      const body: any = {
        name: name,
        display_name,
        schedule,
        prompt,
        active,
        channel_id,
        profile,
        mode,
      };
      if (mode === "action") body.action_id = action_id || null;

      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/schedule/${encodeURIComponent(job.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) throw new Error(await res.text());
      (window as any).showToast?.(isEdit ? "Schedule updated" : "Schedule created", "success");
      modal.remove();
      void loadCronJobs(_activeOnly);
    } catch (e) {
      (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
    }
  });
}

// ── Pagination state for schedule threads ──
let threadsOffset = 0;
const threadsLimit = 10;

async function loadScheduleThreads(scheduleId: string): Promise<void> {
  const el = document.getElementById("schedule-threads");
  if (!el) return;
  try {
    const res = await fetch(
      `/api/schedule/${encodeURIComponent(scheduleId)}/threads?offset=${threadsOffset}&limit=${threadsLimit}`,
    );
    if (!res.ok) throw new Error("Failed to load thread activity");
    const data = await res.json();
    const total = parseInt(data.total) || 0;
    const rows = data.rows || [];

    if (rows.length === 0) {
      el.innerHTML =
        '<div style="color:var(--text-muted);font-size:0.8rem;padding:1rem 0;">No activity from this task yet.</div>';
      return;
    }

    el.innerHTML = `<div class="events-scroll">${rows.map((row: any) => renderMessageCard(row)).join("")}</div>`;
    // Wire up expand/collapse toggles
    wireMessageCardToggles(el);
    // Wire up thread link clicks → SPA navigation to threads page
    el.querySelectorAll(".ev-thread-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const threadId = (e.currentTarget as HTMLElement).getAttribute("data-thread-id");
        if (!threadId) return;
        const url = `/threads?thread_id=${encodeURIComponent(threadId)}`;
        document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
          const navRoute = n.getAttribute("data-route") || "";
          n.classList.toggle("active", navRoute === "threads");
        });
        history.pushState({}, "", url);
        router.go("threads");
      });
    });

    // Update pagination
    const currentPage = Math.floor(threadsOffset / threadsLimit) + 1;
    const pageInfo = document.getElementById("threads-page-info");
    const prevBtn = document.getElementById("threads-prev-page") as HTMLButtonElement;
    const nextBtn = document.getElementById("threads-next-page") as HTMLButtonElement;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} (${total} total)`;
    if (prevBtn) prevBtn.disabled = threadsOffset <= 0;
    if (nextBtn) nextBtn.disabled = threadsOffset + threadsLimit >= total;

    // Wire pagination buttons (remove old listeners first)
    const prevClone = prevBtn?.cloneNode(true) as HTMLButtonElement;
    const nextClone = nextBtn?.cloneNode(true) as HTMLButtonElement;
    if (prevBtn && prevBtn.parentNode) {
      prevBtn.parentNode.replaceChild(prevClone, prevBtn);
      prevClone.addEventListener("click", () => {
        threadsOffset = Math.max(0, threadsOffset - threadsLimit);
        void loadScheduleThreads(scheduleId);
      });
    }
    if (nextBtn && nextBtn.parentNode) {
      nextBtn.parentNode.replaceChild(nextClone, nextBtn);
      nextClone.addEventListener("click", () => {
        threadsOffset += threadsLimit;
        void loadScheduleThreads(scheduleId);
      });
    }

    // Update bottom pagination
    const prevBottom = document.getElementById("threads-prev-page-bottom") as HTMLButtonElement;
    const nextBottom = document.getElementById("threads-next-page-bottom") as HTMLButtonElement;
    const pageInfoBottom = document.getElementById("threads-page-info-bottom");
    const countEl = document.getElementById("schedule-threads-count");
    if (countEl) {
      const start = total > 0 ? threadsOffset + 1 : 0;
      const end = Math.min(threadsOffset + rows.length, total);
      countEl.textContent = total > 0 ? `Showing ${start}–${end} of ${total}` : "No activity found";
    }
    if (pageInfoBottom) pageInfoBottom.textContent = `Page ${currentPage} (${total} total)`;
    if (prevBottom) prevBottom.disabled = threadsOffset <= 0;
    if (nextBottom) nextBottom.disabled = threadsOffset + threadsLimit >= total;

    // Wire bottom pagination buttons (remove old listeners first)
    const prevBottomClone = prevBottom?.cloneNode(true) as HTMLButtonElement;
    const nextBottomClone = nextBottom?.cloneNode(true) as HTMLButtonElement;
    if (prevBottom && prevBottom.parentNode) {
      prevBottom.parentNode.replaceChild(prevBottomClone, prevBottom);
      prevBottomClone.addEventListener("click", () => {
        threadsOffset = Math.max(0, threadsOffset - threadsLimit);
        void loadScheduleThreads(scheduleId);
        document
          .getElementById("recent-activity-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (nextBottom && nextBottom.parentNode) {
      nextBottom.parentNode.replaceChild(nextBottomClone, nextBottom);
      nextBottomClone.addEventListener("click", () => {
        threadsOffset += threadsLimit;
        void loadScheduleThreads(scheduleId);
        document
          .getElementById("recent-activity-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  } catch {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Failed to load activity.</div>';
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// Floating dropdown helpers imported from src/lib/dropdown.ts

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
