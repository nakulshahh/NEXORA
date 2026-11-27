# NEXORA — Milestone 1 Blueprint

*Backend Engineering, Beyond Frameworks.* · Status: **awaiting approval** · Date: 2026-11-21

Contents: 0 Findings · 1 Assumptions I challenge · 2 Curriculum · 3 PRD · 4 User journeys · 5 Sitemap · 6 Architecture · 7 Database schema · 8 RAG · 9 Simulation engine · 10 Design system · 11 Milestone acceptance criteria · 12 Risks · 13 Decisions needed

---

## 0. Research findings (and what I could not verify)

**Reference site** (`backend-from-first-principle.vercel.app`, landing page read in full):
- 27 chapters in 6 groups: Request Path (01–07), State & Machinery (08–14), Running in Production (15–20), Distribution & Scale (21–24), OpenAPI & AI Agents (25–26), System Design (27, URL shortener only).
- Philosophy: teach the mechanics under frameworks ("why a pool is sized as it is, what a broker does and doesn't guarantee"). Chapters are self-contained; 2–5 h each.
- UX: grouped sidebar TOC with reading times, `/` search, per-chapter "Completed" + "0 / 27" progress, offline-capable PWA.
- Code: Go and Python as core languages; JS/TS/Java in places. Explanation + diagrams + runnable code. **No interactivity, no AI, no exercises, no personalization.** That is NEXORA's whole differentiation.
- It is a community companion (curated by `@DsThakurRawat`, open source) to the video series by **Sriniously**. Different authors; I'll treat the *series* as the primary inspiration and the site as a structural reference. We reuse nothing from either.

**YouTube**: your link is a search query, not a stable source. Aggregators show a "Backend from first principles" playlist by Sriniously (e.g. ep. 1 *Roadmap*, 31 min, `youtu.be/0Rwb4Xmlcwc`; ep. 5 *Understanding HTTP*, 1h18m; ep. 22 *Concurrency & Parallelism*, 1h28m) and list **23** videos versus the site's 27 chapters.

