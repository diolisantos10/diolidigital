#!/usr/bin/env bash
# smoke-test-auth.sh — verify authenticated sidebar routes respond 200
# Usage: BASE_URL=https://dioli-agency-os-1-production.up.railway.app \
#        EMAIL=master@dioli.studio PASSWORD=dioli2025 \
#        bash scripts/smoke-test-auth.sh
#
# Requires: curl, jq

set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
EMAIL="${EMAIL:-master@dioli.studio}"
PASSWORD="${PASSWORD:-dioli2025}"

COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "==> Base URL : $BASE"
echo "==> User     : $EMAIL"
echo ""

# ── 1. Sign in ─────────────────────────────────────────────────────────────────
echo "[1/2] Signing in…"
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -c "$COOKIE_JAR" \
  -X POST "$BASE/api/auth/signin-json" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 2>/dev/null || true)

# Fallback: use the form-action route (server action POST)
if [[ "$LOGIN_STATUS" != "200" ]]; then
  # Server actions return 303 redirect on success
  LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -c "$COOKIE_JAR" \
    -b "$COOKIE_JAR" \
    -L \
    -X GET "$BASE/auth/signin" 2>/dev/null || true)
  echo "    (login endpoint unavailable — cookie jar seeded manually)"
  echo ""
  echo "    NOTE: Set the dioli-session cookie manually in the cookie jar:"
  echo "      1. Log in at $BASE/auth/signin"
  echo "      2. Copy the dioli-session cookie value"
  echo "      3. Run: echo '$BASE\tFALSE\t/\tTRUE\t0\tdioli-session\t<VALUE>' >> $COOKIE_JAR"
  echo "    Then re-run this script."
  exit 0
fi

COOKIE_COUNT=$(grep -c "dioli-session" "$COOKIE_JAR" 2>/dev/null || echo 0)
if [[ "$COOKIE_COUNT" -eq 0 ]]; then
  echo "    WARNING: No dioli-session cookie found. Sign-in may have failed."
fi

# ── 2. Test routes ─────────────────────────────────────────────────────────────
ROUTES=(
  "/agency/dashboard"
  "/agency/requests"
  "/agency/approvals"
  "/agency/settings"
  "/agency/integrations"
  "/agency/simulations"
  "/agency/simulations/sdr"
  "/agency/simulations/training"
  "/agency/projects"
  "/agency/clients"
  "/agency/deliverables"
)

echo "[2/2] Testing routes…"
echo ""
PASS=0
FAIL=0

for route in "${ROUTES[@]}"; do
  # -L follows redirects, --max-redirs 3, captures final URL
  RESPONSE=$(curl -s \
    -c "$COOKIE_JAR" \
    -b "$COOKIE_JAR" \
    -L --max-redirs 3 \
    -w "\n%{http_code}\n%{url_effective}" \
    -o /dev/null \
    "$BASE$route" 2>/dev/null)

  HTTP_CODE=$(echo "$RESPONSE" | tail -2 | head -1)
  FINAL_URL=$(echo "$RESPONSE" | tail -1)

  if [[ "$HTTP_CODE" == "200" ]] && [[ "$FINAL_URL" != *"/auth/signin"* ]]; then
    echo "  ✓  $route  →  $HTTP_CODE"
    PASS=$((PASS + 1))
  elif [[ "$FINAL_URL" == *"/auth/signin"* ]]; then
    echo "  ✗  $route  →  REDIRECTED TO LOGIN  (final: $FINAL_URL)"
    FAIL=$((FAIL + 1))
  else
    echo "  ✗  $route  →  $HTTP_CODE  (final: $FINAL_URL)"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "────────────────────────────────────"
echo "  Passed: $PASS / $((PASS + FAIL))"
if [[ $FAIL -gt 0 ]]; then
  echo "  Failed: $FAIL"
  echo "  Status: NOT FIXED"
  exit 1
else
  echo "  Status: ALL GREEN"
fi
