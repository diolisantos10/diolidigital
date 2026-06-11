#!/bin/sh
# DEV-ONLY standalone entrypoint — NEVER use in production.
# Replicates the old demo behavior: db push + seed against a local file: DB.
# Production uses scripts/start.sh (migrate deploy only, no seed).

if [ "$NODE_ENV" = "production" ] || [ -n "$RAILWAY_ENVIRONMENT" ]; then
  echo "✗ FATAL: start-dev.sh must not run in production. Use scripts/start.sh."
  exit 1
fi

ROOT="$(pwd)"
NODE="$(which node)"
PRISMA="$ROOT/node_modules/.bin/prisma"

DB="${DATABASE_URL:-}"
case "$DB" in
  "" | file:./*)
    DB="file:$ROOT/.next/standalone/dev.db"
    ;;
esac
export DATABASE_URL="$DB"
echo "▶ [dev] DATABASE_URL=$DATABASE_URL"

"$PRISMA" db push --accept-data-loss 2>&1 || echo "⚠ db push skipped"
"$NODE"   "$ROOT/scripts/seed-db.mjs"     || echo "⚠ seed skipped"

export HOSTNAME=0.0.0.0
export PORT="${PORT:-8080}"
echo "▶ [dev] Listening on $HOSTNAME:$PORT"

exec "$NODE" "$ROOT/.next/standalone/server.js"
