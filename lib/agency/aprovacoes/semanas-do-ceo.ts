// semanas-do-ceo.ts — AS SEMANAS QUE ESPERAM O CLIQUE DO DIEGO. SERVER-ONLY.
//
// Bloco B (CEO, 04/10/2026): o Diego aprova pelo celular, 2–3h por dia, a
// partir de 12/10. Medido no código antes deste módulo: aprovar a semana de
// UMA marca levava 7 toques (menu → Agenda geral → "Aprovar semana" → abrir
// a lista → escolher a marca → Aprovar → Confirmar), e o número não aparecia
// em lugar nenhum — o contador de Aprovações nem contava semana.
//
// Este módulo só LÊ: quais marcas em APROVACAO_CEO têm peça esperando na
// próxima semana. Quem grava continua sendo `POST /api/social-posts/aprovacao-ceo`,
// que reconfere o modo e as peças na hora — o número daqui é prévia.

import "server-only";

import { prisma } from "@/lib/db/client";
import { modoEmVigor } from "@/lib/agency/esteira/modo-de-aprovacao";
import { semanaSeguinte } from "@/lib/agency/esteira/semana-editorial";

/** Só rascunho ESPERA decisão. A rota também aceita "approved" (para
 *  reaplicar), mas contar "approved" aqui deixaria o card aceso para sempre
 *  numa semana que já foi decidida. */
const ESPERANDO_DECISAO = "draft";

export interface SemanaParaAprovar {
  clientId: string;
  nome: string;
  /** AAAA-MM-DD em Brasília — o formato que o POST pede. */
  de: string;
  ate: string;
  pecas: number;
}

/** AAAA-MM-DD do dia civil de Brasília (UTC-3, sem horário de verão desde 2019). */
function diaBrasilia(d: Date): string {
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export async function semanasParaOCeoAprovar(workspaceId: string, agora = new Date()): Promise<SemanaParaAprovar[]> {
  const janela = semanaSeguinte(agora);
  const clientes = await prisma.client.findMany({
    where: { workspaceId },
    select: { id: true, name: true, modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true },
    orderBy: { name: "asc" },
  });
  const noModo = clientes.filter((c) => modoEmVigor(c, agora) === "APROVACAO_CEO");
  if (noModo.length === 0) return [];

  const contagem = await prisma.socialPost.groupBy({
    by: ["clientId"],
    where: {
      workspaceId,
      clientId: { in: noModo.map((c) => c.id) },
      scheduledFor: { gte: janela.de, lte: janela.ate },
      status: ESPERANDO_DECISAO,
    },
    _count: { _all: true },
  });
  const porCliente = new Map(contagem.map((g) => [g.clientId, g._count._all]));

  return noModo
    .map((c) => ({ clientId: c.id, nome: c.name, de: diaBrasilia(janela.de), ate: diaBrasilia(janela.ate), pecas: porCliente.get(c.id) ?? 0 }))
    .filter((s) => s.pecas > 0);
}
