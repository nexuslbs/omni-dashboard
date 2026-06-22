import { apiGet, apiPost, type SearchResult } from "../lib/api";
import { enhanceSelect, syncSelectDisplay } from "../lib/dropdown";
import { renderMessageCard, wireMessageCardToggles } from "../lib/message-card";
import { router } from "../lib/router";

const API_BASE = "/api";

// ── Block state ──
let _currentProfile = "default";
let _currentChannel = "";

export async function renderMemory(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Memory</h1>
        <p class="page-subtitle">Profile memory, context, and search</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <label class="filter-label" style="margin:0;">Profile</label>
        <select id="mem-profile-select" class="filter-select">
          <option value="">Loading...</option>
        </select>
      </div>
    </div>

    <div id="mem-blocks" style="display:grid;gap:1rem;">
      <!-- Block 1: Stats -->
      <div class="card">
        <div class="card-header"><span class="card-title">📊 Profile Stats</span></div>
        <div class="card-body" id="mem-stats">
          <div class="loading">Loading stats...</div>
        </div>
      </div>

      <!-- Block 2: Base System Prompt -->
      <div class="card">
        <div class="card-header"><span class="card-title">⚙️ Base System Prompt</span></div>
        <div class="card-body">
          <pre id="mem-system-prompt" class="code-block" style="max-height:400px;overflow-y:auto;font-size:0.8rem;line-height:1.5;margin:0;white-space:pre-wrap;">Loading...</pre>
        </div>
      </div>

      <!-- Block 3: MEMORY text -->
      <div class="card">
        <div class="card-header"><span class="card-title">🧠 MEMORY</span></div>
        <div class="card-body">
          <pre id="mem-memory-text" class="code-block" style="max-height:300px;overflow-y:auto;font-size:0.8rem;line-height:1.5;margin:0 0 0.75rem 0;white-space:pre-wrap;">Loading...</pre>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <button id="mem-memory-upload-btn" class="btn btn-secondary" style="font-size:0.8rem;padding:0.375rem 0.75rem;">📁 Upload .md</button>
            <span id="mem-memory-status" style="font-size:0.75rem;color:var(--text-muted);"></span>
            <input type="file" id="mem-memory-file-input" accept=".md,.txt" style="display:none" />
          </div>
        </div>
      </div>

      <!-- Block 4: SOUL text -->
      <div class="card">
        <div class="card-header"><span class="card-title">💫 SOUL</span></div>
        <div class="card-body">
          <pre id="mem-soul-text" class="code-block" style="max-height:300px;overflow-y:auto;font-size:0.8rem;line-height:1.5;margin:0 0 0.75rem 0;white-space:pre-wrap;">Loading...</pre>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <button id="mem-soul-upload-btn" class="btn btn-secondary" style="font-size:0.8rem;padding:0.375rem 0.75rem;">📁 Upload .md</button>
            <span id="mem-soul-status" style="font-size:0.75rem;color:var(--text-muted);"></span>
            <input type="file" id="mem-soul-file-input" accept=".md,.txt" style="display:none" />
          </div>
        </div>
      </div>

      <!-- Block 5: Channel Context -->
      <div class="card">
        <div class="card-header"><span class="card-title">🔗 Channel Context</span></div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
            <label class="filter-label" style="margin:0;">Channel</label>
            <select id="mem-channel-select" class="filter-select" style="min-width:200px;">
              <option value="">— Select a channel —</option>
            </select>
          </div>
          <div id="mem-channel-stats" style="display:none;">
            <div id="mem-channel-stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.5rem;margin-bottom:0.75rem;"></div>
            <div class="detail-label" style="margin-bottom:0.25rem;">Context Preview</div>
            <div id="mem-channel-context" style="font-size:0.8rem;color:var(--text-secondary);line-height:1.5;max-height:400px;overflow-y:auto;background:var(--bg-card);border-radius:6px;padding:0.75rem;border:1px solid var(--glass-border);white-space:pre-wrap;"></div>
          </div>
          <div id="mem-channel-empty" class="empty-state" style="display:block;">Select a channel to see stats and context</div>
        </div>
      </div>

      <!-- Block 6: Message Search -->
      <div class="card">
        <div class="card-header"><span class="card-title">💬 Message Search</span></div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
            <input type="text" id="mem-msg-search" class="filter-input" placeholder="Type at least 1 character to search messages..." style="flex:1;" />
          </div>
          <div id="mem-msg-results" class="events-scroll"></div>
        </div>
      </div>

      <!-- Block 7: Wiki Search -->
      <div class="card">
        <div class="card-header"><span class="card-title">📚 Wiki Search</span></div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
            <input type="text" id="mem-wiki-search" class="filter-input" placeholder="Type at least 1 character to search wiki..." style="flex:1;" />
          </div>
          <div id="mem-wiki-results"></div>
        </div>
      </div>
    </div>
  `;

  // Load profile select
  await loadProfileSelect();

  // Load channel select
  await loadChannelSelect();

  // Enhance dropdowns
  enhanceSelect("mem-profile-select");
  enhanceSelect("mem-channel-select");

  // Wire profile change
  document.getElementById("mem-profile-select")!.addEventListener("change", onProfileChange);

  // Wire channel change
  document.getElementById("mem-channel-select")!.addEventListener("change", onChannelChange);

  // Wire MEMORY upload
  document.getElementById("mem-memory-upload-btn")!.addEventListener("click", () => {
    (document.getElementById("mem-memory-file-input") as HTMLInputElement).click();
  });
  document.getElementById("mem-memory-file-input")!.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) void uploadMemoryFile(input.files[0], "memory");
  });

  // Wire SOUL upload
  document.getElementById("mem-soul-upload-btn")!.addEventListener("click", () => {
    (document.getElementById("mem-soul-file-input") as HTMLInputElement).click();
  });
  document.getElementById("mem-soul-file-input")!.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) void uploadMemoryFile(input.files[0], "soul");
  });

  // Wire message search with debounce
  let msgDebounce: ReturnType<typeof setTimeout>;
  document.getElementById("mem-msg-search")!.addEventListener("input", () => {
    clearTimeout(msgDebounce);
    const val = (document.getElementById("mem-msg-search") as HTMLInputElement).value.trim();
    if (val.length < 1) {
      document.getElementById("mem-msg-results")!.innerHTML = "";
      return;
    }
    msgDebounce = setTimeout(() => searchMessages(val), 350);
  });

  // Wire wiki search with debounce
  let wikiDebounce: ReturnType<typeof setTimeout>;
  document.getElementById("mem-wiki-search")!.addEventListener("input", () => {
    clearTimeout(wikiDebounce);
    const val = (document.getElementById("mem-wiki-search") as HTMLInputElement).value.trim();
    if (val.length < 1) {
      document.getElementById("mem-wiki-results")!.innerHTML = "";
      return;
    }
    wikiDebounce = setTimeout(() => searchWiki(val), 350);
  });

  // Initial load
  await loadAllBlocks();
}

// ── Profile select ──

async function loadProfileSelect(): Promise<void> {
  const select = document.getElementById("mem-profile-select") as HTMLSelectElement;
  try {
    const profiles = await apiGet<any[]>("/profiles");
    select.innerHTML = profiles
      .map(
        (p) =>
          `<option value="${escapeHtml(p.name)}" ${p.name === _currentProfile ? "selected" : ""}>${escapeHtml(p.name)}</option>`,
      )
      .join("");
  } catch {
    select.innerHTML = '<option value="default">default</option>';
  }
  syncSelectDisplay("mem-profile-select");
}

async function onProfileChange(): Promise<void> {
  const select = document.getElementById("mem-profile-select") as HTMLSelectElement;
  _currentProfile = select.value;
  document.getElementById("mem-channel-context")!.textContent = "";
  document.getElementById("mem-channel-stats")!.style.display = "none";
  document.getElementById("mem-channel-empty")!.style.display = "block";
  await loadAllBlocks();
}

async function loadAllBlocks(): Promise<void> {
  await Promise.all([loadStats(), loadSystemPrompt(), loadMemoryText(), loadSoulText()]);
}

// ── Channel select ──

async function loadChannelSelect(): Promise<void> {
  const select = document.getElementById("mem-channel-select") as HTMLSelectElement;
  try {
    const channels = await apiGet<any[]>("/channels");
    select.innerHTML =
      '<option value="">— Select a channel —</option>' +
      channels
        .map(
          (ch) =>
            `<option value="${ch.id}">${escapeHtml(ch.name || ch.id)}${ch.platform ? ` (${escapeHtml(ch.platform)})` : ""}</option>`,
        )
        .join("");
  } catch {
    select.innerHTML = '<option value="">— Select a channel —</option>';
  }
  syncSelectDisplay("mem-channel-select");
}

async function onChannelChange(): Promise<void> {
  const select = document.getElementById("mem-channel-select") as HTMLSelectElement;
  _currentChannel = select.value;
  if (_currentChannel) {
    await Promise.all([loadChannelStats(), loadChannelContext()]);
  } else {
    document.getElementById("mem-channel-stats")!.style.display = "none";
    document.getElementById("mem-channel-empty")!.style.display = "block";
  }
}

// ── Block 1: Stats ──

async function loadStats(): Promise<void> {
  const el = document.getElementById("mem-stats")!;
  try {
    const params = new URLSearchParams();
    if (_currentProfile) params.set("profile", _currentProfile);
    const stats = await apiGet<any>(`/memory/stats?${params.toString()}`);
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;">
        <div class="stat-card" style="text-align:center;padding:1rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
          <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${stats.threads}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Threads</div>
        </div>
        <div class="stat-card" style="text-align:center;padding:1rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
          <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${stats.messages}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Messages</div>
        </div>
        <div class="stat-card" style="text-align:center;padding:1rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
          <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${stats.vectors}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Vectors (pgvector)</div>
        </div>
        <div class="stat-card" style="text-align:center;padding:1rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
          <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);">${stats.qdrant_wikis}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Wiki Vectors (Qdrant)</div>
        </div>
      </div>
    `;
  } catch {
    el.innerHTML = '<div class="error-state">Failed to load stats</div>';
  }
}

