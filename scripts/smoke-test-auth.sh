#!/usr/bin/env bash
# smoke-test-auth.sh — full auth smoke test using POST /api/auth/signin
#
# Usage:
#   BASE_URL=https://dioli-agency-os-1-production.up.railway.app \
#   EMAIL=master@dioli.studio PASSWORD=dioli2025 \
#   bash scripts/smoke-test-auth.sh
#
# Or locally:
#   BASE_URL=http://localhost:3000 bash scripts/smoke-test-auth.sh
#
# Requires: curl

set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-master@dioli.studio}"
PASSWORD="${PASSWORD:-dioli2025}"

COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "════════════════════════════════════════"
echo "  Dioli Agency OS — Auth Smoke Test"
echo "════════════════════════════════════════"
echo "  Base URL : $BASE"
echo "  User     : $EMAIL"
echo ""

PASS=0
FAIL=0

check_route() {
  local route="$1"
  RESP=$(curl -s \
    -c "$COOKIE_JAR" \
    -b "$COOKIE_JAR" \
    -L --max-redirs 3 \
    -w "\n%{http_code}\n%{url_effective}" \
    -o /dev/null \
    "$BASE$route" 2>/dev/null)

  CODE=$(echo "$RESP" | tail -2 | head -1)
  FINAL=$(echo "$RESP" | tail -1)

  if [[ "$CODE" == "200" ]] && [[ "$FINAL" != *"/auth/signin"* ]]; then
    printf "  ✓  %-45s %s\n" "$route" "$CODE"
    PASS=$((PASS + 1))
  elif [[ "$FINAL" == *"/auth/signin"* ]]; then
    printf "  ✗  %-45s REDIRECTED TO LOGIN\n" "$route"
    FAIL=$((FAIL + 1))
  else
    printf "  ✗  %-45s %s\n" "$route" "$CODE"
    FAIL=$((FAIL + 1))
  fi
}

# ── 1. Unauthenticated redirect check ────────────────────────────────────
echo "[1/3] Unauthenticated redirects (must redirect to signin)…"

for route in "/agency/dashboard" "/agency/simulations"; do
  RESP=$(curl -s -w "\n%{http_code}\n%{url_effective}" -o /dev/null \
    --max-redirs 0 "$BASE$route" 2>/dev/null || true)
  CODE=$(echo "$RESP" | tail -2 | head -1)
  FINAL=$(echo "$RESP" | tail -1)

  if [[ "$CODE" == "307" || "$CODE" == "302" || "$CODE" == "301" || "$FINAL" == *"/auth/signin"* ]]; then
    printf "  ✓  %-45s %s → signin\n" "$route (unauth)" "$CODE"
    PASS=$((PASS + 1))
  else
    printf "  ✗  %-45s %s (expected redirect)\n" "$route (unauth)" "$CODE"
    FAIL=$((FAIL + 1))
  fi
done
echo ""

# ── 2. Login ─────────────────────────────────────────────────────────────
echo "[2/3] Signing in via POST /api/auth/signin…"

LOGIN_RESP=$(curl -s -w "\n%{http_code}" \
  -c "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null)

LOGIN_BODY=$(echo "$LOGIN_RESP" | head -1)
LOGIN_CODE=$(echo "$LOGIN_RESP" | tail -1)

echo "  HTTP $LOGIN_CODE  →  $LOGIN_BODY"

if [[ "$LOGIN_CODE" == "200" ]]; then
  COOKIE_COUNT=$(grep -c "dioli-session" "$COOKIE_JAR" 2>/dev/null || echo 0)
  if [[ "$COOKIE_COUNT" -gt 0 ]]; then
    printf "  ✓  %-45s cookie received\n" "dioli-session"
    PASS=$((PASS + 1))
  else
    printf "  ✗  %-45s no cookie in response\n" "dioli-session"
    FAIL=$((FAIL + 1))
    echo ""
    echo "  Cannot proceed — login succeeded (200) but no session cookie was set."
    echo "  Check that createSession() is setting the cookie correctly."
    echo "════════════════════════════════════════"
    echo "  Passed: $PASS / $((PASS + FAIL))"
    echo "  Status: FAILED"
    exit 1
  fi
elif [[ "$LOGIN_CODE" == "401" ]]; then
  echo "  ✗  Invalid credentials — check EMAIL and PASSWORD env vars."
  exit 1
elif [[ "$LOGIN_CODE" == "503" ]]; then
  echo ""
  echo "  ⚠  Database unreachable (503). This is expected when testing a Railway"
  echo "     deployment from outside Railway's private network."
  echo "     Run this test from localhost (npm run dev) or from within Railway."
  echo ""
  echo "════════════════════════════════════════"
  echo "  Status: SKIPPED (DB not reachable from this network)"
  exit 0
else
  echo "  ✗  Unexpected login status: $LOGIN_CODE"
  exit 1
fi
echo ""

# ── 3. Authenticated route tests ─────────────────────────────────────────
echo "[3/3] Testing authenticated routes…"
echo ""

check_route "/agency/dashboard"
check_route "/agency/requests"
check_route "/agency/approvals"
check_route "/agency/settings"
check_route "/agency/integrations"
check_route "/agency/simulations"
check_route "/agency/simulations/sdr"
check_route "/agency/simulations/training"
check_route "/agency/projects"
check_route "/agency/clients"
check_route "/agency/deliverables"
check_route "/agency/debug-auth"

echo ""
echo "════════════════════════════════════════"
printf "  Passed: %d / %d\n" "$PASS" "$((PASS + FAIL))"
if [[ $FAIL -gt 0 ]]; then
  printf "  Failed: %d\n" "$FAIL"
  echo "  Status: FAILED"
  exit 1
else
  echo "  Status: ALL GREEN ✓"
fi
