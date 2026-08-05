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

  # 3.5 ── A CÓPIA ANTES DA CIRURGIA ────────────────────────────────────────
  #     Cinco migrations desta casa RECONSTROEM TABELA (PRAGMA foreign_keys=OFF
  #     → CREATE new → INSERT SELECT → DROP → RENAME); uma delas reconstrói 4 de
  #     uma vez, incluindo SocialPost e Deliverable — o trabalho entregue ao
  #     cliente. Interrupção no meio (e o lock do volume JÁ causa retry logo
  #     abaixo) deixa tabela órfã e a real derrubada, sem rollback.
  #
  #     A função de backup já existia e já era conferida. Só nunca rodava no
  #     único momento em que ela é obrigatória. Agora roda — e SÓ quando há
  #     migration pendente: sem cirurgia marcada não se faz pré-operatório.
  #
  #     `migrate status` sai 0 quando não há nada pendente.
  if [ "$PULAR_BACKUP_PRE_MIGRATION" = "1" ]; then
    echo "⚠ PULAR_BACKUP_PRE_MIGRATION=1 — migrations vão rodar SEM cópia de segurança."
  elif "$PRISMA" migrate status >/dev/null 2>&1; then
    echo "▶ Nenhuma migration pendente — backup pré-migration não é necessário."
  else
    echo "▶ Migration pendente detectada — fazendo cópia conferida ANTES de aplicar."
    "$NODE" "$ROOT/scripts/backup-antes-da-migration.mjs"
  fi

  # 4. Apply pending migrations — additive only, never destructive.
  #    Retry on failure: when two deploys boot at the same time they race on the
  #    SQLite volume DB ("database is locked"). A fatal exit here is exactly what
  #    fired the Railway "Deploy Crashed" emails. Retrying lets the loser wait,
  #    re-check, and find no pending migrations once the winner finishes.
  echo "▶ prisma migrate deploy (com retry anti-lock)"
  migrate_ok="false"
  i=1
  while [ "$i" -le 5 ]; do
    if "$PRISMA" migrate deploy; then
      migrate_ok="true"; break
    fi
    echo "⚠ migrate deploy falhou (tentativa $i/5) — provável lock de deploy concorrente; aguardando…"
    sleep $((i * 3))
    i=$((i + 1))
  done
  if [ "$migrate_ok" != "true" ]; then
    echo "✗ FATAL: migrate deploy falhou após 5 tentativas."
    exit 1
  fi

  # 4.5 Diretório de mídia, no MESMO volume persistente do banco.
  #     O byte do arquivo do cliente (vídeo, logo, foto) mora aqui. `public/`
  #     NÃO serve: é copiado no build, então o que for escrito lá em runtime
  #     some no próximo deploy.
  #     Atenção operacional: é o mesmo volume do banco — disco cheio derruba os
  #     dois. A cota por workspace vive em lib/agency/media/armazenamento.ts.
  MEDIA_DIR="$RAILWAY_VOLUME_MOUNT_PATH/media"
  if [ -n "$RAILWAY_VOLUME_MOUNT_PATH" ]; then
    mkdir -p "$MEDIA_DIR"
    echo "▶ Mídia em $MEDIA_DIR ($(du -sh "$MEDIA_DIR" 2>/dev/null | cut -f1) usados)"
    df -h "$RAILWAY_VOLUME_MOUNT_PATH" 2>/dev/null | tail -1 | awk '{print "▶ Volume: " $3 " usados de " $2 " (" $5 " cheio)"}'
  fi

  # 4.6 ffmpeg: o editor de vídeo depende dele, e a falta NÃO derruba o deploy
  #     — ela só faz o reel do cliente nunca ser produzido, em silêncio. Por
  #     isso é dito aqui, alto, no log de todo boot.
  #
  #     Vem de `railpack.json` (deploy.aptPackages). ATENÇÃO: este projeto é
  #     construído pelo RAILPACK, não pelo Nixpacks — um `nixpacks.toml` é
  #     ignorado sem aviso, e foi exatamente assim que a primeira tentativa
  #     falhou em 02/08/2026.
  if command -v ffmpeg >/dev/null 2>&1; then
    echo "▶ ffmpeg presente ($(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3)) — edição de vídeo habilitada"
  else
    echo "⚠ ffmpeg AUSENTE — reels não serão produzidos. Confira deploy.aptPackages em railpack.json"
  fi

  # 4.7 Conserto de dado guardado por variável: o backfill das telas dos
  #     carrosséis. Dito aqui, alto, pelo mesmo motivo do ffmpeg — a diferença
  #     é que este PRECISA ser desligado depois. O trabalho de verdade (ensaio
  #     completo no log, e só então a escrita) roda no boot do app, via
  #     `instrumentation.ts` → `lib/agency/media/backfill-boot.ts`.
  if [ -n "$BACKFILL_CARROSSEL_CLIENT_ID" ]; then
    echo "▶ BACKFILL_CARROSSEL_CLIENT_ID=$BACKFILL_CARROSSEL_CLIENT_ID — a tarefa de backfill"
    echo "  vai rodar UMA vez neste boot. Procure as linhas [backfill-boot] no log:"
    echo "  o ensaio completo sai ANTES de qualquer escrita. REMOVA a variável depois."
  fi

  # 5. Seed initial workspace + users on every boot (idempotent).
  #    seed-db.mjs uses INSERT OR IGNORE throughout — a no-op on populated
  #    databases, so this is safe to run on every restart. Ensures a fresh
  #    Railway Volume always has login credentials available from boot.
  echo "▶ Applying seed (idempotent — INSERT OR IGNORE)"
  "$NODE" "$ROOT/scripts/seed-db.mjs" || echo "⚠ Seed step failed (non-fatal — DB may still be functional)"
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
  # A URL vai para o log SEM a query: com Turso ela carrega
  # `?authToken=<credencial do banco>`, e log é lido, copiado e colado.
  echo "▶ DATABASE_URL=${DATABASE_URL%%\?*}"
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