// ── Block 2: System Prompt ──

async function loadSystemPrompt(): Promise<void> {
  const el = document.getElementById("mem-system-prompt")!;
  try {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    const data = await res.json();
    // Look for system_prompt in settings
    let prompt = "";
    if (Array.isArray(data)) {
      for (const cat of data) {
        if (cat.settings) {
          const sp = cat.settings.find((s: any) => s.name === "system_prompt");
          if (sp) {
            prompt = sp.value;
            break;
          }
        }
      }
    }
    if (!prompt) prompt = "System prompt not found in settings.";
    el.textContent = prompt;
  } catch {
    // Try fetching via channel prompt proxy
    try {
      const res = await fetch(`${API_BASE}/prompt-preview/default`);
      if (res.ok) {
        const data = await res.json();
        // Find system message
        if (data.messages) {
          const sys = data.messages.find((m: any) => m.role === "system");
          el.textContent = sys?.content || "No system prompt found.";
          return;
        }
      }
    } catch {
      // ignore
    }
    el.textContent = "Failed to load system prompt.";
  }
}

// ── Block 3 & 4: Memory / Soul text ──

async function loadMemoryText(): Promise<void> {
  const el = document.getElementById("mem-memory-text")!;
  el.textContent = "Loading...";
  try {
    const data = await apiGet<any>(`/memory/text/${encodeURIComponent(_currentProfile)}/memory`);
    el.textContent = data.content || "(empty)";
  } catch {
    el.textContent = "(not set or failed to load)";
  }
}

