# NEXORA: Load test, targets and limits (Milestone 8)

## What was measured, and what it means

`scripts/loadtest.mjs` (dependency-free, closed-loop) drives the production builds of the API, the AI service and the web server for 5 seconds per level at 1, 8, 32 and 64 concurrent workers. Raw numbers: [`docs/load/2026-11-22-reference-box.json`](load/2026-11-22-reference-box.json).

**Reference box, and why the numbers are not Render numbers:** a 2-vCPU, 8 GB sandbox VM where the load generator, Postgres 16, the API, the AI service and the Next.js server all ran **at the same time**. Every request therefore competed with the generator and the database for two cores, which understates what the services could do alone, while the lack of any network hop overstates what a deployed system will see. Render's free tier is a fraction of one shared CPU, so expect latencies several times higher there. **Use this document for relative shape (where each path saturates, which path is the bottleneck), and re-run the script against the deployed URLs for the real numbers.**

Closed-loop caveat: workers wait for each response before sending the next request, so when the server stalls the generator slows down too and tail latency under overload is under-reported ("coordinated omission"). Treat p95 at moderate concurrency as the latency figure and the point where throughput stops rising as the capacity figure.

Rate limiting was disabled for the throughput runs (otherwise the 20/min/account limit would be what we measured) and tested separately below. All 28 rows had **0 errors**.

## Results (requests/second, latency in ms)

| Path | c=1 | c=8 | c=32 | c=64 | Saturates at |
|---|---|---|---|---|---|
| API `GET /healthz` (framework floor) | 2068 rps, p95 1.2 | 5104, p95 5.6 | 5445, p95 14.5 | 5785, p95 23.6 | ~5.5k rps |
| API `GET /api/auth/me` (anonymous) | 2801, p95 0.7 | 4800, p95 5.6 | 5328, p95 14 | 5240, p95 24.5 | ~5.3k rps |
| API `GET /api/progress` (DB read, session lookup + 7 queries) | 435, p95 4 | 672, p95 18 | 696, p95 68 | 648, p95 131 | **~690 rps** |
| API `POST /api/progress/merge` (DB write) | 228, p95 7.5 | 441, p95 27 | 361, p95 121 | 376, p95 230 | **~440 rps** |
| AI `POST /v1/ask` (direct: retrieval + extractive answer) | 202, p95 7.1 | 264, p95 47 | 242, p95 167 | 260, p95 311 | **~260 rps** |
| API `POST /api/ai/ask` (gateway → AI → Postgres) | 131, p95 10.3 | 215, p95 57 | 286, p95 155 | 244, p95 349 | **~290 rps** |
| Web `GET /` (Next.js standalone) | 238, p95 8.3 | 390, p95 34 | 483, p95 94 | 493, p95 174 | ~490 rps |

Reading it:

- **The database is the API's bottleneck, not Express.** Anonymous requests run ~8x faster than ones that touch Postgres. Progress reads do a session lookup plus several queries per request; that is the first thing to optimise (one joined query, or caching the session lookup for a few seconds) before adding instances.
- **The AI service saturates at about 260 questions per second on two shared cores**, with 4.7 ms median at no contention. It is a single uvicorn worker running synchronous retrieval in a thread pool, so one process uses roughly one core. More workers or instances scale it linearly until Postgres becomes the limit. The gateway adds about 2.5 ms.
- **Throughput stops rising at about 8 to 32 workers on every DB-backed path and latency then grows linearly**, which is what a saturated CPU-bound queue looks like. No errors, no collapse: the system degrades by getting slower, not by failing.
- Memory after the run: API process about 112 MB RSS; AI service about 55 MB from the earlier `scripts/bench.py` run (not re-measured under this load); web server not measured. MiniLM (`EMBEDDER=sbert`) is **unmeasured**; do not enable it on a 512 MB instance before running `scripts/bench.py` with it.

## Failure behaviour (limiter on, 2 s AI timeout)

| Scenario | Result |
|---|---|
| 25 questions in a row from one account | exactly 20 × 200, then 5 × 429 |
| AI service hung (`SIGSTOP`) | 504 after 2.006 s (the configured timeout) |
| AI service dead (connection refused) | 503 after 4 ms |
| API `/readyz` while the AI service is down | 200: the rest of the product keeps working |

## Targets (service level objectives)

These are the figures to hold a deployed instance to. They are *targets we chose*, loosely derived from the reference run with headroom; they are not guarantees, and the first real deploy may force a revision.

| Path | p95 target at ≤ 8 concurrent users | Error budget |
|---|---|---|
| Static pages and assets (CDN) | < 300 ms | 0.1% 5xx |
| Auth and progress API | < 150 ms | 0.1% 5xx |
| `POST /api/ai/ask` (warm) | < 400 ms | 0.5% 5xx/504 |
| `POST /api/ai/ask` after a Render free-tier sleep | up to ~30 s once, then warm | counted separately |

## Limits worth knowing

- **Per-account AI limit:** 20 questions per minute. **Per-IP auth limit:** 20 attempts per 15 minutes. Both are in-process (one instance).
- **Request size caps:** 256 KB JSON body; questions 500 characters; progress document at most 500 lessons, 2000 exercises, 2000 reviews.
- **Database connections:** the API and AI service each hold a small pool. Neon's free tier has a low connection ceiling; use its pooled connection string if you scale instances.
- **Free-tier sleep:** a Render free instance sleeps when idle and takes about 30 s to wake; the first AI question after that can time out at 8 s. The Ask panel shows an honest error and works on retry.

## Re-running

```bash
# against a throwaway copy of the stack (it creates accounts and writes progress rows); RATE_LIMIT=false on that API
node scripts/loadtest.mjs --api http://localhost:4000 --ai http://localhost:8000 --ai-token "$AI_INTERNAL_TOKEN" \
     --web http://localhost:3000 --duration 10 --levels 1,8,32 --json docs/load/$(date +%F)-mybox.json
```
