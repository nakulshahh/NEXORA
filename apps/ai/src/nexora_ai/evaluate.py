"""Measure retrieval and the evidence gate on a labelled question set (eval/questions.json).

Metrics, per retrieval mode (lexical / vector / hybrid):
  recall@1, recall@3, MRR   : did a lesson that truly contains the answer come back near the top? (in-scope questions)
  answered                  : share of in-scope questions the gate lets through
  refused                   : share of out-of-scope questions the gate correctly refuses
Thresholds are tuned on the 'dev' half and reported on the held-out 'test' half, so the numbers are not measured on the
data they were tuned on.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, replace
from pathlib import Path

import psycopg

from .config import Settings
from .embeddings import Embedder
from .retrieval import retrieve

QUESTIONS = Path(__file__).resolve().parents[2] / "eval" / "questions.json"


def load_questions(path: Path = QUESTIONS) -> dict:
    d = json.loads(path.read_text())
    for i, q in enumerate(d["in_scope"]):
        q["split"] = "dev" if i % 2 == 0 else "test"
    d["out_of_scope"] = [{"q": q, "split": "dev" if i % 2 == 0 else "test"} for i, q in enumerate(d["out_of_scope"])]
    return d


@dataclass
class ModeResult:
    mode: str
    n_in: int
    recall1: float
    recall3: float
    mrr: float
    answered: float
    n_out: int
    refused: float
    failures: list[str]


def _doc_key(h) -> str:
    return h.source_key.removeprefix("lesson:")


def run(conn: psycopg.Connection, settings: Settings, embedder: Embedder | None, mode: str, split: str | None = None) -> ModeResult:
    d = load_questions()
    use_kw = mode != "vector"
    emb = None if mode == "lexical" else embedder
    r1 = r3 = mrr = answered = 0.0
    fails: list[str] = []
    ins = [q for q in d["in_scope"] if split in (None, q["split"])]
    for q in ins:
        res = retrieve(conn, settings, emb, q["q"], keyword=use_kw)
        keys = [_doc_key(h) for h in res.hits]
        rank = next((i + 1 for i, k in enumerate(keys) if k in q["expect"]), None)
        r1 += rank == 1
        r3 += rank is not None and rank <= 3
        mrr += 1 / rank if rank else 0
        answered += res.evidence.sufficient
        if rank is None or rank > 3 or not res.evidence.sufficient:
            fails.append(f"IN  rank={rank} gate={'ok' if res.evidence.sufficient else 'refused'} :: {q['q']}")
    outs = [q for q in d["out_of_scope"] if split in (None, q["split"])]
    refused = 0.0
    for q in outs:
        res = retrieve(conn, settings, emb, q["q"], keyword=use_kw)
        refused += not res.evidence.sufficient
        if res.evidence.sufficient:
            fails.append(f"OUT answered (should refuse) cov={res.evidence.coverage:.2f} fts={res.evidence.best_fts:.3f} :: {q['q']}")
    n_in, n_out = max(1, len(ins)), max(1, len(outs))
    return ModeResult(mode, len(ins), r1 / n_in, r3 / n_in, mrr / n_in, answered / n_in, len(outs), refused / n_out, fails)


def sweep(conn, settings: Settings, embedder: Embedder | None) -> list[tuple[float, float, float, float, float]]:
    """Grid-search the gate on the dev split. Returns (coverage, fts, cosine, answered_dev, refused_dev) sorted best first."""
    out = []
    for cov in (0.4, 0.5, 0.6, 0.7, 0.8):
        for fts in (0.02, 0.05, 0.1, 0.2):
            for cos in (0.05, 0.12, 0.2, 0.3, 0.4):
                s = replace(settings, min_coverage=cov, min_fts=fts, min_cosine=cos)
                r = run(conn, s, embedder, "hybrid", "dev")
                out.append((cov, fts, cos, r.answered, r.refused))
    # maximise the worse of the two rates, then prefer stricter gates on ties (a wrong answer costs more than a refusal)
    return sorted(out, key=lambda t: (-min(t[3], t[4]), -(t[3] + t[4]), -t[0]))


def format_report(results: list[ModeResult], title: str) -> str:
    lines = [f"## {title}", "", "| mode | in-scope n | recall@1 | recall@3 | MRR | answered | out-of-scope n | refused |", "|---|---|---|---|---|---|---|---|"]
    for r in results:
        lines.append(f"| {r.mode} | {r.n_in} | {r.recall1:.2f} | {r.recall3:.2f} | {r.mrr:.2f} | {r.answered:.2f} | {r.n_out} | {r.refused:.2f} |")
    return "\n".join(lines)
