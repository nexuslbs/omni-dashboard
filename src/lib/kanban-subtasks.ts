/**
 * Kanban subtask rendering and management.
 * Extracted from src/pages/kanban.ts
 */
import { escapeHtml } from "./helpers";

// ── Subtask status display helpers ──

export function subtaskStatusEmoji(status: string): string {
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

export function subtaskStatusBadge(status: string): string {
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

// ── Load subtasks for a kanban task ──

export async function loadKanbanSubtasks(taskId: string): Promise<void> {
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
