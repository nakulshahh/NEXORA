import { GitHub, Google, decodeIdToken } from "arctic";
import type { Config } from "../config.js";

/** What every provider must give us, whatever the protocol underneath. */
export interface OAuthProfile {
  provider: string;
  providerUserId: string;
  email: string | null;
  /** True only if the provider itself vouches that the user controls this email. */
  emailVerified: boolean;
  name: string | null;
}

/**
 * Narrow port: the rest of the app depends on this interface, not on `arctic` or any vendor.
 * Tests supply a fake; adding Discord or GitLab means one more object like the two below.
 */
export interface OAuthProvider {
  id: string;
  usesPkce: boolean;
  authorizationUrl(state: string, verifier: string): URL;
  exchange(code: string, verifier: string): Promise<OAuthProfile>;
}

export const redirectUri = (cfg: Config, provider: string) => `${cfg.primaryOrigin}/api/auth/oauth/${provider}/callback`;

async function getJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "nexora-api" } });
  if (!res.ok) throw new Error(`provider request failed: ${res.status}`);
  return res.json();
}

export function githubProvider(cfg: Config): OAuthProvider | null {
  if (!cfg.github) return null;
  const client = new GitHub(cfg.github.id, cfg.github.secret, redirectUri(cfg, "github"));
  return {
    id: "github",
    usesPkce: false,
    authorizationUrl: (state) => client.createAuthorizationURL(state, ["read:user", "user:email"]),
    async exchange(code) {
      const tokens = await client.validateAuthorizationCode(code);
      const token = tokens.accessToken();
      const user = (await getJson("https://api.github.com/user", token)) as { id?: number; name?: string | null; login?: string };
      const emails = (await getJson("https://api.github.com/user/emails", token)) as { email: string; primary: boolean; verified: boolean }[];
      // Only a primary AND verified address counts. GitHub's public profile email is unverified and must not be trusted.
      const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : undefined;
      if (typeof user.id !== "number") throw new Error("unexpected GitHub response");
      return { provider: "github", providerUserId: String(user.id), email: primary?.email ?? null, emailVerified: Boolean(primary), name: user.name ?? user.login ?? null };
    },
  };
}

export function googleProvider(cfg: Config): OAuthProvider | null {
  if (!cfg.google) return null;
  const client = new Google(cfg.google.id, cfg.google.secret, redirectUri(cfg, "google"));
  return {
    id: "google",
    usesPkce: true,
    authorizationUrl: (state, verifier) => client.createAuthorizationURL(state, verifier, ["openid", "email", "profile"]),
    async exchange(code, verifier) {
      const tokens = await client.validateAuthorizationCode(code, verifier);
      // The ID token came straight from Google over TLS in exchange for our secret, so decoding without re-verifying the signature is acceptable here.
      const c = decodeIdToken(tokens.idToken()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
      if (!c.sub) throw new Error("unexpected Google response");
      return { provider: "google", providerUserId: c.sub, email: c.email ?? null, emailVerified: c.email_verified === true, name: c.name ?? null };
    },
  };
}

export type Providers = Record<string, OAuthProvider>;
export function buildProviders(cfg: Config): Providers {
  const out: Providers = {};
  for (const p of [githubProvider(cfg), googleProvider(cfg)]) if (p) out[p.id] = p;
  return out;
}
