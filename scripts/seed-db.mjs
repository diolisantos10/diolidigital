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

  // AgencyWorkspace — cols: id, name, slug, createdAt (NO updatedAt)
  await q(`INSERT OR IGNORE INTO AgencyWorkspace (id, name, slug, createdAt)
    VALUES (?, 'Dioli Agência', 'dioli-agency', datetime('now'))`, [wsId]);
  console.log("✓ Workspace");

  // Users — cols: id, email, name, passwordHash, role, workspaceId, clientId, createdAt, updatedAt
  const masterHash = await hash("dioli2025", 12);
  const staffHash  = await hash("staff2025",  12);
  const clientHash = await hash("cliente2025",12);

  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('cmpyzf27d0001nq7dt0331v31','master@dioli.studio','Dioli Master',?,  'master',          ?, datetime('now'), datetime('now'))`, [masterHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_pm01',     'pm@dioli.studio',           'PM Agência',    ?, 'project_manager', ?, datetime('now'), datetime('now'))`, [staffHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_social01', 'social@dioli.studio',       'Social Staff',  ?, 'social_staff',    ?, datetime('now'), datetime('now'))`, [staffHash, wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, createdAt, updatedAt)
    VALUES ('u_design01', 'design@dioli.studio',       'Design Staff',  ?, 'design_staff',    ?, datetime('now'), datetime('now'))`, [staffHash, wsId]);
  console.log("✓ Users: master@dioli.studio / dioli2025");

  // Client — cols: id, workspaceId, name, industry, email, phone, website, portalToken, createdAt, updatedAt
  await q(`INSERT OR IGNORE INTO Client (id, workspaceId, name, industry, email, portalToken, createdAt, updatedAt)
    VALUES ('c4', ?, 'Dioli Digital', 'Marketing Digital', 'contato@diolidigital.com.br', 'dioli-digital-portal-token', datetime('now'), datetime('now'))`, [wsId]);
  await q(`INSERT OR IGNORE INTO User (id, email, name, passwordHash, role, workspaceId, clientId, createdAt, updatedAt)
    VALUES ('u_client01','cliente@diolidigital.com.br','Dioli Digital',?,'client', ?, 'c4', datetime('now'), datetime('now'))`, [clientHash, wsId]);
  console.log("✓ Client: Dioli Digital");

  // BrandBrain — cols: id, clientId, brandName, tagline, primaryColor, secondaryColor, typography, tone, values, targetAudience, positioning, updatedAt
  await q(`INSERT OR IGNORE INTO BrandBrain (id, clientId, brandName, tagline, primaryColor, secondaryColor, typography, tone, "values", targetAudience, positioning, updatedAt)
    VALUES ('bb_c4','c4','Dioli Digital','A agência que trabalha enquanto você dorme','#5B5BD6','#1C1C1A','Geist Sans','Profissional e próximo','["Inovação","Resultado","Transparência"]','Empresas de médio porte que querem escalar presença digital','Agência full-service com IA integrada', datetime('now'))`);

  // Project — cols: id, workspaceId, clientId, name, goal, type, stage, priority, deadline, proposalStatus, proposalPricing, proposalScope, proposalSentAt, agents, createdAt, updatedAt
  await q(`INSERT OR IGNORE INTO Project (id, workspaceId, clientId, name, goal, type, stage, priority, deadline, proposalStatus, proposalPricing, proposalScope, agents, createdAt, updatedAt)
    VALUES ('p7',?,'c4','Lançamento Dioli Agência','Lançar a Dioli Agência com posicionamento premium no mercado digital','launch','execution','high','2025-08-31','approved','R$ 4.500 / mês','Social media, design, tráfego pago, estratégia','["a2","a3","a4"]', datetime('now'), datetime('now'))`, [wsId]);
  console.log("✓ Project: Lançamento Dioli Agência");

  // Deliverables — cols: id, projectId, name, type, status, revisionStatus, content, clientFeedback, lastFeedback, ownerAgentId, version, revisionHistory, createdAt, updatedAt
  const deliverables = [
    ["d1",  "Identidade visual",               "design",      "approved",  "a2"],
    ["d2",  "Manual da marca",                 "document",    "in_review", "a2"],
    ["d3",  "Posts de lançamento (Pack 10)",   "social_post", "approved",  "a3"],
    ["d4",  "Stories de lançamento",           "social_post", "in_review", "a3"],
    ["d5",  "Campanha Meta Ads — Awareness",   "ads",         "draft",     "a4"],
    ["d6",  "Copy para anúncios — 5 variações","copy",        "approved",  "a4"],
    ["d7",  "Apresentação de posicionamento",  "document",    "approved",  "a2"],
    ["d8",  "Bio e descrição de perfil",       "copy",        "approved",  "a3"],
    ["d9",  "Calendário editorial — Mês 1",    "planning",    "approved",  "a3"],
    ["d10", "Relatório de estratégia digital", "document",    "in_review", "a2"],
    ["d11", "Campanha Google Ads — Search",    "ads",         "draft",     "a4"],
    ["d12", "Landing page — copy e estrutura", "copy",        "in_review", "a3"],
  ];
  for (const [id, name, type, status, ownerAgentId] of deliverables) {
    await q(`INSERT OR IGNORE INTO Deliverable (id, projectId, name, type, status, ownerAgentId, version, createdAt, updatedAt)
      VALUES (?, 'p7', ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`, [id, name, type, status, ownerAgentId]);
  }
  console.log(`✓ Deliverables: ${deliverables.length}`);

  // MaterialRequest — cols: id, projectId, type, description, status, requestedAt, resolvedAt
  await q(`INSERT OR IGNORE INTO MaterialRequest (id, projectId, type, description, status, requestedAt)
    VALUES ('mr1','p7','logo','Logo em vetor (SVG/AI) para aplicações digitais e impressas','pending', datetime('now'))`);

  // DbIntegrationConfig — cols: id, workspaceId, integrationId, configured, selectedModel, configWorkspace, accountId, folder, webhookUrl, lastTestStatus, lastTestAt, lastTestMessage, lastConfiguredAt
  await q(`INSERT OR IGNORE INTO DbIntegrationConfig (id, workspaceId, integrationId, configured, selectedModel, lastTestStatus, lastTestAt, lastTestMessage, lastConfiguredAt)
    VALUES ('ic_openai', ?, 'int-openai-images', 1, 'dall-e-3', 'pass', datetime('now'), 'Configuração pré-instalada — simulação OK.', datetime('now'))`, [wsId]);
  console.log("✓ Integration configs");

  console.log("\n✅ Seed complete!");
  console.log("   Login:  master@dioli.studio / dioli2025");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.close());
