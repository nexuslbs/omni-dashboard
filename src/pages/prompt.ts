// ── Prompt Preview Page ──
import { escapeHtml, formatApiError } from "../lib/helpers";
import { API_BASE } from "../lib/api";

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
import { enhanceSelect } from "../lib/dropdown";

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
            <span class="msg-role-badge msg-role-${msg.role === "system" ? "system" : msg.role === "agent" ? "assistant" : msg.role === "user" ? "cause" : msg.role}">
              ${msg.msg_type === "plan" ? "Plan" : msg.role === "user" ? "cause" : msg.role}
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
    errorEl.textContent = "Request failed: " + formatApiError(e);
  } finally {
    loadingEl.style.display = "none";
  }
}