async function loadSoulText(): Promise<void> {
  const el = document.getElementById("mem-soul-text")!;
  el.textContent = "Loading...";
  try {
    const data = await apiGet<any>(`/memory/text/${encodeURIComponent(_currentProfile)}/soul`);
    el.textContent = data.content || "(empty)";
  } catch {
    el.textContent = "(not set or failed to load)";
  }
}

async function uploadMemoryFile(file: File, type: "memory" | "soul"): Promise<void> {
  const statusEl = document.getElementById(type === "memory" ? "mem-memory-status" : "mem-soul-status")!;
  statusEl.textContent = "Uploading...";
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/memory/upload/${encodeURIComponent(_currentProfile)}/${type}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upload failed" }));
      statusEl.textContent = `❌ ${err.error || "Upload failed"}`;
      return;
    }
    const data = await res.json();
    statusEl.textContent = `✅ Uploaded (${data.size} chars)`;
    // Reload the text
    if (type === "memory") await loadMemoryText();
    else await loadSoulText();
    // Clear status after 3s
    setTimeout(() => {
      statusEl.textContent = "";
    }, 3000);
  } catch (e) {
    statusEl.textContent = `❌ Error: ${e instanceof Error ? e.message : "Unknown"}`;
  }
}

// ── Block 5: Channel stats & context ──

