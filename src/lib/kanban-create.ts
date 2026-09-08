/**
 * Kanban create/edit task modal: ONE shared modal component for both modes.
 *
 * - Create Task (kanban page) and Edit Task (kanban detail page) render the
 *   SAME field set through `taskModalHTML(mode)`; only the submit action
 *   differs (POST vs PATCH) and Edit pre-fills the fields.
 * - Every <select> in the modal uses the custom styled dropdown (dropdown.ts),
 *   including Board and Workflow.
 * - The modal opens INSTANTLY: `openTaskModal` shows the overlay first and
 *   populates the selects in the background from the refcache (prefetched on
 *   page load), so a click never waits on the network.
 */
import { type BoardEntry, type WorkflowEntry } from "./api";
import { workflowSelectOptions } from "./kanban-boards";
import { primeTagColors, tagHue } from "./kanban-board";
import { enhanceSelect, syncSelectDisplay } from "./dropdown";
import { escapeHtml, formatApiError } from "./helpers";
import { cachedGet } from "./refcache";

export type TaskModalMode = "create" | "edit";

/** id prefix per mode: create -> task-create-*, edit -> task-edit-* */
const prefix = (mode: TaskModalMode): string => (mode === "edit" ? "task-edit" : "task-create");
const modalId = (mode: TaskModalMode): string => (mode === "edit" ? "edit-task-modal" : "create-task-modal");

// ── Modal open state (what the wired submit button acts on) ──
let _editTaskId: string | null = null;
let _activeSave: (() => void) | null = null;

// ── Modal tag state (registry-backed tag add/remove on a task) ──
interface RegTag { name: string; color?: string | null; }
let _regTags: RegTag[] = [];
let _regTagsPromise: Promise<RegTag[]> | null = null;
const _selTags: Record<TaskModalMode, string[]> = { create: [], edit: [] };
const _initialTags: Record<TaskModalMode, string[]> = { create: [], edit: [] };

// ── Select population helpers (all cached + enhanced) ──

function refreshEnhancedSelect(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  const wrapper = select.nextElementSibling as HTMLElement | null;
  if (wrapper && wrapper.classList.contains("custom-select")) {
    wrapper.remove();
  }
  (select as HTMLSelectElement).dataset._enhanced = "";
  select.style.display = "";
  enhanceSelect(selectId);
}

