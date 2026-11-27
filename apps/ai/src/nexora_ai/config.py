"""Configuration from environment variables only. Every setting has a safe local default except secrets."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _repo_root() -> Path:
    # apps/ai/src/nexora_ai/config.py -> repo root is four levels up
    return Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class Settings:
    database_url: str
    lessons_dir: Path
    sources_dir: Path
    embedder: str                    # "hashing" | "sbert"
    sbert_model: str
    internal_token: str | None       # shared secret between the Express gateway and this service
    production: bool
    # Evidence gate (see retrieval.py). Calibrated by `nexora-ai eval`; the defaults are for the hashing embedder.
    min_coverage: float
    min_fts: float
    min_wcoverage: float
    min_cosine: float
    top_k: int = 8
    log_level: str = "INFO"
    thresholds_note: str = field(default="")

    @staticmethod
    def load(env: dict[str, str] | None = None) -> "Settings":
        e = os.environ if env is None else env
        root = _repo_root()
        production = e.get("APP_ENV", "development") == "production"
        token = e.get("AI_INTERNAL_TOKEN") or None
        if production and not token:
            raise RuntimeError("AI_INTERNAL_TOKEN must be set in production (shared secret with the API gateway).")
        db = e.get("DATABASE_URL")
        if not db:
            raise RuntimeError("DATABASE_URL is required.")
        embedder = e.get("EMBEDDER", "hashing")
        if embedder not in ("hashing", "sbert"):
            raise RuntimeError("EMBEDDER must be 'hashing' or 'sbert'.")
        return Settings(
            database_url=db,
            lessons_dir=Path(e.get("LESSONS_DIR", root / "packages" / "content" / "lessons")),
            sources_dir=Path(e.get("SOURCES_DIR", root / "packages" / "content" / "sources")),
            embedder=embedder,
            sbert_model=e.get("SBERT_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
            internal_token=token,
            production=production,
            log_level=e.get("LOG_LEVEL", "INFO"),
            min_coverage=float(e.get("MIN_COVERAGE", "0.5")),
            min_wcoverage=float(e.get("MIN_WCOVERAGE", "0.45")),
            min_fts=float(e.get("MIN_FTS", "0.1")),
            min_cosine=float(e.get("MIN_COSINE", "0.3" if embedder == "hashing" else "0.35")),
        )
