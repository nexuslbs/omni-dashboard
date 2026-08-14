/**
 * Kanban detail view overlay: task details, edit modal, threads.
 * Extracted from src/pages/kanban.ts
 */
import { apiGet, apiPost, type Message, type ResetExecutionsResponse } from "./api";
import { STATUS_LABELS, statusBadge, moveTask } from "./kanban-board";
// ── Helper imports ──
import { escapeHtml, formatApiError } from "./helpers";
import { enhanceSelect, syncSelectDisplay } from "./dropdown";
import { renderMessageCard, wireMessageCardToggles } from "./message-card";
import { showToast } from "./utils";

// ── Pagination state for kanban activity ──
let kanbanActivityOffset = 0;
const kanbanActivityLimit = 10;
let kanbanActivityOrder: "desc" | "asc" = "desc";

async function loadKanbanActivity(taskId: string): Promise<void> {
  const el = document.getElementById("kanban-threads");
  if (!el) return;
  try {
    const data = await apiGet<{ rows: Message[]; total: number }>(
      `/kanban/tasks/${encodeURIComponent(taskId)}/threads?offset=${kanbanActivityOffset}&limit=${kanbanActivityLimit}&order=${kanbanActivityOrder}`,
    );
    const total = parseInt(String(data.total)) || 0;
    const rows = data.rows || [];

    if (rows.length === 0) {
      el.innerHTML =
        '<div style="color:var(--text-muted);font-size:0.8rem;padding:1rem 0;">No activity from this task yet.</div>';
      return;
    }

    el.innerHTML =
      '<div class="events-scroll">' + rows.map((row: Message) => renderMessageCard(row)).join("") + "</div>";
    wireMessageCardToggles(el);

    // Wire thread links
    // ── Thread link wrapping removed: native href in message-card.ts handles navigation ──

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
    const label = kanbanActivityOrder === "desc" ? "Recent" : "Oldest";
    if (orderBtn) {
      orderBtn.querySelector(".arrow")!.textContent = arrowChar;
      orderBtn.childNodes[1].textContent = " " + label;
    }
    if (orderBtnBottom) {
      orderBtnBottom.querySelector(".arrow")!.textContent = arrowChar;
      orderBtnBottom.childNodes[1].textContent = " " + label;
    }

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
    const channels = (await apiGet("/channels")) as {
      name?: string;
      id?: string;
      platform?: string;
      channel_id?: string;
    }[];
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
  } catch {
    // console.error("Failed to load channels:", e);
    select.innerHTML = '<option value="">Error loading channels</option>';
  }
}

async function populateProfileSelect(selectId: string, currentProfile?: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  try {
    const profiles = (await apiGet("/profiles")) as { name?: string }[];
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
      opt.textContent = `${t.name} (${t.profile})`;
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
  (select as HTMLSelectElement).dataset._enhanced = "";
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
          alert("Failed to delete task: " + formatApiError(e));
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
        alert("Failed to archive/unarchive: " + formatApiError(e));
      }
    });
  }

  try {
    const task = (await apiGet("/kanban/tasks/" + encodeURIComponent(taskId))) as any;
    if (subtitle) subtitle.textContent = `Task: ${escapeHtml(task.title)}`;

    // Load channels to resolve channel name
    let channelName = "";
    try {
      const channels = (await apiGet("/channels")) as { id: string; name?: string; platform?: string }[];
      const match = channels.find(
        (ch: { id: string; platform?: string }) => String(ch.id) === String(task.channel_id),
      );
      if (match) {
        channelName = match.name || match.platform || "";
      }
    } catch {
      // Channel lookup failure: fall back to raw ID
    }

    // Update archive button text
    if (archiveBtn) {
      archiveBtn.textContent = task.archived ? "Unarchive" : "Archive";
      archiveBtn.classList.toggle("archived", task.archived);
    }

    el.innerHTML = `
      <div class="detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div class="detail-label">ID</div>
          <div><code>${task.display_id || task.id}</code></div>
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
          <div>${channelName ? escapeHtml(channelName) : task.channel_id ? escapeHtml(String(task.channel_id)) : "<em>None</em>"}</div>
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

    // Wire up dep-card click handlers
    el.querySelectorAll(".dep-card").forEach((card) => {
      card.addEventListener("click", () => {
        const depId = (card as HTMLElement).getAttribute("data-dep-id");
        if (!depId) return;
        const url = `/kanban-detail?task_id=${encodeURIComponent(depId)}`;
        history.pushState({}, "", url);
        void loadTaskDetail(depId);
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
        const planSelect = document.getElementById("task-edit-plan") as HTMLSelectElement;
        if (planSelect) {
          planSelect.value = task.plan != null ? String(task.plan) : "";
          syncSelectDisplay("task-edit-plan");
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
      const planVal = (document.getElementById("task-edit-plan") as HTMLSelectElement)?.value || undefined;

      try {
        const reqBody: Record<string, any> = {
          title,
          body,
          priority,
          status,
          channel_id,
          profile,
          template,
        };
        if (planVal !== undefined && planVal !== "") {
          reqBody.plan = planVal === "true";
        }
        const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "Unknown error");
          throw new Error(`${res.status}: ${text}`);
        }
        const modal = document.getElementById("edit-task-modal");
        if (modal) modal.style.display = "none";
        void loadTaskDetail(taskId);
      } catch (e) {
        alert("Failed to update task: " + formatApiError(e));
      }
    });

    // ── Render dependencies table ──
    renderDepsTable(task);
    wireDepsAdd(taskId);
    wireDepsRemove(taskId);

    // Load activity
    void loadKanbanActivity(taskId);
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load task: ${formatApiError(e)}</div>`;
  }
}