async function populateChannelSelect(selectId: string, selected: string | null): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  try {
    const channels = (await cachedGet<Record<string, unknown>[]>("/channels")) || [];
    const kanbanChannel = channels.find((ch) => ch.platform === "kanban");
    select.innerHTML = '<option value="">None</option>';
    for (const ch of channels) {
      const opt = document.createElement("option");
      const chAny = ch as Record<string, string>;
      opt.value = chAny.id || chAny.name || "";
      opt.textContent = chAny.name || chAny.id || "";
      if (selected) {
        if (opt.value === selected) opt.selected = true;
      } else if (
        kanbanChannel &&
        (opt.value === (kanbanChannel as Record<string, string>).id ||
          opt.value === (kanbanChannel as Record<string, string>).name ||
          opt.value === (kanbanChannel as Record<string, string>).channel)
      ) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch {
    select.innerHTML = '<option value="">Error loading channels</option>';
  }
}

async function populateProfileSelect(selectId: string, selected: string | null): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  try {
    const profiles = (await cachedGet<unknown[]>("/profiles")) || [];
    select.innerHTML = '<option value="">None</option>';
    for (const p of profiles) {
      const name = typeof p === "string" ? p : (p as { name?: string }).name || "";
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (selected && name === selected) opt.selected = true;
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch (e) {
    console.error("Failed to load profiles:", e);
    select.innerHTML = '<option value="">Error loading profiles</option>';
  }
}

async function populateTemplatesSelect(selectId: string, selected: string | null): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  try {
    const templates =
      (await cachedGet<{ profile: string; name: string; label: string }[]>("/templates")) || [];
    select.innerHTML = '<option value="">None</option>';
    for (const t of templates) {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = `${t.name} (${t.profile})`;
      if (selected && t.name === selected) opt.selected = true;
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch (e) {
    console.error("Failed to load templates:", e);
    select.innerHTML = '<option value="">Error loading templates</option>';
  }
}

async function populateBoardSelectCached(selectId: string, selected: string | null): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  try {
    const boards = (await cachedGet<{ boards: BoardEntry[] }>("/boards"))?.boards || [];
    select.innerHTML = '<option value="">None</option>';
    for (const b of boards) {
      const opt = document.createElement("option");
      opt.value = b.key;
      opt.textContent = b.key;
      if (selected && b.key === selected) opt.selected = true;
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch {
    select.innerHTML = '<option value="">None</option>';
  }
}

async function populateWorkflowSelectCached(selectId: string, selected: string | null): Promise<void> {
  const select = document.getElementById(selectId) as HTMLSelectElement | null;
  if (!select) return;
  try {
    const workflows = (await cachedGet<{ workflows: WorkflowEntry[] }>("/workflows"))?.workflows || [];
    const options = workflowSelectOptions(workflows, selected);
    select.innerHTML = "";
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.selected) opt.selected = true;
      select.appendChild(opt);
    }
    refreshEnhancedSelect(selectId);
  } catch {
    select.innerHTML = '<option value="">(none)</option>';
  }
}

/**
 * Populate every select of the modal (channel/profile/template/board/workflow).
 * Board and Workflow get the custom dropdown enhancement here (req: no native
 * <select> for those fields).
 */
export async function populateTaskModalSelects(
  mode: TaskModalMode,
  currentBoard: string | null,
  task: Record<string, unknown> | null,
): Promise<void> {
  const p = prefix(mode);
  const board = task?.board ? String(task.board) : currentBoard;
  await Promise.all([
    populateChannelSelect(`${p}-channel`, task?.channel ? String(task.channel) : null),
    populateProfileSelect(`${p}-profile`, task?.profile ? String(task.profile) : null),
    populateTemplatesSelect(`${p}-template`, task?.template ? String(task.template) : null),
    populateBoardSelectCached(`${p}-board`, board),
  ]);
  // Workflow: explicit task.workflow wins, else the board's workflow.
  let wf: string | null = task?.workflow ? String(task.workflow) : null;
  if (!wf && board) {
    const boards = (await cachedGet<{ boards: BoardEntry[] }>("/boards"))?.boards || [];
    wf = boards.find((b) => b.key === board)?.board?.workflow ?? null;
  }
  await populateWorkflowSelectCached(`${p}-workflow`, wf);
}

// ── Modal HTML (one component, two modes) ──

const inputStyle =
  "width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;";
const labelStyle = "display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;";

export function taskModalHTML(mode: TaskModalMode): string {
  const p = prefix(mode);
  const isEdit = mode === "edit";
  return `
        <div id="${modalId(mode)}" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh;">
          <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:500px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
            <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">${isEdit ? "Edit Task" : "Create Task"}</h2>
            <div style="display:grid;gap:0.75rem;">
              <div>
                <label style="${labelStyle}">Title *</label>
                <input type="text" id="${p}-title" style="${inputStyle}" />
              </div>
              <div>
                <label style="${labelStyle}">Body</label>
                <textarea id="${p}-body" rows="3" style="${inputStyle}resize:vertical;"></textarea>
              </div>
              <div>
                <label style="${labelStyle}">Priority</label>
                <select id="${p}-priority" style="${inputStyle}">
                  <option value="0">Low</option>
                  <option value="1">Med</option>
                  <option value="3">High</option>
                  <option value="5">Critical</option>
                </select>
              </div>
              <div>
                <label style="${labelStyle}">Status</label>
                <select id="${p}-status" style="${inputStyle}">
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
                <label style="${labelStyle}">Board</label>
                <select id="${p}-board" style="${inputStyle}">
                  <option value="">None</option>
                </select>
              </div>
              <div>
                <label style="${labelStyle}">Workflow</label>
                <select id="${p}-workflow" style="${inputStyle}">
                  <option value="">(none)</option>
                </select>
              </div>
              <div>
                <label style="${labelStyle}">Channel</label>
                <select id="${p}-channel" style="${inputStyle}">
                  <option value="">Loading...</option>
                </select>
              </div>
              <div>
                <label style="${labelStyle}">Profile</label>
                <select id="${p}-profile" style="${inputStyle}">
                  <option value="">None</option>
                </select>
              </div>
              <div>
                <label style="${labelStyle}">Template</label>
                <select id="${p}-template" style="${inputStyle}">
                  <option value="">None</option>
                </select>
                <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">Structured guidance injected into the agent's prompt. Create .md files in profiles/&lt;name&gt;/templates/</div>
              </div>
              <div>
                <label style="${labelStyle}">Tags</label>
                <div id="${p}-tags-chips"></div>
                <div style="display:flex;gap:0.4rem;margin-top:0.35rem;align-items:center;">
                  <select id="${p}-tag-registry" style="flex:1;${inputStyle}"></select>
                  <button type="button" id="${p}-tag-add" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:var(--accent-blue);border-radius:6px;padding:0.375rem 0.6rem;cursor:pointer;font-size:0.78rem;font-weight:500;white-space:nowrap;">+ Add</button>
                </div>
              </div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
              <button id="${p}-cancel" style="background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
              <button id="${p}-submit" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">${isEdit ? "Save" : "Create"}</button>
            </div>
          </div>
        </div>
      `;
}

// ── Close / reset ──

export function closeTaskModal(mode: TaskModalMode): void {
  const modal = document.getElementById(modalId(mode));
  if (modal) modal.style.display = "none";
  const p = prefix(mode);
  const title = document.getElementById(`${p}-title`) as HTMLInputElement | null;
  if (title) title.value = "";
  const body = document.getElementById(`${p}-body`) as HTMLTextAreaElement | null;
  if (body) body.value = "";
  const priority = document.getElementById(`${p}-priority`) as HTMLSelectElement | null;
  if (priority) priority.value = "0";
  syncSelectDisplay(`${p}-priority`);
  syncSelectDisplay(`${p}-status`);
  syncSelectDisplay(`${p}-board`);
  syncSelectDisplay(`${p}-workflow`);
  syncSelectDisplay(`${p}-channel`);
  syncSelectDisplay(`${p}-profile`);
  syncSelectDisplay(`${p}-template`);
  _selTags[mode] = [];
  _initialTags[mode] = [];
  const chips = document.getElementById(`${p}-tags-chips`);
  if (chips) chips.innerHTML = "";
  const reg = document.getElementById(`${p}-tag-registry`) as HTMLSelectElement | null;
  if (reg) reg.innerHTML = "";
}

/** Backwards-compatible alias (kanban page used closeCreateModal). */
export function closeCreateModal(): void {
  closeTaskModal("create");
}

// ── Open (instant) ──

export interface OpenTaskModalOpts {
  mode: TaskModalMode;
  /** Edit pre-fill (the task record). */
  task?: Record<string, unknown> | null;
  /** Create: the currently selected board (default board). */
  getBoard?: () => string | null;
  onSaved?: () => void;
}

/**
 * Open the shared task modal. Shows the overlay IMMEDIATELY (no awaits before
 * display), then fills the selects from the prefetched refcache in the
 * background. Edit pre-fills title/body/priority/status/board/... from `task`.
 */
export function openTaskModal(opts: OpenTaskModalOpts): void {
  const mode = opts.mode;
  const p = prefix(mode);
  const modal = document.getElementById(modalId(mode));
  if (!modal) return;

  _editTaskId = mode === "edit" ? String(opts.task?.id ?? "") : null;
  _activeSave = opts.onSaved ?? null;

  const task = opts.task || null;
  const title = document.getElementById(`${p}-title`) as HTMLInputElement | null;
  if (title) title.value = task?.title ? String(task.title) : "";
  const body = document.getElementById(`${p}-body`) as HTMLTextAreaElement | null;
  if (body) body.value = task?.body ? String(task.body) : "";
  const priority = document.getElementById(`${p}-priority`) as HTMLSelectElement | null;
  if (priority) priority.value = task?.priority != null ? String(task.priority) : "0";
  const status = document.getElementById(`${p}-status`) as HTMLSelectElement | null;
  if (status) status.value = task?.status ? String(task.status) : "backlog";

  // Tag prefill: edit mode starts from the task's existing tags; create from none.
  const taskTags = Array.isArray(task?.tags) ? (task!.tags as unknown[]).map(String) : [];
  _selTags[mode] = taskTags;
  _initialTags[mode] = [...taskTags];

  // Show first, populate in background.
  modal.style.display = "flex";
  const board = opts.getBoard ? opts.getBoard() : null;
  void populateTaskModalSelects(mode, board, task);
  void loadRegTags(mode);
}

// ── Wiring (idempotent) ──

/**
 * Wire the modal's cancel + submit buttons (and, for create mode, the
 * "+ Create Task" page button). Safe to call on every page render: listeners
 * are attached once per element.
 */
export function wireTaskModal(opts: {
  mode: TaskModalMode;
  getBoard?: () => string | null;
  onSaved?: () => void;
}): void {
  const mode = opts.mode;
  const p = prefix(mode);

  const cancel = document.getElementById(`${p}-cancel`);
  if (cancel && !(cancel as HTMLElement).dataset._wired) {
    (cancel as HTMLElement).dataset._wired = "1";
    cancel.addEventListener("click", () => closeTaskModal(mode));
  }

  const submit = document.getElementById(`${p}-submit`);
  if (submit && !(submit as HTMLElement).dataset._wired) {
    (submit as HTMLElement).dataset._wired = "1";
    submit.addEventListener("click", () => {
      void submitTaskModal(mode);
    });
  }

  if (mode === "create") {
    const btn = document.getElementById("create-task-btn");
    if (btn && !(btn as HTMLElement).dataset._wired) {
      (btn as HTMLElement).dataset._wired = "1";
      btn.addEventListener("click", () => {
        openTaskModal({ mode: "create", getBoard: opts.getBoard, onSaved: opts.onSaved });
      });
    }
  }

  // Static selects (priority/status) are enhanced once at wire time.
  enhanceSelect(`${p}-priority`);
  enhanceSelect(`${p}-status`);

  // Tag UI wiring: remove chips (delegated click on the chip box), add from
  // the registry select. Elements are recreated per render, so no re-wire
  // guard is needed beyond the dataset flag on the chip box.
  const chipsBox = document.getElementById(`${p}-tags-chips`);
  if (chipsBox && !(chipsBox as HTMLElement).dataset._wired) {
    (chipsBox as HTMLElement).dataset._wired = "1";
    chipsBox.addEventListener("click", (ev) => {
      const btn = (ev.target as HTMLElement).closest("[data-tag-remove]");
      if (!btn) return;
      const tag = (btn as HTMLElement).getAttribute("data-tag-remove") || "";
      if (!tag) return;
      _selTags[mode] = _selTags[mode].filter((t) => t !== tag);
      refreshTagUI(mode);
    });
  }
  const addBtn = document.getElementById(`${p}-tag-add`);
  if (addBtn && !(addBtn as HTMLElement).dataset._wired) {
    (addBtn as HTMLElement).dataset._wired = "1";
    addBtn.addEventListener("click", () => {
      const sel = document.getElementById(`${p}-tag-registry`) as HTMLSelectElement | null;
      const name = sel?.value?.trim() || "";
      if (!name) return;
      if (!_selTags[mode].includes(name)) _selTags[mode].push(name);
      refreshTagUI(mode);
    });
  }
}

// ── Submit ──

async function submitTaskModal(mode: TaskModalMode): Promise<void> {
  const p = prefix(mode);
  const titleInput = document.getElementById(`${p}-title`) as HTMLInputElement | null;
  if (!titleInput) return;
  const title = titleInput.value.trim();
  if (!title) return;

  const body =
    (document.getElementById(`${p}-body`) as HTMLTextAreaElement | null)?.value.trim() || undefined;
  const priority = parseInt(
    (document.getElementById(`${p}-priority`) as HTMLSelectElement | null)?.value || "0",
  );
  const channel = (document.getElementById(`${p}-channel`) as HTMLSelectElement | null)?.value || undefined;
  const profile = (document.getElementById(`${p}-profile`) as HTMLSelectElement | null)?.value || undefined;
  const status = (document.getElementById(`${p}-status`) as HTMLSelectElement | null)?.value || "backlog";
  const template = (document.getElementById(`${p}-template`) as HTMLSelectElement | null)?.value || undefined;
  const board = (document.getElementById(`${p}-board`) as HTMLSelectElement | null)?.value || undefined;
  // Keep "" so the "(none)"/board-default option sends an empty workflow
  // (PATCH workflow:"" clears the task workflow back to the board default).
  const workflow = (document.getElementById(`${p}-workflow`) as HTMLSelectElement | null)?.value ?? undefined;
  const selTags = [..._selTags[mode]];

  const reqBody: Record<string, unknown> = {
    title,
    body,
    priority,
    channel,
    profile,
    status,
    template,
    board,
    workflow,
  };
  // Create sends the selected tags in one shot (CreateTaskRequest carries a
  // `tags` field; the backend auto-creates registry rows). Edit applies
  // add/remove diffs after the PATCH (below).
  if (mode === "create" && selTags.length > 0) reqBody.tags = selTags;

  try {
    let res: Response;
    if (mode === "edit") {
      res = await fetch("/api/kanban/tasks/" + encodeURIComponent(_editTaskId || ""), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
    } else {
      res = await fetch("/api/kanban/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(`${res.status}: ${text}`);
    }
    // Edit: persist tag add/remove diffs through the task tag endpoints
    // (PATCH ignores tags). Best-effort per endpoint; onSaved reload shows
    // the authoritative state.
    if (mode === "edit" && _editTaskId) {
      const tid = _editTaskId;
      const initial = _initialTags.edit;
      for (const t of initial.filter((x) => !selTags.includes(x))) {
        await fetch(`/api/kanban/tasks/${encodeURIComponent(tid)}/tags/${encodeURIComponent(t)}`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
      for (const t of selTags.filter((x) => !initial.includes(x))) {
        await fetch(`/api/kanban/tasks/${encodeURIComponent(tid)}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: t }),
        }).catch(() => undefined);
      }
    }
    closeTaskModal(mode);
    const cb = _activeSave;
    _activeSave = null;
    if (cb) cb();
  } catch (e) {
    alert("Failed to " + (mode === "edit" ? "update" : "create") + " task: " + formatApiError(e));
  }
}

// ── Modal tag helpers (registry-backed) ──

function attrEsc(s: string): string {
  return escapeHtml(s);
}

function fetchRegTags(): Promise<RegTag[]> {
  if (!_regTagsPromise) {
    _regTagsPromise = fetch("/api/kanban/tags")
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: unknown) => {
        _regTags = Array.isArray(arr) ? (arr as RegTag[]) : [];
        primeTagColors(_regTags);
        return _regTags;
      })
      .catch(() => {
        _regTags = [];
        return _regTags;
      });
  }
  return _regTagsPromise;
}

function chipHTML(tag: string): string {
  const hue = tagHue(tag);
  return `<span style="display:inline-flex;align-items:center;gap:0.3rem;background:hsl(${hue},55%,24%);color:hsl(${hue},95%,80%);border:1px solid hsl(${hue},60%,42%);border-radius:10px;padding:0.05rem 0.5rem;font-size:0.72rem;font-weight:600;line-height:1.5;">${escapeHtml(tag)}<button type="button" data-tag-remove="${attrEsc(tag)}" title="Remove tag" style="background:none;border:none;color:inherit;cursor:pointer;font-size:0.85rem;line-height:1;padding:0 0 0 0.15rem;">&times;</button></span>`;
}

function refreshTagUI(mode: TaskModalMode): void {
  const chips = document.getElementById(prefix(mode) + "-tags-chips");
  if (chips) {
    const list = _selTags[mode];
    chips.innerHTML =
      list.length === 0
        ? '<span style="font-size:0.75rem;color:var(--text-muted);">No tags</span>'
        : `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;">${list.map(chipHTML).join("")}</div>`;
  }
  const sel = document.getElementById(prefix(mode) + "-tag-registry") as HTMLSelectElement | null;
  if (sel) {
    const available = _regTags.filter((r) => !_selTags[mode].includes(r.name));
    sel.innerHTML =
      '<option value="">(add existing tag)</option>' +
      available.map((r) => `<option value="${attrEsc(r.name)}">${escapeHtml(r.name)}</option>`).join("");
    sel.value = "";
  }
}

async function loadRegTags(mode: TaskModalMode): Promise<void> {
  const tags = await fetchRegTags();
  if (tags.length === 0) {
    // Registry empty: retry once live (a tag may have been added since).
    _regTagsPromise = null;
    await fetchRegTags();
  }
  refreshTagUI(mode);
}
