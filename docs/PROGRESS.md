# NEXORA: progress report

Snapshot: 2026-11-25, after content batch 5 (Part D) and the tutor gate fix. Percentages are my estimates from counts in the repo; the weights are stated so you can disagree with them.

## 1. Overall: about 88% done (all 44 chapters and all labs built; known gaps and deployment remain)

| Area | Weight | Done | Contribution |
|---|---|---|---|
| Platform code (web, API, AI tutor, auth, sync, revision, hardening) | 35% | 100% of planned code | 35.0 |
| Curriculum content (44 chapters) | 45% | 75% (33 of 44 chapters) | 33.8 |
| Interactive labs | 10% | 100% (10 built) | 10.0 |
| Deployment and real-world verification | 10% | 0% (nothing deployed or verified live yet) | 0.0 |
| **Total** | 100% | | **about 74%** |

"Platform code 100%" means everything planned for M1–M8 exists and passes its tests in the sandbox. It does not mean it has run in production.

## 2. Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | Blueprint (PRD, curriculum, architecture, schemas, RAG design) | Done |
| M2 | Design system and shell | Done |
| M3 | Content pipeline and lesson reader | Done |
| M4 | Simulation engine and three labs | Done |
| M4b | First content sprint (16 lessons, 7 chapters) | Done |
| M5 | Accounts, OAuth, Postgres, synced progress | Done (real OAuth round trip not yet verified) |
| M6 | AI Professor (zero-cost, extractive, cited) | Done |
| M7a | Spaced-repetition revision | Done |
| M7b | Architecture builder | Done |
| M7c | Event-loop playground | Done |
| M8 | Hardening and deployment readiness | Done (Docker builds not yet run) |
| M9a | Content sprint 2: A5–A7, B1–B4 (14 lessons) | Done |
| M9b+ | Remaining 11 chapters (E, F) | **Done** (74 lessons, 44 chapters) |
| M10 | Deploy and verify live | **Open, needs you** |

## 3. Content

- Chapters authored: **33 of 44 (75%)**: 0.1–0.4, A1–A7, B1–B11, C1–C5, D1–D6.
- Lessons: **61**. Each has at least 3 exercises built around real misconceptions.
- Chapters remaining: **11 (25%)**.

| Part | Chapters | Done | Left |
|---|---|---|---|
| 0 Foundations | 0.1–0.4 | 0.1–0.4 | none |
| A API fundamentals | A1–A7 | all 7 | none |
| B Data and caching | B1–B11 | B1–B11 | none |
| C Architecture and scale | C1–C5 | C1–C5 | none |
| D Reliability and operations | D1–D6 | all 6 | none |
| E Advanced topics | E1–E3 | none | all 3 |
| F Systems and low latency | F0–F7 | none | all 8 |

All tier-1 chapters are now authored.

Pace so far: batch 1 produced 14 lessons (6 in A, 8 in B) in one session, so the remaining ~30 chapters is roughly 3 to 5 more batches. Simulations take longer than text.

## 4. Labs

- Built (5): HTTP request path, DNS/TCP/TLS, event loop, architecture builder, event-loop playground.
- Added in M12 (5): Scan vs B-tree (B3), Cache hit/miss/evict (B6), Session vs JWT (A4), Router matching trace (A2), Byte-level view (A3). All use the existing SimSpec/SimShell, have determinism and invariant tests, and passed the Playwright smoke (desktop, 390px mobile, dark, reduced motion).

## 5. Quality and tests (all passing in the sandbox)

- Web 248, API 110, AI 62 tests. Break-it Lab and Concurrency Arena e2e pass at 1280 and 390 px.
- `content:check`: 30 lessons, 14 chapters, 44 in the graph, no prerequisite cycles.
- Tutor eval (hybrid retrieval): recall about 0.96 on the in-scope held-out set; refusal on out-of-scope about 83%. Known miss: "database sharding" (covered by C4 later).

## 6. What is left, in order

**You (cannot be done from the sandbox)**
1. Unzip `nexora-m9.tar.gz` over your Desktop folder; run `bash scripts/make-commits.sh`, then `git push`.
2. Deploy: Neon, Render (API and AI), Vercel (web), following `docs/DEPLOY.md`.
3. Verify real GitHub and Google sign-in.
4. Run `scripts/smoke.sh` and `scripts/loadtest.mjs` against live URLs; one restore drill on Neon.
5. First real Docker image builds (CI's `docker` job).

**Me**
1. Author the 30 remaining chapters (task #34), tier-1 first.
2. Build the five planned labs.
3. Fix known gaps: shared rate limiter, password reset, tutor refusal on topic-adjacent questions, capacity and queueing in the architecture builder.
4. Optional flagship features (Break-it Lab, EXPLAIN playground, concurrency arena).

## 7. Known limits (honest list)

- Docker images, real deployment, real OAuth and Firefox/Safari for the playground sandbox are unverified.
- Rate limiter is per instance.
- No email verification or MFA. Password reset is built but sends nothing until a mail provider adapter is configured.
- Render free tier sleeps (about 30 s cold start).
- Percentages above are estimates, not measurements.
