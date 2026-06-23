/**
 * Kanban detail view overlay — task details, edit modal, threads.
 * Extracted from src/pages/kanban.ts
 */
import { apiGet } from "./api";
import { STATUS_LABELS, statusBadge, formatTaskDate, moveTask } from "./kanban-board";
import { loadKanbanSubtasks } from "./kanban-subtasks";

// ── Helper imports ──
import { escapeHtml } from "./helpers";
import { enhanceSelect, syncSelectDisplay } from "./dropdown";

/**
 * Styled status badge for thread status in kanban task detail.
 */
function taskStatusBadgeStyle(status: string): string {
  const s = status.toLowerCase();
  const color =
    s === "completed"
      ? "#10b981"
      : s === "failed"
        ? "#f43f5e"
        : s === "processing"
          ? "#f59e0b"
          : s === "pending"
            ? "#3b82f6"
            : s === "skipped"
              ? "#64748b"
              : s === "interrupted"
                ? "#8b5cf6"
                : "#64748b";
  return `--type-color:${color};background:${color}22;border-color:${color}44;color:${color}`;
}

// ── Thread loading ──
async function loadKanbanThreads(taskId: string): Promise<void> {
  const el = document.getElementById("kanban-threads");
  if (!el) return;
  try {
    const res = await fetch(`/api/kanban/tasks/${encodeURIComponent(taskId)}/threads`);
    if (!res.ok) throw new Error("Failed to load threads");
    const data = await res.json();
    if (!data.rows || data.rows.length === 0) {
      el.innerHTML =
        '<div style="color:var(--text-muted);font-size:0.8rem;">No threads created by this task.</div>';
      return;
    }
    const threadsHtml = data.rows
      .map(
        (t: any) => `
      <div style="display:flex;align-items:center;gap:0.5rem;padding:0.375rem 0;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));font-size:0.8rem;">
        <span class="badge" style="${taskStatusBadgeStyle(t.status)}">${escapeHtml(t.status)}</span>
        <a href="/messages?thread_id=${encodeURIComponent(t.id)}" class="kanban-thread-link" style="color:var(--accent-cyan);text-decoration:none;flex:1;"
           data-route="messages" data-thread-id="${t.id}">
          ${escapeHtml(t.title || `Thread #${t.id}`)}
        </a>
        <span style="color:var(--text-muted);font-size:0.75rem;">${t.message_count || 0} msgs</span>
        <span style="color:var(--text-muted);font-size:0.75rem;">${formatTaskDate(t.created_at)}</span>
      </div>
    `,
      )
      .join("");
    el.innerHTML = threadsHtml;
    // Wire thread links
    el.querySelectorAll(".kanban-thread-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const route = a.getAttribute("data-route") || "messages";
        history.pushState({}, "", `/messages?thread_id=${a.getAttribute("data-thread-id")}`);
        void import("../lib/router").then(({ router }) => router.go(route));
      });
    });
  } catch {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Failed to load threads.</div>';
  }
}

// ── Channel / Profile population helpers ──

async function populateEditChannelSelect(currentChannelId: string): Promise<void> {
  const select = document.getElementById("task-edit-channel") as HTMLSelectElement;
  if (!select) return;
  try {
    const channels = await apiGet<any[]>("/channels");
    select.innerHTML = '<option value="">None</option>';
    for (const ch of channels) {
      const opt = document.createElement("option");
      opt.value = ch.id || ch.name || ch.channel_id || "";
      opt.textContent = ch.name || ch.id || "";
      if (opt.value === currentChannelId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    refreshEnhancedSelect("task-edit-channel");
  } catch (e) {
    console.error("Failed to load channels:", e);
    select.innerHTML = '<option value="">Error loading channels</option>';
  }
}

async function populateProfileSelect(selectId: string, currentProfile?: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  try {
    const profiles = await apiGet<any[]>("/profiles");
    select.innerHTML = '<option value="">None</option>';
    for (const p of profiles) {
      const name = typeof p === "string" ? p : p.name || "";
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (currentProfile && name === currentProfile) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch (e) {
    console.error("Failed to load profiles:", e);
    select.innerHTML = '<option value="">Error loading profiles</option>';
  }
}

async function populateTemplatesSelect(selectId: string, currentTemplate?: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  try {
    const templates = await apiGet<{ profile: string; name: string; label: string }[]>("/templates");
    select.innerHTML = '<option value="">None</option>';
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = `${t.label} (${t.profile})`;
      if (currentTemplate && t.name === currentTemplate) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch (e) {
    console.error("Failed to load templates:", e);
    select.innerHTML = '<option value="">Error loading templates</option>';
  }
}

function refreshEnhancedSelect(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  const wrapper = select.nextElementSibling as HTMLElement;
  if (wrapper && wrapper.classList.contains("custom-select")) {
    wrapper.remove();
  }
  (select as any).dataset._enhanced = "";
  select.style.display = "";
  enhanceSelect(selectId);
}

// ── Detail view ──

export async function loadTaskDetail(taskId: string): Promise<void> {
  const el = document.getElementById("task-detail-card")?.querySelector(".card-body");
  const subtitle = document.getElementById("task-detail-subtitle");
  if (!el) return;

  // Wire up delete button
  const deleteBtn = document.getElementById("task-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Delete this task?")) {
        try {
          await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), { method: "DELETE" });
          history.pushState({}, "", "/kanban");
          const { router } = await import("../lib/router");
          router.go("kanban");
        } catch (e) {
          alert("Failed to delete task: " + (e instanceof Error ? e.message : "Unknown error"));
        }
      }
    });
  }

  // Wire up archive button
  const archiveBtn = document.getElementById("task-archive-btn");
  if (archiveBtn) {
    archiveBtn.addEventListener("click", async () => {
      try {
        const isArchived = archiveBtn.textContent === "Unarchive";
        const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: !isArchived }),
        });
        if (!res.ok) throw new Error((await res.text()) || "Failed");
        void loadTaskDetail(taskId);
      } catch (e) {
        alert("Failed to archive/unarchive: " + (e instanceof Error ? e.message : "Unknown error"));
      }
    });
  }

  try {
    const task = await apiGet<any>("/kanban/tasks/" + encodeURIComponent(taskId));
    if (subtitle) subtitle.textContent = `Task: ${escapeHtml(task.title)}`;

    // Update archive button text
    if (archiveBtn) {
      archiveBtn.textContent = task.archived ? "Unarchive" : "Archive";
      archiveBtn.classList.toggle("archived", task.archived);
    }

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div class="detail-label">ID</div>
          <div><code>#${task.display_id || task.id}</code></div>
        </div>
        <div>
          <div class="detail-label">Status</div>
          <div><span class="badge ${statusBadge(task.status)}">${STATUS_LABELS[task.status] || task.status}</span></div>
        </div>
        <div>
          <div class="detail-label">Priority</div>
          <div><span class="badge ${task.priority >= 3 ? "badge-error" : task.priority >= 1 ? "badge-warning" : "badge-neutral"}">${task.priority} - ${task.priority >= 3 ? "High" : task.priority >= 1 ? "Med" : "Low"}</span></div>
        </div>
        <div>
          <div class="detail-label">Channel</div>
          <div>${task.channel_id ? escapeHtml(task.channel_id) : "<em>None</em>"}</div>
        </div>
        <div>
          <div class="detail-label">Profile</div>
          <div>${task.profile ? escapeHtml(task.profile) : "<em>None</em>"}</div>
        </div>
        <div>
          <div class="detail-label">Created</div>
          <div>${new Date(task.created_at).toLocaleString()}</div>
        </div>
        <div>
          <div class="detail-label">Updated</div>
          <div>${new Date(task.updated_at).toLocaleString()}</div>
        </div>
      </div>

      ${
        task.body
          ? `
        <div style="margin-top:1.5rem;">
          <div class="detail-label">Description</div>
          <div class="detail-body">${escapeHtml(task.body)}</div>
        </div>
      `
          : ""
      }

      <div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <div class="detail-label" style="margin-bottom:0.5rem;">Move to</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          ${Object.keys(STATUS_LABELS)
            .filter((s) => s !== task.status)
            .map(
              (s) =>
                `<button class="detail-move-btn" data-status="${s}" style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-primary);border-radius:6px;padding:0.35rem 0.6rem;cursor:pointer;font-size:0.75rem;transition:all 0.15s;">→ ${STATUS_LABELS[s]}</button>`,
            )
            .join("")}
        </div>
      </div>

      <div id="kanban-threads-section" style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <div class="detail-label" style="margin-bottom:0.5rem;">Threads</div>
        <div id="kanban-threads" style="font-size:0.85rem;color:var(--text-muted);">Loading threads...</div>
      </div>

      <div id="kanban-subtasks-section" style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <div class="detail-label" style="margin-bottom:0.5rem;">Subtasks</div>
        <div id="kanban-subtasks" style="font-size:0.85rem;color:var(--text-muted);">Loading subtasks...</div>
      </div>
    `;

    // Wire up detail move buttons
    el.querySelectorAll(".detail-move-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const status = (e.currentTarget as HTMLElement).getAttribute("data-status");
        if (!status) return;
        await moveTask(taskId, status);
        void loadTaskDetail(taskId);
      });
    });

    // Wire up Edit button
    const editBtn = document.getElementById("task-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", async () => {
        (document.getElementById("task-edit-title") as HTMLInputElement).value = task.title;
        (document.getElementById("task-edit-body") as HTMLTextAreaElement).value = task.body || "";
        (document.getElementById("task-edit-priority") as HTMLSelectElement).value = String(task.priority);
        (document.getElementById("task-edit-status") as HTMLSelectElement).value = task.status;
        syncSelectDisplay("task-edit-priority");
        syncSelectDisplay("task-edit-status");

        await populateEditChannelSelect(task.channel_id || "");
        await populateProfileSelect("task-edit-profile", task.profile || "");
        await populateTemplatesSelect("task-edit-template", task.template || "");

        const modal = document.getElementById("edit-task-modal");
        if (modal) modal.style.display = "flex";
      });
    }

    // Wire up edit modal cancel
    document.getElementById("task-edit-cancel")?.addEventListener("click", () => {
      const modal = document.getElementById("edit-task-modal");
      if (modal) modal.style.display = "none";
    });

    // Wire up edit modal submit
    document.getElementById("task-edit-submit")?.addEventListener("click", async () => {
      const title = (document.getElementById("task-edit-title") as HTMLInputElement)?.value.trim();
      if (!title) return;
      const body =
        (document.getElementById("task-edit-body") as HTMLTextAreaElement)?.value.trim() || undefined;
      const priority = parseInt(
        (document.getElementById("task-edit-priority") as HTMLSelectElement)?.value || "0",
      );
      const status = (document.getElementById("task-edit-status") as HTMLSelectElement)?.value || "backlog";
      const channel_id =
        (document.getElementById("task-edit-channel") as HTMLSelectElement)?.value || undefined;
      const profile = (document.getElementById("task-edit-profile") as HTMLSelectElement)?.value || undefined;
      const template =
        (document.getElementById("task-edit-template") as HTMLSelectElement)?.value || undefined;

      try {
        const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, priority, status, channel_id, profile, template }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "Unknown error");
          throw new Error(`${res.status}: ${text}`);
        }
        const modal = document.getElementById("edit-task-modal");
        if (modal) modal.style.display = "none";
        void loadTaskDetail(taskId);
      } catch (e) {
        alert("Failed to update task: " + (e instanceof Error ? e.message : "Unknown error"));
      }
    });

    // Load threads and subtasks
    void loadKanbanThreads(taskId);
    void loadKanbanSubtasks(taskId);
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load task: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

/**
 * Render the kanban detail page.
 */
export function renderKanbanDetail(container: HTMLElement, taskId: string): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Task Detail</h1>
        <p class="page-subtitle" id="task-detail-subtitle">Loading...</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button id="task-edit-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.75rem;font-weight:500;">Edit</button>
        <button id="task-archive-btn" style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.75rem;font-weight:500;">Archive</button>
        <button id="task-delete-btn" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);color:var(--accent-rose);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.75rem;font-weight:500;">Delete</button>
        <a href="/kanban" class="back-link" id="back-to-kanban">← Back to Board</a>
      </div>
    </div>
    <div class="card" id="task-detail-card">
      <div class="card-body">
        <div class="loading">Loading task</div>
      </div>
    </div>
    <!-- Edit Task Modal -->
    <div id="edit-task-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh;">
      <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:500px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">Edit Task</h2>
        <div style="display:grid;gap:0.75rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Title *</label>
            <input type="text" id="task-edit-title" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Body</label>
            <textarea id="task-edit-body" rows="3" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;resize:vertical;box-sizing:border-box;"></textarea>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Priority</label>
            <select id="task-edit-priority" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="0">Low</option>
              <option value="1">Med</option>
              <option value="3">High</option>
              <option value="5">Critical</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Status</label>
            <select id="task-edit-status" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="backlog">Backlog</option>
              <option value="todo">Todo</option>
              <option value="ready">Ready</option>
              <option value="running">In Progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Channel</label>
            <select id="task-edit-channel" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">Loading...</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Profile</label>
            <select id="task-edit-profile" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">None</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Template</label>
            <select id="task-edit-template" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">None</option>
            </select>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">Structured guidance injected into the agent's prompt when this task runs.</div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
          <button id="task-edit-cancel" style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="task-edit-submit" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Save</button>
        </div>
      </div>
    </div>
  `;

  const backLink = document.getElementById("back-to-kanban");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({}, "", "/kanban");
      void import("../lib/router").then(({ router }) => router.go("kanban"));
    });
  }

  void loadTaskDetail(taskId);
  enhanceSelect("task-edit-priority");
  enhanceSelect("task-edit-status");
}
