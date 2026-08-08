// ─── A PASSAGEM DA OPORTUNIDADE PELO MOINHO ─────────────────────────────────
//
// Uma oportunidade recém-ingerida entra aqui e sai com nota, preço, proposta e
// JULGAMENTO DE CONFORMIDADE gravados. É o elo entre as duas portas de entrada
// e a máquina de `lib/marketplaces/`.
//
// ── POR QUE ESTE ARQUIVO EXISTE (08/08/2026) ────────────────────────────────
//
// Achado anterior, confirmado: `POST /api/agency/oportunidades` (colar) chamava
// a IA; `POST /api/agency/oportunidades/email` (encaminhar o alerta) apenas
// gravava e devolvia. Resultado: **oportunidade que chegava por e-mail entrava
// sem nota, e ninguém a pegava depois** — a fila ordena por nota, e no SQLite
// NULL é o menor valor, então ela nascia no rodapé da lista e ficava lá.
//
// A porta do e-mail é a MAIS BARATA que existe (a plataforma já manda o alerta,
// encaminhar não toca a conta de ninguém) e era a única que não produzia nada.
//
// Copiar o bloco de qualificação para a segunda rota resolveria hoje e criaria a
// divergência de amanhã — duas cópias da mesma regra é o defeito que quebrou o
// portal em 07/08. Uma função, duas chamadas.

import { prisma } from "@/lib/db/client";
import { qualificarOportunidade } from "@/lib/agency/comercial/qualificar";
import { CAMPOS_DE_LEITURA } from "@/lib/agency/comercial/oportunidade";

/** Quantas propostas já enviadas entram na comparação de spam por repetição.
 *  Teto existe porque isto roda em toda ingestão e o SQLite tem um lock de
 *  escrita só; comparar contra o histórico inteiro seria varredura crescente. */
const JANELA_DE_ANTI_SPAM = 30;

export interface ResultadoDaPassagem {
  /** `true` quando algo foi gravado na linha. */
  gravou: boolean;
  /** Por que não gravou, quando não gravou. Nunca silencioso. */
  motivo: string;
}

/**
 * Qualifica uma oportunidade já gravada e persiste o resultado.
 *
 * ── O QUE ESTA FUNÇÃO NUNCA FAZ ─────────────────────────────────────────────
 * Não perde a oportunidade. Ela já está no banco quando chega aqui; falha de IA,
 * de rede ou de banco deixa a linha como estava — sem nota, sem proposta — e a
 * tela DIZ isso. Nota inventada por regra fixa pareceria julgamento e não seria.
 *
 * Não sobe exceção para a rota. A ingestão já deu certo; derrubar a resposta do
 * encaminhador de e-mail por causa da etapa seguinte faria o serviço de e-mail
 * reenviar a mesma mensagem, e a dedup nos salvaria por sorte, não por desenho.
 */
export async function qualificarEGravar(p: {
  id: string;
  workspaceId: string;
  titulo: string;
  descricao: string;
  plataforma: string;
  categoria?: string | null;
  orcamentoInformado?: number | null;
}): Promise<ResultadoDaPassagem> {
  try {
    // As propostas que JÁ SAÍRAM nesta plataforma. Sem elas a trava de spam por
    // repetição não tem contra o que comparar — e uma trava sem entrada é uma
    // trava que passa sempre.
    const enviadas = await prisma.oportunidade
      .findMany({
        where: {
          workspaceId: p.workspaceId,
          plataforma: p.plataforma,
          status: "enviada",
          propostaTexto: { not: null },
        },
        orderBy: { decididoEm: "desc" },
        take: JANELA_DE_ANTI_SPAM,
        select: { propostaTexto: true },
      })
      .catch(() => [] as { propostaTexto: string | null }[]);

    const q = await qualificarOportunidade({
      titulo: p.titulo,
      descricao: p.descricao,
      plataforma: p.plataforma,
      categoria: p.categoria ?? null,
      orcamentoInformado: p.orcamentoInformado ?? null,
      workspaceId: p.workspaceId,
      propostasJaEnviadas: enviadas.map((e) => e.propostaTexto ?? "").filter(Boolean),
    });

    if (!q.ok) return { gravou: false, motivo: q.motivo };

    const k = q.qualificacao;
    await prisma.oportunidade.update({
      where: { id: p.id },
      data: {
        nota: k.nota,
        servicoSugerido: k.servicoSugerido,
        raciocinio: k.raciocinio,
        valorSugerido: k.valorSugerido,
        propostaTexto: k.propostaTexto,
        conformidadeOk: k.conformidade.ok,
        conformidadeAchados: k.conformidade.achados.length ? JSON.stringify(k.conformidade.achados) : null,
        propostaHigienizada: k.higienizado,
        precoDetalhe: k.preco ? JSON.stringify(k.preco) : null,
      },
    });
    return {
      gravou: true,
      motivo: k.conformidade.ok
        ? "Qualificada e aprovada pelo Compliance Validator."
        : `Qualificada e REPROVADA: ${k.conformidade.achados.map((a) => a.regra).join(", ")}. Não há texto copiável.`,
    };
  } catch (e) {
    return { gravou: false, motivo: e instanceof Error ? e.message : "falha na qualificação" };
  }
}

/** A linha completa, para a rota devolver à tela depois da passagem. */
export async function lerOportunidade(id: string, workspaceId: string) {
  return prisma.oportunidade
    .findFirst({ where: { id, workspaceId }, select: CAMPOS_DE_LEITURA })
    .catch(() => null);
}
