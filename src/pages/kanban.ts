import { apiGet, apiPost, type KanbanBoardResponse, type KanbanTask } from "../lib/api";
import { router } from "../lib/router";

let showArchived = false;

export function renderKanban(container: HTMLElement): void {
  // Restore showArchived from URL on page load
  const p = new URLSearchParams(window.location.search);
  if (p.get("show_archived") === "true") {
    showArchived = true;
  }
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban</h1>
        <p class="page-subtitle">Task board</p>
      </div>
      <div class="kanban-summary" id="kanban-summary" style="display:flex;align-items:center;gap:0.75rem;">
        <span id="kanban-count" style="font-size:0.85rem;color:var(--text-muted);margin-right:auto;"></span>
        <button id="toggle-archived-btn">Show archived</button>
        <button id="create-task-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Task</button>
      </div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div class="loading">Loading board</div>
    </div>
    <!-- Create Task Modal -->
    <div id="create-task-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh;">
      <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:500px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">Create Task</h2>
        <div style="display:grid;gap:0.75rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Title *</label>
            <input type="text" id="task-create-title" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Body</label>
            <textarea id="task-create-body" rows="3" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;resize:vertical;box-sizing:border-box;"></textarea>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Priority</label>
            <select id="task-create-priority" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="0">Low</option>
              <option value="1">Med</option>
              <option value="3">High</option>
              <option value="5">Critical</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Status</label>
            <select id="task-create-status" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
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
            <select id="task-create-channel" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">Loading...</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Profile</label>
            <select id="task-create-profile" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">None</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
          <button id="task-create-cancel" style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="task-create-submit" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Create</button>
        </div>
      </div>
    </div>
  `;

  // Wire up Create Task button
  document.getElementById("create-task-btn")?.addEventListener("click", async () => {
    const modal = document.getElementById("create-task-modal");
    if (!modal) return;
    await populateCreateChannelSelect();
    await populateProfileSelect("task-create-profile");
    modal.style.display = "flex";
  });

  document.getElementById("task-create-cancel")?.addEventListener("click", () => {
    closeCreateModal();
  });

  document.getElementById("task-create-submit")?.addEventListener("click", async () => {
    const titleInput = document.getElementById("task-create-title") as HTMLInputElement;
    if (!titleInput) return;
    const title = titleInput.value.trim();
    if (!title) return;

    const body =
      (document.getElementById("task-create-body") as HTMLTextAreaElement)?.value.trim() || undefined;
    const priority = parseInt(
      (document.getElementById("task-create-priority") as HTMLSelectElement)?.value || "0",
    );
    const channel_id =
      (document.getElementById("task-create-channel") as HTMLSelectElement)?.value || undefined;
    const profile = (document.getElementById("task-create-profile") as HTMLSelectElement)?.value || undefined;
    const status = (document.getElementById("task-create-status") as HTMLSelectElement)?.value || "backlog";

    try {
      await apiPost<any>("/kanban/tasks", { title, body, priority, channel_id, profile, status });
      closeCreateModal();
      void loadBoard();
    } catch (e) {
      alert("Failed to create task: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  });

  enhanceSelect("task-create-priority");
  enhanceSelect("task-create-status");

  // Toggle archived button — also syncs URL search param
  document.getElementById("toggle-archived-btn")!.addEventListener("click", () => {
    showArchived = !showArchived;
    updateKanbanUrl();
    const btn = document.getElementById("toggle-archived-btn")!;
    if (showArchived) {
      btn.textContent = "Showing archived";
      btn.classList.add("showing-archived");
    } else {
      btn.textContent = "Show archived";
      btn.classList.remove("showing-archived");
    }
    void loadBoard();
  });
  // Apply initial URL state to button
  updateKanbanUrl();

  void loadBoard();
}

function updateKanbanUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (showArchived) {
    params.set("show_archived", "true");
  } else {
    params.delete("show_archived");
  }
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function closeCreateModal(): void {
  const modal = document.getElementById("create-task-modal");
  if (modal) modal.style.display = "none";
  const title = document.getElementById("task-create-title") as HTMLInputElement;
  if (title) title.value = "";
  const body = document.getElementById("task-create-body") as HTMLTextAreaElement;
  if (body) body.value = "";
  const priority = document.getElementById("task-create-priority") as HTMLSelectElement;
  if (priority) priority.value = "0";
  syncSelectDisplay("task-create-priority");
  syncSelectDisplay("task-create-status");
  const channel = document.getElementById("task-create-channel") as HTMLSelectElement;
  if (channel) channel.value = "";
  syncSelectDisplay("task-create-channel");
  const profile = document.getElementById("task-create-profile") as HTMLSelectElement;
  if (profile) profile.value = "";
  syncSelectDisplay("task-create-profile");
}

async function loadBoard(): Promise<void> {
  const boardEl = document.getElementById("kanban-board")!;
  const summaryEl = document.getElementById("kanban-summary")!;
  const countEl = document.getElementById("kanban-count")!;
  try {
    const board = await apiGet<KanbanBoardResponse>(
      "/kanban/board" + (showArchived ? "?show_archived=true" : ""),
    );
    if (board.columns.length === 0 || board.total === 0) {
      boardEl.innerHTML = `<div class="empty-state">No tasks yet</div>`;
      countEl.textContent = "";
      return;
    }

    countEl.textContent = `${board.total} tasks`;
    summaryEl.style.display = "flex";

    boardEl.innerHTML = `
      <div class="kanban-columns">
        ${board.columns.map((col) => renderColumn(col.id, col.title, col.tasks)).join("")}
      </div>
    `;

    // Only enable native drag on non-touch devices (prevents mobile touch interference)
    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Wire up card click handlers for navigation
    document.querySelectorAll(".kanban-card").forEach((card) => {
      if (!isTouchDevice) {
        (card as HTMLElement).draggable = true;
      }
      card.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("button, select, input, textarea")) return;
        const taskId = card.getAttribute("data-task-id");
        if (taskId) {
          history.pushState({}, "", `/kanban/${taskId}`);
          router.go(`kanban/${taskId}`);
        }
      });
    });

    if (!isTouchDevice) {
      // Wire up drag and drop (desktop only)
      document.querySelectorAll(".kanban-card").forEach((card) => {
        card.addEventListener("dragstart", (e) => {
          if ((e.target as HTMLElement).closest("button, select, input, textarea")) {
            e.preventDefault();
            return;
          }
          const taskId = (e.currentTarget as HTMLElement).getAttribute("data-task-id");
          if (taskId && (e as DragEvent).dataTransfer) {
            (e as DragEvent).dataTransfer!.setData("text/plain", taskId);
            (e as DragEvent).dataTransfer!.effectAllowed = "move";
          }
        });
      });

      document.querySelectorAll(".kanban-col-body").forEach((col) => {
        col.addEventListener("dragover", (e) => {
          e.preventDefault();
          if ((e as DragEvent).dataTransfer) {
            (e as DragEvent).dataTransfer!.dropEffect = "move";
          }
        });
        col.addEventListener("drop", async (e) => {
          e.preventDefault();
          const taskId = (e as DragEvent).dataTransfer?.getData("text/plain");
          if (!taskId) return;
          const colBody = (e.currentTarget as HTMLElement).closest(".kanban-col-body");
          const newStatus = colBody?.getAttribute("data-column");
          if (!newStatus) return;

          // Determine insert position based on drop Y coordinate
          const cards = Array.from(colBody!.querySelectorAll(".kanban-card"))
            .map((card) => ({
              el: card as HTMLElement,
              rect: (card as HTMLElement).getBoundingClientRect(),
            }))
            .sort((a, b) => a.rect.top - b.rect.top);

          const dropY = e.clientY;
          let insertIndex = cards.length; // default: end of list
          for (let i = 0; i < cards.length; i++) {
            const midY = cards[i].rect.top + cards[i].rect.height / 2;
            if (dropY < midY) {
              insertIndex = i;
              break;
            }
          }

          try {
            const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId) + "/position", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newStatus, position: insertIndex }),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => "Unknown error");
              console.error("Position move failed:", `${res.status}: ${text}`);
            }
            void loadBoard();
          } catch (err) {
            console.error("Drop move failed:", err);
            void loadBoard();
          }
        });
      });
    }
  } catch (e) {
    boardEl.innerHTML = `<div class="error-state">Failed to load board: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

async function moveTask(taskId: string, status: string): Promise<void> {
  const res = await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId) + "/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
}

