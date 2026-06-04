#!/bin/sh
set -e

# Resolve the project root BEFORE the Next.js standalone server chdir's into
# .next/standalone (see .next/standalone/server.js: process.chdir(__dirname)).
ROOT="$(pwd)"

# Normalize DATABASE_URL to an ABSOLUTE file path. Without this, the seed step
# (run from the project root) and the standalone server (run from
# .next/standalone) resolve "file:./dev.db" to two different files, so the
# server opens an empty DB and every query fails with "no such table".
# Remote URLs (libsql://, postgres://, …) are left untouched.
DB="${DATABASE_URL:-file:./dev.db}"
case "$DB" in
  file:./*) DB="file:$ROOT/${DB#file:./}" ;;
esac
export DATABASE_URL="$DB"
echo "▶ DATABASE_URL=$DATABASE_URL"

# Provision schema + seed the demo workspace. Both are idempotent (the seed
# uses upserts), so this is safe to run on every boot.
npx prisma db push --accept-data-loss
npx prisma db seed

exec env HOSTNAME=0.0.0.0 PORT="${PORT:-8080}" node .next/standalone/server.js
