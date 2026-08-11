import { apiGet, apiPost } from "../lib/api";
import { escapeHtml, formatApiError } from "../lib/helpers";

interface TableInfo {
  table_name: string;
  table_type: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
}

interface QueryResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  sql: string;
}

interface QueryBody {
  table?: string;
  sql?: string;
  page: number;
  pageSize: number;
  sortField?: string;
  sortDir?: "asc" | "desc";
}

type SortDir = "asc" | "desc" | null;

const PAGE_SIZE = 25;
const CELL_MAX = 200;

const state = {
  tables: [] as TableInfo[],
  currentTable: "",
  customSql: "",
  page: 1,
  pageSize: PAGE_SIZE,
  sortField: "",
  sortDir: null as SortDir,
  total: 0,
  columnTypes: {} as Record<string, string>,
};

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function renderDatabase(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Database</h1>
      <p class="page-subtitle">Browse the omniagent PostgreSQL database (read-only)</p>
    </div>
    <div class="db-layout">
      <aside class="db-sidebar card">
        <div class="card-header">
          <h3 class="card-title">Tables</h3>
        </div>
        <div class="card-body">
          <div id="db-table-list" class="db-table-list">
            <div class="loading">Loading tables…</div>
          </div>
        </div>
      </aside>
      <section class="db-main">
        <div class="card">
          <div class="card-header db-card-header">
            <h3 class="card-title" id="db-title">Select a table or run a query</h3>
          </div>
          <div class="card-body">
            <div class="db-sql-box">
              <label class="db-label" for="db-custom-sql">Custom SELECT</label>
              <textarea id="db-custom-sql" rows="3" placeholder="SELECT ... (read-only; LIMIT 25 is appended automatically if missing)"></textarea>
              <div class="db-sql-actions">
                <button id="db-run-sql" class="btn btn-primary">Run</button>
                <span class="db-hint">Ctrl+Enter to run</span>
              </div>
            </div>
            <div id="db-error" class="error-state" hidden></div>
            <div id="db-loading" class="loading" hidden>Loading…</div>
            <div id="db-pagination-top" class="events-nav db-pagination" hidden></div>
            <div id="db-table-wrap" class="table-scroll" hidden>
              <table class="data-table" role="grid">
                <thead id="db-thead"></thead>
                <tbody id="db-tbody"></tbody>
              </table>
            </div>
            <div id="db-empty" class="empty-state" hidden></div>
            <div id="db-pagination-bottom" class="events-nav db-pagination" hidden></div>
          </div>
        </div>
      </section>
    </div>
  `;

  const textarea = el<HTMLTextAreaElement>("db-custom-sql");
  textarea.addEventListener("input", () => {
    state.customSql = textarea.value.trim();
  });
  textarea.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      runCustomSql();
    }
  });
  el("db-run-sql").addEventListener("click", () => runCustomSql());

  void loadTables();
}

async function loadTables(): Promise<void> {
  const listEl = el("db-table-list");
  try {
    const res = await apiGet<{ tables: TableInfo[] }>("/db/tables");
    state.tables = res.tables;
    renderTableList();
  } catch (err) {
    listEl.innerHTML = `<div class="error-state">Failed to load tables: ${escapeHtml(formatApiError(err))}</div>`;
  }
}

function renderTableList(): void {
  const listEl = el("db-table-list");
  if (state.tables.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No tables found</div>`;
    return;
  }
  listEl.innerHTML = state.tables
    .map(
      (t) =>
        `<button class="db-table-item${t.table_name === state.currentTable ? " active" : ""}" data-table="${escapeHtml(t.table_name)}" title="${escapeHtml(t.table_name)} (${escapeHtml(t.table_type)})">${escapeHtml(t.table_name)}</button>`,
    )
    .join("");
  listEl.querySelectorAll<HTMLButtonElement>(".db-table-item").forEach((btn) => {
    btn.addEventListener("click", () => selectTable(btn.dataset.table ?? ""));
  });
}

function selectTable(table: string): void {
  const sql = `SELECT * FROM "${table}"`;
  const textarea = el<HTMLTextAreaElement>("db-custom-sql");
  textarea.value = sql;
  state.customSql = sql;
  state.currentTable = "";
  state.page = 1;
  state.sortField = "";
  state.sortDir = null;
  state.columnTypes = {};
  el("db-title").textContent = `Table: ${table}`;
  renderTableList();
  void loadColumns(table);
  runCustomSql();
}

async function loadColumns(table: string): Promise<void> {
  try {
    const res = await apiGet<{ columns: ColumnInfo[] }>(`/db/columns?table=${encodeURIComponent(table)}`);
    state.columnTypes = {};
    for (const c of res.columns) {
      state.columnTypes[c.column_name] = c.data_type;
    }
  } catch {
    /* non-fatal: sorting still works without type tooltips */
  }
}

function runCustomSql(): void {
  const sql = el<HTMLTextAreaElement>("db-custom-sql").value.trim();
  if (sql === "") {
    showError("Enter a SELECT query first.");
    return;
  }
  state.customSql = sql;
  state.currentTable = "";
  state.page = 1;
  state.sortField = "";
  state.sortDir = null;
  state.columnTypes = {};
  el("db-title").textContent = "Custom query";
  renderTableList();
  void runQuery(currentBody());
}

