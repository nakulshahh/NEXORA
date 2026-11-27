# NEXORA: Status, Remaining Work, and Ideas

*Backend Engineering, Beyond Frameworks.* Snapshot after Milestone 8 (2026-11-22).

---

## 1. Where we are

| Milestone | Scope | State |
|---|---|---|
| M1 | Blueprint: PRD, curriculum (44 chapters, 7 parts), architecture, schemas, RAG design, acceptance criteria | Done, approved |
| M2 | Design system, landing, dashboard, roadmap | Done |
| M3 | Content pipeline and lesson reading experience | Done |
| M4 | Simulation engine and three labs | Done |
| M4b | Content sprint: chapters 0.1, 0.3, A4 (6 lessons) | Done |
| M9a | Content sprint 2: A5–A7, B1–B4 (14 lessons, measured on real PostgreSQL) | Done |
| M5 | Auth, database, server-side progress | **Done** (see 3.2); real GitHub/Google round trip still to verify after deploy |
| M6 | AI Professor (zero-cost, extractive, cited) | **Done** (see `docs/AI.md`; sbert model and hosting memory unmeasured) |
| M7a | Spaced-repetition revision (SM-2), weak-lesson view | **Done** (`/revise`, synced) |
| M7b | Architecture builder (8 components, latency + failure injection) | **Done** (`/playground/architecture`) |
| M7c | Event-loop playground (whitelist parser, model vs browser run, sandbox) | **Done** (`/playground/event-loop`); not a general code editor |
| M8 | Hardening and deployment | **Done** in the sandbox (see 3.4); nothing is deployed yet, Docker images unbuilt here |

---

## 2. What is built

### Product surface
- **Landing page**: scroll-driven story, hero request-lifecycle loop (decorative, labelled as such), curriculum preview, live labs section.
- **Roadmap**: all 7 parts and 44 chapters, tier filter, prerequisite highlighting, search, progress states. Chapters without lessons are shown honestly as outlines.
- **Dashboard**: continue/resume, recommended next (from the prerequisite graph), progress ring, streak grid, recent activity. Every number comes from real local state. Revision is shown as "not built".
- **Lessons (16 authored, 7 chapters)**: 0.1 (what-a-backend-is, anatomy-of-a-request), 0.2 (names-and-addresses, tcp-handshake, tls), 0.3 (io-models-and-threads, the-node-event-loop), A1 (http-messages, methods-status-headers, cors), A2 (routes-are-a-table, order-specificity-and-edge-cases), A3 (text-bytes-and-json, binary-formats-and-schemas), A4 (passwords-and-sessions, tokens-and-authorization). Code samples and predict-the-output answers were run in real Node.
  - Fixed six-section template: Why it exists, How it works, Common mistakes, Trade-offs, In production, Check yourself.
  - Outline with scrollspy, reading progress bar, chapter lesson list, previous/next, callouts, Shiki-highlighted code with copy, HTML/CSS sequence diagrams, embedded real simulations.
  - At least 3 exercises per lesson, of at least 2 kinds, built around real misconceptions.
  - Selection toolbar ("Ask about this") that captures the quote; the AI itself is not connected and the UI says so.
  - Companion panel: Ask / Notes / Sources (video links with attribution, primary sources).
- **Search** (`/` or ⌘K): chapters and full lesson text, jumps to the section.
- **Labs (3 live)**, at `/labs/http`, `/labs/dns`, `/labs/event-loop`:
  - Play, pause, step, previous, reset, 0.5–4× speed, scrubber.
  - 4–6 parameters each; the timeline is recomputed on change.
  - Shareable state in the URL; annotation per step; screen-reader live narration and full transcript.
  - Reduced-motion step mode; dark mode; mobile verified.
  - Each lab lists what it simplifies.