function renderColumn(id: string, title: string, tasks: KanbanTask[]): string {
  const colorClass =
    id === "backlog"
      ? "kanban-col-neutral"
      : id === "todo"
        ? "kanban-col-purple"
        : id === "ready"
          ? "kanban-col-orange"
          : id === "running"
            ? "kanban-col-cyan"
            : id === "review"
              ? "kanban-col-sky"
              : id === "done"
                ? "kanban-col-emerald"
                : id === "blocked"
                  ? "kanban-col-rose"
                  : "kanban-col-neutral";

  return `
    <div class="kanban-column ${colorClass}">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${title}</span>
        <span class="kanban-col-count">${tasks.length}</span>
      </div>
      <div class="kanban-col-body" data-column="${id}">
        ${
          tasks.length === 0
            ? `<div class="kanban-empty">No tasks</div>`
            : tasks.map((t) => renderTaskCard(t)).join("")
        }
      </div>
    </div>
  `;
}

function renderTaskCard(task: KanbanTask): string {
  const priorityLabel = task.priority >= 3 ? "High" : task.priority >= 1 ? "Med" : "Low";

  const priorityClass =
    task.priority >= 3
      ? "kanban-priority-high"
      : task.priority >= 1
        ? "kanban-priority-med"
        : "kanban-priority-low";

  const timeAgo = formatRelativeTime(task.created_at);

  return `
    <div class="kanban-card" data-task-id="${task.id}">
      <div class="kanban-card-top">
        <span class="kanban-priority ${priorityClass}">${priorityLabel}</span>
        <span class="kanban-task-id" style="font-size:0.7rem;color:var(--text-muted);font-family:monospace;">#${task.display_id || task.id}</span>
      </div>
      <div class="kanban-card-title">${escapeHtml(task.title)}</div>
      ${task.body ? `<div class="kanban-card-body">${escapeHtml(task.body).slice(0, 120)}${task.body.length > 120 ? "..." : ""}</div>` : ""}
      <div class="kanban-card-footer">
        ${task.assignee ? `<span class="kanban-assignee">@${escapeHtml(task.assignee)}</span>` : ""}
        <span class="kanban-time">${timeAgo}</span>
      </div>

    </div>
  `;
}

