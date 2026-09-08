/**
 * Kanban "+ Tags" manager: registry CRUD (name + color) for kanban task tags.
 *
 * Opened from the "+ Tags" button on the Kanban page header. The tag registry
 * lives in the backend (kanban_tags table with a color column); deleting a
 * registry tag cascades to task_tags (FK ON DELETE CASCADE), so removing a tag
 * here also removes it from every task that uses it. Colors are primed into
 * kanban-board.ts so card chips render with the registry color everywhere.
 */
import { primeTagColors } from "./kanban-board";
import { escapeHtml } from "./helpers";

interface KtmTag {
  name: string;
  color?: string | null;
}

/** Board reload callback, set by wireTagsManager on the kanban page. */
let _ktmReload: (() => void) | null = null;
let _ktmEditing: string | null = null;
let _ktmTags: KtmTag[] = [];

const _ktmBtn =
  "background:rgba(148,163,184,0.1);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.75rem;font-weight:500;white-space:nowrap;";
const _ktmDangerBtn =
  "background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.35);color:#f87171;border-radius:6px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.75rem;font-weight:500;white-space:nowrap;";
const _ktmSaveBtn =
  "background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#34d399;border-radius:6px;padding:0.3rem 0.6rem;cursor:pointer;font-size:0.75rem;font-weight:500;white-space:nowrap;";
const _ktmInput =
  "padding:0.45rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;";

export function tagsManagerModalHTML(): string {
  return `
    <div id="kanban-tags-manager" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh;">
      <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:540px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));max-height:80vh;overflow-y:auto;">
        <h2 style="margin:0 0 0.25rem 0;font-size:1.1rem;">Manage Tags</h2>
        <p style="margin:0 0 1rem 0;font-size:0.75rem;color:var(--text-muted);">Colors apply everywhere a tag is shown. Deleting a tag removes it from every task that uses it.</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center;">
          <input id="ktm-name" type="text" placeholder="Tag name" autocomplete="off" spellcheck="false" style="flex:1;min-width:8rem;${_ktmInput}" />
          <input id="ktm-color" type="color" value="#8b5cf6" title="Tag color" style="width:2.6rem;height:2.1rem;padding:0.15rem;border:1px solid var(--glass-border);border-radius:6px;background:rgba(255,255,255,0.04);cursor:pointer;" />
          <button id="ktm-save" type="button" style="${_ktmSaveBtn}">Add tag</button>
          <button id="ktm-cancel-edit" type="button" style="display:none;${_ktmBtn}">Cancel edit</button>
        </div>
        <div id="ktm-list" style="display:flex;flex-direction:column;"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:1rem;">
          <button id="ktm-close" type="button" style="${_ktmBtn}">Close</button>
        </div>
      </div>
    </div>`;
}

function _ktmSwatch(color?: string | null): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return `<span style="display:inline-block;width:0.8rem;height:0.8rem;border-radius:50%;background:${color};vertical-align:middle;"></span>`;
  }
  return `<span style="display:inline-block;width:0.8rem;height:0.8rem;border-radius:50%;background:repeating-conic-gradient(#64748b 0% 25%, #334155 0% 50%);vertical-align:middle;"></span>`;
}

function ktmErr(e: unknown): string {
  return String((e as Error).message || e);
}

/** Fetch the registry once and prime chip colors (board renders with them). */
export async function primeRegistryColors(): Promise<void> {
  try {
    const res = await fetch("/api/kanban/tags");
    if (res.ok) {
      const arr: unknown = await res.json();
      if (Array.isArray(arr)) primeTagColors(arr as KtmTag[]);
    }
  } catch {
    /* fallback: hash hues */
  }
}

async function ktmLoadList(): Promise<void> {
  let list: KtmTag[] = [];
  try {
    const res = await fetch("/api/kanban/tags");
    if (!res.ok) throw new Error((await res.text().catch(() => "")) || "HTTP " + res.status);
    const arr: unknown = await res.json();
    list = Array.isArray(arr) ? (arr as KtmTag[]) : [];
  } catch (e) {
    const box = document.getElementById("ktm-list");
    if (box) box.innerHTML = `<div style="color:#f87171;font-size:0.85rem;">Failed to load tags: ${escapeHtml(ktmErr(e))}</div>`;
    return;
  }
  _ktmTags = list;
  primeTagColors(list);
  const box = document.getElementById("ktm-list");
  if (!box) return;
  if (list.length === 0) {
    box.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);">No tags yet. Add one above.</div>';
    return;
  }
  box.innerHTML = list
    .map(
      (t) => `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.1rem;border-bottom:1px solid var(--glass-border);">
        ${_ktmSwatch(t.color)}
        <span style="flex:1;font-size:0.85rem;">${escapeHtml(t.name)}</span>
        <button type="button" data-ktm-edit="${escapeHtml(t.name)}" style="${_ktmBtn}">Edit</button>
        <button type="button" data-ktm-del="${escapeHtml(t.name)}" style="${_ktmDangerBtn}">Delete</button>
      </div>`,
    )
    .join("");
}

