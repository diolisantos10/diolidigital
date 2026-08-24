// conciliacao.ts — ESPERADO × RECEBIDO. A casa passa a saber quando parou de saber.
//
// ── O buraco (case Farol 27, 24/08/2026) ────────────────────────────────────
//
// Nenhum lugar do repositório comparava o que se ESPERA medir com o que
// CHEGOU. Um evento de conversão que para de chegar não produzia erro, não
// produzia alerta, não produzia tentativa de recuperação: produzia um número
// menor, apresentado com a mesma cara de um número inteiro.
//
// A casa acabou de aprender essa lição pela porta ao lado: um medidor de
// qualidade morreu e ficou 10 dias em silêncio com o painel verde. É a mesma
// doença — só que aqui ela cai no dinheiro do cliente.
//
// ── OS TRÊS ESTADOS, E POR QUE SÃO TRÊS ─────────────────────────────────────
//
//   "integro"     — a comparação RODOU e não faltou nada.
//   "incompleto"  — a comparação RODOU e faltou evento. O número existe e NÃO
//                   é confiável.
//   "nao_medido"  — a comparação NÃO RODOU (sem plano, sem resposta da fonte,
//                   lista de esperados vazia).
//
// **A distinção entre "íntegro" e "não medido" é a coisa mais importante deste
// arquivo.** Um sistema com dois estados escreve "nada faltando" quando na
// verdade nunca perguntou — e é assim que um painel fica verde por 10 dias.
// Aqui, `integro` só é alcançável por um caminho: `comparacaoRodou === true` e
// `faltando.length === 0`. Nenhum outro caminho o produz, e o teste de mutação
// afirma exatamente isso.
//
// ── DUAS FORMAS DE FALTAR ───────────────────────────────────────────────────
//
//   1. NUNCA CHEGOU  — o plano espera `lead` e `actions` não trouxe nenhum.
//   2. PAROU DE CHEGAR — chegava no período anterior e não chega mais. Esta é a
//      pior, e era invisível: o evento principal some, um alternativo assume o
//      lugar dele, e o relatório troca a régua no meio do gráfico sem avisar.
//      Comparar só contra o plano não pega isso; comparar contra o que a
//      própria conta já entregou, pega.

import { planoDoObjetivo, nomesEsperados, type PlanoDeMensuracao } from "./plano-de-mensuracao";

export type EstadoDaMedicao = "integro" | "incompleto" | "nao_medido";

export interface EventoFaltando {
  nome: string;
  como: "nunca_chegou" | "parou_de_chegar";
  frase: string;
}

export interface Conciliacao {
  estado: EstadoDaMedicao;
  /**
   * A comparação REALMENTE aconteceu? "Nenhum evento faltando" só vale quando
   * isto é `true`. Este campo existe para que ninguém precise deduzir de uma
   * lista vazia se ela está vazia por integridade ou por omissão.
   */
  comparacaoRodou: boolean;
  esperados: string[];
  recebidos: string[];
  faltando: EventoFaltando[];
  /** Sempre preenchido, inclusive quando está tudo certo. */
  motivo: string;
}

export interface EntradaDaConciliacao {
  /** `null` = não há plano declarado. Vira "não medido". */
  plano: PlanoDeMensuracao | null;
  /**
   * Os nomes de evento que a fonte devolveu NESTE período.
   * `null` = a fonte não respondeu (rede, permissão, campo ausente). Isso é
   * diferente de `[]`, que é "a fonte respondeu e não veio evento nenhum".
   */
  recebidos: string[] | null;
  /** Nomes de evento que a MESMA campanha entregou no período anterior. */
  recebidosAntes?: string[] | null;
}

/**
 * A comparação. Função PURA: sem rede, sem banco, sem relógio.
 *
 * Ela é pura de propósito — é a parte que precisa estar certa mesmo se a
 * plataforma mudar, e a única que dá para testar sem tocar em dado de cliente.
 */
