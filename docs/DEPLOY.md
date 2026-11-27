# Deploying NEXORA

Target stack: **Vercel** (web) · **Render** (Express API, later the FastAPI AI service) · **Neon** (Postgres + pgvector).
Nothing in the code is tied to these vendors; each connection is one environment variable (see "Portability").

```
Browser ──► Vercel (Next.js)  ──/api/* rewrite──►  Render (Express API) ──► Neon Postgres
                                                        └─(M6)─► Render (FastAPI AI service) ──► Neon (pgvector)
```

## 1. Database (Neon)
1. Create a project and a database. Copy the **direct** connection string (not the pooled one) for migrations; either works for the app.
2. Keep `sslmode=require` in the URL.
3. For M6, enable the extension once: `CREATE EXTENSION IF NOT EXISTS vector;`

## 2. API (Render)
1. New → **Blueprint**, point at this repo; it reads `render.yaml`.
2. Fill the secrets Render asks for (`DATABASE_URL`, `WEB_ORIGIN`, and the OAuth ids/secrets if you use them). `COOKIE_SECRET` is generated for you.
3. Each deploy runs `db:deploy` first, so migrations are applied before traffic switches. Health check: `/readyz`.
4. Free instances sleep when idle; the first request after a sleep takes ~30 s. Use a paid plan for always-on.
5. Deploys are gated: `autoDeployTrigger: checksPass` makes Render wait for the GitHub Actions `ci` checks on that commit. (Needs the repo connected through Render's GitHub app.)

## 2b. AI service (Render)
Created by the same Blueprint as `nexora-ai`. Set `DATABASE_URL` (same Neon database; the service uses its own `rag` schema and needs the `vector` extension, which Neon provides) and `AI_INTERNAL_TOKEN`.
Then give the **API** service `AI_SERVICE_URL` (the AI service's `https://…onrender.com`) and the *same* `AI_INTERNAL_TOKEN` (16+ random characters: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).
Each deploy runs `nexora-ai ingest` first (idempotent: only changed lessons are re-embedded). Check `https://<ai-service>/readyz` reports a non-zero chunk count. `EMBEDDER=hashing` is the default; do not switch to `sbert` before measuring memory (see `docs/AI.md`).

## 3. Web (Vercel)
1. Import the repo, set **Root Directory** to `apps/web`.
2. Environment variable: `API_ORIGIN=https://<your-api>.onrender.com`. It is read at **build** time (it becomes the `/api/*` rewrite), so changing it means redeploying.
3. `WEB_ORIGIN` on the API must equal the exact origin users visit (custom domain once you add one). It must be `https://`.

## 4. OAuth apps
Callback URLs use the **web** origin, because requests go through the Vercel proxy:
- GitHub → Settings → Developer settings → OAuth Apps: `https://<web-origin>/api/auth/oauth/github/callback`
- Google → Cloud Console → Credentials → OAuth client (Web): `https://<web-origin>/api/auth/oauth/google/callback`

A provider is enabled only when both its id and secret are set. The sign-in page shows only enabled providers.

## 5. Checklist before going public
- [ ] `pnpm check:secrets` clean; no `.env` files tracked (`git ls-files | grep -i env`)
- [ ] `COOKIE_SECRET` set (32+ random chars), `NODE_ENV=production`, `TRUST_PROXY=1`
- [ ] `WEB_ORIGIN` is https and exact
- [ ] Sign up, sign out, sign in, and a provider sign-in all work on the deployed site
- [ ] `GET /readyz` returns `{"ok":true}` on the API, and on the AI service with `chunks` > 0
- [ ] `scripts/smoke.sh https://<web-origin>` passes (it creates one throwaway account; remove it afterwards with `DELETE /api/auth/account` while signed in as it, or delete the row)
- [ ] Response headers on the site include `Content-Security-Policy` and `Strict-Transport-Security` (`curl -sI https://<web-origin>/`)
- [ ] A restore drill has been done once (`docs/OPERATIONS.md` §8) and Neon's point-in-time window for your plan is known
- [ ] `node scripts/loadtest.mjs` was run against the deployed URLs and the p95 targets in `docs/LOAD-TEST.md` were compared (revise the targets if they were wrong)
- [ ] Privacy notice mentions that sessions record IP address and user agent

## Portability (changing providers later)
| Concern | Where it is configured | To switch |
|---|---|---|
| Database | `DATABASE_URL` | Any Postgres 14+; run `pnpm --filter @nexora/api db:deploy` against it |
| API host | `API_ORIGIN` (web) | Point at the new URL; the browser never sees the API origin |
| Web host | `WEB_ORIGIN` (API) | Update the allow-listed origin and OAuth callback URLs |
| OAuth provider | `OAuthProvider` interface, `src/auth/oauth.ts` | Add one object |
| Container | `apps/{api,web,ai}/Dockerfile`, `docker-compose.yml` | Any container host: build with the repo root as context (`docker build -f apps/api/Dockerfile .`). The web image takes `--build-arg API_ORIGIN=…`. Or skip containers: the API is a plain Node process (`node dist/server.js`) |

## Known limits of this setup
- The API's rate limiter is in memory and per instance. Fine for one instance; move it to Postgres/Redis before running several.
- Sessions live in Postgres (not Redis) on purpose; see ADR 0002.
- The AI service is one process on one core; see `docs/LOAD-TEST.md` for where it saturates and `docs/OPERATIONS.md` for scaling notes.
- The container images are built by CI (`docker` job) but were not built in the sandbox where this repository was written; their individual steps were reproduced by hand. Treat the first CI run as their first real build.
- Nothing has been deployed yet. The first deploy will validate the OAuth round trips, Render's `checksPass` gate and Neon's pgvector, none of which can be tested offline.
