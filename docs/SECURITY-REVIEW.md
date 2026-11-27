# NEXORA: Security review (Milestone 8)

Scope: the Next.js web app, the Express API, the FastAPI AI service, their containers and CI. Method: read every route and trust boundary, map the OWASP Top 10 (2021) and the LLM-specific risks onto them, turn each claim into an automated test where one is possible, then fix what the review found. "Evidence" below names the test or file that would fail if the claim stopped being true.

This is a self-review by the author. It is not a penetration test and not an audit by an independent party.

## 1. Findings from this review

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **CSRF guard threw a 500 on a malformed `Referer`.** `new URL(referer)` was unguarded, so a hostile header became a server error (and an error log line) instead of a 403. Still fail-closed, but it is attacker-controlled input reaching an exception. | Low | Fixed; `tests/security.test.ts` "no, foreign or unparsable Origin/Referer" |
| 2 | **The AI service's SQL migrations were not part of a non-editable install.** `pip install .` (what Render and Docker run) shipped no `sql/` directory, so `nexora-ai ingest` would have migrated nothing and failed on first deploy. Found by installing into a clean virtualenv. Not a vulnerability, a deploy blocker. | High (availability) | Fixed: SQL moved inside the package, `migrate()` now raises if it finds none; `test_migrations_ship_inside_the_package` |
| 3 | **Playground sandbox inherited the page's CSP.** A `srcdoc` iframe inherits the embedding page's policy, so adding a strict page CSP would have forced `'unsafe-eval'` onto the whole app just for the sandbox. | Medium (design) | Fixed: the sandbox is its own document (`/sandbox/frame.html`) with its own header-delivered policy; the page CSP never allows eval. Verified in Chrome on the production build. See ADR 0004 |
| 4 | **Access logs recorded full request headers and query strings.** Cookies were redacted, but `?code=...&state=...` on the OAuth callback and other headers were not. | Low | Fixed: log serializers keep only method, path (no query), status, request id, account id |
| 5 | **Dev-only advisory in `drizzle-kit`'s transitive `esbuild`** (GHSA-67mh-4wv8-2f99, dev-server request leakage). Not in the runtime image. | Low | Fixed with a pnpm override to the patched line; `pnpm audit` is clean |

Nothing found allowed reading or changing another account's data, bypassing authentication, or injecting script. That is the result of the tests below, not a guarantee.

## 2. OWASP Top 10 (2021)

| Risk | What we do | Evidence |
|---|---|---|
| **A01 Broken access control** | Every API route is either public or behind `requireAuth`; the progress API has no identifier in its URL, the account comes only from the session. Other users' resources return 404, never 403 (no "exists but not yours" oracle). | `tests/security.test.ts`: a route table plus a guard that fails if a route exists in the source but not in the table; every protected route returns 401 with no, forged, oversized and empty cookies; cross-account session revoke → 404; progress isolation; smuggled `userId` ignored |
| **A02 Cryptographic failures** | Passwords: Argon2id (19 MiB, 2 passes, 1 lane, the OWASP minimum profile). Session tokens: 256-bit random, only the SHA-256 is stored, so a database leak does not yield usable sessions. Cookies `HttpOnly`, `SameSite=Lax`, `Secure` in production; HSTS; TLS terminated by Vercel/Render; database `sslmode=require`. | `security.test.ts`, "session cookies are HttpOnly + SameSite=Lax and never in the response body" |
| **A03 Injection** | SQL: parameterised everywhere (Drizzle, psycopg). The one dynamic query string is the full-text `tsquery`, built only from alphanumeric stems. XSS: React escapes by default; the single `dangerouslySetInnerHTML` is a constant theme script; page CSP blocks foreign scripts and connections. Lessons are MDX we author and compile at build time, not user content. | `test_adversarial.py` (SQL fragments, markup, template syntax, NUL and bidi characters, 13 injection and 13 hostile-shape inputs); CSP header tests |
| **A04 Insecure design** | Defence in depth around the one risky feature (running user code): whitelist parser, then opaque-origin iframe, then a deny-all CSP, then a timeout. Request bodies, question length, program size and review counts are all bounded. | `playground.test.ts`; `progress/model.ts` limits |
| **A05 Security misconfiguration** | Production config refuses to start without a long cookie secret, https origins, and an internal token when the AI service is configured. `x-powered-by` removed, helmet on the API, strict headers on the web app, FastAPI `/docs` disabled in production, containers run as non-root. | `config` tests; header tests; Dockerfiles |
| **A06 Vulnerable and outdated components** | `pnpm audit --prod` and `pip-audit` run in CI on every push and weekly; Dependabot for npm, pip, Docker and Actions; lockfile is installed with `--frozen-lockfile`. | `.github/workflows/ci.yml`, `.github/dependabot.yml`. Today: no known vulnerabilities (both ecosystems) |
| **A07 Identification and authentication failures** | 20 attempts per 15 minutes per IP on the auth endpoints; login does not reveal whether an email exists; sessions are revocable individually or all at once; an OAuth sign-in with a verified email that matches an *unverified* password account wipes that password hash (blocks pre-registration account takeover). | `security.test.ts` "does not reveal whether an email exists"; `oauth.test.ts` |
| **A08 Software and data integrity failures** | No unsigned code is fetched at runtime. The progress document is schema-validated with strict ranges before it is merged. CI is the gate for deploys (`autoDeployTrigger: checksPass`). | `ProgressDoc`; `render.yaml` |
| **A09 Logging and monitoring failures** | One JSON line per request with a request id shared across all three services; account id, never email; no cookies, no query strings, and the AI service never logs question text (length and outcome only). | `test_logs_are_json_with_request_id_and_never_contain_the_question`; `ai.test.ts` request ids |
| **A10 Server-side request forgery** | The API makes outbound requests only to the configured AI service URL and to the OAuth providers' fixed endpoints. No user-supplied URL is ever fetched. Citation URLs come from the lesson corpus and are asserted not to be `javascript:`/`data:`/`file:`. | `test_citations_only_point_into_the_curriculum` |