function currentBody(): QueryBody {
  const body: QueryBody = { page: state.page, pageSize: state.pageSize };
  if (state.currentTable !== "") {
    body.table = state.currentTable;
  } else if (state.customSql !== "") {
    body.sql = state.customSql;
  }
  if (state.sortField !== "" && state.sortDir) {
    body.sortField = state.sortField;
    body.sortDir = state.sortDir;
  }
  return body;
}

function cycleSort(col: string): void {
  if (state.sortField !== col) {
    state.sortField = col;
    state.sortDir = "asc";
  } else if (state.sortDir === "asc") {
    state.sortDir = "desc";
  } else if (state.sortDir === "desc") {
    state.sortField = "";
    state.sortDir = null;
  }
  state.page = 1;
  void runQuery(currentBody());
}

async function runQuery(body: QueryBody): Promise<void> {
  el("db-error").hidden = true;
  el("db-loading").hidden = false;
  el("db-table-wrap").hidden = true;
  el("db-empty").hidden = true;
  try {
    const res = await apiPost<QueryResponse>("/db/query", body);
    state.total = res.total;
    state.page = body.page;
    renderResult(res);
  } catch (err) {
    state.total = 0;
    showError(`Query failed: ${formatApiError(err)}`);
  } finally {
    el("db-loading").hidden = true;
  }
}

function showError(message: string): void {
  const errorEl = el("db-error");
  errorEl.hidden = false;
  errorEl.innerHTML = escapeHtml(message);
  el("db-table-wrap").hidden = true;
  el("db-empty").hidden = true;
  el("db-pagination-top").hidden = true;
  el("db-pagination-bottom").hidden = true;
}

function renderResult(res: QueryResponse): void {
  const thead = el("db-thead");
  const tbody = el("db-tbody");
  const wrap = el("db-table-wrap");

  if (res.columns.length === 0) {
    wrap.hidden = true;
    const empty = el("db-empty");
    empty.hidden = false;
    empty.innerHTML = "Query returned no columns.";
    renderPagination();
    return;
  }

  thead.innerHTML = res.columns
    .map((col) => {
      const type = state.columnTypes[col] ?? "";
      const activeDir = state.sortField === col ? state.sortDir : null;
      const upCls = activeDir === "asc" ? "db-sort-arrow active" : "db-sort-arrow";
      const downCls = activeDir === "desc" ? "db-sort-arrow active" : "db-sort-arrow";
      return `<th role="columnheader" class="db-th db-th-sortable" data-col="${escapeHtml(col)}" title="Sort by ${escapeHtml(col)}${type ? ` (${escapeHtml(type)})` : ""}"><span class="db-th-name">${escapeHtml(col)}</span><span class="db-sort-arrows" aria-hidden="true"><span class="${upCls}">▲</span><span class="${downCls}">▼</span></span></th>`;
    })
    .join("");

  tbody.innerHTML = res.rows
    .map((row) => {
      const tds = res.columns
        .map((col) => {
          const v = row[col];
          const text =
            v === null || v === undefined ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v);
          const isNull = v === null || v === undefined;
          const short = text.length > CELL_MAX ? `${text.slice(0, CELL_MAX)}…` : text;
          const title = text.length > CELL_MAX ? ` title="${escapeHtml(text)}"` : "";
          return `<td role="gridcell" class="${isNull ? "db-null" : ""}"${title}>${escapeHtml(short)}</td>`;
        })
        .join("");
      return `<tr role="row">${tds}</tr>`;
    })
    .join("");

  wrap.hidden = false;
  el("db-empty").hidden = true;
  renderPagination();

  thead.querySelectorAll<HTMLTableCellElement>(".db-th-sortable").forEach((th) => {
    th.addEventListener("click", () => cycleSort(th.dataset.col ?? ""));
  });
}

function renderPagination(): void {
  const totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
  // renderPagination is only called after a query result (renderResult), so
  // always show it — at the top AND bottom of the results area, even when a
  // query returns 0 rows (the initial state stays hidden via the HTML).
  const show = true;
  const markup = () => {
    const prevDisabled = state.page <= 1;
    const nextDisabled = state.page >= totalPages;
    return `
      <button class="nav-btn" data-page="${state.page - 1}" ${prevDisabled ? "disabled" : ""}>← Prev</button>
      <span class="db-page-info">Page ${state.page} of ${totalPages} (${state.total} rows)</span>
      <button class="nav-btn" data-page="${state.page + 1}" ${nextDisabled ? "disabled" : ""}>Next →</button>
    `;
  };
  const top = el("db-pagination-top");
  const bottom = el("db-pagination-bottom");
  top.hidden = !show;
  bottom.hidden = !show;
  top.innerHTML = markup();
  bottom.innerHTML = markup();
  for (const pager of [top, bottom]) {
    pager.querySelectorAll<HTMLButtonElement>(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = Number(btn.dataset.page);
        if (p >= 1 && p <= totalPages) {
          state.page = p;
          void runQuery(currentBody());
        }
      });
    });
  }
}
