"""HTTP surface. Only the Express gateway calls this (X-Internal-Token); browsers never reach it directly."""
from __future__ import annotations

import hmac
import time
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

from .answer import Answerer, ExtractiveAnswerer
from .config import Settings
from .db import make_pool
from .embeddings import Embedder, make_embedder
from .obs import clean_request_id, log_fields, request_id_var, setup_logging
from .retrieval import retrieve


class AskContext(BaseModel):
    chapter: str | None = Field(default=None, max_length=32)
    lesson: str | None = Field(default=None, max_length=80)


class AskBody(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    context: AskContext | None = None


def create_app(settings: Settings | None = None, embedder: Embedder | None = None, answerer: Answerer | None = None) -> FastAPI:
    cfg = settings or Settings.load()
    emb = embedder if embedder is not None else (make_embedder(cfg.embedder, cfg.sbert_model))
    ans = answerer or ExtractiveAnswerer()
    log = setup_logging(cfg.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.pool = make_pool(cfg.database_url)
        yield
        app.state.pool.close()

    app = FastAPI(title="NEXORA AI Professor", version="0.6.0", lifespan=lifespan, docs_url=None if cfg.production else "/docs", redoc_url=None)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = clean_request_id(request.headers.get("x-request-id"))
        tok = request_id_var.set(rid)
        t0 = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-Id"] = rid
            return response
        finally:
            if request.url.path not in ("/healthz", "/readyz"):   # probes every few seconds would drown the log
                log_fields(log, "request", method=request.method, path=request.url.path, status=status, ms=round((time.perf_counter() - t0) * 1000, 1))
            request_id_var.reset(tok)

    def auth(x_internal_token: str | None = Header(default=None)) -> None:
        if cfg.internal_token is None:
            return                     # local development only; production refuses to start without a token
        if not x_internal_token or not hmac.compare_digest(x_internal_token, cfg.internal_token):
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    @app.get("/readyz")
    def readyz() -> dict:
        with app.state.pool.connection() as c:
            n = c.execute("SELECT count(*) AS n FROM rag.chunks").fetchone()["n"]
            stored = c.execute("SELECT value FROM rag.meta WHERE key = 'embedder'").fetchone()
        if n == 0:
            raise HTTPException(status_code=503, detail="knowledge base is empty; run `nexora-ai ingest`")
        if stored and stored["value"] != emb.id:
            raise HTTPException(status_code=503, detail=f"index built with {stored['value']}, service runs {emb.id}")
        return {"ok": True, "chunks": n, "embedder": emb.id}

    @app.post("/v1/ask", dependencies=[Depends(auth)])
    def ask(body: AskBody) -> dict:
        ctx = body.context.model_dump(exclude_none=True) if body.context else None
        with app.state.pool.connection() as c:
            r = retrieve(c, cfg, emb, body.question, ctx)
        a = ans.answer(body.question, r)
        log_fields(log, "ask", qlen=len(body.question), status=a.status, citations=len(a.citations), coverage=round(r.evidence.coverage, 2), retrieval=r.mode)
        return {
            **asdict(a),
            "mode": {"retrieval": r.mode, "embedder": emb.id, "generator": ans.name},
            "evidence": {"coverage": round(r.evidence.coverage, 2), "reason": r.evidence.reason},
        }

    return app
