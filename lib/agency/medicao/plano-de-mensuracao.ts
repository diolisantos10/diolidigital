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

// ── ⚠️ A LACUNA QUE NÃO FOI FECHADA DE PALPITE (24/08/2026) ────────────────
//
// Esta é a nota para quem for integrar um canal de conversão. Ela mora AQUI, no
// arquivo que declara os eventos, porque é aqui que se tropeça nela.
//
// **A casa não tem o dicionário de métricas do Insights da Meta.** Os nomes
// `post_engagement`, `link_click`, `comment`, `like` e `post_reaction` estão
// atestados em `docs/plataformas/meta/fontes/marketing-api-insights-recortes.md`.
// Os demais — `lead`, `purchase`, `onsite_conversion.*`, `offsite_conversion.*`,
// `omni_purchase`, `leadgen_grouped`, `store_visit`, `mobile_app_install`,
// `rsvp` — **não estão em fonte nenhuma da biblioteca**. Entraram por
// conhecimento de mercado, e são exatamente os que importam: são os de
// conversão, os que viram dinheiro no relatório.
//
// O QUE ISSO SIGNIFICA, SEM SUAVIZAR: um nome errado nesta lista não produz
// erro. Produz um evento que "nunca chega" — e a conciliação vai marcar a
// campanha como INCOMPLETA para sempre, culpando a Meta por um typo nosso. O
// contrário também vale: o nome certo faltando da lista faz um evento real
// passar despercebido.
//
// O QUE PRECISA SER SABIDO, EXATAMENTE:
//   1. a lista oficial de `action_type` que o endpoint `/insights` devolve, por
//      objetivo de campanha, na versão da API que esta casa usa;
//   2. qual `action_type` a Meta considera "o resultado" de cada objetivo
//      (a coluna "Resultados" do Gerenciador), que não é necessariamente o
//      primeiro da nossa lista de preferência;
//   3. se `onsite_conversion.*` e `offsite_conversion.fb_pixel_*` coexistem no
//      mesmo array — se coexistirem, somá-los seria contar a mesma conversão
//      duas vezes, e hoje o código escolhe UM de propósito por não saber.
//
// COMO FECHAR: capturar a página de referência de `action_type` do Insights
// para `docs/plataformas/meta/fontes/`, do jeito que as outras fontes desta
// pasta foram capturadas, e então corrigir `RESULTADO_POR_OBJETIVO` contra ela.
// **Não inventar os nomes.** Um mapa que parece completo e está errado é pior
// que este, que está declarado incompleto.
export const LACUNA_DOS_NOMES_DE_EVENTO =
  "os nomes de evento de CONVERSÃO da Meta (lead, purchase, onsite_conversion.*, offsite_conversion.*) "
  + "não estão atestados em fonte na biblioteca desta casa — vieram de conhecimento de mercado. "
  + "Um nome errado aqui marca a campanha como incompleta para sempre, culpando a Meta por um typo nosso. "
  + "Fechar: capturar a referência de action_type do /insights para docs/plataformas/meta/fontes/ e corrigir "
  + "RESULTADO_POR_OBJETIVO contra ela. Não inventar os nomes.";

/** Os únicos nomes com fonte atestada na biblioteca (insights-recortes.md). */
export const NOMES_COM_FONTE = ["post_engagement", "link_click", "comment", "like", "post_reaction"];

/** O evento esperado tem fonte atestada, ou é conhecimento de mercado? */
export function temFonteAtestada(nome: string): boolean {
  return NOMES_COM_FONTE.includes(nome) || nome === "alcance";
}

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
  /** `false` = o nome veio de conhecimento de mercado, não de fonte capturada.
   *  Ver `LACUNA_DOS_NOMES_DE_EVENTO` acima. */
  fonteAtestada: boolean;
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
      eventos: [{ nome: "alcance", papel: "resultado", fonteAtestada: true, porQue: "objetivo de alcance — o resultado é o próprio alcance, não uma ação" }],
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
      fonteAtestada: temFonteAtestada(nome),
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
