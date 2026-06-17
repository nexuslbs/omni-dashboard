export function renderKanban(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Kanban</h1>
      <p class="page-subtitle">Task board</p>
    </div>
    <div class="card" style="text-align:center;padding:4rem;">
      <div style="font-size:3rem;margin-bottom:1rem;">📋</div>
      <h2>Coming Soon</h2>
      <p style="color:var(--text-secondary);">Kanban board integration is not yet implemented.</p>
    </div>
  `;
}
