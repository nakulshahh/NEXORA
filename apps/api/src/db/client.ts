import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>["db"];

export function createDb(url: string, ssl?: "require" | "disable") {
  // Neon/Render give a normal Postgres URL. The pool is small on purpose: managed Postgres has low connection limits.
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: ssl === "require" ? { rejectUnauthorized: true } : undefined,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
