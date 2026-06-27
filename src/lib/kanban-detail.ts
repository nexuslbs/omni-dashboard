/**
 * Kanban detail view overlay — task details, edit modal, threads.
 * Extracted from src/pages/kanban.ts
 */
import { apiGet } from "./api";
import { STATUS_LABELS, statusBadge, moveTask } from "./kanban-board";
// ── Helper imports ──
import { escapeHtml } from "./helpers";
import { enhanceSelect, syncSelectDisplay } from "./dropdown";
import { renderMessageCard, wireMessageCardToggles } from "./message-card";
import { router } from "./router";

// ── Pagination state for kanban activity ──
let kanbanActivityOffset = 0;
const kanbanActivityLimit = 10;
let kanbanActivityOrder: "desc" | "asc" = "desc";

async function loadKanbanActivity(taskId: string): Promise<void> {
  const el = document.getElementById("kanban-threads");
  if (!el) return;
  try {
    const res = await fetch(
      `/api/kanban/tasks/${encodeURIComponent(taskId)}/threads?offset=${kanbanActivityOffset}&limit=${kanbanActivityLimit}&order=${kanbanActivityOrder}`,
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
    wireMessageCardToggles(el);

    // Wire thread links
    el.querySelectorAll(".ev-thread-link").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const threadId = (e.currentTarget as HTMLElement).getAttribute("data-thread-id");
        if (!threadId) return;
        const url = `/messages?thread_id=${encodeURIComponent(threadId)}`;
        history.pushState({}, "", url);
        router.go("messages");
      });
    });

    // Update pagination
    const currentPage = Math.floor(kanbanActivityOffset / kanbanActivityLimit) + 1;
    const pageInfo = document.getElementById("kanban-threads-page-info");
    const prevBtn = document.getElementById("kanban-threads-prev-page") as HTMLButtonElement;
    const nextBtn = document.getElementById("kanban-threads-next-page") as HTMLButtonElement;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} (${total} total)`;
    if (prevBtn) prevBtn.disabled = kanbanActivityOffset <= 0;
    if (nextBtn) nextBtn.disabled = kanbanActivityOffset + kanbanActivityLimit >= total;

    // Update order button text
    const orderBtn = document.getElementById("kanban-threads-order-btn");
    const orderBtnBottom = document.getElementById("kanban-threads-order-btn-bottom");
    const arrowChar = kanbanActivityOrder === "desc" ? "↓" : "↑";
    if (orderBtn) orderBtn.querySelector(".arrow")!.textContent = arrowChar;
    if (orderBtnBottom) orderBtnBottom.querySelector(".arrow")!.textContent = arrowChar;

    // Wire pagination buttons (clone to remove old listeners)
    const prevClone = prevBtn?.cloneNode(true) as HTMLButtonElement;
    const nextClone = nextBtn?.cloneNode(true) as HTMLButtonElement;
    if (prevBtn && prevBtn.parentNode) {
      prevBtn.parentNode.replaceChild(prevClone, prevBtn);
      prevClone.addEventListener("click", () => {
        kanbanActivityOffset = Math.max(0, kanbanActivityOffset - kanbanActivityLimit);
        void loadKanbanActivity(taskId);
      });
    }
    if (nextBtn && nextBtn.parentNode) {
      nextBtn.parentNode.replaceChild(nextClone, nextBtn);
      nextClone.addEventListener("click", () => {
        kanbanActivityOffset += kanbanActivityLimit;
        void loadKanbanActivity(taskId);
      });
    }

    // Bottom pagination
    const prevBottom = document.getElementById("kanban-threads-prev-page-bottom") as HTMLButtonElement;
    const nextBottom = document.getElementById("kanban-threads-next-page-bottom") as HTMLButtonElement;
    const pageInfoBottom = document.getElementById("kanban-threads-page-info-bottom");
    const countEl = document.getElementById("kanban-threads-count");
    if (countEl) {
      const start = total > 0 ? kanbanActivityOffset + 1 : 0;
      const end = Math.min(kanbanActivityOffset + rows.length, total);
      countEl.textContent = total > 0 ? `Showing ${start}–${end} of ${total}` : "No activity found";
    }
    if (pageInfoBottom) pageInfoBottom.textContent = `Page ${currentPage} (${total} total)`;
    if (prevBottom) prevBottom.disabled = kanbanActivityOffset <= 0;
    if (nextBottom) nextBottom.disabled = kanbanActivityOffset + kanbanActivityLimit >= total;

    const prevBottomClone = prevBottom?.cloneNode(true) as HTMLButtonElement;
    const nextBottomClone = nextBottom?.cloneNode(true) as HTMLButtonElement;
    if (prevBottom && prevBottom.parentNode) {
      prevBottom.parentNode.replaceChild(prevBottomClone, prevBottom);
      prevBottomClone.addEventListener("click", () => {
        kanbanActivityOffset = Math.max(0, kanbanActivityOffset - kanbanActivityLimit);
        void loadKanbanActivity(taskId);
        document
          .getElementById("kanban-activity-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    if (nextBottom && nextBottom.parentNode) {
      nextBottom.parentNode.replaceChild(nextBottomClone, nextBottom);
      nextBottomClone.addEventListener("click", () => {
        kanbanActivityOffset += kanbanActivityLimit;
        void loadKanbanActivity(taskId);
        document
          .getElementById("kanban-activity-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    // Wire order toggle buttons (clone to remove old listeners)
    const orderBtnClone = orderBtn?.cloneNode(true) as HTMLButtonElement;
    const orderBtnBottomClone = orderBtnBottom?.cloneNode(true) as HTMLButtonElement;
    const toggleOrder = () => {
      kanbanActivityOrder = kanbanActivityOrder === "desc" ? "asc" : "desc";
      kanbanActivityOffset = 0;
      void loadKanbanActivity(taskId);
    };
    if (orderBtn && orderBtn.parentNode) {
      orderBtn.parentNode.replaceChild(orderBtnClone, orderBtn);
      orderBtnClone.addEventListener("click", toggleOrder);
    }
    if (orderBtnBottom && orderBtnBottom.parentNode) {
      orderBtnBottom.parentNode.replaceChild(orderBtnBottomClone, orderBtnBottom);
      orderBtnBottomClone.addEventListener("click", toggleOrder);
    }
  } catch {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Failed to load activity.</div>';
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
          <div class="detail-label">Planning Mode</div>
          <div>${task.planning_mode ? escapeHtml(task.planning_mode === "prompt_only" ? "No Plan" : task.planning_mode === "auto_plan" ? "Simple Plan" : task.planning_mode === "auto_subtasks" ? "Plan with Subtasks" : task.planning_mode) : "<em>Default</em>"}</div>
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
        const planningModeSelect = document.getElementById("task-edit-planning-mode") as HTMLSelectElement;
        if (planningModeSelect) {
          planningModeSelect.value = task.planning_mode || "";
          syncSelectDisplay("task-edit-planning-mode");
        }
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
      const planning_mode =
        (document.getElementById("task-edit-planning-mode") as HTMLSelectElement)?.value || undefined;

      try {
        const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            body,
            priority,
            status,
            channel_id,
            profile,
            template,
            planning_mode,
          }),
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

    // Load activity
    void loadKanbanActivity(taskId);
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
    <div class="card" id="kanban-activity-card">
      <div class="card-header">
        <span class="card-title">Recent Activity</span>
        <span class="events-nav" id="kanban-threads-nav">
          <button class="nav-btn" id="kanban-threads-prev-page" disabled>← Prev</button>
          <span id="kanban-threads-page-info">Page 1</span>
          <button class="nav-btn" id="kanban-threads-next-page" disabled>Next →</button>
          <button class="nav-btn order-btn" id="kanban-threads-order-btn"><span class="arrow">↓</span> Recent</button>
        </span>
      </div>
      <div class="card-body" id="kanban-threads">
        <div class="loading">Loading activity...</div>
      </div>
      <div class="card-footer" style="padding:0.75rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between;">
        <span class="events-count" id="kanban-threads-count"></span>
        <span class="events-nav">
          <button class="nav-btn" id="kanban-threads-prev-page-bottom" disabled>← Prev</button>
          <span id="kanban-threads-page-info-bottom">Page 1</span>
          <button class="nav-btn" id="kanban-threads-next-page-bottom" disabled>Next →</button>
          <button class="nav-btn order-btn" id="kanban-threads-order-btn-bottom"><span class="arrow">↓</span> Recent</button>
        </span>
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
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Planning Mode</label>
            <select id="task-edit-planning-mode" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">- (Default)</option>
              <option value="prompt_only">No Plan</option>
              <option value="auto_plan">Simple Plan</option>
              <option value="auto_subtasks">Plan with Subtasks</option>
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
  enhanceSelect("task-edit-planning-mode");
}
