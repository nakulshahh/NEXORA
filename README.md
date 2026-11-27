# NEXORA

**Backend engineering, beyond frameworks.** An original, interactive academy that teaches what sits underneath backend frameworks: networking, HTTP, the event loop, storage, authentication, scaling. Lessons are written from first principles, and the concepts are explorable in deterministic simulations ("labs").

> Status: Milestone 7 of 8 (7a, 7b, 7c done). See [`docs/STATUS.md`](docs/STATUS.md) for what is built, what is not, and what is next. Nothing in the app pretends to be finished when it is not: notes are clearly marked as not built yet. The AI Professor is extractive (no generative model) and says so.

## What works today
- **74 lessons** across all 44 chapters (Parts 0, A–F), each with a fixed template and at least 3 exercises built around real misconceptions. Content is MDX, validated in CI.
- **8 simulation labs** with play/pause/step/back/scrub/speed, shareable URLs and screen-reader narration: HTTP lifecycle, DNS, Node.js event loop (checked against real Node), router matching, byte-level encodings, session vs JWT, scan vs B-tree, cache eviction.
- **Break-it Lab** (`/labs/break-it`): seven guided incidents (reproduce, observe, diagnose, fix, compare) plus an open experiment mode on a deterministic load model.
- **Concurrency Arena** (`/labs/concurrency`): choose the order threads run in. Lost update, check-then-act, deadlock and producer/consumer, each with an unsafe and a safe version, a shared-memory view, a timeline, and an exhaustive check of every interleaving.
- **Accounts**: email + password, GitHub and Google sign-in, server-side sessions, device list and "sign out everywhere".
- **Progress sync**: works offline in the browser; syncs to your account, and anonymous progress is merged in on first sign-in.
- **AI Professor** (sign-in required): hybrid retrieval (Postgres full-text + pgvector) over the lessons; answers are sentences quoted from them, always cited, and it refuses when the lessons don't cover the question. No paid API, no key, no generative model. Measured quality and limits: [`docs/AI.md`](docs/AI.md).
- **Revision** (`/revise`): every lesson exercise becomes a spaced-repetition card (SM-2), synced across devices, with a view of the lessons where you struggle.
- **Architecture builder** (`/playground/architecture`): drag-and-connect components, send requests, break things; a seeded model with per-hop latency, cache/queue/load-balancer behaviour and failure injection. Simplifications are listed on the page.
- **Event-loop playground** (`/playground/event-loop`): write a small program in a whitelisted subset, predict its output, compare with the Node model and a sandboxed browser run.
- Roadmap of all 44 chapters, dashboard, full-text search.

## Repository layout
```
apps/web        Next.js 16 · React 19 · TypeScript · Tailwind v4        (the product)
apps/api        Express 5 · TypeScript · Drizzle ORM · Postgres         (auth, progress, AI gateway)
apps/ai         Python · FastAPI · pgvector · optional sentence-transformers  (AI Professor)
packages/content  MDX lessons (the curriculum is code, validated in CI)
docs/           BLUEPRINT · STATUS · LEARNING (tutorial) · DEPLOY · adr/ (decisions)
```

## Run it locally
Requirements: Node 22+, pnpm 10, Docker (for Postgres).

```bash
pnpm install
pnpm db:up                                   # Postgres 16 + pgvector in Docker
cp apps/api/.env.example apps/api/.env       # then set COOKIE_SECRET (instructions inside the file)
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate                              # apply SQL migrations
pnpm dev:api                                 # API on :4000
pnpm dev                                     # web on :3000   (second terminal)
```
Or run everything in containers: `docker compose up --build`, then `scripts/smoke.sh http://localhost:3000`.

Open http://localhost:3000. The web app works without the API (progress stays in your browser); sign-in needs the API.

GitHub/Google sign-in is optional: add the client id/secret to `apps/api/.env` (callback URLs are in the file and in [`docs/DEPLOY.md`](docs/DEPLOY.md)).

## Test
```bash
pnpm --filter @nexora/web content:check      # lesson frontmatter, sections, links, prerequisite cycles
pnpm typecheck && pnpm test                  # web + api
(cd apps/ai && TEST_DATABASE_URL=postgres://... python -m pytest)   # AI service, see docs/AI.md
pnpm check:secrets                           # credential tripwire (also runs in CI)
scripts/smoke.sh http://localhost:3000       # end-to-end through the web origin (account, progress, AI answer + refusal)
node scripts/loadtest.mjs --help             # load test; results and targets in docs/LOAD-TEST.md
```
API tests run against a **real Postgres** (`DATABASE_URL` must point at a throwaway database), because the behaviour worth testing lives in SQL constraints and upserts: sessions, CSRF, OAuth linking, cross-user access (returns 404), merge idempotence.

## Architecture in one paragraph
The browser talks only to the Next.js origin; `/api/*` is rewritten to the Express service, so the session cookie is first-party and the API host can change without touching the browser. Sessions are opaque random tokens whose SHA-256 is stored in Postgres (instant revocation). Passwords use Argon2id. Progress is a document that merges **monotonically and idempotently** (done/correct are OR, scroll/attempts are max), so it is safe to resend and safe across devices. Details and rejected alternatives: [`docs/adr/`](docs/adr), and the long-form tutorial in [`docs/LEARNING.md`](docs/LEARNING.md).

## Deploy
Vercel (web) + Render (API) + Neon (Postgres/pgvector), all configured by environment variables so providers can be swapped. Step by step: [`docs/DEPLOY.md`](docs/DEPLOY.md). Running it afterwards (logs, rollback, backups, secret rotation): [`docs/OPERATIONS.md`](docs/OPERATIONS.md). Load-test numbers and limits: [`docs/LOAD-TEST.md`](docs/LOAD-TEST.md).

## Security and secrets
No secrets are committed. `.env*` is git-ignored (only `*.example` files are tracked); CI scans for credentials. What was reviewed, what was found and fixed, and what remains open: [`docs/SECURITY-REVIEW.md`](docs/SECURITY-REVIEW.md). Report vulnerabilities per [`SECURITY.md`](SECURITY.md).

## Content and attribution
All lessons, diagrams, code and simulations are original. Where a lesson links to a video by another creator (for example Sriniously), it is a link with attribution only; no transcripts or reproductions.

## License
[MIT](LICENSE). The lesson text and simulations are covered by the same license; videos by other creators that lessons link to are theirs.
