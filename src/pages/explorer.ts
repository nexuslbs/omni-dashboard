import {
  apiGet,
  apiPost,
  type FsEntry,
  type FsReadResponse,
  type FsDiffResponse,
  type GitStatusResponse,
  type GitFileEntry,
} from "../lib/api";
import { escapeHtml, formatApiError } from "../lib/helpers";
import { renderMarkdown } from "../lib/markdown";
import { html as diffHtml } from "diff2html";
import "diff2html/bundles/css/diff2html.min.css";

// Functions exposed by the global upload feature (defined in index.ts: same bundle)
declare function checkExistingFiles(files: File[]): Promise<Set<string>>;
declare function showUploadModal(files: File[], existingSet: Set<string>): void;

// ── Markdown renderer (uses shared markdown module) ──
// renderMarkdown imported from ../lib/markdown

/** Inject copy button and language label into each <pre><code> block in rendered HTML */
function enhanceCodeBlocks(container: HTMLElement): void {
  container.querySelectorAll("pre").forEach((pre) => {
    // Skip if already enhanced
    if (pre.querySelector(".code-actions")) return;

    const code = pre.querySelector("code");
    if (!code) return;

    const actions = document.createElement("div");
    actions.className = "code-actions";

    // Language label
    const langLabel = document.createElement("span");
    langLabel.className = "code-lang";
    const cls = Array.from(code.classList).find((c) => c.startsWith("language-"));
    langLabel.textContent = cls ? cls.replace("language-", "") : "";
    if (langLabel.textContent) actions.appendChild(langLabel);

    // Copy button
    const copyBtn = document.createElement("button");
    copyBtn.className = "code-copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(code.textContent || "");
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 2000);
      } catch {
        copyBtn.textContent = "Failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 2000);
      }
    });
    actions.appendChild(copyBtn);

    pre.style.position = "relative";
    pre.prepend(actions);
  });
}

// ── File size formatting ──

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

// ── Tree node icons ──

function getIcon(entry: FsEntry): string {
  if (entry.type === "directory") return "📁";
  const name = entry.name.toLowerCase();
  if (name.endsWith(".md")) return "📄";
  if (name.endsWith(".js") || name.endsWith(".ts")) return "🟨";
  if (name.endsWith(".py")) return "🐍";
  if (name.endsWith(".json")) return "📋";
  if (name.endsWith(".yaml") || name.endsWith(".yml")) return "⚙️";
  if (name.endsWith(".css")) return "🎨";
  if (name.endsWith(".html")) return "🌐";
  if (name.endsWith(".sh")) return "💻";
  if (name.endsWith(".svg") || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".webp"))
    return "🖼️";
  if (name.endsWith(".toml")) return "🔧";
  return "📄";
}

// ── Router state ──

interface TreeNode {
  entry: FsEntry;
  expanded: boolean;
  children: TreeNode[] | null; // null = not yet loaded
}

let treeData: TreeNode[] | null = null;
const expandedPaths = new Set<string>();
let lastOpenedFile: string | null = null;
let explorerRoot = "/opt";

// ── Main render ──

