import { marked, Renderer } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

// ── Configure highlight.js ──
hljs.configure({ ignoreUnescapedHTML: true });

// ── Register marked-highlight extension ONCE (singleton) ──
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

/** Render markdown to HTML with syntax highlighting */
export function renderMarkdown(md: string): string {
  // Strip YAML frontmatter (---...---): marked confuses closing --- as setext heading delimiter
  const clean = md.replace(/^---[\s\S]*?---\n*/, "");

  const renderer = new Renderer();
  const origTable = renderer.table.bind(renderer);
  renderer.table = (header: string, body: string) => {
    const html = (origTable as (header: string, body: string) => string)(header, body);
    return '<div class="table-scroll">' + html + "</div>";
  };

  return marked.parse(clean, { gfm: true, renderer }) as string;
}

/**
 * Enhance <pre> code blocks with a language label + copy button.
 * Same behaviour as the messages boxes and the Explorer page.
 */
export function enhanceCodeBlocks(container: HTMLElement): void {
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".code-actions")) return;
    const code = pre.querySelector("code");
    if (!code) return;
    const actions = document.createElement("div");
    actions.className = "code-actions";
    const langLabel = document.createElement("span");
    langLabel.className = "code-lang";
    const cls = Array.from(code.classList).find((c) => c.startsWith("language-"));
    langLabel.textContent = cls ? cls.replace("language-", "") : "";
    if (langLabel.textContent) actions.appendChild(langLabel);
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

/**
 * Small stylized Markdown toggle button, identical to the messages boxes
 * ("ev-view-btn ev-view-md" style).
 *
 * `contentEl` is rendered as Markdown immediately; clicking the returned
 * button switches it to the raw/original text (and back).
 * While the rendered view is shown the button reads "View original".
 */
export function createMarkdownToggle(raw: string, contentEl: HTMLElement): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ev-view-btn ev-view-md";

  let showingMarkdown = true;

  const showMarkdown = (): void => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderMarkdown(raw);
    enhanceCodeBlocks(wrapper);
    contentEl.innerHTML = `<div class="markdown-content">${wrapper.innerHTML}</div>`;
    showingMarkdown = true;
    btn.textContent = "View original";
    btn.title = "Show the original (raw) text";
  };

  const showOriginal = (): void => {
    contentEl.textContent = raw;
    showingMarkdown = false;
    btn.textContent = "See as Markdown";
    btn.title = "Render the text as Markdown";
  };

  btn.addEventListener("click", () => {
    if (showingMarkdown) showOriginal();
    else showMarkdown();
  });

  showMarkdown();
  return btn;
}
