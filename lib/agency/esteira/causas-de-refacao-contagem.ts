// A CONTAGEM AO VIVO DAS CAUSAS DE REFAÇÃO — a metade que fala com o banco.
//
// Mora separada de `causas-de-refacao.ts` por um motivo mecânico e medido: o
// CATÁLOGO é lido pelo motor de perguntas do briefing, que é componente de
// cliente. Enquanto as duas metades moravam no mesmo arquivo, o build de
// produção quebrava com `lib/db/client.ts` arrastado para o pacote do
// navegador — e nem o `import()` tardio evitava, porque o empacotador segue a
// aresta do mesmo jeito.
//
// Uma verdade só: o catálogo é IMPORTADO daqui, nunca recopiado.

import { prisma } from "@/lib/db/client";
import { CAUSAS, classificarCausa, type Causa, type CausaId } from "@/lib/agency/esteira/causas-de-refacao";

const PORID = new Map<CausaId, Causa>(CAUSAS.map((c) => [c.id, c]));

// ─────────────────────────────────────────────────────────────────────────────
// A CONTAGEM AO VIVO
// ─────────────────────────────────────────────────────────────────────────────

export interface CausaContada {
  causa: Causa;
  ocorrencias: number;
  /** Até três registros reais, para ninguém ter de acreditar no número. */
  exemplos: string[];
}

export interface ContagemDeCausas {
  /** `false` quando a leitura falhou. Nunca "não houve refação" — ausência de
   *  informação não é informação. */
  lidas: boolean;
  /** Ordenado por ocorrências, do que mais custa para o que menos custa. */
  ranking: CausaContada[];
  /** Registros que não casaram com nenhuma causa conhecida. Contados e não
   *  escondidos: é aqui que a próxima causa vai aparecer. */
  naoClassificados: number;
  /** A janela lida, em dias. */
  janelaDias: number;
}

const JANELA_PADRAO_DIAS = 90;
const TETO_DE_REGISTROS = 500;

/**
 * Conta, nos registros REAIS da casa, o que vem custando peça.
 *
 * Três fontes, e as três são o mesmo fenômeno visto de ângulos diferentes:
 *   • `DepartmentLadderRecord` — a peça barrada no piso, no contrato ou pela
 *     Qualidade. É a refação que a casa pegou ANTES de o cliente ver.
 *   • `ActivityEvent` do tipo `peca_reprovada` — o "não é isso" de dentro.
 *   • `Deliverable.clientFeedback` — o pedido de ajuste do CLIENTE, que é o
 *     caro: a peça já foi apresentada e já estava paga.
 *
 * Nunca lança. Falha de leitura devolve `lidas: false`.
 */
export async function contarCausasDeRefacao(input?: {
  workspaceId?: string | null;
  janelaDias?: number;
}): Promise<ContagemDeCausas> {
  const janelaDias = input?.janelaDias ?? JANELA_PADRAO_DIAS;
  const desde = new Date(Date.now() - janelaDias * 24 * 60 * 60 * 1000);
  const ws = input?.workspaceId ?? undefined;

  const textos: string[] = [];
  try {
    const barradas = await prisma.departmentLadderRecord.findMany({
      where: {
        ...(ws ? { workspaceId: ws } : {}),
        criadoEm: { gte: desde },
        resultado: { in: ["reprovada_qualidade", "barrada_piso", "barrada_contrato"] },
      },
      select: { detalhe: true },
      take: TETO_DE_REGISTROS,
    });
    textos.push(...barradas.map((b) => b.detalhe ?? ""));

    const reprovadas = await prisma.activityEvent.findMany({
      where: { ...(ws ? { workspaceId: ws } : {}), type: "peca_reprovada", timestamp: { gte: desde } },
      select: { message: true },
      take: TETO_DE_REGISTROS,
    });
    textos.push(...reprovadas.map((r) => r.message ?? ""));

    // O pedido de ajuste do CLIENTE. Sem filtro de workspace no `Deliverable`
    // (ele não tem a coluna): a chave é o projeto, e a janela é a mesma.
    const ajustes = await prisma.deliverable.findMany({
      where: { updatedAt: { gte: desde }, NOT: { clientFeedback: null } },
      select: { clientFeedback: true, content: true },
      take: TETO_DE_REGISTROS,
    });
    for (const a of ajustes) {
      textos.push(a.clientFeedback ?? "");
      // O `PRECISO CONFIRMAR` que sobrou DENTRO da entrega: a lacuna que virou
      // texto na cara do cliente. É o sintoma mais direto de pergunta que
      // deveria ter sido feita antes.
      for (const m of (a.content ?? "").match(/PRECISO CONFIRMAR:[^\n"]{0,80}/gi) ?? []) textos.push(m);
    }
  } catch (e) {
    console.warn(`[causas-de-refacao] não consegui ler os registros: ${String(e)}`);
    return { lidas: false, ranking: [], naoClassificados: 0, janelaDias };
  }

  const contagem = new Map<CausaId, { n: number; exemplos: string[] }>();
  let naoClassificados = 0;
  for (const t of textos) {
    if (!t.trim()) continue;
    const id = classificarCausa(t);
    if (!id) { naoClassificados++; continue; }
    const atual = contagem.get(id) ?? { n: 0, exemplos: [] };
    atual.n += 1;
    if (atual.exemplos.length < 3) atual.exemplos.push(t.slice(0, 200));
    contagem.set(id, atual);
  }

  const ranking: CausaContada[] = [...contagem.entries()]
    .map(([id, v]) => ({ causa: PORID.get(id)!, ocorrencias: v.n, exemplos: v.exemplos }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias);

  return { lidas: true, ranking, naoClassificados, janelaDias };
}
