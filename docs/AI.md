# The AI Professor (Milestone 6)

Zero-cost, extractive, cited, and willing to say "the lessons don't cover that". No generative model is involved.

## Run it locally
```bash
docker compose up -d db                       # Postgres with pgvector
cd apps/ai && python -m venv .venv && . .venv/bin/activate && pip install -e '.[dev]'
export DATABASE_URL=postgres://nexora:nexora-local-only@localhost:5432/nexora   # a separate DB or the same one: it only touches schema "rag"
nexora-ai ingest          # idempotent; re-embeds only lessons that changed
nexora-ai serve           # http://127.0.0.1:8000  (/docs for the schema in development)
nexora-ai eval            # retrieval + refusal metrics on the held-out split
```
Then set `AI_SERVICE_URL=http://localhost:8000` in `apps/api/.env`. Tests: `TEST_DATABASE_URL=... pytest` (needs a throwaway DB with pgvector).

## Pipeline
`packages/content/lessons/*.mdx` → `mdx.py` (frontmatter, flatten callouts/sequence diagrams/exercise explanations) → `chunking.py` (≤150 words, split on H2/H3, kinds: text, code, misconception, check, summary; each chunk carries "Lesson > Section > Subsection") → `ingest.py` (hash per document; embed only what changed) → `rag.chunks` (generated `tsv` column + GIN, `vector(384)` + HNSW).
External sources (`packages/content/sources/*.md`) are supported by the loader and require `title`, `url`, `license`, and a permission line for articles/transcripts. **None are shipped**: nothing is ingested without a recorded licence.

## Retrieval and refusal
Keyword (OR of stems, `ts_rank_cd`) + vector (cosine) → RRF (k=60) → boosts (same lesson ×1.10, same chapter ×1.05; misconception ×0.95, summary ×0.90) → ≤3 chunks per document. The gate (`assess`) then requires: coverage ≥ 0.5 of question stems present in the top 3 passages, and best FTS ≥ 0.1 or (hybrid/vector) best cosine ≥ 0.3. Defaults live in `config.py` and can be overridden by `MIN_COVERAGE`, `MIN_FTS`, `MIN_COSINE`.

## Evaluation (measured, `hashing-v1`, 16 lessons)
48 in-scope questions written from the lessons before looking at results (3 are deliberate paraphrases), 14 out-of-scope. Alternate items are split dev/test; thresholds were tuned on **dev only** and are reported on the **held-out test** half.

| mode | in-scope n | recall@1 | recall@3 | MRR | answered | out-of-scope n | refused |
|---|---|---|---|---|---|---|---|
| lexical (FTS only) | 24 | 0.75 | 0.88 | 0.84 | 0.83 | 7 | 0.71 |
| vector only | 24 | 0.58 | 0.92 | 0.72 | 0.08 | 7 | 1.00 |
| **hybrid** | 24 | 0.79 | 0.96 | 0.88 | 0.92 | 7 | 0.71 |

Read this honestly:
- Hybrid ≥ either alone on recall@1/MRR, but the sets are small (24); differences of one question are 4 points. Treat it as a regression guard, not a benchmark.
- Dev-tuned thresholds scored 1.00/1.00 on dev and 0.92/0.71 on test: **that gap is the overfit**. The test number is the real one.
- **Known leaks**: "How does a B-tree index speed up database queries?" and "What is database sharding?" are answered because the lessons share words (index, database, query). A lexical gate cannot tell "same words" from "same topic". The sbert embedder should help; this is unverified.
- "Vector only" answers 8% because hashing cosines are low; its gate is meaningless without a real semantic model.
- Known misses: "What is an IDOR bug?" ranks the right lesson 6th (the term appears once, in passing).
- Questions are English-only, short, and written by the same person who wrote the lessons.

## Hosting evaluation
Measured here (`scripts/bench.py`, hashing embedder, Postgres 16 + pgvector, 241 chunks, one CPU container): RSS ≈ 54 MB after imports, ≈ 56 MB after 144 queries; ingest 0.05 s (unchanged) ; query p50 ≈ 4 ms, p95 ≈ 5 ms. Postgres storage is small (hundreds of KB).

**Not measured** (sandbox could not download the model): MiniLM load time, RSS, latency. Typical figures (PyTorch + sentence-transformers ≈ several hundred MB resident, tens of ms per query on CPU) are from general experience, not from this project, and the free Render tier's ~512 MB limit may not hold them with the web server. Before deploying `sbert`, run `EMBEDDER=sbert python scripts/bench.py` on the target instance size. If it does not fit, options in order: (1) keep `hashing` (works today, lexical); (2) an ONNX runtime path for MiniLM (smaller; not built); (3) a larger instance. The service reports its mode in every response (`retrieval`, `embedder`, `generator`), and the UI says "No generative model was used".

Also: Render free instances sleep when idle; the first question after a pause can exceed the gateway's 8 s timeout and shows an honest "unavailable" message. Neon pgvector: `CREATE EXTENSION vector` is run by the migration.

## Adding a local LLM later
Implement `Answerer` (see `answer.py`), receive the retrieved passages, emit the same `Answer` structure, cite only passages given, and validate the result before returning it; keep `ExtractiveAnswerer` as the fallback when validation fails.
