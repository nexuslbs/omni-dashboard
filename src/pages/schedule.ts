/**
 * Main schedule page — rendering, wiring, filter state management.
 * Delegates to lib/schedule-list.ts and lib/schedule-detail.ts.
 */
import { loadCronJobs } from "../lib/schedule-list";

// ── State ──
let _activeOnly = true;

function updateScheduleUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (!_activeOnly) {
    params.set("show_all", "true");
  } else {
    params.delete("show_all");
  }
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

// ── Main render ──

export function renderSchedule(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule</h1>
        <p class="page-subtitle">Scheduled tasks and cron jobs</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span id="schedule-count" style="font-size:0.85rem;color:var(--text-muted);"></span>
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

  // Restore filter state from URL
  const showAllFromUrl = new URLSearchParams(window.location.search).get("show_all") === "true";
  _activeOnly = !showAllFromUrl;
  const initialBtn = document.getElementById("toggle-all-filter") as HTMLElement;
  if (initialBtn) {
    initialBtn.textContent = showAllFromUrl ? "Active Only" : "Show All";
  }
  if (showAllFromUrl) {
    document.getElementById("schedule-title")!.textContent = "All Jobs";
  }
  updateScheduleUrl(); // sync initial URL (clean stale params, match current state)

  // Wire create button
  document.getElementById("create-cron-btn")?.addEventListener("click", async () => {
    const { showCronModal } = await import("../lib/schedule-detail");
    void showCronModal(null, () => loadCronJobs(_activeOnly, () => {}));
  });

  document.getElementById("toggle-all-filter")?.addEventListener("click", () => {
    const btn = document.getElementById("toggle-all-filter") as HTMLElement;
    const showingAll = btn.textContent === "Active Only";
    btn.textContent = showingAll ? "Show All" : "Active Only";
    document.getElementById("schedule-title")!.textContent = showingAll ? "Active Jobs" : "All Jobs";
    _activeOnly = showingAll;
    updateScheduleUrl();
    void loadCronJobs(_activeOnly, () => {});
  });

  void loadCronJobs(_activeOnly, () => {});
}

// Re-export for router
export { renderScheduleDetail } from "../lib/schedule-detail";
