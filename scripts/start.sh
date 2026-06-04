#!/bin/sh
# Runtime entrypoint for the Next.js standalone server on Railway.
# Intentionally tolerant: the database is already provisioned + seeded at BUILD
# time (see package.json "build"), so the server MUST boot even if none of the
# provisioning steps below succeed at runtime.

ROOT="$(pwd)"

# The standalone server runs `process.chdir(.next/standalone)` on boot, and the
# database is baked into that directory at build time. Point every local-file
# DATABASE_URL at that exact absolute file so the seed step and the server agree
# regardless of working directory. Remote URLs (libsql://, postgres://, …) are
# honored as-is.
DB="${DATABASE_URL:-}"
case "$DB" in
  "" | file:*) DB="file:$ROOT/.next/standalone/dev.db" ;;
esac
export DATABASE_URL="$DB"
echo "▶ DATABASE_URL=$DATABASE_URL"

# Best-effort refresh of schema + seed data. Uses the locally installed CLI
# (never npx, to avoid any network fetch) and never aborts the boot on failure.
PRISMA="$ROOT/node_modules/.bin/prisma"
if [ -x "$PRISMA" ]; then
  "$PRISMA" db push --accept-data-loss || echo "⚠ prisma db push skipped (using build-seeded DB)"
  "$PRISMA" db seed                    || echo "⚠ prisma db seed skipped (using build-seeded DB)"
else
  echo "⚠ prisma CLI unavailable at runtime; relying on build-seeded DB"
fi

exec env HOSTNAME=0.0.0.0 PORT="${PORT:-8080}" node .next/standalone/server.js
