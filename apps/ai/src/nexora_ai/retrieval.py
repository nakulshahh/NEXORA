"""Hybrid retrieval: keyword (Postgres full-text) + vector (pgvector), fused with Reciprocal Rank Fusion, lightly
re-ranked, and gated by an evidence check so the tutor can say "I don't know".

Why two retrievers: keyword search is exact on rare terms ("varint", "SameSite") and blind to paraphrase; vector search
bridges paraphrase and is fuzzy on exact terms. Their failure modes differ, so combining them beats either alone
(measured by `nexora-ai eval`).
"""
from __future__ import annotations

import math

from dataclasses import dataclass, field

import psycopg

from .config import Settings
from .embeddings import Embedder
from .text import content_terms, content_stems, stem, tokens

RRF_K = 60  # standard constant from the original RRF paper; flattens the contribution of rank


@dataclass
class Hit:
    chunk_id: int
    document_id: int
    source_key: str
    doc_kind: str
    title: str
    chapter: str | None
    lesson_slug: str | None
    url: str | None
    kind: str
    section: str
    heading_path: str
    anchor: str
    text: str
    fts: float = 0.0          # ts_rank_cd normalised to 0..1 (0 = no keyword match)
    cosine: float | None = None
    rrf: float = 0.0
    score: float = 0.0        # final ranking score after context boosts


@dataclass
class Evidence:
    sufficient: bool
    reason: str
    coverage: float
    best_fts: float
    best_cosine: float
    missing_terms: list[str] = field(default_factory=list)
    wcoverage: float = 1.0       # IDF-weighted coverage: a missing rare term costs more than a missing common one


@dataclass
class Retrieval:
    hits: list[Hit]
    evidence: Evidence
    mode: str                 # "hybrid" | "lexical" | "vector"
    query_stems: list[str]


_COLS = """c.id AS chunk_id, c.document_id, d.source_key, d.kind AS doc_kind, d.title, d.chapter, d.lesson_slug, d.url,
           c.kind, c.section, c.heading_path, c.anchor, c.text"""


def _tsquery(stems_: list[str]) -> str:
    # OR of the (already alphanumeric) stems; Postgres stems them again with the same English config.
    return " | ".join(s for s in stems_ if s.isalnum())


def keyword_search(conn: psycopg.Connection, query: str, limit: int) -> list[Hit]:
    q = _tsquery(content_stems(query))
    if not q:
        return []
    rows = conn.execute(
        f"""SELECT {_COLS}, ts_rank_cd(c.tsv, to_tsquery('english', %(q)s), 32) AS r
            FROM rag.chunks c JOIN rag.documents d ON d.id = c.document_id
            WHERE c.tsv @@ to_tsquery('english', %(q)s)
            ORDER BY r DESC, c.id LIMIT %(n)s""", {"q": q, "n": limit}).fetchall()
    return [Hit(**{k: v for k, v in r.items() if k != "r"}, fts=float(r["r"])) for r in rows]


def vector_search(conn: psycopg.Connection, vec, limit: int) -> list[Hit]:
    rows = conn.execute(
        f"""SELECT {_COLS}, 1 - (c.embedding <=> %(v)s) AS cos
            FROM rag.chunks c JOIN rag.documents d ON d.id = c.document_id
            ORDER BY c.embedding <=> %(v)s, c.id LIMIT %(n)s""", {"v": vec, "n": limit}).fetchall()
    return [Hit(**{k: v for k, v in r.items() if k != "cos"}, cosine=float(r["cos"])) for r in rows]


def _boost(hit: Hit, context: dict | None) -> float:
    """Small, explainable nudges. They break near-ties; they must never rescue an irrelevant chunk."""
    b = 1.0
    if context and hit.chapter:
        if hit.chapter == context.get("chapter"):
            b *= 1.05
            if hit.lesson_slug == context.get("slug"):
                b *= 1.10
    if hit.kind == "misconception":
        b *= 0.95   # useful as a side note, rarely the primary answer
    if hit.kind == "summary":
        b *= 0.90
    return b


