import { apiGet, type MessagesResponse, type MessagesFilters } from "../lib/api";

// ── State ──
interface FilterState {
  channel_id: string;
  thread_id: string;
  role: string;
  provider: string;
  model: string;
  types: string[];
  subtype: string;
}

let currentFilters: FilterState = {
  channel_id: "all",
  thread_id: "",
  role: "all",
  provider: "all",
  model: "all",
  types: [],
  subtype: "",
};

let allFilters: MessagesFilters | null = null;

// ── Pagination state ──
let currentOffset = 0;
const currentLimit = 50;

// ── URL search param sync ──
function syncFiltersToUrl(): void {
  const params = new URLSearchParams();
  if (currentFilters.channel_id !== "all") params.set("channel_id", currentFilters.channel_id);
  if (currentFilters.thread_id) params.set("thread_id", currentFilters.thread_id);
  if (currentFilters.role !== "all") params.set("role", currentFilters.role);
  if (currentFilters.provider !== "all") params.set("provider", currentFilters.provider);
  if (currentFilters.model !== "all") params.set("model", currentFilters.model);
  if (currentFilters.types.length > 0) {
    for (const t of currentFilters.types) params.append("type", t);
  }
  if (currentFilters.subtype) params.set("subtype", currentFilters.subtype);
  if (currentOffset > 0) params.set("offset", String(currentOffset));
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function applyFiltersFromUrl(): void {
  const p = new URLSearchParams(window.location.search);
  const channelId = p.get("channel_id");
  if (channelId) currentFilters.channel_id = channelId;
  const threadId = p.get("thread_id");
  if (threadId) currentFilters.thread_id = threadId;
  const role = p.get("role");
  if (role) currentFilters.role = role;
  const provider = p.get("provider");
  if (provider) currentFilters.provider = provider;
  const model = p.get("model");
  if (model) currentFilters.model = model;
  const types = p.getAll("type");
  if (types.length > 0) currentFilters.types = types;
  const subtype = p.get("subtype");
  if (subtype) currentFilters.subtype = subtype;
  const offset = p.get("offset");
  if (offset) currentOffset = parseInt(offset, 10) || 0;
}

// ── Role badge colors ──
const ROLE_COLORS: Record<string, string> = {
  user: "#3b82f6",
  agent: "#10b981",
  system: "#f59e0b",
  tool: "#8b5cf6",
};

function roleColor(role: string): string {
  return ROLE_COLORS[role.toLowerCase()] || "#64748b";
}

// ── Type badge colors ──
const TYPE_COLORS: Record<string, string> = {
  prompt: "#3b82f6",
  response: "#10b981",
  reasoning: "#f59e0b",
  tool: "#8b5cf6",
  tool_output: "#a78bfa",
  iteration: "#64748b",
  delegate_result: "#f43f5e",
  skill: "#06b6d4",
};

function typeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] || "#64748b";
}

function statusBadgeStyle(status: string | null): string {
  const s = (status || "unknown").toLowerCase();
  const color =
    s === "completed" || s === "success"
      ? "#10b981"
      : s === "failed" || s === "error"
        ? "#f43f5e"
        : s === "processing"
          ? "#f59e0b"
          : s === "pending"
            ? "#3b82f6"
            : s === "skipped"
              ? "#64748b"
              : "#64748b";
  return `--type-color:${color};background:${color}22;border-color:${color}44;color:${color}`;
}

