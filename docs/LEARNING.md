# NEXORA — LEARNING.md

Append-only tutorial for Harsh. Every implementation task adds an entry: what it does, where (file:line), why this structure, complexity, benefits, drawbacks, rejected alternatives, link to earlier phases, and check-your-understanding questions. Kept in sync with the code.

---

## Phase 0 — Blueprint decisions (Milestone 1)

No code yet. These are the design decisions the code will rest on. Source: `docs/BLUEPRINT.md`.

### 0.1 Simulations as pure `(params, seed) -> Step[]` (BLUEPRINT §9)

**What:** A simulation is a pure function that returns the *entire* timeline up front. A generic player walks an index through it.

**Why this pattern:** It is event sourcing in miniature. Play, pause, step, step-back, reset, seek and speed all become operations on an array index, so they are free and identical for every sim. Determinism (seeded RNG) makes sims unit-testable, shareable by URL, and reset-safe.

**Complexity:** Precomputing is O(n) time/space in steps; stepping, seeking and reset are O(1). Fine for hundreds of steps. Not suitable for unbounded simulations (e.g. a load balancer under continuous traffic) — those need a bounded window or a streaming generator; we will cap steps per scenario.

**Benefits:** testability, back-stepping, accessible transcript (the step list is the screen-reader text).
**Drawbacks:** parameter change recomputes the timeline; very large timelines cost memory.
**Rejected:** (a) per-sim imperative animation loops — inconsistent controls, no step-back, untestable; (b) running a stateful simulator live — can't seek backwards without snapshotting (you would rebuild this design anyway).

**Check your understanding**
1. Why does step-back cost O(1) here but O(n) for a live simulator without snapshots?
2. What breaks if the scenario function reads `Math.random()` directly?
3. A "load balancer" sim has no natural end. How would you bound it without losing determinism?

### 0.2 Why Prisma doesn't own the vector schema (BLUEPRINT §1.3, §7.2)

**What:** App tables live in Postgres schema `app` (Prisma). RAG tables live in schema `rag` owned by the Python service with raw SQL.

**Why:** Prisma has no first-class `vector` type (it needs `Unsupported(...)` plus raw queries), so ORM type-safety is lost exactly where the interesting queries (HNSW ANN, `ts_rank_cd`, RRF) happen. A separate schema and DB role also gives a clean ownership/permission boundary between services.

**Complexity of retrieval:** HNSW ANN query ≈ O(log n) average with tunable recall (`ef_search`); GIN full-text lookup ≈ O(k log n) for k matching postings; RRF fusion is O(N log N) over N candidates (N ≈ 50 — negligible).

**Drawbacks:** two data-access styles; cross-schema joins avoided on purpose (the API passes lesson slugs, not row IDs).
**Rejected:** a dedicated vector DB (extra infra, no transactional consistency with content versions); pgvector via Prisma raw queries (works, but splits ownership of one table family across two services).

**Check your understanding**
1. What does RRF do that "average the two scores" doesn't, and why do cosine and `ts_rank` scores not combine directly?
2. Why store `embedding_model` on every chunk?
3. If you changed embedding dimension from 1024 to 768, which objects must change?

### 0.3 Citation validation is mechanical, not prompted (BLUEPRINT §8)

**What:** After the LLM answers, code checks that every cited `chunk_id` was actually retrieved and every quoted span is a verbatim substring of that chunk.

**Why:** A prompt is a request, not a guarantee. A validator turns "never fabricate references" into an invariant you can test: citation validity must be 100% in the eval suite.

**Complexity:** O(total quote length × chunk length) naive substring; trivial at these sizes.
**Drawbacks:** verbatim-substring checking rejects correct paraphrased quotes; mitigated by asking for short quotes plus separate claim→chunk citation.
**Rejected:** LLM-as-judge only (non-deterministic, can be fooled by the same failure mode it checks).

