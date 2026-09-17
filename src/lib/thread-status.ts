/**
 * Thread status of a kanban task's workflow thread (Task Details page).
 *
 * `thread_status` is a column of `kanban_tasks` in omniagent
 * (`NULL` | `scheduled` | `running`): `scheduled` means a workflow thread is
 * queued for the task, `running` means a thread is processing it. It is NULL
 * for tasks with no live workflow thread (tasks without a workflow, manual
 * review steps, done/blocked tasks).
 *
 * The Task Details page renders it as a badge for the ACTIVE statuses only;
 * anything else (absent, empty, or a value outside the active set) renders
 * "No status defined" and NO badge.
 *
 * Kept DOM-free so it can be unit-tested directly (tests/thread-status-badge).
 */
import { escapeHtml } from "./helpers";

/** Thread statuses that mean "a workflow thread is live for this task". */
export const ACTIVE_THREAD_STATUSES: readonly string[] = ["scheduled", "running"];

/** Normalised thread status of a task, or "" when it carries none. */
export function normalizeThreadStatus(task: { thread_status?: unknown }): string {
  return typeof task.thread_status === "string" ? task.thread_status.trim() : "";
}

/** True when the task's thread status is one of the active statuses. */
export function isActiveThreadStatus(status: unknown): boolean {
  return ACTIVE_THREAD_STATUSES.includes(String(status ?? "").trim());
}

/**
 * HTML for the Thread status row of the Task Details page: a badge for an
 * active status (`scheduled` / `running`), otherwise the plain
 * "No status defined" text with no badge.
 */
export function renderThreadStatus(task: { thread_status?: unknown }): string {
  const raw = normalizeThreadStatus(task);
  if (!isActiveThreadStatus(raw)) {
    return '<em id="task-thread-status-none" style="font-size:0.8rem;color:var(--text-muted);">No status defined</em>';
  }
  const cls = raw === "running" ? "badge-warning" : "badge-info";
  return `<span class="badge ${cls}" id="task-thread-status">${escapeHtml(raw)}</span>`;
}
