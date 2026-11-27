import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import { PgRateLimitStore } from "../ratelimit/pgStore.js";
import { consoleMailer, type Mailer } from "./mailer.js";
import { consumeResetToken, createResetToken } from "./reset.js";
import { HttpError, notFound, parse } from "../http.js";
import { clearSessionCookie, clientMeta, cookieOptions, requireAuth, setSessionCookie } from "./middleware.js";
import type { Providers } from "./oauth.js";
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from "./password.js";
import { SESSION_COOKIE, createSession, destroyAllSessions, destroySession, listSessions, revokeSession } from "./sessions.js";
import { findByEmail, normalizeEmail, resolveOAuth } from "./users.js";

const Credentials = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  password: z.string().min(1).max(128),
});
const Register = Credentials.extend({ displayName: z.string().trim().min(1).max(80).optional() });
const OAUTH_COOKIE = "nx_oauth";
const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

function limiter(cfg: Config, db: Db, name: string, windowMs: number, limit: number) {
  return rateLimit({
    windowMs, limit, store: new PgRateLimitStore(db, name), standardHeaders: "draft-7", legacyHeaders: false, skip: () => !cfg.rateLimit,
    handler: (_req, res) => { res.status(429).json({ error: { code: "rate_limited", message: "Too many attempts. Try again later." } }); },
  });
}

/** Only same-site relative paths are allowed as a post-login destination (blocks open redirects). */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/learn";
  return next;
}

