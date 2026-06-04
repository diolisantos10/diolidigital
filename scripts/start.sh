#!/bin/sh
# Railway runtime entrypoint.
# The database is baked into .next/standalone/dev.db at build time.
# This script ensures the schema + seed exist and the server always boots.

ROOT="$(pwd)"

# Anchor DATABASE_URL to the exact file baked during build.
# Remote URLs (libsql://, postgres://, …) are honored as-is.
DB="${DATABASE_URL:-}"
case "$DB" in
  "" | file:./*)
    DB="file:$ROOT/.next/standalone/dev.db"
    ;;
esac
export DATABASE_URL="$DB"
echo "▶ DATABASE_URL=$DATABASE_URL"

# Best-effort schema push + seed. Both are idempotent and non-fatal.
# seed-db.mjs uses only production dependencies (no tsx/TypeScript tooling).
PRISMA="$ROOT/node_modules/.bin/prisma"
NODE="$(which node)"

"$PRISMA" db push --accept-data-loss 2>&1 || echo "⚠ db push skipped — using build-seeded schema"
"$NODE"   "$ROOT/scripts/seed-db.mjs"     || echo "⚠ seed skipped   — using build-seeded data"

# Force the standalone server to bind to 0.0.0.0 on Railway's PORT.
# Railway sets HOSTNAME to the container's hostname; Next's standalone server
# would otherwise bind to that name instead of all interfaces, so the Railway
# proxy can't reach it ("Application failed to respond").
export HOSTNAME=0.0.0.0
export PORT="${PORT:-8080}"
echo "▶ Listening on $HOSTNAME:$PORT"

exec "$NODE" "$ROOT/.next/standalone/server.js"