function renderDepsTable(task: any): void {
  const tbody = document.getElementById("deps-tbody");
  const countEl = document.getElementById("deps-count");
  if (!tbody) return;
  const deps = (task.dependencies || []) as Record<string, unknown>[];
  if (countEl) countEl.textContent = `${deps.length} dependenc${deps.length === 1 ? "y" : "ies"}`;
  if (deps.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8rem;">No dependencies</td></tr>';
    return;
  }
  tbody.innerHTML = deps
    .map(
      (dep: any) =>
        `<tr data-dep-id="${escapeHtml(dep.depends_on_id || dep.id)}" style="border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.06));">
          <td style="padding:0.4rem 0.5rem;"><code style="font-size:0.75rem;color:var(--accent-cyan);">${escapeHtml(dep.depends_on_id || dep.id)}</code></td>
          <td style="padding:0.4rem 0.5rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary);">${escapeHtml(dep.title || "")}</td>
          <td style="padding:0.4rem 0.5rem;">${
            (dep as any).archived
              ? '<span class="badge badge-neutral" style="font-size:0.7rem;">Archived</span>'
              : `<span class="badge ${statusBadge(dep.status)}" style="font-size:0.7rem;">${STATUS_LABELS[dep.status] || dep.status}</span>`
          }</td>
          <td style="padding:0.4rem 0.5rem;color:var(--text-muted);font-size:0.75rem;">${dep.created_at ? new Date(dep.created_at).toLocaleString() : "-"}</td>
          <td style="padding:0.4rem 0.5rem;text-align:right;">
            <button class="dep-remove-btn" data-dep-id="${escapeHtml(dep.id)}" style="background:rgba(244,63,94,0.1);border:1px solid rgba(244,63,94,0.2);color:var(--accent-rose);border-radius:4px;padding:0.15rem 0.45rem;cursor:pointer;font-size:0.7rem;">Remove</button>
          </td>
        </tr>`,
    )
    .join("");
}

