"""Turn a parsed lesson into retrieval chunks.

Design (details and rejected alternatives in docs/LEARNING.md, Phase 7):
  * Chunks never cross a heading, so every chunk has one precise place to link back to.
  * Each chunk carries a context line (lesson > section > subsection). It is indexed with the text, because a
    paragraph like "It costs one round trip" is meaningless without knowing it is about TCP.
  * Code blocks stay whole, glued to the paragraph that introduces them.
  * Misconceptions (from frontmatter) and exercise explanations become their own chunk kinds, so the tutor can name a
    common misconception and ground answers in the explanations the lesson already wrote.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .mdx import Lesson
from .text import github_slug

MAX_WORDS = 150
MIN_WORDS = 25


@dataclass
class Chunk:
    ord: int
    kind: str             # text | code | misconception | check | summary
    section: str
    heading_path: str
    anchor: str
    text: str
    context: str
    words: int

    @property
    def index_text(self) -> str:
        return f"{self.context}\n{self.text}"

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.index_text.encode()).hexdigest()


def _words(s: str) -> int:
    return len(s.split())


def chunk_lesson(lesson: Lesson) -> list[Chunk]:
    chunks: list[Chunk] = []
    seen: dict[str, int] = {}

    def anchor_for(heading: str | None) -> str:
        if not heading:
            return ""
        base = github_slug(heading)
        n = seen.get(base, 0)
        seen[base] = n + 1
        return base if n == 0 else f"{base}-{n}"

    # anchors must follow document order exactly like rehype-slug (every H2/H3, including duplicates)
    anchors: dict[tuple[str | None, str | None], str] = {}
    order: list[tuple[str | None, str | None]] = []
    for b in lesson.blocks:
        key = (b.h2, b.h3)
        if key not in order:
            order.append(key)
    emitted: set[str] = set()
    for h2, h3 in order:
        if h2 and h2 not in emitted:
            anchors[(h2, None)] = anchor_for(h2)
            emitted.add(h2)
        if h3:
            anchors[(h2, h3)] = anchor_for(h3)

    def add(kind: str, h2: str | None, h3: str | None, text: str) -> None:
        sect = h2 or "Introduction"
        path = sect if not h3 else f"{sect} > {h3}"
        ctx = f"{lesson.title} > {path}"
        chunks.append(Chunk(len(chunks), kind, sect, path, anchors.get((h2, h3)) or anchors.get((h2, None), ""), text.strip(), ctx, _words(text)))

    chunks_before = 0
    cur: list[str] = []
    cur_key: tuple[str | None, str | None] | None = None

    def flush() -> None:
        nonlocal cur
        if cur and cur_key is not None:
            add("text", cur_key[0], cur_key[1], "\n\n".join(cur))
        cur = []

    for b in lesson.blocks:
        key = (b.h2, b.h3)
        if key != cur_key:
            flush()
            cur_key = key
        if b.kind == "code" and _words(b.text) > MAX_WORDS:
            flush()
            add("code", b.h2, b.h3, b.text)
            continue
        if cur and _words("\n\n".join(cur)) + _words(b.text) > MAX_WORDS:
            flush()
        cur.append(b.text)
    flush()

    # merge a tiny trailing chunk into the previous one from the same section
    merged: list[Chunk] = []
    for c in chunks:
        if merged and c.kind == "text" and c.words < MIN_WORDS and merged[-1].kind == "text" and merged[-1].section == c.section:
            p = merged[-1]
            p.text += "\n\n" + c.text
            p.words = _words(p.text)
        else:
            merged.append(c)
    chunks = merged

    for ex in lesson.exercises:
        if ex.explain:
            chunks.append(Chunk(0, "check", "Check yourself", "Check yourself", anchors.get(("Check yourself", None), ""),
                                ex.explain, f"{lesson.title} > Check yourself", _words(ex.explain)))
    for belief, correction in lesson.misconceptions:
        t = f"Common misconception: {belief} Correction: {correction}"
        chunks.append(Chunk(0, "misconception", "Common mistakes", "Misconceptions", anchors.get(("Common mistakes", None), ""),
                            t, f"{lesson.title} > Misconceptions", _words(t)))
    chunks.append(Chunk(0, "summary", "Introduction", "Summary", "", f"{lesson.summary} You will be able to: " + "; ".join(lesson.objectives) + ".",
                        f"{lesson.title} > Summary", _words(lesson.summary)))
    for i, c in enumerate(chunks):
        c.ord = i
    return chunks
