// integridade-do-panorama.ts — ONDE A COMPARAÇÃO ENCOSTA NO RELATÓRIO.
//
// A conciliação existir e o relatório não usá-la seria o mesmo defeito com uma
// camada a mais: a casa saberia e mostraria o número limpo assim mesmo. Este
// arquivo é a costura, e mora FORA de `ads-leitura.ts` de propósito — o plano
// de mensuração lê `RESULTADO_POR_OBJETIVO` de lá, e costurar dentro criaria um
// ciclo de import entre a leitura e a medição.
//
// ── O QUE ELE GARANTE ───────────────────────────────────────────────────────
//
// Panorama SEM campanha nenhuma não sai "íntegro": sai `nao_medido`. Conta sem
// campanha é um estado conhecido; medição de uma conta sem campanha não é
// medição limpa, é ausência de medição — e a lista vazia de conciliações é
// exatamente onde um sistema de dois estados escreveria "tudo certo".

import type { DesempenhoDaCampanha } from "@/lib/integrations/meta/ads-leitura";
import { conciliarCampanhaDaMeta, confiavel, type Conciliacao, type EstadoDaMedicao } from "./conciliacao";
import { avisoDoRelatorio, apresentarNumero, type NumeroApresentavel } from "./apresentacao";

export interface IntegridadeDaMedicao {
  /** O pior estado entre as campanhas. `nao_medido` quando não houve comparação. */
  estado: EstadoDaMedicao;
  /** A comparação rodou para PELO MENOS uma campanha? */
  comparacaoRodou: boolean;
  /** A frase de cabeçalho. Vazia SÓ quando tudo está íntegro. */
  aviso: string;
  /** Por campanha, para a tela poder marcar linha a linha. */
  porCampanha: Array<{ campanhaId: string; nome: string; conciliacao: Conciliacao }>;
  /** Os totais do período, já sob a luz da integridade. */
  totais: Record<string, NumeroApresentavel>;
}

export function medirIntegridade(entrada: {
  desempenho: DesempenhoDaCampanha[];
  totais: { gasto: number | null; impressoes: number | null; alcance: number | null; cliques: number | null };
  /**
   * O PASSADO, por id de campanha: os nomes de evento do período anterior
   * (`serie.ts` → `passadoDasCampanhas`). Campanha ausente do mapa = sem
   * passado registrado = NÃO MEDIDO, jamais íntegro.
   *
   * Sem `?`: quem mede é obrigado a ir buscar o passado ou a declarar `{}`.
   * Um parâmetro opcional aqui é o mesmo detector desabastecido de antes, só
   * que agora com a desculpa de já existir.
   */
  passado: Record<string, string[]>;
}): IntegridadeDaMedicao {
  const porCampanha = entrada.desempenho.map((d) => ({
    campanhaId: d.campanhaId,
    nome: d.nome,
    conciliacao: conciliarCampanhaDaMeta({
      objetivo: d.objetivo,
      acoes: d.acoes,
      eventosAntes: entrada.passado[d.campanhaId] ?? null,
    }),
  }));

  const conciliacoes = porCampanha.map((p) => p.conciliacao);
  const estado: EstadoDaMedicao =
    conciliacoes.length === 0 ? "nao_medido"
    : conciliacoes.some((c) => c.estado === "incompleto") ? "incompleto"
    : conciliacoes.some((c) => c.estado === "nao_medido") ? "nao_medido"
    : "integro";

  // O total do período herda o PIOR estado das campanhas que o compõem: um
  // total somado sobre uma campanha com evento faltando é um total menor.
  const doTotal: Conciliacao =
    conciliacoes.length === 0
      ? { estado: "nao_medido", comparacaoRodou: false, esperados: [], recebidos: [], faltando: [],
          motivo: "nenhuma campanha no período — não houve comparação esperado × recebido." }
      : (conciliacoes.find((c) => c.estado === "incompleto")
        ?? conciliacoes.find((c) => c.estado === "nao_medido")
        ?? conciliacoes[0]!);

  return {
    estado,
    comparacaoRodou: conciliacoes.some((c) => c.comparacaoRodou),
    aviso: avisoDoRelatorio(conciliacoes),
    porCampanha,
    totais: {
      gasto: apresentarNumero(entrada.totais.gasto, doTotal, { rotulo: "Gasto" }),
      impressoes: apresentarNumero(entrada.totais.impressoes, doTotal, { rotulo: "Impressões" }),
      alcance: apresentarNumero(entrada.totais.alcance, doTotal, { rotulo: "Alcance" }),
      cliques: apresentarNumero(entrada.totais.cliques, doTotal, { rotulo: "Cliques" }),
    },
  };
}

/** O relatório inteiro pode ser apresentado como confiável? Um `false` aqui é
 *  ordem de não decidir verba com estes números. */
export function relatorioConfiavel(i: IntegridadeDaMedicao): boolean {
  return i.comparacaoRodou && i.estado === "integro" && i.porCampanha.every((p) => confiavel(p.conciliacao));
}