function wireDepsAdd(taskId: string): void {
  const input = document.getElementById("dep-add-input") as HTMLInputElement;
  const btn = document.getElementById("dep-add-btn");
  if (!input || !btn) return;

  // Replace button to clear any stale listeners accumulated from reloads
  const newBtn = btn.cloneNode(true) as HTMLElement;
  btn.parentNode?.replaceChild(newBtn, btn);
  // Reset to initial state: the button may have been cloned mid-"Adding..."
  (newBtn as HTMLButtonElement).textContent = "+ Add";
  newBtn.removeAttribute("disabled");

  const handler = async () => {
    const depId = input.value.trim();
    if (!depId) return;
    newBtn.setAttribute("disabled", "true");
    const original = (newBtn as HTMLButtonElement).textContent;
    (newBtn as HTMLButtonElement).textContent = "Adding...";
    try {
      const res = await fetch(`/api/kanban/tasks/${encodeURIComponent(taskId)}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depends_on_id: depId }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      input.value = "";
      showToast("Dependency added", "success");
      void loadTaskDetail(taskId);
    } catch (e: unknown) {
      showToast("Failed: " + ((e instanceof Error ? e.message : String(e)) || "Unknown"), "error");
    } finally {
      (newBtn as HTMLButtonElement).textContent = original;
      newBtn.removeAttribute("disabled");
    }
  };

  newBtn.addEventListener("click", handler);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void handler();
  });
}

function wireDepsRemove(taskId: string): void {
  document.querySelectorAll(".dep-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const depId = (btn as HTMLElement).getAttribute("data-dep-id");
      if (!depId) return;
      if (!confirm(`Remove dependency on "${depId}"?`)) return;
      try {
        const res = await fetch(
          `/api/kanban/tasks/${encodeURIComponent(taskId)}/dependencies/${encodeURIComponent(depId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error(await res.text());
        showToast("Dependency removed", "success");
        void loadTaskDetail(taskId);
      } catch (e: unknown) {
        showToast("Failed: " + ((e as any).message || "Unknown"), "error");
      }
    });
  });
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
        <button id="task-history-btn" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:var(--accent-blue);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.75rem;font-weight:500;">History</button>
        <button id="task-reset-workflow-btn" title="Clear workflow_state.executions for this task" style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);color:#e8b64c;border-radius:6px;padding:.375rem .625rem;cursor:pointer;font-size:.75rem;font-weight:500;">Reset Workflow Executions</button>
        <a href="/kanban" class="back-link" id="back-to-kanban">← Back to Board</a>
      </div>
    </div>
    <div class="card" id="task-detail-card">
      <div class="card-body">
        <div class="loading">Loading task</div>
      </div>
    </div>
    <div class="card" id="kanban-deps-card">
      <div class="card-header">
        <span class="card-title">Dependencies</span>
        <span id="deps-count" style="font-size:0.8rem;color:var(--text-muted);"></span>
      </div>
      <div class="card-body">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem;line-height:1.4;">
          A dependency blocks this task from being dispatched until the dependee task is completed. Add the dependee task's ID below.
        </div>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
          <input type="text" id="dep-add-input" placeholder="Task ID..." style="flex:1;padding:0.375rem 0.625rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.8rem;font-family:monospace;" />
          <button id="dep-add-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;white-space:nowrap;">+ Add</button>
        </div>
        <div style="overflow-x:auto;">
          <table id="deps-table" style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--glass-border);">
                <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);font-weight:500;">Task ID</th>
                <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);font-weight:500;">Preview</th>
                <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);font-weight:500;">Status</th>
                <th style="text-align:left;padding:0.4rem 0.5rem;color:var(--text-muted);font-weight:500;">Added</th>
                <th style="text-align:right;padding:0.4rem 0.5rem;color:var(--text-muted);font-weight:500;">Actions</th>
              </tr>
            </thead>
            <tbody id="deps-tbody">
              <tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8rem;">No dependencies</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="card" id="kanban-activity-card">
      <div class="card-header">
        <span class="card-title">Activity</span>
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
              <option value="running">In Progress</option>
              <option value="testing">Testing</option>
              <option value="review">Review</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
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

  const historyBtn = document.getElementById("task-history-btn");
  if (historyBtn) {
    historyBtn.addEventListener("click", () => {
      const url = `/kanban-history?task_id=${encodeURIComponent(taskId)}`;
      history.pushState({}, "", url);
      void import("../lib/router").then(({ router }) => router.go("kanban-history"));
    });
  }

  const resetWfBtn = document.getElementById("task-reset-workflow-btn");
  if (resetWfBtn) {
    resetWfBtn.addEventListener("click", () => {
      void handleResetWorkflowExecutions(taskId);
    });
  }

  void loadTaskDetail(taskId);
  enhanceSelect("task-edit-priority");
  enhanceSelect("task-edit-status");
}

async function handleResetWorkflowExecutions(taskId: string): Promise<void> {
  if (!confirm("Reset workflow execution counters for this task?")) return;
  try {
    const res = await apiPost<ResetExecutionsResponse>(
      `/kanban/tasks/${encodeURIComponent(taskId)}/workflow/executions/reset`,
      {},
    );
    if (res?.reset) {
      showToast(res.message ?? "Workflow executions reset.");
    } else {
      showToast(res?.message ?? "No workflow executions to reset.");
    }
    void loadTaskDetail(taskId);
  } catch (e) {
    showToast(`Failed to reset workflow executions: ${formatApiError(e)}`, "error");
  }
}
