// Reset operacional — devolve a casa ao ZERO sem perder a porta de entrada.
//
// GET /api/admin/reset
//   Auditoria SOMENTE LEITURA. Não apaga nada. Devolve a contagem de tudo que
//   SERIA apagado e de tudo que SERIA preservado, em cada modo. É o "olhar antes
//   de apagar" — rode isto primeiro, sempre.
//   Requer: sessão master. (Não exige ALLOW_PRODUCTION_RESET — ler é seguro.)
//
// DELETE /api/admin/reset
//   Requer: ALLOW_PRODUCTION_RESET=true + sessão master
//   Body:   { confirm: "DELETE_ALL_OPERATIONAL_DATA",
//             mode?: "keep-clients" | "keep-requests" | "everything" }
//   Devolve: { mode, before, after, tablesCleared, requestsPreserved }
//
// Os três modos, do mais conservador ao mais radical:
//
//   "keep-clients" (PADRÃO) — apaga a PRODUÇÃO: projetos, entregas, tarefas,
//     aprovações, artefatos e conversas do portal. PRESERVA o cadastro do
//     cliente e o cérebro de marca (cores, tom de voz, público — o que o
//     sistema aprendeu sobre ele) e as solicitações, que voltam a "new".
//     É o "refazer o trabalho sem perder quem é o cliente".
//
//   "keep-requests" — apaga também o cliente e o cérebro de marca. Sobram só as
//     solicitações, desligadas de qualquer cliente. É o zero de quem vai
//     recomeçar a operação A PARTIR das solicitações que já chegaram.
//
//   "everything" — apaga as solicitações também. Zero absoluto do que a esteira
//     produziu e cadastrou, sem porta de entrada.
//
//   "inauguracao" — o `everything` MAIS a periferia do cliente: o que ele
//     conectou (Meta, Google, Drive, chaves de IA dele), o que ele enviou
//     (mídias, materiais), o que a casa mediu sobre ele (métricas, campanhas,
//     lançamentos) e o login de portal dele. A agência fica de pé: workspace,
//     equipe, chaves da casa e a conta da Meta DA AGÊNCIA continuam intactas.
//     É o "como se estivéssemos inaugurando".
//
// O que NENHUM dos modos toca: workspace, usuários e login, chaves de IA e
// integrações, contas conectadas da Meta, o Radar de mercado, a governança do
// Brain e o histórico de treino do SDR. Isso é a agência, não é dado de cliente.
//
// Para habilitar no Railway: ALLOW_PRODUCTION_RESET=true. Remova depois.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

const CONFIRM_PHRASE = "DELETE_ALL_OPERATIONAL_DATA";

type Mode = "keep-clients" | "keep-requests" | "everything" | "inauguracao";

const MODES: Mode[] = ["keep-clients", "keep-requests", "everything", "inauguracao"];

/** Contagem do que é dado de cliente/projeto — o que o reset alcança. */
async function countOperational() {
  const [
    clients, projects, deliverables, tasks, materialRequests, timelineEvents,
    briefings, strategyRooms, cycles, clientNotices, brandBrains, brandUpdates,
    artifacts, approvals, comments, evidence, portalAccess, portalMessages,
    brainUpdates, socialPosts, activityEvents, aiRunLogs, waMessages, waOutbox,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.project.count(),
    prisma.deliverable.count(),
    prisma.task.count(),
    prisma.materialRequest.count(),
    prisma.timelineEvent.count(),
    prisma.briefing.count(),
    prisma.strategyRoom.count(),
    prisma.cycle.count(),
    prisma.clientNotice.count(),
    prisma.brandBrain.count(),
    prisma.brandUpdate.count(),
    prisma.brainArtifact.count(),
    prisma.approvalRequest.count(),
    prisma.approvalComment.count(),
    prisma.evidenceItem.count(),
    prisma.portalAccess.count(),
    prisma.portalMessage.count(),
    prisma.brainUpdate.count(),
    prisma.socialPost.count(),
    prisma.activityEvent.count(),
    prisma.aIRunLog.count(),
    prisma.whatsAppMessage.count(),
    prisma.whatsAppOutbox.count(),
  ]);
  return {
    clients, projects, deliverables, tasks, materialRequests, timelineEvents,
    briefings, strategyRooms, cycles, clientNotices, brandBrains, brandUpdates,
    artifacts, approvals, comments, evidence, portalAccess, portalMessages,
    brainUpdates, socialPosts, activityEvents, aiRunLogs, waMessages, waOutbox,
  };
}

/** Contagem do que sobrevive a qualquer modo — a agência em si. */
async function countPreserved() {
  const [workspaces, users, integrationConfigs, metaConnections,
         marketInsights, brainChangeRequests, brainVersions, trainingBatches] = await Promise.all([
    prisma.agencyWorkspace.count(),
    prisma.user.count(),
    prisma.dbIntegrationConfig.count(),
        prisma.metaConnection.count(),
    prisma.marketInsight.count(),
    prisma.brainChangeRequest.count(),
    prisma.brainVersion.count(),
    prisma.trainingBatch.count(),
  ]);
  return { workspaces, users, integrationConfigs, metaConnections,
           marketInsights, brainChangeRequests, brainVersions, trainingBatches };
}