**Not verified:** I did not read individual chapter bodies or watch/transcribe videos (and won't reproduce them). Before Milestone 3 I need the canonical playlist URL from you so each lesson links to the right video with attribution. The curriculum below is derived from the site's chapter list plus my own engineering judgment, not from the video content.

---

## 1. Assumptions I challenge

| # | Your assumption | My view | Recommendation |
|---|---|---|---|
| 1 | 27+ chapters, 8 milestones, all features | Content authoring (original text, diagrams, code, quizzes, sims) is ~80% of the work, not code. Feature breadth will outrun content. | **Vertical slice first**: ship 6–8 *excellent* chapters end-to-end (reading + sim + quiz + AI) before widening. Tier the curriculum (§2). |
| 2 | Curriculum order from the reference | Several chapters depend on knowledge taught later (DNS/TCP before HTTP; I/O models before Node's event loop; distributed-systems fundamentals *after* system design). | Add a **Part 0 Foundations**; move Concurrency/I-O earlier; move distributed-systems fundamentals *before* system design. |
| 3 | Express + Prisma + Python/FastAPI | Three runtimes is real operational weight. It is defensible only because the backend *is* curriculum (NEXORA dogfoods its own lessons). **Prisma can't natively use `vector` columns.** | Keep Express + Python, but: modular monolith API; AI service owns its own `rag` schema (raw SQL/psycopg); Prisma owns the app schema only. |
| 4 | "Safe sandboxed execution" in the playground | Running arbitrary learner code server-side is the single largest security risk in the product. | Phase it: (a) **in-browser sandbox** (iframe/Web Worker with *simulated* `net`/`http`/`fs`) in M7; (b) real server-side execution only via an isolated provider/microVM later, never in the app backend. Browser WebContainer-style options need a commercial-licence check. |
| 5 | "No fake AI responses" + "never fabricate" | Prompting alone doesn't guarantee this. | Enforce mechanically: retrieval-confidence gate, citation-ID validation, quote verification, refusal path, and a golden-question eval suite in CI (§8). |
| 6 | Redis "when needed" | Agree. Use Postgres first (sessions, rate limits, job queue via `pg-boss`-style). Add Redis when a *lesson-worthy* need appears. | Defer Redis to M5/M7; don't add for its own sake. |
| 7 | Light-first, dark mode | Agree. Dark mode for diagrams/sims is the hard part (sims must be token-driven, never hard-coded colors). | Token-driven theming from day 1 (§10). |
| 8 | Personalized/AI revision | Needs data that only exists after real usage. | Build SM-2 spaced repetition (deterministic) first; AI-generated exercises second; "weak concept detection" from attempt data, not LLM guesses. |

---

## 2. Curriculum proposal

**Structure:** Part → Chapter (2–4 h) → Lesson (15–25 min, the atomic unit: one idea, one demo, one check).
**Tier 1** = ships in v1 vertical slice and first public release. **Tier 2** = v1.x. **Tier 3** = later.
Effort estimate to author, per chapter: ~3–5 working days; +1–2 days per flagship simulation. (Estimate, to be recalibrated after the first chapter.)

### Part 0 — Foundations *(new)*
| Ch | Title | Prereqs | Flagship sim | Tier |
|---|---|---|---|---|
| 0.1 | What a backend actually is (client/server, request→response mental model) | — | Request journey (overview) | 1 |
| 0.2 | Networking essentials: IP, ports, TCP, UDP, **DNS**, TLS | 0.1 | **DNS resolution**, TCP handshake | 1 |
| 0.3 | Processes, threads, I/O models, **event loop** | 0.1 | **Event loop** | 1 |
| 0.4 | Linux, shell & dev environment (short) | — | — | 2 |

### Part A — The Request Path
| Ch | Title | Prereqs | Flagship sim | Tier |
|---|---|---|---|---|
| A1 | HTTP & CORS | 0.2 | **HTTP request lifecycle** | 1 |
| A2 | Routing | A1 | Router matching trace | 1 |
| A3 | Serialization & deserialization | A1 | JSON/Protobuf byte view | 2 |
| A4 | Authentication & authorization | A1, A3 | Session vs JWT | 1 |
| A5 | Validation & transformations | A3 | — | 2 |
| A6 | Controllers, services, middleware (layering) | A2, A5 | Middleware chain stepper | 1 |
| A7 | REST API design (pagination, filtering, idempotency, versioning) | A6 | — | 2 |

### Part B — State and Machinery
| Ch | Title | Prereqs | Flagship sim | Tier |
|---|---|---|---|---|
| B1 | Database fundamentals (storage, pages, WAL, connection pooling) | 0.3 | Connection pool | 1 |
| B2 | SQL & relational modeling (+ migrations) | B1 | — | 1 |
| B3 | Indexes & B-trees (+ reading query plans) | B2 | **Scan vs B-tree** | 1 |
| B4 | Transactions, ACID, isolation, locks/MVCC | B2 | Isolation anomaly lab | 1 |
| B5 | NoSQL & data-model trade-offs *(new)* | B2 | — | 3 |
| B6 | Caching & Redis | B1, A7 | **Cache hit/miss/evict** | 1 |
| B7 | Task queues & background jobs | A6, B4 | Queue + retries | 1 |
| B8 | Full-text search (inverted index; Postgres FTS → Elasticsearch) | B3 | Inverted index builder | 2 |
| B9 | Error handling & fault tolerance (timeouts, retries, backoff, circuit breakers) | A6 | Retry storm | 2 |
| B10 | gRPC & inter-service communication (+ Protobuf) | A3 | — | 3 |
| B11 | Configuration & secrets | A6 | — | 2 |

### Part C — Running in Production
| Ch | Title | Prereqs | Flagship sim | Tier |
|---|---|---|---|---|
| C1 | Logging, metrics, tracing | A6 | Trace waterfall | 2 |
| C2 | Graceful shutdown | 0.3, A6 | Shutdown stepper | 2 |
| C3 | Backend security (OWASP, rate limiting, secrets) | A4 | Attack/defense lab | 1 |
| C4 | Scaling & performance (reverse proxy, **load balancing**, CDN, replication, sharding, profiling) | B6 | **Load balancer** | 1 |
| C5 | Concurrency & parallelism (races, locks, worker models) | 0.3 | Race condition lab | 2 |

### Part D — Distribution and Scale
| Ch | Title | Prereqs | Flagship sim | Tier |
|---|---|---|---|---|
| D1 | Docker | 0.4 | Layer/cache viewer | 2 |
| D2 | Kubernetes | D1 | Scheduler/rollout | 3 |
| D3 | CI/CD | D1 | Pipeline stepper | 3 |
| D4 | Automated testing | A6 | Predict-the-test | 2 |
| D5 | Message brokers & Kafka | B7 | **Producer/broker/consumer** | 2 |
| D6 | WebSockets & real-time (+ SSE) | A1 | Fan-out | 2 |

### Part E — Modern Backend Engineering
| Ch | Title | Prereqs | Tier |
|---|---|---|---|
| E1 | OpenAPI & API documentation | A7 | 2 |
| E2 | AI agents & backend workflows | B7, B9 | 3 |
| E3 | Production AI integration (RAG, evals, cost, guardrails) | E2, B3 | 3 *(NEXORA itself is the case study)* |

### Part F — System Design
| Ch | Title | Prereqs | Tier |
|---|---|---|---|
| F0 | **Distributed systems fundamentals** (CAP, consistency, replication, consensus intuition, clocks) *(moved first)* | B4, C4 | 3 |
| F1 | Method: requirements, estimation, trade-off write-ups *(new)* | F0 | 3 |
| F2 | URL shortener | F1 | 3 |
| F3 | Rate limiter | F1, B6 | 3 |
| F4 | Notification system | F1, B7, D5 | 3 |
| F5 | Chat application | F1, D6 | 3 |
| F6 | File storage service | F1 | 3 |
| F7 | News feed | F1, F4 | 3 |

### Missing foundations I added
Networking/DNS/TLS; OS processes & I/O models; query plans & migrations; isolation levels; resilience patterns (timeouts, backoff, circuit breaker, **idempotency**); rate limiting; reverse proxy/CDN; distributed-systems fundamentals; estimation method. Considered but deferred: NoSQL depth, multi-tenancy, webhooks, object storage (fold into F6), cloud provider specifics.

### v1 vertical slice (my recommendation for Milestones 3–7)
**0.2 Networking (DNS), 0.3 Event loop, A1 HTTP, A4 Auth, B3 Indexes, B6 Caching** — six chapters with full treatment. Everything else is a stub page ("coming soon" + outline) so the roadmap is honest but complete.

### Original-content rule for every lesson
Each lesson is authored from scratch (our explanations, diagrams, code, sims, quizzes). Video links go in a "Watch next" box with title, channel, and URL. No transcripts, no paraphrased-at-length summaries. Language: **TypeScript/Node primary** (matches stack), with "build it raw" sections using only `node:net` to implement HTTP/DNS/etc. by hand; Python/Go snippets only where they illuminate something.

### Chapter / lesson template (enforced by the MDX schema)
Learning objectives · Prerequisites (graph-linked) · Why it exists · How it works internally · Diagram(s) · Simulation(s) · Code (build it raw → then the framework way) · Common mistakes · Production use cases · Trade-offs · Knowledge check (quiz / predict-the-output / debug / scenario) · Misconception catalogue (feeds the AI) · Further reading + video references.

---

## 3. PRD

**Problem.** Backend learners know how to *use* Express/Postgres/Redis/Docker but not how they work; existing resources are static text or long videos with no feedback loop.

**Target users:** (1) framework-only juniors/bootcamp grads; (2) CS students/interview preppers; (3) mid-level engineers filling gaps; (4) returning revisers.

**Product principles**
1. *Understand the machinery before the framework.* Every concept: problem → mechanism → framework.
2. *Reading is the core; everything else is in service of it.* No navigating away to explore, ask, or practice.
3. *Interactive only where it earns its place.* A sim must show something prose can't (state over time, hidden mechanisms).
4. *Honest AI.* Grounded, cited, or silent.
5. *Quality over quantity.* Fewer, better chapters.

**Functional requirements (by priority)**
- **P0:** Roadmap & chapter/lesson reader (MDX); inline sims; knowledge checks; progress (anonymous local → account sync); search; dark mode; responsive; a11y AA.
- **P0:** Accounts (email+password, GitHub/Google OAuth); learning dashboard; streak; next-lesson recommendation (prerequisite-graph based).
- **P0:** AI Professor with RAG, citations, difficulty levels, chapter context, follow-ups.
- **P1:** Code playground (in-browser sandbox); spaced-repetition revision; resource explorer.
- **P2:** Engineering playground (React Flow architecture builder + request-flow simulation); AI-generated revision exercises; server-side code execution.

**Non-goals (v1):** video hosting, certificates, community/forums, payments, mobile apps, multi-language UI, user-generated content.

**Success metrics:** lesson completion rate; % of lessons where a sim was used; knowledge-check first-attempt accuracy vs. later; D7/D30 return; AI: citation-validity 100%, retrieval recall@5 ≥ 0.9 on golden set, "helpful" thumbs rate; median time-to-first-token < 2 s.

**Content/legal:** original content; attribution links; reference licences checked; no copied diagrams.

---

## 4. User journeys

1. **First visit (Maya, framework-only):** landing → sees live HTTP-lifecycle sim in hero → "Start with Chapter 0.2" or optional 8-question placement → lesson reading with inline sim → asks AI "why do we need DNS?" → cited answer links to lesson section → knowledge check → prompted (soft) to save progress → sign-up merges local progress.
2. **Daily learner:** dashboard → "Continue: B3.2 B-trees" + streak + 2 revision cards due → reads → sim → exercise → next recommendation.
3. **Stuck student:** selects confusing paragraph → "Explain this simpler" → AI answers from curriculum, cites sections, asks a diagnostic follow-up → AI flags a likely misconception (from authored catalogue) → links to prerequisite lesson.
4. **Reviser (Sam):** revision page → due cards (SM-2) → misses flagged concepts → regenerated practice (P2) → weak-concept heatmap.
5. **Explorer:** search "idempotency" → keyword+semantic results across lessons/resources → jump to exact heading.

---

## 5. Sitemap

```
/                              Landing
/roadmap                       Full curriculum graph + list (filter by tier/part)
/learn                         Dashboard (auth or local)
/learn/[part]                  Part overview
/learn/[part]/[chapter]        Chapter overview (objectives, prereqs, lesson list, est. time)
/learn/[part]/[chapter]/[lesson]   Lesson page  ← heart of the product
     right companion panel: Ask AI · Lab · Notes · Resources
/labs                          Lab index (all simulations)
/labs/[sim]                    Full-screen interactive lab (+ share-state URL)
/playground/code               Code playground (M7)
/playground/architecture       Architecture builder (M7)
/professor                     Full-page AI Professor (history, threads)
/revision                      Spaced repetition + weak concepts
/progress                      Progress detail, streak history
/search                        Search & resource explorer (lessons, sims, videos, reading)
/resources                     Curated external references (attributed)
/account  /account/settings    Profile, theme, LLM usage
/auth/sign-in  /auth/sign-up  /auth/callback/[provider]
/about  /method  /changelog  /legal/*
```

**Lesson page layout:** left collapsible outline (progress ticks) · centre reading column (~68ch) with inline sims/quiz/code · right companion panel (Ask AI / Notes). Mobile: companion becomes a bottom sheet; sims go full-width with sticky controls. Text selection → "Explain this / Quiz me".

---

## 6. Technical architecture

```
Browser ── Next.js (apps/web: SSR/SSG of MDX, sims, UI)
   │  cookie session (httpOnly, SameSite=Lax; same-site via reverse proxy)
   ▼
Express API (apps/api, TypeScript)  ──  Postgres (schema: app)   [Prisma]
   │  auth, progress, revision, quotas, conversations, SSE proxy
   │  internal HTTP + service token (OpenAPI-defined)
   ▼
AI service (services/ai, Python/FastAPI) ── Postgres (schema: rag, own DB role)  [pgvector + tsvector]
   │  ingestion, hybrid retrieval, rerank, generation, evals
   ▼
LLM provider (adapter: Claude default; others pluggable) · Embedding provider (adapter)
```

- **Content = code.** MDX in `packages/content`, versioned in git, validated by a Zod frontmatter schema in CI. The *same* MDX is the single source for the site and RAG ingestion (no drift).
- **Why separate AI service:** different runtime/deps, independent scaling and failure domain, and clean boundary for the "curated vs external" separation. API gateway enforces auth, quotas and streaming (SSE) in one place; the AI service never trusts browsers.
- **Contracts:** Zod schemas → OpenAPI → generated TS client (web) and Pydantic models (AI). Dogfoods chapter E1.
- **Queue/jobs:** Postgres-backed queue first (ingestion runs, email, streak rollups). Redis only when a lesson/need justifies it.
- **Monorepo:** pnpm + Turborepo.

```
nexora/
  apps/web  apps/api
  services/ai            (uv, FastAPI, pytest)
  packages/content  packages/sim-engine  packages/ui  packages/shared
  infra/docker  docs/    (BLUEPRINT.md, LEARNING.md, ADRs)
```

**Cross-cutting:** strong typing end-to-end; error taxonomy + RFC 9457-style problem responses; Argon2id passwords; server-side sessions in Postgres (httpOnly cookies, CSRF token for state-changing calls); OAuth through a vetted library; rate limiting per IP/user; structured logs + request IDs propagated to the AI service; secrets only via env (`.env.example`, no keys in git, secret-scanning pre-commit + CI).

**Testing:** Vitest (unit), Supertest + Testcontainers Postgres (API integration), Playwright (E2E + sim smoke), axe (a11y), pytest (AI), **RAG eval harness in CI**, property tests for the simulation engine (determinism, reset idempotence).

---

## 7. Database design

### 7.1 App schema (Prisma, abridged)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String?              // null for OAuth-only
  displayName  String?
  level        Level    @default(BEGINNER)
  theme        String   @default("system")
  createdAt    DateTime @default(now())
  sessions     Session[]
  oauth        OAuthAccount[]
  progress     LessonProgress[]
  attempts     ExerciseAttempt[]
  cards        ReviewCard[]
  threads      Thread[]
  activity     ActivityDay[]
}
enum Level { BEGINNER INTERMEDIATE ADVANCED }

model Session      { id String @id; userId String; expiresAt DateTime; createdAt DateTime @default(now()); ip String?; ua String?
                     user User @relation(fields: [userId], references: [id], onDelete: Cascade); @@index([userId]) }
model OAuthAccount { provider String; providerUserId String; userId String
                     user User @relation(fields: [userId], references: [id], onDelete: Cascade); @@id([provider, providerUserId]) }

// Curriculum metadata mirrored from content (source of truth = MDX; synced at deploy)
model Part    { id String @id; slug String @unique; title String; order Int; chapters Chapter[] }
model Chapter { id String @id; partId String; slug String; title String; order Int; tier Int; estMinutes Int
                part Part @relation(fields: [partId], references: [id]); lessons Lesson[]
                @@unique([partId, slug]) }
model Lesson  { id String @id; chapterId String; slug String; title String; order Int; estMinutes Int
                contentHash String; contentVersion Int @default(1)
                chapter Chapter @relation(fields: [chapterId], references: [id])
                exercises Exercise[]; @@unique([chapterId, slug]) }
model Prerequisite { lessonId String; requiresId String; @@id([lessonId, requiresId]) }   // DAG, validated acyclic in CI
model Concept  { id String @id; slug String @unique; title String }                          // tag for weakness tracking
model LessonConcept { lessonId String; conceptId String; @@id([lessonId, conceptId]) }

model Exercise {
  id String @id; lessonId String; slug String; kind ExerciseKind; conceptId String?
  payload Json                       // question, options/answer key, explanation (validated by Zod)
  lesson Lesson @relation(fields: [lessonId], references: [id]); @@unique([lessonId, slug])
}
enum ExerciseKind { QUIZ PREDICT_OUTPUT DEBUG SCENARIO }

model ExerciseAttempt { id String @id @default(cuid()); userId String; exerciseId String; correct Boolean
                        answer Json; msToAnswer Int?; createdAt DateTime @default(now())
                        @@index([userId, exerciseId, createdAt]) }

model LessonProgress { userId String; lessonId String; status ProgressStatus; scrollPct Int @default(0)
                       completedAt DateTime?; updatedAt DateTime @updatedAt; @@id([userId, lessonId]) }
enum ProgressStatus { NOT_STARTED IN_PROGRESS COMPLETED }

model ActivityDay { userId String; day DateTime @db.Date; minutes Int @default(0); lessonsDone Int @default(0)
                    @@id([userId, day]) }            // streak computed from this, in user's timezone

// Spaced repetition (SM-2 baseline; FSRS evaluated later)
model ReviewCard { id String @id @default(cuid()); userId String; exerciseId String
                   ease Float @default(2.5); intervalDays Int @default(0); reps Int @default(0); dueAt DateTime
                   @@unique([userId, exerciseId]); @@index([userId, dueAt]) }
model ReviewLog  { id String @id @default(cuid()); cardId String; grade Int; reviewedAt DateTime @default(now()) }

// AI conversations owned by the API, not the AI service
model Thread  { id String @id @default(cuid()); userId String; lessonId String?; title String?; createdAt DateTime @default(now())
                messages Message[]; @@index([userId, createdAt]) }
model Message { id String @id @default(cuid()); threadId String; role MsgRole; content String
                citations Json?; retrievalMeta Json?; model String?; tokensIn Int?; tokensOut Int?
                feedback Int?; createdAt DateTime @default(now()); @@index([threadId, createdAt]) }
enum MsgRole { USER ASSISTANT }

model UsageEvent { id String @id @default(cuid()); userId String; kind String; tokens Int; costMicros Int
                   createdAt DateTime @default(now()); @@index([userId, createdAt]) }   // daily quota enforcement
model Note { id String @id @default(cuid()); userId String; lessonId String; anchor String?; body String; createdAt DateTime @default(now()) }
```

Design notes: anonymous learners keep progress in `localStorage` with the same shape; sign-up merges (max of status/timestamps). Curriculum rows are *derived* from MDX, so content never lives only in the DB. Row-level ownership checks in every query (`userId` in every where-clause), tested.

### 7.2 RAG schema (owned by AI service, raw SQL)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA rag;

CREATE TABLE rag.document (
  id uuid PRIMARY KEY, source_kind text NOT NULL,          -- 'curriculum' | 'external'
  lesson_slug text, chapter_slug text, part_slug text,
  title text, url text, content_hash text NOT NULL, version int NOT NULL,
  trust_tier smallint NOT NULL,                             -- 1 = curated curriculum, 2 = vetted external
  ingested_at timestamptz DEFAULT now(), UNIQUE (source_kind, url, content_hash));

CREATE TABLE rag.chunk (
  id uuid PRIMARY KEY, document_id uuid REFERENCES rag.document ON DELETE CASCADE,
  ordinal int, heading_path text[], section_anchor text,    -- deep-link target for citations
  content text NOT NULL, token_count int,
  chunk_kind text,                                          -- prose | code | definition | misconception | tradeoff
  concepts text[], difficulty smallint,                     -- metadata for filtering
  embedding vector(1024) NOT NULL, embedding_model text NOT NULL,   -- dimension fixed per model; versioned
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED);
CREATE INDEX ON rag.chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON rag.chunk USING gin (tsv);
CREATE INDEX ON rag.chunk (document_id);  CREATE INDEX ON rag.chunk USING gin (concepts);

CREATE TABLE rag.ingestion_run (id uuid PRIMARY KEY, started_at timestamptz, finished_at timestamptz, status text, stats jsonb);
CREATE TABLE rag.eval_case   (id uuid PRIMARY KEY, question text, expected_chunk_slugs text[], must_refuse boolean DEFAULT false);
CREATE TABLE rag.eval_result (run_id uuid, case_id uuid, recall_at_k real, citation_valid boolean, faithful boolean, notes text);
```
Embedding dimension is a placeholder (1024); it's set by the chosen embedding model. Changing models = new column/table + re-embed (hence `embedding_model`).

---

## 8. RAG architecture

**Ingestion** (idempotent, hash-based, CI-triggered on content change):
MDX → parse (AST, not regex) → strip JSX/UI noise, keep code blocks and sim captions → **semantic chunking by heading structure** (target ~300–600 tokens, never split code blocks or definitions; keep `heading_path` and parent title prepended for embedding) → metadata (lesson, part, concepts, difficulty, chunk_kind, anchor) → embed (batched, provider adapter) → upsert; tombstone removed chunks.

**Two corpora, never mixed silently:**
- `curriculum` (trust 1): our lessons. Default and only source in v1 for factual claims.
- `external` (trust 2): hand-picked allowlisted docs (e.g. official Postgres/HTTP RFC pages). v1 = off by default; user toggle "Include external docs", and the UI labels those citations differently. No open-web retrieval.

**Retrieval pipeline per question**
1. Query understanding: use thread history + current lesson/section to rewrite into a standalone query (cheap model); extract concept hints.
2. Metadata filter: boost current chapter/part; optionally restrict to prerequisites for beginners.
3. **Hybrid**: vector top-N (HNSW cosine) ∪ Postgres FTS top-N (`ts_rank_cd`), fused with **Reciprocal Rank Fusion**.
4. **Rerank** top ~30 → ~6 with a cross-encoder (local or API; adapter) — choice benchmarked on our eval set.
5. **Confidence gate:** if best rerank score < threshold → no generation from curriculum; answer "not covered in the curriculum yet" + nearest lessons.
6. Context assembly: chunks with stable IDs, current-lesson snippet, difficulty level (beginner / intermediate / expert), conversation summary.

**Generation (provider adapter; Claude default)**
- System prompt: answer *only* from provided chunks for factual/curriculum claims; label any general-knowledge aside; every claim cites `[chunk_id]`; ask one diagnostic follow-up; suggest next lessons.
- Structured output: `{answer, citations[{chunk_id, quote}], followups[], recommended_lessons[], misconception?}`.
- **Post-validation (mechanical):** every `chunk_id` ∈ retrieved set; each `quote` is a verbatim substring of that chunk; uncited factual sentences flagged → one regeneration → else strip + degrade to "partially grounded" badge. Invented lesson slugs are impossible: recommendations validated against the curriculum table.
- **Misconception detection:** each lesson has an authored misconception catalogue (`chunk_kind = misconception`); the model classifies the user message against *retrieved* catalogue entries only. No free-form psychological diagnosis.
- Streaming via SSE; citations arrive with the final frame and render as deep links to `lesson#anchor`.

**Safety & cost:** user text is untrusted (instruction-injection tested); per-user daily token quota (`UsageEvent`); request timeout + provider fallback; no PII in logs; retrieval/generation traces stored (`retrievalMeta`) for debugging.

**Evaluation (blocks releases):** golden set ≥ 100 questions (answerable, ambiguous, out-of-scope, adversarial). Metrics: recall@k, MRR, citation validity (must be 100%), faithfulness (LLM-judge + spot human review), refusal precision on out-of-scope. Run in CI against a pinned content snapshot.

---

## 9. Simulation engine (the differentiator)

Problem: every sim needs play / pause / step / reset / speed / parameters / annotations. Building that per sim = inconsistency + bugs.

**Design: deterministic scenario → timeline → renderer.**
```ts
type Step<S> = { id: string; label: string; explain: string; state: S; durationMs?: number };
type Scenario<P, S> = (params: P, seed: number) => Step<S>[];   // pure, deterministic
// Engine: usePlayer(steps) -> { index, playing, speed, play, pause, next, prev, reset, seek }
// Renderer: <HttpLifecycleView step={steps[index]} /> uses Motion, theme tokens only
```
- Scenarios are **pure functions** of (params, seed) → trivially unit-testable, reset-safe, shareable by URL (`/labs/http?cache=miss&seed=7`).
- The step list doubles as an **accessible transcript** (aria-live narration, keyboard control, reduced-motion = step mode by default).
- Event-loop sim runs a *real* model of the spec'd phases (call stack, microtasks, timers, I/O callbacks) over user-editable snippets from a restricted set — not canned animations.
- Honesty rule: each sim states what it simplifies.

---

## 10. Design system

**Direction:** a typeset engineering handbook — calm, editorial, precise. Warm paper background, deep charcoal ink, one restrained indigo accent, hairline borders, generous whitespace, almost no shadows or gradients.

**Color tokens** (contrast ratios computed against the stated background):

| Token | Light | Dark | Contrast |
|---|---|---|---|
| `--bg` | `#FAF8F4` | `#121110` | — |
| `--surface` | `#FFFFFF` | `#1A1917` | — |
| `--ink` | `#1C1B19` | `#EDEAE4` | 16.2 / 15.7 |
| `--ink-muted` | `#5E5A54` | `#A39E95` | 6.5 / 7.1 |
| `--border` | `#E7E3DC` | `#2B2926` | decorative |
| `--accent` | `#4F46E5` | `#9C97FF` | 5.9 / 7.4 |
| `--on-accent` | `#FFFFFF` | `#121110` | 6.3 / 7.4 |
| `--info` | `#0B6BCB` | derive in M2 | 5.0 |
| `--success` | `#1A7F4B` | derive in M2 | 4.7 |
| `--warn` | `#9A5B00` | derive in M2 | 5.1 |
| `--danger` | `#B3261E` | derive in M2 | 6.2 |

All text pairs ≥ 4.5:1. Semantic colors never carry meaning alone (icon + label). Sim/diagram palettes are token-driven so dark mode is automatic.

**Type:** UI — Geist Sans (or Inter); long-form reading — a text serif (e.g. Newsreader / Source Serif 4) at 18–19px / 1.7, ~68ch measure; code — Geist Mono / JetBrains Mono; Shiki for highlighting (build-time, dual theme). Scale 1.200 (minor third). Headings: tight tracking, medium weight; numerals tabular in tables.

**Layout & shape:** 4px base grid; reading column 68ch, page max 1280px; radius 6/10; 1px borders; elevation only for popovers/dialogs; focus ring 2px accent + 2px offset.

**Motion:** 150–220ms ease-out for UI; sim motion is user-paced; respects `prefers-reduced-motion`.

**Components** (shadcn/ui as primitives, restyled): Button, Input, Tabs, Dialog, Popover, Tooltip, Command palette (`/` and ⌘K), Sidebar outline, Breadcrumbs, Progress ring/bar, Callout (note / why / mistake / tradeoff), CodeBlock (copy, filename, line highlight, run), CodeTabs, Diagram frame, **SimShell** (controls: play/pause/step/reset/speed/params/annotation rail), Quiz/Predict/Debug/Scenario cards, AskAI panel + citation chips, Roadmap graph node, Streak calendar.

**Avoid (explicit):** gradient heroes, glass cards, floating decorative cards, stock illustrations, dense dashboards. Landing page hero = the *real* HTTP lifecycle sim.

---

## 11. Milestone acceptance criteria

**M1 (this doc).** Blueprint approved; open decisions in §13 answered; canonical video playlist supplied.

**M2 — Design system, landing, dashboard, roadmap**
- Tokens implemented once; light/dark switch with no flash; all text pairs ≥ 4.5:1 (automated check).
- Landing, dashboard (local-state mock-free: reads real content metadata), roadmap (all parts/chapters; non-authored chapters shown as outlines).
- Lighthouse a11y ≥ 95, perf ≥ 90 on landing; responsive 360–1440px; keyboard-complete nav.

**M3 — Reading experience**
- MDX pipeline with schema-validated frontmatter; CI fails on missing sections/broken links/cyclic prerequisites.
- Lesson page with outline, progress tracking (local), search (`/`), callouts, code blocks, quiz components.
- 2 chapters fully authored to template; selection toolbar present (AI wired later).
- Reading measure/typography reviewed on mobile + desktop.

**M4 — Three simulations (HTTP lifecycle, DNS resolution, event loop)**
- Each: play/pause/step/prev/reset/speed, ≥ 3 user parameters, annotation per step, shareable URL state.
- Scenario functions unit-tested (deterministic; reset restores initial state); Playwright smoke per sim.
- Keyboard-operable; screen-reader transcript; reduced-motion step mode; dark mode verified.
- Event loop sim ordering matches Node semantics on a documented test set of snippets.

**M5 — Auth, database, progress**
- Sign-up/in (email + OAuth), sessions, logout-everywhere; Argon2id; CSRF protection; rate-limited auth routes.
- Prisma migrations; seed from content; progress/streak/attempt APIs with ownership tests (cross-user access returns 404).
- Anonymous→account progress merge works; OpenAPI published and the web client is generated from it.
- Integration tests on real Postgres in CI; no secrets in repo (scanner passes).

**M6 — RAG + AI Professor**
- Ingestion idempotent (re-run = no changes); ingestion of v1 content < N minutes (target set after first run).
- Hybrid + rerank implemented; golden set ≥ 100; recall@5 ≥ 0.9 on answerable; citation validity 100%; out-of-scope refusal precision ≥ 0.95; all gates enforced in CI.
- Streamed answers with deep-link citations; difficulty levels; follow-ups; misconception flag from catalogue only.
- Provider adapter proven with ≥ 2 providers (can be one real + one stub in tests); quotas enforced; zero invented lesson slugs in tests.

**M7 — Playgrounds, revision, advanced**
- Code playground: Monaco, edit/run in an isolated browser sandbox, no network/DOM-parent access (security tests); deterministic output panel.
- Architecture builder (React Flow): ≥ 6 component types, connect + simulate a request flow with per-hop latency/failure.
- SM-2 revision queue with due cards; weak-concept view from attempts; AI-generated exercises validated against schema and tagged as generated.

**M8 — Hardening & deployment**
- Load test of API + AI path with documented limits; p95 targets agreed.
- Security review (OWASP checklist, dependency audit, authz tests, prompt-injection suite).
- Dockerized services, env-based config, health/readiness endpoints, graceful shutdown, structured logs + request IDs end-to-end; one-command local up; CI/CD pipeline; backups + rollback documented.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Content authoring bottleneck | Vertical slice; strict template; authoring checklist; lint in CI |
| Sim quality inconsistent | Shared engine (§9); one design review gate per sim |
| AI hallucination/trust | Mechanical citation validation + eval gates (§8) |
| LLM cost abuse | Auth required, quotas, caching of identical retrievals, model tiering |
| Sandbox escape | No server-side execution in v1; browser isolation; later microVM provider |
| Licensing/attribution | Original content; video links only; check licences of anything reused |
| Three-runtime ops load | Docker Compose locally; modular monolith; defer K8s |

---

## 13. Decisions I need from you

1. **Vertical slice (6 chapters) vs. broad coverage first?** Default: vertical slice.
2. **Primary lesson language:** TypeScript/Node only (default), or also Go/Python tabs?
3. **Embedding + rerank providers:** default = adapters with an API embedding model and local cross-encoder; need your budget/privacy preference.
4. **Playground execution:** browser-only sandbox through M7 (default) — OK to defer real server execution?
5. **Canonical YouTube playlist URL** for attribution.
6. **Deployment target** for M8 (default: Vercel for web; container host for API/AI + managed Postgres with pgvector).
7. **Approve the Part 0 and Part F reordering** and the Tier assignments in §2.

*On approval I begin Milestone 2.*