// ── Task Detail View ──

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
      router.go("kanban");
    });
  }

  void loadTaskDetail(taskId);
  enhanceSelect("task-edit-priority");
  enhanceSelect("task-edit-status");
}

async function loadTaskDetail(taskId: string): Promise<void> {
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

        // Populate channel and profile selects, then set current values
        await populateEditChannelSelect(task.channel_id || "");
        await populateProfileSelect("task-edit-profile", task.profile || "");

        // Populate template field
        const tplInput = document.getElementById("task-edit-template") as HTMLInputElement;
        if (tplInput) tplInput.value = task.template || "";

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
        (document.getElementById("task-edit-template") as HTMLInputElement)?.value.trim() || undefined;

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
    // Load threads for this task
    void loadKanbanThreads(taskId);
    // Load subtasks for this task
    void loadKanbanSubtasks(taskId);
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load task: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Load threads for a kanban task ──
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
        router.go(route);
      });
    });
  } catch {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Failed to load threads.</div>';
  }
}

// ── Load subtasks for a kanban task ──
async function loadKanbanSubtasks(taskId: string): Promise<void> {
  const el = document.getElementById("kanban-subtasks");
  if (!el) return;
  try {
    const res = await fetch(`/api/kanban/tasks/${encodeURIComponent(taskId)}/subtasks`);
    if (!res.ok) throw new Error("Failed to load subtasks");
    const data = await res.json();
    if (!data.subtasks || data.subtasks.length === 0) {
      el.innerHTML =
        '<div style="color:var(--text-muted);font-size:0.8rem;">No subtasks for this task.</div>';
      return;
    }
    el.innerHTML = data.subtasks
      .map(
        (st: any) => `
      <div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.375rem 0;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));font-size:0.8rem;">
        <span style="flex-shrink:0;font-size:1rem;">${subtaskStatusEmoji(st.status)}</span>
        <div style="flex:1;">
          <div style="color:var(--text-primary);">${escapeHtml(st.description)}</div>
          <div style="display:flex;gap:0.5rem;margin-top:0.2rem;">
            <span class="badge ${subtaskStatusBadge(st.status)}">${escapeHtml(st.status)}</span>
            <span style="color:var(--text-muted);font-size:0.75rem;">thread #${st.thread_id}</span>
          </div>
        </div>
      </div>
    `,
      )
      .join("");
  } catch {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Failed to load subtasks.</div>';
  }
}

