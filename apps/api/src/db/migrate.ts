import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { createDb, type Db } from "./client.js";

const folder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export const runMigrations = (db: Db) => migrate(db, { migrationsFolder: folder });

// `pnpm db:deploy` runs this file directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const { db, pool } = createDb(url, process.env.DATABASE_SSL as "require" | "disable" | undefined);
  await runMigrations(db);
  await pool.end();
  console.log("migrations applied");
}
