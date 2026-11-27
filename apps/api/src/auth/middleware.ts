import type { Request, RequestHandler, Response } from "express";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { HttpError } from "../http.js";
import { SESSION_COOKIE, lookupSession, type ActiveSession } from "./sessions.js";

declare module "express-serve-static-core" {
  interface Request { auth?: ActiveSession }
}

export const cookieOptions = (cfg: Config) => ({
  httpOnly: true, secure: cfg.secureCookies, sameSite: "lax" as const, path: "/",
});

export function setSessionCookie(cfg: Config, res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(cfg), expires: expiresAt });
}
export const clearSessionCookie = (cfg: Config, res: Response) => res.clearCookie(SESSION_COOKIE, cookieOptions(cfg));

/** Loads the session (if any) onto req.auth. Never rejects; use requireAuth for that. */
export const loadSession = (db: Db): RequestHandler => async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length > 0 && token.length < 200) req.auth = (await lookupSession(db, token)) ?? undefined;
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw new HttpError(401, "unauthenticated", "Sign in required");
  next();
};

/**
 * CSRF defence for cookie auth, in three layers:
 *  - SameSite=Lax cookies are not sent on cross-site POST/PUT/DELETE;
 *  - every state-changing request must carry an Origin (or Referer) from our allow-list;
 *  - bodies must be JSON, which a plain HTML form cannot send.
 */
/** Referer is attacker-influenced text; an unparsable one means "no usable origin" (blocked), never a 500. */
function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).origin; } catch { return undefined; }
}

export const csrfGuard = (cfg: Config): RequestHandler => (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin") ?? originOf(req.get("referer"));
  if (!origin || !cfg.webOrigins.includes(origin)) throw new HttpError(403, "bad_origin", "Cross-site request blocked");
  const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"] !== undefined;
  if (hasBody && !req.is("application/json")) throw new HttpError(415, "unsupported_media_type", "JSON required");
  next();
};

export const clientMeta = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") });
