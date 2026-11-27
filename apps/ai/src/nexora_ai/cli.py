from __future__ import annotations

import argparse
import sys

from .config import Settings
from .db import connect, migrate
from .embeddings import make_embedder
from .evaluate import format_report, run
from .ingest import ingest


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="nexora-ai")
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("ingest", help="build or refresh the knowledge base")
    i.add_argument("--reindex", action="store_true", help="rebuild everything (needed when the embedder changes)")
    sub.add_parser("eval", help="retrieval + refusal metrics on eval/questions.json")
    s = sub.add_parser("serve", help="run the HTTP service")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    args = p.parse_args(argv)
    cfg = Settings.load()

    if args.cmd == "serve":
        import uvicorn
        from .api import create_app
        # Our middleware writes the structured access log; uvicorn's plain-text one would duplicate it. On SIGTERM uvicorn stops
        # accepting, lets in-flight requests finish (up to 10 s, under Render's 30 s grace) and runs the lifespan, which closes the pool.
        uvicorn.run(create_app(cfg), host=args.host, port=args.port, access_log=False, timeout_graceful_shutdown=10)
        return 0

    emb = make_embedder(cfg.embedder, cfg.sbert_model)
    with connect(cfg.database_url) as conn:
        migrate(conn)
        if args.cmd == "ingest":
            print(ingest(conn, cfg, emb, reindex=args.reindex))
        else:
            res = [run(conn, cfg, emb, m, "test") for m in ("lexical", "vector", "hybrid")]
            print(format_report(res, f"held-out split, embedder={emb.id}"))
            for f in res[-1].failures:
                print(" ", f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
