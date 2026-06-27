/**
 * Main kanban page — rendering, wiring, and create-task modal.
 * Delegates to lib/kanban-board.ts, lib/kanban-detail.ts, lib/kanban-subtasks.ts.
 */
import { apiGet, apiPost } from "../lib/api";
import { loadBoard } from "../lib/kanban-board";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";

// ── State ──
let showArchived = false;

// ── URL sync ──

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

function updateArchivedButton(): void {
  const btn = document.getElementById("toggle-archived-btn");
  if (!btn) return;
  if (showArchived) {
    btn.textContent = "Showing archived";
    btn.classList.add("showing-archived");
  } else {
    btn.textContent = "Show archived";
    btn.classList.remove("showing-archived");
  }
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
  const planning_mode = document.getElementById("task-create-planning-mode") as HTMLSelectElement;
  if (planning_mode) {
    planning_mode.value = "";
    syncSelectDisplay("task-create-planning-mode");
  }
  const template = document.getElementById("task-create-template") as HTMLSelectElement;
  if (template) {
    template.value = "";
    syncSelectDisplay("task-create-template");
  }
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

async function populateProfileSelect(selectId: string): Promise<void> {
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
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch (e) {
    console.error("Failed to load profiles:", e);
    select.innerHTML = '<option value="">Error loading profiles</option>';
  }
}

async function populateTemplatesSelect(selectId: string): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  try {
    const templates = await apiGet<{ profile: string; name: string; label: string }[]>("/templates");
    select.innerHTML = '<option value="">None</option>';
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = `${t.label} (${t.profile})`;
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

// ── Main render ──

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
        <button id="kanban-history-btn" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:var(--accent-blue);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">History</button>
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
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Planning Mode</label>
            <select id="task-create-planning-mode" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">- (Default)</option>
              <option value="prompt_only">No Plan</option>
              <option value="auto_plan">Simple Plan</option>
              <option value="auto_subtasks">Plan with Subtasks</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Template</label>
            <select id="task-create-template" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="">None</option>
            </select>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">Structured guidance injected into the agent's prompt. Create .md files in profiles/&lt;name&gt;/templates/</div>
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
    await populateTemplatesSelect("task-create-template");
    modal.style.display = "flex";
    enhanceSelect("task-create-planning-mode");
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
    const template =
      (document.getElementById("task-create-template") as HTMLSelectElement)?.value || undefined;
    const planning_mode =
      (document.getElementById("task-create-planning-mode") as HTMLSelectElement)?.value || undefined;

    try {
      await apiPost<any>("/kanban/tasks", {
        title,
        body,
        priority,
        channel_id,
        profile,
        status,
        template,
        planning_mode,
      });
      closeCreateModal();
      void loadBoard(showArchived);
    } catch (e) {
      alert("Failed to create task: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  });

  enhanceSelect("task-create-priority");
  enhanceSelect("task-create-status");

  // Toggle archived button
  document.getElementById("toggle-archived-btn")!.addEventListener("click", () => {
    showArchived = !showArchived;
    updateKanbanUrl();
    updateArchivedButton();
    void loadBoard(showArchived);
  });

  // History button
  document.getElementById("kanban-history-btn")?.addEventListener("click", () => {
    history.pushState({}, "", "/kanban-history");
    void import("../lib/router").then(({ router }) => router.go("kanban-history"));
  });

  // Apply initial URL state to button and URL
  updateArchivedButton();
  updateKanbanUrl();

  void loadBoard(showArchived);
}

// Re-export for router
export { renderKanbanDetail } from "../lib/kanban-detail";
