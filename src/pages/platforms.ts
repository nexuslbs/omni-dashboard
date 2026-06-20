import { apiGet, apiPost, apiDelete, type PlatformData } from "../lib/api";

export function renderPlatforms(container: HTMLElement): void {
  const currentRoute = window.location.pathname.slice(1) || "settings";
  container.innerHTML = `
    <div class="settings-tabs">
      <a href="/settings" class="settings-tab ${currentRoute === "settings" ? "active" : ""}" data-route="settings">Settings</a>
      <a href="/profiles" class="settings-tab ${currentRoute === "profiles" ? "active" : ""}" data-route="profiles">Profiles</a>
      <a href="/channels" class="settings-tab ${currentRoute === "channels" ? "active" : ""}" data-route="channels">Channels</a>
      <a href="/platforms" class="settings-tab ${currentRoute === "platforms" ? "active" : ""}" data-route="platforms">Platforms</a>
    </div>
    <div id="platforms-content">
      <div class="loading" style="padding:3rem;text-align:center;">Loading platforms...</div>
    </div>
  `;
  void loadPlatforms();
}

// ── State ──

let platformsData: PlatformData[] = [];

async function loadPlatforms(): Promise<void> {
  const content = document.getElementById("platforms-content")!;
  try {
    platformsData = await apiGet<PlatformData[]>("/platforms");
    content.innerHTML = renderPlatformsPage(platformsData);
    wirePlatforms();
  } catch (e) {
    content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;">Failed to load platforms: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderPlatformsPage(platforms: PlatformData[]): string {
  if (!platforms || platforms.length === 0) {
    return '<div class="empty-state">No platforms found</div>';
  }

  return platforms
    .map(
      (p, idx) => `
    <div class="card settings-card" data-platform-idx="${idx}">
      <div class="card-header">
        <span class="card-title platform-label">
          <span class="platform-name">${escapeHtml(p.name)}</span>
          <span class="platform-status-dot ${p.active ? "dot-active" : "dot-inactive"}"></span>
          <span class="platform-status-text">${p.active ? "Active" : "Inactive"}</span>
        </span>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <div class="setting-controls">
            <div class="setting-name">Active</div>
            <span class="status-badge ${p.active ? "status-badge-success" : "status-badge-error"}">${p.active ? "Active" : "Inactive"}</span>
          </div>
        </div>

        <h3 class="settings-subsection-title">Resource Identifiers</h3>
        ${
          p.resource_identifiers.length === 0
            ? '<p class="text-muted" style="font-size:0.85rem;padding:0.5rem 0;">No resource identifiers</p>'
            : `<div class="resource-id-list">
              ${p.resource_identifiers
                .map(
                  (ri) => `
                <div class="resource-id-row">
                  <code class="ri-code">${escapeHtml(ri.resource_identifier || "—")}</code>
                  <span class="ri-arrow">→</span>
                  <a href="/channels" class="ri-channel-link" data-route="channels">${escapeHtml(ri.channel_name)}</a>
                  <span class="ri-stats">
                    ${ri.closed ? '<span class="badge badge-error">Closed</span>' : '<span class="badge badge-success">Open</span>'}
                    <span class="ri-profile">${escapeHtml(ri.profile || "default")}</span>
                  </span>
                </div>
              `,
                )
                .join("")}
            </div>`
        }

        <h3 class="settings-subsection-title">Listens To</h3>
        <div class="subscription-section">
          ${renderSubscriptionSection(p)}
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

function renderSubscriptionSection(platform: PlatformData): string {
  const rows: string[] = [];

  // Show existing subscriptions grouped by subscriber_resource
  for (const sub of platform.subscriptions) {
    for (const ch of sub.channels) {
      rows.push(`
        <div class="subscription-row" data-sub-id="${sub.id}" data-sub-resource="${escapeHtml(sub.subscriber_resource)}">
          <code class="ri-code">${escapeHtml(sub.subscriber_resource)}</code>
          <span class="ri-arrow">→</span>
          <span class="sub-channel-name">${escapeHtml(ch.name)} <span class="channel-tag-platform">(${escapeHtml(ch.platform)})</span></span>
          <button type="button" class="sub-remove-btn" data-sub-id="${sub.id}" title="Remove subscription">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `);
    }
  }

  // If no subscriptions
  if (rows.length === 0) {
    rows.push(
      '<p class="text-muted" style="font-size:0.85rem;padding:0.5rem 0;">No subscriptions — this platform does not listen to any channels</p>',
    );
  }

  // Add subscription form using filter-bar styled selects
  const addForm = `
    <div class="add-subscription-form">
      <div class="filter-bar subscription-filter-bar">
        <div class="filter-section">
          <label class="filter-label">Resource</label>
          <select class="filter-select add-sub-resource" style="min-width:180px;">
            <option value="">Select resource...</option>
            ${platform.resource_identifiers
              .map(
                (ri) =>
                  `<option value="${escapeHtml(ri.resource_identifier || "")}">${escapeHtml(ri.resource_identifier || "—")} (${escapeHtml(ri.channel_name)})</option>`,
              )
              .join("")}
          </select>
        </div>
        <span class="ri-arrow">→</span>
        <div class="filter-section">
          <label class="filter-label">Channel</label>
          <select class="filter-select add-sub-channel" style="min-width:200px;">
            <option value="">Select channel...</option>
            ${platform.all_channels
              .map(
                (ch) =>
                  `<option value="${ch.id}">${escapeHtml(ch.name)} (${escapeHtml(ch.platform)})</option>`,
              )
              .join("")}
          </select>
        </div>
        <button type="button" class="sub-add-btn" data-platform="${escapeHtml(platform.name)}">Subscribe</button>
      </div>
    </div>
  `;

  return rows.join("") + addForm;
}

function wirePlatforms(): void {
  // Remove subscription buttons
  document.querySelectorAll(".sub-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const subId = btn.getAttribute("data-sub-id");
      if (!subId) return;
      const platformName = btn.closest(".card")?.querySelector(".platform-name")?.textContent;
      if (!platformName) return;
      if (!confirm("Remove this subscription?")) return;
      void removeSubscription(platformName.trim(), subId, btn);
    });
  });

  // Add subscription buttons
  document.querySelectorAll(".sub-add-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".card") as HTMLElement | null;
      if (!card) return;
      const platform = btn.getAttribute("data-platform");
      const resourceSelect = card.querySelector(".add-sub-resource") as HTMLSelectElement | null;
      const channelSelect = card.querySelector(".add-sub-channel") as HTMLSelectElement | null;
      if (!platform || !resourceSelect || !channelSelect) return;

      const subscriberResource = resourceSelect.value;
      const channelId = channelSelect.value;
      if (!subscriberResource || !channelId) {
        (window as any).showToast?.("Select both a resource and a channel", "error");
        return;
      }
      void addSubscription(platform, subscriberResource, parseInt(channelId, 10));
    });
  });

  // Enhance subscription selects with custom dropdown (replaces OS-native)
  document.querySelectorAll(".add-sub-resource, .add-sub-channel").forEach((select) => {
    enhanceSelectElement(select as HTMLSelectElement);
  });
}

// ── Enhanced dropdown helper (replaces native <select> with custom dark-themed dropdown) ──
// Options are appended to document.body to escape backdrop-filter stacking contexts.

/** Track the currently open floating dropdown so we can close it. */
let _openFloatingDropdown: HTMLElement | null = null;

function enhanceSelectElement(select: HTMLSelectElement): void {
  if (!select || (select as any).dataset._enhanced) return;
  (select as any).dataset._enhanced = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  wrapper.style.position = "relative";

  function buildOptions(): void {
    const selected = Array.from(select.options).find((o) => o.selected) || select.options[0];
    // Only rebuild the trigger — the floating dropdown is managed separately
    wrapper.innerHTML = `
      <div class="select-trigger">
        <span class="select-trigger-text">${selected ? escapeHtml(selected.label) : ""}</span>
        <span class="select-arrow">▾</span>
      </div>
    `;
  }

  buildOptions();

  select.style.display = "none";
  select.parentNode?.insertBefore(wrapper, select.nextSibling);

  const trigger = wrapper.querySelector(".select-trigger") as HTMLElement;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Close any other open floating dropdown
    closeFloatingDropdown();

    // Build the floating dropdown
    const rect = trigger.getBoundingClientRect();
    const float = document.createElement("div");
    float.className = "select-options";
    float.style.cssText = `
      position: fixed;
      z-index: 10000;
      left: ${rect.left}px;
      top: ${rect.bottom + 4}px;
      min-width: ${Math.max(rect.width, 200)}px;
      background: var(--bg-secondary, #1a1a2e);
      border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      max-height: 240px;
      overflow-y: auto;
    `;

    // Check if there's enough room below; if not, open upward
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const ddHeight = Math.min(240);
    if (spaceBelow < 240 && spaceAbove > spaceBelow) {
      float.style.top = "auto";
      float.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      float.style.maxHeight = `${Math.min(spaceAbove - 8, 240)}px`;
    } else {
      float.style.maxHeight = `${Math.min(spaceBelow - 8, 240)}px`;
    }

    float.innerHTML = Array.from(select.options)
      .map(
        (o) =>
          `<div class="select-option${o.selected ? " selected" : ""}" data-value="${o.value}">${escapeHtml(o.label)}</div>`,
      )
      .join("");

    // Option click
    float.addEventListener("click", (ev) => {
      const opt = (ev.target as HTMLElement).closest(".select-option") as HTMLElement;
      if (!opt) return;
      const value = opt.getAttribute("data-value");
      if (value !== null) {
        select.value = value;
        const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement;
        if (textEl) textEl.textContent = opt.textContent;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      closeFloatingDropdown();
    });

    document.body.appendChild(float);
    _openFloatingDropdown = float;
  });

  // Close on any click outside
  document.addEventListener(
    "click",
    () => {
      closeFloatingDropdown();
    },
    { once: false },
  );
}

function closeFloatingDropdown(): void {
  if (_openFloatingDropdown) {
    _openFloatingDropdown.remove();
    _openFloatingDropdown = null;
  }
}

async function removeSubscription(platform: string, subId: string, btn: Element): Promise<void> {
  try {
    await apiDelete(`/platforms/${encodeURIComponent(platform)}/subscribe/${subId}`);
    const row = btn.closest(".subscription-row");
    if (row) row.remove();
    (window as any).showToast?.("Subscription removed", "success");
  } catch (e) {
    (window as any).showToast?.("Failed to remove: " + (e instanceof Error ? e.message : "Unknown"), "error");
  }
}

async function addSubscription(
  platform: string,
  subscriberResource: string,
  channelId: number,
): Promise<void> {
  try {
    await apiPost(`/platforms/${encodeURIComponent(platform)}/subscribe`, {
      subscriber_resource: subscriberResource,
      channel_id: channelId,
    });
    (window as any).showToast?.("Subscription added", "success");
    // Reload the page to reflect changes
    void loadPlatforms();
  } catch (e) {
    (window as any).showToast?.("Failed to add: " + (e instanceof Error ? e.message : "Unknown"), "error");
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
