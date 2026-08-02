/**
 * Database browser API — backed by the omniagent QUERY TOOL (read-only MCP).
 *
 * All DB access is proxied through POST /mcp/execute on the omniagent backend
 * (query_database, operation "query"). The dashboard server never connects to
 * PostgreSQL directly: no DATABASE_URL, no pg client. Read-only validation is
 * applied here as defense in depth (SELECT/WITH only, no semicolons, no write
 * keywords); the query tool itself and its read-only DB user are the backstop.
 */
import { Router, type Request, type Response } from "express";

const router = Router();

const OMNIAGENT = process.env.OMNIAGENT_URL || "http://omniagent:8080";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** True for identifiers like table/column names: ^[a-zA-Z_][a-zA-Z0-9_]*$ */
function validIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/** Strip SQL block comments and string literals for conservative analysis. */
function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'([^']|'')*'/g, "''")
    .replace(/\s+/g, " ");
}

const STATEMENT_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|MERGE|REPLACE|VACUUM|REINDEX|CALL|EXEC|EXECUTE|COPY|COMMENT|LOCK|SET|RESET|ATTACH|DETACH|ANALYZE|CLUSTER|REFRESH|REASSIGN|SECURITY|UNLISTEN|LISTEN|NOTIFY)\b/i;

/** Defense in depth: read-only validation before anything hits the query tool. */
function assertReadOnly(sql: string): void {
  const cleaned = stripCommentsAndStrings(sql);
  if (!/^(SELECT|WITH)\b/i.test(cleaned)) {
    throw new ApiError(400, "Only read-only SELECT statements are allowed");
  }
  if (cleaned.includes(";")) {
    throw new ApiError(400, "Multi-statement SQL is not allowed");
  }
  if (STATEMENT_KEYWORDS.test(cleaned)) {
    throw new ApiError(400, "Write statements are not allowed");
  }
}

