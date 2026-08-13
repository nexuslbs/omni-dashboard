/**
 * Main hooks page: rendering + wiring.
 * Clone of src/pages/schedule.ts, delegates to lib/hooks-list.ts and
 * lib/hooks-detail.ts.
 */
import { loadHooks } from "../lib/hooks-list";

// ── Main render ──

export function renderHooks(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Hooks</h1>
        <p class="page-subtitle">Event-driven hooks: react to thread / message events</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span id="hooks-count" style="font-size:0.85rem;color:var(--text-muted);"></span>
        <button id="create-hook-btn" class="btn-primary" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Hook</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Hooks</span></div>
      <div class="card-body" id="hooks-table">
        <div class="loading">Loading hooks</div>
      </div>
    </div>
  `;

  // Wire create button
  document.getElementById("create-hook-btn")?.addEventListener("click", async () => {
    const { showHookModal } = await import("../lib/hooks-detail");
    void showHookModal(null, () => loadHooks());
  });

  void loadHooks();
}