export function authRouter(cfg: Config, db: Db, providers: Providers, mailer: Mailer = consoleMailer(cfg.production)) {
  const r = Router();
  const authLimiter = limiter(cfg, db, "auth", 15 * 60_000, 20); // per IP, shared across instances
  const resetLimiter = limiter(cfg, db, "reset", 60 * 60_000, 5); // per IP
  const publicUser = (u: { id: string; email: string; displayName: string | null; emailVerified: boolean; hasPassword: boolean }) =>
    ({ id: u.id, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified, hasPassword: u.hasPassword });

  async function startSession(req: Request, res: Response, userId: string) {
    // Always issue a fresh token at login: a pre-existing (possibly planted) cookie is never reused (session fixation).
    const old = req.cookies?.[SESSION_COOKIE];
    if (typeof old === "string") await destroySession(db, old);
    const { token, expiresAt } = await createSession(db, userId, clientMeta(req));
    setSessionCookie(cfg, res, token, expiresAt);
  }

  r.get("/providers", (_req, res) => {
    res.json({ password: true, oauth: Object.keys(providers) });
  });

  r.post("/register", authLimiter, async (req, res) => {
    const body = parse(Register, req.body);
    const email = normalizeEmail(body.email);
    const problem = passwordProblem(body.password, email);
    if (problem) throw new HttpError(400, "weak_password", problem);
    if (await findByEmail(db, email)) throw new HttpError(409, "email_taken", "An account with this email already exists.");
    const passwordHash = await hashPassword(body.password);
    // The unique index is the real guard; a concurrent duplicate lands in the catch.
    const [u] = await db.insert(users).values({ email, passwordHash, displayName: body.displayName ?? null }).onConflictDoNothing().returning();
    if (!u) throw new HttpError(409, "email_taken", "An account with this email already exists.");
    await startSession(req, res, u.id);
    res.status(201).json({ user: publicUser({ ...u, hasPassword: true }) });
  });

  r.post("/login", authLimiter, async (req, res) => {
    const body = parse(Credentials, req.body);
    const u = await findByEmail(db, body.email);
    if (!u || !u.passwordHash) { await dummyVerify(body.password); throw new HttpError(401, "invalid_credentials", GENERIC_LOGIN_ERROR); }
    if (!(await verifyPassword(u.passwordHash, body.password))) throw new HttpError(401, "invalid_credentials", GENERIC_LOGIN_ERROR);
    await startSession(req, res, u.id);
    res.json({ user: publicUser({ ...u, hasPassword: true }) });
  });

  // Password reset. The response never reveals whether the address has an account (same body, same status).
  r.post("/password/forgot", resetLimiter, async (req, res) => {
    const { email } = parse(z.object({ email: z.string().trim().max(254).pipe(z.email()) }), req.body);
    const u = await findByEmail(db, normalizeEmail(email));
    if (u) {
      const token = await createResetToken(db, u.id);
      // The token travels in the URL fragment: it is not sent to servers, proxies or Referer headers.
      await mailer.send({ to: u.email, subject: "Reset your NEXORA password", text: `Use this link within 30 minutes to choose a new password:\n${cfg.primaryOrigin}/reset-password#token=${token}\n\nIf you did not ask for this, ignore this email.` });
    }
    res.json({ ok: true });
  });

  r.post("/password/reset", resetLimiter, async (req, res) => {
    const body = parse(z.object({ token: z.string().min(20).max(100), password: z.string().min(1).max(128) }), req.body);
    // Check the strength rule against the account the token belongs to, without spending the token on a weak password.
    const done = await consumeResetToken(db, body.token, body.password, (email) => passwordProblem(body.password, email));
    if (done === "weak") throw new HttpError(400, "weak_password", "That password is too weak or too easy to guess.");
    if (!done) throw new HttpError(400, "invalid_token", "This reset link is invalid or has expired. Request a new one.");
    clearSessionCookie(cfg, res);
    res.json({ ok: true });
  });

  r.post("/logout", async (req, res) => {
    const t = req.cookies?.[SESSION_COOKIE];
    if (typeof t === "string") await destroySession(db, t);
    clearSessionCookie(cfg, res);
    res.status(204).end();
  });

  r.post("/logout-all", requireAuth, async (req, res) => {
    await destroyAllSessions(db, req.auth!.user.id);
    clearSessionCookie(cfg, res);
    res.status(204).end();
  });

  r.get("/me", (req, res) => {
    res.json({ user: req.auth ? publicUser(req.auth.user) : null });
  });

  r.get("/sessions", requireAuth, async (req, res) => {
    const rows = await listSessions(db, req.auth!.user.id);
    res.json({ sessions: rows.map((s) => ({ ...s, current: s.id === req.auth!.publicId })) });
  });

  r.delete("/sessions/:id", requireAuth, async (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    // Not yours and not existing look identical: 404, never 403 (no information about other users' sessions).
    if (!id.success || !(await revokeSession(db, req.auth!.user.id, id.data))) throw notFound("Session not found");
    if (id.data === req.auth!.publicId) clearSessionCookie(cfg, res);
    res.status(204).end();
  });

  r.delete("/account", requireAuth, async (req, res) => {
    // Cascades remove sessions, identities and all progress.
    await db.delete(users).where(eq(users.id, req.auth!.user.id));
    clearSessionCookie(cfg, res);
    res.status(204).end();
  });

  // ---- OAuth (authorization code flow; PKCE where the provider supports it) ----
  r.get("/oauth/:provider/start", authLimiter, (req, res) => {
    const p = providers[String(req.params.provider)];
    if (!p) throw notFound("Unknown or unconfigured provider");
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const payload = JSON.stringify({ state, verifier, provider: p.id, next: safeNext(req.query.next) });
    // Signed + HttpOnly + short-lived: binds the callback to the browser that started the flow.
    res.cookie(OAUTH_COOKIE, payload, { ...cookieOptions(cfg), signed: true, maxAge: 10 * 60_000 });
    res.redirect(302, p.authorizationUrl(state, verifier).toString());
  });

  r.get("/oauth/:provider/callback", authLimiter, async (req, res) => {
    const fail = (reason: string) => { res.clearCookie(OAUTH_COOKIE, cookieOptions(cfg)); res.redirect(302, `${cfg.primaryOrigin}/auth/sign-in?error=${encodeURIComponent(reason)}`); };
    const p = providers[String(req.params.provider)];
    const raw = req.signedCookies?.[OAUTH_COOKIE];
    if (!p || typeof raw !== "string") return fail("expired");
    let saved: { state: string; verifier: string; provider: string; next: string };
    try { saved = JSON.parse(raw); } catch { return fail("expired"); }
    const { code, state } = req.query;
    if (saved.provider !== p.id || typeof code !== "string" || typeof state !== "string" || state !== saved.state) return fail("state");
    let profile;
    try { profile = await p.exchange(code, saved.verifier); } catch (err) { req.log?.warn({ err }, "oauth exchange failed"); return fail("provider"); }
    const out = await resolveOAuth(db, profile);
    if ("error" in out) return fail(out.error);
    await startSession(req, res, out.userId);
    res.clearCookie(OAUTH_COOKIE, cookieOptions(cfg));
    res.redirect(302, `${cfg.primaryOrigin}${safeNext(saved.next)}`);
  });

  return r;
}
