import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { identities, sessions, users } from "../db/schema.js";
import type { OAuthProfile } from "./oauth.js";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function findByEmail(db: Db, email: string) {
  const [u] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
  return u ?? null;
}

export type OAuthOutcome = { userId: string; created: boolean } | { error: "no_verified_email" | "email_belongs_to_other_login" };

/**
 * Resolves "someone signed in with provider X" to a local user, safely.
 *
 * 1. Known identity -> that user.
 * 2. Else, the provider must give a VERIFIED email. Without it we cannot tell who this is.
 * 3. Existing user with that email -> link the identity. If that account was created by password sign-up and its
 *    email was never verified, we cannot know the password-setter owned the address (pre-hijacking), so the password
 *    is removed and all its sessions are revoked. The real owner just proved ownership through the provider.
 * 4. Otherwise create a new, verified, password-less user.
 */
export async function resolveOAuth(db: Db, profile: OAuthProfile): Promise<OAuthOutcome> {
  return db.transaction(async (tx) => {
    const [known] = await tx.select({ userId: identities.userId }).from(identities)
      .where(and(eq(identities.provider, profile.provider), eq(identities.providerUserId, profile.providerUserId)));
    if (known) return { userId: known.userId, created: false };

    if (!profile.email || !profile.emailVerified) return { error: "no_verified_email" } as const;
    const email = normalizeEmail(profile.email);

    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    if (existing) {
      if (!existing.emailVerified) {
        await tx.update(users).set({ passwordHash: null, emailVerified: true }).where(eq(users.id, existing.id));
        await tx.delete(sessions).where(eq(sessions.userId, existing.id));
      }
      await tx.insert(identities).values({ provider: profile.provider, providerUserId: profile.providerUserId, userId: existing.id });
      return { userId: existing.id, created: false };
    }
    const [u] = await tx.insert(users).values({ email, displayName: profile.name?.slice(0, 80) ?? null, emailVerified: true }).returning({ id: users.id });
    if (!u) throw new Error("user insert failed");
    await tx.insert(identities).values({ provider: profile.provider, providerUserId: profile.providerUserId, userId: u.id });
    return { userId: u.id, created: true };
  });
}
