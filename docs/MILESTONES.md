# NEXORA: milestones, what is left, and ideas

*Backend Engineering, Beyond Frameworks.* Snapshot: 2026-11-23, after Milestone 8. Details live in `docs/STATUS.md`, `docs/IMPLEMENTED.md` and `docs/LEARNING.md`.

## 1. Done

| # | Milestone | What you get |
|---|---|---|
| M1 | Blueprint | PRD, 44-chapter curriculum in 7 parts, architecture, data schemas, RAG design, acceptance criteria |
| M2 | Design system and shell | Landing page, roadmap, dashboard, dark/light theme |
| M3 | Content pipeline | MDX lessons with a validator (frontmatter, sections, links, prerequisite cycles), reading experience, exercises |
| M4 | Simulation engine and labs | Deterministic seeded engine and three labs (HTTP request path, DNS/TCP/TLS, event loop) |
| M4b | Content sprints | 16 lessons across 7 chapters (0.1, 0.2, 0.3, A1, A2, A3, A4) |
| M5 | Accounts and sync | Email/password plus GitHub and Google OAuth, hashed-token sessions, Postgres, cross-device progress merge |
| M6 | AI Professor | Zero-cost, no model: hybrid retrieval (full-text plus pgvector), extractive answers, always cited, refuses when the lessons don't cover the question |
| M7a | Spaced-repetition revision | SM-2 scheduler, due queue, weak-lesson view, synced across devices |
| M7b | Architecture builder | Drag-and-drop components (client, CDN, load balancer, API, cache, DB, queue, worker) with latency and failure injection |
| M7c | Event-loop playground | Write a small program, predict, compare your guess with the model and a real sandboxed run |
| M8 | Hardening and deployment | Security review (5 findings fixed), request IDs, JSON logs, CSP, Dockerfiles and compose, load test, backups and restore drill, CI audit and docker jobs, ops runbook |

Tests: web 129, API 99, AI 60, all passing.

## 2. Left to do

### Your actions (cannot be done from the sandbox)
- [ ] Push to GitHub (`bash scripts/make-commits.sh`, then `git push`)
- [ ] First real build of the Docker images (CI's `docker` job, or `docker compose up --build` locally)
- [ ] Deploy: Neon, then Render (API and AI), then Vercel (web), following `docs/DEPLOY.md`
- [ ] Verify real GitHub and Google OAuth round trips
- [ ] Run `scripts/smoke.sh` and `scripts/loadtest.mjs` against the live URLs, and revise the p95 targets
- [ ] Do one restore drill against Neon
- [ ] Measure MiniLM (`EMBEDDER=sbert python apps/ai/scripts/bench.py`) before ever enabling it

### Content (the biggest job)
- **30 of 44 chapters have no lessons yet.** Next by priority: A5 Validation, A6 Controllers/services/middleware, then Part B storage and caching (B1 to B3, B6), then the rest of the curriculum.
- Planned labs not built: Scan vs B-tree (B3), Cache hit/miss/evict (B6), Session vs JWT (A4), Router matching trace (A2), Byte-level view (A3).

### Known gaps in what exists
- No email verification or MFA (password reset added in M14; needs a mail adapter)
- Rate limiter is per instance, so it must move to a shared store before scaling to several API instances
- AI refusal leaks on topic-adjacent out-of-scope questions (71% of out-of-scope refused on the held-out set)
- Architecture simulator has no capacity, queueing, retries or timeouts
- Playground is a restricted subset of JavaScript, not a general editor; sandbox verified in Chrome only
- Notes tab, AI-generated exercises and streaming answers not built
- Render free tier sleeps (about 30 s cold start)

## 3. Extra features worth adding

Ordered by value for effort. Every item builds on something already in the code.

### Quick wins (small, high learning value)
1. **Predict-then-reveal in the labs.** Commit to a prediction before each step; scored against the model and logged as an attempt.
2. **Misconception-driven review.** A wrong answer maps to the authored misconception, links to the exact section, and schedules that misconception for review.
3. **Confidence-weighted answers.** "How sure are you?" before checking; confidently wrong answers come back sooner in SM-2.
4. **Prerequisite-aware recommendations.** "You missed three questions that depend on TCP framing, revisit 0.2/02 first", using attempt history plus the prerequisite graph.
5. **Verified-correct badges.** Each lesson lists which claims are reproduced by tests (for example "output reproduced in real Node 22").

### Simulation features
6. **Fault injection in the labs:** packet loss, slow database, cache stampede, expired certificate.
7. **Compare two worlds side by side** (keep-alive vs new connection) with a live latency diff; a comparison is just two scenario URLs.
8. **Incident labs:** thread-pool starvation, connection-pool exhaustion; diagnose from the timeline.
9. **Real trace import:** paste a HAR file or `curl -w` timings and replay your own request.
10. **Capacity and queueing in the architecture builder** (finite workers, queues that fill, timeouts and retries), which also unlocks tail-latency demos.

### Systems and HFT flavour
11. **Latency budget lab** at microsecond scale (syscall, copy, context switch, cache miss).
12. **Order book and matching-engine lab,** linking the platform to your MiniExchange project as a showcase.
13. **Tail-latency explorer:** p50 vs p99 under queueing, coordinated omission, head-of-line blocking.
14. **Packet-capture views** for the TCP and TLS lessons (flags, sequence numbers, retransmits).

### AI Professor
15. **Highlight the cited passage in the lesson page** when you click a citation.
16. **"Explain my mistake"** on exercises, grounded only in authored explanations.
17. **Socratic mode:** one guiding question before the answer.
18. **Plug in a local open-source LLM** behind the existing answer layer, only after measuring that it fits the hosting.

### Community and polish
19. **Public progress portfolio** (opt-in) to link from your resume.
20. **Embeddable lab snippets** for blogs, and a lesson-contribution path through pull requests, since CI already validates content.
21. **Offline reading** (service worker), **keyboard-first mode**, **five-minute revision sheets**, **printable lesson sheets.**

## 4. Suggested order from here
1. Push to GitHub and deploy (a few hours, and it validates everything marked unverified).
2. Author A5 and A6, plus the Session vs JWT lab.
3. Add features 1 to 3 (predict-then-reveal, misconceptions, confidence): little code, large learning gain.
4. Part B content and the Scan vs B-tree and Cache labs.
5. Capacity and queueing in the architecture builder, then the HFT-flavoured labs.
