import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export const SESSION_COOKIE = "nx_sid";
const ABSOLUTE_MS = 30 * 86_400_000;
const IDLE_MS = 14 * 86_400_000;
const TOUCH_AFTER_MS = 5 * 60_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface SessionUser { id: string; email: string; displayName: string | null; emailVerified: boolean; hasPassword: boolean }
export interface ActiveSession { publicId: string; user: SessionUser }

/** Creates a session and returns the raw token. Only its hash is stored. */
export async function createSession(db: Db, userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ABSOLUTE_MS);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  return { token, expiresAt };
}

export async function lookupSession(db: Db, token: string): Promise<ActiveSession | null> {
  const id = sha256(token);
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  const idleFor = Date.now() - row.s.lastSeenAt.getTime();
  if (idleFor > IDLE_MS) { await db.delete(sessions).where(eq(sessions.id, id)); return null; }
  if (idleFor > TOUCH_AFTER_MS) await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, id));
  const u = row.u;
  return { publicId: row.s.publicId, user: { id: u.id, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified, hasPassword: u.passwordHash !== null } };
}

export const destroySession = (db: Db, token: string) => db.delete(sessions).where(eq(sessions.id, sha256(token)));
export const destroyAllSessions = (db: Db, userId: string, exceptPublicId?: string) =>
  db.delete(sessions).where(exceptPublicId ? and(eq(sessions.userId, userId), ne(sessions.publicId, exceptPublicId)) : eq(sessions.userId, userId));

export const listSessions = (db: Db, userId: string) =>
  db.select({ id: sessions.publicId, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent })
    .from(sessions).where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date()))).orderBy(sessions.createdAt);

/** Returns true if a session owned by this user was revoked. A foreign or unknown id is simply "not found". */
export async function revokeSession(db: Db, userId: string, publicId: string) {
  const r = await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.publicId, publicId))).returning({ id: sessions.id });
  return r.length > 0;
}

export const purgeExpired = (db: Db) => db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`));
