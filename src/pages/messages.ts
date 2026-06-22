import { apiGet, type MessagesResponse, type MessagesFilters } from "../lib/api";
import { renderMessageCard, wireMessageCardToggles, typeColor } from "../lib/message-card";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";

// ── State ──
interface FilterState {
  channel_id: string;
  thread_id: string;
  role: string;
  provider: string;
  model: string;
  types: string[];
  subtype: string;
  seq0: boolean;
}

let currentFilters: FilterState = {
  channel_id: "all",
  thread_id: "",
  role: "all",
  provider: "all",
  model: "all",
  types: [],
  subtype: "",
  seq0: false,
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
  if (currentFilters.seq0) params.set("seq0", "true");
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
  const seq0 = p.get("seq0");
  if (seq0 === "true") currentFilters.seq0 = true;
  const offset = p.get("offset");
  if (offset) currentOffset = parseInt(offset, 10) || 0;
}

// ── Sync filter controls to currentFilters state ──
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
        <label class="filter-label">Seq</label>
        <label class="filter-checkbox-label">
          <input type="checkbox" id="filter-seq0" />
          <span>Seq-0 only</span>
        </label>
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
    seq0: false,
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

  // Seq-0 only checkbox
  const seq0Checkbox = document.getElementById("filter-seq0") as HTMLInputElement;
  if (seq0Checkbox) {
    seq0Checkbox.addEventListener("change", () => {
      currentFilters.seq0 = seq0Checkbox.checked;
      currentOffset = 0;
      void loadMessages();
    });
  }

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
      seq0: false,
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

  const seq0Checkbox = document.getElementById("filter-seq0") as HTMLInputElement | null;
  if (seq0Checkbox) seq0Checkbox.checked = currentFilters.seq0;

  // Sync subtype input
  const subtypeInput = document.getElementById("filter-subtype") as HTMLInputElement | null;
  if (subtypeInput) subtypeInput.value = currentFilters.subtype;

  // Sync type filter buttons
  const allTypeBtns = document.querySelectorAll(".type-filter-btn");
  if (allTypeBtns.length > 0) {
    allTypeBtns.forEach((b) => b.classList.remove("selected"));
    if (currentFilters.types.length === 0) {
      const allBtn = document.querySelector('.type-filter-btn[data-type="all"]');
      if (allBtn) allBtn.classList.add("selected");
    } else {
      for (const t of currentFilters.types) {
        const btn = document.querySelector(`.type-filter-btn[data-type="${t}"]`);
        if (btn) btn.classList.add("selected");
      }
    }
  }

  syncSelectDisplay("filter-channel");
  syncSelectDisplay("filter-provider");
  syncSelectDisplay("filter-model");
  syncSelectDisplay("filter-role");
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
    if (currentFilters.seq0) params.set("seq0", "true");
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
    wireMessageCardToggles(listEl);

    // Post-render: remove has-more class and button for content that doesn't actually overflow
    listEl.querySelectorAll(".ev-content-text.has-more").forEach((el) => {
      const textEl = el as HTMLElement;
      if (textEl.scrollHeight <= textEl.clientHeight) {
        textEl.classList.remove("has-more");
        const btn = textEl.parentElement?.querySelector(".ev-expand-btn");
        if (btn) btn.remove();
      }
    });

    // Wire up thread link clicks → SPA navigation to threads page
    listEl.querySelectorAll(".ev-thread-link").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const threadId = (e.currentTarget as HTMLElement).getAttribute("data-thread-id");
        if (!threadId) return;
        const url = `/threads?thread_id=${encodeURIComponent(threadId)}`;
        document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
          const navRoute = n.getAttribute("data-route") || "";
          n.classList.toggle("active", navRoute === "threads");
        });
        history.pushState({}, "", url);
        // Import router dynamically and navigate (void for @typescript-eslint/no-floating-promises)
        void import("../lib/router").then(({ router }) => router.go("threads"));
      });
    });

    // Sync current filters to URL search params
    syncFiltersToUrl();
  } catch (e) {
    listEl.innerHTML = `<div class="error-state">Failed to load messages: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
