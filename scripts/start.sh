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

  # 2. Block ephemeral file: SQLite in production — Railway's container
  #    filesystem is wiped on every deploy. EXCEPTION: a file: path inside a
  #    mounted Railway Volume (RAILWAY_VOLUME_MOUNT_PATH) IS persistent and
  #    therefore allowed.
  case "$DATABASE_URL" in
    file:*)
      if [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ] && \
         [ "${DATABASE_URL#file:$RAILWAY_VOLUME_MOUNT_PATH/}" != "$DATABASE_URL" ]; then
        echo "▶ SQLite on Railway Volume ($RAILWAY_VOLUME_MOUNT_PATH) — persistent storage, allowed."
      else
        echo "✗ FATAL: DATABASE_URL uses an ephemeral file: SQLite database in production."
        echo "  Railway's container filesystem is wiped on every deploy — all data would be lost."
        echo "  Fix with ONE of:"
        echo "    a) Attach a Railway Volume (e.g. mount at /data) and set:"
        echo "       DATABASE_URL=file:/data/dioli.db"
        echo "    b) Use a remote persistent database:"
        echo "       DATABASE_URL=libsql://<your-db>.turso.io?authToken=…"
        exit 1
      fi
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
