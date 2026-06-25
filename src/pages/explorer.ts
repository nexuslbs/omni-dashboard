import { apiGet, apiPost, type SearchResult, type FsEntry, type FsReadResponse } from "../lib/api";
import { marked, Renderer } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { escapeHtml } from "../lib/helpers";

// Functions exposed by the global upload feature (defined in index.ts — same bundle)
declare function checkExistingFiles(files: File[]): Promise<Set<string>>;
declare function showUploadModal(files: File[], existingSet: Set<string>): void;

// ── Markdown renderer (uses marked — battle-tested GFM parser) ──
// Configure highlight.js and marked-highlight plugin
hljs.configure({ ignoreUnescapedHTML: true });

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      // Auto-detect language if none specified
      try {
        return hljs.highlightAuto(code).value;
      } catch {
        return code;
      }
    },
  }),
);

function renderMarkdown(md: string): string {
  // Strip YAML frontmatter (---...---) — marked confuses closing --- as setext heading delimiter
  const clean = md.replace(/^---[\s\S]*?---\n*/, "");

  const renderer = new Renderer();
  const origTable = renderer.table.bind(renderer);
  renderer.table = (token) => {
    const html = (origTable as (token: any) => string)(token);
    return '<div class="table-scroll">' + html + "</div>";
  };

  return marked.parse(clean, { gfm: true, renderer }) as string;
}

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

// ── Main render ──

