// ── Prompt Preview Page ──
// Write a prompt in a textarea, select a channel, optionally plan, see the raw prompt

const API_BASE = "/api";

export async function renderPrompt(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h2 class="page-title">Prompt Preview</h2>
        <p class="page-subtitle">Preview the full prompt that would be sent to the LLM for a channel. No messages or threads are saved.</p>
      </div>
      <div class="preview-controls">
        <div class="prompt-filter-row">
          <div class="filter-section">
            <label class="filter-label">Channel <span class="required">*</span></label>
            <select id="channel-select" class="filter-select">
              <option value="">— Select a channel —</option>
            </select>
          </div>
        </div>
        <div class="prompt-textarea-wrapper">
          <label class="filter-label" for="prompt-text">Prompt</label>
          <textarea id="prompt-text" class="prompt-textarea" rows="8" placeholder="Write your prompt here..."></textarea>
        </div>
        <div class="prompt-actions-row">
          <label class="checkbox-label">
            <input type="checkbox" id="plan-checkbox" />
            <span>Include planning step (calls LLM once)</span>
          </label>
          <button id="preview-btn" class="prompt-preview-btn" disabled>Preview Prompt</button>
        </div>
      </div>
      <div id="preview-results" class="preview-results" style="display:none;">
        <div class="card">
          <div class="card-header"><span class="card-title">Messages</span></div>
          <div class="card-body" id="messages-output"></div>
        </div>
      </div>
      <div id="preview-error" class="error-state" style="display:none;"></div>
      <div id="preview-loading" class="loading" style="display:none;">Loading...</div>
    </div>
  `;

  // Load channels, then enhance the select
  await loadChannels();
  enhanceSelect("channel-select");

  // Wire up controls
  const channelSelect = document.getElementById("channel-select") as HTMLSelectElement;
  const promptText = document.getElementById("prompt-text") as HTMLTextAreaElement;
  const previewBtn = document.getElementById("preview-btn") as HTMLButtonElement;

  function updateButton(): void {
    const enabled = !!channelSelect.value && !!promptText.value.trim();
    previewBtn.disabled = !enabled;
    previewBtn.classList.toggle("active", enabled);
  }

  channelSelect.addEventListener("change", updateButton);
  promptText.addEventListener("input", updateButton);

  previewBtn.addEventListener("click", async () => {
    await submitPreview();
  });
}

async function loadChannels(): Promise<void> {
  const select = document.getElementById("channel-select") as HTMLSelectElement;
  try {
    const res = await fetch(`${API_BASE}/channels`);
    const channels = await res.json();
    select.innerHTML = '<option value="">— Select a channel —</option>';
    for (const ch of channels) {
      const opt = document.createElement("option");
      opt.value = ch.name;
      opt.textContent = `${ch.name}${ch.platform ? ` (${ch.platform})` : ""}`;
      select.appendChild(opt);
    }
  } catch (e) {
    select.innerHTML = '<option value="">Failed to load channels</option>';
    console.error("[prompt] Failed to load channels:", e);
  }
}

// ── Enhanced dropdown with floating options (appended to document.body to escape backdrop-filter) ──

let _openFloatingDropdown: HTMLElement | null = null;

function closeFloatingDropdown(): void {
  if (_openFloatingDropdown) {
    _openFloatingDropdown.remove();
    _openFloatingDropdown = null;
  }
}

function enhanceSelect(selectId: string): void {
  const select = document.getElementById(selectId) as HTMLSelectElement;
  if (!select || (select as any).dataset._enhanced) return;
  (select as any).dataset._enhanced = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "custom-select";
  wrapper.style.position = "relative";

  function buildOptions(): void {
    const selected = Array.from(select.options).find((o) => o.selected) || select.options[0];
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

    closeFloatingDropdown();

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

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
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
          `<div class="select-option${o.selected ? " selected" : ""}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</div>`,
      )
      .join("");

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

  document.addEventListener("click", () => closeFloatingDropdown());
}

async function submitPreview(): Promise<void> {
  const channel = (document.getElementById("channel-select") as HTMLSelectElement).value;
  const prompt = (document.getElementById("prompt-text") as HTMLTextAreaElement).value.trim();
  const plan = (document.getElementById("plan-checkbox") as HTMLInputElement).checked;

  if (!channel) return;
  if (!prompt) return;

  const resultsEl = document.getElementById("preview-results")!;
  const errorEl = document.getElementById("preview-error")!;
  const loadingEl = document.getElementById("preview-loading")!;

  resultsEl.style.display = "none";
  errorEl.style.display = "none";
  loadingEl.style.display = "flex";

  try {
    const res = await fetch(`${API_BASE}/prompt-preview/${encodeURIComponent(channel)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, plan }),
    });

    const data = await res.json();

    if (!res.ok) {
      loadingEl.style.display = "none";
      errorEl.style.display = "block";
      errorEl.textContent = data.error || "Unknown error";
      return;
    }

    // Messages — includes system prompt, user message, and plan as inner msg-cards
    const msgsEl = document.getElementById("messages-output")!;
    if (data.messages && data.messages.length > 0) {
      msgsEl.innerHTML = data.messages
        .map(
          (msg: any, i: number) => `
        <div class="msg-card msg-${msg.role} ${msg.msg_type === "plan" ? "msg-plan" : ""}">
          <div class="msg-header">
            <span class="msg-role-badge msg-role-${msg.role === "system" ? "system" : msg.role === "agent" ? "assistant" : "user"}">
              ${msg.msg_type === "plan" ? "Plan" : msg.role}
            </span>
            <span class="msg-idx">#${i + 1}</span>
          </div>
          <pre class="msg-content">${escapeHtml(msg.content || "")}</pre>
        </div>
      `,
        )
        .join("");
    } else {
      msgsEl.innerHTML = '<div class="empty-state">No messages</div>';
    }

    resultsEl.style.display = "block";
  } catch (e) {
    loadingEl.style.display = "none";
    errorEl.style.display = "block";
    errorEl.textContent = "Request failed: " + (e instanceof Error ? e.message : String(e));
  } finally {
    loadingEl.style.display = "none";
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