function subtaskStatusEmoji(status: string): string {
  switch (status) {
    case "completed":
      return "✅";
    case "cancelled":
      return "❌";
    case "in_progress":
      return "🔄";
    case "pending":
      return "⏳";
    default:
      return "⏳";
  }
}

function subtaskStatusBadge(status: string): string {
  switch (status) {
    case "completed":
      return "badge-success";
    case "cancelled":
      return "badge-neutral";
    case "in_progress":
      return "badge-cyan";
    case "pending":
      return "badge-warning";
    default:
      return "badge-neutral";
  }
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  ready: "Ready",
  running: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

// ── Helpers ──

function statusBadge(status: string): string {
  switch (status) {
    case "backlog":
      return "badge-neutral";
    case "todo":
      return "badge-purple";
    case "ready":
      return "badge-warning";
    case "running":
      return "badge-cyan";
    case "review":
      return "badge-blue";
    case "done":
      return "badge-success";
    case "blocked":
      return "badge-error";
    default:
      return "badge-neutral";
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatTaskDate(dateStr: string): string {
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

/** Styled status badge for thread status in kanban task detail. */
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

// ── Channel / Profile population helpers ──

async function populateCreateChannelSelect(): Promise<void> {
  const select = document.getElementById("task-create-channel") as HTMLSelectElement;
  if (!select) return;
  try {
    const channels = await apiGet<any[]>("/channels");
    const kanbanChannel = channels.find((ch: any) => ch.platform === "kanban");
    select.innerHTML = '<option value="">None</option>';
    for (const ch of channels) {
      const opt = document.createElement("option");
      opt.value = ch.id || ch.name || ch.channel_id || "";
      opt.textContent = ch.name || ch.id || "";
      if (
        kanbanChannel &&
        (opt.value === kanbanChannel.id ||
          opt.value === kanbanChannel.name ||
          opt.value === kanbanChannel.channel_id)
      ) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    refreshEnhancedSelect("task-create-channel");
  } catch (e) {
    console.error("Failed to load channels:", e);
    select.innerHTML = '<option value="">Error loading channels</option>';
  }
}

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

function refreshEnhancedSelect(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  // Remove existing enhanced wrapper if any
  const wrapper = select.nextElementSibling as HTMLElement;
  if (wrapper && wrapper.classList.contains("custom-select")) {
    wrapper.remove();
  }
  (select as any).dataset._enhanced = "";
  select.style.display = "";
  enhanceSelect(selectId);
}

// ── Enhanced dropdown helpers (replaces native <select>) ──
import { enhanceSelect } from "../lib/dropdown";
// enhanceSelect imported from src/lib/dropdown.ts

function syncSelectDisplay(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  const wrapper = select.nextElementSibling as HTMLElement;
  if (!wrapper || !wrapper.classList.contains("custom-select")) return;

  const selected = Array.from(select.options).find((o) => o.selected) || select.options[0];
  const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement;
  if (textEl) textEl.textContent = selected ? selected.label : "";

  wrapper.querySelectorAll(".select-option").forEach((o) => {
    o.classList.toggle("selected", o.getAttribute("data-value") === select.value);
  });
}