### Engineering
- Monorepo (pnpm): Next.js 16, React 19, TypeScript, Tailwind v4, Motion.
- **Content as code**: MDX with a strict zod schema. A validator fails the build on bad frontmatter, missing or misordered sections, unknown components, broken internal links, bad exercises, code fences without a language, and prerequisite cycles. It reports every error at once.
- **Honest progress**: a lesson is done only when every exercise is answered correctly; a chapter completes when all its lessons do. Derived, never set by a button. Attempts are kept.
- **Simulation engine**: pure `scenario(params, seed) -> Step[]`, seeded RNG, no DOM or clock. URL input is validated and clamped.
- **Event-loop model verified against real Node**: each program's JavaScript is run in real Node by the tests and the model's output must match line for line.
- **Accounts and sync (M5)**: `apps/api` with email/password, GitHub and Google sign-in, server sessions, progress merge. The browser only talks to the Next.js origin (`/api/*` is proxied), so the API host is swappable.
- **Tests**: 54 web tests + 54 API tests (real Postgres); a Playwright smoke script for the labs (68 checks); CI workflow (secret scan, content check, typecheck, tests, build, migrations on a clean DB).
- **`docs/LEARNING.md`**: Phases 0–6 written as a long tutorial (rationale, complexity, trade-offs, rejected alternatives, check-your-understanding).

---

## 3. What is left

### 3.1 Content (the largest remaining effort)
- **All 44 chapters now have lessons (74 lessons).** Labs, shared rate limiter, password reset and builder load model are done. Remaining: semantic tutor measurement (your machine), verification report, then Phase 2.
- Priority order: Tier 1 chapters next: A5 (Validation), A6 (Controllers, services, middleware); then Part B storage and caching (B1–B3, B6).
- **Planned labs not built**: Scan vs B-tree (B3), Cache hit/miss/evict (B6), Session vs JWT (A4).
- The event-loop lab sits inside lesson 0.3/02. A2, A3 and A4 have no dedicated lab yet (they use sequence diagrams and tables); planned: Router matching trace, Byte-level view, Session vs JWT.

### 3.2 M5: Auth, database, progress (done)
- **Built:** Express 5 API on Postgres (Drizzle + SQL migrations, see `docs/adr/0001`); email/password (Argon2id), GitHub and Google OAuth behind a provider interface; hashed-token server sessions, device list, logout-everywhere, delete account; CSRF (SameSite + Origin allow-list + JSON-only); rate-limited auth routes; progress API with monotonic, idempotent merge; anonymous-to-account import on first sign-in; web sign-in/sign-up/account pages and a local-first sync agent. 54 API tests on real Postgres plus a browser run of the whole flow.
- **Not done, on purpose or for lack of an email provider:** email verification (password reset is built; it needs a mail adapter to actually send); 2FA/passkeys; a generated web client (the small client in `apps/web/src/lib/auth.ts` is hand-written; the OpenAPI spec exists and is checked against the running app); a server streak API (streaks are still computed from synced events).
- **Verify after first deploy:** a real GitHub and Google sign-in (the sandbox could not reach those providers; the flow is tested with a scripted provider).

### 3.3 M6: AI Professor (done, differently from the original plan)
Built zero-cost and extractive instead of provider-backed: hybrid retrieval (Postgres full-text + pgvector), cited extracted sentences, refusal when the lessons do not cover a question, Ask tab wired. See `docs/AI.md` and ADR 0003 for measured quality and known limits. Not built from the original plan: streaming, LLM provider adapters, the 100-question golden set (we have 62 questions) and the CI quality gate beyond a regression floor.

### 3.3b M7: Playgrounds, revision, advanced
- ~~Code playground~~ **Done (M7c) as a restricted event-loop playground**: no Monaco, no general code. Verified in Chrome only.
- ~~Architecture builder~~ **Done (M7b)**: 8 component types, per-hop latency, failure injection, 500-request statistics. No capacity/queueing model (see docs/LEARNING.md Phase 9).
- ~~SM-2 spaced repetition queue~~ **Done (M7a).** Weak view is per lesson (exercises carry no concept tag). AI-generated exercises are not built.
- ~~Free-form event-loop snippets~~ **Done (M7c).**

