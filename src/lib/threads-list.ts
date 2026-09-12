/**
 * Shared thread-activity list used by the kanban task, schedule job and hook
 * details pages: a page of threads (the LAST MESSAGE of each), Prev/Next
 * pagination, a Recent/Oldest order toggle and a "Showing X-Y of Z" counter.
 *
 * IMPORTANT: the page loader goes through apiGet() on purpose. omniagent wraps
 * every response in {"success":true,"data":...}; a raw fetch() + res.json()
 * silently reads undefined rows and renders the empty state forever (that was
 * the schedule Activity bug, 2026-09-12). Never hand this component a loader
 * that parses the envelope itself.
 */
import { apiGet, type Message } from "./api";
import { renderMessageCard, wireMessageCardToggles } from "./message-card";

export type ThreadsOrder = "desc" | "asc";

export interface ThreadsPage {
  rows: Message[];
  total: number;
}

export interface ThreadsListIds {
  container: string;
  pageInfo: string;
  prev: string;
  next: string;
  order: string;
  count: string;
  pageInfoBottom: string;
  prevBottom: string;
  nextBottom: string;
  orderBottom: string;
}

/**
 * Element ids for the standard card markup: the DOM convention is
 * `<name>-threads` for the container plus `<name>-threads-*` for the nav,
 * counters and order toggles (kanban, schedule and hook details pages).
 */
export function threadsListIds(name: string): ThreadsListIds {
  return {
    container: `${name}-threads`,
    pageInfo: `${name}-threads-page-info`,
    prev: `${name}-threads-prev-page`,
    next: `${name}-threads-next-page`,
    order: `${name}-threads-order-btn`,
    count: `${name}-threads-count`,
    pageInfoBottom: `${name}-threads-page-info-bottom`,
    prevBottom: `${name}-threads-prev-page-bottom`,
    nextBottom: `${name}-threads-next-page-bottom`,
    orderBottom: `${name}-threads-order-btn-bottom`,
  };
}

/** Envelope-safe page loader for a `/threads` endpoint (apiGet unwraps data). */
export function apiThreadsLoader(
  basePath: string,
): (q: { offset: number; limit: number; order: ThreadsOrder }) => Promise<ThreadsPage> {
  return (q) =>
    apiGet<ThreadsPage>(
      `${basePath}?offset=${q.offset}&limit=${q.limit}&order=${q.order}`,
    ) as Promise<ThreadsPage>;
}

export interface ThreadsListOptions {
  ids: ThreadsListIds;
  /** Shown in the container when the page (or the whole list) is empty. */
  emptyText: string;
  /** Message shown instead of "No activity found" when total is 0. */
  emptyCountText?: string;
  errorText?: string;
  limit?: number;
  /** Card scrolled into view after bottom-nav pagination. */
  scrollIntoViewId?: string;
  fetchPage: (q: { offset: number; limit: number; order: ThreadsOrder }) => Promise<ThreadsPage>;
}

export interface ThreadsList {
  /** Reload the current page (keeps offset + order). */
  reload: () => Promise<void>;
  /** Back to the first page, Recent order (used when the list switches target). */
  reset: () => void;
}

export function createThreadsList(opts: ThreadsListOptions): ThreadsList {
  const limit = opts.limit ?? 10;
  let offset = 0;
  let order: ThreadsOrder = "desc";
  // Listeners are re-attached on every load (a fresh page render replaces the
  // elements); one AbortController per load prevents duplicate handlers.
  let abort: AbortController | null = null;

  function setOrderButtonLabel(): void {
    const arrow = order === "desc" ? "\u2193" : "\u2191";
    const label = order === "desc" ? "Recent" : "Oldest";
    for (const id of [opts.ids.order, opts.ids.orderBottom]) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const arrowEl = btn.querySelector(".arrow");
      if (arrowEl) arrowEl.textContent = arrow;
      if (btn.childNodes[1]) btn.childNodes[1].textContent = " " + label;
    }
  }

  function updateNav(total: number, shown: number): void {
    const currentPage = Math.floor(offset / limit) + 1;
    const pageInfo = document.getElementById(opts.ids.pageInfo);
    const pageInfoBottom = document.getElementById(opts.ids.pageInfoBottom);
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} (${total} total)`;
    if (pageInfoBottom) pageInfoBottom.textContent = `Page ${currentPage} (${total} total)`;

    const prev = document.getElementById(opts.ids.prev) as HTMLButtonElement | null;
    const next = document.getElementById(opts.ids.next) as HTMLButtonElement | null;
    const prevBottom = document.getElementById(opts.ids.prevBottom) as HTMLButtonElement | null;
    const nextBottom = document.getElementById(opts.ids.nextBottom) as HTMLButtonElement | null;
    for (const b of [prev, prevBottom]) if (b) b.disabled = offset <= 0;
    for (const b of [next, nextBottom]) if (b) b.disabled = offset + limit >= total;

    const countEl = document.getElementById(opts.ids.count);
    if (countEl) {
      const start = total > 0 ? offset + 1 : 0;
      const end = Math.min(offset + shown, total);
      countEl.textContent =
        total > 0 ? `Showing ${start}\u2013${end} of ${total}` : (opts.emptyCountText ?? "No activity found");
    }
    setOrderButtonLabel();
  }

  function bindNav(): void {
    abort?.abort();
    abort = new AbortController();
    const { signal } = abort;
    const on = (id: string, fn: () => void): void => {
      document.getElementById(id)?.addEventListener("click", fn, { signal });
    };
    const goTo = (next: number, scroll: boolean): void => {
      offset = Math.max(0, next);
      void reload();
      if (scroll && opts.scrollIntoViewId) {
        document
          .getElementById(opts.scrollIntoViewId)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    const toggleOrder = (): void => {
      order = order === "desc" ? "asc" : "desc";
      offset = 0;
      void reload();
    };
    on(opts.ids.prev, () => goTo(offset - limit, false));
    on(opts.ids.next, () => goTo(offset + limit, false));
    on(opts.ids.prevBottom, () => goTo(offset - limit, true));
    on(opts.ids.nextBottom, () => goTo(offset + limit, true));
    on(opts.ids.order, toggleOrder);
    on(opts.ids.orderBottom, toggleOrder);
  }

  async function reload(): Promise<void> {
    const el = document.getElementById(opts.ids.container);
    if (!el) return;
    try {
      const data = await opts.fetchPage({ offset, limit, order });
      const total = parseInt(String(data?.total ?? 0)) || 0;
      const rows: Message[] = Array.isArray(data?.rows) ? data.rows : [];

      if (rows.length === 0) {
        el.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;padding:1rem 0;">${opts.emptyText}</div>`;
      } else {
        el.innerHTML =
          '<div class="events-scroll">' +
          rows.map((row: Message) => renderMessageCard(row)).join("") +
          "</div>";
        wireMessageCardToggles(el);
      }

      updateNav(total, rows.length);
      bindNav();
    } catch {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;">${
        opts.errorText ?? "Failed to load activity."
      }</div>`;
    }
  }

  return {
    reload,
    reset: () => {
      offset = 0;
      order = "desc";
    },
  };
}
