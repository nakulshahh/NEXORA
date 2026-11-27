# ADR 0003: A zero-cost, extractive AI Professor (no paid LLM, no required API key)

**Status:** accepted (Milestone 6).

## Context
The AI Professor must be free to run and free to develop: no paid LLM, no paid embedding API, no hidden usage-based service, no mandatory key. It must also be honest: answers grounded in the curriculum, always cited, and a refusal when the lessons do not cover the question.

## Decision
- **Retrieval, not generation.** Python service (`apps/ai`) chunks lessons by heading, stores chunks in Postgres (`rag` schema), and retrieves with **hybrid search**: Postgres full-text (`ts_rank_cd`) + pgvector cosine, fused with Reciprocal Rank Fusion, a small same-lesson/same-chapter boost, and at most 3 chunks per document.
- **Extractive answers.** The answer is up to 3 sentences copied from retrieved passages, each tagged with its citation. Nothing is paraphrased or invented. The output is structured JSON; the UI renders it.
- **Evidence gate.** Before answering, check that the question's content stems appear in the top passages and that a retriever is confident. Otherwise return `insufficient_evidence` with no citations.
- **Pluggable embedder.** `hashing-v1` (default, keyless, no download, lexical features hashed into 384 dims) or `sbert` (all-MiniLM-L6-v2 via sentence-transformers, `pip install .[sbert]`). Both write 384-dim vectors. The index records which embedder built it and refuses to mix.
- **Pluggable answerer.** `Answerer.answer(question, retrieval) -> Answer`. A local open-source LLM can implement it later; it must cite only retrieved passages and a validator must reject output citing anything else.
- **Gateway.** The browser calls Express `/api/ai/ask` (signed in, rate-limited per account, timeout). Express calls the AI service with a shared `X-Internal-Token`. The AI service is never public.

## Consequences
- Cost is the hosting of one small Python process and a Postgres table. No per-query fees exist.
- Answers can be clunky: sentences are quoted, not rewritten. That is the price of zero hallucination.
- The default `hashing-v1` embedder is **lexical**; it does not understand synonyms. Real semantic search needs `sbert`, which has not been run in the build sandbox (HuggingFace was blocked). Its thresholds are provisional until `nexora-ai eval` is run with it.
- The evidence gate is a heuristic and leaks on out-of-scope questions that share vocabulary with the lessons (see `docs/AI.md`).
