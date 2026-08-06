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
//   "everything" — apaga as solicitações também. Zero absoluto, sem porta de
//     entrada. Só faça isto se as solicitações atuais forem lixo de teste.
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

type Mode = "keep-clients" | "keep-requests" | "everything";

const MODES: Mode[] = ["keep-clients", "keep-requests", "everything"];

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

    if (mode === "everything") {
      await tx.clientRequestDb.deleteMany({});
    } else {
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
