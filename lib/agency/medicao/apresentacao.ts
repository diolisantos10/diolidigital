// apresentacao.ts — DADO INCOMPLETO NUNCA SAI LIMPO.
//
// A regra que decide tudo, do case Farol 27 (24/08/2026):
//
//   **Número silenciosamente menor é pior que número ausente.** O ausente
//   alguém investiga; o menor alguém usa para decidir.
//
// Por isso todo número que atravessa uma medição não íntegra sai daqui com a
// marca colada nele e com o que falta NOMEADO — ou não sai. Não existe caminho
// que devolva o número cru: `apresentarNumero` é a única função, e ela não tem
// parâmetro de "modo silencioso". Marca opcional é marca que alguém desliga na
// véspera da reunião.

import { confiavel, type Conciliacao } from "./conciliacao";

/** As marcas. Constantes exportadas porque o teste afirma sobre elas e porque a
 *  mesma marca precisa aparecer igual no painel, no relatório e no PDF. */
export const MARCA_DE_INCOMPLETO = "⚠️ INCOMPLETO";
export const MARCA_DE_NAO_MEDIDO = "NÃO MEDIDO";

export interface NumeroApresentavel {
  /** O valor cru, para quem for fazer conta. `null` quando não medido. */
  valor: number | null;
  /** O que uma pessoa lê. NUNCA é só o número quando a medição não é íntegra. */
  texto: string;
  /** Só `true` quando a comparação rodou e nada faltou. */
  confiavel: boolean;
  /** A ressalva, com os eventos faltantes nomeados. `null` só quando íntegro. */
  ressalva: string | null;
}

/**
 * Apresenta um número sob a luz da conciliação que o produziu.
 *
 *   íntegro     → o número, limpo. Único caso.
 *   incompleto  → o número COM a marca e os eventos que faltam, nomeados.
 *   não medido  → "NÃO MEDIDO" e o motivo. O valor cru não vai para o texto:
 *                 número sem medição confirmada não deve nem ser lido.
 */
export function apresentarNumero(
  valor: number | null,
  c: Conciliacao,
  opcoes?: { rotulo?: string; unidade?: string },
): NumeroApresentavel {
  const rotulo = opcoes?.rotulo ? `${opcoes.rotulo}: ` : "";
  const unidade = opcoes?.unidade ? ` ${opcoes.unidade}` : "";

  if (c.estado === "nao_medido") {
    return {
      valor: null,
      texto: `${rotulo}${MARCA_DE_NAO_MEDIDO} — ${c.motivo}`,
      confiavel: false,
      ressalva: c.motivo,
    };
  }

  if (!confiavel(c)) {
    const faltam = c.faltando.map((f) => f.nome).join(", ") || "evento não identificado";
    const detalhe = c.faltando.map((f) => f.frase).join(" ");
    const ressalva = `faltam eventos de medição: ${faltam}. ${detalhe}`.trim();
    const numero = valor === null ? MARCA_DE_NAO_MEDIDO : `${valor}${unidade}`;
    return {
      valor,
      texto: `${rotulo}${numero} ${MARCA_DE_INCOMPLETO} (${faltam})`,
      confiavel: false,
      ressalva,
    };
  }

  if (valor === null) {
    // Comparação íntegra e valor ausente é outra coisa: a fonte respondeu, os
    // eventos chegaram, e este número específico não veio. Também não sai limpo.
    return {
      valor: null,
      texto: `${rotulo}${MARCA_DE_NAO_MEDIDO}`,
      confiavel: false,
      ressalva: "o valor não foi devolvido pela fonte",
    };
  }

  return { valor, texto: `${rotulo}${valor}${unidade}`, confiavel: true, ressalva: null };
}

/** A frase de cabeçalho de um relatório/painel. Só é vazia quando TUDO está
 *  íntegro — silêncio aqui significa "medido e completo", nunca "não olhei". */
export function avisoDoRelatorio(conciliacoes: Conciliacao[]): string {
  if (conciliacoes.length === 0) {
    return `${MARCA_DE_NAO_MEDIDO} — nenhuma comparação esperado × recebido rodou neste relatório. Os números abaixo não foram verificados.`;
  }
  const naoMedidas = conciliacoes.filter((c) => c.estado === "nao_medido").length;
  const incompletas = conciliacoes.filter((c) => c.estado === "incompleto");
  if (incompletas.length > 0) {
    const nomes = [...new Set(incompletas.flatMap((c) => c.faltando.map((f) => f.nome)))];
    return `${MARCA_DE_INCOMPLETO} — ${incompletas.length} de ${conciliacoes.length} campanha(s) com evento de medição faltando (${nomes.join(", ")}). Os números destas campanhas estão MENORES por falta de evento e não servem para decidir verba.`;
  }
  if (naoMedidas > 0) {
    return `${MARCA_DE_NAO_MEDIDO} — ${naoMedidas} de ${conciliacoes.length} campanha(s) sem comparação esperado × recebido. "Não medido" não é "íntegro".`;
  }
  return "";
}
