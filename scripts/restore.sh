#!/usr/bin/env bash
# Restore a dump made by scripts/backup.sh into TARGET_DATABASE_URL.
#   TARGET_DATABASE_URL=postgres://... CONFIRM=yes scripts/restore.sh backups/nexora-....dump
# Restores into a *different* database first (a drill) before you ever point it at production: this REPLACES the tables it contains.
set -euo pipefail
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
file="${1:?usage: restore.sh <dump file>}"
[ "${CONFIRM:-}" = yes ] || { echo "refusing: this replaces data in the target database. Re-run with CONFIRM=yes." >&2; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname "$TARGET_DATABASE_URL" "$file"
echo "restored $file"
