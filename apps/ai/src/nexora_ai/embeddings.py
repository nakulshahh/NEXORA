"""Pluggable embedders. The rest of the system only sees `Embedder`.

  hashing : dependency-free, deterministic, keyless. A *lexical* embedding (hashed word/bigram counts). It is NOT
            semantic: it cannot match "slow" with "latency". It exists so the whole pipeline can be developed, tested
            and run anywhere, and so retrieval degrades gracefully if a model cannot be hosted.
  sbert   : a Sentence Transformers model, run locally on CPU (default all-MiniLM-L6-v2, 384 dims, ~22M parameters).
            Truly semantic. Needs `pip install .[sbert]` and a one-time model download from Hugging Face.

Both produce 384-dimensional, L2-normalised vectors, so cosine similarity = dot product and the pgvector column is
the same either way. The index records which embedder built it; mixing them is refused (see ingest.py).
"""
from __future__ import annotations

import hashlib
import math
import zlib
from typing import Protocol

import numpy as np

from .text import STOPWORDS, stem, tokens

DIM = 384


class Embedder(Protocol):
    id: str
    semantic: bool
    dim: int

    def embed(self, texts: list[str]) -> np.ndarray: ...


class HashingEmbedder:
    id = "hashing-v1"
    semantic = False
    dim = DIM

    def _features(self, text: str) -> dict[str, float]:
        toks = [stem(t) for t in tokens(text) if t not in STOPWORDS and len(t) > 1]
        feats: dict[str, float] = {}
        for t in toks:
            feats[t] = feats.get(t, 0.0) + 1.0
        for a, b in zip(toks, toks[1:]):
            k = a + "_" + b
            feats[k] = feats.get(k, 0.0) + 1.0
        return feats

    def embed(self, texts: list[str]) -> np.ndarray:
        out = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, t in enumerate(texts):
            for feat, c in self._features(t).items():
                h = zlib.crc32(feat.encode())              # stable across processes (unlike Python's hash())
                sign = 1.0 if (zlib.crc32(b"s" + feat.encode()) & 1) else -1.0
                out[i, h % self.dim] += sign * (1.0 + math.log(c))
            n = float(np.linalg.norm(out[i]))
            if n > 0:
                out[i] /= n
        return out


class SbertEmbedder:
    semantic = True
    dim = DIM

    def __init__(self, model_name: str):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as e:  # pragma: no cover - exercised on machines with the extra installed
            raise RuntimeError("EMBEDDER=sbert needs the extra: pip install 'nexora-ai[sbert]'") from e
        self._model = SentenceTransformer(model_name, device="cpu")
        self.id = "sbert:" + model_name
        d = self._model.get_sentence_embedding_dimension()
        if d != DIM:
            raise RuntimeError(f"Model {model_name} produces {d}-dim vectors; the schema is vector({DIM}).")

    def embed(self, texts: list[str]) -> np.ndarray:  # pragma: no cover
        return np.asarray(self._model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False), dtype=np.float32)


def make_embedder(name: str, sbert_model: str) -> Embedder:
    if name == "hashing":
        return HashingEmbedder()
    return SbertEmbedder(sbert_model)


def fingerprint(embedder: Embedder) -> str:
    return hashlib.sha256(embedder.id.encode()).hexdigest()[:12]