### 3.4 M8: Hardening and deployment: **Done**
- **Security review** (`docs/SECURITY-REVIEW.md`): OWASP Top 10 and LLM-risk mapping with a test behind every claim; 5 findings, all fixed (malformed-Referer 500 in the CSRF guard, AI migrations missing from non-editable installs, sandbox inheriting page CSP, log leakage, dev-only esbuild advisory). `pnpm audit` and `pip-audit` clean.
- **Tests added:** API authorization/CSRF/isolation suite with a route-table drift guard (32 tests), AI prompt-injection and hostile-input suite (33 tests), request-id tests on both services.
- **Observability:** request ids end to end (API → AI), JSON logs on both services with no PII, graceful shutdown verified by SIGTERM on both.
- **Web:** production CSP and security headers; the playground sandbox is its own document with a deny-all CSP (ADR 0004). Verified in Chrome on the production build.
- **Packaging:** Dockerfiles for web/api/ai, `docker-compose.yml` for the whole stack, `scripts/smoke.sh`. **Images were not built here (no Docker daemon)**; each step was reproduced by hand and the smoke script passes against the equivalent non-container stack. CI's `docker` job is the first real build.
- **Load test** (`docs/LOAD-TEST.md`): measured on a 2-vCPU shared box with 0 errors: DB-backed API reads ~690 rps, AI gateway ~290 rps; p95 targets written down; failure drills (429, 504 on a hung AI service, 503 on a dead one).
- **Operations** (`docs/OPERATIONS.md`): runbook, rollback, expand/contract migrations, secret rotation, symptom table. **Backup/restore drill verified** on real data (`scripts/backup.sh`, `scripts/restore.sh`).
- **CI/CD:** audit and docker jobs, weekly schedule, Dependabot, Render `autoDeployTrigger: checksPass`.

### 3.5 Known limitations right now
- Signed-out progress lives in `localStorage` (per browser). Signed-in progress syncs to the account; conflicting un-marks of "known" chapters across devices are last-writer-wins.
- Notes, AI answers and revision are placeholders with honest copy; none pretend to work.
- Lab latencies are simple models, not measurements (stated in each lab).
- The event-loop lab models CommonJS and settled promises only.
- The Playwright smoke script is not in CI (needs a browser binary).
- The nested `Seq` diagrams scroll horizontally inside their box on phones (by design, no page overflow).
- Project exists in the cloud sandbox; the Desktop copy comes from the delivered archives. Nothing is on GitHub yet.

### 3.6 Decisions still open (from the blueprint, still on defaults)
- Canonical video playlist URL (links currently go to individually verified videos; the playlist was never supplied).
- ~~Deployment target~~ **Decided:** Vercel (web), Render (API and AI service), Neon (Postgres + pgvector). See `docs/DEPLOY.md`.
- LLM provider(s) and embedding model for M6, and a per-user quota policy.
- ~~OAuth providers~~ **Decided:** GitHub, Google and email/password.
- ~~Repository visibility~~ **Decided:** public. **Licence: MIT.**

---

## 4. Ideas that would make NEXORA distinctive

Grouped by how well they build on what already exists. "Fit" notes the reason it is realistic here.

### 4.1 Make the simulations the product
1. **Predict-then-reveal mode.** Before each step, the learner commits to a prediction (which queue runs next? which server is asked next?). The lab scores the prediction against the model and logs it as an attempt. *Fit:* scenarios are already pure step lists, so the "answer" exists for free.
2. **Bring-your-own snippet, checked against real Node.** In M7, let learners paste restricted code; run it in the sandbox *and* the model and show where they disagree. A diff of model vs. reality teaches more than either. *Fit:* the oracle test already does this offline.
3. **Break it on purpose (fault injection).** Sliders for packet loss, a slow database, a cold cache stampede, an expired certificate; the HTTP lab shows how latency and errors propagate. *Fit:* parameters and seeded randomness already exist.
4. **Compare two worlds side by side.** Pin two parameter sets (keep-alive vs. new connection) and play them in sync with a live latency diff. *Fit:* URL state already encodes a full scenario, so a comparison is two URLs.
5. **Replayable "incident" labs.** Short scripted failures (thread-pool starvation from `dns.lookup`, connection pool exhaustion) where the learner diagnoses from the timeline. *Fit:* lessons already mention these failure modes.
6. **Real trace import.** Paste a HAR file or `curl -w` timing output and replay your own request through the HTTP lab. Great for the "why is my API slow" question.