## 3. LLM-specific risks (OWASP LLM Top 10, as they apply here)

The AI Professor has **no generative model**: it retrieves lesson passages and returns copied sentences with citations (ADR 0003). That removes most of this class by construction, and the tests pin it down rather than assume it.

- **Prompt injection.** There is nothing to obey. 13 injection prompts ("ignore previous instructions", fake system tags, "print the token", markdown image exfiltration, `javascript:` links, SQL, template syntax) are sent; none of their payloads appear in any answer, and each response is either an answer or a refusal.
- **Insecure output handling.** Every answer line must be a normalised substring of the cited lesson text (`test_every_answer_line_is_a_sentence_from_its_citation`), and the web UI renders it as text.
- **Sensitive information disclosure.** The service token and database URL are never in a response, and the service has no tool or file access to leak from.
- **Excessive agency / insecure plugin design.** None: the service has one read-only query path.
- **Model denial of service.** Questions are capped at 500 characters, the gateway allows 20 per minute per account, and has an 8 s timeout (hung service → 504, dead service → 503, both measured; see `docs/LOAD-TEST.md`).
- **Training-data poisoning / supply chain.** No training. The optional MiniLM embedder is downloaded from Hugging Face only if the operator enables `EMBEDDER=sbert`; it is not enabled by default and has not been run in this project's sandbox.

## 4. Residual risks and honest limits

1. **Page CSP allows `'unsafe-inline'` scripts.** Next's App Router and our theme script emit inline scripts; a nonce policy would force every page to render dynamically and lose static caching. What remains blocked: eval, foreign script hosts, foreign connections, framing, `<base>`, plugins. Revisit if the site ever renders user-authored HTML.
2. **Rate limiting is in-process.** Two API instances give an attacker twice the budget, and a restart resets counters. Fine for one Render instance; use a shared store (Postgres or Redis) before scaling out.
3. **No MFA, no email verification for password sign-ups, no password-reset flow** (it needs an email provider; deliberately out of scope). OAuth sign-in is the stronger path.
4. **Container images are built in CI but pinned by tag, not digest**, and were **not built in the authoring sandbox** (no Docker daemon). Each Dockerfile step was reproduced by hand (install from manifests only, `pnpm deploy`, `pip install` into a clean virtualenv, Next standalone output), but the images themselves are first built by CI.
5. **No external monitoring or alerting.** Logs and health endpoints exist; nothing pages anyone. See `docs/OPERATIONS.md`.
6. **Sessions store IP and user agent** (for the "your sessions" screen). Disclose this in a privacy notice before real users.
7. **The playground sandbox is verified in Chrome only.** Firefox and Safari behaviour of opaque-origin iframes with `eval` is unverified.
8. **Real OAuth round trips with GitHub and Google are unverified** until deployed with real client credentials.
9. **No independent review.** Treat this document as a checklist for one, not a substitute.

## 5. How to re-run the checks

```bash
pnpm --filter @nexora/api test                      # includes tests/security.test.ts
cd apps/ai && python -m pytest tests/test_adversarial.py
pnpm audit --prod --audit-level high && (cd apps/ai && pip-audit --skip-editable)
docker compose up --build --wait && scripts/smoke.sh http://localhost:3000
```