export function renderExplorer(container: HTMLElement): void {
  container.innerHTML = `
    <div class="search-page" id="search-page">
      <div class="explorer-panel" id="explorer-panel">
        <div class="explorer-header">
          <span class="explorer-title">📂 Filesystem</span>
          <div class="explorer-header-actions">
            <button class="explorer-refresh" id="explorer-refresh" title="Refresh file tree">🔄</button>
            <button class="explorer-upload-btn" id="explorer-upload-btn" title="Upload files">⬆</button>
            <button class="explorer-toggle" id="explorer-toggle" title="Collapse explorer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <input type="file" id="file-upload-input" multiple style="display:none" />
          </div>
        </div>
        <div class="explorer-tree" id="explorer-tree">
          <div class="loading">Loading</div>
        </div>
      </div>
      <div class="content-panel">
        <div class="search-bar">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" class="search-input" id="search-input" placeholder="Search the wiki..." />
          <button class="search-clear-btn" id="search-clear" title="Clear search" style="display:none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="content-view" id="content-view">
          <div class="empty-state" style="padding:3rem;text-align:center;color:var(--text-muted);">
            <p style="font-size:1rem;margin-bottom:0.5rem;">Select a file to view</p>
            <p style="font-size:0.875rem;">Browse the filesystem tree or search the wiki</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Refresh button — reloads tree, preserves expanded state and selected file
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

  // Upload button — opens file chooser
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

  // Search input
  const input = document.getElementById("search-input") as HTMLInputElement;
  const clearBtn = document.getElementById("search-clear") as HTMLButtonElement;
  let debounce: ReturnType<typeof setTimeout>;

  function updateClearBtn(): void {
    clearBtn.style.display = input.value.length > 0 ? "flex" : "none";
  }

  function restoreLastFile(): void {
    if (lastOpenedFile) {
      void openFile(lastOpenedFile);
    } else {
      const contentView = document.getElementById("content-view")!;
      contentView.innerHTML = `
        <div class="empty-state" style="padding:3rem;text-align:center;color:var(--text-muted);">
          <p style="font-size:1rem;margin-bottom:0.5rem;">Select a file to view</p>
          <p style="font-size:0.875rem;">Browse the filesystem tree or search the wiki</p>
        </div>
      `;
      contentView.scrollTop = 0;
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(debounce);
    updateClearBtn();
    const query = input.value.trim();
    if (query.length < 2) {
      restoreLastFile();
      return;
    }
    debounce = setTimeout(() => doSearch(query), 300);
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    updateClearBtn();
    restoreLastFile();
    input.focus();
  });

  // Load the file tree, then check for persisted file in URL
  void loadTree(false).then(() => {
    const params = new URLSearchParams(location.search);
    const filePath = params.get("file");
    if (filePath) {
      void navigateToFile(filePath);
    }
  });
}

// ── File tree ──

async function loadTree(reset: boolean): Promise<void> {
  const treeEl = document.getElementById("explorer-tree")!;

  if (reset) {
    treeData = null;
    expandedPaths.clear();
  }

  try {
    const response = await apiGet<{ entries: FsEntry[]; path: string }>("/fs/list?path=/");
    treeData = response.entries
      .map((e) => ({
        entry: e,
        expanded: expandedPaths.has(e.path) || false,
        children: null,
      }));
    renderTree(treeEl);
  } catch (e) {
    treeEl.innerHTML = `<div class="error-state">Failed to load: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
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
      // not just the target — intermediate dirs may not be in expandedPaths
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

  // Update URL so the file path persists on reload
  const params = new URLSearchParams(location.search);
  params.set("file", path);
  const newUrl = location.pathname + "?" + params.toString();
  history.replaceState({ file: path }, "", newUrl);

  try {
    const response = await apiGet<FsReadResponse>(`/fs/read?path=${encodeURIComponent(path)}`);
    const isMarkdown = path.toLowerCase().endsWith(".md");
    const isText =
      /\.(md|txt|js|ts|py|json|yaml|yml|css|html|sh|toml|xml|conf|env|gitignore|dockerfile|tf|rb|go|rs|c|cpp|h|hpp|java|kt|swift|pl|lua|sql)$/i.test(
        path,
      );

    if (isMarkdown) {
      const rendered = renderMarkdown(response.content);
      contentView.innerHTML = `
        <div class="file-header">
          <span class="file-path">${escapeHtml(path)}</span>
          <div class="file-header-actions">
            <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            <span class="file-size">${formatSize(response.size)}</span>
          </div>
        </div>
        <div class="markdown-content">${rendered}</div>
      `;
      contentView.scrollTop = 0;
      // Enhance code blocks with syntax highlighting and copy buttons
      const mdContainer = contentView.querySelector(".markdown-content");
      if (mdContainer) enhanceCodeBlocks(mdContainer as HTMLElement);
    } else if (isText) {
      contentView.innerHTML = `
        <div class="file-header">
          <span class="file-path">${escapeHtml(path)}</span>
          <div class="file-header-actions">
            <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            <span class="file-size">${formatSize(response.size)}</span>
          </div>
        </div>
        <pre class="code-block" style="max-height:none;overflow-y:auto;border-radius:var(--radius-md);padding:1rem;font-size:0.8rem;line-height:1.6;"><code>${escapeHtml(response.content)}</code></pre>
      `;
      contentView.scrollTop = 0;
    } else {
      contentView.innerHTML = `
        <div class="file-header">
          <span class="file-path">${escapeHtml(path)}</span>
          <div class="file-header-actions">
            <a class="file-download-btn" href="/api/fs/download?path=${encodeURIComponent(path)}" download title="Download file">⬇</a>
            <span class="file-size">${formatSize(response.size)}</span>
          </div>
        </div>
        <div class="empty-state" style="padding:3rem;text-align:center;color:var(--text-muted);">
          <p>Binary or unsupported file type</p>
          <p style="font-size:0.875rem;margin-top:0.5rem;">${formatSize(response.size)} — cannot preview</p>
        </div>
      `;
      contentView.scrollTop = 0;
    }
    // Highlight the file in the tree and attach click handler on file-path
    highlightTreeItem(path);
    attachFilePathClick(contentView, path);
  } catch (e) {
    contentView.innerHTML = `<div class="error-state">Failed to load: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
    contentView.scrollTop = 0;
  }
}

// ── Search ──

async function doSearch(query: string): Promise<void> {
  const contentView = document.getElementById("content-view")!;
  contentView.innerHTML = '<div class="loading">Searching</div>';
  contentView.scrollTop = 0;

  try {
    const results = await apiPost<SearchResult[]>("/wiki-search", { query, limit: 10 });
    if (results.length === 0) {
      contentView.innerHTML = '<div class="empty-state">No results found</div>';
      contentView.scrollTop = 0;
      return;
    }
    contentView.innerHTML = `
      <div class="file-header">
        <span class="file-path">Search results for "${escapeHtml(query)}"</span>
        <span class="file-size">${results.length} results</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;padding:1rem;">
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
    contentView.scrollTop = 0;

    // Click search results to open file
    contentView.querySelectorAll(".search-result-item").forEach((el) => {
      el.addEventListener("click", () => {
        const filePath = (el as HTMLElement).dataset.path || "";
        if (filePath) {
          void openFile(filePath);
        }
      });
    });
    // Also make file-path clicks open the file directly
    contentView.querySelectorAll(".search-result-path").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const filePath = (el as HTMLElement).dataset.filePath || "";
        if (filePath) {
          void openFile(filePath);
        }
      });
    });
  } catch (e) {
    contentView.innerHTML = `<div class="error-state">Search failed: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
    contentView.scrollTop = 0;
  }
}
