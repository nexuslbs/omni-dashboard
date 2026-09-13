/**
 * Schedule job detail view and create/edit modal.
 * Extracted from src/pages/schedule.ts
 */
import { apiGet, unwrapEnvelope } from "./api";
import { cachedGet } from "./refcache";
import { escapeHtml, formatApiError } from "./helpers";
import { enhanceSelectElement } from "./dropdown";
import { apiThreadsLoader, createThreadsList, threadsListIds } from "./threads-list";
import { router } from "./router";
import { fixMissingSelectOptions } from "./helpers";
import { showToast } from "./utils";

// ── Activity: shared threads list (envelope-safe apiGet, last message per thread) ──
// The job id is dynamic (the details page is rendered per job), so the loader
// reads it here; switching jobs resets pagination/order to page 1, Recent.
let scheduleThreadsJobId: string | null = null;
const scheduleThreads = createThreadsList({
  ids: threadsListIds("schedule"),
  emptyText: "No activity from this task yet.",
  scrollIntoViewId: "recent-activity-card",
  fetchPage: (q) =>
    apiThreadsLoader(`/schedule/${encodeURIComponent(scheduleThreadsJobId ?? "")}/threads`)(q),
});

/** Load the threads (last message of each) a schedule job generated. */
export async function loadScheduleThreads(scheduleId: string): Promise<void> {
  if (scheduleThreadsJobId !== scheduleId) scheduleThreads.reset();
  scheduleThreadsJobId = scheduleId;
  await scheduleThreads.reload();
}

// ── Date formatting ──
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
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

// --- Schedule run outcome ---
// Action-mode runs return 202 + run_id immediately (the action can take
// minutes); the terminal outcome is recorded in schedule_runs and is polled
// here so the UI reports success/failure instead of hanging or staying silent.
export interface ScheduleRun {
  run_id: string;
  task_key: string;
  trigger: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  output: string | null;
  thread_id: number | null;
  error: string | null;
}

export interface FireOutcomeUi {
  runId: string | null;
  threadId: number | null;
  run: ScheduleRun | null;
  timedOut: boolean;
}

/**
 * Fire a schedule and wait for its recorded outcome.
 * Agentic schedules return a thread_id synchronously; action schedules return
 * 202 + run_id and are polled until the run record reaches a terminal status.
 */
export async function fireScheduleRun(
  scheduleId: string,
  force: boolean,
  timeoutMs = 10 * 60 * 1000,
): Promise<FireOutcomeUi> {
  const res = await fetch(
    `/api/schedule/${encodeURIComponent(scheduleId)}/run${force ? "?force=true" : ""}`,
    { method: "POST", headers: { "Content-Type": "application/json" } },
  );
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  // Unwrap the {"success":true,"data":...} envelope: reading run_id/thread_id
  // off the raw body yielded undefined (same bug class as the Activity list).
  const data = unwrapEnvelope<{ run_id?: string; thread_id?: number }>(await res.json());
  const runId: string | null = data.run_id ?? null;
  const threadId: number | null = data.thread_id ?? null;
  if (!runId) return { runId: null, threadId, run: null, timedOut: false };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const runs = await apiGet<{ rows: ScheduleRun[] }>(
      `/schedule/${encodeURIComponent(scheduleId)}/runs?limit=10`,
    ).catch(() => null);
    const run = runs?.rows?.find((r) => r.run_id === runId) ?? null;
    if (run && run.status !== "running") {
      return { runId, threadId: run.thread_id ?? threadId, run, timedOut: false };
    }
  }
  return { runId, threadId, run: null, timedOut: true };
}

/** Toast text + severity for a fired run. */
export function runOutcomeMessage(o: FireOutcomeUi): { text: string; isError: boolean } {
  const where = o.threadId != null ? ` - thread #${o.threadId}` : "";
  if (o.run) {
    if (o.run.status === "success") {
      return { text: `Run succeeded (exit ${o.run.exit_code ?? 0})${where}`, isError: false };
    }
    const detail = o.run.error ? `: ${o.run.error.split("\n")[0].slice(0, 160)}` : "";
    return { text: `Run FAILED (exit ${o.run.exit_code ?? 1})${detail}${where}`, isError: true };
  }
  if (o.timedOut && o.runId) {
    return { text: `Run ${o.runId} still running - check run history`, isError: false };
  }
  return {
    text: o.threadId != null ? `Job fired: thread #${o.threadId}` : "Job fired (no thread created)",
    isError: false,
  };
}