**Check your understanding**
1. Which failure does the validator *not* catch (a real chunk cited for a claim it doesn't support)? How does the faithfulness eval cover it?
2. Why must recommended lesson slugs be validated against the curriculum table rather than trusted from the model?

### 0.4 Why a vertical slice (BLUEPRINT §1.1)

Competitive-programming analogy: don't solve all problems at 60% — solve the ones you can solve fully. Content authoring dominates cost, so depth on six chapters beats thin coverage of twenty-seven; the stubbed roadmap keeps scope visible without cost.

---


## Phase 1 — Milestone 2: identity, shell, landing, roadmap, dashboard, lesson foundation

Code: `apps/web`. Stack as approved (Next.js App Router, Tailwind v4, Motion, Lucide). No shadcn and no React Flow: nothing needed them yet, and an extra dependency is a cost you pay forever.

### 1.1 One identity, one moving thing: "signal on substrate"
**What:** Light = paper and ink, dark = near-black. Exactly one loud colour (`--signal`, orange) is reserved for "the packet": the thing in motion. Cool `--trace` marks wires already travelled. Tokens live in `src/app/globals.css:1-60`, exposed to Tailwind via `@theme inline` (`globals.css:49`).
**Why this pattern:** semantic CSS variables swapped by `data-theme` mean components never mention light or dark. Dark mode costs zero per-component code, and the sims inherit it for free (they only use `var(--signal)` etc.).
**Complexity:** O(1) per component; theme switch is one attribute write plus a repaint.
**Drawbacks:** a variable-driven palette hides contrast bugs until you test both themes (I did; text pairs were computed, see BLUEPRINT §10).
**Rejected:** `dark:` variants on every class (doubles class lists, easy to forget one); a CSS-in-JS theme object (runtime cost, flashes).

### 1.2 No theme flash: inline script before first paint (`ThemeToggle.tsx`, `themeScript`)
Server HTML cannot know the user's theme. A tiny blocking script in `<head>` sets `data-theme` before the first paint; the toggle uses `useSyncExternalStore` so React reads the DOM attribute instead of duplicating it in state (single source of truth). Cost: a ~200-byte synchronous script. Rejected: reading theme in a `useEffect` (guaranteed wrong-theme flash).

### 1.3 The hero as a pure step list (`viz/httpSteps.ts:21`)
`buildHttpSteps(opts) -> Step[]` is a pure function; the component just walks an index. This is the shape the M4 engine will formalise (BLUEPRINT §9, Phase 0.1). Toggling "DNS cached" or "Redis hit" simply rebuilds the list, so the waterfall, log and wires all stay consistent because they derive from the same array. Complexity: rebuild O(n), n ≈ 12.
**Check:** why does a pure list make "step back" trivial?

### 1.4 Moving the packet without re-rendering (`HeroHttp.tsx:67`)
A 60 fps animation cannot go through React state: 60 renders a second for a 2-pixel move. Instead `animate(0,1,{onUpdate})` calls `path.getPointAtLength(...)` and writes the `transform` attribute directly via a ref. Cost per frame: one `getPointAtLength` (roughly O(path complexity), tiny for a quadratic Bézier) and one attribute write. Drawback: imperative DOM code that React does not know about, so it must be isolated and cleaned up (`return () => c.stop()`). Rejected: animating `cx/cy` through React state; CSS `offset-path` (browser support and no easy "stop at the node edge" trim).
**Trim:** the packet travels from `TRIM` to `len - TRIM` along the path so it halts at a node's edge instead of covering its label. Found by looking at a screenshot, not by reading code.

### 1.5 Scroll-linked storytelling (`landing/Iceberg.tsx:32`)
`useScroll({target, offset})` yields a MotionValue; `useTransform` maps it to per-layer opacity. MotionValues update outside React's render cycle, so a long scroll does not re-render the tree. Under `prefers-reduced-motion` the section drops its 300vh pin and shows every layer statically.

### 1.6 Route curtain only on client navigations (`RouteCurtain.tsx:4`)
`template.tsx` remounts on every navigation. A module-level counter lets the first mount (full page load) skip the curtain, so the LCP is never hidden behind an animation; later mounts show a CSS-only curtain (`globals.css:105`), which also never blocks input (`pointer-events: none`). `useLayoutEffect` flips state before paint so there is no flash of the new page first.

### 1.7 Local progress store with `useSyncExternalStore` (`lib/progress.ts:40`)
A module-level cache plus a listener set; the server snapshot is a constant `EMPTY`, which keeps hydration consistent. `chapterState` (`:56`) derives locked/ready/known from the prerequisite graph on demand rather than storing it, so it can never go stale. `streakOf` (`:64`) is O(days) with a `Set` lookup per day. **Honesty rule:** nothing in M2 can set `completed`; the only writable states are "visited" and the learner's own "I already know this". The dashboard therefore shows real zeros, not invented numbers. Rejected: Zustand/Redux (a dependency for 60 lines), `useState` + `useEffect` reading localStorage (hydration mismatch, no cross-tab sync).
**Check:** why is "locked" derived instead of stored?

### 1.8 Roadmap: prerequisites as highlighting, not a graph (`roadmap/RoadmapExplorer.tsx`)
`transitivePrereqs` (`data/curriculum.ts`) is a DFS with a visited set: O(V+E) for 44 nodes. Selecting a chapter lights its ancestors and direct dependents on a plain vertical list. A node-and-edge graph looks impressive but reads worse than a list at 44 nodes, and the brief said usability first. React Flow stays reserved for the M7 architecture builder, where users actually edit a graph.

### Bugs found by running it (worth remembering)
1. Packet hidden behind node cards: SVG under HTML nodes. Fix: second overlay SVG after the nodes.
2. Packet covered node labels. Fix: trim path ends (1.4).
3. A hydration error that was only a stale dev cache; `rm -rf .next` cleared it. Lesson: when an error mentions code that no longer exists, suspect the build cache before the code.
4. Copy said "Six parts" while the data had seven (Part 0 plus A–F): numbers in prose should be computed from data or reviewed.

### Check your understanding
1. Why is `MotionConfig reducedMotion="user"` not enough on its own for the pinned scroll section?
2. What invariant does the `EMPTY` constant protect during hydration?
3. If you added Redis to the hero path between server and DB, which file changes and which do not?

---

## Phase 2: Milestone 3, content as code, and the lesson reading experience

**What this phase adds.** Lessons are now files (`packages/content/lessons/<chapter>/<NN>-<slug>.mdx`), validated by a script that CI runs, compiled to pages at build time, and tracked by a progress store that can finally set `completed` honestly. Six lessons are authored (0.2: names-and-addresses, tcp-handshake, tls; A1: http-messages, methods-status-headers, cors).

**The one idea to keep:** *treat content like code.* A lesson that breaks the template, links to a page that does not exist, or has an exercise whose answer index is out of range should fail a build, exactly as a type error does. A competitive programmer already thinks this way about test data: a bad checker is worse than no checker.

### 2.1 A validator instead of conventions (`apps/web/scripts/content.ts:63`, `parseLesson`)
`node scripts/content.ts check` parses every `.mdx` with `unified` + `remark-parse` + `remark-mdx` + `remark-gfm` into an AST (a tree of typed nodes: headings, code, links, `mdxJsxFlowElement`). One walk over the tree (`walk`) collects headings, exercise props, `<Sim>` ids, internal links and fence languages, and every rule is a plain check over what was collected. It reports *all* errors at once (`errors[]`) and exits 1 if there are any; fixing one error per CI run is miserable.
- **Why an AST and not regexes:** a regex cannot tell a heading from a `## ` inside a code fence, or a link from link-shaped text in an example. The parser already solved that.
- **Complexity:** O(total characters). Whole corpus parses in well under a second; it is not a bottleneck until thousands of lessons.
- **Frontmatter via zod** (`src/content/schema.ts`): `z.strictObject` rejects unknown keys, so a typo like `objectves:` is an error instead of silently ignored data. The inferred TypeScript type and the runtime check come from one declaration.
- **Benefit:** the authoring contract is executable. **Drawback:** the schema is now something authors must learn; the error messages are the mitigation (`file:line`, what was expected).
- **Rejected:** (a) a JSON-Schema file plus a separate validator, because two sources of truth drift; (b) validating inside `next build` only, because then local authoring has no fast feedback loop; (c) a lint rule per requirement, because the checks need cross-file knowledge (does that chapter exist? is the order contiguous?).
- **Tested for failure, not just success:** `tests/content-check.test.ts` runs the script against a deliberately broken fixture and asserts that each class of problem is reported. A checker that never fails is untested.
**Check:** why must `Exercise` props be JSON-compatible expressions (`options={["a","b"]}`) rather than arbitrary JavaScript?

### 2.2 The prerequisite graph must be a DAG (`scripts/content.ts:47`, `checkGraph`)
Three-colour DFS: unvisited, in-progress (`1`), finished (`2`). Meeting an in-progress node means a back edge, which means a cycle; the path is reported. O(V+E). This is the same cycle detection you use for topological sort, applied to a curriculum: a cycle would make two chapters each "locked" behind the other forever.
**Check:** what extra check would catch a chapter that lists itself as a prerequisite? (Hint: it is already caught; by which case?)

### 2.3 Build-time generated indexes (`src/data/lessons.generated.json`, `search.generated.json`)
`content:build` runs `check` and then emits two JSON files. `lessons.generated.json` is small (titles, headings, exercise ids) and is imported statically, so any page can list lessons without touching the filesystem. `search.generated.json` holds section text and is loaded with a dynamic `import()` only when the palette opens (`CommandSearch.tsx`), so no page pays for it. `predev` and `prebuild` run it, so the indexes can never be stale relative to the MDX.
- **Rejected:** a runtime search service (a server and an index for 6 lessons); a client-side library such as Fuse (a dependency plus tuning for substring matching that `indexOf` already does). Revisit when the corpus is big enough that a linear scan per keystroke costs more than a frame. At 44 chapters of about 2k words that is roughly 100k words; a linear scan of that is still well under 5 ms.

### 2.4 Rendering MDX on the server (`app/learn/[part]/[chapter]/[lesson]/page.tsx:37`)
`compileMDX` from `next-mdx-remote/rsc` compiles each lesson at build time inside a React Server Component; `generateStaticParams` over the lesson index makes every lesson a static HTML page. The client receives HTML plus only the small interactive islands (`Exercise`, `CopyButton`, the shell).
- **A bug worth remembering:** the first build crashed with `participants` being `undefined` inside `<Seq>`. `next-mdx-remote` v6 defaults to `blockJS: true`, which silently *drops* every JS expression attribute (`prop={...}`). The page rendered with empty props rather than erroring. We set `blockJS: false` (`:42`) because the content is repo-authored and CI-validated; `blockDangerousJS` stays on, so even trusted files cannot reach `eval` or globals. Security defaults that fail *silently* are the dangerous kind: found by a minimal repro (`compileMDX` on one line, log the props), not by staring at the page.
- **Second bug, same area:** my remark plugin built `<CodeBlock mark={[1,2]}>` nodes by hand. A hand-built expression attribute has no `estree` (the parsed JS the compiler needs), so the generated function had a syntax error. Fix: pass only string attributes and parse `"1,2"` inside the component (`lib/remark-code.ts`, `CodeBlock.tsx`). Lesson: when you synthesise AST nodes, you take over obligations the parser normally fulfils.

### 2.5 Syntax highlighting happens at build time (`components/lesson/mdx/CodeBlock.tsx:7`)
A server component awaits a single cached Shiki highlighter (`hl ??=` memoises the promise, so concurrent pages share one) and uses `codeToTokens` to get coloured tokens per line, then renders them itself, so line numbers and highlighted lines (`mark=5,6`) stay under our control. The browser downloads zero highlighting code. M2's hand-written tokenizer is gone; it mis-coloured anything past a toy example.
- **Cost:** loading grammars is the slow part of the build (hundreds of ms once), then each block is microseconds. **Drawback:** one dark theme in both light and dark mode, which is a deliberate design choice (code blocks stay a dark "instrument panel"); a dual-theme output would double the token CSS for no reader benefit.

### 2.6 Sequence diagrams in plain HTML/CSS (`components/lesson/mdx/Seq.tsx:8`)
Participants are grid columns; a message is an absolutely positioned line whose `left` and `width` are percentages computed from the column centres (`(i + 0.5) / n`), so the diagram scales with its container with no JavaScript and no layout measurement. An `sr-only` ordered list repeats the messages as text, because the drawing itself is `aria-hidden`. On narrow screens the figure scrolls horizontally *inside its own box* (`min-width: n * 8.5rem`), so the page never overflows.
- **Rejected:** Mermaid (a large runtime, client-side rendering, hard to style to the design system); inline SVG with computed text widths (text measurement in SVG is the classic source of clipped labels).

### 2.7 Exercises and honest progress (`lib/progress.ts:65`, `answerExercise`; `components/lesson/mdx/Exercise.tsx`)
Each answer is recorded as `{attempts, correct}`. A lesson is **done when every exercise has been answered correctly at least once**; a chapter is **completed when all its authored lessons are done** (`:72`). Both are *derived inside the same write*, never set by a button, which is what makes the dashboard number trustworthy. A wrong first answer is still counted: `attempts` is never reset, so the Professor in M6 can later see where a learner struggled.
- **Event log:** one `"lesson"` activity event per completion, not per answer (`justDone = done && !cur.done`), so re-answering cannot inflate the streak or the feed.
- **Scroll progress is monotonic** (`setScroll`, `Math.max`): scrolling back up must not "un-read" a lesson.
- **Drawback:** answers live in `localStorage`, so they are per browser. That is stated in the UI, and M5 syncs them to an account.
- **Tests:** `tests/progress.test.ts` drives the store in memory (no DOM), including "wrong then right keeps both attempts", "chapter completes once, only when every lesson is done", and "one event per lesson".
**Check:** why is `lessons[...].done` recomputed from `lessonExercises` on every answer instead of incremented?

### 2.8 Selection toolbar and the companion panel (`components/lesson/LessonShell.tsx`, `selectionchange` at `:65`)
`selectionchange` fires many times per drag, so the handler is debounced (120 ms) and then checks that both the anchor and focus nodes are inside the article (otherwise selecting nav text would pop a button). The floating button uses `onMouseDown={e => e.preventDefault()}` so clicking it does not collapse the selection before the click handler reads it. It places the quote in the Ask tab and states plainly that the Professor ships in M6; no fake answer is generated.
- **Keyboard/AT note:** the selection button only appears for pointer selections; the companion tab is still reachable by keyboard, and M6 will add a keyboard path ("ask about this section" per heading).

### 2.9 Content decisions (what the lessons teach, and why)
- Every lesson follows the same six sections (`REQUIRED_SECTIONS`), enforced in order by the validator, because a consistent template is what lets the Professor retrieve "the Trade-offs section of lesson X" in M6 without guessing.
- Each lesson has at least 3 exercises of at least 2 different kinds, written around *misconceptions*, with the wrong options being the beliefs real learners hold. The `misconceptions` frontmatter is the authored source the Professor will classify against.
- Videos appear only as `watch` links with channel attribution; no transcript or paraphrase of any video is reproduced.

### Bugs found by running it
1. `blockJS` silently stripping expression attributes (2.4).
2. Hand-built MDX nodes with no `estree` (2.4).
3. YAML frontmatter with an unquoted `:` in a title (`TLS: confidentiality…`) crashed the validator with a stack trace. Fix: report YAML errors as ordinary validation errors, and quote titles. A tool for authors must never crash on author mistakes.
4. A `\"` inside an MDX string attribute is a syntax error (MDX strings do not process escapes). Rule: use typographic quotes in prompts, or JSON expression attributes.

### Check your understanding
1. Why is "done = every exercise answered correctly at least once" better than "done = scrolled to the bottom"? What would it let a learner do to cheat, and does that matter in a local-only store?
2. The validator walks the AST once and collects everything. What would you change if a rule needed *two* passes (for example, "every concept named in `concepts` appears in the body")?
3. `search.generated.json` is lazy-loaded. At what corpus size would you move search to the server, and what would you need to keep the same interface?
4. Why does `parseLesson` return `null` after a frontmatter failure instead of continuing to check the body?

---

## Phase 3: Milestone 4, a simulation engine you can test

**What this phase adds.** Three labs (HTTP lifecycle, DNS resolution, Node event loop) built on one engine: a pure scenario function produces a list of steps; a shared player and shell turn any step list into play/pause/step/prev/reset/speed controls, a scrubber, annotations, a screen-reader transcript, and a shareable URL. Views only *draw* a step.

**The one idea to keep:** *a simulation is a function, not an animation.* `scenario(params, seed) -> Step[]` is pure, so it is testable like any competitive-programming solution: same input, same output; property checks over every parameter combination; and an oracle. The oracle for the event loop is real Node.

### 3.1 Scenario = pure function of (params, seed) (`src/sim/engine.ts:1`)
A `Step` carries `{id, label, explain, state, ms}`. `state` is a full snapshot, so "previous" and "scrub to step 7" are array indexing, O(1), with no undo logic. Reset is `index = 0`. The cost is memory: each step copies its state (tens of steps, a few hundred bytes each). Rejected: an event-sourced "apply/undo" player (needs every transition to be invertible, and one bug corrupts all later steps) and re-running the simulation up to step k on each seek (O(k) per seek, and hard to keep deterministic with animation state).
- `rng(seed)` is mulberry32: 32-bit integer arithmetic with `Math.imul`, deterministic across machines. No `Math.random`, no `Date` anywhere under `src/sim`; a test greps for it, because purity that is only a convention rots.
**Check:** why must the event-loop scenario snapshot `S.timers.map(x => ({...x}))` rather than push `S.timers` itself? (A test, "states are snapshots, not shared references", catches the mistake.)

### 3.2 Parameters and URL state (`engine.ts` `parseParams`, `toQuery`; `SimShell.tsx`)
The URL is untrusted input. `parseParams` keeps only known keys, checks select values against the allowed list, rounds ranges to their step and clamps to `[min, max]`; anything else falls back to the default. Only non-default values are written back (`toQuery`), so the default lab has a clean address and links stay short. `history.replaceState` is used instead of `pushState`: sharing a link should not make the Back button step through slider drags. The server renders defaults; the URL is read once in an effect after hydration, because reading `window.location` during render would cause a hydration mismatch.
**Check:** a user opens `?step=999&rtt=-5&evil=1`. Walk through what each part of that query becomes.

### 3.3 The player is a tiny state machine (`components/sim/usePlayer.ts`)
State: `index`, `playing`, `speed`. One timer effect advances `index` after `1600 / speed` ms and stops at the last step. Re-running the effect on every change of `index` (instead of `setInterval`) makes speed changes and pause take effect immediately and removes drift. When the step list shrinks (a parameter change), the index is clamped in an effect. **Reduced motion = step mode:** autoplay is disabled and the Play button is disabled with an explanation, rather than playing a slower animation.

### 3.4 Modelling DNS (`src/sim/dns.ts`)
Freshness is a real comparison: a cached answer is used only if `age < ttl`; at `age >= ttl` the model emits an "expired" step and then performs the same walk as a cold cache (a test asserts those two timelines are equal apart from the notice). A CNAME makes the resolver start a second full walk for the alias target, which is why CDN-fronted sites have slower cold lookups. The "What this simulation simplifies" list says that real resolvers also cache referrals (so the second walk would usually skip the root); the model deliberately does not.
- **Complexity:** the number of steps is O(hops), at most about 25. Everything is computed on every parameter change, which costs microseconds.

### 3.5 Modelling the HTTP lifecycle (`src/sim/http.ts`)
Latency is a transparent model: a new HTTPS connection costs two round trips (TCP, then TLS 1.3) before the request; keep-alive removes both; a cache hit skips the database; a cold DNS lookup is one round trip split in two. Tests assert *relationships* rather than magic numbers: each optimisation is strictly faster than the baseline, the handshake is exactly `2 × RTT`, and only a cache miss reaches the database. Relationship tests survive retuning of constants; snapshot tests would not.

### 3.6 The event loop: a model checked against real Node (`src/sim/eventloop.ts`, `tests/sim.test.ts`)
The interpreter implements, in order: run the main script; drain `process.nextTick` fully, then microtasks fully, and repeat until both are empty (Node's `processTicksAndRejections`); then loop over **timers** (all timers due at the current virtual time, ordered by due time then creation), **poll** (ready I/O callbacks, or *wait* until the next timer or I/O if nothing else is pending), and **check** (`setImmediate`). After every callback it drains ticks and microtasks again.
- **Virtual clock.** Callbacks cost 0 ms; "startup work" and "I/O duration" are parameters. A `setTimeout(cb, 0)` is due at `now + 1`. This is how the model explains the famous nondeterminism: if startup took at least 1 ms the timer wins, otherwise the immediate does. Real Node varies, so the model exposes it as a parameter and the test pins both outcomes.
- **Why it matches inside an I/O callback.** The loop is in the poll phase, and check comes right after poll, so `setImmediate` always precedes the next timers phase. A test asserts this for several I/O durations.
- **The oracle.** The test writes each program's JavaScript source to a temp file, runs it with `process.execPath` (real Node), and asserts the model's console output equals the real output line for line. Programs with nondeterministic order are flagged `deterministicInNode: false` and tested through the parameter instead. This is the strongest test in the project: if my understanding of Node were wrong, it would fail.
- **Honest limits** (shown in the UI): CommonJS only (ES module top level runs inside a microtask), settled promises only (no chained `.then`), no pending-callbacks or close phases, one thread-pool completion per read.
- **Rejected:** executing user code in a sandbox and instrumenting it. It would model Node *itself* only if we ran Node; in the browser we would model V8 plus a different event loop. Writing an explicit model and testing it against the real thing is smaller, safer and teaches the structure.
**Check:** which line of the `nested` program's output would change if the interpreter drained all microtasks *before* all ticks? Predict it, then flip the order in `drain()` and watch the oracle test fail.

### 3.7 Accessibility of a moving picture
The visual stage is decorative to assistive technology; the *content* is the annotation plus a live region (`role="status"`, polite) announcing "Step n of N: label. explanation", and a full transcript in a `<details>` where each entry jumps to that step. The stage is focusable and handles ArrowLeft/ArrowRight/Home/End/Space, only when the stage itself has focus, so it never steals keys from the sliders. Radio groups are real `role="radiogroup"` with `aria-checked` buttons; a select (used when there are more than four options) is not wrapped in a radiogroup, which a first version got wrong.

### Bugs found by running it
1. A purity test matched the words "Date" and "Math.random" inside *comments*. Fix: strip comments before scanning. Tests that police code must parse enough of it.
2. The first smoke run failed on DNS because choosing a warm cache shrinks the timeline to 3 steps, so "ArrowRight after step 3" cannot advance. The test, not the app, was wrong, and it showed that tests must pick a scenario long enough for what they assert.
3. The event-loop lab overflowed a 390px screen: grid children default to `min-width: auto`, so a long code line stretched the column. Fix: `minmax(0, 1fr)` columns and `min-w-0` children. The same trap shows up in every CSS grid that contains `pre`.
4. A `<select>` inside an element with `role="radiogroup"` is invalid ARIA; the label also pointed at the wrong element. Fixed by rendering the two control types separately.

### Check your understanding
1. Why is "previous step" free here but would be hard in an event-sourced design? What does the snapshot design cost instead?
2. Pick one relationship test from `tests/sim.test.ts` (for example "a new HTTPS connection costs exactly two round trips") and say what bug it would catch that a fixed expected-output snapshot would not.
3. The oracle test runs real Node. What breaks if CI runs a different major Node version than the one the model was written against, and how would you detect it?
4. Why does `toQuery` omit default values, and what happens to old shared links if you change a default later?


---

# Phase 4: Content sprint (chapters 0.1, 0.3, A4)

**What this phase is.** No new engine code. Six lessons were authored through the Phase 2 pipeline: `0.1/01-what-a-backend-is`, `0.1/02-anatomy-of-a-request`, `0.3/01-io-models-and-threads`, `0.3/02-the-node-event-loop`, `a4/01-passwords-and-sessions`, `a4/02-tokens-and-authorization` (all under `packages/content/lessons/`). The corpus goes from 6 to 12 lessons, 5 of 44 chapters. Why now: M5 (server progress) and M6 (RAG) need real material to be tested against; a RAG system over 6 lessons proves nothing.

## 4.1 Content as a test input
`pnpm content:check` (Phase 2, `apps/web/scripts/content.ts`) is the compiler for lessons. Authoring is the "workload"; the validator is the test suite. Each lesson needs ≥3 exercises of ≥2 kinds and the six H2s in order. **Complexity:** validation is O(total lesson size); trivial. **Benefit:** a mistake in lesson 12 fails CI exactly like a type error. **Drawback:** the validator checks structure, not truth. Truth is checked by running the code.

## 4.2 Verifying claims by running them
Every code sample and every "predict the output" exercise was executed in real Node 22 before being kept: the counter server (`visits` 1, 2), the nextTick/promise/timeout/immediate order, the `await` ordering (C, A, B), scrypt hash/verify. This is the same idea as Phase 3's "verify the event-loop model against real Node". **Rejected alternative:** trusting memory of the rules. The timer-vs-immediate race is the proof: it is nondeterministic from the main script, so the lesson says so and the exercise avoids it. **Check:** why does the exercise ask about the I/O-callback case instead of the main-script case?

## 4.3 Bugs found
- YAML again: an objective containing `State the order: ...` parsed as an object (a colon inside an unquoted list item). The validator caught it. Rule: quote any list item containing a colon.
- An exercise prompt read badly ("CPU use is not mentioned in any profile"); rewritten. Reading the rendered page, not only the source, is part of the check.

## 4.4 Honest scope notes
- A4 prerequisites include A3 (serialization), which is not authored yet; the chapter page still builds because prerequisites come from the curriculum graph, not from lesson files.
- A4 has no "Session vs JWT" sim; the lesson uses `Seq` diagrams and does not pretend otherwise.
- The JWT code is a teaching sketch and says so; real systems use a maintained library.

## 4.5 Check your understanding
1. Why is `timingSafeEqual` used instead of `===` when comparing hashes or signatures?
2. A microtask that reschedules itself starves I/O; a timer that reschedules itself does not. Why?
3. Sessions versus JWTs: which has the lookup, which has the revocation problem, and what hybrid do many systems use?
4. Why does the ownership-check handler return 404 instead of 403 for another user's invoice?


---

# Phase 5: Accounts, database and sync (Milestone 5)

**What this phase adds.** A second program, `apps/api` (Express 5 + Postgres), that owns identity and saved progress; sign-in pages and an account page in the web app; and a sync agent that keeps the browser's local progress and the server's copy in step. It is the first time NEXORA has *state that outlives a browser tab*, so almost every decision is about one question from lesson 0.1: **what may we trust, and where does the truth live?**

Prior phases it builds on: the progress document and `localStorage` store (Phase 2, §2.x), the "pure function, easy to test" instinct (Phase 3), and the lesson content you wrote about sessions, JWTs and IDOR (Phase 4, chapter A4). This phase *implements* what those lessons describe.

```
Browser ──► Next.js origin ──(/api/* rewrite)──► Express ──► Postgres
```

## 5.1 The browser only talks to one origin (`apps/web/next.config.ts:13`)

**What:** `rewrites()` forwards every `/api/*` request from the Next.js server to the Express service (`API_ORIGIN`).

**Why:** The session cookie must reach the API. If the web app were on `nexora.vercel.app` and the API on `nexora-api.onrender.com`, those are different *sites*; browsers treat the cookie as third-party and increasingly drop it unless it is `SameSite=None; Secure`, and every call would need CORS. With the proxy, the browser sees one origin: the cookie is first-party, there is no CORS, and **moving the API to another host is one environment variable**. This is the "avoid vendor lock-in" requirement turned into an architecture.

**Complexity:** one extra network hop (Vercel → Render) per API call, about one round trip of latency between two data-centres. **Benefits:** simplest cookie security, host independence. **Drawbacks:** the Next.js server is now in the request path (its availability and timeouts matter); OAuth callback URLs must use the *web* origin. **Rejected:** direct cross-origin calls with CORS and `SameSite=None` (fragile under browser privacy changes), and a dedicated reverse proxy (one more thing to run).

**Check:** why does the OAuth callback URL point at the Vercel domain even though Express handles it?

## 5.2 Drizzle + plain SQL migrations instead of Prisma (`apps/api/src/db/schema.ts`, `docs/adr/0001`)

**What happened:** the blueprint said Prisma. In the build sandbox, Prisma could not download its native engine (the host was blocked), so it could neither generate a client nor migrate. Rather than ship code I could not run, I switched to **Drizzle ORM** on the `pg` driver. `drizzle-kit generate` turns the TypeScript schema into a readable SQL file (`apps/api/drizzle/0000_init.sql`); `src/db/migrate.ts` applies it.

**Why this is the better trade even outside the sandbox:** (1) pure JavaScript, so identical on a laptop, in CI and on Render; (2) migrations are plain SQL you can review and run on any Postgres; (3) M6 needs `pgvector`, which Drizzle models natively and Prisma does not.

**Benefits/drawbacks:** less magic and more control (good for a backend course), but no auto-generated client, so relations are explicit. **Complexity** of migrations: each file runs once, recorded in a bookkeeping table; the runner is O(number of new migrations). **Lesson:** a tool that needs to phone home at build time is a portability risk. Prefer tools that run offline.

**Check:** why must a migration runner record which files it already ran?

## 5.3 Configuration that fails fast (`apps/api/src/config.ts:29`)

**What:** every setting is read from environment variables and validated with zod *once at startup*. Missing `DATABASE_URL`, a short `COOKIE_SECRET` or an `http://` web origin in production makes the process refuse to start, with a readable message.

**Why:** a server that starts with a bad config and fails on the first user request is the worst failure mode: it passes the deploy health check and breaks later. Crashing at boot is cheap and visible. OAuth providers are *optional by construction*: a provider turns on only when both its id and secret exist, and the sign-in page lists only enabled ones (so the UI never shows a button that cannot work).

**Rejected:** reading `process.env.X` all over the code (untyped, unvalidated, untestable). Config is also an argument (`createApp({cfg, db})`), not a global, which is why tests can build an app with whatever settings they want.

## 5.4 Passwords: Argon2id, and equal work for unknown emails (`src/auth/password.ts:7`, `:17`)

**What:** passwords are hashed with **Argon2id** (19 MiB memory, 2 passes, 1 lane, the OWASP minimum). The hash string embeds its own parameters.

**Why memory-hard:** an attacker with a stolen table uses GPUs; GPUs are fast at computation but have little memory per core. Forcing 19 MiB per guess collapses their advantage. A legitimate login pays it once (tens of ms).

**Why parameters live inside the hash:** you can raise the cost later; old hashes still verify, and you can re-hash on login. No migration.

**Timing equalisation:** `dummyVerify` hashes against a throwaway hash when the email is unknown. Without it, "no such user" returns in 1 ms and "wrong password" in 40 ms, so an attacker learns which emails exist from response time alone. Login also returns one identical message for both cases (tested).

**Password policy:** minimum 10 characters, maximum 128 (a max prevents someone sending 10 MB to burn CPU in the hash), a tiny common-password list, no composition rules (NIST 800-63B: length beats symbols). **Complexity:** O(1) per login, but deliberately expensive: that cost is also why login is rate limited.

**Check:** why is a *maximum* password length a security feature?

## 5.5 Sessions: store the hash of the token (`src/auth/sessions.ts:17`, `:24`)

**What:** at login the server makes 32 random bytes, sends them in an `HttpOnly; Secure; SameSite=Lax` cookie, and stores only `SHA-256(token)` in the `sessions` table. A request carries the cookie; the server hashes it and looks it up.

**Why hash it:** if the database leaks (backup, SQL injection, a curious admin), the attacker gets hashes, not usable cookies. A fast hash (SHA-256) is fine here, unlike for passwords, because the token has 256 bits of randomness, so there is nothing to brute-force.

**Two expiries:** an absolute 30-day limit (`expires_at`) and a 14-day idle limit (`last_seen_at`). `last_seen_at` is updated at most every 5 minutes, so a busy user does not cause a write on every request.

**Session fixation:** `startSession` (routes.ts) always issues a *new* token at login and deletes any cookie token the browser sent. If an attacker planted a known session id in the victim's browser before login, it dies at login (tested: "issues a fresh token at login and invalidates a planted one").

**Public id:** each session also has a separate random `public_id`, used to list and revoke devices. It is *not* the secret; knowing it lets nobody act as that session.

**Benefits:** instant revocation (delete the row), "sign out everywhere", a device list. **Drawbacks:** one indexed lookup per authenticated request (about 1 ms; the row is joined with the user). This is the sessions-vs-JWT trade from chapter A4 made concrete: we chose the side with revocation because NEXORA is one app with one database.

**Check:** why is SHA-256 acceptable for session tokens but not for passwords?

## 5.6 CSRF: three layers (`src/auth/middleware.ts:38`)

**What:** every `POST/PUT/DELETE` must (1) carry an `Origin` header (or `Referer`) from the allow-list, and (2) if it has a body, be `application/json`; and the cookie is (3) `SameSite=Lax`.

**Why each layer:** `SameSite=Lax` stops browsers sending the cookie on cross-site POSTs. The Origin check stops requests from other sites even if a browser ignores SameSite. The JSON requirement exists because an HTML `<form>` can only send form encodings, so it cannot forge a JSON body without a CORS preflight, which we do not allow. No single layer is trusted alone.

**Rejected:** synchronizer tokens (a per-session secret echoed in a header). Correct but more moving parts, with no extra protection once Origin is enforced. **Note:** `GET` requests never change state here (the OAuth *start/callback* are GETs that redirect and create sessions; they are protected by the signed state cookie, below).

**Check:** a request arrives with a valid session cookie but no `Origin`. What does the server return, and why is that safe for real browsers?

## 5.7 OAuth done carefully (`src/auth/oauth.ts`, `routes.ts:116`, `users.ts:25`)

**The flow (authorization code):** `/start` makes a random `state` (and a PKCE verifier), stores them in a **signed, HttpOnly, 10-minute cookie**, and redirects to the provider. The provider redirects back to `/callback?code&state`. We require `state` to match the cookie (binding the callback to *this browser*, which defeats login-CSRF), exchange the code for the user's profile, and create a session.

**Port and adapters:** the rest of the app depends on the small `OAuthProvider` interface (`authorizationUrl`, `exchange`), not on a library. GitHub and Google are two objects; a third is one more object; tests use a scripted fake (`tests/helpers.ts`) so the whole flow, including failures, runs with no network.

**Only trust verified emails:** GitHub's public profile email is user-controlled and unverified; we call `/user/emails` and accept only a *primary and verified* address. Google's ID token has `email_verified`. With no verified email we refuse (`no_verified_email`) because we cannot tell who this is.

**Account linking and pre-hijacking (the interesting bug class):** suppose an attacker registers `victim@x.com` with a password they choose (we do not verify email). Later the real victim signs in with Google. If we simply link Google to that account, the attacker still knows the password and still owns a way in. Our rule (`resolveOAuth`): when the existing account was created by password sign-up and its email was never verified, **delete the password and revoke all its sessions**, then link. The person who just proved ownership through the provider keeps the account; the attacker is locked out. This is tested end to end ("pre-hijack defence").

**Open redirect:** `safeNext` only accepts same-site paths (`/learn`), rejecting `//evil.com`, `https://…`, and backslash tricks, since `next` is user-supplied and used in a redirect.

**Check:** why do we compare `state` to a cookie instead of just generating it and trusting the callback?

## 5.8 Progress merge: a join that is safe to repeat (`src/progress/repo.ts:30`)

**The problem:** the same learner may use two devices, and an anonymous learner's progress must not be lost at sign-in. A naive "last write wins" would let a stale tab erase a finished lesson.

**The rule:** every field merges with a function that is **commutative, associative and idempotent** (a *join* in a semilattice, the idea behind CRDTs): `done`/`correct`/`completed` = OR; `scroll` = max; `attempts` = max; events = set union (de-duplicated by a unique index). Consequences you can test: merging A then B equals B then A; merging the same document twice changes nothing; progress never goes backwards. All three are tests.

**Why `attempts = max`, not sum:** a sum is *not* idempotent. Re-sending the same document would inflate the count, and a retry after a network blip would be a bug. Max can undercount when two devices both tried independently, which is an acceptable, documented loss compared with double counting.

**The one non-monotonic field: `known`** (chapters the learner marked "I know this"). A learner can *un*-mark, and a union can never delete. So it has modes: `union` on the first import, `replace` on later pushes (last writer wins), and `keep` on page load (ignore the client's possibly-stale list and return the server's). Without `keep`, an un-mark done on your laptop would be resurrected by your phone's stale copy at the next load.

**Complexity:** a merge is a few multi-row upserts inside one transaction: O(lessons + exercises + events) with bounded sizes (500 lessons, 2000 exercises, 200 events, 256 KB body). The newest 200 events are kept by a single delete-by-subquery. **Rejected:** per-action API endpoints with sequence numbers (more code and more ways to be inconsistent for a document this small); a single JSON blob column (can't query per-lesson data for M6/M7 analytics and revision).

**Input is untrusted:** the zod schema (`src/progress/model.ts`) bounds ids with regexes, scroll to 0..1, attempts to ≥0 and caps every collection; the unit tests include path-traversal-looking ids and negative numbers, and check that *nothing* was written on rejection (the transaction never starts).

**Check:** why does `attempts = GREATEST(...)` make a retried request safe, and which merge function would make it unsafe?

## 5.9 The sync agent: local-first (`apps/web/src/lib/sync.ts:37`, `:51`, `:69`, `:91`)

**Design:** the UI keeps reading `localStorage` through the same store as before, so the app is instant and works offline. `SyncAgent` (mounted once in `Shell`) asks "who am I?" and, for a signed-in user, (1) merges the local document into the account and replaces the local copy with the result, then (2) pushes later changes, debounced by 1.2 s, with exponential backoff (2 s doubling to 30 s) on failure. The account page shows the real state: syncing, up to date, offline or failed. A failed identity check does **not** sign you out in the UI; a network blip must not look like a logout.

**Shared-computer safety:** a flag stores *which user's* data is in local storage. At sign-in, data belonging to a different user is cleared before the merge, and sign-out clears local progress entirely, so account A's progress can never flow into account B on a shared browser. (The data is safe in the account; the account page says so.)

**Why the push does not overwrite local with the response:** the user may have clicked again while the request was in flight; applying a slightly older server copy could erase that click. Only the load-time pull replaces local state.

**Complexity:** a push sends the whole document (a few KB to tens of KB) at most once per debounce window. **Drawbacks:** whole-document pushes do not scale to megabytes of state; fine here. **Rejected:** websockets/real-time (no collaborative editing need), service-worker background sync (browser support and complexity).

**Check:** what would go wrong if `replaceProgress` also notified the push listeners?

## 5.10 Ownership, and why it is 404 (`src/auth/routes.ts:100`, `src/progress/routes.ts`)

Progress routes have **no id in the URL at all**: the owner is always the session's user, so there is no identifier an attacker can change. Where an id exists (sessions), the query is `WHERE user_id = me AND public_id = :id`, and a miss returns **404**, identical for "does not exist" and "belongs to someone else". A 403 would confirm that the object exists. This is the IDOR defence from the A4 lesson, with a test that proves Bob cannot revoke Alice's session and cannot tell whether the id was real.

## 5.11 Testing against real Postgres (`apps/api/tests/`)

54 tests, none mocked at the database. The properties worth testing are *in* SQL: unique indexes (five simultaneous registrations of one email yield exactly one user), cascades (deleting a user removes sessions and progress), and `GREATEST`/OR upserts. A mock would only verify that we called the mock. The OAuth provider *is* faked (it is a network call to a third party), behind the port from §5.7.

## 5.12 Honest limits (also in `docs/adr/0002-auth-design.md`)
- No email verification or password reset (needs an email provider). OAuth verifies email through the provider.
- The login rate limiter is in memory, per instance. Correct for one instance; a shared store is needed when scaled out.
- Registration reveals "email taken" (without email verification there is no other truthful answer).
- No 2FA/passkeys yet.
- OAuth round trips with real GitHub/Google could not be run in the sandbox (no network to them); the flow is tested with a scripted provider, and the real exchange code is small and typed. First real sign-in is the thing to verify after deploying.

## 5.13 Bugs and surprises
- Prisma could not run in the sandbox (§5.2).
- `lucide-react` no longer ships brand icons; the GitHub mark is inline SVG.
- The post-login default `/dashboard` did not exist (the dashboard is `/learn`); caught while reading the redirect code for the browser flow.
- Express type augmentation needed `@types/express-serve-static-core` as a direct dependency under pnpm's strict layout.
- A strict-mode Playwright selector matched Next's route announcer (`role=alert`) as well as the form error; selectors must be specific.

## 5.14 Check your understanding
1. Draw the cookie path from browser to API with the rewrite. Which origin does the browser think it is talking to?
2. A stolen database backup contains the `sessions` and `users` tables. What can the thief do with each, and why?
3. Prove (by example) that `attempts = sum` is not idempotent, and that `max` is.
4. An attacker registers `ada@x.com` with their own password before Ada ever visits. Walk through exactly what happens when Ada signs in with GitHub, and why the attacker loses access.
5. Why does `known` need three merge modes while `scroll` needs none?
6. Where could a request with a valid cookie from `evil.example` still get through, and what stops it at each layer?


---

# Phase 6: Content sprint 2 (chapters A2 and A3)

**What this phase is.** Four more lessons through the Phase 2 pipeline: `a2/01-routes-are-a-table`, `a2/02-order-specificity-and-edge-cases`, `a3/01-text-bytes-and-json`, `a3/02-binary-formats-and-schemas`. Corpus: 16 lessons, 7 of 44 chapters. Purpose: M6 (retrieval) needs a corpus big enough that "did the right lesson come back?" is a real question, and A3 is a prerequisite that chapter A4 already declared.

## 6.1 Every claim was run, and two surprised me
Same rule as Phase 4: code and numbers in lessons are executed before they are kept.
- A 20-line router (A2/01) was run for the 200, 404, 405 and parameter-decoding cases.
- **Express 5 facts were checked on a live server, not recalled:** `/users/:id` registered before `/users/me` answers `me` with `id = "me"` (shadowing); `/Users/42` and `/users/42/` both match by default; a POST to a path with only a GET route returns **404, not 405**. The last one is what many people assume the opposite of, so the lesson says so and a quiz question tests it.
- `"héllo 👋"` has `length` 8, 11 UTF-8 bytes and 7 characters (A3/01). JSON of `{d: Date, u: undefined, nan: NaN}` drops `u` and turns `nan` into `null`; `12345678901234567890` parses to `12345678901234567000`.
- The protobuf walkthrough (A3/02) is a real encoding: `{id:150,name:"ada"}` is `08 96 01 12 03 61 64 61`, 8 bytes against 23 for the JSON text. The varint encoder in the lesson produced `01` for 1 and `ac 02` for 300.

**Why this matters for a learner:** a lesson that is wrong is worse than no lesson. Running the examples is the cheapest possible peer review.

## 6.2 Bugs found by the validator
- A YAML list `[…, 404, 405, …]` parsed those as *numbers*, and the schema requires strings. Quote numeric-looking concepts.
- `\"` inside a **string** attribute (`prompt="…{\"total\"…"`) is an MDX syntax error (already noted in Phase 2); inside a JSON **expression** attribute (`options={["a\"b"]}`) it is fine. The rule: string attrs cannot escape quotes, expression attrs can.
- Chapter-order errors (`got 2`) were a side effect of the first lesson failing to parse; fix the parse error first. Errors cascade.

## 6.3 A measurement worth distrusting
A Playwright run reported 4 px of horizontal overflow on `/learn` at 390 px. Re-running four times, with and without waiting, gave 0 every time. Entry animations transform elements, so measuring `scrollWidth` at the instant of `networkidle` can catch them mid-flight. When a layout check fails once and never again, investigate the *measurement* before the layout.

## 6.4 Check your understanding
1. Why does first-match-wins make route *order* part of the API's behaviour? Give an example where reordering two lines changes a response.
2. A request for `/files/..%2F..%2Fsecret` reaches your handler. What did the router do to the parameter, and what must the handler do?
3. Why must `Content-Length` use `Buffer.byteLength` rather than `string.length`?
4. Encode the number 128 as a varint by hand. How many bytes, and which?
5. Why are retired protobuf field numbers marked `reserved` instead of simply deleted?


---

# Phase 7: The AI Professor (Milestone 6)

*Builds on Phase 4 (Postgres, migrations), Phase 5 (auth: the gateway reuses sessions) and Phase 6 (the lessons are the corpus). You know binary search, tries and inverted indexes from contests; this phase is where those meet a database and a user.*

## 7.1 What a "RAG tutor" really is, with the L removed
Retrieval-Augmented Generation = **retrieve** relevant text, then **generate** an answer from it. We built the first half properly and replaced the second with **extraction**: pick sentences that already exist in the lessons. So the system is a search engine with a very opinionated results page.
- **Why:** zero cost, zero hallucination, every claim traceable. A generator that is wrong 3% of the time is a liability for a *teaching* product.
- **Drawbacks:** answers read like highlights, not prose; it cannot synthesise across lessons or rephrase for a confused learner.
- **Rejected:** a hosted LLM (cost, key, hidden usage); a small local LLM today (RAM on free hosting, and hallucination handling we would have to build first). The `Answerer` interface (`answer.py`) is the seam: swap the implementation later without touching retrieval, API or UI.

## 7.2 Chunking (`chunking.py`, `chunk_lesson`)
Retrieval returns *chunks*, so chunk quality caps answer quality. Rules: split on H2/H3, ≤150 words (split by sentence beyond that), merge fragments under 25 words, never split code, keep "Common mistakes" as `misconception` chunks, and prefix each chunk's index text with "Lesson > Section > Subsection" so a chunk about "Simple requests" knows it belongs to CORS.
- **Complexity:** linear in lesson size; run once per changed lesson.
- **Why heading-based, not fixed windows:** a fixed 200-token window cuts through the middle of an explanation and glues two topics together. Our content is already structured; use the structure.
- **Rejected:** semantic chunking by embedding similarity (needs the model at ingest, harder to debug), sentence-per-chunk (too little context to rank).

## 7.3 Two indexes, one table (`sql/001_init.sql`)
- **Keyword:** `tsv tsvector GENERATED ALWAYS AS (...) STORED` + **GIN**. A GIN index is an inverted index: term → posting list of rows. Query cost ≈ (number of terms × posting list lengths). You have written this on a whiteboard; Postgres ships it. `ts_rank_cd` scores by term frequency *and proximity*; normalisation flag 32 maps the score into 0..1 so our thresholds are meaningful.
- **Vector:** `embedding vector(384)` + **HNSW** (cosine). HNSW is a layered proximity graph: approximate nearest neighbours in roughly O(log n) hops, with a recall/speed knob. At 241 chunks an exact scan would be instant; we build the index anyway because the *schema* should be right before the data grows.
- **Why Postgres for both:** one database to run, back up and migrate; one SQL statement can filter on metadata. **Drawbacks:** a dedicated vector DB scales further and has more features. **Rejected:** Pinecone/Qdrant (cost, extra service).

## 7.4 Embeddings without a model download (`embeddings.py`)
An embedding turns text into a vector so similar meanings are near each other. We ship two behind one `Embedder` protocol:
- `HashingEmbedder`: **feature hashing**. Stem words and bigrams, hash each (`crc32`) into one of 384 buckets with a ±1 sign, add, L2-normalise. No training, no download, deterministic. It captures **shared vocabulary**, not meaning: "car" and "automobile" are unrelated to it.
- `SbertEmbedder`: all-MiniLM-L6-v2, the actual semantic model.
The index stores which embedder built it (`rag.meta`) and refuses to mix them, because comparing vectors from different models is meaningless and gives plausible-looking garbage.
- **Honest limit:** the sbert path is implemented but was *not run* in the sandbox (model host blocked). Its thresholds are provisional until you run `nexora-ai eval` with it.

## 7.5 Fusing two rankings: RRF (`retrieval.py`, `retrieve`)
Keyword scores and cosine similarities are on different scales; averaging them is arbitrary. **Reciprocal Rank Fusion** ignores scores: `score(d) = Σ 1/(60 + rank_i(d))`. A document ranked high in *either* list floats up; one ranked high in *both* floats most. O(k) after the two searches. k=60 is the conventional constant and flattens the head so a single #1 does not dominate. Then small multiplicative nudges: same lesson ×1.10, same chapter ×1.05 (you are reading CORS, so CORS probably is what you mean), summaries ×0.90 (they match everything a bit), and **≤3 chunks per document** so one long lesson cannot crowd out the rest.
- **Rejected:** weighted score sum (needs calibrating two scales), a learned reranker (a model again).
- **Check it:** the eval shows hybrid ≥ either alone on recall@1/MRR, by small margins on small sets. Do not oversell it.

## 7.6 Knowing when not to answer: the evidence gate (`assess`)
Every query retrieves *something*. "Kubernetes ingress" returns the nearest lesson at similarity 0.3. The gate asks: do the question's content stems actually appear in the top passages (coverage ≥ 0.5), and is at least one retriever confident (FTS ≥ 0.1 or cosine ≥ 0.3)? If not: `insufficient_evidence`, no citations, and suggestions only if coverage is decent (otherwise "closest lessons: TLS" for a neural-network question is just wrong).
- **Calibration:** thresholds were grid-searched on the **dev** half of the question set and reported on the **test** half. Dev scored 1.00/1.00; test scored 0.92 answered / 0.71 refused. That drop *is* overfitting, shown instead of hidden.
- **It leaks:** "B-tree index" and "database sharding" are answered because "index", "database", "query" occur in lessons about something else. Word overlap is not topic overlap. A semantic embedder should help; unverified.
- **Trade-off:** raising thresholds refuses more correct questions. For a tutor, a wrong cited answer is worse than a refusal, so ties break toward stricter, but we did not tune further on 7 test items; that would be fitting noise.

## 7.7 Extractive answers (`answer.py`, `ExtractiveAnswerer`)
Take the top 3 non-misconception passages, split into sentences, score each by the **rarity-weighted** number of question stems it contains (a stem in every sentence tells you nothing: it is IDF over candidate sentences), add a small bonus for a section's first sentence (our lessons lead with the point), penalise worse-ranked passages, drop near-duplicates (Jaccard > 0.6), take ≤3, and **re-sort into lesson order** so the output reads as it was written. A matching misconception chunk is appended as "Common misconception". Test: every answer line is a literal substring of a retrieved passage.
- **Complexity:** O(S·Q) for S sentences and Q query stems; S is tens.

## 7.8 The gateway (`apps/api/src/ai/routes.ts`)
Browser → Express `/api/ai/ask` → FastAPI `/v1/ask`. Why the hop? (1) The AI service has no user concept, so Express enforces sign-in; (2) per-account rate limiting (`keyGenerator` uses the user id, not IP: a classroom shares an IP); (3) the service is protected by a shared `X-Internal-Token` compared in constant time; (4) upstream failures become honest `503`/`504` with no internals. The `AiFetch` port lets tests inject a fake service, including a timeout via `AbortController`.
- **Rejected:** browser → AI service directly (needs CORS, tokens in the client, no sign-in check).

## 7.9 What the browser test proved
Real flow: sign up, ask "What is a CORS preflight request?", get 3 lines + misconception with 3 citations, **every citation link opened a page whose heading id existed** (anchors come from `github_slug`, and I verified them instead of trusting them), an out-of-scope question was refused, and there was no overflow at 390 px.

## 7.10 Hosting honesty
Measured: ~55 MB RSS, p50 4 ms/query with the hashing embedder. **Not measured:** MiniLM RSS/latency. Run `EMBEDDER=sbert python scripts/bench.py` on the target instance before turning it on (details in `docs/AI.md`).

## 7.11 Check your understanding
1. Why does RRF use ranks instead of scores? What breaks if you add a BM25 score to a cosine similarity?
2. A GIN index stores term → rows. Why is a generated `tsvector` column better than computing `to_tsvector(text)` in the query?
3. Why must the index refuse to mix embedders? What would you see if it did not?
4. The gate passed "B-tree index" with coverage 0.60. Propose a check that rejects it without rejecting "How does a session cookie keep me logged in?". What would you measure it on, and why not on the same 14 questions?
5. Dev 1.00/1.00, test 0.92/0.71. Name two things that could explain the gap and one experiment to separate them.
6. An LLM `Answerer` returns a sentence citing passage [4], but only 3 passages were retrieved. What must the validator do?


---

# Phase 8: Spaced-repetition revision (Milestone 7a)

*Builds on Phase 5 (the progress document and its merge rules), Phase 6 (exercises are the cards) and Phase 7 (the same "say what you don't know" honesty).*

## 8.1 What it does
Every exercise you answer inside a lesson becomes a **card**. `/revise` shows the cards that are due, you answer them, and the scheduler decides when each returns: later if you get it right, tomorrow if you miss. A second view ranks lessons by how much their cards have hurt.

## 8.2 SM-2 as a pure function (`apps/web/src/lib/srs.ts`, `schedule`)
Each card has `ease` (growth factor, start 2.5, floor 1.3), `reps` (consecutive successes), `interval` (days) and `lapses`. On a grade `q`:
- `q < 3` (we only emit 1): `reps = 0`, `interval = 1`, a lapse is counted, ease drops 0.2.
- `q >= 3` (hard 3, good 4, easy 5): interval is 1 day, then 6, then `round(interval × ease)`; ease changes by `0.1 − (5−q)(0.08 + (5−q)·0.02)`: **good is neutral, easy +0.1, hard −0.14**.
- Cap at 365 days.
It takes `now` as an argument and never reads a clock or storage. That is why the tests can run a card through 30 reviews instantly. **Complexity:** O(1) per review. **Deviation from original SM-2:** the original leaves ease alone on a lapse; we cut it 0.2 so a card that keeps failing returns more often. **Rejected:** FSRS (better retention in studies, needs fitted parameters and more review history than we have; the blueprint plans to evaluate it later).

## 8.3 When does a card enter the queue? (`progress.ts`, `answerExercise`)
On the **first** answer to an exercise: correct on the first try → graded "good"; wrong → graded as a miss (due tomorrow, *not* a lapse, because you never knew it). Later retries inside the lesson do not reschedule it: the first answer is the honest signal. Progress saved before M7 has answered exercises but no schedule; `missingReviews` seeds those as due *now*, because we do not know when they were answered and will not invent an interval.

## 8.4 Syncing a schedule is not like syncing "done"
Phase 5's fields are *monotonic*: done only goes false→true, scroll only up. A review schedule is not: a lapse makes `reps` go **down** and the due date move **earlier**. So max/OR merging is wrong. We use a **last-writer-wins register per card**: keep the review with the newest `last` timestamp; ties break on (reps, lapses, due, ease) so two devices always pick the same one.
- It is commutative, associative and idempotent (tested), so resending is safe and arrival order does not matter.
- **Drawback:** two devices reviewing the same card offline: the later review wins and the other is lost. For a flashcard that is fine (the loser would have been nearly the same interval); for money it would not be.
- **Server:** table `card_reviews`; one `INSERT … ON CONFLICT DO UPDATE … WHERE (excluded.last, excluded.reps, …) > (card.last, card.reps, …)`. The row comparison is the same ordering as the client. Ease is stored ×100 as an integer so it survives a database round trip exactly (floats would not).
- **Why not `GREATEST` per column:** you would stitch together a `reps` from one review and a `due` from another, a schedule that never existed.

## 8.5 Untrusted data
A review arrives from localStorage and from the network. `sanitizeReviews` keeps only entries with a valid key and every field in range; bad entries are **dropped, not repaired**. The server validates the same bounds with zod. Older clients omit `reviews`; the schema defaults it to `{}`.

## 8.6 The queue and the weak view (`revision.ts`)
`dueCards` = cards with `due ≤ now`, most overdue first, max 20 per session so it stays short. Cards whose exercise was later deleted from the content are skipped. `weakness(card) = (missed first try ? 1 : 0) + 1.5·lapses + 2·(2.5 − ease)`; `weakLessons` sums it per lesson. **Honest limit:** concepts are a *lesson's* concepts, because exercises carry no concept tag, so the page says so rather than claiming per-question concepts.
- **Session behaviour:** a missed card is asked once more at the end as **practice only**; it does not lapse a second time. (Found by running the browser flow: the first version double-counted.)

## 8.7 What the browser test proved
Sign up, answer 4 lesson exercises (4 cards, 1 first-try correct), `/revise` showed nothing due (everything is at least a day out), then with the clock moved forward two days for the whole browser, 4 cards were due, a session ran, and a **second device saw identical schedules**. A first attempt to fake "due" by editing localStorage *failed*: the sync correctly kept the server's later due date. The fix was to move the clock, not to weaken the merge.

## 8.8 Check your understanding
1. Why can't you use `max(due)` or `min(due)` to merge two devices' schedules? Construct a case that breaks each.
2. A device is offline for a week and reviews 10 cards; another reviews 3 of the same cards online. What does the merge keep, and what is lost?
3. Good (q=4) leaves ease unchanged. Compute the interval sequence for five consecutive "good" answers from a fresh card (ease 2.5).
4. Why store ease as an integer ×100 on the server?
5. Why is a wrong *first* answer not counted as a lapse, but a wrong answer in review is?
6. What would you need to measure before replacing SM-2 with FSRS?


---

# Phase 9: The architecture builder (Milestone 7b)

*Builds on Phase 3 (the lab simulation engine: deterministic, pure, testable), Phase 4 (HTTP request lifecycle) and Phase 7 (say what the model leaves out).*

## 9.1 What it does
`/playground/architecture`: drag components (client, CDN, load balancer, API, cache, database, queue, worker) onto a canvas, connect them, send one request and see each hop's timing, or send 500 and see success rate, p50/p95/p99 and which component failures came from. Take a component down and watch what survives.

## 9.2 The model, not the canvas, is the product (`apps/web/src/lib/arch/sim.ts`)
The UI (React Flow) only edits a graph. All behaviour lives in a **pure, seeded** function: `simulateRequest(graph, rand, rr)`. Same graph + same seed = same trace, so it is unit-tested without a browser (21 tests) and a result can be reproduced by sharing the seed. The generator is `mulberry32`, ~5 lines, identical on every machine (`Math.random` is not seedable).
- **Complexity:** one request is a depth-first walk, O(nodes + edges) with a path check for cycles; 500 requests are 500 walks (~milliseconds).
- **Rejected:** a discrete-event simulator with queues and concurrency (the honest next step: it is what shows saturation and retry storms, and it is much more code); recomputing in a web worker (not needed at this size).

## 9.3 The rules, and why each one teaches something
- **Cache-aside:** a hit skips the database; a miss pays the database *and* a write-back. Result: p50 drops a lot, **p99 stays near the miss path**. The tests assert exactly that, because "caching makes it faster" is half the truth; the tail is where users complain.
- **Dead cache is tolerated, dead database is not.** With the DB down and an 80% hit rate the builder showed ~81% success with 100% of the successes being cache hits. That is a real production pattern (stale-but-up) and a real trap (the DB outage is hidden until the cache is cold).
- **Queue is fire-and-forget.** The request pays only the enqueue. A test makes the worker 5000 ms slow and asserts the request latency is *identical*: slow background work does not slow the user, but it does grow a backlog, which this model does **not** show.
- **Load balancer** is round-robin over components that are not down. One of two servers down: 100% success. Both down: 503 at the balancer, and the failure is attributed to the balancer, not the servers.
- **Failure attribution:** the *first* failure on a path is recorded. A dead cache that the API shrugs off is **forgotten** (found while testing: an early version left a stale failure on successful requests).
- **Cycles** are detected by a path stack; a request cannot loop forever.

## 9.4 What it deliberately leaves out
Capacity and queueing delay, retries, timeouts, partial failures, geography, the response's return trip. The page lists this under the canvas. A simulator that hides its assumptions is worse than none.

## 9.5 Untrusted saved layouts
The layout is persisted to `localStorage`, so it is untrusted input on load (`sanitizeSaved`): unknown kinds, duplicate ids, edges to missing nodes, self-loops and out-of-range numbers are dropped or clamped, never repaired. Capped at 40 nodes / 100 edges.

## 9.6 Two bugs the browser test caught (unit tests could not)
1. **The layout never persisted.** The restore effect and the save effect ran in the *same* commit, so the save wrote the default layout over the stored one before the restored state rendered. Fix: a `ready` state set together with the restored nodes; the save effect waits for it.
2. **New nodes landed outside the visible canvas**, making them impossible to connect. Fix: re-fit the view after adding a node or loading a preset.
Also: the first `@xyflow/react` that pnpm resolved had an unfamiliar API (no `applyNodeChanges`); pinned to the well-documented 12.x line instead of coding against something unfamiliar.

## 9.7 Check your understanding
1. Why do p50 and p99 move differently when you add a cache? Derive p99 from the hit rate and the two path latencies.
2. A cache-aside design with the database down shows 81% success. What would a user experience when the cache entries expire? What would you add to detect it?
3. Why is "fire-and-forget" queueing invisible to request latency but not to the system? What metric would reveal the problem?
4. `simulateRequest` takes `rand` as an argument instead of calling `Math.random`. List three consequences.
5. Add a retry (up to 2 times) to the API→database call. Which tests would you change, and what new failure mode appears when the database is merely slow?


---

# Phase 10: The event-loop playground (Milestone 7c)

*Builds on Phase 3 (the event-loop model and the habit of testing it against real Node) and Phase 9 (a pure model, a thin UI).*

## 10.1 What it does
`/playground/event-loop`: write a small program, optionally predict its output, press Run. A table compares **your guess**, **the model of Node's event loop**, and **a real run in your browser**. Disagreements are highlighted. The model's reasoning is listed step by step.

## 10.2 Scope, honestly
The blueprint called this a "code playground". Running arbitrary learner code safely in a browser, in a way that also teaches something, is a much bigger problem than it sounds, so this is deliberately a **restricted language**: `console.log`, `setTimeout`, `setImmediate`, `process.nextTick`, `queueMicrotask`, `Promise.resolve().then`, and async functions with `await`. It cannot read variables, loop, or call anything else. That is a smaller product than "a code editor" and a much safer and more teachable one.

## 10.3 The parser is a whitelist, and it is the main security layer (`lib/playground/parse.ts`)
Acorn parses the source to an AST. We then accept **only** the statement shapes in the grammar comment at the top of the file, with **literal** arguments. Everything else is rejected with a line number and a reason. Properties this gives you, each with a test:
- no identifiers can be read (so no `document`, `fetch`, `localStorage`), no loops, no `eval`, no `import`/`require`, no escape attempts like `globalThis.constructor.constructor(...)`;
- size caps (4000 chars, 200 operations, nesting depth 8, delays ≤ 2000 ms) so a program cannot be a resource bomb;
- async functions that are never called are still validated, and a recursive async function is rejected (the model inlines calls, so recursion would not terminate);
- the same pass produces the model's input (`Op[]`), so what the model simulates is exactly what was validated.
**Why a whitelist and not a blacklist:** a blacklist has to anticipate every dangerous construct; a whitelist has to anticipate every *useful* one, and that list is short and ours.
**Complexity:** one pass over the AST, O(n).

## 10.4 `await` in the model
`await x` pauses only the async function. The parser inlines a call to `f()`: operations before the first `await` run now; everything after becomes one microtask (`via: "await"`), nested again for the next await. `await null`, `await undefined`, a literal and `await Promise.resolve()` all cost one microtask turn in modern V8, which is what the model uses. A test with two sequential awaits matches real Node.

## 10.5 Three layers of isolation for the browser run (`lib/playground/sandbox.ts`)
1. The parser (above).
2. `<iframe sandbox="allow-scripts">` with **no** `allow-same-origin`: the frame has an opaque origin, so no cookies, no `localStorage`, and no access to our page.
3. A CSP inside the frame, `default-src 'none'`: fetch, XHR, WebSocket, images and frames are blocked. *(Update from Phase 11.3: the frame is now its own document with a header-delivered CSP instead of `srcdoc`; same policy, delivered more safely.)* The only allowance is inline script (and `eval`, because we pass the code by `postMessage` instead of splicing it into HTML, which would let a string like `</script>` break out).
The parent also checks that every message comes from that frame's window and carries a random per-run nonce, and removes the frame after a timeout.
**Browser-verified** (Chrome): from inside the frame, `document.cookie`, `localStorage` and `parent.document` all throw `SecurityError`, `location.origin` is `null`, and `fetch` to our own API and to an external site both fail. A 3-second busy loop inside the frame did not delay a 100 ms timer in the parent. **Not verified:** Firefox and Safari, and whether a busy loop would block the main thread in a browser that shares a process between frames. That is why layer 1 forbids loops.
- **Rejected:** a Web Worker created from our own page (it would run with our origin and could `fetch` the API with the user's cookies); running the user's text through `eval` in the page (no).

## 10.6 What "browser run" can and cannot show
Promise and timer ordering follow the same rules in browsers and in Node, so for programs that use only those, the browser run is a real second opinion on the model. `process.nextTick` and `setImmediate` do not exist in browsers. Rather than shim them (a shim's disagreement would be our shim's fault, not the model's), the playground says "Node-only, not run" and shows how to run the program with `node p.js`. The model's agreement with real Node is tested separately: 10 programs, including nested queues, equal-delay timers and async/await, are run in **real Node** by the test suite and compared line by line with the model.

## 10.7 A bug the screenshot caught
The code box used Tailwind classes `bg-code-bg text-code-ink` that do not exist in this project, so it rendered light text on a light page: **invisible code**, with every test green. Fixed by using the project's `.code` class. Lesson: a browser test that checks text content passes on invisible text; look at the picture.

## 10.8 Check your understanding
1. Why is a whitelist parser a stronger first layer than a sandbox alone? What does the sandbox still add?
2. `await null` and `Promise.resolve().then(cb)` both take one microtask turn. Write a program where `await somePromiseThatIsNotResolved` would differ, and say why the playground rejects it.
3. Why does the sandbox receive its code by `postMessage` rather than inside the `srcdoc` HTML?
4. Why not run the user's code in a Web Worker created from the page? What can it do that a sandboxed iframe cannot?
5. The model and the browser disagree on a program that uses only `setTimeout`. List three possible causes, from most to least likely.


---

# Phase 11: Hardening and deployment readiness (Milestone 8)

*Builds on Phase 5 (sessions, CSRF, the limiter), Phase 7 (the AI gateway and service token) and Phase 10 (the sandbox). Nothing here adds a feature. It makes the existing system observable, attackable-in-a-controlled-way, packaged, and recoverable.*

The mindset shift: until now the question was "does it work?". Now it is **"how does it fail, who can see that it failed, and can I get back?"** Two of this phase's five findings were bugs that no feature test could have caught, because they only exist in the *deployed shape* of the code.

## 11.1 Request IDs and structured logs (`apps/api/src/requestId.ts`, `apps/ai/src/nexora_ai/obs.py`)
**What it does.** Every request gets an id. The API accepts a well-formed inbound `X-Request-Id` or mints a UUID, echoes it in the response header, puts it in its log line, and forwards it to the AI service, which logs the same id. A support question becomes "give me the header of the failing response", and you can grep three services with one string.
**Why this shape.** This is *correlation*, the poor man's distributed tracing: one opaque string, propagated by hand. Full tracing (OpenTelemetry) adds spans and timing trees, which is worth it past a handful of services. Here it would be more machinery than the system.
**The security detail you should notice:** the id is validated (`^[A-Za-z0-9._-]{8,64}$`) and *replaced* if it does not match. A log line is an output channel; an attacker who controls a value that lands in it controls your logs (forged entries, injected fields, a line that looks like `"level":"fatal"`). The same instinct as escaping HTML, applied to logs. Both services have a test that sends a hostile id and asserts it is not echoed.
**Structured logs** (one JSON object per line) beat printf-style text because a log system can then filter on fields (`status >= 500`, `userId = ...`) without regex archaeology. **Privacy by omission:** the AI service logs the question's *length*, never its text; the API logs the account id, never the email, and strips query strings (an OAuth redirect carries `?code=...&state=...`). Finding #4 in the security review was exactly that leak.
**Complexity:** O(1) per request. **Drawback:** field names must stay stable or dashboards break; hence the same `reqId` key everywhere.
**Rejected:** OpenTelemetry now (too heavy); logging whole requests for debuggability (it is a liability the day it contains something personal).
**Competitive-programming bridge:** a request id is a *key* into a distributed log; the whole system is a join across three tables on that key.

## 11.2 Health versus readiness, and graceful shutdown
`/healthz` answers "is the process alive?" and must **never** touch the database; `/readyz` answers "can it serve traffic right now?" and does. If they were one endpoint, a 10-second database hiccup would make the platform *restart* a perfectly healthy API, turning a blip into an outage. Graceful shutdown (`SIGTERM` → stop accepting → finish in-flight → close pools → exit) is what lets a deploy replace a running server without dropping requests. Verified by sending `SIGTERM` to both services: the API logs `shutting down` and exits 0; uvicorn logs "Waiting for application shutdown" and the pool closes. In Docker the server must be **PID 1** (`CMD ["node", ...]`, `exec nexora-ai serve`), otherwise a shell wrapper receives the signal and the app is killed hard after the grace period.

## 11.3 Content-Security-Policy, and why the sandbox became its own document (`apps/web/security-headers.ts`, `public/sandbox/`)
**What a CSP is:** a response header telling the browser which origins may supply scripts, connections, frames and so on. It is a *second line*: it does not stop you writing an XSS bug, it limits what the bug can do (no loading `evil.com/steal.js`, no `fetch` to an attacker's server).
**The trap we avoided.** The playground ran user code through `new Function`, which needs `'unsafe-eval'`. It lived in a `srcdoc` iframe, and a `srcdoc` document **inherits the parent page's CSP**. So a strict page policy would have forced eval on the entire app to keep one feature working. The fix is structural: serve the sandbox as a separate URL with its *own* header (`default-src 'none'; script-src 'self' 'unsafe-eval'`). Now the only place eval exists is a document with no network, no storage, and an opaque origin. Verified in Chrome against the production build: from inside the frame `document.cookie` and `parent.document` throw `SecurityError`, `fetch` to our API and to an external site are blocked, a nested frame is blocked, and the page itself cannot be framed (`frame-ancestors 'none'`).
**The honest compromise:** pages keep `'unsafe-inline'` for scripts (Next's bootstrap and our theme script are inline). The strict alternative, nonces, forces every page to render per request and costs static caching. ADR 0004 records the decision and when to revisit it.
**Two small gotchas to remember:** `upgrade-insecure-requests` and HSTS only matter over https, so headers are applied in production only; and the page-CSP route uses a negative lookahead so the sandbox path gets exactly one policy, not two merged ones.

## 11.4 The security test suite (`apps/api/tests/security.test.ts`, `apps/ai/tests/test_adversarial.py`)
**A route table with a drift guard.** One table lists every route as `public` or `auth`; a test greps the route files and fails if a route exists that the table does not mention. Adding an endpoint now forces you to *decide* who may call it. This is the cheapest defence against the most common serious bug (A01, broken access control): the endpoint someone forgot to protect.
**Isolation tests** check the property, not the implementation: user B cannot see, revoke or influence user A's sessions or data, and "not yours" returns 404, same as "does not exist", so there is no oracle to probe.
**Hostile-input tests:** malformed `Referer` (found a real bug: `new URL()` threw, producing a 500 instead of 403, in the CSRF guard), `Origin: null` (what sandboxed iframes send), prefix-match attacks (`http://localhost:3000.evil.example`), wrong content types, oversized and malformed bodies, mass assignment (`role: "admin"` in the register body).
**Prompt injection with no model:** 13 injection strings and 13 hostile shapes (NUL bytes, bidi override characters, SQL fragments, template syntax, 500-character strings, emoji). The strongest test does not check for the absence of bad words; it checks the *positive* property: every line of every answer is a normalised substring of the lesson text it cites. If that holds, the output *cannot* contain injected text, however the question is worded. Prefer properties that make a whole class of bug impossible over blacklists of known bad inputs.
**Complexity:** the suite runs in about 1 s (AI) and 3 s (API) on a real Postgres. **Drawback:** tests encode what we thought of; they are a regression net, not a proof. SECURITY-REVIEW.md lists what remains unverified.

## 11.5 Two bugs that only exist when deployed
**The missing SQL files.** `db.py` found its migrations with `Path(__file__).parents[2] / "sql"`, which works in a repo checkout and in an *editable* install (`pip install -e`), where `__file__` points back into the source tree. A normal `pip install .` copies only the package into `site-packages`, so `sql/` (outside the package) never arrives. `migrate()` looped over zero files, silently succeeded, and `ingest` then failed on a missing table. It was found by doing exactly what Render does: a fresh virtualenv and a plain install. Fix: put data files inside the package and declare them as package data; make `migrate()` **raise** if it finds none (a loop over zero items is a silent success, one of the most dangerous shapes in programming); add a test. **Lesson:** "works on my machine" is often "works in my *layout*". Test the artifact you ship.
**The unguarded `new URL()`.** Any function that parses attacker-controlled text can throw. Wrap it, decide what a failure *means* (here: "no usable origin", which the guard rejects), and test it.

## 11.6 Packaging: three Dockerfiles, one compose file
- **Multi-stage builds:** a build stage with compilers and dev dependencies, a runtime stage with only what runs. Smaller image, smaller attack surface.
- **Layer order is a cache strategy:** copy the manifests, install, *then* copy the source. A source edit no longer re-downloads every dependency. (CP analogy: precompute the expensive, invariant part.)
- **API:** `pnpm deploy --legacy --prod` produces a folder with production dependencies, compiled `dist/` and the SQL migrations only (a `files` allow-list in `package.json`; I checked what happens without it: `dist/` is still included, but so are `src/`, `tests/`, configs and the Dockerfile, so the allow-list is about a smaller, tidier image, not about correctness. I had expected it to drop `dist/` because of `.gitignore`; that assumption was wrong until tested).
- **Web:** Next's `output: "standalone"` traces which files the server needs and emits a self-contained folder, so the image needs no `node_modules` copy. `API_ORIGIN` is a **build** argument because the `/api/*` rewrite is compiled into the build.
- **AI:** a real, non-editable install (the layout that hid bug 11.5) plus the lessons copied in as the knowledge base; an entrypoint script ingests (idempotent) and then `exec`s the server so it is PID 1.
- **Non-root users, `HEALTHCHECK`s, and a compose file** that orders startup (`db` healthy → `migrate` completes → `api`/`ai` → `web`) so `docker compose up --build` is the whole system.
**Honest status:** the sandbox this was written in has the Docker client but no daemon, so **the images were not built here**. Instead, each step was reproduced by hand against the real artifacts: install from manifests only (the cache layer), `pnpm deploy` then run the output with a production env, `pip install` into a clean virtualenv then `nexora-ai ingest` and `serve` with a token, Next standalone with static assets copied in, and the whole chain exercised by `scripts/smoke.sh`. CI's `docker` job is the first true build.

## 11.7 Load testing: what the numbers can and cannot say (`scripts/loadtest.mjs`, `docs/LOAD-TEST.md`)
**Closed versus open loop.** Our generator is *closed-loop*: N workers, each sends the next request when the last returns. That finds capacity but hides tail latency under overload (when the server stalls, so does the generator, so fewer slow requests are *sent*: "coordinated omission"). An open-loop generator sends at a fixed rate regardless. Know which one produced your number.
**Little's law** explains the shape of every row: concurrency = throughput × latency. Throughput stopped rising at roughly 8 to 32 workers and from then on latency grew linearly with concurrency (p50 doubled each time workers doubled). That is a saturated server: a queue in front of one resource. Which resource? The anonymous endpoints do ~5,300 rps and the DB-backed ones ~690, so **Postgres round trips, not Express, are the API's bottleneck**: the first optimisation is fewer queries per request, not more instances.
**Percentiles, not means:** p50 tells you the typical user, p95/p99 tell you who is suffering; budgets (SLOs) are written on p95.
**What we refused to claim.** The reference box has two shared cores with the generator and database on it, so the figures are *relative* (which path saturates first), not Render predictions. The targets in LOAD-TEST.md are labelled as chosen targets to be re-checked on the first deploy.
**Failure drills worth more than throughput:** 25 asks → exactly 20 succeed and 5 get 429; a *hung* AI service (SIGSTOP) → 504 at the configured 2 s timeout; a *dead* one → 503 in 4 ms. A hung dependency is worse than a dead one (it ties up your resources until the timeout), which is why the gateway has a timeout at all.

## 11.8 Backups are tested restores (`scripts/backup.sh`, `scripts/restore.sh`)
A backup you have never restored is a hope. The drill: dump with `pg_dump --format=custom` (excluding the rebuildable `rag` schema), verify the file lists with `pg_restore --list`, restore into a **different** database, compare row counts per table (12 users, 12 sessions, 1,600 events matched), then run the API's migrations on top (a no-op, as it should be). `restore.sh` refuses to run without `CONFIRM=yes`. Backups contain emails and password hashes, so they are secrets: encrypted at rest, git-ignored.
**Rollback and migrations:** application rollbacks are easy because code is replaceable; database rollbacks are hard because data is not. Hence *expand, migrate, contract*: ship additive schema first, remove old shapes releases later, so the previous code version always runs against the current schema.

## 11.9 Supply chain
`pnpm audit` and `pip-audit` in CI (also weekly on a schedule, since advisories appear without commits), Dependabot for four ecosystems, frozen lockfile installs. This review's audit found one dev-only advisory (a transitive `esbuild` through `drizzle-kit`); a pnpm `overrides` entry pins the patched line. **Drawback of overrides:** they can mask real incompatibility; the migration tooling was re-run to check.

## 11.10 Check your understanding
1. Why must `/healthz` not query the database? Describe the cascading failure if it did.
2. A user reports "Ask failed at 21:14". What do you ask them for, and what do you grep, in which services?
3. Why is `X-Request-Id` validated rather than trusted? Write a header value that would corrupt a naive JSON log line.
4. A `srcdoc` iframe inherits its parent's CSP; a URL-loaded frame does not. How did that fact change the design, and what does the page CSP no longer need to allow?
5. Little's law says concurrency = throughput × latency. At 64 workers the DB read path did 648 rps; estimate the mean latency and compare it with the measured p50 of 99.5 ms. Why does it match so well, and why does that suggest a saturated queue rather than a slow handler?
6. The migration loop ran over zero files and "succeeded". Name two other shapes where an empty input silently passes, and how you would make each fail loudly.
7. Why is a property test ("every answer line is a substring of its cited lesson") stronger than a list of forbidden words?
8. Write the rollout order for a release that renames a database column, so a rollback at any step is safe.
9. The rate limiter lives in process memory. Describe exactly what an attacker gains once there are two API instances, and name two places to move the counter.

# Phase 12: Content sprint 2: Parts A5–A7 and B1–B4 (14 lessons)

## 12.1 What this phase is
No new architecture: only lessons, each written *after* running its claims. A5–A7 (validation, layering and middleware, REST design) were verified with small scripts. B1–B4 (databases) were verified on a real PostgreSQL 16 with a one-million-row table, and the measured numbers appear in the lessons. Files: `packages/content/lessons/{a5,a6,a7,b1,b2,b3,b4}/`. The same pipeline as before (Zod frontmatter, `content:check`, generated JSON, re-ingest for the tutor) picks them up with no code change; that is the point of "the curriculum is code".

## 12.2 Why measure first
A lesson that says "indexes are fast" teaches nothing a competitive programmer does not already believe from O(log n). The useful facts are the *shape* of the gap and its price: a sequential scan filtered a million rows in about 98 ms, a B-tree lookup took about 0.2 ms (roughly 500×), and the index cost 39 MB beside a 174 MB table. A selective-looking filter that matches 20% of rows still read all 22,213 pages (~123 ms), so "has an index" is not "is fast". Those two numbers together teach selectivity better than any definition.
**Caveat:** timings come from a shared sandbox. The ratios and plan shapes are the lesson; absolute milliseconds are not. Run `EXPLAIN (ANALYZE, BUFFERS)` yourself.

## 12.3 The transaction experiments (B4)
Two sessions, one account row, PostgreSQL 16:
- **Non-repeatable read:** read committed saw 100 then 200; repeatable read saw 100 twice.
- **Lost update:** both read 100, both wrote 110. Read committed silently ended at 110 (one increment lost). Repeatable read made the second writer fail with `could not serialize access due to concurrent update`. An atomic `bal = bal + 10` and `SELECT ... FOR UPDATE` both ended at 120.
- **Write skew:** two on-call doctors each saw two on duty and each went off duty. Repeatable read ended with 0 on duty; serializable aborted one commit and left 1.
**Why these three:** each is a different failure of "check then act", and each has a different cheapest fix (atomic expression, row lock, serializable plus retry). **Drawback of serializable:** needs retry logic and can abort work that would have been fine. **Rejected:** teaching only definitions of dirty/phantom reads; they are real but you will meet lost updates and write skew first.

## 12.4 Other facts measured for B1 and B2
A fresh connection cost about 4.4 ms of query time versus 0.075 ms reusing one (local, no TLS); a pool of 2 ran six 100 ms queries in three waves (~105/207/309 ms); the 101st plain connection failed with `too many clients already`. `ctid` showed an UPDATE moving a row to a new location, which is MVCC made visible. The single-row WAL figure was larger than the row because of index records and possible full-page writes, so the lesson calls it one measurement, not a constant. For B2: `NULL = NULL` is NULL; `NOT IN` with a NULL returned no rows while `NOT EXISTS` returned the right one; `count(*)` was 4 but `count(customer_id)` 3.

## 12.5 The tutor and its eval
Re-ingest took the corpus to 30 documents / 456 chunks. Two earlier out-of-scope eval questions ("how does a B-tree index speed up queries", "how do I write a SQL JOIN") became *in scope*, so the tutor correctly answered them and the eval had to change, not the tutor. They moved to the in-scope list with the lessons that answer them, and five new database questions were added. The remaining miss ("what is database sharding?") is a real gap: the lessons mention replication but sharding arrives with chapter C4, so it is a known false-answer until then. Hybrid retrieval stayed best.

## 12.6 Check your understanding
1. Why did the 20%-match query use a bitmap scan and still read all 22,213 pages? At what match fraction would you expect a sequential scan to win?
2. An index on `(country, created_at)` served `WHERE country='IN' ORDER BY created_at DESC LIMIT 10` in ~0.03 ms. Explain why no sort was needed, and why `WHERE created_at > ...` alone cannot use it well.
3. Write the interleaving of two sessions that loses an update at read committed. Give three different fixes.
4. In the on-call example, why do row locks not conflict? How would `SELECT ... FOR UPDATE` on the whole on-call set fix it?
5. Why must a retry after a serialization failure restart from `BEGIN`?
6. List the four steps of expand and contract for renaming a column and say what breaks if you merge steps 1 and 4.
7. Why does `NOT IN (subquery)` break when the subquery can return NULL? Rewrite it safely.
8. A pool has 10 connections per instance, the database allows 100, and you autoscale to 15 instances. What happens and what are two fixes?

## 12.7 Batch 2: B6 caching, B7 queues, C3 security, C4 scaling (8 lessons)
**Measured, not recalled:**
- *Redis 7.0, maxmemory 2 MB, 3,000 values of ~1 KB:* `allkeys-lru` ended with 973 keys (2,050 evicted) and writes kept working; `noeviction` rejected writes with `OOM command not allowed` after ~940 keys. `SET ... EX 2` read back nil after 2.2 s. **Why it matters:** "Redis is full" has two opposite behaviours, chosen by one setting.
- *Hit rate (seeded simulation, 200,000 requests, 10,000 keys, LRU):* Zipf traffic gave 13.2 / 39.2 / 67.5 / 88.6% at capacities 10 / 100 / 1,000 / 5,000; uniform traffic at capacity 1,000 gave 9.9%. **Lesson:** skew, not size, makes a cache work.
- *Stampede:* 100 concurrent misses made 100 database calls; single-flight made 1.
- *Queue on Postgres:* two workers with `FOR UPDATE SKIP LOCKED` claimed 1,2,3 and 4,5,6; without SKIP LOCKED the second blocked. A worker that died before commit left all 10 jobs queued again, which is at-least-once delivery observed, not asserted.
- *Security:* string-concatenated SQL with `' OR '1'='1` returned all 3 customers; the parameterised version returned 0. scrypt (N=16384) took ~38 ms per hash versus SHA-256 at ~0.0025 ms: about 32 versus 720,000 guesses/s/core. A token bucket (5/s, capacity 10) let 14 of 100 requests through in one second.
- *Scaling:* modulo hashing moved 80.3% of 10,000 keys going from 4 to 5 servers; consistent hashing with 100 virtual nodes moved 20.9% (ideal 20%). Amdahl: p=0.9 gives 4.71x at 8 workers, 10x ceiling.
**A measurement I rejected:** my first load-balancer simulation overloaded the servers (mean latency 4 s for both policies), so it said nothing about policy. I changed the arrival rate so load was about two thirds of capacity before quoting round robin 163 ms versus least connections 51 ms. A benchmark in saturation measures the queue, not the algorithm.
**Honest limits:** the load-balancer and hit-rate numbers are *models* (no network, perfect load knowledge), and the lessons say so. Redis and Postgres numbers are from one sandbox run.
**Tutor eval after re-ingest (38 docs, 580 chunks):** hybrid recall@5 0.93 (was 0.96), MRR 0.84; out-of-scope refusal 0.80 on 5 held-out questions. The miss is "How does Kafka partition messages?", which is topic-adjacent to the queue lessons: a real instance of the known refusal gap, to be addressed in the gap batch rather than hidden.
### Check your understanding
1. Why does a 1% cache catch 39% of Zipf requests but ~10% of uniform ones?
2. Draw the interleaving where delete-on-write leaves stale data, and say what bounds the damage.
3. Why must the dedupe insert share a transaction with the job's database effects?
4. Compute the wait before attempt 7 with base 100 ms and factor 2, and explain what jitter changes.
5. Why is a login limit kept in process memory weaker with 4 instances? Name two shared stores.
6. At what parallel fraction does Amdahl cap speedup at 4x?

## 12.8 Batch 3: B5 NoSQL, B8 search, B9 fault tolerance, B10 gRPC, B11 configuration (9 lessons)
**Measured:**
- *Full-text search (200,000 documents, Postgres 16):* `LIKE '%zebracrossing%'` scanned all rows in ~27 ms; a GIN index on `to_tsvector` answered in ~0.1 ms (about 280x) and was 2.8 MB beside a 23 MB table. Normalisation is visible: "The caches were running quickly" becomes `'cach':2 'quick':5 'run':4`, so `run & cache` matches. For a word present in 160,000 of 200,000 rows an index cannot help much, the same selectivity rule as B-trees.
- *JSONB (300,000 events):* containment query ~51 ms without an index, ~0.45 ms with `jsonb_path_ops` GIN (3 MB index, 31 MB table). A string `user` value was accepted without complaint: schemaless means the schema moved into your code.
- *Timeouts:* a 2 s server with `AbortSignal.timeout(300)` failed at 303 ms; without it the client waited 2,010 ms. A toy circuit breaker (opens after 5 failures, 1 s cool-down) let 6 of 200 calls reach a dead dependency. That is a single-threaded model, stated as such in the lesson.
- *Retry arithmetic:* 100 rps with 3 immediate retries offers 400 rps to a 100 rps service.
- *Protobuf:* `{id:150,name:"Ada",active:true,score:300}` is 13 bytes (`0896011203416461180120ac02`) against 49 bytes of compact JSON. I produced the bytes with a hand-written varint encoder, not the official library (no `protoc` here), and the lesson says so; the encoding follows protobuf's documented wire format.
**Scope decision:** B5 and B10 are tier-3 chapters and have one lesson each (the other chapters have two). Their curriculum summaries are one sentence long, and padding to two lessons would lower quality.
**Tutor eval (45 docs, 684 chunks):** hybrid recall@5 0.91 (0.96 -> 0.93 -> 0.91 as the corpus grew), MRR 0.81, out-of-scope refusal 0.80. Recall slipping as the corpus grows is expected (more near-neighbours) and is worth a dedicated look in the tutor-quality batch rather than dismissing.
### Check your understanding
1. Why does an expression index on `to_tsvector('english', body)` not help a query that uses the `simple` configuration?
2. Walk through the dual-write failure in B8/02 and show how the outbox row fixes it, step by step.
3. Compute the offered load for 3 layers x 3 retries and say where a retry budget would cut in.
4. Encode 300 as a varint by hand (hint: 300 = 0b100101100).
5. Why is "delete the commit" not a fix for a leaked key?
6. What would make you choose a key-value store over Postgres JSONB?

## 12.9 Batch 4: 0.4 Linux, C1 observability, C2 graceful shutdown, C5 concurrency (7 lessons)
**Measured (Node 22, 2 cores):**
- *Signals:* a server taking 1.5 s per request, SIGTERM at 0.4 s: with no handler curl got exit 52 (connection dropped, empty reply); with a handler it got 200 "done" and the process then exited. A shell killed by SIGTERM reported 143. `false | true` reported 0, and 1 with `pipefail`.
- *Percentiles (seeded, 10,000 requests, 2% slow):* mean 48.9 ms, p50 30.2, p95 39.4, p99 1,003; the mean and p95 look healthy while p99 is a second.
- *Races:* two async deposits of 10 on 100 (read, await, write) ended at **110**, not 120, on one thread; a mutex flag gave 120. Two worker threads x 1,000,000 plain increments on a `SharedArrayBuffer` ended at 1,445,296 (varies per run); `Atomics.add` gave exactly 2,000,000. CPU loop: 337 ms on one worker, 195 ms across two (1.73x on two cores).
- *Deadlock:* two tasks taking locks A,B and B,A got stuck (500 ms timeout, no error); with the same order both finished.
**Not measured:** SIGKILL's 137 is stated from the 128+signal convention (the 143 case was measured). Kubernetes pod-termination behaviour is cited from its documentation; there is no cluster here. The spin-with-sleep mutex in the lesson is a teaching device and says so.
**Tutor eval (52 docs, 789 chunks):** hybrid recall@5 0.92, MRR 0.83, refusal 0.80 (same Kafka miss).
### Check your understanding
1. Why does `exec node server.js` matter for graceful shutdown inside a container?
2. A service has mean latency 50 ms and p99 1 s. Why might users still complain, and what do you alert on?
3. Compute the error budget in minutes for a 99.9% SLO over 30 days.
4. Why does the async deposit race occur with one thread? Where is the window?
5. Name the four deadlock conditions and one fix for each.
6. When is a worker thread the wrong answer and a separate process or job service the right one?

## 12.10 Batch 5: Part D (D1–D6, 13 lessons) and a regression in the tutor
**Verification honesty.** Docker, Kubernetes and CI cannot run in this sandbox (no daemon, no cluster, no hosted runner), so D1 to D3 lessons say "verification status: not run here" and rest on the project's real Dockerfile, Compose file and `ci.yml` plus official documentation. Measured instead: test-suite counts and times for the repo's own suites (web 129 in ~3 s, API 99 in ~11 s against real Postgres, AI 60 in ~4 s); the WebSocket accept key for the RFC 6455 example key (my computation matched the RFC's published value); frame-header sizes and fan-out arithmetic (100,000 clients x 1 msg/s x 102 B = 10.2 MB/s and 100,000 sends/s). Kafka was not available, so D5 is explicitly a *model*: a 30-line partitioned log with per-partition offsets reproduced "same key, same partition, in order", a hot partition (sizes 1, 0, 5 for three keys) and a redelivery after a crash between processing and commit.
**One lesson corrected before shipping:** my first D3 draft described the CI jobs from memory ("retrieval evaluation", "image builds"). I re-read `ci.yml`, found the AI job runs only pytest and the docker job runs Compose plus the smoke test, and rewrote the paragraph. Describe the file, not your memory of it.
### The tutor regression and its fix
Growing the corpus to 61 lessons broke a test that had passed for weeks: "Explain Kubernetes ingress controllers." (now partly in scope, so I swapped the question) and then "Explain Terraform state locking." was *answered*. **Cause:** the gate counted what share of the question's words appeared in the top passages; "state" and "locking" are common in lessons, so 2 of 3 words matched and the one word that carried the meaning ("terraform", found nowhere) was outvoted. **Fix (apps/ai, `retrieval.py`):** weight each term by its rarity, ln((N+1)/(df+1)) over all chunks, and require the weighted coverage to reach a threshold (`MIN_WCOVERAGE`). A second fix mattered as much: presence and rarity are now judged with Postgres' own English stemmer on the *unstemmed* question words, not by feeding my small Python stemmer's output back into Postgres ("committed" became "committ", which matches nothing).
**Calibration (hybrid mode).** Thresholds were swept on the dev half only. Out of 21 out-of-scope questions (12 newly written, deliberately topic-adjacent: Terraform, PromQL, Jenkins, Cassandra tombstones, Rust borrow checker, Raft...), held-out refusal went from 0.60 to 0.80 while in-scope answered went from 0.98 to 0.90 and recall@3 stayed 0.93. The first version of the fix (my stemmer, no raw terms) refused "How does a session cookie keep me logged in?", which is why I did not stop at the first improvement. Chosen `MIN_WCOVERAGE=0.45` (best worse-of-two on dev).
**What it cannot do.** "What is a Kubernetes operator?" is still answered: every word exists in the corpus, so a lexical gate cannot tell that the *combination* is uncovered. Only a semantic embedder can; MiniLM could not be downloaded here, so that remains something to measure on your machine.
**Tests:** two new tests (unknown distinctive term not outvoted; common words do not cause refusals).
### Check your understanding
1. Why does IDF weighting rescue "Terraform state locking" but not "Kubernetes operator"?
2. The gate trades answered-rate against refusal-rate. Which error is worse for a tutor, and how does the threshold choice encode it?
3. Why must tuning happen on the dev split and be reported on the test split?
4. In the Kafka model, why can a consumer see message `b` twice, and which line of code (process vs commit order) decides it?
5. Compute the bandwidth for 50,000 WebSocket clients receiving 5 messages/s of 200 bytes (plus a 4-byte frame header).
6. Why is a liveness probe that checks the database dangerous?

## Phase 12.11 - Parts E and F (the last 11 chapters)

**What:** 13 lessons: E1 (OpenAPI contract, contract tests and breaking changes), E2 (agents as workflows), E3 (RAG evaluation, production AI), F0 (distributed-systems basics), F1 (design method), F2-F7 (URL shortener, rate limiter, notifications, chat, file sync, news feed). All 44 chapters now have lessons: 74 in total, 1121 tutor chunks.

**Why numbers inside lessons:** each design lesson quotes a quantity I computed in a script (base62 capacity, collision odds, boundary-burst 200 vs 100, chunk reuse 0/49 vs 136/137, feed fan-out 23 200 writes/s). A design chapter without arithmetic is opinion.

**A lesson that bit me:** the tutor's own tests failed after I wrote E2/E3, because the new lessons *mentioned* Terraform and "system prompt". The corpus now legitimately covered them, so the refusal test and the injection-echo test failed. Out-of-scope tests rot as the corpus grows; they must use words you will never teach. I reworded the lessons rather than weaken tests.

**Honesty fix:** my first draft of the E3 eval table had numbers not taken from the run. I replaced them with the held-out numbers the eval command prints (hybrid recall@3 0.93, MRR 0.84, answered 0.90, refused 0.80 on 10 out-of-scope). Never write a measured number from memory.

**Check your understanding**
1. With N=5, which (R, W) pairs give R+W>N, and which of them minimise read latency?
2. Why does a 301 make a shortener's links effectively immutable?
3. Why is fan-out on write O(followers) per post, and what is the hybrid threshold trading?
4. Why must a chat server persist before it pushes?

## Phase 12.12 - Five more labs on the same engine

**What:** `apps/web/src/sim/{btree,cache,auth,router,bytes}.ts` plus one shared view, `components/sim/GenericSim.tsx`. Each lab is still `Scenario(params, seed) -> Step[]`, wrapped by the existing `SimShell`, so play/pause/step/scrub/URL state/transcript came for free.

**Why one generic view:** the five labs all reduce to "a row of cells with a state, a few counters, a trace line" (`sim/generic.ts`). A bespoke SVG per lab would cost days and add nothing a learner needs; the engine's value is the model, not the picture. HTTP/DNS/event-loop keep their custom stages because spatial movement is the lesson there.

**Complexity and what each one teaches**
- *Scan vs B-tree:* scan reads ceil(rows/100) pages, an index reads ceil(log_fanout rows)+1. 1M rows: 10 000 vs 4. Fanout 50 vs 500 changes depth, which is why key width matters.
- *Cache:* all three policies see the identical request stream (a pure function of workload and seed), so comparisons are fair. LRU on a loop of 5 keys with capacity 4 hits 0 times of 24; capacity 5 hits 19. A tested invariant, not a claim.
- *Session vs JWT:* the difference is where state lives, shown as store lookups and whether a stolen copy works after logout.
- *Router:* first match wins, so order is semantics. `/users/:id` before `/users/me` captures id="me". 405 vs 404 is a distinction people skip.
- *Bytes:* UTF-8/UTF-16 encoders written by hand and tested against `TextEncoder`/`Buffer` for ASCII, accents, CJK and emoji.

**Drawbacks / honesty:** every lab has a "what this simplifies" list. The B-tree lab's pages-per-row and fanout are chosen constants, not calibrated to Postgres. The cache lab has no TTL. The smoke test shows 500 console errors only because the web proxy has no API behind it in the sandbox (the old labs do the same).

**Rejected:** a React Flow canvas per lab (cost, no learning gain); using `TextEncoder` inside the lab (it would hide the rules the lab exists to show).

**Check your understanding**
1. Why must every policy in the cache lab see the same request stream?
2. Why does LRU score 0 hits on a loop one key larger than the cache?
3. In the router lab, how would you detect shadowed routes automatically?
4. Why does a JWT with a 5-minute lifetime still need a refresh strategy?

## Phase 12.13 - Shared limiter, password reset, and a load model

**1. Shared rate limiter (`apps/api/src/ratelimit/pgStore.ts`).** `express-rate-limit` keeps counts in process memory, so N instances give a client N times the limit. The store is one statement, `INSERT ... ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN reset_at <= now() THEN 1 ELSE hits + 1 END ... RETURNING`. Postgres row-locks during the upsert, so two instances cannot both read 19 and write 20: this is the atomicity argument behind Redis `INCR`, using a database we already run. Cost: a write per request on limited routes (auth, AI), fine at this scale, wrong for a 10k rps public endpoint. Test: 40 concurrent requests over two app instances -> exactly 20 pass. Rejected: Redis (new infrastructure to run and pay for), sticky sessions (hides the problem).

**2. Password reset (`auth/reset.ts`, `auth/mailer.ts`).** Same rules as sessions: store only SHA-256 of the token, so a DB leak is not an account leak. Single use is enforced by the claim `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`, not by read-then-write; two simultaneous submissions produce one 200 and one 400 (tested). The token is in the URL *fragment*, which browsers never send to servers or in Referer. The "forgot" endpoint answers identically for unknown emails (no enumeration). A weak password rolls the transaction back so the link survives. Success revokes every session. The mailer is a port; production default only warns, because a reset link in a log is a credential.

**3. Load model (`apps/web/src/lib/arch/load.ts`).** A discrete-event simulation: a binary-heap event queue, per-node pools with c slots and FIFO waiting, Poisson arrivals, client timeouts, retries with exponential backoff. Path sampling reuses `simulateRequest`, so trace and load test cannot disagree. Complexity O(E log E) for E events. Key result (corrected in Phase 13): the first version let the API release its slot before calling downstream, giving a ceiling of 500 req/s. That was wrong: a real API worker is held while it waits for the database. With slot holding, the simple preset's ceiling is about 276 req/s (`heldCeiling`), and beyond it success collapses because abandoned requests keep consuming servers (zombie work). Retries at 700 rps raise offered load 3.65x and success stays at about 12%: a retry storm, produced by arithmetic, not by decoration.

**Check your understanding**
1. Why does `CASE WHEN reset_at <= now()` make a separate cleanup job unnecessary for correctness?
2. Why must "claim the token" be one UPDATE rather than SELECT then UPDATE?
3. By Little's law, how many requests are in the API at 300 rps and 16 ms service time? Compare with its 8 slots.
4. Why does the success rate collapse far below the ceiling when offered load is well above it?


---

## Phase 13: Break-it Lab (Phase 2a)

**What it does.** `/labs/break-it` lets you break a system on purpose and fix it. Guided mode has seven incidents (one server dies, slow database, never recovers, hung dependency, retry storm, queue backlog, cascading failure). Each runs: story, reproduce, observe (topology, per-second charts, log, component table, time scrubber), diagnose (quiz with hints), fix (levers), re-run, compare before and after. Open mode lets you pick a graph, inject any fault, and compare against your previous run.

**Where.** Engine: `apps/web/src/lib/arch/load.ts` (v2) and `incidents.ts`. UI: `apps/web/src/components/breakit/` (`parts.tsx`, `BreakItLab.tsx`), route `app/labs/break-it/page.tsx`. Tests: `tests/load.test.ts`, `tests/incidents.test.ts`; e2e `e2e/breakit_smoke.py`.

**Load model additions.** (1) API slots are held through downstream calls, so a slow database starves unrelated pages. This is the central lesson of "slow is worse than down". (2) Faults: down, slow, errors, blackhole (60 s hang), pause, cache-cold (ramp). (3) Circuit breaker, per-call timeout, queue limits, jitter on backoff. (4) A per-second timeline and an event log. All of it is a seeded discrete-event simulation (binary heap, mulberry32), so every run is reproducible and testable. Complexity O(E log E).

**SLO evaluation.** Each incident has an `Slo` (min success, max p95). `evaluate` checks the window after the fault; `recoverySeconds` counts seconds until the system is healthy again using `r.horizon`, and requires `offered > 0` so empty seconds after the load stops do not count as "healthy". A tempting wrong fix (for retry storm: a longer client timeout) must fail the SLO; we added a p95 bound for that reason.

**Why these choices.** Reference fixes pass and tempting fixes fail, asserted in tests, so the lab cannot silently teach the wrong lesson. Rejected: a real multi-process cluster (needs infrastructure, not reproducible in a browser) and random chaos (not testable).

**Honest limits.** One-queue-per-node M/M/c-style model; no network partitions, no clock skew, no GC pauses; numbers are illustrative, not predictions. Mobile uses a vertical topology; the grid needs `minmax(0,1fr)` columns or a horizontal scroller widens the whole page (a CSS grid min-content trap that cost us a bug).

**Check your understanding**
1. Why does holding an API slot during a database call make a 8x-slower database take down pages that never touch it?
2. Why must a "tempting" fix be an asserted failure in tests?
3. Why does `recoverySeconds` need `offered > 0`?
4. What would you add to model a network partition, and why can't the current single-queue model show it?


---

## Phase 14: Concurrency Arena (Phase 2b)

**What it does.** `/labs/concurrency` lets you choose the order in which threads run. Four scenarios, each with an unsafe and a safe version: lost update (counter: unsafe, mutex, atomic add), check-then-act (bank withdrawal), deadlock (opposite vs same lock order), producer/consumer (no sync vs semaphores + mutex). You see each thread's program with a program counter, registers, shared memory with changed values highlighted, a timeline, a step log, and a verdict. You can step one thread at a time, run a scheduler (sequential, round robin with a quantum, seeded random), scrub history, and share the exact schedule in the URL (`?run=0.1.0.1...`).

**Where.** Engine: `apps/web/src/sim/conc.ts` (pure, same purity rules as the other sims). UI: `components/concurrency/ConcurrencyArena.tsx`, route `app/labs/concurrency/page.tsx`, registered as a page lab for chapter C5 in `data/curriculum.ts`. Tests: `tests/conc.test.ts`; e2e `e2e/concurrency_smoke.py`.

**Core idea: a race is a schedule.** Threads are tiny programs (`load`, `add`, `store`, `lock`, `unlock`, `wait`, `post`, a conditional jump, an assertion). The machine never advances by itself: `step(machine, tid)` runs one instruction of one thread and returns a new machine. So an interleaving is simply a list of thread ids, and "reproduce the bug" means "replay this list". This is why the arena is deterministic and testable, and why the URL can carry a bug.

**Exhaustive checking (`explore`).** For T1 and T2 with 3 steps each there are C(6,3) = 20 schedules, and only the 2 where one thread finishes before the other are correct; 18 lose an update. We enumerate all schedules with a depth-first search and memoise on the whole machine state (variables, locks, semaphores, program counters, registers, violations), then count paths by dynamic programming over the state DAG. That is how 924 schedules (2 increments each) cost only 263 states, and 12,870 producer/consumer schedules cost 354. Complexity O(states x threads). It is a tiny model checker, the same idea as TLA+/SPIN, and it is the difference between "I ran it 1000 times and it passed" and "it is correct on every schedule".

**Teaching points the tests lock in.** (1) The sequential scheduler makes unsafe counter and bank pass: "works on my machine" is a statement about the schedule, not the code. (2) Safe versions have 0 wrong schedules and no deadlocks, asserted exhaustively. (3) Unsafe versions have at least one wrong schedule. (4) Every outcome the explorer reports has an example schedule that, replayed, reproduces that exact outcome. (5) Mutual exclusion violation (two threads inside the intended critical section) is flagged only when they overlap, and never under a mutex.

**Design choices and rejected alternatives.** Real threads and `SharedArrayBuffer`: not deterministic, cannot enumerate, hard to test. A random-only scheduler: shows that bugs are rare but never proves a fix. Generic cells-and-counters view (like the cache lab): cannot show per-thread program counters or a timeline. Checking only the final value: misses violations that heal themselves, so we keep a separate violation list (mutual exclusion, assertions) next to the verdict.

**Honest limits.** Sequential consistency only: real CPUs reorder and buffer writes, so real bugs can be stranger (memory barriers are not modelled). One instruction per step, no preemption inside an instruction other than at step boundaries, non-reentrant locks, no priorities, timers or fairness guarantees, so starvation and priority inversion are not shown. State merging assumes the machine is the whole state, which holds here because there is no hidden clock.

**Check your understanding**
1. Why are exactly 2 of the 20 schedules correct for the unsafe counter with 1 increment each?
2. Why does the explorer need `violations` in its memo key?
3. Atomic add has 2 schedules and the mutex version has 2 for 1 increment. Why is the atomic version still "simpler" for the CPU?
4. Give the wait-for cycle in the deadlock scenario, and say which edge the "same order" fix removes.
5. Why does a semaphore pair (empty/full) still need a mutex around `n`?
