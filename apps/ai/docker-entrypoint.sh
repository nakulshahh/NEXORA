#!/bin/sh
# Build/refresh the knowledge base (idempotent: unchanged lessons are skipped), then serve.
# `exec` makes the server PID 1 so SIGTERM reaches uvicorn and the graceful shutdown runs.
set -eu
if [ "${AI_INGEST_ON_START:-1}" = "1" ]; then
  nexora-ai ingest
fi
exec nexora-ai serve --host 0.0.0.0 --port "${PORT:-8000}"
