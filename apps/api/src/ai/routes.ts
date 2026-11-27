import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { PgRateLimitStore } from "../ratelimit/pgStore.js";
import { HttpError, parse } from "../http.js";

const Body = z.object({
  question: z.string().trim().min(3).max(500),
  context: z.object({ chapter: z.string().max(32).optional(), lesson: z.string().max(80).optional() }).optional(),
});

/** The AI service is a separate process; this port lets tests (and other hosts) swap the transport. */
export type AiFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * Gateway to the AI Professor. The browser never talks to the AI service: it needs a signed-in session here, the
 * service needs a shared secret, and failures are translated into honest 503/504s instead of leaking internals.
 */
export function aiRouter(cfg: Config, db: Db, doFetch: AiFetch = fetch as unknown as AiFetch): Router {
  const r = Router();
  const limiter = rateLimit({
    windowMs: 60_000, limit: 20, store: new PgRateLimitStore(db, "ai"), standardHeaders: "draft-7", legacyHeaders: false, skip: () => !cfg.rateLimit,
    keyGenerator: (req) => req.auth?.user.id ?? "anon", // per account, not per IP: a classroom shares one IP
    validate: { keyGeneratorIpFallback: false },
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many questions. Wait a minute and try again.")),
  });

  r.post("/ask", requireAuth, limiter, async (req, res) => {
    if (!cfg.ai) throw new HttpError(503, "ai_unavailable", "The AI Professor is not configured on this server.");
    const body = parse(Body, req.body);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.ai.timeoutMs);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (cfg.ai.token) headers["x-internal-token"] = cfg.ai.token;
      headers["x-request-id"] = String(req.id);   // same id in our log line and the AI service's
      const up = await doFetch(`${cfg.ai.url}/v1/ask`, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
      if (up.status !== 200) {
        req.log?.error({ upstream: up.status }, "ai service returned non-200");
        throw new HttpError(503, "ai_unavailable", "The AI Professor is unavailable right now.");
      }
      res.json(await up.json());
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (ctl.signal.aborted) throw new HttpError(504, "ai_timeout", "The AI Professor took too long. Try again.");
      req.log?.error({ err: e }, "ai service unreachable");
      throw new HttpError(503, "ai_unavailable", "The AI Professor is unavailable right now.");
    } finally {
      clearTimeout(timer);
    }
  });
  return r;
}
