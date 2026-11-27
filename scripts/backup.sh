#!/usr/bin/env bash
# Logical backup of the application data (accounts, sessions, progress, reviews).
#   DATABASE_URL=postgres://... scripts/backup.sh [output-dir]
# The AI knowledge base (schema `rag`) is excluded on purpose: it is rebuilt from the lessons by `nexora-ai ingest`.
# The dump contains emails and password hashes. Treat it as a secret: encrypt it at rest, never commit it (backups/ is git-ignored).
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL}"
dir="${1:-backups}"; mkdir -p "$dir"
out="$dir/nexora-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --exclude-schema=rag --file "$out" "$DATABASE_URL"
pg_restore --list "$out" > /dev/null          # a dump that cannot be listed is not a backup
echo "wrote $out ($(du -h "$out" | cut -f1))"
