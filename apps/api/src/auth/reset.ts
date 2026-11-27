import { createHash, randomBytes } from "node:crypto";
import { TransactionRollbackError, and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { passwordResets, users } from "../db/schema.js";
import { hashPassword } from "./password.js";
import { destroyAllSessions } from "./sessions.js";

export const RESET_TTL_MS = 30 * 60_000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Create a reset token. Only its SHA-256 is stored, so a database leak yields nothing usable (same rule as sessions).
 * Older unused tokens for the user are invalidated: at most one live link per account.
 */
export async function createResetToken(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.update(passwordResets).set({ usedAt: sql`now()` }).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({ tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  });
  return token;
}

/**
 * Spend a token and set the new password. The claim is a single UPDATE ... WHERE used_at IS NULL AND expires_at > now()
 * RETURNING, so two concurrent submissions of the same link cannot both win. All sessions are then destroyed:
 * whoever had access with the old password (or a stolen cookie) is signed out.
 */
export async function consumeResetToken(db: Db, token: string, newPassword: string, problem: (email: string) => string | null = () => null): Promise<{ userId: string; email: string } | "weak" | null> {
  const passwordHash = await hashPassword(newPassword);
  let out: { userId: string; email: string } | null;
  try { out = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(passwordResets).set({ usedAt: sql`now()` })
      .where(and(eq(passwordResets.tokenHash, sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, sql`now()`)))
      .returning({ userId: passwordResets.userId });
    if (!claimed) return null;
    const [owner] = await tx.select({ email: users.email }).from(users).where(eq(users.id, claimed.userId));
    if (!owner) return null;
    if (problem(owner.email)) { tx.rollback(); }   // weak password: undo the claim so the link still works
    const [u] = await tx.update(users).set({ passwordHash }).where(eq(users.id, claimed.userId)).returning({ id: users.id, email: users.email });
    return u ? { userId: u.id, email: u.email } : null;
  }); } catch (e) { if (e instanceof TransactionRollbackError) return "weak"; throw e; }
  if (out) await destroyAllSessions(db, out.userId);
  return out;
}