async function loadChannelStats(): Promise<void> {
  const grid = document.getElementById("mem-channel-stats-grid")!;
  try {
    const params = new URLSearchParams();
    params.set("channel", _currentChannel);
    if (_currentProfile) params.set("profile", _currentProfile);
    const stats = await apiGet<any>(`/memory/stats?${params.toString()}`);
    grid.innerHTML = `
      <div class="stat-card" style="text-align:center;padding:0.75rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
        <div style="font-size:1.25rem;font-weight:700;color:var(--text-primary);">${stats.threads}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">Threads</div>
      </div>
      <div class="stat-card" style="text-align:center;padding:0.75rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
        <div style="font-size:1.25rem;font-weight:700;color:var(--text-primary);">${stats.messages}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">Messages</div>
      </div>
      <div class="stat-card" style="text-align:center;padding:0.75rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
        <div style="font-size:1.25rem;font-weight:700;color:var(--text-primary);">${stats.vectors}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">Vectors (pgvector)</div>
      </div>
      <div class="stat-card" style="text-align:center;padding:0.75rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--glass-border);">
        <div style="font-size:1.25rem;font-weight:700;color:var(--text-primary);">${stats.qdrant_wikis}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.25rem;">Wiki Vectors (Qdrant)</div>
      </div>
    `;
  } catch {
    grid.innerHTML = '<div class="error-state" style="grid-column:1/-1;">Failed to load channel stats</div>';
  }
}

async function loadChannelContext(): Promise<void> {
  const el = document.getElementById("mem-channel-context")!;
  const channelSelect = document.getElementById("mem-channel-select") as HTMLSelectElement;
  const channelName =
    channelSelect.options[channelSelect.selectedIndex]?.text.split(" (")[0] || _currentChannel;

  document.getElementById("mem-channel-stats")!.style.display = "block";
  document.getElementById("mem-channel-empty")!.style.display = "none";
  el.textContent = "Loading context...";

  try {
    const res = await fetch(`${API_BASE}/prompt-preview/${encodeURIComponent(channelName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "[memory page context preview]", plan: false }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    if (data.messages && data.messages.length > 0) {
      // Show all messages except the last user message (which is our injected prompt)
      const contextMessages = data.messages.filter(
        (m: any) => !(m.role === "user" && m.content === "[memory page context preview]"),
      );
      if (contextMessages.length === 0) {
        el.textContent = "(system context empty)";
      } else {
        el.textContent = contextMessages
          .map((m: any) => `[${m.role}]\n${m.content || ""}`)
          .join("\n\n---\n\n");
      }
    } else {
      el.textContent = "(no context returned)";
    }
  } catch (e) {
    el.textContent = `Failed to load context: ${e instanceof Error ? e.message : "Unknown error"}`;
  }
}

// ── Block 6: Message Search ──

import { renderMessageCard, wireMessageCardToggles } from "../lib/message-card";

async function searchMessages(query: string): Promise<void> {
  const el = document.getElementById("mem-msg-results")!;
  el.innerHTML = '<div class="loading">Searching messages...</div>';
  try {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("limit", "10");
    if (_currentProfile) params.set("profile", _currentProfile);
    const data = await apiGet<{ messages: any[]; total: number }>(
      `/memory/search-messages?${params.toString()}`,
    );
    if (data.messages.length === 0) {
      el.innerHTML = '<div class="empty-state">No matching messages</div>';
      return;
    }
    el.innerHTML = data.messages.map((msg) => renderMessageCard(msg)).join("");
    wireMessageCardToggles(el);
  } catch {
    el.innerHTML = '<div class="error-state">Search failed</div>';
  }
}

// ── Block 7: Wiki Search ──

async function searchWiki(query: string): Promise<void> {
  const el = document.getElementById("mem-wiki-results")!;
  el.innerHTML = '<div class="loading">Searching wiki...</div>';
  try {
    const results = await apiPost<SearchResult[]>("/wiki-search", { query, limit: 10 });
    if (results.length === 0) {
      el.innerHTML = '<div class="empty-state">No wiki results</div>';
      return;
    }
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${results
          .map(
            (r) => `
          <div class="search-result-item" data-path="${escapeHtml(r.file_path)}" style="cursor:pointer;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.375rem;">
              <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);">${escapeHtml(r.section_title)}</span>
              <span class="badge badge-neutral">${(r.score * 100).toFixed(0)}%</span>
            </div>
            <div class="file-path search-result-path" data-file-path="${escapeHtml(r.file_path)}">${escapeHtml(r.file_path)}</div>
            <div style="font-size:0.8125rem;color:var(--text-secondary);line-height:1.5;">${escapeHtml(r.content_preview.slice(0, 300))}</div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
    // Wire click to open file in explorer
    el.querySelectorAll(".search-result-item").forEach((item) => {
      item.addEventListener("click", () => {
        const path = (item as HTMLElement).getAttribute("data-path");
        if (path) {
          history.pushState({}, "", `/explorer?file=${encodeURIComponent(path)}`);
          router.go("explorer");
        }
      });
    });
  } catch {
    el.innerHTML = '<div class="error-state">Wiki search failed</div>';
  }
}

// ── Helpers ──

function escapeHtml(text: string): string {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}
