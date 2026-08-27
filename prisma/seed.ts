// Prisma seed — populates the Dioli Digital pilot workspace.
// Run: npx prisma db seed

import "dotenv/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hash } from "bcryptjs";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;
const adapter = new PrismaLibSql({ url });
const prisma  = new PrismaClient({ adapter });

/**
 * Lê uma senha do ambiente ou PARA a execução.
 *
 * Fail-closed, como o resto da casa: ausência de chave nunca vira porta
 * aberta, nem senha padrão, nem senha inventada. O erro diz o NOME da
 * variável — nunca o valor de nenhuma delas.
 */
function exigirSenha(nomeDaVariavel: string): string {
  const valor = process.env[nomeDaVariavel];
  if (!valor || valor.trim().length < 12) {
    throw new Error(
      `${nomeDaVariavel} ausente ou fraca (mínimo 12 caracteres). ` +
        `O seed NÃO inventa senha e NÃO cai num padrão — defina a variável de ` +
        `ambiente e rode de novo. Em produção ela vive só no painel da hospedagem.`,
    );
  }
  return valor;
}

async function main() {
  console.log("🌱 Seeding Dioli Agency OS…");

  // ── Workspace ─────────────────────────────────────────────────────────────
  const workspace = await prisma.agencyWorkspace.upsert({
    where:  { slug: "dioli-agency" },
    update: {},
    create: { name: "Dioli Agência", slug: "dioli-agency" },
  });
  console.log(`✓ Workspace: ${workspace.name} (${workspace.id})`);

  // ── Users ─────────────────────────────────────────────────────────────────
  // ── SENHA NÃO MORA NO CÓDIGO ──────────────────────────────────────────────
  // Até 26/08/2026 estas duas linhas carregavam a senha em TEXTO PURO. Quem
  // lesse o repositório entrava como dono da agência. A senha agora vem só do
  // ambiente — e a ausência da variável não vira porta aberta: o seed PARA.
  //
  // Nada de fallback aleatório: senha aleatória por boot parece segura e é
  // pior — cria um master que existe e ninguém consegue usar, e esta casa não
  // tem fluxo de "esqueci minha senha" (app/api/auth/ só tem signin, signout
  // e o Google do briefing). Falhar com motivo claro é a saída honesta.
  const masterHash = await hash(exigirSenha("SEED_MASTER_PASSWORD"), 12);
  const staffHash  = await hash(exigirSenha("SEED_STAFF_PASSWORD"), 12);

  const master = await prisma.user.upsert({
    where:  { email: "master@dioli.studio" },
    update: {},
    create: {
      email:        "master@dioli.studio",
      name:         "Dioli Master",
      passwordHash: masterHash,
      role:         "master",
      workspaceId:  workspace.id,
    },
  });

  await prisma.user.upsert({
    where:  { email: "pm@dioli.studio" },
    update: {},
    create: {
      email:        "pm@dioli.studio",
      name:         "PM Agência",
      passwordHash: staffHash,
      role:         "project_manager",
      workspaceId:  workspace.id,
    },
  });

  await prisma.user.upsert({
    where:  { email: "social@dioli.studio" },
    update: {},
    create: {
      email:        "social@dioli.studio",
      name:         "Social Staff",
      passwordHash: staffHash,
      role:         "social_staff",
      workspaceId:  workspace.id,
    },
  });

  await prisma.user.upsert({
    where:  { email: "design@dioli.studio" },
    update: {},
    create: {
      email:        "design@dioli.studio",
      name:         "Design Staff",
      passwordHash: staffHash,
      role:         "design_staff",
      workspaceId:  workspace.id,
    },
  });

  console.log(`✓ Users: master@dioli.studio + 3 staff (senhas vindas do ambiente)`);

  // ── DADO DE PILOTO: SÓ QUANDO ALGUÉM PEDE ────────────────────────────────
  //
  // 15/08/2026: o CEO zerou a agência para começar do zero pelo SDR, e no
  // restart seguinte reapareceram um cliente, um projeto e DOZE entregas. Não
  // era resquício do reset: era este bloco, que roda a cada deploy e recriava
  // "Dioli Digital", "Lançamento Dioli Agência" e a lista de entregáveis.
  //
  // Seed que inventa cliente em produção é o mesmo defeito que o reset veio
  // resolver, com outro nome: uma segunda fonte de verdade sobre quem é
  // cliente da casa. Agora ele só roda quando alguém PEDE, com SEED_PILOTO=true
  // — e a ausência da variável significa não, como toda trava desta casa.
  //
  // O que continua rodando sempre: workspace, equipe e configuração de
  // integração. Isso é a agência; sem eles ninguém entra.
  if (process.env.SEED_PILOTO === "true") {
    // ── Pilot Client: Dioli Digital (c4) ─────────────────────────────────────
    const pilotClient = await prisma.client.upsert({
      where:  { portalToken: "dioli-digital-portal-token" },
      update: {},
      create: {
        id:          "c4",   // match mock data ID for backwards compat
        workspaceId: workspace.id,
        name:        "Dioli Digital",
        industry:    "Marketing Digital",
        email:       "contato@diolidigital.com.br",
        portalToken: "dioli-digital-portal-token",
      },
    });
    console.log(`✓ Client: ${pilotClient.name} (token: ${pilotClient.portalToken})`);

    // Client user for portal access
    await prisma.user.upsert({
      where:  { email: "cliente@diolidigital.com.br" },
      update: {},
      create: {
        email:        "cliente@diolidigital.com.br",
        name:         "Dioli Digital",
        // Mesma regra do master: senha do ambiente, nunca do código. Este
        // usuário só nasce com SEED_PILOTO=true, mas "é só o piloto" foi
        // exatamente o argumento que deixou a senha do master no repositório.
        passwordHash: await hash(exigirSenha("SEED_PILOTO_CLIENT_PASSWORD"), 12),
        role:         "client",
        workspaceId:  workspace.id,
        clientId:     pilotClient.id,
      },
    });

    // Brand Brain
    await prisma.brandBrain.upsert({
      where:  { clientId: pilotClient.id },
      update: {},
      create: {
        clientId:      pilotClient.id,
        brandName:     "Dioli Digital",
        tagline:       "A agência que trabalha enquanto você dorme",
        primaryColor:  "#5B5BD6",
        secondaryColor: "#1C1C1A",
        typography:    "Geist Sans",
        tone:          "Profissional e próximo",
        values:        JSON.stringify(["Inovação", "Resultado", "Transparência"]),
        targetAudience: "Empresas de médio porte que querem escalar presença digital",
        positioning:   "Agência full-service com IA integrada",
      },
    });

    // ── Pilot Project: Lançamento Dioli Agência (p7) ──────────────────────────
    const pilotProject = await prisma.project.upsert({
      where:  { id: "p7" },
      update: {},
      create: {
        id:              "p7",   // match mock data ID
        workspaceId:     workspace.id,
        clientId:        pilotClient.id,
        name:            "Lançamento Dioli Agência",
        goal:            "Lançar a Dioli Agência com posicionamento premium no mercado digital",
        type:            "launch",
        stage:           "execution",
        priority:        "high",
        deadline:        "2025-08-31",
        proposalStatus:  "approved",
        proposalPricing: "R$ 4.500 / mês",
        proposalScope:   "Social media, design, tráfego pago, estratégia",
        agents:          JSON.stringify(["a2", "a3", "a4"]),
      },
    });
    console.log(`✓ Project: ${pilotProject.name}`);

    // ── Deliverables ──────────────────────────────────────────────────────────
    const deliverables = [
      { id: "d1",  name: "Identidade visual",              type: "design",      status: "approved",   ownerAgentId: "a2" },
      { id: "d2",  name: "Manual da marca",                type: "document",    status: "in_review",  ownerAgentId: "a2" },
      { id: "d3",  name: "Posts de lançamento (Pack 10)",  type: "social_post", status: "approved",   ownerAgentId: "a3" },
      { id: "d4",  name: "Stories de lançamento",          type: "social_post", status: "in_review",  ownerAgentId: "a3" },
      { id: "d5",  name: "Campanha Meta Ads — Awareness",  type: "ads",         status: "draft",      ownerAgentId: "a4" },
      { id: "d6",  name: "Copy para anúncios — 5 variações", type: "copy",      status: "approved",   ownerAgentId: "a4" },
      { id: "d7",  name: "Apresentação de posicionamento", type: "document",    status: "approved",   ownerAgentId: "a2" },
      { id: "d8",  name: "Bio e descrição de perfil",      type: "copy",        status: "approved",   ownerAgentId: "a3" },
      { id: "d9",  name: "Calendário editorial — Mês 1",   type: "planning",    status: "approved",   ownerAgentId: "a3" },
      { id: "d10", name: "Relatório de estratégia digital", type: "document",   status: "in_review",  ownerAgentId: "a2" },
      { id: "d11", name: "Campanha Google Ads — Search",   type: "ads",         status: "draft",      ownerAgentId: "a4" },
      { id: "d12", name: "Landing page — copy e estrutura", type: "copy",       status: "in_review",  ownerAgentId: "a3" },
    ];

    for (const d of deliverables) {
      await prisma.deliverable.upsert({
        where:  { id: d.id },
        update: {},
        create: {
          ...d,
          projectId: pilotProject.id,
        },
      });
    }
    console.log(`✓ Deliverables: ${deliverables.length}`);

    // ── Material Requests ─────────────────────────────────────────────────────
    await prisma.materialRequest.upsert({
      where:  { id: "mr1" },
      update: {},
      create: {
        id:          "mr1",
        projectId:   pilotProject.id,
        type:        "logo",
        description: "Logo em vetor (SVG/AI) para aplicações digitais e impressas",
        status:      "pending",
      },
    });

  } else {
    console.log("✓ Piloto NÃO semeado (SEED_PILOTO ausente) — agência começa sem cliente.");
  }

  // ── Integration Configs ───────────────────────────────────────────────────
  await prisma.dbIntegrationConfig.upsert({
    where: { workspaceId_integrationId: { workspaceId: workspace.id, integrationId: "int-openai-images" } },
    update: {},
    create: {
      workspaceId:     workspace.id,
      integrationId:   "int-openai-images",
      configured:      true,
      selectedModel:   "dall-e-3",
      lastTestStatus:  "pass",
      lastTestAt:      new Date(),
      lastTestMessage: "Configuração pré-instalada — simulação OK.",
      lastConfiguredAt: new Date(),
    },
  });

  console.log("✓ Integration configs seeded");
  console.log(`\n✅ Seed complete!`);
  console.log(`\n📋 Access info:`);
  console.log(`   Agency:  http://localhost:3000/agency/dashboard`);
  console.log(`   Login:   master@dioli.studio (senha: variável SEED_MASTER_PASSWORD)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
