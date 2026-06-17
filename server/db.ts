import pg from "pg";

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
export async function queryDb(
  sql: string,
  params?: any[],
  timeoutSec: number = 15,
): Promise<any[]> {
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
