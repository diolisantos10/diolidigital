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

  # 0. Auto-configure: if DATABASE_URL is unset but a Railway Volume is
  #    mounted, default to SQLite on the volume — persistent storage, safe.
  if [ -z "$DATABASE_URL" ] && [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
    export DATABASE_URL="file:$RAILWAY_VOLUME_MOUNT_PATH/dioli.db"
    echo "▶ DATABASE_URL not set — defaulting to Railway Volume: $DATABASE_URL"
  fi

  # 1. Without a volume, DATABASE_URL must be set explicitly — no ephemeral
  #    fallback in production.
  if [ -z "$DATABASE_URL" ]; then
    echo "✗ FATAL: no persistent database available."
    echo "  No DATABASE_URL variable and no Railway Volume mounted."
    echo "  Fix with ONE of (Railway dashboard):"
    echo "    a) Service → Settings → Volumes → Attach Volume (mount path: /data)."
    echo "       Nothing else needed — startup auto-uses file:/data/dioli.db."
    echo "    b) Variables → add DATABASE_URL (libsql://… Turso URL or managed DB)."
    exit 1
  fi

  # 2. Reject PostgreSQL URLs — this app uses provider=sqlite (migration_lock.toml)
  #    with @prisma/adapter-libsql, which only accepts file: and libsql:// URLs.
  #    Railway's Postgres service injects postgresql:// which is incompatible;
  #    migrate deploy would also fail due to the sqlite provider lock.
  case "$DATABASE_URL" in
    postgresql://*|postgres://*)
      echo "✗ FATAL: DATABASE_URL is a PostgreSQL URL — incompatible with this app."
      echo "  Schema:  provider=sqlite  (prisma/migration_lock.toml)"
      echo "  Driver:  @prisma/adapter-libsql  (supports file: and libsql:// only)"
      echo "  The Railway Postgres service CANNOT be used here."
      echo "  Fix (Railway dashboard):"
      echo "    a) Remove the Postgres service variable reference from this app service."
      echo "    b) Attach a Railway Volume (mount path: /data) instead."
      echo "       Startup will auto-use file:/data/dioli.db — no other variables needed."
      exit 1
      ;;
  esac

  # 3. Block ephemeral file: SQLite in production — Railway's container
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

  # 4. Apply pending migrations — additive only, never destructive.
  #    Failure is fatal: booting with a mismatched schema corrupts behavior.
  echo "▶ prisma migrate deploy"
  "$PRISMA" migrate deploy

  # 5. NO automatic seed in production. To seed a brand-new production
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
