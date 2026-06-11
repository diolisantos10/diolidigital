// Production Persistence Safety Check
// Fails (exit 1) if any configuration could destroy production data.
//
// Checks:
//   1. NODE_ENV=production must not use a file: DATABASE_URL
//   2. `build` / `start` scripts must not contain `db push --accept-data-loss`
//   3. No automatic seed in `build` / `start` (production paths)
//   4. `prisma migrate deploy` must exist in the production startup path
//   5. scripts/start.sh production branch must not push/seed
//
// Run: npx tsx scripts/check-production-safety.ts  (or npm run check:production-safety)

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ── Load files ────────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const startSh = readFileSync(join(ROOT, "scripts", "start.sh"), "utf8");

// Production-path scripts: what Railway actually runs.
const buildScript = pkg.scripts.build ?? "";
const startScript = pkg.scripts.start ?? "";

// Strip comments from shell content so guidance text doesn't trip the checks.
const startShCode = startSh
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

// ── 1. DATABASE_URL safety under NODE_ENV=production ─────────────────────────

if (process.env.NODE_ENV === "production") {
  const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "";
  // start.sh auto-defaults to SQLite on a mounted Railway Volume when
  // DATABASE_URL is unset — mirror that here.
  const dbUrl =
    process.env.DATABASE_URL ?? (volumePath ? `file:${volumePath}/dioli.db` : "");
  check(
    "NODE_ENV=production: persistent database available (DATABASE_URL or Railway Volume)",
    dbUrl.length > 0,
  );
  // file: is allowed ONLY when it points inside a mounted Railway Volume
  // (persistent storage). Any other file: path is ephemeral and gets wiped.
  const isVolumeBacked =
    volumePath.length > 0 && dbUrl.startsWith(`file:${volumePath}/`);
  check(
    "NODE_ENV=production: DATABASE_URL is not ephemeral file:",
    !dbUrl.startsWith("file:") || isVolumeBacked,
    dbUrl.startsWith("file:")
      ? isVolumeBacked
        ? `volume-backed SQLite (${volumePath}) — persistent`
        : "ephemeral file: SQLite is wiped on every Railway deploy"
      : undefined,
  );
} else {
  console.log("ℹ️  NODE_ENV is not production — runtime DATABASE_URL checks skipped (config checks still apply).");
}

// ── 2. No destructive db push in production build/start ──────────────────────

check(
  "`build` script does not contain `db push --accept-data-loss`",
  !buildScript.includes("--accept-data-loss"),
  buildScript.includes("--accept-data-loss") ? buildScript : undefined,
);
check(
  "`build` script does not invoke db:provision",
  !buildScript.includes("db:provision"),
);
check(
  "`start` script does not contain `db push --accept-data-loss`",
  !startScript.includes("--accept-data-loss"),
);

// start.sh: --accept-data-loss must not appear in executable code at all
// (the dev path lives in scripts/start-dev.sh, which refuses to run in prod).
check(
  "scripts/start.sh contains no `db push --accept-data-loss` (code, excluding comments)",
  !startShCode.includes("--accept-data-loss"),
);

// ── 3. No automatic seed in production paths ──────────────────────────────────

check(
  "`build` script does not run seed",
  !buildScript.includes("seed"),
);
check(
  "scripts/start.sh does not execute seed-db.mjs (code, excluding comments)",
  !startShCode.includes("seed-db.mjs"),
);

// ── 4. migrate deploy exists in production startup ────────────────────────────

check(
  "Production startup runs `prisma migrate deploy`",
  startShCode.includes("migrate deploy"),
);
check(
  "package.json exposes db:migrate:deploy",
  (pkg.scripts["db:migrate:deploy"] ?? "").includes("migrate deploy"),
);

// ── 5. Production guards present in start.sh ─────────────────────────────────

check(
  "scripts/start.sh validates DATABASE_URL is set in production",
  startShCode.includes('-z "$DATABASE_URL"'),
);
check(
  "scripts/start.sh blocks file: DATABASE_URL in production",
  /file:\*\)/.test(startShCode),
);

// ── 6. Migration history covers the current schema ───────────────────────────

const migrations = readdirSync(join(ROOT, "prisma", "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
check(
  "Foundation Sprint migration exists (migrate deploy can build full schema)",
  migrations.some((m) => m.includes("foundation_sprint")),
  `migrations: ${migrations.length}`,
);

// ── Verdict ───────────────────────────────────────────────────────────────────

console.log(
  `\n${failures === 0
    ? "✅ PRODUCTION SAFETY PASS — no configuration can destroy production data."
    : `❌ PRODUCTION SAFETY FAIL (${failures} issue${failures > 1 ? "s" : ""}) — fix before deploying.`}`,
);
console.log(`\nRequired Railway Variables:
  DATABASE_URL  — persistent database URL (libsql://…, NOT file:)
  AUTH_SECRET   — JWT signing key (openssl rand -base64 32)
  CRON_SECRET   — cron endpoint protection
  NODE_ENV      — production (Railway usually sets this automatically)\n`);

process.exit(failures === 0 ? 0 : 1);