export function renderExplorer(container: HTMLElement): void {
  container.innerHTML = `
    <div class="search-page" id="search-page">
      <div class="explorer-panel" id="explorer-panel">
        <div class="explorer-header">
          <span class="explorer-title">📂 Filesystem (${explorerRoot})</span>
          <div class="explorer-header-actions">
            <button class="explorer-refresh channel-refresh-btn" id="explorer-refresh" title="Refresh file tree">⟳</button>
            <button class="explorer-upload-btn" id="explorer-upload-btn" title="Upload files">⬆</button>
            <button class="explorer-toggle" id="explorer-toggle" title="Collapse explorer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <input type="file" id="file-upload-input" multiple style="display:none" />
          </div>
        </div>
        <!-- Git Panel -->
        <div class="git-panel" id="git-panel" style="display:none;">
          <div class="git-header">
            <span class="git-branch" id="git-branch">main</span>
            <div class="git-remote-info" id="git-remote-info" style="display:none;">
              <span class="git-ahead" id="git-ahead"></span>
              <span class="git-behind" id="git-behind"></span>
            </div>
            <button class="git-sync-btn" id="git-sync-btn" title="Synchronize changes"><span class="git-sync-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 8a7 7 0 0 1 13.5-3M15 8a7 7 0 0 1-13.5 3"/><polyline points="13.5 2 13.5 5 10.5 5"/><polyline points="2.5 14 2.5 11 5.5 11"/></svg></span></button>
          </div>
          <div class="git-commit-area" id="git-commit-area" style="display:none;">
            <input type="text" class="git-commit-input" id="git-commit-input" placeholder="Commit message" />
            <div class="git-commit-actions">
              <button class="git-commit-btn" id="git-commit-btn" disabled title="Commit staged or all changes">Commit</button>
              <button class="git-stage-btn" id="git-stage-btn" style="display:none;" title="Stage all unstaged changes">Stage</button>
              <button class="git-unstage-btn" id="git-unstage-btn" style="display:none;" title="Unstage all staged changes, keeping file changes">Unstage</button>
              <button class="git-discard-btn" id="git-discard-btn" title="Discard all unstaged changes: cannot be undone">Discard</button>
            </div>
          </div>
          <div class="git-files" id="git-files" style="display:none;">
            <div class="git-staged" id="git-staged" style="display:none;">
              <div class="git-files-header" id="git-staged-header">
                <span class="git-files-toggle">▶</span>
                📦 Staged Changes (<span class="git-files-count" id="git-staged-count">0</span>)
              </div>
              <div class="git-files-list" id="git-staged-list"></div>
            </div>
            <div class="git-unstaged" id="git-unstaged" style="display:none;">
              <div class="git-files-header" id="git-unstaged-header">
                <span class="git-files-toggle">▶</span>
                📦 Unstaged Changes (<span class="git-files-count" id="git-unstaged-count">0</span>)
              </div>
              <div class="git-files-list" id="git-unstaged-list"></div>
            </div>
          </div>
        </div>
        <div class="explorer-tree" id="explorer-tree">
          <div class="loading">Loading</div>
        </div>
      </div>
      <div class="content-panel">
        <div class="content-view" id="content-view">
          <div class="empty-state" id="content-empty-state" style="padding:3rem;text-align:center;color:var(--text-muted);">
            <p style="font-size:1rem;margin-bottom:0.5rem;">Select a file to view</p>
            <p style="font-size:0.875rem;">Browse the filesystem tree or search the wiki</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Refresh button: reloads tree, preserves expanded state and selected file
  document.getElementById("explorer-refresh")!.addEventListener("click", async () => {
    await loadTree(false);
    // Reload children for ALL expanded directories, not just the file path
    await reloadAllExpanded();
    // Re-render the tree with all children loaded
    const treeEl = document.getElementById("explorer-tree")!;
    renderTree(treeEl);
    if (lastOpenedFile) {
      void navigateToFile(lastOpenedFile);
    }
  });

  // Upload button: opens file chooser
  const uploadBtn = document.getElementById("explorer-upload-btn")!;
  const fileInput = document.getElementById("file-upload-input") as HTMLInputElement;
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const files = fileInput.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    fileInput.value = ""; // Reset so re-selecting the same files triggers change again
    if (typeof checkExistingFiles === "function" && typeof showUploadModal === "function") {
      const existingSet = await checkExistingFiles(fileArray);
      showUploadModal(fileArray, existingSet);
    }
  });

  // Git panel: sync button
  document.getElementById("git-sync-btn")!.addEventListener("click", async () => {
    const btn = document.getElementById("git-sync-btn") as HTMLButtonElement;
    const icon = document.querySelector(".git-sync-icon") as HTMLElement;
    icon.classList.add("spinning");
    btn.disabled = true;
    try {
      await apiPost("/git/sync", {});
      await loadGitStatus();
    } catch (e) {
      showGitError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      icon.classList.remove("spinning");
      btn.disabled = false;
    }
  });

  // Git panel: commit
  const commitInput = document.getElementById("git-commit-input") as HTMLInputElement;
  const commitBtn = document.getElementById("git-commit-btn") as HTMLButtonElement;
  commitInput.addEventListener("input", () => {
    commitBtn.disabled = !commitInput.value.trim();
  });
  commitBtn.addEventListener("click", async () => {
    const msg = commitInput.value.trim();
    if (!msg) return;
    commitBtn.disabled = true;
    commitBtn.textContent = "Committing...";
    try {
      await apiPost("/git/commit", { message: msg });
      commitInput.value = "";
      commitBtn.disabled = true;
      commitBtn.textContent = "Commit";
      await loadGitStatus();
    } catch (e) {
      commitBtn.disabled = false;
      commitBtn.textContent = "Commit";
      showGitError(e instanceof Error ? e.message : "Commit failed");
    }
  });

  // Git panel: stage all
  document.getElementById("git-stage-btn")!.addEventListener("click", async () => {
    try {
      await apiPost("/git/stage", {});
      await loadGitStatus();
    } catch (e) {
      showGitError(e instanceof Error ? e.message : "Stage failed");
    }
  });

  // Git panel: discard all
  document.getElementById("git-discard-btn")!.addEventListener("click", async () => {
    if (!confirm("Discard all unstaged changes? This cannot be undone.")) return;
    try {
      await apiPost("/git/discard", {});
      await loadGitStatus();
    } catch (e) {
      showGitError(e instanceof Error ? e.message : "Discard failed");
    }
  });

  // Git panel: unstage all
  document.getElementById("git-unstage-btn")!.addEventListener("click", async () => {
    if (!confirm("Unstage all staged changes? This keeps the file changes.")) return;
    try {
      await apiPost("/git/unstage", {});
      await loadGitStatus();
    } catch (e) {
      showGitError(e instanceof Error ? e.message : "Unstage failed");
    }
  });

  // Git panel: one-time toggleExpand setup (not inside loadGitStatus to avoid stacking listeners)
  const toggleExpand = (header: HTMLElement, list: HTMLElement): void => {
    header.addEventListener("click", () => {
      const isHidden = list.style.display === "none";
      list.style.display = isHidden ? "" : "none";
      const toggleEl = header.querySelector(".git-files-toggle") as HTMLElement;
      toggleEl.textContent = isHidden ? "▼" : "▶";
    });
  };
  toggleExpand(document.getElementById("git-staged-header")!, document.getElementById("git-staged-list")!);
  toggleExpand(
    document.getElementById("git-unstaged-header")!,
    document.getElementById("git-unstaged-list")!,
  );

  // Explorer collapse/expand toggle
  const explorerPanel = document.getElementById("explorer-panel")!;
  const searchPage = document.getElementById("search-page")!;
  const explorerToggle = document.getElementById("explorer-toggle")! as HTMLButtonElement;

  // Restore saved state
  const explorerCollapsed = localStorage.getItem("explorer-collapsed") === "true";
  if (explorerCollapsed) {
    explorerPanel.classList.add("collapsed");
    searchPage.classList.add("explorer-collapsed");
    explorerToggle.title = "Expand explorer";
  }

  explorerToggle.addEventListener("click", () => {
    const isCollapsed = explorerPanel.classList.toggle("collapsed");
    searchPage.classList.toggle("explorer-collapsed", isCollapsed);
    explorerToggle.title = isCollapsed ? "Expand explorer" : "Collapse explorer";
    localStorage.setItem("explorer-collapsed", String(isCollapsed));
  });

  // If URL has a ?file= param, show "Loading" immediately instead of the empty state
  const initialFileParam = new URLSearchParams(location.search).get("file");
  if (initialFileParam) {
    const contentView = document.getElementById("content-view")!;
    contentView.innerHTML = '<div class="loading">Loading file</div>';
  }

  // Load the file tree, then check for persisted file in URL
  void loadTree(false).then(() => {
    const params = new URLSearchParams(location.search);
    const filePath = params.get("file");
    if (filePath) {
      void navigateToFile(filePath);
    }
  });
  // Load git status
  void loadGitStatus();
}

// ── File tree ──

async function loadTree(reset: boolean): Promise<void> {
  const treeEl = document.getElementById("explorer-tree")!;

  if (reset) {
    treeData = null;
    expandedPaths.clear();
  }

  try {
    const response = await apiGet<{ entries: FsEntry[]; path: string; root?: string }>("/fs/list?path=/");
    if (response.root) explorerRoot = response.root;
    treeData = response.entries.map((e) => ({
      entry: e,
      expanded: expandedPaths.has(e.path) || false,
      children: null,
    }));
    renderTree(treeEl);
  } catch (e) {
    treeEl.innerHTML = `<div class="error-state">Failed to load: ${formatApiError(e)}</div>`;
  }
}

/** After a tree reload, re-fetch children for every path in expandedPaths */
async function reloadAllExpanded(): Promise<void> {
  if (!treeData) return;

  const expanded = Array.from(expandedPaths).filter((p) => p !== "/");
  expanded.sort((a, b) => a.split("/").filter(Boolean).length - b.split("/").filter(Boolean).length);

  for (const path of expanded) {
    const parts = path.split("/").filter(Boolean);
    let currentLevel: TreeNode[] | null = treeData;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!currentLevel) break;
      const node: TreeNode | undefined = currentLevel.find((n) => n.entry.name === part);
      if (!node) break;

      // Load children eagerly for EVERY directory on the path,
      // not just the target: intermediate dirs may not be in expandedPaths
      if (node.children === null) {
        try {
          const response: { entries: FsEntry[]; path: string } = await apiGet(
            `/fs/list?path=${encodeURIComponent(node.entry.path)}`,
          );
          node.children = response.entries.map((e: FsEntry) => ({
            entry: e,
            expanded: expandedPaths.has(e.path),
            children: null,
          }));
        } catch {
          node.children = [];
        }
      }

      if (node.entry.path === path) {
        break;
      }
      currentLevel = node.children;
    }
  }
}

function renderTree(container: HTMLElement): void {
  if (!treeData) {
    container.innerHTML = '<div class="loading">Loading</div>';
    return;
  }

  container.innerHTML = `<div class="tree-node tree-root" data-path="/">
    <div class="tree-item tree-folder tree-expanded" data-path="/">
      <span class="tree-toggle">▼</span>
      <span class="tree-icon">📁</span>
      <span class="tree-label">/</span>
    </div>
    <div class="tree-children" id="tree-children-/">
      ${treeData.map((node) => renderTreeNode(node, 1)).join("")}
    </div>
  </div>`;

  // Attach click handlers
  container.querySelectorAll(".tree-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const path = (el as HTMLElement).dataset.path || "";
      const entryType = (el as HTMLElement).dataset.type || "directory";
      if (entryType === "directory") {
        void toggleDirectory(path);
      } else {
        // Tree file click: clear diff/staged params, only open the file
        const params = new URLSearchParams(location.search);
        params.delete("diff");
        params.delete("staged");
        params.delete("full");
        params.set("file", path);
        const url = location.pathname + "?" + params.toString();
        history.replaceState({ file: path }, "", url);
        // Deselect any git-selected file
        document
          .getElementById("git-panel")
          ?.querySelectorAll(".git-file-item.selected")
          .forEach((el) => el.classList.remove("selected"));
        void openFile(path);
      }
    });
  });
}

function renderTreeNode(node: TreeNode, depth: number): string {
  const icon = node.entry.type === "directory" ? "📁" : getIcon(node.entry);
  const expanded = node.expanded ? "tree-expanded" : "tree-collapsed";
  const toggle = node.entry.type === "directory" ? (node.expanded ? "▼" : "▶") : "";
  const childrenHtml =
    node.expanded && node.children
      ? `<div class="tree-children">${node.children.map((c) => renderTreeNode(c, depth + 1)).join("")}</div>`
      : "";

  return `
    <div class="tree-node">
      <div class="tree-item tree-${node.entry.type} ${expanded}" data-path="${escapeHtml(node.entry.path)}" data-type="${node.entry.type}">
        <span class="tree-toggle">${toggle}</span>
        <span class="tree-icon">${icon}</span>
        <span class="tree-label">${escapeHtml(node.entry.name)}</span>
        ${node.entry.size !== null ? `<span class="tree-size">${formatSize(node.entry.size)}</span>` : ""}
      </div>
      ${childrenHtml}
    </div>
  `;
}

async function toggleDirectory(path: string): Promise<void> {
  // Find the node in our tree
  const parts = path.split("/").filter(Boolean);
  let currentLevel = treeData;
  let found = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!currentLevel) break;
    const node = currentLevel.find((n) => n.entry.name === part);
    if (!node) break;
    if (i === parts.length - 1) {
      // Toggle this node
      node.expanded = !node.expanded;
      if (node.expanded) {
        expandedPaths.add(path);
      } else {
        expandedPaths.delete(path);
      }
      if (node.expanded && node.children === null) {
        // Load children
        try {
          const response = await apiGet<{ entries: FsEntry[]; path: string }>(
            `/fs/list?path=${encodeURIComponent(path)}`,
          );
          node.children = response.entries.map((e) => ({
            entry: e,
            expanded: false,
            children: null,
          }));
        } catch {
          node.children = [];
        }
      }
      found = true;
    } else {
      currentLevel = node.children;
    }
  }

  if (found) {
    // Re-render the tree
    const treeEl = document.getElementById("explorer-tree")!;
    renderTree(treeEl);
  }
}

// ── Navigate to file (restore state from URL) ──

async function navigateToFile(fullPath: string): Promise<void> {
  const data = treeData;
  if (!data) return;
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length === 0) return;

  // Expand each directory along the path
  let currentDir = "";
  let currentLevel: TreeNode[] | null = data;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    currentDir += "/" + part;

    if (!currentLevel) return;
    const node: TreeNode | undefined = currentLevel.find((n) => n.entry.name === part);
    if (!node) return;

    // Expand if not already expanded
    if (!node.expanded) {
      node.expanded = true;
      expandedPaths.add(currentDir);
      if (node.children === null) {
        try {
          const response = await apiGet<{ entries: FsEntry[]; path: string }>(
            `/fs/list?path=${encodeURIComponent(currentDir)}`,
          );
          node.children = response.entries.map((e) => ({
            entry: e,
            expanded: false,
            children: null,
          }));
        } catch {
          node.children = [];
        }
      }
    }
    currentLevel = node.children;
  }

  // Re-render the fully-expanded tree
  const treeEl = document.getElementById("explorer-tree")!;
  renderTree(treeEl);

  // Open the file
  void openFile(fullPath);
}

// ── File viewer ──

/** Highlight the matching tree item and scroll it into view */
function highlightTreeItem(path: string): void {
  // Remove previous selection from all tree items
  document.querySelectorAll(".tree-item.selected").forEach((el) => {
    el.classList.remove("selected");
  });

  // Find the tree item with matching data-path
  const escapedPath = CSS.escape(path);
  const treeItem = document.querySelector<HTMLElement>(`.tree-item[data-path="${escapedPath}"]`);
  if (!treeItem) return;

  // Highlight it
  treeItem.classList.add("selected");

  // Scroll the explorer tree to make the item visible
  const explorerTree = document.getElementById("explorer-tree");
  if (explorerTree) {
    const itemRect = treeItem.getBoundingClientRect();
    const treeRect = explorerTree.getBoundingClientRect();
    // Only scroll if the item is outside the visible area
    if (itemRect.top < treeRect.top || itemRect.bottom > treeRect.bottom) {
      treeItem.scrollIntoView({ block: "nearest" });
    }
  }
}

/** Attach click handler on .file-path to scroll/highlight and copy */
function attachFilePathClick(contentView: HTMLElement, path: string): void {
  const filePathEl = contentView.querySelector<HTMLElement>(".file-path");
  if (!filePathEl) return;
  filePathEl.addEventListener("click", () => {
    highlightTreeItem(path);
    navigator.clipboard.writeText(path).catch(() => {});
  });
}

async function openFile(path: string): Promise<void> {
  // Track this as the most recently opened file
  lastOpenedFile = path;
  const contentView = document.getElementById("content-view")!;
  contentView.innerHTML = '<div class="loading">Loading file</div>';
  contentView.scrollTop = 0;

  // Scroll the outer page (main-content) to the top
  const mainContent = document.getElementById("main-content");
  if (mainContent) mainContent.scrollTop = 0;

  // Determine if diff mode from URL params
  const params = new URLSearchParams(location.search);
  const isDiff = params.get("diff") === "true";
  const isStaged = params.get("staged") === "true";
  // Full-file preference stored globally in localStorage: applies to all files
  const isFull = localStorage.getItem("diff-full") !== "false"; // default true

  // Update URL so the file path persists on reload
  params.set("file", path);
  if (isDiff) params.set("diff", "true");
  else params.delete("diff");
  if (isStaged) params.set("staged", "true");
  else params.delete("staged");
  params.delete("full"); // not in URL: stored in localStorage
  const newUrl = location.pathname + "?" + params.toString();
  history.replaceState({ file: path }, "", newUrl);

  try {
    if (isDiff) {
      // Diff mode: fetch diff from backend
      const response = await apiGet<FsDiffResponse>(
        `/fs/diff?path=${encodeURIComponent(path)}&staged=${isStaged}&full=${isFull}`,
      );
      const diffText = response.diff || "";
      if (!diffText) {
        contentView.innerHTML = `
          <div class="file-header">
            <span class="file-path">${escapeHtml(path)}</span>
            <div class="file-header-actions">
              <button class="diff-toggle-btn" id="diff-toggle-btn" title="Show file content">⊟</button>
              <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            </div>
          </div>
          <div class="empty-state" style="padding:3rem;text-align:center;color:var(--text-muted);">
            <p>No changes</p>
            <p style="font-size:0.875rem;margin-top:0.5rem;">This file has no pending changes</p>
          </div>
        `;
      } else {
        const rendered = diffHtml(diffText, {
          drawFileList: false,
          matching: "lines",
          outputFormat: "side-by-side",
        });
        contentView.innerHTML = `
          <div class="file-header">
            <span class="file-path">${escapeHtml(path)}</span>
            <div class="file-header-actions">
              <button class="full-toggle-btn ${!isFull ? "active" : ""}" id="full-toggle-btn" title="${isFull ? "Show changes only" : "Show full file"}">⤢</button>
              <button class="diff-toggle-btn" id="diff-toggle-btn" title="Show file content">⊟</button>
              <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            </div>
          </div>
          <div class="d2h-dark-color-scheme" style="border-radius:var(--radius-md);overflow:hidden;margin-top:0.5rem;">
            ${rendered}
          </div>
        `;
      }
      contentView.scrollTop = 0;
    } else {
      // Normal file view
      const response = await apiGet<FsReadResponse>(`/fs/read?path=${encodeURIComponent(path)}`);
      const isMarkdown = path.toLowerCase().endsWith(".md");

      if (response.binary) {
        contentView.innerHTML = `
          <div class="file-header">
            <span class="file-path">${escapeHtml(path)}</span>
            <div class="file-header-actions">
              <span class="file-size">${formatSize(response.size)}</span>
              <button class="diff-toggle-btn" id="diff-toggle-btn" title="Show diff">↔</button>
              <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            </div>
          </div>
          <div class="empty-state" style="padding:3rem;text-align:center;color:var(--text-muted);">
            <p>Binary or unsupported file type</p>
            <p style="font-size:0.875rem;margin-top:0.5rem;">${formatSize(response.size)}: cannot preview</p>
          </div>
        `;
        contentView.scrollTop = 0;
      } else if (isMarkdown) {
        const rendered = renderMarkdown(response.content);
        contentView.innerHTML = `
          <div class="file-header">
            <span class="file-path">${escapeHtml(path)}</span>
            <div class="file-header-actions">
              <span class="file-size">${formatSize(response.size)}</span>
              <button class="diff-toggle-btn" id="diff-toggle-btn" title="Show diff">↔</button>
              <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            </div>
          </div>
        `;
        const mdContainer = document.createElement("div");
        mdContainer.className = "markdown-content";
        mdContainer.innerHTML = rendered;
        contentView.appendChild(mdContainer);
        contentView.scrollTop = 0;
        // Enhance code blocks with syntax highlighting and copy buttons
        enhanceCodeBlocks(mdContainer);
      } else {
        contentView.innerHTML = `
          <div class="file-header">
            <span class="file-path">${escapeHtml(path)}</span>
            <div class="file-header-actions">
              <span class="file-size">${formatSize(response.size)}</span>
              <button class="diff-toggle-btn" id="diff-toggle-btn" title="Show diff">↔</button>
              <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            </div>
          </div>
          <pre class="code-block" style="max-height:none;overflow-y:auto;border-radius:var(--radius-md);padding:1rem;font-size:0.8rem;line-height:1.6;"><code>${escapeHtml(response.content)}</code></pre>
        `;
        contentView.scrollTop = 0;
      }
    }
    // Highlight the file in the tree and attach click handler on file-path
    highlightTreeItem(path);
    attachFilePathClick(contentView, path);

    // Wire up diff toggle button: toggle between diff=true and normal view
    const diffBtn = document.getElementById("diff-toggle-btn");
    if (diffBtn) {
      diffBtn.addEventListener("click", () => {
        const currentParams = new URLSearchParams(location.search);
        const goingDiff = !isDiff;
        if (goingDiff) {
          currentParams.set("diff", "true");
          currentParams.set("staged", String(isStaged));
        } else {
          currentParams.delete("diff");
          currentParams.delete("staged");
        }
        currentParams.delete("full"); // stored in localStorage
        const url = location.pathname + "?" + currentParams.toString();
        history.replaceState({ file: path }, "", url);
        void openFile(path);
      });
    }

    // Wire up full-file toggle button: toggle between full file and changes-only view
    const fullBtn = document.getElementById("full-toggle-btn");
    if (fullBtn) {
      fullBtn.addEventListener("click", () => {
        const newVal = !isFull;
        localStorage.setItem("diff-full", String(newVal));
        void openFile(path);
      });
    }
  } catch (e) {
    contentView.innerHTML = `<div class="error-state">Failed to load: ${formatApiError(e)}</div>`;
    contentView.scrollTop = 0;
  }
}

// ── Git Panel ──

/** Show a git error banner with an X close button (never auto-closes) */
function showGitError(msg: string): void {
  const panel = document.getElementById("git-panel")!;
  const errEl = document.createElement("div");
  errEl.className = "git-error";
  const textSpan = document.createElement("span");
  textSpan.className = "git-error-text";
  textSpan.textContent = msg;
  const closeBtn = document.createElement("button");
  closeBtn.className = "git-error-close";
  closeBtn.innerHTML = "✕";
  closeBtn.addEventListener("click", () => errEl.remove());
  errEl.appendChild(textSpan);
  errEl.appendChild(closeBtn);
  panel.appendChild(errEl);
}

function statusColor(status: GitFileEntry["status"]): string {
  switch (status) {
    case "U":
      return "var(--git-status-untracked, #3FB950)";
    case "M":
      return "var(--git-status-modified, #E4B341)";
    case "D":
      return "var(--git-status-deleted, #F85149)";
    case "R":
      return "var(--git-status-renamed, #D4A72C)";
  }
}

function statusLabel(status: GitFileEntry["status"]): string {
  switch (status) {
    case "U":
      return "U";
    case "M":
      return "M";
    case "D":
      return "D";
    case "R":
      return "R";
  }
}

function statusTitle(status: GitFileEntry["status"]): string {
  switch (status) {
    case "U":
      return "Untracked";
    case "M":
      return "Modified";
    case "D":
      return "Deleted";
    case "R":
      return "Renamed";
    default:
      return "";
  }
}

async function loadGitStatus(): Promise<void> {
  const panel = document.getElementById("git-panel")!;
  try {
    const status = await apiGet<GitStatusResponse>("/git/status");

    // Show the panel if we have a valid branch
    if (!status.branch || status.branch === "(no repo)" || status.branch.startsWith("(")) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "block";

    // Branch name
    document.getElementById("git-branch")!.textContent = status.branch;

    // Remote info (ahead/behind)
    const remoteInfo = document.getElementById("git-remote-info")!;
    const aheadEl = document.getElementById("git-ahead")!;
    const behindEl = document.getElementById("git-behind")!;
    remoteInfo.style.display = "inline-flex";
    aheadEl.textContent = `↓${status.behind}`;
    aheadEl.title = `Commits behind remote: ${status.behind} to pull`;
    behindEl.textContent = `↑${status.ahead}`;
    behindEl.title = `Commits ahead of remote: ${status.ahead} to push`;

    const totalChanges = status.staged.length + status.unstaged.length;
    const commitArea = document.getElementById("git-commit-area")!;
    const filesSection = document.getElementById("git-files")!;

    if (totalChanges === 0) {
      commitArea.style.display = "none";
      filesSection.style.display = "none";
      return;
    }

    // Show commit area and files section
    commitArea.style.display = "";
    filesSection.style.display = "";

    // Fetch filesystem config to resolve git paths relative to EXPLORER_DIR
    let gitPrefix = "";
    try {
      const config = await apiGet<{ root: string; omniDir: string }>("/fs/config");
      // Compute relative path from EXPLORER_DIR root to OMNI_DIR
      if (config.omniDir.startsWith(config.root)) {
        gitPrefix = config.omniDir.slice(config.root.length);
        if (!gitPrefix.startsWith("/")) gitPrefix = "/" + gitPrefix;
      }
    } catch {
      // Fall back to no prefix
    }

    // Staged changes
    const stagedSection = document.getElementById("git-staged")!;
    const stagedList = document.getElementById("git-staged-list")!;
    const stagedCount = document.getElementById("git-staged-count")!;
    const stagedHeader = document.getElementById("git-staged-header")!;

    if (status.staged.length > 0) {
      stagedSection.style.display = "";
      stagedCount.textContent = String(status.staged.length);
      stagedList.innerHTML = status.staged
        .map(
          (f) =>
            `<div class="git-file-item" data-path="${escapeHtml(gitPrefix + "/" + f.path)}" data-staged="true">
              <span class="git-file-name">${escapeHtml(f.path)}</span>
              <span class="git-file-status" style="color:${statusColor(f.status)};font-weight:700;" title="${statusTitle(f.status)}">${statusLabel(f.status)}</span>
            </div>`,
        )
        .join("");
      // Start collapsed
      stagedList.style.display = "none";
      const toggleEl = stagedHeader.querySelector(".git-files-toggle") as HTMLElement;
      toggleEl.textContent = "▶";
    } else {
      stagedSection.style.display = "none";
    }

    // Unstaged changes
    const unstagedSection = document.getElementById("git-unstaged")!;
    const unstagedList = document.getElementById("git-unstaged-list")!;
    const unstagedCount = document.getElementById("git-unstaged-count")!;
    const unstagedHeader = document.getElementById("git-unstaged-header")!;

    if (status.unstaged.length > 0) {
      unstagedSection.style.display = "";
      unstagedCount.textContent = String(status.unstaged.length);
      unstagedList.innerHTML = status.unstaged
        .map(
          (f) =>
            `<div class="git-file-item" data-path="${escapeHtml(gitPrefix + "/" + f.path)}" data-staged="false">
              <span class="git-file-name">${escapeHtml(f.path)}</span>
              <span class="git-file-status" style="color:${statusColor(f.status)};font-weight:700;" title="${statusTitle(f.status)}">${statusLabel(f.status)}</span>
            </div>`,
        )
        .join("");
      // Start collapsed
      unstagedList.style.display = "none";
      const toggleEl = unstagedHeader.querySelector(".git-files-toggle") as HTMLElement;
      toggleEl.textContent = "▶";
    } else {
      unstagedSection.style.display = "none";
    }

    // Enable/disable action buttons based on available changes
    const stageBtn = document.getElementById("git-stage-btn") as HTMLButtonElement;
    const unstageBtn = document.getElementById("git-unstage-btn") as HTMLButtonElement;
    const discardBtn = document.getElementById("git-discard-btn") as HTMLButtonElement;
    stageBtn.disabled = status.unstaged.length === 0;
    stageBtn.style.display = status.unstaged.length > 0 ? "" : "none";
    unstageBtn.disabled = status.staged.length === 0;
    discardBtn.disabled = status.unstaged.length === 0;
    // Always show both buttons (disabled when not applicable)
    unstageBtn.style.display = "";

    // Attach click handlers on git file items (open file in explorer with diff=true)
    panel.querySelectorAll(".git-file-item").forEach((el) => {
      el.addEventListener("click", () => {
        const filePath = (el as HTMLElement).dataset.path || "";
        const isStaged = (el as HTMLElement).dataset.staged === "true";
        if (filePath) {
          // Highlight this item, remove highlight from all others
          panel.querySelectorAll(".git-file-item").forEach((other) => other.classList.remove("selected"));
          (el as HTMLElement).classList.add("selected");

          const params = new URLSearchParams(location.search);
          params.set("file", filePath);
          params.set("diff", "true");
          params.set("staged", String(isStaged));
          params.delete("full"); // stored in localStorage
          const url = location.pathname + "?" + params.toString();
          history.replaceState({ file: filePath, diff: true, staged: isStaged }, "", url);
          void openFile(filePath);
        }
      });
    });

    // Restore selection from URL: only in diff mode
    const params = new URLSearchParams(location.search);
    const isDiff = params.get("diff") === "true";
    const currentFile = params.get("file");
    if (isDiff && currentFile) {
      panel.querySelectorAll(".git-file-item").forEach((el) => {
        if ((el as HTMLElement).dataset.path === currentFile) {
          el.classList.add("selected");
        }
      });
    }
  } catch {
    panel.style.display = "none";
  }
}
