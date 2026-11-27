# ADR 0002: Authentication design

**Status:** accepted (Milestone 5).

| Decision | Choice | Why | Rejected |
|---|---|---|---|
| Session mechanism | Opaque random token in an `HttpOnly; Secure; SameSite=Lax` cookie; **SHA-256 of the token** stored in Postgres | Instant revocation, "logout everywhere", device list; a database leak does not leak usable sessions | JWT access tokens: no revocation without extra state; this is one web app with one database, the case where sessions are simpler |
| Password hashing | Argon2id (19 MiB, 2 passes, 1 lane = OWASP minimum), parameters encoded in the hash | Memory-hard; can raise cost later without a migration | scrypt/bcrypt: acceptable, but argon2id is the current recommendation |
| Browser to API | Next.js **rewrites `/api/*`** to the Express service | Cookie is first-party: no CORS, no cross-site cookie rules, works the same on any API host | Direct cross-origin calls: needs CORS + `SameSite=None`, which browsers increasingly restrict |
| CSRF | SameSite=Lax + mandatory allow-listed `Origin` on every state-changing request + JSON-only bodies | Three independent layers, no token plumbing | Synchronizer tokens: more moving parts for no extra protection here |
| OAuth | Authorization-code flow, signed 10-minute state cookie, PKCE where the provider supports it; behind a narrow `OAuthProvider` interface | Adding a provider is one object; tests use a fake provider | Passport: heavy, session-coupled |
| Account linking | Link by **provider-verified** email only; if the existing account is password-created and unverified, **delete its password and revoke its sessions** | Defeats "pre-hijacking" (attacker registers the victim's email first) | Linking on any email match: account takeover |
| Enumeration | Login returns one message and does equal work for unknown email. **Register reveals "email taken"** | Without email verification there is no other honest way to tell a user the email is in use; mitigated by rate limits | Pretending success: confusing, and still leaks via timing |
| Ownership | Resources are addressed by the session, not by a user id in the URL; foreign ids return **404, never 403** | There is no identifier to tamper with; 404 hides existence | 403: confirms the object exists |

## Known gaps (stated, not hidden)
- No email verification or password reset (needs an email provider). OAuth sign-in verifies email through the provider.
- Rate limiting is **in memory, per instance** (fine for one instance; use a shared store when scaled out).
- No 2FA/passkeys.
