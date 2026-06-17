import "./style.css";
import { router } from "./lib/router";
import { API_BASE, type HealthCheck } from "./lib/api";

async function checkConnection(): Promise<void> {
  const statusDot = document.querySelector(".status-dot")!;
  const statusText = document.querySelector(".status-text")!;

  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("Not ready");
    const data: HealthCheck = await res.json();
    statusDot.className = "status-dot connected";
    statusText.textContent = `Connected · ${data.version}`;
  } catch {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Disconnected";
  }
}

// SPA navigation
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const route = (item as HTMLAnchorElement).getAttribute("data-route") || "overview";
    const url = (item as HTMLAnchorElement).getAttribute("href") || "/";
    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    history.pushState({}, "", url);
    router.go(route);
  });
});

// Mobile nav click handlers
document.querySelectorAll(".mobile-nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const route = (item as HTMLAnchorElement).getAttribute("data-route") || "overview";
    const url = (item as HTMLAnchorElement).getAttribute("href") || "/";
    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    history.pushState({}, "", url);
    router.go(route);
  });
});

// Handle browser back/forward
window.addEventListener("popstate", () => {
  const path = location.pathname.slice(1) || "overview";
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
    const navRoute = n.getAttribute("data-route") || "";
    const isActive = path === navRoute || path.startsWith(navRoute + "/");
    n.classList.toggle("active", isActive);
  });
  router.go(path);
});

// Initial render
const initialRoute = location.pathname.slice(1) || "overview";
document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
  const navRoute = n.getAttribute("data-route") || "";
  const isActive = initialRoute === navRoute || initialRoute.startsWith(navRoute + "/");
  n.classList.toggle("active", isActive);
});
router.go(initialRoute);

// Check API connection
void checkConnection();
setInterval(checkConnection, 30000);

// Sidebar toggle
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarToggleBar = document.getElementById("sidebar-toggle-bar");
const sidebar = document.querySelector(".sidebar");
const layout = document.querySelector(".dashboard-layout");

function toggleSidebar(): void {
  const isCollapsed = sidebar!.classList.toggle("collapsed");
  layout!.classList.toggle("sidebar-collapsed", isCollapsed);
  sidebarToggle!.title = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
  if (sidebarToggleBar) sidebarToggleBar.title = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
  localStorage.setItem("sidebar-collapsed", String(isCollapsed));
}

if (sidebarToggle && sidebar && layout) {
  const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
  if (collapsed) {
    sidebar.classList.add("collapsed");
    layout.classList.add("sidebar-collapsed");
    sidebarToggle.title = "Expand sidebar";
    if (sidebarToggleBar) sidebarToggleBar.title = "Expand sidebar";
  }

  sidebarToggle.addEventListener("click", toggleSidebar);
  if (sidebarToggleBar) sidebarToggleBar.addEventListener("click", toggleSidebar);
}

// ── Global File Upload (Drag & Drop) ──
let uploadFiles: File[] = [];

function showToast(message: string, type: "success" | "error" = "success"): void {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createUploadOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "upload-overlay";
  overlay.innerHTML = `<div class="upload-overlay-content"><h2>Drop files here to upload</h2><p>Supported: any file type</p></div>`;
  return overlay;
}

