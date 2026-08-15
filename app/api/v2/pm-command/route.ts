// API do PM Command Center — a mesma verdade da tela, atrás da MESMA regra.
//
// Marco 4 da V2. A permissão desta rota é a da página `/agency/pm-command`
// (regra da guarda: API e tela presas à mesma linha do inventário). Digitar a
// URL ou chamar com curl passa por aqui do mesmo jeito.

import { NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const guarda = await exigirApiInterna("/agency/pm-command");
  if (guarda.erro) return guarda.erro;

  const [bloqueiosAbertos, outboxPendentes, outboxMortos, aprovacoesAguardando, execucoesIa, execucoesHumanas, transicoes] =
    await Promise.all([
      prisma.bloqueioV2.count({ where: { resolvidoEm: null } }),
      prisma.outboxV2.count({ where: { status: "pending" } }),
      prisma.outboxV2.count({ where: { status: "dead" } }),
      prisma.approvalRequest.count({ where: { status: "pending" } }),
      prisma.execucaoV2.count({ where: { ator: "ia" } }),
      prisma.execucaoV2.count({ where: { ator: "humano" } }),
      prisma.transicaoDeEstado.count(),
    ]);

  return NextResponse.json({
    bloqueiosAbertos,
    outbox: { pendentes: outboxPendentes, mortos: outboxMortos },
    aprovacoesAguardandoCliente: aprovacoesAguardando,
    execucoes: { ia: execucoesIa, humanas: execucoesHumanas },
    transicoesAuditadas: transicoes,
  });
}
