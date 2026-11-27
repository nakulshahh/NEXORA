"""Build the knowledge base. Idempotent: running it twice changes nothing; editing one lesson re-embeds only it."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

import psycopg

from .chunking import Chunk, chunk_lesson
from .config import Settings
from .embeddings import Embedder
from .mdx import Lesson, blocks_from_markdown, load_lessons
from .sources import load_sources


class EmbedderMismatch(RuntimeError):
    pass


@dataclass
class IngestReport:
    documents: int
    chunks: int
    updated: int
    unchanged: int
    removed: int

    def __str__(self) -> str:
        return f"{self.documents} documents, {self.chunks} chunks ({self.updated} updated, {self.unchanged} unchanged, {self.removed} removed)"


def _check_embedder(conn: psycopg.Connection, embedder: Embedder, reindex: bool) -> None:
    row = conn.execute("SELECT value FROM rag.meta WHERE key = 'embedder'").fetchone()
    if row and row["value"] != embedder.id:
        if not reindex:
            raise EmbedderMismatch(f"Index was built with '{row['value']}', current embedder is '{embedder.id}'. Re-run with --reindex.")
        conn.execute("DELETE FROM rag.documents")
    conn.execute("INSERT INTO rag.meta(key, value) VALUES ('embedder', %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (embedder.id,))


def _docs(settings: Settings) -> list[tuple[dict, list[Chunk]]]:
    docs: list[tuple[dict, list[Chunk]]] = []
    for l in load_lessons(settings.lessons_dir):
        meta = dict(source_key=f"lesson:{l.chapter}/{l.slug}", kind="lesson", title=l.title, chapter=l.chapter, lesson_slug=l.slug, url=None, license=None)
        docs.append((meta, chunk_lesson(l)))
    for s in load_sources(settings.sources_dir):
        fake = Lesson(chapter="", slug=s.key, title=s.title, summary=s.title, order=0, objectives=[], concepts=[], misconceptions=[],
                      blocks=blocks_from_markdown(s.body), exercises=[])
        chunks = [c for c in chunk_lesson(fake) if c.kind != "summary"]
        for i, c in enumerate(chunks):
            c.ord = i
        meta = dict(source_key=s.key, kind=s.kind, title=s.title, chapter=None, lesson_slug=None, url=s.url, license=s.license)
        docs.append((meta, chunks))
    return docs


def ingest(conn: psycopg.Connection, settings: Settings, embedder: Embedder, reindex: bool = False) -> IngestReport:
    _check_embedder(conn, embedder, reindex)
    docs = _docs(settings)
    keys = {m["source_key"] for m, _ in docs}
    existing = {r["source_key"]: r["content_hash"] for r in conn.execute("SELECT source_key, content_hash FROM rag.documents")}
    removed = 0
    for k in set(existing) - keys:
        conn.execute("DELETE FROM rag.documents WHERE source_key = %s", (k,))
        removed += 1
    updated = unchanged = total = 0
    for meta, chunks in docs:
        total += len(chunks)
        doc_hash = hashlib.sha256(("|".join(c.content_hash for c in chunks) + embedder.id + str(meta["title"])).encode()).hexdigest()
        if existing.get(meta["source_key"]) == doc_hash:
            unchanged += 1
            continue
        vecs = embedder.embed([c.index_text for c in chunks])
        row = conn.execute(
            """INSERT INTO rag.documents (source_key, kind, title, chapter, lesson_slug, url, license, content_hash)
               VALUES (%(source_key)s, %(kind)s, %(title)s, %(chapter)s, %(lesson_slug)s, %(url)s, %(license)s, %(h)s)
               ON CONFLICT (source_key) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, chapter = EXCLUDED.chapter,
                 lesson_slug = EXCLUDED.lesson_slug, url = EXCLUDED.url, license = EXCLUDED.license,
                 content_hash = EXCLUDED.content_hash, updated_at = now()
               RETURNING id""", {**meta, "h": doc_hash}).fetchone()
        doc_id = row["id"]
        conn.execute("DELETE FROM rag.chunks WHERE document_id = %s", (doc_id,))
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO rag.chunks (document_id, ord, kind, section, heading_path, anchor, text, context, content_hash, embedding)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [(doc_id, c.ord, c.kind, c.section, c.heading_path, c.anchor, c.text, c.context, c.content_hash, vecs[i]) for i, c in enumerate(chunks)])
        updated += 1
    conn.commit()
    return IngestReport(len(docs), total, updated, unchanged, removed)
