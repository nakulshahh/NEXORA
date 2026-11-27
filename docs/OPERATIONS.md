# NEXORA: Operations runbook

Audience: you, at 11 pm, when something is wrong. For first-time setup see [DEPLOY.md](DEPLOY.md); for numbers see [LOAD-TEST.md](LOAD-TEST.md); for the threat model see [SECURITY-REVIEW.md](SECURITY-REVIEW.md).

## 1. The system in one picture

```
browser ──► web (Next.js, Vercel)  ──/api/* proxy──►  api (Express, Render)  ──X-Internal-Token──►  ai (FastAPI, Render)
                                                          │                                              │
                                                          └──────────────► Postgres + pgvector (Neon) ◄──┘
                                                               schema public (accounts, progress)   schema rag (lessons index)
```

The browser only ever talks to the web origin, so the session cookie is first-party. The AI service is reachable only with the shared token. If the AI service is down, everything except the Ask tab keeps working.

## 2. Run it locally

| Goal | Command |
|---|---|
| Whole stack in containers | `docker compose up --build` then `scripts/smoke.sh http://localhost:3000` (web on :3000, API on :4000, Postgres on :5432) |
| Hot-reload development | `pnpm db:up`, `pnpm db:migrate`, `pnpm dev:api`, `pnpm dev`; AI: `cd apps/ai && pip install -e '.[dev]' && nexora-ai ingest && nexora-ai serve` |
| Stop and wipe local data | `docker compose down -v` |

## 3. Health and readiness

| Service | Liveness (never touches the DB) | Readiness (what must be true to take traffic) |
|---|---|---|
| API | `GET /healthz` | `GET /readyz` runs `select 1` |
| AI | `GET /healthz` | `GET /readyz`: the index is not empty and was built with the same embedder the service runs (otherwise 503 with the reason) |
| Web | `GET /` | same |

Render's health check points at `/readyz`. Liveness and readiness are separate on purpose: a database blip should take a service out of rotation, not restart it.

## 4. Logs and tracing one request

Every service writes one JSON object per line to stdout. The API logs `reqId`; the AI service logs `reqId`; the id is minted (or accepted if well-formed) by the API, returned in the `X-Request-Id` response header, and forwarded to the AI service. To follow a failing request:

1. In the browser dev tools, read the `X-Request-Id` header of the failing `/api/...` response (or ask the user for it).
2. Search that id in each service's logs (Render dashboard → Logs → search):
   - API: method, path (no query string), status, response time, `userId` (an account id, never an email).
   - AI: `ask` line (question *length*, status, citation count, retrieval coverage) and the `request` line.
3. Question text is deliberately never logged.

Log levels: `LOG_LEVEL` (API: `info`, `warn`, ...; AI: `INFO`, `WARNING`, ...). Probes (`/healthz`, `/readyz`) are not logged.

## 5. Configuration reference

| Variable | Service | Notes |
|---|---|---|
| `DATABASE_URL` | api, ai | Neon connection string; `DATABASE_SSL=require` on the API |
| `COOKIE_SECRET` | api | ≥ 32 random characters; rotating it signs everyone out of in-flight OAuth flows only (sessions are opaque DB tokens, not signed cookies) |
| `WEB_ORIGIN` | api | `https://` origin(s) of the web app; also the CSRF allow-list |
| `TRUST_PROXY` | api | `1` behind Render's proxy, otherwise per-IP limits see the proxy's address |
| `AI_SERVICE_URL`, `AI_INTERNAL_TOKEN` | api | token ≥ 16 chars, identical on both sides |
| `AI_INTERNAL_TOKEN`, `APP_ENV=production`, `EMBEDDER` | ai | production refuses to start without a token |
| `API_ORIGIN` | web | **Build-time**: baked into the `/api/*` rewrite. Changing it means rebuilding the web app |
| `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` | api | a provider is enabled only when both halves are set |

Secrets live in the host dashboards. They are never in the repo (`scripts/check-secrets.mjs` runs in CI).

## 6. Deploying

- **Normal path:** merge to `main` → GitHub Actions `ci` runs → Render deploys the API and AI service only after the checks pass (`autoDeployTrigger: checksPass`), Vercel deploys the web app from the same push. Render's `preDeployCommand` runs the API's SQL migrations and the AI re-ingest *before* the new version takes traffic; if either fails, the old version keeps serving.
- **Order matters for breaking changes:** database first (additive migration), then API, then web. See "Migrations" below.
- **Lessons:** editing a lesson redeploys the AI service (build filter on `packages/content/lessons`), whose pre-deploy step re-indexes only the changed lessons.

