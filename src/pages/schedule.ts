import { apiGet } from "../lib/api";
import { router } from "../lib/router";

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

// ── Modal state ──

// ── Load jobs ──

let _activeOnly = true;

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
                <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.8rem;">${j.mode === "direct" && j.direct_task_type ? `<span style="color:var(--accent-cyan);font-weight:500;">${escapeHtml(j.direct_task_type)}</span>` : escapeHtml(j.prompt_preview || "")}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);">${j.channel_id ? `#${j.channel_id}` : "—"}</td>
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
                  <a href="/schedule/${encodeURIComponent(j.id)}" class="btn-view" style="color:var(--accent-cyan);font-size:0.75rem;margin-left:0.375rem;text-decoration:none;">Details</a>
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
  // Edit buttons
  document.querySelectorAll(".cron-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest("tr") as HTMLElement;
      const cronId = row?.getAttribute("data-cron-id");
      if (!cronId) return;
      const job = await apiGet<any>("/schedule/" + encodeURIComponent(cronId));
      showCronModal(job);
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
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule Details</h1>
        <p class="page-subtitle" id="detail-subtitle">Job: ${escapeHtml(cronId)}</p>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button id="detail-edit-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Edit</button>
        <a href="/schedule" class="back-link" id="back-to-schedule" style="color:var(--accent-cyan);font-size:0.85rem;padding:0.375rem 0;text-decoration:none;">← Back to Schedules</a>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Job Info</span></div>
      <div class="card-body" id="schedule-detail">
        <div class="loading">Loading job details</div>
      </div>
    </div>
  `;

  document.getElementById("back-to-schedule")?.addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState({}, "", "/schedule");
    router.go("schedule");
  });

  // Load and wire
  const job = await loadScheduleDetail(cronId);
  document.getElementById("detail-edit-btn")?.addEventListener("click", () => showCronModal(job));
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
            <div style="color:var(--text-primary);">${job.channel_id ? `#${job.channel_id}` : "—"}</div>
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
            job.mode === "direct"
              ? `
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Direct Task Type</div>
            <div style="color:var(--accent-cyan);font-weight:500;">${escapeHtml(job.direct_task_type || "—")}</div>
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
        job.mode === "direct" && job.direct_task_type
          ? `
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-primary);">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Direct Task</div>
        <div style="background:rgba(0,0,0,0.3);border:1px solid var(--glass-border);border-radius:var(--radius-sm);padding:0.75rem;font-size:0.9rem;color:var(--accent-cyan);font-weight:500;">${escapeHtml(job.direct_task_type)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">This job runs without an agent — the scheduler executes the task type directly.</div>
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

  // Fetch available channels, profiles, and direct task types
  let channels: any[] = [];
  let profiles: any[] = [];
  let directTaskTypes: { value: string; label: string }[] = [];
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
    directTaskTypes = await apiGet<any[]>("../api/schedule/direct-task-types");
  } catch {
    /* direct task types may not be available */
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
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Name</label>
          <input id="cron-name" type="text" class="filter-input" value="${isEdit ? escapeHtml(job.name || "") : ""}" style="width:100%;" ${isEdit ? "readonly" : ""} />
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Display Name</label>
          <input id="cron-display" type="text" class="filter-input" value="${isEdit ? escapeHtml(job.display_name || job.name || "") : ""}" style="width:100%;" />
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Schedule (cron expression)</label>
          <input id="cron-schedule" type="text" class="filter-input" value="${isEdit ? escapeHtml(job.schedule) : "every 10m"}" style="width:100%;font-family:monospace;" />
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Channel</label>
          <select id="cron-channel" class="filter-select" style="width:100%;">
            <option value="">Default cron channel</option>
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
            <option value="">Default</option>
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
            <option value="direct" ${isEdit && job.mode === "direct" ? "selected" : ""}>Direct</option>
          </select>
        </div>
        <div id="cron-direct-section" style="display:${isEdit ? (job.mode === "direct" ? "block" : "none") : "none"};margin-bottom:1rem;">
          <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.375rem;">Direct Task Type</label>
          <select id="cron-task-type" class="filter-select" style="width:100%;">
            <option value="">Select task type...</option>
            ${directTaskTypes
              .map(
                (t: any) =>
                  `<option value="${escapeHtml(t.value)}" ${isEdit && job.direct_task_type === t.value ? "selected" : ""}>${escapeHtml(t.label)}</option>`,
              )
              .join("")}
          </select>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Direct mode runs this task type without an agent — no prompt needed.</div>
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

  // Enhance selects with custom floating dropdown (matching other pages)
  enhanceSelectElement(document.getElementById("cron-channel") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-profile") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-mode") as HTMLSelectElement);
  enhanceSelectElement(document.getElementById("cron-task-type") as HTMLSelectElement);

  // Wire mode selector to show/hide direct vs agentic sections
  const modeSelect = modal.querySelector("#cron-mode") as HTMLSelectElement;
  const directSection = modal.querySelector("#cron-direct-section") as HTMLElement;
  const agenticSection = modal.querySelector("#cron-agentic-section") as HTMLElement;
  modeSelect.addEventListener("change", () => {
    const isDirect = modeSelect.value === "direct";
    directSection.style.display = isDirect ? "block" : "none";
    agenticSection.style.display = isDirect ? "none" : "block";
  });

  // Close handlers
  modal.querySelector("#modal-close")?.addEventListener("click", () => modal.remove());
  modal.querySelector("#modal-cancel")?.addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });

  // Save handler
  modal.querySelector("#modal-save")?.addEventListener("click", async () => {
    const name = (modal.querySelector("#cron-name") as HTMLInputElement).value.trim();
    const display_name = (modal.querySelector("#cron-display") as HTMLInputElement).value.trim();
    const schedule = (modal.querySelector("#cron-schedule") as HTMLInputElement).value.trim();
    const channelVal = (modal.querySelector("#cron-channel") as HTMLSelectElement).value;
    const profile = (modal.querySelector("#cron-profile") as HTMLSelectElement).value;
    const mode = (modal.querySelector("#cron-mode") as HTMLSelectElement).value;
    const direct_task_type = (modal.querySelector("#cron-task-type") as HTMLSelectElement).value;
    const prompt = (modal.querySelector("#cron-prompt") as HTMLTextAreaElement).value.trim();
    const active = (modal.querySelector("#cron-active") as HTMLInputElement).checked;
    const channel_id = channelVal ? parseInt(channelVal, 10) : null;

    if (!name) {
      (window as any).showToast?.("Name is required", "error");
      return;
    }
    if (!schedule) {
      (window as any).showToast?.("Schedule is required", "error");
      return;
    }

    try {
      const body: any = { name, display_name, schedule, prompt, active, channel_id, profile, mode };
      if (mode === "direct") body.direct_task_type = direct_task_type || null;

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

// ── Floating dropdown helpers (matches other pages) ──
// Options are appended to document.body to escape backdrop-filter stacking contexts.

let _openFloatingDropdown: HTMLElement | null = null;

function closeFloatingDropdown(): void {
  if (_openFloatingDropdown) {
    _openFloatingDropdown.remove();
    _openFloatingDropdown = null;
  }
}

function enhanceSelectElement(select: HTMLSelectElement): void {
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

    closeFloatingDropdown();

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

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