def retrieve(conn: psycopg.Connection, settings: Settings, embedder: Embedder | None, query: str,
             context: dict | None = None, k: int | None = None, keyword: bool = True) -> Retrieval:
    k = k or settings.top_k
    pool = 30
    qstems = content_stems(query)
    kw = keyword_search(conn, query, pool) if keyword else []
    vec_hits: list[Hit] = []
    mode = "lexical"
    if embedder is not None:
        vec_hits = vector_search(conn, embedder.embed([query])[0], pool)
        mode = "hybrid" if keyword else "vector"

    merged: dict[int, Hit] = {}
    for rank, h in enumerate(kw):
        merged.setdefault(h.chunk_id, h).fts = h.fts
        merged[h.chunk_id].rrf += 1.0 / (RRF_K + rank + 1)
    for rank, h in enumerate(vec_hits):
        m = merged.setdefault(h.chunk_id, h)
        m.cosine = h.cosine
        m.rrf += 1.0 / (RRF_K + rank + 1)
    for h in merged.values():
        h.score = h.rrf * _boost(h, context)
    ranked = sorted(merged.values(), key=lambda h: (-h.score, h.chunk_id))

    # diversity: at most 3 chunks from the same document, so one long lesson cannot crowd out the right neighbour
    per_doc: dict[int, int] = {}
    final: list[Hit] = []
    for h in ranked:
        if per_doc.get(h.document_id, 0) >= 3:
            continue
        per_doc[h.document_id] = per_doc.get(h.document_id, 0) + 1
        final.append(h)
        if len(final) >= k:
            break
    terms = [t for t in content_terms(query) if t.isalnum()]
    weights = _idf_weights(conn, terms)
    found = _present_terms(conn, terms, [h.chunk_id for h in final[:3]])
    return Retrieval(final, assess(settings, qstems, final, mode, weights, found, terms), mode, qstems)


def _idf_weights(conn: psycopg.Connection, terms: list[str]) -> dict[str, float]:
    """ln((N+1)/(df+1)) per query stem, df measured over all chunks. A stem found nowhere (a product name the lessons
    never mention) gets the largest weight, so it cannot be outvoted by common words like "state" or "write"."""
    if not terms:
        return {}
    n = conn.execute("SELECT count(*) AS n FROM rag.chunks").fetchone()["n"]
    rows = conn.execute(
        "SELECT t, (SELECT count(*) FROM rag.chunks c WHERE c.tsv @@ to_tsquery('english', t)) AS df FROM unnest(%s::text[]) AS t",
        (terms,)).fetchall()
    return {r["t"]: math.log((n + 1) / (r["df"] + 1)) for r in rows}


def _present_terms(conn: psycopg.Connection, terms: list[str], chunk_ids: list[int]) -> set[str]:
    """Which query stems occur in the given chunks, judged by Postgres' own English stemmer (the one that built the index),
    so "logged" in a question matches "log" in a lesson. The small Python stemmer is only a fallback."""
    if not terms or not chunk_ids:
        return set()
    rows = conn.execute(
        "SELECT t FROM unnest(%s::text[]) AS t WHERE EXISTS (SELECT 1 FROM rag.chunks c WHERE c.id = ANY(%s) "
        "AND c.tsv @@ to_tsquery('english', t))", (terms, chunk_ids)).fetchall()
    return {r["t"] for r in rows}


def assess(settings: Settings, qstems: list[str], hits: list[Hit], mode: str, weights: dict[str, float] | None = None,
           found: set[str] | None = None, terms: list[str] | None = None) -> Evidence:
    """Decide whether the retrieved text can support an answer. Refusing is a feature, not a failure.

    Coverage (embedder independent): of the question's content stems, what share appears in the top 3 passages?
    A question about "kubernetes ingress" retrieves *something* from any corpus; its stems will not be in the text.
    Then at least one retriever must also be confident: keyword rank, or cosine similarity.
    """
    if not qstems:
        return Evidence(False, "The question has no searchable content words.", 0.0, 0.0, 0.0)
    if not hits:
        return Evidence(False, "Nothing in the lessons matched.", 0.0, 0.0, 0.0, list(qstems))
    top = hits[:3]
    corpus = {stem(t) for h in top for t in tokens(h.heading_path + " " + h.text)}
    if terms is None:   # callers without a database connection fall back to the small Python stemmer
        present = [s for s in qstems if s in corpus]
        missing = [s for s in qstems if s not in corpus]
        coverage = len(present) / len(qstems)
        wcov = 1.0
    else:
        ok = [t for t in terms if t in (found or set()) or stem(t) in corpus]
        missing = [t for t in terms if t not in ok]
        present = ok
        coverage = len(ok) / len(terms) if terms else 0.0
        total = sum(weights.get(t, 1.0) for t in terms) if weights else 0.0
        wcov = sum(weights.get(t, 1.0) for t in ok) / total if total else 1.0
    best_fts = max((h.fts for h in top), default=0.0)
    best_cos = max((h.cosine or 0.0 for h in top), default=0.0)
    if coverage < settings.min_coverage:
        return Evidence(False, f"Only {len(present)} of {len(qstems)} key terms appear in the closest lesson text.", coverage, best_fts, best_cos, missing, wcov)
    if wcov < settings.min_wcoverage:
        return Evidence(False, "The most distinctive terms in the question do not appear in the closest lesson text.", coverage, best_fts, best_cos, missing, wcov)
    confident = best_fts >= settings.min_fts or (mode in ("hybrid", "vector") and best_cos >= settings.min_cosine)
    if not confident:
        return Evidence(False, "The closest passages are only weakly related to the question.", coverage, best_fts, best_cos, missing, wcov)
    return Evidence(True, "Key terms are covered by the retrieved passages.", coverage, best_fts, best_cos, missing, wcov)