## 7. Rollback

| Layer | How | Notes |
|---|---|---|
| Web (Vercel) | Dashboard → Deployments → previous deployment → *Promote to Production* | Instant; no rebuild |
| API / AI (Render) | Dashboard → service → *Events/Deploys* → previous deploy → *Rollback* | Re-runs that build; the previous image/commit is used as is |
| Code, any layer | `git revert <sha>` and push; CI gates it like any change | Prefer over force-pushing |
| Database | **Migrations are forward-only.** See below | The one thing that is not instantly reversible |

**Migration discipline (expand → migrate → contract).** Ship schema changes in two releases: first an *additive* migration (new nullable column / new table) with code that works with and without it; later, once nothing reads the old shape, a *cleanup* migration. That way rolling the application back never meets a schema it cannot use. Never `DROP`/`RENAME` in the same release that stops using the thing.

If a migration is itself wrong: write a new forward migration that fixes it. If data was damaged, restore (next section).

## 8. Backups and restore

Neon keeps point-in-time history for a window that depends on your plan (check it in the Neon console; the free plan's window is short). Do not rely on it alone: take your own logical backups.

```bash
DATABASE_URL='postgres://…neon…?sslmode=require' scripts/backup.sh      # → backups/nexora-<UTC timestamp>.dump
```

- Covers accounts, sessions, identities and all progress/review tables, plus the migrations table. **Excludes** the `rag` schema, which `nexora-ai ingest` rebuilds from the lessons in seconds.
- The file contains emails and password hashes: encrypt it at rest, keep it out of git (`backups/` and `*.dump` are git-ignored), and delete old ones.
- Schedule it however you like (a weekly local run, or a scheduled GitHub Action with the database URL as an encrypted secret). A backup nobody restores is a hope, not a backup.

**Restore drill (do this once before you need it):**

```bash
createdb nexora_drill                                      # or a Neon branch / scratch database
TARGET_DATABASE_URL=postgres://…/nexora_drill CONFIRM=yes scripts/restore.sh backups/nexora-….dump
# then: run the API against it, run scripts/smoke.sh, compare row counts
```

`restore.sh` refuses to run without `CONFIRM=yes`, runs in a single transaction and replaces the tables it contains. **Verified in this repository's sandbox:** a dump of a database with 12 accounts, 12 sessions and 1,600 activity events restored into a fresh database with identical counts, `rag` correctly absent, and the API's own migrations then applied cleanly on top. Not verified: restore against Neon itself.

**Disaster recovery order:** restore Postgres → deploy API (migrations run, no-op) → run `nexora-ai ingest` (rebuilds `rag`) → deploy web. Everyone's progress also exists in their browser's local storage and re-syncs on next sign-in (the merge is idempotent), which softens a data-loss event for active users but is not a backup.

## 9. Secret rotation

| Secret | Procedure |
|---|---|
| `AI_INTERNAL_TOKEN` | Set the new value on the **AI service first**, then the API. During the gap the Ask tab returns "unavailable" (503) instead of failing open. |
| `COOKIE_SECRET` | Update on the API and redeploy. Only in-flight OAuth sign-ins are affected. |
| OAuth client secrets | Create a second secret at the provider, deploy it, delete the old one. |
| Database password | Rotate in Neon, update `DATABASE_URL` on both Render services, redeploy. |
| Suspected account compromise | `POST /api/auth/logout-all` for that user (or delete their rows from `sessions`); every session is a DB row, so revocation is immediate. |

## 10. Symptom → first thing to check

| Symptom | Likely cause | Check |
|---|---|---|
| Sign-in works locally, loops or 403s in production | `WEB_ORIGIN` does not exactly match the site's https origin (CSRF allow-list) | API env |
| Everyone's rate-limited at once | `TRUST_PROXY` not set; the limiter sees one proxy IP | API env |
| Ask tab: "unavailable" | token mismatch (AI returns 401 → API reports 503), service asleep, or `AI_SERVICE_URL` unset | AI logs for the request id; `/readyz` on the AI service |
| Ask tab: "took too long" | Render free instance waking (about 30 s) | retry once; consider a paid instance |
| AI `/readyz` 503 "knowledge base is empty" | ingest did not run | `nexora-ai ingest` |
| AI `/readyz` 503 "index built with X, service runs Y" | `EMBEDDER` changed without re-indexing | `nexora-ai ingest --reindex` |
| Web shows API errors after changing the API URL | `API_ORIGIN` is build-time | rebuild the web app |
| API crashes at boot with "Invalid environment" | a required variable is missing or malformed; the message names it | API env |
