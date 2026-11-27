import { sql } from "drizzle-orm";
import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import type { Db } from "../db/client.js";

/**
 * express-rate-limit store backed by Postgres, so every API instance counts into the same row.
 * The whole read-modify-write is ONE statement (INSERT ... ON CONFLICT DO UPDATE ... RETURNING): Postgres locks the
 * row for the duration, so two instances can never both read 19 and both write 20. This is the same atomicity
 * argument as Redis INCR, using infrastructure we already run.
 */
export class PgRateLimitStore implements Store {
  localKeys = false;
  private windowMs = 60_000;
  private timer: NodeJS.Timeout | undefined;
  constructor(private readonly db: Db, readonly prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
    // Expired rows are harmless (the next increment resets them) but must not accumulate forever.
    this.timer = setInterval(() => { void this.purge().catch(() => {}); }, 10 * 60_000);
    this.timer.unref();
  }
  private k(key: string) { return `${this.prefix}:${key}`; }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const res = await this.db.execute(sql`
      INSERT INTO rate_limits (key, hits, reset_at) VALUES (${this.k(key)}, 1, now() + (${this.windowMs} * interval '1 millisecond'))
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + (${this.windowMs} * interval '1 millisecond') ELSE rate_limits.reset_at END
      RETURNING hits, reset_at`);
    const row = res.rows[0] as { hits: number; reset_at: Date | string };
    return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) };
  }
  async decrement(key: string) { await this.db.execute(sql`UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = ${this.k(key)}`); }
  async resetKey(key: string) { await this.db.execute(sql`DELETE FROM rate_limits WHERE key = ${this.k(key)}`); }
  async purge() { await this.db.execute(sql`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'`); }
  shutdown() { if (this.timer) clearInterval(this.timer); }
}
