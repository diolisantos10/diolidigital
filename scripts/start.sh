#!/bin/sh
# Railway PRODUCTION entrypoint — persistence-safe.
#
# Guarantees:
#   - NEVER runs `prisma db push --accept-data-loss`
#   - NEVER seeds automatically
#   - Refuses file: SQLite in production (Railway filesystem is ephemeral —
#     a file: database is wiped on every deploy)
#   - Applies schema changes ONLY via `prisma migrate deploy` (additive,
#     versioned, never destroys data)
#
# For local standalone testing use: npm run start:dev (scripts/start-dev.sh)

set -e

ROOT="$(pwd)"
NODE="$(which node)"
PRISMA="$ROOT/node_modules/.bin/prisma"

# Treat Railway as production even if NODE_ENV is unset.
IS_PRODUCTION="false"
if [ "$NODE_ENV" = "production" ] || [ -n "$RAILWAY_ENVIRONMENT" ]; then
  IS_PRODUCTION="true"
fi

if [ "$IS_PRODUCTION" = "true" ]; then
  echo "▶ Production startup (NODE_ENV=$NODE_ENV RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-unset})"

  # 1. DATABASE_URL must be set explicitly — no silent fallback in production.
  if [ -z "$DATABASE_URL" ]; then
    echo "✗ FATAL: DATABASE_URL is not set."
    echo "  Add DATABASE_URL to Railway Variables (e.g. a libsql:// / Turso URL or managed database)."
    exit 1
  fi

  # 2. Block file: SQLite in production — Railway's filesystem is ephemeral,
  #    so a file: database silently loses ALL data on every deploy.
  case "$DATABASE_URL" in
    file:*)
      echo "✗ FATAL: DATABASE_URL uses a file: SQLite database in production."
      echo "  Railway's filesystem is ephemeral — all data would be lost on every deploy."
      echo "  Use a persistent database (libsql://… Turso, or a Railway volume-backed DB)."
      exit 1
      ;;
  esac

  # 3. Apply pending migrations — additive only, never destructive.
  #    Failure is fatal: booting with a mismatched schema corrupts behavior.
  echo "▶ prisma migrate deploy"
  "$PRISMA" migrate deploy

  # 4. NO automatic seed in production. To seed a brand-new production
  #    database intentionally, run once manually:
  #      railway run node scripts/seed-db.mjs
else
  echo "▶ Non-production startup (NODE_ENV=${NODE_ENV:-unset})"
  # Local convenience fallback only — never reached in production.
  DB="${DATABASE_URL:-}"
  case "$DB" in
    "" | file:./*)
      DB="file:$ROOT/.next/standalone/dev.db"
      ;;
  esac
  export DATABASE_URL="$DB"
  echo "▶ DATABASE_URL=$DATABASE_URL"
  "$PRISMA" migrate deploy || echo "⚠ migrate deploy skipped (dev)"
fi

# Force the standalone server to bind to 0.0.0.0 on Railway's PORT.
# Railway sets HOSTNAME to the container's hostname; Next's standalone server
# would otherwise bind to that name instead of all interfaces, so the Railway
# proxy can't reach it ("Application failed to respond").
export HOSTNAME=0.0.0.0
export PORT="${PORT:-8080}"
echo "▶ Listening on $HOSTNAME:$PORT"

exec "$NODE" "$ROOT/.next/standalone/server.js"
