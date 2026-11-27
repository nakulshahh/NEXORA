#!/usr/bin/env bash
# One-time helper: turns the working tree into a readable commit history under YOUR git identity.
# Run once, in the repo root, before the first push:
#   git config user.name "Your Name" && git config user.email "you@example.com"   # if not set globally
#   bash scripts/make-commits.sh
#   git branch -M main && git remote add origin https://github.com/nakulshahh/NEXORA.git && git push -u origin main
# Delete this script afterwards if you like; it is not part of the product.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .git ] || git init -b main
git reset -q            # start from an empty index
node scripts/check-secrets.mjs

TRAILER=$'\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'
c() { # c "message" paths...  (skips silently when the paths have no changes)
  local msg="$1"; shift
  git add -- "$@"
  if git diff --cached --quiet; then echo "skip (nothing): $msg"; else git commit -q -m "$msg$TRAILER" && echo "ok: $msg"; fi
}

# Already have history (e.g. you ran this for an earlier milestone)? Never rewrite it: add the newest work as new commits.
if git rev-parse HEAD >/dev/null 2>&1; then
  echo "Existing history found: committing the working tree on top of it (no rewriting)."
  c "fix(api): guard malformed Referer in the CSRF check; request ids; lean structured logs

Adds the authorization/CSRF/isolation security suite with a route-table drift guard." apps/api
c "feat(ai): request ids, JSON logs without PII, graceful shutdown; ship SQL migrations inside the package

A non-editable install (Render, Docker) previously found no migrations. Adds the
prompt-injection and hostile-input suite." apps/ai
c "feat(web): production CSP and security headers; playground sandbox as its own document

The sandbox is served as /sandbox/frame.html with a deny-all CSP so the page policy never needs unsafe-eval (ADR 0004)." apps/web
c "build: Dockerfiles, full-stack compose, smoke test, load test, backup/restore scripts" \
  .dockerignore docker-compose.yml scripts pnpm-workspace.yaml .gitignore
c "ci: audit and docker jobs, weekly schedule, Dependabot; Render deploys only after checks pass" .github render.yaml
c "docs: security review, operations runbook, load test, ADR 0004, deploy guide and tutorial Phase 11" docs README.md SECURITY.md
  git add -A
  if ! git diff --cached --quiet; then git commit -q -m "chore: remaining files$TRAILER"; echo "ok: remaining files"; fi
  git log --oneline | head -12
  exit 0
fi

c "chore: monorepo scaffold, license and local dev database" \
  .gitignore LICENSE package.json pnpm-workspace.yaml pnpm-lock.yaml docker-compose.yml
c "docs: product blueprint (PRD, curriculum, architecture, RAG design)" docs/BLUEPRINT.md
c "feat(content): MDX lessons for chapters 0.1, 0.2, 0.3, A1 and A4" packages/content
c "feat(api): Express API with accounts, sessions, OAuth and progress sync

Drizzle schema with SQL migrations, Argon2id passwords, hashed-token sessions,
CSRF guard, GitHub and Google OAuth behind a provider port, monotonic progress
merge, OpenAPI document. Tests run against a real Postgres." apps/api
c "feat(web): learning platform UI, lessons, labs, accounts and sync

Design system, landing, roadmap, dashboard, MDX lesson pipeline with validator,
deterministic simulation engine and three labs, sign-in/account pages and a
local-first sync agent." apps/web
c "feat(ai): zero-cost AI Professor service (hybrid retrieval, extractive cited answers)

Python/FastAPI over Postgres full-text + pgvector, pluggable embedder, evidence gate
that refuses when the lessons do not cover a question, eval harness with a
held-out split. No paid API, no required key." apps/ai
c "ci: secret scan, web and API pipelines, Render blueprint, deploy guide" \
  .github render.yaml .dockerignore scripts docs/DEPLOY.md docs/OPERATIONS.md docs/SECURITY-REVIEW.md docs/LOAD-TEST.md docs/load docs/adr docs/AI.md docs/IMPLEMENTED.md SECURITY.md
c "docs: README, status report and LEARNING tutorial" README.md docs/STATUS.md docs/LEARNING.md docs/IMPLEMENTED.md
git add -A
if ! git diff --cached --quiet; then git commit -q -m "chore: remaining files$TRAILER"; echo "ok: remaining files"; fi
git log --oneline