export function conciliar(entrada: EntradaDaConciliacao): Conciliacao {
  const { plano } = entrada;

  if (!plano) {
    return naoMedido(
      "não existe plano de mensuração declarado para esta campanha — sem a lista do que se espera, "
      + "\"nenhum evento faltando\" não é uma afirmação possível. Declare em lib/agency/medicao/plano-de-mensuracao.ts.",
      [],
      entrada.recebidos ?? [],
    );
  }

  const esperados = nomesEsperados(plano);
  if (esperados.length === 0) {
    // Um plano vazio poderia sair daqui com `faltando: []` e virar verde. Não
    // vira: lista de esperados vazia é ausência de medição, não medição limpa.
    return naoMedido(
      `o plano de mensuração de "${plano.objetivo}" não declara evento nenhum — lista de esperados vazia nunca é sinal verde.`,
      [],
      entrada.recebidos ?? [],
    );
  }

  if (entrada.recebidos === null) {
    return naoMedido(
      `a fonte não devolveu a lista de eventos de "${plano.objetivo}" — sem resposta não há comparação, e sem comparação o estado é NÃO MEDIDO, não íntegro.`,
      esperados,
      [],
    );
  }

  const recebidos = entrada.recebidos;
  const chegou = new Set(recebidos);
  const faltando: EventoFaltando[] = [];

  // 1. NUNCA CHEGOU — nenhum dos nomes declarados apareceu.
  //    As alternativas são o mesmo evento com outro nome: basta UM chegar.
  if (!esperados.some((n) => chegou.has(n))) {
    const principal = plano.eventos.find((e) => e.papel === "resultado")?.nome ?? esperados[0]!;
    faltando.push({
      nome: principal,
      como: "nunca_chegou",
      frase:
        `o evento "${principal}" (esperado para o objetivo ${plano.objetivo}) não chegou. `
        + `Esperados: ${esperados.join(", ")}. Recebidos: ${recebidos.join(", ") || "nenhum"}.`,
    });
  }

  // 2. PAROU DE CHEGAR — entregava antes e não entrega mais.
  for (const antes of entrada.recebidosAntes ?? []) {
    if (chegou.has(antes)) continue;
    if (!esperados.includes(antes)) continue;  // só o que o plano declara.
    faltando.push({
      nome: antes,
      como: "parou_de_chegar",
      frase:
        `o evento "${antes}" chegava no período anterior e não chegou neste. `
        + `O número deste período está MENOR por falta de evento, não por queda de desempenho.`,
    });
  }

  if (faltando.length > 0) {
    return {
      estado: "incompleto",
      comparacaoRodou: true,
      esperados,
      recebidos,
      faltando,
      motivo: `medição INCOMPLETA: ${faltando.map((f) => f.nome).join(", ")}. ${faltando[0]!.frase}`,
    };
  }

  return {
    estado: "integro",
    comparacaoRodou: true,
    esperados,
    recebidos,
    faltando: [],
    motivo: `comparação esperado × recebido rodou: ${esperados.length} evento(s) esperado(s), nenhum faltando.`,
  };
}

function naoMedido(motivo: string, esperados: string[], recebidos: string[]): Conciliacao {
  return { estado: "nao_medido", comparacaoRodou: false, esperados, recebidos, faltando: [], motivo };
}

/**
 * A ÚNICA porta para "pode apresentar como confiável".
 *
 * Todo lugar que for mostrar número passa por aqui em vez de olhar
 * `faltando.length === 0` por conta própria — é o `faltando.length === 0` solto
 * que transforma "não perguntei" em "está tudo bem".
 */
export function confiavel(c: Conciliacao): boolean {
  return c.comparacaoRodou === true && c.estado === "integro" && c.faltando.length === 0;
}

/** O atalho para o caso mais comum: uma campanha da Meta, com o array `actions`
 *  que ela devolveu. `acoes === null` = a Meta não devolveu `actions`. */
export function conciliarCampanhaDaMeta(entrada: {
  objetivo: string | null;
  acoes: Record<string, number> | null;
  acoesAntes?: Record<string, number> | null;
}): Conciliacao {
  return conciliar({
    plano: planoDoObjetivo("meta_ads", entrada.objetivo),
    recebidos: entrada.acoes === null ? null : Object.keys(entrada.acoes),
    recebidosAntes: entrada.acoesAntes ? Object.keys(entrada.acoesAntes) : null,
  });
}