function openTagsManager(): void {
  const modal = document.getElementById("kanban-tags-manager");
  if (!modal) return;
  _ktmEditing = null;
  ktmResetForm();
  modal.style.display = "flex";
  void ktmLoadList();
}

function closeTagsManager(): void {
  const modal = document.getElementById("kanban-tags-manager");
  if (modal) modal.style.display = "none";
  _ktmEditing = null;
}

function ktmResetForm(): void {
  _ktmEditing = null;
  const nameEl = document.getElementById("ktm-name") as HTMLInputElement | null;
  const colorEl = document.getElementById("ktm-color") as HTMLInputElement | null;
  if (nameEl) nameEl.value = "";
  if (colorEl) colorEl.value = "#8b5cf6";
  const save = document.getElementById("ktm-save") as HTMLButtonElement | null;
  if (save) save.textContent = "Add tag";
  const cancel = document.getElementById("ktm-cancel-edit") as HTMLButtonElement | null;
  if (cancel) cancel.style.display = "none";
}

function ktmEdit(name: string): void {
  const found = _ktmTags.find((t) => t.name === name);
  _ktmEditing = name;
  const nameEl = document.getElementById("ktm-name") as HTMLInputElement | null;
  const colorEl = document.getElementById("ktm-color") as HTMLInputElement | null;
  if (nameEl) nameEl.value = name;
  if (colorEl) colorEl.value = found && found.color ? found.color : "#8b5cf6";
  const save = document.getElementById("ktm-save") as HTMLButtonElement | null;
  if (save) save.textContent = "Save";
  const cancel = document.getElementById("ktm-cancel-edit") as HTMLButtonElement | null;
  if (cancel) cancel.style.display = "";
}

async function ktmSave(): Promise<void> {
  const nameEl = document.getElementById("ktm-name") as HTMLInputElement | null;
  const colorEl = document.getElementById("ktm-color") as HTMLInputElement | null;
  const name = (nameEl?.value || "").trim();
  if (!name) {
    alert("Tag name is required");
    return;
  }
  const color = colorEl?.value || "#8b5cf6";
  const saveBtn = document.getElementById("ktm-save") as HTMLButtonElement | null;
  if (saveBtn) saveBtn.disabled = true;
  try {
    let res: Response;
    if (_ktmEditing) {
      res = await fetch("/api/kanban/tags/" + encodeURIComponent(_ktmEditing), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
    } else {
      res = await fetch("/api/kanban/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "HTTP " + res.status);
    }
    ktmResetForm();
    await ktmLoadList();
    if (_ktmReload) _ktmReload();
  } catch (e) {
    alert("Failed to save tag: " + ktmErr(e));
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function ktmDelete(name: string): Promise<void> {
  if (!name) return;
  if (!confirm(`Delete tag "${name}"? It will be removed from every task that uses it.`)) return;
  try {
    const res = await fetch("/api/kanban/tags/" + encodeURIComponent(name), {
      method: "DELETE",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "HTTP " + res.status);
    }
    if (_ktmEditing === name) ktmResetForm();
    await ktmLoadList();
    if (_ktmReload) _ktmReload();
  } catch (e) {
    alert("Failed to delete tag: " + ktmErr(e));
  }
}

/**
 * Wire the whole manager (open button + modal controls + list delegation).
 * Called on every kanban page render (elements are recreated per render).
 */
export function wireTagsManager(reload: () => void): void {
  _ktmReload = reload;
  document.getElementById("kanban-tags-btn")?.addEventListener("click", () => openTagsManager());
  document.getElementById("ktm-close")?.addEventListener("click", () => closeTagsManager());
  document.getElementById("ktm-save")?.addEventListener("click", () => {
    void ktmSave();
  });
  document.getElementById("ktm-cancel-edit")?.addEventListener("click", () => {
    ktmResetForm();
  });
  document.getElementById("ktm-list")?.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    const editBtn = target.closest("[data-ktm-edit]");
    if (editBtn) {
      ktmEdit((editBtn as HTMLElement).getAttribute("data-ktm-edit") || "");
      return;
    }
    const delBtn = target.closest("[data-ktm-del]");
    if (delBtn) {
      void ktmDelete((delBtn as HTMLElement).getAttribute("data-ktm-del") || "");
    }
  });
}
