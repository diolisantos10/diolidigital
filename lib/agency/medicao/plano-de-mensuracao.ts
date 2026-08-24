// plano-de-mensuracao.ts — A LISTA DO QUE SE ESPERA MEDIR. Declarada, não suposta.
//
// ── O que o case Farol 27 mediu (24/08/2026) ────────────────────────────────
//
// Não existia nada que comparasse eventos ESPERADOS contra eventos RECEBIDOS.
// Se um evento de conversão deixava de chegar, o número simplesmente ficava
// menor e o relatório apresentava esse número menor como se fosse verdade.
//
// O "plano de medição" que esta casa tinha era um ENTREGÁVEL DE TEXTO — um
// documento que o especialista de Analytics escreve para o cliente
// (`lib/agency/execution/especialistas.ts:998`, `lib/agency/planos.ts:118`).
// Texto não se compara com dado. Não havia, em lugar nenhum, uma declaração
// legível por máquina de "estes eventos têm de chegar".
//
// O mais perto disso era `RESULTADO_POR_OBJETIVO`
// (`lib/integrations/meta/ads-leitura.ts:391`): um mapa de objetivo → nomes de
// ação, usado para ESCOLHER qual linha do array `actions` é o resultado. Ele
// respondia "qual destes serve?" e nunca "qual destes faltou?".
//
// Este arquivo transforma aquela declaração implícita numa declaração FORMAL:
// por canal e por objetivo, quais eventos se espera receber, e qual é
// obrigatório. É esta lista que a conciliação usa como "o esperado".
//
// ── A REGRA QUE MANDA AQUI ──────────────────────────────────────────────────
//
// Canal ou objetivo sem plano declarado devolve `null`, e `null` vira estado
// **não medido** na conciliação — nunca "íntegro". Ausência de declaração não é
// declaração de que está tudo certo (guardrail 1 da casa).

import { RESULTADO_POR_OBJETIVO, OBJETIVOS_DE_ALCANCE } from "@/lib/integrations/meta/ads-leitura";
import type { CanalDeMidia } from "@/lib/integrations/midia/guardioes";

export interface EventoEsperado {
  /** O nome do evento como a plataforma o entrega (`lead`, `purchase`, …). */
  nome: string;
  /**
   * `resultado` = é ELE que vira o número do relatório. Faltar significa que o
   * relatório está errado, não menor.
   * `alternativo` = a plataforma pode entregar este no lugar do principal.
   */
  papel: "resultado" | "alternativo";
  porQue: string;
}

export interface PlanoDeMensuracao {
  canal: CanalDeMidia;
  objetivo: string;
  eventos: EventoEsperado[];
  /** De onde saiu esta declaração — para ninguém confundir com palpite. */
  fonte: string;
}

/**
 * O plano do objetivo, ou `null` quando não há declaração.
 *
 * `null` acontece em três casos, e todos os três são "não medido":
 *   • canal sem plano de mensuração declarado nesta casa;
 *   • objetivo que o mapa da casa não conhece;
 *   • campanha que não declarou objetivo nenhum.
 */
export function planoDoObjetivo(canal: string, objetivo: string | null | undefined): PlanoDeMensuracao | null {
  if (canal !== "meta_ads") return null;      // só a Meta tem declaração hoje.
  if (!objetivo) return null;

  if (OBJETIVOS_DE_ALCANCE.includes(objetivo)) {
    // Aqui o resultado não é uma ação: é o próprio alcance. Declarar `lead`
    // esperado numa campanha de alcance seria inventar evento faltando.
    return {
      canal: "meta_ads",
      objetivo,
      eventos: [{ nome: "alcance", papel: "resultado", porQue: "objetivo de alcance — o resultado é o próprio alcance, não uma ação" }],
      fonte: "ads-leitura.ts OBJETIVOS_DE_ALCANCE",
    };
  }

  const nomes = RESULTADO_POR_OBJETIVO[objetivo];
  if (!nomes || nomes.length === 0) return null;

  return {
    canal: "meta_ads",
    objetivo,
    eventos: nomes.map((nome, i) => ({
      nome,
      papel: i === 0 ? "resultado" : "alternativo",
      porQue: i === 0
        ? `evento principal do objetivo ${objetivo} — é ele que vira o número do relatório`
        : `a Meta pode entregar "${nome}" no lugar de "${nomes[0]}" para o mesmo objetivo`,
    })),
    fonte: "ads-leitura.ts RESULTADO_POR_OBJETIVO",
  };
}

/** Os nomes que precisam chegar para o plano estar cumprido. Pelo menos UM
 *  desta lista — as alternativas são o MESMO evento com outro nome, não eventos
 *  adicionais. Somar as duas seria contar a mesma conversão duas vezes. */
export function nomesEsperados(plano: PlanoDeMensuracao): string[] {
  return plano.eventos.map((e) => e.nome);
}
