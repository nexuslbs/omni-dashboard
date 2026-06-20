import { apiGet, type CronJob } from "../lib/api";
import { router } from "../lib/router";

export function renderSchedule(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule</h1>
        <p class="page-subtitle">Scheduled tasks and cron jobs</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button id="create-cron-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Schedule</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Active Jobs</span></div>
      <div class="card-body" id="cron-table">
        <div class="loading">Loading schedules</div>
      </div>
    </div>
  `;

  void loadCronJobs();
}

async function loadCronJobs(): Promise<void> {
  const el = document.getElementById("cron-table")!;
  try {
    const jobs = await apiGet<CronJob[]>("/schedule");
    if (jobs.length === 0) {
      el.innerHTML = `<div class="empty-state">No scheduled jobs</div>`;
      return;
    }
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Schedule</th>
              <th>Prompt</th>
              <th>Last Run</th>
              <th>Next Run</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${jobs
              .map(
                (j) => `
              <tr class="clickable-row" data-cron-id="${escapeHtml(j.id)}">
                <td style="color:var(--text-primary);font-weight:500;">${escapeHtml(j.name || j.id)}</td>
                <td><code style="background:var(--bg-card);padding:0.125rem 0.375rem;border-radius:3px;font-size:0.75rem;">${escapeHtml(j.schedule)}</code></td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.8rem;">${escapeHtml(j.prompt_preview || j.script ? "[script] " + escapeHtml(j.script) : "")}</td>
                <td>${formatDate(j.last_run)}</td>
                <td>${formatDate(j.next_run)}</td>
                <td><span class="badge ${j.status === "active" ? "badge-success" : j.status === "paused" ? "badge-warning" : "badge-neutral"}">${j.status}</span></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // Add click handlers to each row
    document.querySelectorAll("#cron-table .clickable-row").forEach((row) => {
      row.addEventListener("click", (_e) => {
        const cronId = (row as HTMLElement).getAttribute("data-cron-id");
        if (cronId) {
          history.pushState({}, "", `/schedule/${encodeURIComponent(cronId)}`);
          router.go(`schedule/${encodeURIComponent(cronId)}`);
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load schedules: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Schedule detail view ──

export async function renderScheduleDetail(container: HTMLElement, cronId: string): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule Details</h1>
        <p class="page-subtitle">Job: ${escapeHtml(cronId)}</p>
      </div>
      <div>
        <a href="/schedule" class="back-link" id="back-to-schedule">← Back to Schedules</a>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Job Info</span></div>
      <div class="card-body" id="schedule-detail">
        <div class="loading">Loading job details</div>
      </div>
    </div>
  `;

  // Wire up the back button
  const backLink = document.getElementById("back-to-schedule");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({}, "", "/schedule");
      router.go("schedule");
    });
  }

  await loadScheduleDetail(cronId);
}

async function loadScheduleDetail(cronId: string): Promise<void> {
  const el = document.getElementById("schedule-detail")!;
  try {
    const job = await apiGet<CronJob>("/schedule/" + encodeURIComponent(cronId));

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Name</div>
            <div style="color:var(--text-primary);font-weight:500;">${escapeHtml(job.name || job.id)}</div>
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
              ${job.active !== undefined ? `<span class="badge ${job.active ? "badge-success" : "badge-warning"}">${job.active ? "Active" : "Inactive"}</span>` : ""}
            </div>
          </div>
        </div>
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Last Run</div>
            <div style="color:var(--text-primary);">${formatDate(job.last_run)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Next Run</div>
            <div style="color:var(--text-primary);">${formatDate(job.next_run)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Direct Task Type</div>
            <div style="color:var(--text-primary);">${job.direct_task_type ? escapeHtml(job.direct_task_type) : "—"}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Created</div>
            <div style="color:var(--text-muted);font-size:0.8rem;">${formatDate(job.created_at)}</div>
          </div>
        </div>
      </div>

      ${
        job.no_agent
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Script Mode</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <span class="badge badge-info">No-agent</span>
          ${job.script ? `<code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.8rem;color:var(--accent-cyan);">${escapeHtml(job.script)}</code>` : ""}
        </div>
      </div>
      `
          : `
      ${
        job.prompt
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Prompt</div>
        <pre style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:var(--radius-sm);padding:0.75rem;font-size:0.8rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;line-height:1.5;">${escapeHtml(job.prompt)}</pre>
      </div>
      `
          : ""
      }
      `
      }

      ${
        job.skills && job.skills.length > 0
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.375rem;">
          ${job.skills.map((s: string) => `<span class="badge badge-info">${escapeHtml(s)}</span>`).join("")}
        </div>
      </div>
      `
          : ""
      }

      ${
        job.enabled_toolsets
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Restricted Toolsets</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.375rem;">
          ${(Array.isArray(job.enabled_toolsets) ? job.enabled_toolsets : []).map((t: string) => `<span class="badge badge-neutral">${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
      `
          : ""
      }

      ${
        job.context_from
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Context From</div>
        <div style="color:var(--text-secondary);font-size:0.8rem;">
          ${Array.isArray(job.context_from) ? job.context_from.map((f: string) => `<code style="background:var(--bg-card);padding:0.125rem 0.375rem;border-radius:3px;font-size:0.75rem;color:var(--accent-cyan);">${escapeHtml(f)}</code>`).join(" ") : ""}
        </div>
      </div>
      `
          : ""
      }

      ${
        job.workdir
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Work Directory</div>
        <code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.8rem;color:var(--accent-cyan);">${escapeHtml(job.workdir)}</code>
      </div>
      `
          : ""
      }

      ${
        job.profile
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Profile</div>
        <code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.8rem;color:var(--accent-cyan);">${escapeHtml(job.profile)}</code>
      </div>
      `
          : ""
      }

      ${
        job.channel_id
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Channel</div>
        <code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.8rem;color:var(--accent-cyan);">#${escapeHtml(String(job.channel_id))}</code>
      </div>
      `
          : ""
      }
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load job details: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
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

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
