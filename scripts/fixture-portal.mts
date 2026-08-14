// Fixture LOCAL para conferir o portal do cliente nas 3 larguras.
// Cria dois clientes de propósito:
//   • "Foocci"  — cheio: projeto, entregas, campanha, calendário, aprovação,
//                 pedido com orçamento, marca meio respondida;
//   • "Bar do Zé" — VAZIO: nenhum projeto, nenhuma entrega, nenhuma aprovação.
//     É o teste da regra 8 do despacho: o portal é molde único, e cliente sem
//     nada tem de abrir uma tela que faz sentido.
// Nunca roda em produção — é script de banca.

import { prisma } from "@/lib/db/client";

/**
 * A TRAVA, porque este script APAGA todos os clientes.
 * "Nunca roda em produção" escrito no comentário é aviso; isto é trava
 * (guardrail 4 do CLAUDE.md). Só passa em banco de arquivo local, e nunca com
 * NODE_ENV=production.
 */
function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL ?? "";
  const local = url.startsWith("file:") && !url.includes("://");
  if (process.env.NODE_ENV === "production" || !local) {
    throw new Error(
      "fixture-portal só roda em banco de arquivo local (DATABASE_URL=file:…) e fora de produção. "
      + "Ele APAGA todos os clientes.",
    );
  }
}

async function main() {
  exigirBancoLocal();

  const ws = await prisma.agencyWorkspace.findFirst();
  if (!ws) throw new Error("rode o seed antes");

  await prisma.portalAccess.deleteMany({});
  await prisma.client.deleteMany({});

  const cheio = await prisma.client.create({
    data: {
      workspaceId: ws.id, name: "Foocci", industry: "FoodTech · SaaS para restaurantes",
      email: "diego@foocci.com.br", phone: "(11) 99999-8888", website: "https://foocci.com.br",
    },
  });
  const vazio = await prisma.client.create({
    data: { workspaceId: ws.id, name: "Bar do Zé", industry: null, email: null },
  });

  await prisma.portalAccess.create({ data: { token: "tok-foocci", clientId: cheio.id } });
  await prisma.portalAccess.create({ data: { token: "tok-vazio", clientId: vazio.id } });

  const projeto = await prisma.project.create({
    data: {
      workspaceId: ws.id, clientId: cheio.id, name: "Campanha de lançamento Foocci",
      goal: "Despertar o interesse de donos e gestores de restaurantes.",
      stage: "producao", presentedAt: new Date(), directionApprovedAt: new Date(),
    },
  });
  await prisma.project.create({
    data: {
      workspaceId: ws.id, clientId: cheio.id, name: "Brand System Foocci",
      goal: "Transformar a marca em um sistema vivo e auditável.", stage: "briefing",
    },
  });

  for (const [nome, tipo, status, vis] of [
    ["Kit de campanha · Restaurantes", "design", "approved", "compartilhado"],
    ["Reels · Demonstração do produto", "social", "delivered", "compartilhado"],
    ["Guia rápido de marca", "branding", "in_review", "compartilhado"],
    ["Rascunho interno de precificação", "estrategia", "draft", "interno"],
  ] as const) {
    await prisma.deliverable.create({
      data: { projectId: projeto.id, name: nome, type: tipo, status, visibility: vis, version: 2 },
    });
  }

  await prisma.adCampaign.create({
    data: {
      workspaceId: ws.id, clientId: cheio.id, connectionId: "conn_local", adAccountId: "act_local",
      externalId: "1", name: "Donos de restaurantes · Prova real", objective: "Novos contatos",
      audience: "Donos de restaurante em São Paulo", dailyBudgetBRL: 30, approvedCapBRL: 900, status: "active",
    },
  });
  await prisma.adCampaign.create({
    data: {
      workspaceId: ws.id, clientId: cheio.id, connectionId: "conn_local", adAccountId: "act_local",
      externalId: "2", name: "Quem já visitou o site", objective: "Lembrança de marca",
      audience: "Visitantes dos últimos 30 dias", dailyBudgetBRL: 18, approvedCapBRL: 540, status: "paused",
    },
  });

  const hoje = new Date();
  for (let i = 0; i < 5; i++) {
    await prisma.socialPost.create({
      data: {
        workspaceId: ws.id, clientId: cheio.id,
        caption: `Post ${i + 1} — como a Foocci atende um restaurante em 30 segundos`,
        networks: '["instagram"]', format: i % 2 ? "reel" : "feed", visibility: "compartilhado",
        scheduledFor: new Date(hoje.getTime() + (i - 2) * 86400000),
        status: i < 2 ? "published" : "scheduled",
      },
    });
  }

  await prisma.approvalRequest.create({
    data: {
      clientId: cheio.id, department: "Social Media", status: "pending", clientVisible: true,
      reviewNote: "Calendário de agosto — 12 peças", expiresAt: new Date(hoje.getTime() + 2 * 86400000),
    },
  });

  await prisma.contentRequest.create({
    data: {
      clientId: cheio.id, title: "Campanha para donos de hamburgueria",
      description: "Quero criar uma campanha para donos de hamburgueria.",
      objective: "Vender mais", status: "triado", scopeDecision: "extra",
      quotedPrice: 1200, quoteNote: "Conceito, 6 peças e configuração da campanha.", quoteStatus: "pendente",
    },
  });

  await prisma.brandBrain.create({
    data: {
      clientId: cheio.id,
      purposeAndPromise: "Devolver autonomia, margem e inteligência aos restaurantes.",
      audienceRelation: "Donos de restaurante, como um parceiro que entende a operação.",
      promiseLimits: "Não prometemos aumento garantido de faturamento.",
    },
  });

  console.log("Portal cheio : /portal/access/tok-foocci");
  console.log("Portal vazio : /portal/access/tok-vazio");
}

main().finally(() => prisma.$disconnect());
