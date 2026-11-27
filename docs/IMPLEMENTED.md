# NEXORA: what is implemented

Snapshot after Milestone 8 (2026-11-22). Everything below runs and is covered by tests unless marked **unverified**.

## Product
| Area | What exists |
|---|---|
| Curriculum | 44-chapter roadmap across 7 parts; **16 lessons** in 7 chapters (0.1, 0.2, 0.3, A1, A2, A3, A4), each with a fixed template and ≥3 exercises on real misconceptions. Validated by `content:check` (frontmatter, sections, links, prerequisite cycles). |
| Labs | 3 deterministic simulations (HTTP lifecycle, DNS resolution, Node event loop) with play/pause/step/back/scrub/speed, shareable URLs, screen-reader narration. Event loop checked against real Node. |
| Accounts | Email/password (Argon2id), GitHub and Google sign-in, hashed-token server sessions, device list, sign out everywhere, delete account. CSRF guard, rate limits. |
| Progress sync | Local-first; merges monotonically and idempotently into the account; anonymous progress imported on first sign-in. |
| AI Professor | Hybrid retrieval (Postgres full-text + pgvector, RRF), extractive cited answers, refuses when the lessons don't cover a question. No paid API, no key, no generative model. Pluggable embedder (`hashing-v1` default, `sbert` optional) and pluggable answerer. |
| Revision | Every answered exercise becomes an SM-2 card; `/revise` review sessions; per-lesson "where you struggle" view; schedules sync (newest review wins). |
| Architecture builder | `/playground/architecture`: React Flow canvas over a pure seeded simulator; 8 component types; per-hop latency, cache-aside, queue, load balancer, failure injection; 500-request p50/p95/p99. Layout saved in the browser. |
| Event-loop playground | `/playground/event-loop`: whitelisted-subset parser (acorn) compiles code into the event-loop model; table of your prediction vs model vs a run in a sandboxed iframe (opaque origin, CSP `default-src 'none'`). Model checked against real Node on 10 programs. Chrome-verified only. |
| Other | Dashboard, full-text search, light/dark theme, reduced-motion support. |

## Services
- `apps/web`: Next.js 16, React 19, TypeScript, Tailwind v4. `/api/*` is proxied to the API so cookies are first-party.
- `apps/api`: Express 5, Drizzle ORM, Postgres. Auth, progress, review sync, and the `/api/ai/ask` gateway (sign-in required, per-account rate limit, timeout, honest 503/504).
- `apps/ai`: Python FastAPI AI service (`nexora-ai ingest | serve | eval`), shared-secret protected.
- Migrations: `0000_init`, `0001_card_reviews` (plain SQL).

## Measured quality
- Tests: web 129, API 99, AI 60, all passing. Browser flows run for sign-up/sync, Ask tab and revision.
- AI retrieval, held-out split (24 in-scope, 7 out-of-scope, hashing embedder): hybrid recall@3 0.96, 92% of in-scope questions answered, **71% of out-of-scope refused** (leaks: "B-tree index", "database sharding"). Thresholds tuned on the dev half scored 100/100 there; the held-out gap is the overfit. Full table: `docs/AI.md`.
- AI service with the hashing embedder: ~55 MB RSS, p50 4 ms per query.

## Not done, or unverified (the architecture simulator has no capacity/queueing, retries or timeouts)
- Real GitHub/Google OAuth round trip (only a scripted provider was tested) **unverified**.
- MiniLM (`sbert`) quality, memory and latency **unmeasured** (model host blocked in the build sandbox). Measure with `EMBEDDER=sbert python apps/ai/scripts/bench.py` before deploying it.
- M8 hardening: done in the sandbox. **Unverified:** Docker image builds (no daemon here; CI will build them), real deployment, Firefox/Safari for the sandbox, restore against Neon, load numbers on Render hardware (the measured figures are from a 2-vCPU shared box).
- Notes tab, AI-generated exercises, streaming answers, external sources ingestion (loader exists; none shipped).
- Not yet deployed to Vercel/Render/Neon (`render.yaml` and `docs/DEPLOY.md` are ready).

## Docs
`README.md`, `docs/STATUS.md` (plan vs. state), `docs/AI.md`, `docs/DEPLOY.md`, `docs/OPERATIONS.md`, `docs/SECURITY-REVIEW.md`, `docs/LOAD-TEST.md`, `docs/LEARNING.md` (Phases 0–11 tutorial), `docs/adr/0001–0004`, `SECURITY.md`.
