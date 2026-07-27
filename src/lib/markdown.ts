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
