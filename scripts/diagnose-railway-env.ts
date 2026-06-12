// Railway environment diagnostic — prints exactly what DB the app will use and
// what action is needed to fix a crash.
//
// Run locally:  npx tsx scripts/diagnose-railway-env.ts
// Run on Railway: railway run npx tsx scripts/diagnose-railway-env.ts

const DATABASE_URL             = process.env.DATABASE_URL             ?? "";
const RAILWAY_VOLUME_MOUNT_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "";
const RAILWAY_ENVIRONMENT      = process.env.RAILWAY_ENVIRONMENT      ?? "";
const NODE_ENV                 = process.env.NODE_ENV                 ?? "";
const AUTH_SECRET              = process.env.AUTH_SECRET              ?? "";
const CRON_SECRET              = process.env.CRON_SECRET              ?? "";

// Replicate start.sh auto-config logic exactly.
let resolvedDbUrl = DATABASE_URL;
let dbSource = "DATABASE_URL env var";
if (!resolvedDbUrl && RAILWAY_VOLUME_MOUNT_PATH) {
  resolvedDbUrl = `file:${RAILWAY_VOLUME_MOUNT_PATH}/dioli.db`;
  dbSource = `auto-configured from RAILWAY_VOLUME_MOUNT_PATH (${RAILWAY_VOLUME_MOUNT_PATH})`;
}

const isProduction = NODE_ENV === "production" || RAILWAY_ENVIRONMENT !== "";

console.log("=== Dioli Railway Environment Diagnostics ===");
console.log(`Environment: ${isProduction ? "PRODUCTION" : "non-production"}\n`);

// ── Database ──────────────────────────────────────────────────────────────────
console.log("── Database ──");
console.log(`DATABASE_URL:              ${DATABASE_URL || "(not set)"}`);
console.log(`RAILWAY_VOLUME_MOUNT_PATH: ${RAILWAY_VOLUME_MOUNT_PATH || "(not set)"}`);
console.log(`Resolved DB URL:           ${resolvedDbUrl || "(none)"}`);
console.log(`Source:                    ${resolvedDbUrl ? dbSource : "—"}`);
console.log();

if (!resolvedDbUrl) {
  console.log("❌ STATUS: No database configured — app will crash on startup.");
  console.log();
  console.log("FIX (Railway dashboard → dioli-agency-os-1 service):");
  console.log("  Settings → Volumes → Add Volume");
  console.log("  Mount path: /data");
  console.log("  That is all — startup will auto-use file:/data/dioli.db");
} else if (resolvedDbUrl.startsWith("postgresql://") || resolvedDbUrl.startsWith("postgres://")) {
  console.log("❌ STATUS: PostgreSQL URL detected — INCOMPATIBLE with this app.");
  console.log();
  console.log("  Schema uses provider=sqlite (prisma/migration_lock.toml).");
  console.log("  Driver uses @prisma/adapter-libsql (file: and libsql:// only).");
  console.log("  The Railway Postgres service CANNOT be used here.");
  console.log();
  console.log("FIX:");
  console.log("  1. Railway dashboard → dioli-agency-os-1 → Variables");
  console.log("     Remove any reference to the Postgres service DATABASE_URL.");
  console.log("  2. Settings → Volumes → Add Volume, mount path: /data");
} else if (resolvedDbUrl.startsWith("file:")) {
  const onVolume =
    RAILWAY_VOLUME_MOUNT_PATH !== "" &&
    resolvedDbUrl.startsWith(`file:${RAILWAY_VOLUME_MOUNT_PATH}/`);
  if (onVolume) {
    console.log("✅ STATUS: SQLite on Railway Volume — persistent storage, safe.");
  } else if (isProduction) {
    console.log("❌ STATUS: file: URL is NOT on a Railway Volume — data wiped on every deploy.");
    console.log();
    console.log("FIX: attach a Railway Volume at /data and let startup auto-configure.");
  } else {
    console.log("✅ STATUS: Local SQLite file (non-production, expected).");
  }
} else if (resolvedDbUrl.startsWith("libsql://") || resolvedDbUrl.startsWith("wss://")) {
  console.log("✅ STATUS: Remote LibSQL/Turso URL — persistent, compatible with adapter.");
} else {
  console.log(`⚠️  STATUS: Unrecognised URL scheme — verify manually: ${resolvedDbUrl}`);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
console.log();
console.log("── Auth ──");
console.log(`AUTH_SECRET:  ${AUTH_SECRET  ? "✅ set" : "❌ NOT SET — auth will fail (JWT signing impossible)"}`);
console.log(`CRON_SECRET:  ${CRON_SECRET  ? "✅ set" : "❌ NOT SET — cron endpoints return 503"}`);

// ── Quick action summary ──────────────────────────────────────────────────────
const actions: string[] = [];
if (!resolvedDbUrl || resolvedDbUrl.startsWith("postgresql://") || resolvedDbUrl.startsWith("postgres://")) {
  actions.push("Attach Railway Volume at /data (Settings → Volumes → Add Volume)");
}
if (isProduction && resolvedDbUrl.startsWith("file:") && RAILWAY_VOLUME_MOUNT_PATH === "") {
  actions.push("Attach Railway Volume at /data so file: path is persistent");
}
if (!AUTH_SECRET)  actions.push("Set AUTH_SECRET variable (openssl rand -base64 32)");
if (!CRON_SECRET)  actions.push("Set CRON_SECRET variable");

if (actions.length > 0) {
  console.log();
  console.log("── Required Actions ──");
  actions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
} else {
  console.log();
  console.log("✅ All checks passed — environment looks correct.");
}
