from __future__ import annotations

from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

SQL_DIR = Path(__file__).resolve().parent / "sql"   # shipped inside the package so a non-editable `pip install .` has it


def _configure(conn: psycopg.Connection) -> None:
    register_vector(conn)
    conn.row_factory = dict_row


def connect(url: str) -> psycopg.Connection:
    """One-off connection (CLI, tests). Creates the extension first if needed so register_vector can find the type."""
    with psycopg.connect(url, autocommit=True) as boot:
        boot.execute("CREATE EXTENSION IF NOT EXISTS vector")
    conn = psycopg.connect(url)
    _configure(conn)
    return conn


def make_pool(url: str, min_size: int = 1, max_size: int = 4) -> ConnectionPool:
    # Small pool: managed Postgres has low connection limits and the Express API shares the same server.
    return ConnectionPool(url, min_size=min_size, max_size=max_size, configure=_configure, open=True, kwargs={"autocommit": False})


def migrate(conn: psycopg.Connection) -> None:
    files = sorted(SQL_DIR.glob("*.sql"))
    if not files:
        raise RuntimeError(f"no SQL migrations found in {SQL_DIR}; the package was built without its data files")
    for f in files:
        conn.execute(f.read_text())
    conn.commit()
