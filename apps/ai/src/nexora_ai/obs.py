"""Structured logging and request IDs.

One JSON object per line on stdout (what Render / any log shipper wants). The request id arrives from the Express
gateway in `X-Request-Id`, is echoed back, and is attached to every log line of that request, so one id follows a
question from the browser through the API to retrieval. Question text is never logged: it is user input and can be
personal. We log its length and the outcome instead.
"""
from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
import time
import uuid

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
_VALID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def clean_request_id(raw: str | None) -> str:
    """Accept a well-formed inbound id, otherwise mint one. Never trust the header blindly: it ends up in logs."""
    return raw if raw and _VALID.match(raw) else uuid.uuid4().hex


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {"level": record.levelname.lower(), "time": int(time.time() * 1000), "msg": record.getMessage(), "service": "nexora-ai"}
        rid = request_id_var.get()
        if rid:
            out["reqId"] = rid
        extra = getattr(record, "fields", None)
        if extra:
            out.update(extra)
        if record.exc_info:
            out["err"] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(out, separators=(",", ":"))


class _StdoutHandler(logging.StreamHandler):
    """Looks sys.stdout up on every write, so it follows redirection (tests, process managers) instead of pinning the first stream."""
    def __init__(self) -> None:
        logging.Handler.__init__(self)

    @property
    def stream(self):  # type: ignore[override]
        return sys.stdout


def setup_logging(level: str = "INFO") -> logging.Logger:
    log = logging.getLogger("nexora")
    if not any(isinstance(h.formatter, JsonFormatter) for h in log.handlers):
        h = _StdoutHandler()
        h.setFormatter(JsonFormatter())
        log.addHandler(h)
    log.setLevel(level.upper())
    log.propagate = False
    return log


def log_fields(log: logging.Logger, msg: str, level: int = logging.INFO, **fields) -> None:
    log.log(level, msg, extra={"fields": fields})
