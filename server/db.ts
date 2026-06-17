import pg from "pg";
import { execSync } from "child_process";

const pool = new pg.Pool({
  host: process.env.PGHOST || "postgres",
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER || "omniagent",
  password: process.env.PGPASSWORD || "omniagent",
  database: process.env.PGDATABASE || "omniagent",
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Execute a SQL query against the OmniAgent PostgreSQL database.
 * Returns rows as plain objects. On failure, retries up to 3 times.
 */
export async function queryDb(sql: string, params?: any[], _timeoutSec: number = 15): Promise<any[]> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let client: pg.PoolClient | null = null;
    try {
      client = await pool.connect();
      const result = await client.query({
        text: sql,
        values: params || [],
        rowMode: "array",
      });
      // Convert to array of objects with named properties
      const rows: any[] = [];
      const fields = result.fields?.map((f) => f.name) || [];
      for (const row of result.rows) {
        const obj: Record<string, any> = {};
        fields.forEach((name, i) => {
          obj[name] = row[i] ?? null;
        });
        rows.push(obj);
      }
      return rows;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.pow(2, attempt) * 500;
        console.error(
          `[db] Query attempt ${attempt + 1} failed, retrying in ${backoffMs}ms: ${lastError.message}`,
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    } finally {
      if (client) client.release();
    }
  }

  throw lastError ?? new Error("Query failed after retries");
}

const AGENT_DB_PATH = "/hermes-data/agent-interactions.db";

/**
 * Shell-quote a string for /bin/sh.
 * Wraps in double quotes, escaping only ", $, \, and `.
 */
function shellQuote(s: string): string {
  const escaped = s.replace(/["$\\`]/g, "\\$&");
  return `"${escaped}"`;
}

/**
 * Execute a SQL query against agent-interactions.db using sqlite3 CLI.
 * Returns parsed JSON rows, or empty array on persistent failure.
 */
export function queryAgentDb(sql: string, timeoutSec: number = 15): any[] {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const cmd = [
        `sqlite3`,
        `-cmd ".timeout 30000"`,
        `-json`,
        shellQuote(AGENT_DB_PATH),
        shellQuote(sql),
      ].join(" ");
      const output = execSync(cmd, {
        timeout: timeoutSec * 1000,
        encoding: "utf-8",
        maxBuffer: 16 * 1024 * 1024,
        shell: "/bin/sh",
      });
      const text = (output || "").toString().trim();
      return text ? JSON.parse(text) : [];
    } catch (e: any) {
      const isLast = attempt === maxAttempts;
      console.error(`queryAgentDb attempt ${attempt}/${maxAttempts}: ${e?.message || e}`);
      if (isLast) {
        console.error(`queryAgentDb: all ${maxAttempts} attempts failed for SQL: ${sql.slice(0, 120)}`);
        return [];
      }
      execSync(`sleep ${attempt}`, { timeout: 5 });
    }
  }
  return [];
}