// ── Load schedule detail ──
export async function loadScheduleDetail(cronId: string): Promise<any> {
  const el = document.getElementById("schedule-detail")!;
  try {
    const job = await apiGet<any>("/schedule/" + encodeURIComponent(cronId));
    const detailEl = document.getElementById("detail-subtitle");
    if (detailEl)
      detailEl.innerHTML = `Job: <span class="emphasized-title emphasized-title--compact">${escapeHtml(job.name || job.id)}</span>`;

    el.innerHTML = `
      <div class="detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Name</div>
            <div style="color:var(--text-primary);font-weight:500;">${escapeHtml(job.name || job.id)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Schedule</div>
            <code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:4px;font-size:0.8rem;color:var(--accent-cyan);">${escapeHtml(job.cron)}</code>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Mode</div>
            <div style="color:var(--text-primary);">${job.mode ? escapeHtml(job.mode) : "-"}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Toolset</div>
            <div style="color:var(--text-primary);">${job.toolset ? escapeHtml(String(job.toolset)) : "- (All tools allowed)"}</div>
          </div>
          ${
            job.mode === "action"
              ? `
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Silent</div>
            <div><span class="badge ${job.silent ? "badge-warning" : "badge-neutral"}">${job.silent ? "Silent (thread only on error)" : "Not silent"}</span></div>
          </div>`
              : ""
          }
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Status</div>
            <div>
              <span class="badge ${job.active ? "badge-success" : "badge-neutral"}">${job.active ? "Active" : "Inactive"}</span>
            </div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Channel</div>
            <div style="color:var(--text-primary);">${job.channel ? escapeHtml(String(job.channel)) : "-"}</div>
          </div>
        </div>
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Profile</div>
            <div style="color:var(--text-primary);">${job.profile ? escapeHtml(job.profile) : "-"}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Last Run</div>
            <div style="color:var(--text-primary);">${formatDate(job.last_run_at ?? job.last_run)}</div>
            ${
              job.mode === "action" && job.last_run_status
                ? `<div style="margin-top:0.25rem;"><span style="display:inline-block;padding:0.05rem 0.4rem;border-radius:4px;font-size:0.7rem;${
                    job.last_run_status === "success"
                      ? "background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;"
                      : job.last_run_status === "running"
                        ? "background:rgba(148,163,184,0.15);border:1px solid rgba(148,163,184,0.3);color:#94a3b8;"
                        : "background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);color:#ef4444;"
                  }">${escapeHtml(String(job.last_run_status))}${job.last_run_exit_code != null ? ` (exit ${job.last_run_exit_code})` : ""}</span></div>`
                : ""
            }
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
            <div style="color:var(--accent-cyan);font-weight:500;">${escapeHtml(job.action_name || job.action_id || "-")}</div>
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
        <div style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:var(--radius-sm);padding:0.75rem;font-size:0.9rem;color:var(--accent-cyan);font-weight:500;">${escapeHtml(job.action_name || job.action_id || "")}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">This job runs without an agent: the scheduler executes the action directly.</div>
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
    el.innerHTML = `<div class="error-state">Failed to load job details: ${formatApiError(e)}</div>`;
    return null;
  }
}

