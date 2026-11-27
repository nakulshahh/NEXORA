"""Tokenising and light stemming shared by the hashing embedder, the evidence gate and the answerer."""
from __future__ import annotations

import re

STOPWORDS = frozenset("""
a an the and or but if then else of to in on at by for with from as is are was were be been being am do does did
doing have has had having it its this that these those i you he she we they me my your our their them what which who
whom whose when where why how can could should would will shall may might must not no nor so than too very just also
about into over under again further once here there all any both each few more most other some such only own same
s t don now up down out off while because until against between through during before after above below
tell explain please mean means meant difference between vs versus use used using work works working need needs get gets
""".split())

_WORD = re.compile(r"[a-z0-9]+(?:[.'][a-z0-9]+)*")
_SUFFIXES = ("ations", "ation", "ingly", "ments", "ment", "ness", "ities", "ity", "ings", "ing", "edly", "ed", "ies", "es", "s", "ly")


def stem(w: str) -> str:
    """Very small suffix stripper. Deterministic, dependency free, and only used for matching, never for display."""
    if len(w) <= 3 or w.isdigit():
        return w
    for suf in _SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            base = w[: -len(suf)]
            if suf == "ies":
                return base + "y"
            return base
    return w


def tokens(text: str) -> list[str]:
    return [t.replace("'", "") for t in _WORD.findall(text.lower())]


def content_stems(text: str) -> list[str]:
    """Distinct-order-preserving stems of non-stopword tokens."""
    seen: dict[str, None] = {}
    for t in tokens(text):
        if t in STOPWORDS or len(t) < 2:
            continue
        seen.setdefault(stem(t), None)
    return list(seen)


def github_slug(heading: str) -> str:
    """Matches rehype-slug / github-slugger closely enough for the headings we author (ASCII)."""
    s = heading.strip().lower()
    s = re.sub(r"[^\w\- ]", "", s)
    return s.replace(" ", "-")


def content_terms(text: str) -> list[str]:
    """Distinct, order-preserving *unstemmed* non-stopword tokens. Fed to Postgres, whose English stemmer is the one that
    built the index, so "committed" in a question matches "commit" in a lesson."""
    seen: dict[str, None] = {}
    for t in tokens(text):
        if t in STOPWORDS or len(t) < 2:
            continue
        seen.setdefault(t, None)
    return list(seen)
