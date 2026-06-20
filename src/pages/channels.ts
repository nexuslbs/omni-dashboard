import { apiGet, type ChannelData } from "../lib/api";

export function renderChannels(container: HTMLElement): void {
  const currentRoute = window.location.pathname.slice(1) || "settings";
  container.innerHTML = `
    <div class="settings-tabs">
      <a href="/settings" class="settings-tab ${currentRoute === "settings" ? "active" : ""}" data-route="settings">Settings</a>
      <a href="/profiles" class="settings-tab ${currentRoute === "profiles" ? "active" : ""}" data-route="profiles">Profiles</a>
      <a href="/channels" class="settings-tab ${currentRoute === "channels" ? "active" : ""}" data-route="channels">Channels</a>
      <a href="/platforms" class="settings-tab ${currentRoute === "platforms" ? "active" : ""}" data-route="platforms">Platforms</a>
    </div>
    <div id="channels-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading channels...</div>
    </div>
  `;
  void loadChannels();
}

async function loadChannels(): Promise<void> {
  const content = document.getElementById("channels-content")!;
  try {
    const channels = await apiGet<ChannelData[]>("/channels");
    content.innerHTML = renderChannelsPage(channels);
    wireChannels(channels);
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load channels: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderChannelsPage(channels: ChannelData[]): string {
  if (!channels || channels.length === 0) {
    return '<div class="empty-state">No channels configured</div>';
  }

  return channels
    .map(
      (ch) => `
    <div class="card settings-card" data-channel-id="${ch.id}" data-readonly="${ch.readonly}">
      <div class="card-header">
        <span class="card-title">${escapeHtml(ch.name)}</span>
        <span class="channel-status-badge ${ch.closed ? "badge-error" : "badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
        ${ch.readonly ? '<span class="channel-status-badge badge-neutral">Read Only</span>' : ""}
      </div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Name</div>
            <div class="setting-readonly-value">
              <code class="setting-readonly-code">${escapeHtml(ch.name)}</code>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Platform</div>
            <code class="setting-value-code">${escapeHtml(ch.platform || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Resource Identifier</div>
            <code class="setting-value-code">${escapeHtml(ch.resource_identifier || "—")}</code>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Status</div>
            ${renderStatusControl(ch)}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Profile</div>
            ${renderEditableField("profile", ch.current_profile || "default", ch.id, ch.readonly)}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Provider</div>
            ${renderEditableField("provider", ch.current_provider || "", ch.id, ch.readonly)}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            ${renderEditableField("model", ch.current_model || "", ch.id, ch.readonly)}
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderStatusControl(ch: ChannelData): string {
  if (ch.readonly) {
    return `
      <div class="setting-readonly-value">
        <span class="status-badge ${ch.closed ? "status-badge-error" : "status-badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
        <span class="text-muted" style="font-size:0.75rem;">(read only)</span>
      </div>
    `;
  }
  const nextStatus = ch.closed ? "Open" : "Closed";
  const nextClosed = !ch.closed;
  return `
    <div style="display:flex;align-items:center;gap:0.5rem;">
      <span class="status-badge ${ch.closed ? "status-badge-error" : "status-badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
      <button type="button" class="channel-action-btn channel-toggle-btn" data-channel-id="${ch.id}" data-closed="${nextClosed}">
        ${nextStatus}
      </button>
    </div>
  `;
}

function renderEditableField(field: string, value: string, channelId: number, readonly: boolean): string {
  if (readonly) {
    return `<code class="setting-value-code">${escapeHtml(value || "—")}</code>`;
  }
  const inputId = `ch-${channelId}-${field}`;
  return `
    <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:wrap;">
      <input type="text" id="${inputId}" class="filter-input channel-edit-input"
        value="${escapeHtml(value)}" style="min-width:140px;max-width:240px;"
        data-channel-id="${channelId}" data-field="${field}" data-original="${escapeHtml(value)}" />
      <button type="button" class="channel-edit-confirm" data-channel-id="${channelId}" data-field="${field}" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#10b981;padding:0;" title="Save">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <button type="button" class="channel-edit-cancel" data-channel-id="${channelId}" data-field="${field}" style="display:none;width:24px;height:24px;border-radius:4px;border:1px solid var(--glass-border);background:rgba(0,0,0,0.3);cursor:pointer;color:#f43f5e;padding:0;" title="Cancel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
}

function wireChannels(): void {
  // Edit input change detection
  document.querySelectorAll(".channel-edit-input").forEach((el) => {
    const input = el as HTMLInputElement;
    input.addEventListener("input", () => {
      const channelId = input.getAttribute("data-channel-id");
      const field = input.getAttribute("data-field");
      const original = input.getAttribute("data-original") || "";
      const confirmBtn = document.querySelector(
        `.channel-edit-confirm[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const cancelBtn = document.querySelector(
        `.channel-edit-cancel[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      const changed = input.value !== original;
      if (confirmBtn) confirmBtn.style.display = changed ? "inline-flex" : "none";
      if (cancelBtn) cancelBtn.style.display = changed ? "inline-flex" : "none";
    });
  });

  // Confirm edits
  document.querySelectorAll(".channel-edit-confirm").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const channelId = btn.getAttribute("data-channel-id");
      const field = btn.getAttribute("data-field");
      if (!channelId || !field) return;
      const input = document.querySelector(
        `.channel-edit-input[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLInputElement | null;
      if (!input) return;
      const value = input.value;
      const body: Record<string, string> = {};
      body[`current_${field}`] = value;
      try {
        const res = await fetch(`/api/channels/${channelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        input.setAttribute("data-original", value);
        (btn as HTMLElement).style.display = "none";
        const cancelBtn = document.querySelector(
          `.channel-edit-cancel[data-channel-id="${channelId}"][data-field="${field}"]`,
        ) as HTMLElement | null;
        if (cancelBtn) cancelBtn.style.display = "none";
        (window as any).showToast?.("Channel updated", "success");
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });

  // Cancel edits
  document.querySelectorAll(".channel-edit-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const channelId = btn.getAttribute("data-channel-id");
      const field = btn.getAttribute("data-field");
      if (!channelId || !field) return;
      const input = document.querySelector(
        `.channel-edit-input[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLInputElement | null;
      if (!input) return;
      input.value = input.getAttribute("data-original") || "";
      (btn as HTMLElement).style.display = "none";
      const confirmBtn = document.querySelector(
        `.channel-edit-confirm[data-channel-id="${channelId}"][data-field="${field}"]`,
      ) as HTMLElement | null;
      if (confirmBtn) confirmBtn.style.display = "none";
    });
  });

  // Open/Close toggle buttons
  document.querySelectorAll(".channel-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const channelId = btn.getAttribute("data-channel-id");
      const closed = btn.getAttribute("data-closed") === "true";
      if (!channelId) return;
      try {
        const res = await fetch(`/api/channels/${channelId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ closed }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        (window as any).showToast?.(closed ? "Channel closed" : "Channel opened", "success");
        void loadChannels();
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