// ── Create/Edit Modal ──
export async function showCronModal(
  job: Record<string, unknown> | null,
  onReload: () => void,
): Promise<void> {
  const isEdit = job !== null;

  // Fetch available data (cached from page-load prefetch, so the modal opens
  // instantly; the old code awaited 5 sequential fetches before showing).
  let channels: { id: string; name: string; platform: string }[] = [];
  let profiles: { name: string }[] = [];
  let existingJobs: Record<string, unknown>[] = [];
  let actions: { id: string; name: string; tool_name: string; is_builtin: boolean }[] = [];
  let templates: { profile: string; name: string; label: string }[] = [];
  let toolsets: string[] = [];
  try {
    const [ch, pr, jobs, ac, tm, ts] = await Promise.all([
      cachedGet("/channels"),
      cachedGet("/profiles"),
      cachedGet("/schedule?active=false"),
      cachedGet("/actions"),
      cachedGet("/templates"),
      cachedGet("/api/toolsets"),
    ]);
    channels = ch as { id: string; name: string; platform: string }[];
    profiles = pr as { name: string }[];
    existingJobs = jobs as Record<string, unknown>[];
    actions = ac as { id: string; name: string; tool_name: string; is_builtin: boolean }[];
    templates = tm as { profile: string; name: string; label: string }[];
    toolsets = Object.keys((ts as { toolsets?: Record<string, string[]> })?.toolsets ?? {}).sort();
  } catch {
    /* ok */
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
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Name <span style="color:var(--accent-rose);">*</span></label>
          <input id="cron-name" type="text" class="filter-input" value="${isEdit ? escapeHtml((job as any).name || (job as any).id || "") : ""}" style="width:100%;" />
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">The name is the job's identifier in the schedule section. Renaming an existing job re-keys it.</div>
        </div>
        <div style="margin-bottom:1rem;">
          <div style="display:flex;align-items:center;gap:0.375rem;margin-bottom:0.375rem;">
            <label style="font-size:0.8rem;color:var(--text-muted);">Schedule (cron expression)</label>
            <button id="cron-help-btn" type="button" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.7rem;padding:0;line-height:1;width:14px;height:14px;border-radius:50%;border:1px solid var(--text-muted);display:inline-flex;align-items:center;justify-content:center;" title="Cron format help">?</button>
          </div>
          <input id="cron-schedule" type="text" class="filter-input" value="${isEdit ? escapeHtml((job as any).cron) : "0 0 * * *"}" style="width:100%;font-family:monospace;" />
          <div id="cron-help-box" style="display:none;margin-top:0.5rem;padding:0.75rem;background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:6px;font-size:0.78rem;color:var(--text-secondary);line-height:1.6;">
            <div style="margin-bottom:0.5rem;padding:0.375rem 0.5rem;background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.25);border-radius:4px;color:var(--accent-purple);font-size:0.75rem;">
              ⚡ <strong>5-field format (no seconds field)</strong>: the system auto-prepends <code style="background:rgba(0,0,0,0.2);padding:0.125rem 0.25rem;border-radius:3px;">0</code> (second=0) internally. Do <em>not</em> include a seconds field.
            </div>
            <div style="margin-bottom:0.5rem;"><strong style="color:var(--text-primary);">Fields:</strong> <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">min hour dom month dow</code></div>
            <div style="margin-top:0.5rem;"><strong style="color:var(--text-primary);">Special:</strong> <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">*</code> = any, <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">*/N</code> = every N, <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">,</code> = list, <code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">-</code> = range</div>
            <div style="margin-top:0.5rem;"><strong style="color:var(--text-primary);">Examples:</strong></div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">* * * * *</code>: every minute</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">*/10 * * * *</code>: every 10 minutes</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 * * * *</code>: every hour at :00</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 0 * * *</code>: daily at midnight</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">30 6 * * *</code>: daily at 06:30</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 9 * * 1-5</code>: weekdays at 09:00</div>
            <div><code style="color:var(--accent-cyan);background:rgba(0,0,0,0.2);padding:0.125rem 0.375rem;border-radius:3px;">0 0 1 * *</code>: 1st of every month at midnight</div>
          </div>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Channel</label>
          <select id="cron-channel" class="filter-select" style="width:100%;">
            <option value="">- (Default cron channel)</option>
            ${channels.map((ch: { id: string; name: string; platform: string }) => `<option value="${ch.id}" ${isEdit && job.channel === ch.id ? "selected" : ""}>${escapeHtml(ch.name)} (${escapeHtml(ch.platform || "")})</option>`).join("")}
          </select>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Profile</label>
          <select id="cron-profile" class="filter-select" style="width:100%;">
            <option value="">- (Default)</option>
            ${profiles.map((p: { name: string }) => `<option value="${escapeHtml(p.name)}" ${isEdit && job.profile === p.name ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Planning Mode</label>
          <select id="cron-plan" class="filter-select" style="width:100%;">
            <option value="">- (Default)</option>
            <option value="true" ${isEdit && job.plan === true ? "selected" : ""}>On</option>
            <option value="false" ${isEdit && job.plan === false ? "selected" : ""}>Off</option>
          </select>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Template</label>
          <select id="cron-instruction-file" class="filter-select" style="width:100%;">
            <option value="">- (None)</option>
            ${templates.map((t: { name: string; profile: string }) => `<option value="${escapeHtml(t.name)}" ${isEdit && job.template === t.name ? "selected" : ""}>${escapeHtml(t.name)} (${escapeHtml(t.profile)})</option>`).join("")}
          </select>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Template file to inject into the agent's prompt when this job runs.</div>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Toolset</label>
          <select id="cron-toolset" class="filter-select" style="width:100%;">
            <option value="">None (All tools allowed)</option>
            ${toolsets.map((t: string) => `<option value="${escapeHtml(t)}" ${isEdit && job.toolset === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
          </select>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">First match wins: workflow role &gt; workflow &gt; task &gt; channel &gt; profile. Defined in config/toolsets.yml.</div>
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
              .map((a: Record<string, any>) => {
                const displayName =
                  a.is_builtin && a.name.startsWith("builtin_")
                    ? `actions:${a.name.replace(/^builtin_/, "")}`
                    : a.name;
                return `<option value="${escapeHtml(a.id)}" ${isEdit && job.action_id === a.id ? "selected" : ""}>${escapeHtml(displayName)}</option>`;
              })
              .join("")}
          </select>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Action mode runs this action without an agent.</div>
        </div>
        <div id="cron-silent-section" style="display:${isEdit && job.mode === "action" ? "block" : "none"};margin-bottom:1rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
            <input id="cron-silent" type="checkbox" ${isEdit && job.silent ? "checked" : ""} />
            <span style="font-size:0.85rem;color:var(--text-primary);">Silent (only create thread on error)</span>
          </label>
        </div>
        <div id="cron-agentic-section" style="display:${isEdit ? (job.mode === "agentic" ? "block" : "none") : "block"};margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Prompt</label>
          <textarea id="cron-prompt" class="filter-input" style="width:100%;min-height:80px;resize:vertical;font-family:monospace;font-size:0.8rem;">${isEdit && (job as any).prompt ? escapeHtml((job as any).prompt) : ""}</textarea>
        </div>
        <div style="margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
          <input id="cron-active" type="checkbox" ${isEdit ? (job.active ? "checked" : "") : ""} />
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

  // Enhance selects
  enhanceSelectElement(document.getElementById("cron-channel") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-profile") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-instruction-file") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-toolset") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-mode") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-action") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-plan") as HTMLSelectElement);
  fixMissingSelectOptions(modal);

  // Wire mode selector
  const modeSelect = modal.querySelector("#cron-mode") as HTMLSelectElement;
  const actionSection = modal.querySelector("#cron-action-section") as HTMLElement;
  const agenticSection = modal.querySelector("#cron-agentic-section") as HTMLElement;
  modeSelect.addEventListener("change", () => {
    const isAction = modeSelect.value === "action";
    actionSection.style.display = isAction ? "block" : "none";
    agenticSection.style.display = isAction ? "none" : "block";
    const silentSection = document.getElementById("cron-silent-section");
    if (silentSection) silentSection.style.display = isAction ? "block" : "none";
  });

  // Close handlers
  modal.querySelector("#modal-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#modal-cancel")?.addEventListener("click", () => modal.remove());

  // Save handler
  modal.querySelector("#modal-save")?.addEventListener("click", async () => {
    const name = (modal.querySelector("#cron-name") as HTMLInputElement).value.trim();
    const schedule = (modal.querySelector("#cron-schedule") as HTMLInputElement).value.trim();
    const channelVal = (modal.querySelector("#cron-channel") as HTMLSelectElement).value;
    const profile = (modal.querySelector("#cron-profile") as HTMLSelectElement).value;
    const planVal = (modal.querySelector("#cron-plan") as HTMLSelectElement).value;
    const mode = (modal.querySelector("#cron-mode") as HTMLSelectElement).value;
    const action_id = (modal.querySelector("#cron-action") as HTMLSelectElement).value;
    const prompt = (modal.querySelector("#cron-prompt") as HTMLTextAreaElement).value.trim();
    const active = (modal.querySelector("#cron-active") as HTMLInputElement).checked;
    const silent = (document.getElementById("cron-silent") as HTMLInputElement).checked;
    const template = (modal.querySelector("#cron-instruction-file") as HTMLSelectElement).value;
    const toolset = (modal.querySelector("#cron-toolset") as HTMLSelectElement).value;
    const channel = channelVal || null;

    if (!name) {
      showToast("Name is required", "error");
      return;
    }
    let nameVal: string;
    if (isEdit) {
      nameVal = name;
    } else {
      nameVal = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (!nameVal) nameVal = "unnamed";
      if (existingJobs.some((j: Record<string, unknown>) => j.id === nameVal || j.name === nameVal)) {
        nameVal = nameVal + "-" + Date.now();
      }
    }
    if (!schedule) {
      showToast("Schedule is required", "error");
      return;
    }

    // Client-side 5-field cron validation
    const cronFields = schedule.trim().split(/\s+/);
    if (cronFields.length !== 5) {
      showToast(
        `Invalid cron expression: expected 5 fields (min hour dom month dow), got ${cronFields.length}. Use 5-field Linux format, e.g. '0 9 * * 1-5' for weekdays at 9am.`,
        "error",
      );
      return;
    }

    try {
      const body: Record<string, unknown> = {
        name: nameVal,
        schedule,
        prompt,
        active,
        channel,
        profile,
        mode,
        silent,
        template: template || null,
        toolset: toolset || null,
      };
      if (planVal !== undefined && planVal !== "") {
        body.plan = planVal === "true";
      }
      if (mode === "action") body.action_id = action_id || null;

      let res: Response;
      if (isEdit) {
        res = await fetch(`/api/schedule/${encodeURIComponent((job as any).id)}`, {
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
      showToast(isEdit ? "Schedule updated" : "Schedule created", "success");
      modal.remove();
      onReload();
    } catch (e) {
      showToast("Failed: " + formatApiError(e), "error");
    }
  });
}

// ── Schedule detail page export ──
export async function renderScheduleDetail(container: HTMLElement, cronId: string): Promise<void> {
  scheduleThreads.reset();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule Details</h1>
        <p class="page-subtitle" id="detail-subtitle">Job: ${escapeHtml(cronId)}</p>
      </div>
      <div id="detail-action-buttons" style="display:flex;gap:0.5rem;">
        <button id="detail-run-btn" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:var(--accent-green,#10b981);border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.78rem;line-height:1.4;font-weight:500;">▶ Run</button>
        <button id="detail-toggle-active" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.78rem;line-height:1.4;font-weight:500;color:var(--text-secondary);">N/A</button>
        <button id="detail-delete-btn" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);color:var(--accent-rose,#fb7185);border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.78rem;line-height:1.4;font-weight:500;">Delete</button>
        <button id="detail-edit-btn" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);color:var(--accent-purple);border-radius:4px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.78rem;line-height:1.4;font-weight:500;">Edit</button>
        <a href="/schedules" class="back-link" id="back-to-schedule" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);color:var(--accent-cyan);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.85rem;text-decoration:none;">← Back to Schedules</a>
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
        <span class="card-title">Activity</span>
        <span class="events-nav" id="schedule-threads-nav">
          <button class="nav-btn" id="schedule-threads-prev-page" disabled>← Prev</button>
          <span id="schedule-threads-page-info">Page 1</span>
          <button class="nav-btn" id="schedule-threads-next-page" disabled>Next →</button>
          <button class="nav-btn order-btn" id="schedule-threads-order-btn"><span class="arrow">↓</span> Recent</button>
        </span>
      </div>
      <div class="card-body" id="schedule-threads">
        <div class="loading">Loading activity...</div>
      </div>
      <div class="card-footer" id="schedule-threads-bottom-nav" style="padding:0.75rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <span class="events-count" id="schedule-threads-count"></span>
        <span class="events-nav">
          <button class="nav-btn" id="schedule-threads-prev-page-bottom" disabled>← Prev</button>
          <span id="schedule-threads-page-info-bottom">Page 1</span>
          <button class="nav-btn" id="schedule-threads-next-page-bottom" disabled>Next →</button>
          <button class="nav-btn order-btn" id="schedule-threads-order-btn-bottom"><span class="arrow">↓</span> Recent</button>
        </span>
      </div>
    </div>
  `;

  document.getElementById("back-to-schedule")?.addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState({}, "", "/schedules");
    router.go("schedules");
  });

  const job = await loadScheduleDetail(cronId);

  // Update the toggle button text once we know the job state
  const toggleBtn = document.getElementById("detail-toggle-active") as HTMLButtonElement | null;
  if (toggleBtn && job) {
    toggleBtn.textContent = job.active ? "Deactivate" : "Activate";
  }

  // ── Run button ──
  document.getElementById("detail-run-btn")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const runBtn = e.currentTarget as HTMLButtonElement;
    if (!job) return;
    const originalText = runBtn.textContent;
    runBtn.disabled = true;
    runBtn.textContent = "Running...";

    const inactive = !job.active;
    if (inactive) {
      const jobName = job.name || job.id || cronId;
      if (!confirm(`Job "${jobName}" is inactive. Run anyway?`)) {
        runBtn.disabled = false;
        runBtn.textContent = originalText;
        return;
      }
    }

    try {
      const outcome = await fireScheduleRun(job.id, inactive);
      const msg = runOutcomeMessage(outcome);
      showToast(msg.text, msg.isError ? "error" : "success");
      // Refresh so the recorded run status + exit code show up immediately.
      const fresh = await loadScheduleDetail(cronId);
      if (fresh) void loadScheduleThreads(fresh.id);
    } catch (err) {
      showToast("Failed: " + (err instanceof Error ? err.message : "Unknown"), "error");
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = originalText;
    }
  });

  // ── Activate / Deactivate button ──
  document.getElementById("detail-toggle-active")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!job) return;
    const btn = e.currentTarget as HTMLButtonElement;
    const isActive = btn.textContent === "Activate";
    try {
      const res = await fetch(`/api/schedule/${encodeURIComponent(job.id)}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: isActive }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(isActive ? "Activated" : "Deactivated", "success");
      // Re-render the detail page with fresh data
      const freshJob = await loadScheduleDetail(cronId);
      if (freshJob) {
        btn.textContent = freshJob.active ? "Deactivate" : "Activate";
        void loadScheduleThreads(freshJob.id);
      }
    } catch (err) {
      showToast("Failed: " + (err instanceof Error ? err.message : "Unknown"), "error");
    }
  });

  // ── Delete button (confirm, then DELETE /api/schedule/{id} which removes
  // the entry from tasks.yml on the core and hot-reloads it) ──
  document.getElementById("detail-delete-btn")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const jobName = (job && (job.name || job.id)) || cronId;
    if (!confirm(`Delete schedule "${jobName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/schedule/${encodeURIComponent((job && job.id) || cronId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("Schedule deleted", "success");
      history.pushState({}, "", "/schedules");
      router.go("schedules");
    } catch (err) {
      showToast("Failed: " + (err instanceof Error ? err.message : "Unknown"), "error");
    }
  });

  document.getElementById("detail-edit-btn")?.addEventListener("click", () =>
    showCronModal(job, () => {
      /* no-op on detail page */
    }),
  );

  if (job) {
    void loadScheduleThreads(job.id);
  }
}