async function checkExistingFiles(files: File[]): Promise<Set<string>> {
  try {
    const res = await fetch(`${API_BASE}/uploads/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: files.map((f) => f.name) }),
    });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(data.existing || []);
  } catch {
    return new Set();
  }
}

function showUploadModal(files: File[], existingSet: Set<string>): void {
  const backdrop = document.createElement("div");
  backdrop.className = "upload-modal-backdrop";

  const fileRows = files
    .map((f, i) => {
      const sizeStr =
        f.size > 1024 * 1024
          ? `${(f.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(f.size / 1024).toFixed(0)} KB`;
      const warnIcon = existingSet.has(f.name)
        ? `<span class="upload-file-warn" title="File already exists — will be overwritten">⚠️</span>`
        : "";
      return `<div class="upload-file-row" data-index="${i}">
      <span class="upload-file-name">${f.name}</span>
      <span style="color:var(--text-muted);font-size:0.8rem;flex-shrink:0">${sizeStr}</span>
      ${warnIcon}
      <button class="upload-file-remove" data-index="${i}" title="Remove file">🗑️</button>
    </div>`;
    })
    .join("");

  backdrop.innerHTML = `<div class="upload-modal">
    <h2>Upload Files</h2>
    <p class="upload-dest">Files will be uploaded to <code>/tmp/data/user/uploads/</code></p>
    <div class="upload-file-list">${fileRows}</div>
    <div class="upload-actions">
      <button class="upload-btn upload-btn-cancel" id="upload-cancel">Cancel</button>
      <button class="upload-btn upload-btn-primary" id="upload-confirm" disabled>Upload ${files.length} file${files.length !== 1 ? "s" : ""}</button>
    </div>
  </div>`;

  document.body.appendChild(backdrop);

  let currentFiles = [...files];

  backdrop.querySelectorAll(".upload-file-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt((btn as HTMLElement).dataset.index || "0");
      currentFiles = currentFiles.filter((_, i) => i !== idx);
      if (currentFiles.length === 0) {
        backdrop.remove();
        return;
      }
      backdrop.remove();
      void checkExistingFiles(currentFiles).then((existing) => showUploadModal(currentFiles, existing));
    });
  });

  const confirmBtn = backdrop.querySelector("#upload-confirm") as HTMLButtonElement;
  confirmBtn.disabled = false;
  confirmBtn.textContent = `Upload ${currentFiles.length} file${currentFiles.length !== 1 ? "s" : ""}`;

  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Uploading...";
    try {
      const formData = new FormData();
      currentFiles.forEach((f) => formData.append("files", f));
      const res = await fetch(`${API_BASE}/uploads`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.text()) || "Upload failed");
      const result = await res.json();
      backdrop.remove();
      showToast(`${result.files?.length || currentFiles.length} file(s) uploaded`, "success");
    } catch (err: any) {
      showToast(err?.message || "Upload failed", "error");
      confirmBtn.disabled = false;
      confirmBtn.textContent = `Upload ${currentFiles.length} file${currentFiles.length !== 1 ? "s" : ""}`;
    }
  });

  backdrop.querySelector("#upload-cancel")?.addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

// ── Wire global drag-drop ──
let dragCounter = 0;
let overlayEl: HTMLDivElement | null = null;

document.body.addEventListener("dragenter", (e) => {
  // Skip internal drags (kanban cards, text selections, etc.) — only handle file drops
  // text/plain without Files indicates an internal application drag, not a file upload
  let dragTypes: string[];
  try {
    dragTypes = e.dataTransfer ? Array.from(e.dataTransfer.types) : [];
  } catch {
    // dataTransfer.types may throw on some mobile browsers — treat as non-file drag
    return;
  }
  if (dragTypes.includes("text/plain") && !dragTypes.includes("Files")) {
    return;
  }
  if (!dragTypes.includes("Files")) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  dragCounter++;
  if (!overlayEl) {
    overlayEl = createUploadOverlay();
    document.body.appendChild(overlayEl);
  }
});

document.body.addEventListener("dragover", (e) => {
  let dragTypes: string[];
  try {
    dragTypes = e.dataTransfer ? Array.from(e.dataTransfer.types) : [];
  } catch {
    // dataTransfer.types may throw on some mobile browsers — treat as non-file drag
    return;
  }
  if (dragTypes.includes("text/plain") && !dragTypes.includes("Files")) {
    return;
  }
  if (!dragTypes.includes("Files")) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
});

document.body.addEventListener("dragleave", (e) => {
  let dragTypes: string[];
  try {
    dragTypes = e.dataTransfer ? Array.from(e.dataTransfer.types) : [];
  } catch {
    // dataTransfer.types may throw on some mobile browsers — treat as non-file drag
    return;
  }
  if (dragTypes.includes("text/plain") && !dragTypes.includes("Files")) {
    return;
  }
  if (!dragTypes.includes("Files")) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0 && overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    dragCounter = 0;
  }
});

document.body.addEventListener("drop", async (e) => {
  // Only handle file drops
  let dragTypes: string[];
  try {
    dragTypes = e.dataTransfer ? Array.from(e.dataTransfer.types) : [];
  } catch {
    // dataTransfer.types may throw on some mobile browsers — treat as non-file drag
    return;
  }
  if (dragTypes.includes("text/plain") && !dragTypes.includes("Files")) {
    return;
  }
  if (!dragTypes.includes("Files")) {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  dragCounter = 0;
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }

  const droppedFiles = Array.from(e.dataTransfer?.files || []);
  if (droppedFiles.length === 0) return;

  uploadFiles = droppedFiles;
  const existingSet = await checkExistingFiles(uploadFiles);
  showUploadModal(uploadFiles, existingSet);
});

// ── Expose functions globally for wiki.ts and other modules ──
(window as any).checkExistingFiles = checkExistingFiles;
(window as any).showUploadModal = showUploadModal;
(window as any).showToast = showToast;