### 4.2 Learning science, grounded in real data
7. **Misconception-driven remediation.** Each wrong answer maps to an authored misconception (the catalogue is already in frontmatter). Show the specific belief that answer implies, link to the exact section, and schedule that misconception, not just the question, for review.
8. **Confidence-weighted answers.** Ask "how sure are you?" before checking. Confidently wrong answers are scheduled far sooner. Cheap to add to the existing Exercise component.
9. **Prerequisite-aware recommendations.** Use attempt history plus the prerequisite DAG to say "you missed three questions that depend on ARP/TCP framing, revisit 0.2/02 first". No LLM needed.
10. **Transfer problems.** After a lab, generate a variant with new parameters ("now with 200 ms RTT and keep-alive, what is the first-byte time?") answered from the model, so the answer is verifiable, never invented.

### 4.3 Systems and HFT flavour (fits your direction)
11. **Latency budget lab.** Build a request path from components with microsecond-level costs (syscall, copy, context switch, cache miss) and see where a budget goes. Pairs naturally with your systems work.
12. **Order-book / matching-engine lab** as an advanced chapter, reusing the same engine: step through limit-order matching with price-time priority. Connects the platform to the MiniExchange project as a showcase.
13. **Tail-latency explorer.** Show p50/p99 of the same system under queueing (coordinated omission, head-of-line blocking). Seeded simulation makes the distributions reproducible.
14. **Kernel-level views for the network chapters.** Packet capture style views of the TCP and TLS lessons (flags, sequence numbers, retransmits) driven by the same step lists.

### 4.4 AI Professor, done carefully
15. **Answers that show their evidence.** Every answer lists the exact lesson sections used and highlights them in the page; if retrieval confidence is low the Professor says so and offers a related lesson instead of improvising. (Already the stated design; the highlight-in-page part is the extra.)
16. **"Explain my mistake" on exercises**, grounded only in the authored explanation and the chosen distractor's misconception.
17. **Socratic mode.** The Professor asks one guiding question before answering, switchable per user.

### 4.5 Community and credibility
18. **Verified-correct badges per lesson.** Each lesson lists which claims are checked by tests (for example "this output was reproduced in real Node 22"). Rare, and fits your accuracy-first approach.
19. **Public, shareable lab links** (already technically done) with an "embed this lab" snippet for blogs.
20. **Progress portfolio.** A public page of completed chapters and lab states (opt-in), usable alongside your resume.
21. **Contribution path for lessons.** Because content is validated like code, others can submit a lesson as a pull request and get instant feedback from CI.

### 4.6 Quality-of-life
22. **Offline reading** (service worker caching lessons and sim code).
23. **Keyboard-first mode**: jump between sections, run labs, and answer exercises without the mouse.
24. **Per-lesson "five-minute version"** for revision, generated from objectives plus the "Check yourself" answers (kept deterministic, no LLM).
25. **Theme-aware printable lesson sheets** for exam preparation.

### 4.7 Suggested next picks (highest value for effort)
- Predict-then-reveal (1), misconception-driven review (7) and confidence weighting (8): small additions, large learning gain, no new infrastructure.
- Fault injection (3) and side-by-side comparison (4): extend labs you already have.
- Verified-correct badges (18): turns the existing test discipline into a visible differentiator.

---

## 5. Recommended order from here

1. ~~Author chapters 0.1, 0.3, A2, A3, A4~~ **Done** (16 lessons, enough for M6 retrieval tests).
2. ~~M5~~ **Done.** Next: push to your GitHub repo, deploy per `docs/DEPLOY.md`, verify real OAuth.
3. **M6** (RAG and Professor), once there are roughly 15 or more authored lessons for meaningful retrieval tests.
4. Add two or three ideas from 4.7 alongside M5/M6.
5. ~~M7~~ ~~M8~~ **Done.** Next is yours: push, deploy, then run `scripts/smoke.sh` and the load test against the live URLs, and verify real OAuth.

*Sources of truth in the repo:* `docs/BLUEPRINT.md` (plan and acceptance criteria), `docs/LEARNING.md` (why each piece is built the way it is), `packages/content/lessons/` (the lessons), `apps/web/src/sim/` (the engine).

## Phase 2 (done)
- **Break-it Lab** `/labs/break-it` and **Concurrency Arena** `/labs/concurrency` are built, tested and verified in the sandbox. See `docs/PHASE2-REPORT.md`.
