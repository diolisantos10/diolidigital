// GET /api/v2/observabilidade — o painel mínimo do 05, num JSON honesto.
//
// Integração V2. O mínimo de observabilidade da arquitetura mestra, agregado
// no servidor: volume e idade por estado canônico, bloqueios abertos por
// motivo, fila do outbox (com dead letters nomeadas), prova de vida dos
// relógios (ausência é achado), execuções humano × IA com custo somado e
// handoffs aguardando recebimento. Nada aqui escreve — leitura pura.
//
// Permissão: a mesma mesa do PM Command (`/agency/pm-command`, todos os
// internos leem; o recorte fino de ação continua nas superfícies próprias).

import { NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import { detectarAusencias, RELOGIOS_ESPERADOS } from "@/lib/agency/v2-recovery/heartbeat";

const TOLERANCIA_DO_RELOGIO_MIN = 90;

export async function GET() {
  const guarda = await exigirApiInterna("/agency/pm-command");
  if (guarda.erro) return guarda.erro;

  const agora = new Date();

  const [estados, bloqueios, outbox, batidas, execucoes, handoffs] = await Promise.all([
    prisma.task.groupBy({
      by: ["estadoCanonico"],
      _count: { _all: true },
      _min: { createdAt: true },
    }),
    prisma.bloqueioV2.groupBy({
      by: ["tipo"],
      where: { resolvidoEm: null },
      _count: { _all: true },
    }),
    prisma.outboxV2.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.heartbeatDoRelogio.findMany(),
    prisma.execucaoV2.groupBy({
      by: ["ator"],
      _count: { _all: true },
      _sum: { custoUsd: true },
    }),
    prisma.handoffV2.groupBy({
      by: ["paraDepartamento"],
      where: { status: "aguardando_recebimento" },
      _count: { _all: true },
    }),
  ]);

  return NextResponse.json({
    geradoEm: agora.toISOString(),
    estados: estados.map((e) => ({
      estadoCanonico: e.estadoCanonico,
      volume: e._count._all,
      maisAntigoEm: e._min.createdAt,
    })),
    bloqueiosAbertos: bloqueios.map((b) => ({ motivo: b.tipo, volume: b._count._all })),
    outbox: outbox.map((o) => ({ status: o.status, volume: o._count._all })),
    relogios: {
      batidas: batidas.map((b) => ({ relogio: b.relogio, ultimaBatida: b.ultimaBatida })),
      ausentes: detectarAusencias(
        [...RELOGIOS_ESPERADOS],
        batidas.map((b) => ({ relogio: b.relogio, ultimaBatida: b.ultimaBatida })),
        agora,
        TOLERANCIA_DO_RELOGIO_MIN,
      ),
    },
    execucoes: execucoes.map((e) => ({
      ator: e.ator,
      volume: e._count._all,
      custoUsdTotal: e._sum.custoUsd ?? 0,
    })),
    handoffsAguardandoRecebimento: handoffs.map((h) => ({
      paraDepartamento: h.paraDepartamento,
      volume: h._count._all,
    })),
  });
}