async function countRequests() {
  const [total, byStatus] = await Promise.all([
    prisma.clientRequestDb.count(),
    prisma.clientRequestDb.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { total, byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })) };
}

async function requireMaster() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.role !== "master")
    return { error: NextResponse.json({ error: "Forbidden — master role required" }, { status: 403 }) };
  return { session };
}

// ─── Auditoria (não apaga nada) ──────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const guard = await requireMaster();
  if (guard.error) return guard.error;

  const [operational, preserved, requests] = await Promise.all([
    countOperational(), countPreserved(), countRequests(),
  ]);

  return NextResponse.json({
    ok: true,
    action: "audit",
    resetEnabled: process.env.ALLOW_PRODUCTION_RESET === "true",
    willDelete: operational,
    willPreserve: preserved,
    clientRequests: {
      ...requests,
      note: 'Preservadas no modo "keep-requests" (voltam ao status "new"); apagadas no modo "everything".',
    },
  });
}

// ─── Execução ────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  // Desligado a menos que explicitamente habilitado. Devolve 404 para não
  // revelar que o endpoint existe em produção.
  if (process.env.ALLOW_PRODUCTION_RESET !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const guard = await requireMaster();
  if (guard.error) return guard.error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `confirm phrase required: "${CONFIRM_PHRASE}"` },
      { status: 400 },
    );
  }

  const mode: Mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : "keep-clients";

  const before = { ...(await countOperational()), clientRequests: (await countRequests()).total };

  // Ordem de exclusão: primeiro os filhos que NÃO caem por cascata (porque a
  // ClientRequestDb, que seria a mãe deles, é justamente a que fica de pé no
  // modo padrão), depois os projetos e por último os clientes — que cascateiam
  // entregas, tarefas, briefings, ciclos, avisos e o cérebro de marca.
  await prisma.$transaction(async (tx) => {
    await tx.evidenceItem.deleteMany({});
    // A isenção de parceria (27/08/2026). Ela é o que LIBERA produção sem
    // pagamento — uma isenção sobrevivente ao reset é a pior sobra possível:
    // um pedido novo herdaria o direito de produzir de graça de um cliente que
    // não existe mais. O teste-guarda desta casa exigiu esta linha.
    await tx.isencaoDeParceria.deleteMany({});
    // Convite é credencial ligada a cliente: inauguração que deixasse convites
    // para trás entregaria a casa nova com chaves da casa velha na rua.
    // A autorização de parceria é do cliente: casa nova não herda parceiro velho.
    await tx.parceriaDoCliente.deleteMany({});
    await tx.conviteDeParceria.deleteMany({});
    // A ASSINATURA RECORRENTE (27/08/2026), e a sobra dela é de outro tipo — pior.
    // A isenção sobrevivente libera produção de graça; a assinatura sobrevivente
    // libera produção com a competência de um cliente que não existe mais, E
    // deixa a linha viva que o financeiro lê como receita mensal. As COBRANÇAS
    // caem por cascata desta (`onDelete: Cascade`), então não têm linha própria.
    //
    // ⚠️ O QUE ESTA LINHA **NÃO** FAZ, e precisa estar escrito: ela não cancela
    // nada no Mercado Pago. O `preapproval` continua lá, cobrando todo mês.
    // Apagar aqui e esquecer lá é a casa parando de entregar e continuando a
    // receber — o avesso exato do defeito que a recorrência veio consertar.
    // Quem roda o reset com assinatura viva TEM de cancelar no painel do
    // provedor; o log abaixo diz isso na hora, com o número.
    const assinaturasVivas = await tx.assinaturaRecorrente.count({
      where: { estado: { in: ["pendente", "ativa", "inadimplente"] } },
    });
    if (assinaturasVivas > 0) {
      console.error(
        `[admin/reset] ⚠️ ${assinaturasVivas} assinatura(s) NÃO CANCELADA(S) no Mercado Pago foram apagadas desta base. ` +
        "O provedor vai continuar cobrando esses clientes todo mês. Cancele os `preapproval` no painel do Mercado Pago AGORA.",
      );
    }
    await tx.assinaturaRecorrente.deleteMany({});
    await tx.portalAccess.deleteMany({});
    await tx.portalMessage.deleteMany({});
    // O pedido de conteúdo é operacional: cascatearia só junto com o cliente,
    // e no modo padrão o cliente FICA de pé. Sem esta linha um pedido já triado
    // sobreviveria ao reset e reapareceria na caixa de entrada como fantasma.
    await tx.contentRequest.deleteMany({});
    await tx.brainArtifact.deleteMany({});
    await tx.approvalComment.deleteMany({});
    await tx.approvalRequest.deleteMany({});
    await tx.brainUpdate.deleteMany({});
    await tx.socialPost.deleteMany({});
    await tx.whatsAppOutbox.deleteMany({});
    await tx.whatsAppMessage.deleteMany({});
    await tx.aIRunLog.deleteMany({});
    await tx.activityEvent.deleteMany({});

    // Projeto cascateia: Deliverable, MaterialRequest, Task, TimelineEvent,
    // Briefing, StrategyRoom, Cycle.
    await tx.project.deleteMany({});
    // O aviso ao cliente é operacional ("falta o logo") — some junto com a
    // produção que o gerou, em qualquer modo. O cadastro é que decide abaixo.
    await tx.clientNotice.deleteMany({});

    if (mode !== "keep-clients") {
      // Cliente cascateia: BrandBrain, BrandUpdate.
      await tx.client.deleteMany({});
    }

    if (mode === "everything" || mode === "inauguracao") {
      await tx.clientRequestDb.deleteMany({});
    }

    // ── MODO INAUGURAÇÃO ────────────────────────────────────────────────────
    // Ordem do CEO (15/08/2026): *"a gente vai zerar a agência, como se a gente
    // tivesse inaugurando, sem nenhum cliente (...) não quero nenhum resquício
    // (...) configuração, integração, senha, tudo"*. O motivo é operacional, não
    // capricho: ele vai percorrer a esteira etapa por etapa a partir do SDR, e
    // resto de cliente antigo faz a máquina responder sobre coisa que não existe
    // mais — corrige-se um defeito que era só fantasma.
    //
    // `everything` já zerava o que é PRODUÇÃO e CADASTRO. O que sobrevivia a ele
    // era a periferia do cliente: o que ele conectou, o que ele enviou e o que a
    // casa mediu sobre ele. Cada uma dessas linhas é um resquício que
    // reapareceria numa tela.
    //
    // A FRONTEIRA, e ela é a razão de o modo existir separado: sai o que é DO
    // CLIENTE; fica o que é DA CASA. Por isso as conexões e os ativos da Meta
    // são apagados apenas quando têm `clientId` — a conta da própria agência
    // (clientId nulo) é infraestrutura da casa, e derrubá-la exigiria reconectar
    // tudo à mão para publicar o primeiro post.
    if (mode === "inauguracao") {
      // O que o cliente conectou.
      await tx.metaConnection.deleteMany({ where: { NOT: { clientId: null } } });
      await tx.metaAtivoAutorizado.deleteMany({ where: { NOT: { clientId: null } } });
      await tx.googleConnection.deleteMany({ where: { NOT: { clientId: null } } });
      await tx.googleDriveConnection.deleteMany({});
      await tx.googleReview.deleteMany({});
      await tx.clientAiProvider.deleteMany({});

      // O que o cliente enviou, e o que a casa gerou para ele.
      await tx.driveMaterial.deleteMany({});
      await tx.mediaAsset.deleteMany({});

      // O que a casa mediu ou anotou sobre ele.
      await tx.metricaDePost.deleteMany({});
      await tx.adCampaign.deleteMany({});
      await tx.lancamentoFinanceiro.deleteMany({ where: { NOT: { clientId: null } } });
      await tx.departmentLadderRecord.deleteMany({ where: { NOT: { clientId: null } } });

      // Sobras de tabelas que não caem por cascata porque a mãe já se foi.
      await tx.briefing.deleteMany({});
      await tx.strategyRoom.deleteMany({});

      // Usuário de PORTAL (o login do cliente) sai; a equipe da casa fica. Sem
      // isto, a senha de um cliente que não existe mais continuaria abrindo
      // porta — que é exatamente o "senha, tudo" da ordem.
      await tx.user.deleteMany({ where: { NOT: { clientId: null } } });
    }

    if (mode !== "everything" && mode !== "inauguracao") {
      // A porta de entrada fica de pé, de volta ao começo da esteira. No modo
      // que apaga clientes, o vínculo também cai — apontaria para um fantasma.
      await tx.clientRequestDb.updateMany({
        data: mode === "keep-clients" ? { status: "new" } : { status: "new", clientId: null },
      });
    }
  });

  const after = { ...(await countOperational()), clientRequests: (await countRequests()).total };

  return NextResponse.json({
    ok: true,
    mode,
    tablesCleared: [
      "evidenceItem", "portalAccess", "portalMessage", "contentRequest", "brainArtifact",
      "approvalComment", "approvalRequest", "brainUpdate", "socialPost",
      "whatsAppOutbox", "whatsAppMessage", "aIRunLog", "activityEvent",
      "project (+ deliverable, materialRequest, task, timelineEvent, briefing, strategyRoom, cycle)",
      "clientNotice",
      ...(mode === "keep-clients" ? [] : ["client (+ brandBrain, brandUpdate)"]),
      ...(mode === "everything" ? ["clientRequestDb"] : []),
    ],
    preserved: mode === "keep-clients"
      ? "cadastro do cliente + cérebro de marca + solicitações"
      : mode === "keep-requests" ? "solicitações" : "nada de dado de cliente",
    requestsPreserved: mode === "keep-requests" ? after.clientRequests : 0,
    before,
    after,
  });
}
