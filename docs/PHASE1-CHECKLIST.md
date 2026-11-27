# Phase 1 checklist (audit of 2026-11-25)

Source of truth: the repository. Counts below come from `curriculum.ts`, `packages/content/lessons/` and the test suites.

## Current state
- 14 of 44 chapters authored (30 lessons). Tests: web 129, API 99, AI 60.
- Sim engine: pure `Scenario(params, seed) -> Step[]` in `apps/web/src/sim/` (http, dns, eventloop). Architecture builder in `components/arch`. Playground in `components/playground`.
- API rate limiting: `express-rate-limit` with in-memory store (`auth/routes.ts`), so it is per instance.

## 1. Curriculum (30 chapters left, about 60 lessons)
Order: Tier-1 first, then by part.
- [x] Batch 2 (done, verified): B6 Caching and Redis, B7 Task queues, C3 Backend security, C4 Scaling and performance
- [x] Batch 3 (done, verified): B5 NoSQL trade-offs, B8 Full-text search, B9 Fault tolerance, B11 Configuration and secrets, B10 gRPC
- [ ] Batch 4: C1 Observability, C2 Graceful shutdown, C5 Concurrency, 0.4
- [x] Batch 5 (done, verified): D1 Docker, D4 Testing, D5 Brokers and Kafka, D6 WebSockets, D3 CI/CD, D2 Kubernetes
- [ ] Batch 6: E1 OpenAPI, E2 Agents, E3 Production AI, F0 Distributed systems
- [ ] Batch 7: F1 to F7 system-design chapters
Each batch: `content:check`, web typecheck/tests/build, AI re-ingest, eval, tests, docs.
**Accuracy rule:** claims I can run here (Postgres, Redis, Node, Python, HTTP, SQLite) are measured and quoted. Docker and Kubernetes cannot run here (no daemon, no cluster), so those lessons cite official documentation and say "not reproduced here"; they are marked in the lesson.

## 2. Labs (5)
- [x] Scan vs B-tree (B3): page-read model, scan vs index, fanout param (pure arithmetic, tested; not calibrated to Postgres timings)
- [x] Cache hit/miss/evict (B6): LRU/LFU/FIFO, three workloads, capacity (no TTL; stated in the lab)
- [x] Session vs JWT (A4): revocation, denylist, lookups, replay time vs lifetime
- [x] Router matching trace (A2): order, shadowing, 404 vs 405
- [x] Byte-level view (A3): UTF-8/UTF-16 verified against TextEncoder/Buffer, length prefix
Reuse `Scenario` and `SimSpec`; each gets a determinism test and a registry entry.

## 3. Known gaps
- [x] Shared rate limiter: Postgres-backed store (one atomic upsert), tested with two API instances incl. 40 concurrent requests -> exactly 20 allowed
- [x] Password reset: token flow with hashed single-use tokens; **email delivery needs an SMTP provider, which is outside the zero-cost scope: shipped behind a pluggable mailer (console in dev), flagged as a manual step for you**
- [~] Tutor refusal: IDF-weighted gate done (held-out refusal 0.60 -> 0.80, answered 0.98 -> 0.90); semantic misses like "Kubernetes operator" need an sbert measurement on your machine
- [x] Architecture builder: capacity, queueing, timeouts and retries (`lib/arch/load.ts`, discrete-event, 8 tests)
- [ ] Others found: Firefox/Safari for the sandbox (cannot test here), Render cold start (documented)

## 4. Verification gates (every batch)
Existing tests green; new tests for new code; `content:check` (graph, no cycles); sim determinism tests (same seed, same steps); tutor citation and refusal eval; accessibility and responsive checks in a real browser where possible.

## Needs your manual action (collected at the end)
Deploy, real OAuth, live smoke/load tests, SMTP provider for password reset, Docker image builds.

## Phase 2 (only after Phase 1 is verified)
Break-it Lab, then Concurrency Arena. Note the overlap with existing chapters B9 (retry storm) and C5 (race condition lab): the flagship features will *be* those labs, not duplicates.
