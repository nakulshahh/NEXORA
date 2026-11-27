# Phase 1 completion report

**Date:** 2026-11-25. Everything below was run in the build sandbox (Postgres 16, Node 22, Chrome via Playwright). "Verified" means a command was run and passed; anything else is listed as not verified.

## Delivered
| Area | Result |
|---|---|
| Curriculum | 44/44 chapters, 74 lessons. `content:check`: frontmatter schema, required sections, >=3 exercises of >=2 kinds, prerequisite graph acyclic. |
| Labs | 8 simulation labs (HTTP, DNS, event loop, router, bytes, session vs JWT, scan vs B-tree, cache) + architecture builder + event-loop playground. Each lab lists what it simplifies. |
| Shared rate limiter | Postgres-backed store, one atomic upsert. Tested with two app instances; 40 concurrent requests across both let exactly 20 through. |
| Password reset | Hashed single-use 30-minute tokens in the URL fragment, no account enumeration, concurrent double-submit has one winner, all sessions revoked, weak password does not burn the link. Web pages `/auth/forgot-password`, `/reset-password`. |
| Architecture builder | Capacity per node, FIFO queues, client timeouts, retries with backoff, zombie work, worker backlog, utilisation and bottleneck report. Model shows the real overload cliff (the API holds a slot while it waits on downstream calls, so the simple preset's ceiling is about 276 req/s; far above it, success collapses because abandoned requests keep consuming servers). |
| Tutor refusal | IDF-weighted evidence gate. Held-out: refused 0.80 (was 0.60), answered 0.90, recall@3 0.93, MRR 0.84. |

## Verification run
- Web: typecheck, 180 tests, production build.
- API: typecheck, 110 tests (route inventory test includes the new routes; OpenAPI updated).
- AI: 62 tests; ingest 74 documents / 1121 chunks; eval as above.
- Playwright: smoke on all 8 labs (steps, URL restore, keyboard, transcript, 390 px mobile, dark mode, reduced motion) and the load-test panel at 1280 px and 390 px (no horizontal overflow, no page errors).
- Determinism: every sim and the load model are tested for same-seed-same-output; the sim folder is checked to contain no `Date`, `Math.random`, DOM or React.

## Known limits (not hidden)
- Tutor still answers two out-of-scope questions whose every word exists in the corpus ("What is a Kubernetes operator?", "best programming language"). A lexical gate cannot see this; a semantic model could.
- "What is an IDOR bug?" is a retrieval miss.
- Lab models use chosen constants (page size, fanout, latencies); they are not calibrated to Postgres/Redis.
- The load model uses fixed service times (no contention), unbounded queues, no load shedding.

## Manual actions for you
1. **Push:** `bash scripts/make-commits.sh` then `git push` (nothing is committed from the sandbox).
2. **Mail for password reset:** implement the `Mailer` port (`apps/api/src/auth/mailer.ts`) with an SMTP/API provider and pass it to `createApp`; until then production only logs "no mail provider configured". Never log the link in production.
3. **Run the migration** `0002_rate_limits_and_password_resets` (`pnpm db:deploy`) on Neon before deploying.
4. **Deploy** web (Vercel), API and AI (Render), DB (Neon); set `AI_SERVICE_URL` and a matching `AI_INTERNAL_TOKEN`; run `nexora-ai ingest` against the production DB.
5. **OAuth:** create GitHub/Google apps with the production callback URLs and verify sign-in live.
6. **Live checks not possible here:** real CI run, Docker image builds, Kubernetes manifests, a load test of the deployed API, Firefox/Safari pass.
7. **Optional tutor upgrade:** measure a sentence-embedding model (MiniLM) with `nexora-ai eval` on your machine; adopt it only if held-out refusal and recall improve.