/** Trim whitespace and trailing semicolons from a user-supplied statement. */
function normalizeSql(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

function parsePaging(body: { page?: unknown; pageSize?: unknown }): {
  page: number;
  pageSize: number;
  offset: number;
} {
  const page = Math.max(1, Math.trunc(Number(body.page)) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(Number(body.pageSize)) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

interface McpExecuteResult {
  success?: boolean;
  is_error?: boolean;
  content?: unknown;
  error?: string;
}

/**
 * Run a read-only query through the omniagent query tool:
 *   POST ${OMNIAGENT}/mcp/execute
 *   body: { name: "query_database", arguments: { operation: "query", sql } }
 * Returns the parsed row objects from the pretty-JSON `content` field.
 */
async function runQueryTool(sql: string): Promise<Record<string, unknown>[]> {
  let httpRes: Awaited<ReturnType<typeof fetch>>;
  try {
    httpRes = await fetch(`${OMNIAGENT}/mcp/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "query_database",
        arguments: { operation: "query", sql },
      }),
    });
  } catch (err) {
    throw new ApiError(502, `Query tool unreachable: ${(err as Error).message}`);
  }
  if (!httpRes.ok) {
    throw new ApiError(502, `Query tool returned HTTP ${httpRes.status}`);
  }
  const body = (await httpRes.json().catch(() => ({}))) as McpExecuteResult;
  if (body.success !== true || body.is_error === true) {
    throw new ApiError(502, body.error || (typeof body.content === "string" ? body.content : "Query tool failed"));
  }
  if (typeof body.content !== "string") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(body.content);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

function sendError(res: Response, err: unknown): void {
  const status = err instanceof ApiError ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  res.status(status).json({ error: message });
}

/** GET /api/db/tables — public-schema tables via the query tool. */
router.get("/tables", async (_req: Request, res: Response) => {
  try {
    const rows = await runQueryTool(
      "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    res.json({ tables: rows });
  } catch (err) {
    sendError(res, err);
  }
});

/** GET /api/db/columns?table=X — columns of a table via the query tool. */
router.get("/columns", async (req: Request, res: Response) => {
  try {
    const table = typeof req.query.table === "string" ? req.query.table.trim() : "";
    if (!validIdentifier(table)) {
      throw new ApiError(400, `Invalid table name: ${table}`);
    }
    const rows = await runQueryTool(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}' ORDER BY ordinal_position`,
    );
    res.json({ columns: rows });
  } catch (err) {
    sendError(res, err);
  }
});

interface QueryBody {
  table?: unknown;
  sql?: unknown;
  page?: unknown;
  pageSize?: unknown;
  sortField?: unknown;
  sortDir?: unknown;
}

/**
 * POST /api/db/query — page through a table or a custom read-only SELECT.
 * Body: { table | sql, page?, pageSize?, sortField?, sortDir? }
 * Returns: { columns, rows, total, sql }
 */
router.post("/query", async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as QueryBody;
    const { pageSize, offset } = parsePaging(body);

    const sortDirRaw = typeof body.sortDir === "string" ? body.sortDir.trim().toUpperCase() : "";
    const sortDir = sortDirRaw === "ASC" || sortDirRaw === "DESC" ? sortDirRaw : null;
    const sortField =
      typeof body.sortField === "string" && body.sortField.trim() !== "" ? body.sortField.trim() : null;
    if (sortField && !validIdentifier(sortField)) {
      throw new ApiError(400, `Invalid sort field: ${sortField}`);
    }

    let baseSql: string; // data SELECT without the paging LIMIT/OFFSET
    let execSql: string; // final data SELECT with LIMIT/OFFSET
    let countBaseSql: string; // SELECT whose full row count the pagination total reflects

    if (typeof body.table === "string" && body.table.trim() !== "") {
      // Table mode: trusted identifier + double-quoted identifiers.
      const table = body.table.trim();
      if (!validIdentifier(table)) {
        throw new ApiError(400, `Invalid table name: ${table}`);
      }
      baseSql = `SELECT * FROM "${table}"`;
      if (sortField && sortDir) {
        baseSql += ` ORDER BY "${sortField}" ${sortDir}`;
      }
      execSql = `${baseSql} LIMIT ${pageSize} OFFSET ${offset}`;
      countBaseSql = `SELECT * FROM "${table}"`;
    } else if (typeof body.sql === "string" && body.sql.trim() !== "") {
      // Custom SQL mode: user-provided SELECT, validated read-only.
      const userSql = normalizeSql(body.sql);
      if (userSql === "") {
        throw new ApiError(400, "Empty query");
      }
      assertReadOnly(userSql);
      baseSql = userSql;
      if (sortField && sortDir) {
        baseSql = `SELECT * FROM (${baseSql}) AS sub ORDER BY "${sortField}" ${sortDir}`;
      }
      const hasLimit = /\bLIMIT\b/i.test(stripCommentsAndStrings(baseSql));
      execSql = hasLimit ? baseSql : `${baseSql} LIMIT ${pageSize} OFFSET ${offset}`;
      // Count from the user's un-paginated SQL so a LIMIT inside a subquery
      // or literal is never mistaken for the outer paging LIMIT.
      countBaseSql = userSql;
    } else {
      throw new ApiError(400, "Either 'table' or 'sql' is required");
    }

    // Count over a subquery wrapper of the un-paginated SELECT — never a regex
    // that strips LIMIT/OFFSET (it can strip the wrong LIMIT when the SQL
    // contains LIMIT inside a subquery or string literal).
    const countSql = `SELECT count(*)::bigint AS total FROM (${countBaseSql}) AS sub`;

    const [dataRows, countRows] = await Promise.all([runQueryTool(execSql), runQueryTool(countSql)]);

    const columns = dataRows.length > 0 ? Object.keys(dataRows[0]) : [];
    const total = Number(countRows[0]?.total ?? 0) || 0;

    res.json({ columns, rows: dataRows, total, sql: execSql });
  } catch (err) {
    sendError(res, err);
  }
});

export const dbRouter = router;
