"""Answer generation. Today: extractive. The interface is what lets a locally hosted open-source LLM slot in later.

`Answerer.answer(question, retrieval)` returns a structured Answer. The web UI renders the structure itself (no
Markdown/HTML from the model), and every sentence carries the index of the passage it came from. An LLM-backed
answerer would have to meet the same contract: only claims drawn from the numbered passages, each with a citation,
and a validator that rejects output citing a passage that was not retrieved.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Protocol

from .retrieval import Hit, Retrieval
from .text import content_stems, stem, tokens


@dataclass
class Citation:
    n: int
    title: str
    chapter: str | None
    lesson_slug: str | None
    section: str
    anchor: str
    url: str | None
    doc_kind: str
    snippet: str
    score: float
    fts: float
    cosine: float | None


@dataclass
class AnswerLine:
    text: str
    cite: int


@dataclass
class Answer:
    status: str                       # "answered" | "insufficient_evidence"
    lines: list[AnswerLine] = field(default_factory=list)
    misconception: AnswerLine | None = None
    read_more: list[int] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)
    message: str | None = None        # shown when refusing
    suggestions: list[str] = field(default_factory=list)


class Answerer(Protocol):
    name: str

    def answer(self, question: str, r: Retrieval) -> Answer: ...


_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9`(])")


def sentences(text: str) -> list[str]:
    """Prose sentences only: code blocks and table rows are not answer material (they cite fine, they just do not read as one)."""
    out: list[str] = []
    in_code = False
    prose: list[str] = []
    for line in text.split("\n"):
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code or line.lstrip().startswith("|"):
            continue
        prose.append(re.sub(r"^\s*([-*]|\d+\.)\s+", "", line))
    for para in "\n".join(prose).split("\n\n"):
        para = " ".join(para.split())
        for s in _SENT.split(para):
            s = s.strip()
            if 6 <= len(s.split()) <= 60:
                out.append(s)
    return out


def _snippet(text: str, n: int = 220) -> str:
    t = " ".join(re.sub(r"```.*?```", " ", text, flags=re.S).split())
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


class ExtractiveAnswerer:
    """Quote the most relevant sentences from the retrieved passages, cite each, never paraphrase.

    Scoring: a sentence earns weight for every question stem it contains, weighted by rarity across the candidate
    sentences (a stem in every sentence tells you little). A small bonus for being a section's opening sentence, where
    our lessons state the main point. No generation means no hallucination, at the cost of fluency.
    """

    name = "extractive-v1"
    MAX_LINES = 3

    def answer(self, question: str, r: Retrieval) -> Answer:
        if not r.evidence.sufficient:
            return self.refuse(question, r)
        qstems = set(r.query_stems)
        top = [h for h in r.hits if h.kind != "misconception"][:3] or r.hits[:3]
        cand: list[tuple[float, int, int, str]] = []   # (score, hit index, position, sentence)
        sents_per_hit = [sentences(h.text) for h in top]
        df: dict[str, int] = {}
        for ss in sents_per_hit:
            for s in ss:
                for st in {stem(t) for t in tokens(s)} & qstems:
                    df[st] = df.get(st, 0) + 1
        total = max(1, sum(len(ss) for ss in sents_per_hit))
        for hi, ss in enumerate(sents_per_hit):
            for pos, s in enumerate(ss):
                present = {stem(t) for t in tokens(s)} & qstems
                if not present:
                    continue
                w = sum(math.log(1 + total / df[p]) for p in present) / max(1.0, sum(math.log(1 + total / max(1, df.get(p, 1))) for p in qstems))
                bonus = 0.08 if pos == 0 else 0.0
                rank_penalty = 0.04 * hi            # prefer sentences from better-ranked passages
                cand.append((w + bonus - rank_penalty, hi, pos, s))
        cand.sort(key=lambda c: (-c[0], c[1], c[2]))
        chosen: list[tuple[float, int, int, str]] = []
        seen_words: list[set[str]] = []
        for c in cand:
            words = set(tokens(c[3]))
            if any(len(words & sw) / max(1, len(words | sw)) > 0.6 for sw in seen_words):
                continue   # near duplicate
            chosen.append(c)
            seen_words.append(words)
            if len(chosen) == self.MAX_LINES:
                break
        if not chosen:
            return self.refuse(question, r, "The relevant passages are code or tables, which I do not quote as an answer. See the sources below.")
        chosen.sort(key=lambda c: (c[1], c[2]))     # read in lesson order, not score order
        order: dict[int, int] = {}
        for _, hi, _, _ in chosen:
            order.setdefault(hi, len(order) + 1)
        lines = [AnswerLine(s, order[hi]) for _, hi, _, s in chosen]
        cited = [top[hi] for hi in sorted(order, key=order.get)]
        citations = [self._cite(i + 1, h) for i, h in enumerate(cited)]
        mis = next((h for h in r.hits if h.kind == "misconception" and (qstems & {stem(t) for t in tokens(h.text)})), None)
        misc_line = None
        if mis is not None:
            citations.append(self._cite(len(citations) + 1, mis))
            body = mis.text.replace("Common misconception: ", "", 1)
            misc_line = AnswerLine(body, len(citations))
        read_more = [c.n for c in citations]
        return Answer("answered", lines, misc_line, read_more, citations)

    def refuse(self, question: str, r: Retrieval, message: str | None = None) -> Answer:
        near = []
        seen: set[str] = set()
        for h in r.hits[:3]:
            if h.source_key not in seen and r.evidence.coverage >= 0.5:
                seen.add(h.source_key)
                near.append(h.title)
        msg = message or ("The lessons don't cover this yet, so I won't guess. " + r.evidence.reason)
        return Answer("insufficient_evidence", message=msg, suggestions=near[:2])

    @staticmethod
    def _cite(n: int, h: Hit) -> Citation:
        return Citation(n, h.title, h.chapter, h.lesson_slug, h.section, h.anchor, h.url, h.doc_kind, _snippet(h.text), round(h.score, 5), round(h.fts, 4),
                        None if h.cosine is None else round(h.cosine, 4))