// ── Main render ──
export function renderMessages(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Messages</h1>
        <p class="page-subtitle">Message log with filtering and search</p>
      </div>
    </div>
    <div class="filter-bar" id="filter-bar">
      <div class="filter-section">
        <label class="filter-label">Channel</label>
        <select class="filter-select" id="filter-channel">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Thread ID</label>
        <input class="filter-input" id="filter-thread" type="text" placeholder="Thread ID..." />
      </div>
      <div class="filter-section">
        <label class="filter-label">Role</label>
        <select class="filter-select" id="filter-role">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Type</label>
        <div class="type-filter-group" id="filter-type-group"></div>
      </div>
      <div class="filter-section">
        <label class="filter-label">Subtype</label>
        <input class="filter-input" id="filter-subtype" type="text" placeholder="Filter by subtype..." />
      </div>
      <div class="filter-section">
        <label class="filter-label">Provider</label>
        <select class="filter-select" id="filter-provider">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Model</label>
        <select class="filter-select" id="filter-model">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="btn-refresh">⟳ Refresh</button>
        <button class="btn btn-secondary" id="btn-reset">✕ Reset</button>
      </div>
    </div>
    <div class="events-count" id="messages-count"></div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Messages</span>
        <span class="events-nav" id="messages-nav">
          <button class="nav-btn" id="prev-page" disabled>← Prev</button>
          <span id="page-info">Page 1</span>
          <button class="nav-btn" id="next-page" disabled>Next →</button>
        </span>
      </div>
      <div class="card-body" id="messages-list">
        <div class="loading">Loading messages</div>
      </div>
      <div class="card-footer" id="messages-bottom-nav" style="padding:0.75rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between">
        <span class="events-count" id="messages-count-bottom"></span>
        <span class="events-nav">
          <button class="nav-btn" id="prev-page-bottom" disabled>← Prev</button>
          <span id="page-info-bottom">Page 1</span>
          <button class="nav-btn" id="next-page-bottom" disabled>Next →</button>
        </span>
      </div>
    </div>
  `;

  // Reset state
  currentFilters = {
    channel_id: "all",
    thread_id: "",
    role: "all",
    provider: "all",
    model: "all",
    types: [],
    subtype: "",
  };
  currentOffset = 0;
  allFilters = null;

  applyFiltersFromUrl();
  void loadFilters();
}

// ── Load filter data ──
async function loadFilters(): Promise<void> {
  try {
    allFilters = await apiGet<MessagesFilters>("/messages/filters");
    populateFilterControls();
    syncFilterStateToControls();
    void loadMessages();
  } catch (e) {
    console.error("Failed to load filters:", e);
    document.getElementById("messages-list")!.innerHTML =
      `<div class="error-state">Failed to load filters: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Populate filter controls ──
function populateFilterControls(): void {
  if (!allFilters) return;

  // Channel select
  const channelSel = document.getElementById("filter-channel") as HTMLSelectElement;
  channelSel.innerHTML = '<option value="all">All</option>';
  for (const ch of allFilters.channels) {
    channelSel.innerHTML += `<option value="${ch.id}">${escapeHtml(ch.name)} (${ch.count})</option>`;
  }

  // Role select (populated from API)
  const roleSel = document.getElementById("filter-role") as HTMLSelectElement;
  roleSel.innerHTML = '<option value="all">All</option>';
  if (allFilters.roles) {
    for (const r of allFilters.roles) {
      roleSel.innerHTML += `<option value="${escapeHtml(r)}">${escapeHtml(r.charAt(0).toUpperCase() + r.slice(1))}</option>`;
    }
  }

  // Provider select
  const provSel = document.getElementById("filter-provider") as HTMLSelectElement;
  provSel.innerHTML = '<option value="all">All</option>';
  for (const p of allFilters.providers) {
    provSel.innerHTML += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
  }

  // Model select
  const modelSel = document.getElementById("filter-model") as HTMLSelectElement;
  modelSel.innerHTML = '<option value="all">All</option>';
  for (const m of allFilters.models) {
    modelSel.innerHTML += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`;
  }

  // Type toggle buttons
  const typeGroup = document.getElementById("filter-type-group")!;
  typeGroup.innerHTML = `<button class="type-filter-btn selected" data-type="all">All</button>`;
  if (allFilters.types) {
    for (const t of allFilters.types) {
      const color = typeColor(t);
      typeGroup.innerHTML += `<button class="type-filter-btn" data-type="${t}" style="--type-color:${color}">${t}</button>`;
    }
  }

  // Wire up events
  wireFilterEvents();

  // Enhance select elements with custom dropdowns
  enhanceSelect("filter-channel");
  enhanceSelect("filter-role");
  enhanceSelect("filter-provider");
  enhanceSelect("filter-model");
}

// ── Wire filter change events ──
function wireFilterEvents(): void {
  // Channel select
  document.getElementById("filter-channel")!.addEventListener("change", (e) => {
    currentFilters.channel_id = (e.target as HTMLSelectElement).value;
    currentOffset = 0;
    void loadMessages();
  });

  // Thread ID input (debounced)
  const threadInput = document.getElementById("filter-thread") as HTMLInputElement;
  let threadTimer: ReturnType<typeof setTimeout> | null = null;
  threadInput.addEventListener("input", () => {
    if (threadTimer) clearTimeout(threadTimer);
    threadTimer = setTimeout(() => {
      currentFilters.thread_id = threadInput.value;
      currentOffset = 0;
      void loadMessages();
    }, 300);
  });

  // Role select
  document.getElementById("filter-role")!.addEventListener("change", (e) => {
    currentFilters.role = (e.target as HTMLSelectElement).value;
    currentOffset = 0;
    void loadMessages();
  });

  // Provider select
  document.getElementById("filter-provider")!.addEventListener("change", (e) => {
    currentFilters.provider = (e.target as HTMLSelectElement).value;
    currentOffset = 0;
    void loadMessages();
  });

  // Model select
  document.getElementById("filter-model")!.addEventListener("change", (e) => {
    currentFilters.model = (e.target as HTMLSelectElement).value;
    currentOffset = 0;
    void loadMessages();
  });

  // Type filter toggle buttons
  document.querySelectorAll(".type-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = (btn as HTMLElement).getAttribute("data-type") || "";
      if (type === "all") {
        document.querySelectorAll(".type-filter-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        currentFilters.types = [];
      } else {
        const allBtn = document.querySelector('.type-filter-btn[data-type="all"]');
        if (allBtn) allBtn.classList.remove("selected");
        btn.classList.toggle("selected");
        const selected: string[] = [];
        document.querySelectorAll(".type-filter-btn.selected").forEach((b) => {
          const t = (b as HTMLElement).getAttribute("data-type");
          if (t && t !== "all") selected.push(t);
        });
        currentFilters.types = selected;
        if (selected.length === 0) {
          if (allBtn) allBtn.classList.add("selected");
        }
      }
      currentOffset = 0;
      void loadMessages();
    });
  });

  // Subtype input (debounced)
  const subtypeInput = document.getElementById("filter-subtype") as HTMLInputElement;
  let subtypeTimer: ReturnType<typeof setTimeout> | null = null;
  subtypeInput.addEventListener("input", () => {
    if (subtypeTimer) clearTimeout(subtypeTimer);
    subtypeTimer = setTimeout(() => {
      currentFilters.subtype = subtypeInput.value;
      currentOffset = 0;
      void loadMessages();
    }, 300);
  });

  // Refresh button
  document.getElementById("btn-refresh")!.addEventListener("click", () => {
    void loadMessages();
  });

  // Reset button
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    currentFilters = {
      channel_id: "all",
      thread_id: "",
      role: "all",
      provider: "all",
      model: "all",
      types: [],
      subtype: "",
    };
    currentOffset = 0;
    syncFilterStateToControls();
    history.replaceState(null, "", window.location.pathname);
    void loadMessages();
  });

  // Pagination
  document.getElementById("prev-page")!.addEventListener("click", () => {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - currentLimit);
      void loadMessages();
    }
  });
  document.getElementById("next-page")!.addEventListener("click", () => {
    currentOffset += currentLimit;
    void loadMessages();
  });
  document.getElementById("prev-page-bottom")!.addEventListener("click", () => {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - currentLimit);
      void loadMessages();
    }
  });
  document.getElementById("next-page-bottom")!.addEventListener("click", () => {
    currentOffset += currentLimit;
    void loadMessages();
  });
}

// ── Sync filter controls to currentFilters state ──
function syncFilterStateToControls(): void {
  const channelSel = document.getElementById("filter-channel") as HTMLSelectElement | null;
  if (channelSel) channelSel.value = currentFilters.channel_id;

  const threadInput = document.getElementById("filter-thread") as HTMLInputElement | null;
  if (threadInput) threadInput.value = currentFilters.thread_id;

  const roleSel = document.getElementById("filter-role") as HTMLSelectElement | null;
  if (roleSel) roleSel.value = currentFilters.role;

  const providerSel = document.getElementById("filter-provider") as HTMLSelectElement | null;
  if (providerSel) providerSel.value = currentFilters.provider;

  const modelSel = document.getElementById("filter-model") as HTMLSelectElement | null;
  if (modelSel) modelSel.value = currentFilters.model;

  syncSelectDisplay("filter-channel");
  syncSelectDisplay("filter-provider");
  syncSelectDisplay("filter-model");
  syncSelectDisplay("filter-role");
}

// ── Custom dropdown (replaces native <select> for theme control) ──
function enhanceSelect(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select || (select as any).dataset._enhanced) return;
  (select as any).dataset._enhanced = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";

  function buildOptions(): void {
    const selected = Array.from(select.options).find((o) => o.selected) || select.options[0];
    wrapper.innerHTML = `
      <div class="select-trigger">
        <span class="select-trigger-text">${selected ? escapeHtml(selected.label) : ""}</span>
        <span class="select-arrow">▾</span>
      </div>
      <div class="select-options">
        ${Array.from(select.options)
          .map(
            (o) =>
              `<div class="select-option${o.selected ? " selected" : ""}" data-value="${o.value}">${escapeHtml(o.label)}</div>`,
          )
          .join("")}
      </div>
    `;
  }

  buildOptions();

  select.style.display = "none";
  select.parentNode?.insertBefore(wrapper, select.nextSibling);

  const trigger = wrapper.querySelector(".select-trigger") as HTMLElement;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains("open");
    document.querySelectorAll(".custom-select.open").forEach((c) => c.classList.remove("open"));
    if (!isOpen) wrapper.classList.add("open");
  });

  wrapper.querySelector(".select-options")!.addEventListener("click", (e) => {
    const opt = (e.target as HTMLElement).closest(".select-option") as HTMLElement;
    if (!opt) return;
    const value = opt.getAttribute("data-value");
    if (value) {
      select.value = value;
      const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement;
      if (textEl) textEl.textContent = opt.textContent;
      wrapper.querySelectorAll(".select-option").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    wrapper.classList.remove("open");
  });

  document.addEventListener("click", () => wrapper.classList.remove("open"));
}

function syncSelectDisplay(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select) return;
  const wrapper = select.nextElementSibling as HTMLElement;
  if (!wrapper || !wrapper.classList.contains("custom-select")) return;

  const selected = Array.from(select.options).find((o) => o.selected) || select.options[0];
  const textEl = wrapper.querySelector(".select-trigger-text") as HTMLElement;
  if (textEl) textEl.textContent = selected ? selected.label : "";

  wrapper.querySelectorAll(".select-option").forEach((o) => {
    o.classList.toggle("selected", o.getAttribute("data-value") === select.value);
  });
}

// ── Load messages ──
async function loadMessages(): Promise<void> {
  const listEl = document.getElementById("messages-list")!;
  const countEl = document.getElementById("messages-count")!;
  const prevBtn = document.getElementById("prev-page") as HTMLButtonElement;
  const nextBtn = document.getElementById("next-page") as HTMLButtonElement;
  const pageInfo = document.getElementById("page-info")!;
  const countBottom = document.getElementById("messages-count-bottom")!;
  const prevBottom = document.getElementById("prev-page-bottom") as HTMLButtonElement;
  const nextBottom = document.getElementById("next-page-bottom") as HTMLButtonElement;
  const pageInfoBottom = document.getElementById("page-info-bottom")!;

  listEl.innerHTML = '<div class="loading">Loading messages</div>';

  try {
    const params = new URLSearchParams();
    params.set("limit", String(currentLimit));
    params.set("offset", String(currentOffset));
    params.set("channel_id", currentFilters.channel_id);
    if (currentFilters.thread_id) params.set("thread_id", currentFilters.thread_id);
    if (currentFilters.role !== "all") params.set("role", currentFilters.role);
    if (currentFilters.provider !== "all") params.set("provider", currentFilters.provider);
    if (currentFilters.model !== "all") params.set("model", currentFilters.model);
    for (const t of currentFilters.types) {
      params.append("type", t);
    }
    if (currentFilters.subtype) params.set("subtype", currentFilters.subtype);
    const data = await apiGet<MessagesResponse>(`/messages/events?${params.toString()}`);

    // Update nav
    const totalPages = Math.ceil(data.total / currentLimit);
    const currentPage = Math.floor(currentOffset / currentLimit) + 1;
    prevBtn.disabled = currentOffset <= 0;
    nextBtn.disabled = currentOffset + currentLimit >= data.total;
    prevBottom.disabled = prevBtn.disabled;
    nextBottom.disabled = nextBtn.disabled;

    // Update count
    const start = data.total > 0 ? currentOffset + 1 : 0;
    const end = Math.min(currentOffset + data.messages.length, data.total);
    const countText =
      data.total > 0 ? `Showing ${start}–${end} of ${data.total} messages` : "No messages found";
    countEl.textContent = countText;
    countBottom.textContent = countText;

    pageInfo.textContent = data.total > 0 ? `Page ${currentPage} of ${totalPages}` : "";
    pageInfoBottom.textContent = pageInfo.textContent;

    if (data.messages.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No messages match the current filters</div>`;
      return;
    }

    // Render messages as cards
    listEl.innerHTML = `
      <div class="events-scroll" id="messages-scroll">
        ${data.messages.map((msg) => renderMessageCard(msg)).join("")}
      </div>
    `;

    // Wire up show more/less toggles
    listEl.querySelectorAll(".ev-expand-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const card = (e.currentTarget as HTMLElement).closest(".event-row")!;
        const isExpanded = card.classList.toggle("expanded");
        (e.currentTarget as HTMLElement).textContent = isExpanded ? "Show less" : "Show more";
      });
    });

    // Sync current filters to URL search params
    syncFiltersToUrl();
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load messages: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Render a single message as a card block ──
function renderMessageCard(msg: any): string {
  const role = msg.role || "unknown";
  const rColor = roleColor(role);
  const isEmpty = !msg.content;
  const content = msg.content ? escapeHtml(msg.content) : "";
  const hasMore = msg.content && msg.content.length > 200;
  const ts = formatRelativeTime(
    new Date(msg.created_at.endsWith("Z") ? msg.created_at : msg.created_at + "Z"),
  );
  const tsFull = new Date(
    msg.created_at.endsWith("Z") ? msg.created_at : msg.created_at + "Z",
  ).toLocaleString();
  const tokens = msg.token_usage
    ? (msg.token_usage.prompt_tokens || 0) + (msg.token_usage.completion_tokens || 0)
    : 0;
  const channelStr = msg.channel_name ? escapeHtml(msg.channel_name) : "";

  return `
    <div class="event-row" data-msg-id="${msg.id}">
      <div class="event-row-header">
        <span class="ev-id-badge" title="Message ID">#${msg.id}</span>
        ${channelStr ? `<span class="badge badge-neutral" title="Channel ID">${channelStr}</span>` : ""}
        <span class="agent-badge" title="Role: ${escapeHtml(role)}" style="--agent-color:${rColor};background:${rColor}22;border-color:${rColor}44;color:${rColor}">
          ${escapeHtml(role)}
        </span>
        <span class="event-type-badge" title="Status: ${escapeHtml(msg.status || "unknown")}" style="${statusBadgeStyle(msg.status)}">
          ${escapeHtml(msg.status || "unknown")}
        </span>
        ${msg.type ? `<span class="event-type-badge" title="Type: ${escapeHtml(msg.type)}" style="--type-color:${typeColor(msg.type)};background:${typeColor(msg.type)}22;border-color:${typeColor(msg.type)}44;color:${typeColor(msg.type)}">${msg.type}</span>` : ""}
        ${msg.subtype ? `<span class="event-subtype" title="Subtype: ${escapeHtml(msg.subtype)}" style="font-size:0.6875rem;color:var(--text-muted);font-style:italic;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${msg.subtype}</span>` : ""}
        <span class="event-row-meta" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.6875rem;color:var(--text-muted)">
          ${msg.provider ? `<span class="ev-provider" title="Provider">${escapeHtml(msg.provider)}</span>` : ""}
          ${msg.provider && msg.model ? `<span style="color:var(--text-muted);opacity:0.4">·</span>` : ""}
          ${msg.model ? `<span class="ev-model" title="Model">${escapeHtml(msg.model)}</span>` : ""}
          ${(msg.provider || msg.model) && (msg.thread_id || msg.processing_time_ms !== null || tokens > 0) ? `<span style="color:var(--text-muted);opacity:0.4">·</span>` : ""}
          ${msg.thread_id ? `<code style="font-size:0.65rem;color:var(--text-secondary);background:rgba(0,0,0,0.2);padding:0.1em 0.3em;border-radius:3px" title="Thread ID">${escapeHtml(truncateMiddle(msg.thread_id, 12))}</code>` : ""}
          ${msg.processing_time_ms !== null ? `<span title="Processing time">${msg.processing_time_ms.toFixed(0)}ms</span>` : ""}
          ${tokens > 0 ? `<span title="Token count">${tokens.toLocaleString()} tokens</span>` : ""}
        </span>
        <span class="ev-time" title="${escapeHtml(tsFull)}">${ts}</span>
      </div>
      <div class="event-content-area">
        <div class="ev-content-text${hasMore && !isEmpty ? " has-more" : ""}">${isEmpty ? "<em>Empty</em>" : content}</div>
        ${hasMore && !isEmpty ? `<button class="ev-expand-btn">Show more</button>` : ""}
      </div>
    </div>
  `;
}

// ── Utilities ──
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + "…" + str.slice(str.length - half);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
