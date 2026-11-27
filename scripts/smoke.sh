#!/usr/bin/env bash
# End-to-end smoke test through the public entrypoint (the web origin, which proxies /api to the API).
#   scripts/smoke.sh http://localhost:3000
# Used by CI after `docker compose up --wait` and runnable against a deployed site. Creates one throwaway account.
set -euo pipefail
BASE="${1:-http://localhost:3000}"; BASE="${BASE%/}"
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "ok   $*"; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1], {'d': d}))" "$1"; }

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")                    ; [ "$code" = 200 ] || fail "GET / -> $code"; pass "web serves /"
body=$(curl -s "$BASE/api/auth/me")                                         ; [ "$(echo "$body" | json "d['user']")" = None ] || fail "anonymous /me -> $body"; pass "api reachable through the web proxy"
hdr=$(curl -s -D - -o /dev/null "$BASE/api/auth/me" | tr -d '\r' | grep -i '^x-request-id:' || true); [ -n "$hdr" ] || fail "no X-Request-Id on API responses"; pass "request id present ($hdr)"
email="smoke-$(date +%s)-$RANDOM@smoke.invalid"
jar=$(mktemp); trap 'rm -f "$jar"' EXIT
code=$(curl -s -o /dev/null -w '%{http_code}' -c "$jar" -X POST "$BASE/api/auth/register" -H 'content-type: application/json' -H "origin: $BASE" -d "{\"email\":\"$email\",\"password\":\"smoke-test-password-1\"}")
[ "$code" = 201 ] || fail "register -> $code"; pass "register"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$jar" "$BASE/api/progress")      ; [ "$code" = 200 ] || fail "progress -> $code"; pass "authenticated progress read"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/ai/ask" -H 'content-type: application/json' -H "origin: $BASE" -d '{"question":"What is TLS?"}')
[ "$code" = 401 ] || fail "anonymous ask must be 401, got $code"; pass "AI gateway refuses anonymous callers"
ans=$(curl -s -b "$jar" -X POST "$BASE/api/ai/ask" -H 'content-type: application/json' -H "origin: $BASE" -d '{"question":"What is a CORS preflight request?"}')
[ "$(echo "$ans" | json "d['status']")" = answered ] || fail "in-scope question not answered: $ans"
[ "$(echo "$ans" | json "len(d['citations']) > 0")" = True ] || fail "answer without citations"; pass "AI answers an in-scope question with citations"
ref=$(curl -s -b "$jar" -X POST "$BASE/api/ai/ask" -H 'content-type: application/json' -H "origin: $BASE" -d '{"question":"How do I train a neural network?"}')
[ "$(echo "$ref" | json "d['status']")" = insufficient_evidence ] || fail "out-of-scope question was not refused: $ref"; pass "AI refuses an out-of-scope question"
echo "smoke: all checks passed against $BASE"
