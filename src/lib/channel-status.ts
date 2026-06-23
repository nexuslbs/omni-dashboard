/**
 * Channel status controls — open/close toggles, filter controls.
 * Extracted from src/pages/channels.ts
 */
import { escapeHtml } from "./helpers";
// syncSelectDisplay used indirectly via channel-config calls

import type { ChannelData } from "./api";
import {
  renderNameInput,
  renderProfileSelect,
  renderProviderSelect,
  renderModelSelect,
  renderPlanningModeSelect,
} from "./channel-config";

// ── Filter state ──
export interface ChannelFilters {
  channelId: string;
  platform: string;
  status: string;
}

export let _channelFilters: ChannelFilters = { channelId: "", platform: "all", status: "all" };

export function setChannelFilters(filters: ChannelFilters): void {
  _channelFilters = filters;
}

// ── URL search param sync ──
export function syncFiltersToUrl(): void {
  const params = new URLSearchParams();
  if (_channelFilters.channelId) params.set("channelId", _channelFilters.channelId);
  if (_channelFilters.platform !== "all") params.set("platform", _channelFilters.platform);
  if (_channelFilters.status !== "all") params.set("status", _channelFilters.status);
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

export function applyFiltersFromUrl(): void {
  const p = new URLSearchParams(window.location.search);
  const channelId = p.get("channelId");
  if (channelId) _channelFilters.channelId = channelId;
  const platform = p.get("platform");
  if (platform) _channelFilters.platform = platform;
  const status = p.get("status");
  if (status) _channelFilters.status = status;
}

// ── Status control rendering ──

export function renderStatusControl(ch: ChannelData): string {
  const actionLabel = ch.closed ? "Open" : "Close";
  const nextClosed = !ch.closed;
  return `
    <div class="channel-field-group">
      <span class="status-badge ${ch.closed ? "status-badge-error" : "status-badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
      <button type="button" class="channel-action-btn channel-toggle-btn" data-channel-id="${ch.id}" data-closed="${nextClosed}">
        ${actionLabel}
      </button>
    </div>
  `;
}

// ── Main channel page rendering ──

export function renderChannelsPage(channels: ChannelData[]): string {
  if (!channels || channels.length === 0) {
    return '<div class="empty-state">No channels configured</div>';
  }

  // Apply filters
  let filtered = channels;
  if (_channelFilters.channelId) {
    const q = _channelFilters.channelId.toLowerCase();
    filtered = filtered.filter(
      (ch) => String(ch.id).includes(q) || (ch.name || "").toLowerCase().includes(q),
    );
  }
  if (_channelFilters.platform && _channelFilters.platform !== "all") {
    filtered = filtered.filter((ch) => ch.platform === _channelFilters.platform);
  }
  if (_channelFilters.status === "open") {
    filtered = filtered.filter((ch) => !ch.closed);
  } else if (_channelFilters.status === "closed") {
    filtered = filtered.filter((ch) => ch.closed);
  }

  if (filtered.length === 0) {
    return '<div class="empty-state">No channels match the current filters</div>';
  }

  return filtered
    .map(
      (ch) => `
    <div class="card settings-card" data-channel-id="${ch.id}" data-readonly="${ch.readonly}">
      <div class="card-header">
        <span class="card-title">${escapeHtml(ch.name)}</span>
        ${ch.readonly ? '<span style="flex:1;text-align:center;"><span class="channel-status-badge badge-neutral">Permanent</span></span>' : '<span style="flex:1;"></span>'}
        <span class="channel-status-badge" style="--type-color:#8b5cf6;background:rgba(139,92,246,0.12);border-color:rgba(139,92,246,0.3);color:#8b5cf6;font-size:0.7rem;padding:0.125rem 0.5rem;">${planningModeLabel(ch.planning_mode)}</span>
        <span class="channel-status-badge ${ch.closed ? "badge-error" : "badge-success"}">${ch.closed ? "Closed" : "Open"}</span>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Name</div>
            ${renderNameInput(ch.id, ch.name, ch.readonly)}
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
            ${renderProfileSelect(ch.id, ch.current_profile || "default")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Provider</div>
            ${renderProviderSelect(ch.id, ch.current_provider || "default")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Model</div>
            ${renderModelSelect(ch.id, ch.current_provider || "default", ch.current_model || "")}
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Planning Mode</div>
            ${renderPlanningModeSelect(ch.id, ch.planning_mode || "")}
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

// ── Wire channel filter controls ──

export function wireChannelFilterControls(onReload: () => void): void {
  const refreshBtn = document.getElementById("refresh-channels-btn");
  if (refreshBtn && !refreshBtn.getAttribute("data-wired")) {
    refreshBtn.setAttribute("data-wired", "1");
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.setAttribute("disabled", "true");
      refreshBtn.textContent = "⟳ Loading...";
      await onReload();
      refreshBtn.removeAttribute("disabled");
      refreshBtn.textContent = "⟳ Refresh";
    });
  }
  const resetBtn = document.getElementById("reset-channels-filter");
  if (resetBtn && !resetBtn.getAttribute("data-wired")) {
    resetBtn.setAttribute("data-wired", "1");
    resetBtn.addEventListener("click", async () => {
      resetBtn.setAttribute("disabled", "true");
      resetBtn.textContent = "✕ Resetting...";
      _channelFilters = { channelId: "", platform: "all", status: "all" };
      await onReload();
      resetBtn.removeAttribute("disabled");
      resetBtn.textContent = "✕ Reset";
    });
  }

  const chIdInput = document.getElementById("filter-channel-id");
  if (chIdInput && !chIdInput.getAttribute("data-wired")) {
    chIdInput.setAttribute("data-wired", "1");
    chIdInput.addEventListener("input", () => {
      _channelFilters.channelId = (chIdInput as HTMLInputElement).value;
      onReload();
    });
  }
  const platformSel = document.getElementById("filter-platform");
  if (platformSel && !platformSel.getAttribute("data-wired")) {
    platformSel.setAttribute("data-wired", "1");
    platformSel.addEventListener("change", () => {
      _channelFilters.platform = (platformSel as HTMLSelectElement).value;
      onReload();
    });
  }
  const statusSel = document.getElementById("filter-channel-status");
  if (statusSel && !statusSel.getAttribute("data-wired")) {
    statusSel.setAttribute("data-wired", "1");
    statusSel.addEventListener("change", () => {
      _channelFilters.status = (statusSel as HTMLSelectElement).value;
      onReload();
    });
  }
}

// ── Wire open/close toggle buttons ──

export function wireChannelToggleButtons(onReload: () => void): void {
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
        onReload();
      } catch (e) {
        (window as any).showToast?.("Failed: " + (e instanceof Error ? e.message : "Unknown"), "error");
      }
    });
  });
}
