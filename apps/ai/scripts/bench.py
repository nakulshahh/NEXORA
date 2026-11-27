"""Measure what this machine can actually measure about the AI service. Prints facts, not estimates.

    python scripts/bench.py          # embedder = $EMBEDDER (default hashing)

Reports: process RSS after import and after ingest, ingest time, and p50/p95 query latency (embed + SQL + answer).
Run it with EMBEDDER=sbert on your own machine to get the numbers for the real model; none are assumed here.
"""
from __future__ import annotations

import os
import resource
import statistics
import tempfile
import time

from nexora_ai.answer import ExtractiveAnswerer
from nexora_ai.config import Settings
from nexora_ai.db import connect, migrate
from nexora_ai.embeddings import make_embedder
from nexora_ai.evaluate import load_questions
from nexora_ai.ingest import ingest
from nexora_ai.retrieval import retrieve


def rss_mb() -> float:
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith("VmRSS"):
                return int(line.split()[1]) / 1024
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def main() -> None:
    env = dict(os.environ)
    env.setdefault("SOURCES_DIR", tempfile.mkdtemp())
    s = Settings.load(env)
    print(f"embedder={s.embedder}  rss after imports: {rss_mb():.0f} MB")
    t = time.perf_counter(); emb = make_embedder(s.embedder, s.sbert_model); print(f"model load: {time.perf_counter() - t:.2f}s  rss: {rss_mb():.0f} MB")
    conn = connect(s.database_url); migrate(conn)
    t = time.perf_counter(); rep = ingest(conn, s, emb, reindex=True); print(f"ingest: {rep}  {time.perf_counter() - t:.2f}s  rss: {rss_mb():.0f} MB")
    qs = [q["q"] for q in load_questions()["in_scope"]]
    ans = ExtractiveAnswerer(); lat = []
    for q in qs * 3:
        t = time.perf_counter(); ans.answer(q, retrieve(conn, s, emb, q)); lat.append((time.perf_counter() - t) * 1000)
    lat.sort()
    print(f"query latency over {len(lat)} runs: p50 {statistics.median(lat):.0f} ms  p95 {lat[int(len(lat) * .95)]:.0f} ms  rss: {rss_mb():.0f} MB")


if __name__ == "__main__":
    main()
