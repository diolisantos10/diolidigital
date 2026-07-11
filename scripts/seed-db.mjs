// Plain Node.js seed — no TypeScript, no tsx, no build tools.
// Uses only production dependencies: @libsql/client + bcryptjs.
import { createClient } from "@libsql/client";
import { hash } from "bcryptjs";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;

const db = createClient({ url });

async function q(sql, args = []) {
  return db.execute({ sql, args });
}

async function main() {
  console.log("🌱 Seeding Dioli Agency OS…");

  const wsId = "cmpyzf1nw0000nq7dz5ij66aa";

  // ── Remove demo data from previous seed versions ──────────────────────────
  // These IDs were seeded in early versions and must not appear in production.
  await q(`DELETE FROM Deliverable WHERE id IN ('d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12')`);
  await q(`DELETE FROM MaterialRequest WHERE id = 'mr1'`);
  await q(`DELETE FROM Project WHERE id = 'p7'`);
  await q(`DELETE FROM BrandBrain WHERE id = 'bb_c4'`);
  await q(`DELETE FROM User WHERE id = 'u_client01'`);
  await q(`DELETE FROM Client WHERE id = 'c4'`);
  console.log("✓ Demo data removed");

  // AgencyWorkspace
  await q(`INSERT OR IGNORE INTO AgencyWorkspace (id, name, slug, createdAt)
    VALUES (?, 'Dioli Agência', 'dioli-agency', datetime('now'))`, [wsId]);
  console.log("✓ Workspace");

  // Users (staff only — no demo clients)
  // Passwords come from env so production isn't seeded with a public default.
  // When SEED_MASTER_PASSWORD / SEED_STAFF_PASSWORD are set, the existing users
  // are ROTATED to them (INSERT OR IGNORE alone never updates an existing row).
  const masterPw = process.env.SEED_MASTER_PASSWORD || "dioli2025";
  const staffPw  = process.env.SEED_STAFF_PASSWORD  || "staff2025";
  const usingDefaultMaster = !process.env.SEED_MASTER_PASSWORD;
  const masterHash = await hash(masterPw, 12);
  const staffHash  = await hash(staffPw,  12);

  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('cmpyzf27d0001nq7dt0331v31','master@dioli.studio','Dioli Master',?,'master',?, datetime('now'), datetime('now'))`, [masterHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_pm01','pm@dioli.studio','PM Agência',?,'project_manager',?, datetime('now'), datetime('now'))`, [staffHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_social01','social@dioli.studio','Social Staff',?,'social_staff',?, datetime('now'), datetime('now'))`, [staffHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_design01','design@dioli.studio','Design Staff',?,'design_staff',?, datetime('now'), datetime('now'))`, [staffHash, wsId]);

  // Rotate existing accounts to the env-provided passwords (only when set).
  if (process.env.SEED_MASTER_PASSWORD) {
    await q(`UPDATE User SET passwordHash = ? WHERE email = 'master@dioli.studio'`, [masterHash]);
  }
  if (process.env.SEED_STAFF_PASSWORD) {
    await q(`UPDATE User SET passwordHash = ? WHERE email IN ('pm@dioli.studio','social@dioli.studio','design@dioli.studio')`, [staffHash]);
  }
  if (usingDefaultMaster) {
    console.warn("⚠ SEED_MASTER_PASSWORD não definido — master usando senha PADRÃO pública. Defina uma senha forte nas Variables do Railway.");
  }
  console.log("✓ Users seeded (master@dioli.studio)");

  console.log("\n✅ Seed complete — sistema limpo, sem dados demo.");
  console.log("   Login:  master@dioli.studio");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.close());
