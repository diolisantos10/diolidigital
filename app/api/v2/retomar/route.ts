// POST /api/v2/retomar — o botão do PM, com o motor por trás.
//
// Marco 6. Permissão presa à página do PM Command Center (mesma linha do
// inventário) + a regra própria do retomar: PM/Diretor. Idempotente por
// construção: retomar o que não tem nada devolve zero, e zero é sucesso.

import { NextRequest, NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { prisma } from "@/lib/db/client";
import { retomarProcesso, type ArmazemDeRetomada } from "@/lib/agency/v2-recovery/retomar";

function armazemDePrisma(): ArmazemDeRetomada {
  return {
    async efeitosParaRetomar(correlationId) {
      const efeitos = await prisma.outboxV2.findMany({
        where: { correlationId, status: { in: ["failed", "dead"] } },
        select: { id: true },
      });
      return efeitos.map((e) => e.id);
    },
    async devolverParaFila(ids, agora) {
      await prisma.outboxV2.updateMany({
        where: { id: { in: ids } },
        data: { status: "pending", tentativas: 0, proximaTentativaEm: agora, ultimoErro: null },
      });
    },
    async registrarRetomada(correlationId, atorId, efeitos, agora) {
      await prisma.execucaoV2.create({
        data: {
          ator: "humano",
          usuarioId: atorId,
          funcaoId: "pm-orchestrator",
          departamentoId: "project-management",
          ferramentas: JSON.stringify(["retomar-processo"]),
          correlationId,
          inicio: agora,
          fim: agora,
          resultado: `retomada: ${efeitos} efeito(s) devolvidos à fila`,
        },
      });
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const guarda = await exigirApiInterna("/agency/pm-command");
  if (guarda.erro) return guarda.erro;

  let body: { correlationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.correlationId?.trim()) {
    return NextResponse.json({ error: "correlationId é obrigatório" }, { status: 400 });
  }

  const resultado = await retomarProcesso(
    body.correlationId.trim(),
    guarda.acesso.perfil,
    guarda.acesso.session.userId,
    armazemDePrisma(),
    new Date(),
  );
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.motivo }, { status: 403 });
  }
  return NextResponse.json(resultado);
}
