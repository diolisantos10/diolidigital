// POST /api/cron/v2 — o relógio da V2: outbox, heartbeat e detector, numa batida.
//
// Marco 6. Mesmo padrão dos outros crons: Authorization: Bearer <CRON_SECRET>.
// Cada batida: (1) registra o próprio heartbeat; (2) processa o outbox com
// retentativa/fila morta; (3) detecta relógios ausentes e itens parados por
// SLA. O resultado volta como JSON — o painel do PM lê as mesmas tabelas.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { processarOutbox, type ArmazemDeOutbox, type Executor } from "@/lib/agency/v2-recovery/processador-outbox";
import { detectarAusencias, RELOGIOS_ESPERADOS } from "@/lib/agency/v2-recovery/heartbeat";
import { detectarParados, type ItemMonitorado } from "@/lib/agency/v2-recovery/detector-de-parados";

/** Executores por tipo de efeito. Tipo sem executor vira falha declarada →
 *  retry → fila morta: efeito novo só nasce quando o executor dele existir. */
const EXECUTORES: Record<string, Executor> = {
  // O primeiro executor real: um registro de log estruturado — usado pelos
  // testes de ponta e pelo piloto sintético do M7. Efeitos com consequência
  // externa (mensagem, publicação) ganham executor quando o fluxo que os
  // enfileira for ligado por flag, nunca antes.
  registro_de_teste: async (payload, correlationId) => {
    console.log("[cron/v2] efeito de teste processado", { payload, correlationId });
  },
};

function armazemDePrisma(): ArmazemDeOutbox {
  return {
    async pendentesProntos(agora, limite) {
      return prisma.outboxV2.findMany({
        where: { status: "pending", proximaTentativaEm: { lte: agora } },
        orderBy: { proximaTentativaEm: "asc" },
        take: limite,
        select: { id: true, tipo: true, payload: true, tentativas: true, chaveIdempotencia: true, correlationId: true },
      });
    },
    async marcarEnviado(id, em) {
      await prisma.outboxV2.update({ where: { id }, data: { status: "sent", enviadoEm: em } });
    },
    async marcarFalha(id, tentativas, proximaTentativa, erro) {
      await prisma.outboxV2.update({
        where: { id },
        data: { status: "pending", tentativas, proximaTentativaEm: proximaTentativa, ultimoErro: erro },
      });
    },
    async marcarMorto(id, erro) {
      await prisma.outboxV2.update({ where: { id }, data: { status: "dead", ultimoErro: erro } });
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron endpoint not configured — set CRON_SECRET in Railway Variables" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agora = new Date();

  // 1. A própria batida.
  await prisma.heartbeatDoRelogio.upsert({
    where: { relogio: "cron-v2" },
    update: { ultimaBatida: agora },
    create: { relogio: "cron-v2", ultimaBatida: agora },
  });

  // 2. O outbox.
  const outbox = await processarOutbox(EXECUTORES, armazemDePrisma(), agora);

  // 3. Relógios ausentes.
  const batidas = await prisma.heartbeatDoRelogio.findMany();
  const ausencias = detectarAusencias(
    [...RELOGIOS_ESPERADOS],
    batidas.map((b) => ({ relogio: b.relogio, ultimaBatida: b.ultimaBatida })),
    agora,
    30,
  );

  // 4. Itens parados por estado+SLA (só quem já tem estadoCanonico — o
  //    detector cresce junto com o backfill do rollout).
  const [tarefas, aprovacoes] = await Promise.all([
    prisma.task.findMany({
      where: { estadoCanonico: { not: null } },
      select: { id: true, estadoCanonico: true, updatedAt: true },
      take: 500,
    }),
    prisma.approvalRequest.findMany({
      where: { estadoCanonico: { not: null } },
      select: { id: true, estadoCanonico: true, updatedAt: true },
      take: 500,
    }),
  ]);
  const monitorados: ItemMonitorado[] = [
    ...tarefas.map((t) => ({ id: t.id, entidadeTipo: "Task", estadoCanonico: t.estadoCanonico, atualizadoEm: t.updatedAt })),
    ...aprovacoes.map((a) => ({ id: a.id, entidadeTipo: "ApprovalRequest", estadoCanonico: a.estadoCanonico, atualizadoEm: a.updatedAt })),
  ];
  const parados = detectarParados(monitorados, agora);

  if (ausencias.length > 0) {
    console.error("[cron/v2] relógios ausentes:", ausencias);
  }
  if (parados.parados.length > 0) {
    console.error(`[cron/v2] ${parados.parados.length} item(ns) parados além do SLA`);
  }

  return NextResponse.json({ agora: agora.toISOString(), outbox, ausencias, parados });
}
