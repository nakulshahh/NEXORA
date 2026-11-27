import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { purgeExpired } from "./auth/sessions.js";

const cfg = loadConfig();
const { db, pool } = createDb(cfg.databaseUrl, cfg.databaseSsl);
const app = createApp({ cfg, db });

const server = app.listen(cfg.port, () => console.log(JSON.stringify({ msg: "nexora-api listening", port: cfg.port, env: cfg.env, oauth: { github: !!cfg.github, google: !!cfg.google } })));
const sweep = setInterval(() => { purgeExpired(db).catch(() => {}); }, 6 * 3600_000);
sweep.unref();

// Graceful shutdown: stop accepting, let in-flight requests finish, then close the pool. Render sends SIGTERM on deploy.
function shutdown(signal: string) {
  console.log(JSON.stringify({ msg: "shutting down", signal }));
  server.close(() => { pool.end().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
