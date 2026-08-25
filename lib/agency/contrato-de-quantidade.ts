// contrato-de-quantidade.ts — A FONTE ÚNICA DO QUANTO E DO ONDE.
//
// ═══ O DEFEITO QUE PRODUZIU ESTE ARQUIVO ════════════════════════════════════
//
// Medido em produção na rodada 5 do case Farol 27 (25/08/2026). A cliente pediu
// no briefing 4 posts/semana, ZERO stories e 6 reels/mês. A proposta que saiu
// prometeu "5 posts + 7 stories/semana · 4 reels/mês". O contrato interno da
// casa (`MISTURA_DE_FORMATOS`, em `execution/especialistas.ts`) admite no
// MÁXIMO 3 stories. O especialista obedecia à proposta, o contrato recusava,
// três tentativas, `blocked`.
//
// Nenhuma mão destravava isso, e não é falta de zelo: era impasse por
// CONSTRUÇÃO. A proposta prometia o que o contrato proíbe, e as duas verdades
// viviam em arquivos diferentes. **Verdade escrita em dois lugares já está
// errada em um deles** — a única pergunta é quando alguém descobre.
//
// ═══ O QUE ESTE ARQUIVO É ═══════════════════════════════════════════════════
//
// O lugar ÚNICO onde a casa declara quanto ela entrega de cada formato e em
// quais canais ela trabalha. Quem VENDE (`live-calculator.computeEstimate`, a
// proposta que o cliente lê) e quem CONFERE (`contratoDasLegendas`, o contrato
// da produção) leem daqui — o mesmo objeto, não duas cópias que combinam hoje.
//
// A prova de que é uma fonte só está em teste por IDENTIDADE de objeto:
// `expect(MISTURA_DE_FORMATOS).toBe(LIMITES_POR_FORMATO)`. Igualdade de valor
// passaria com duas tabelas gêmeas — que é exatamente o defeito.
//
// ═══ O QUE ESTE ARQUIVO NÃO FAZ ═════════════════════════════════════════════
//
// • **Não afrouxa nada.** Os números são os que a produção já cobrava. O
//   conserto do impasse é a proposta parar de prometer acima deles — nunca a
//   régua descer até a promessa.
// • **Não decide preço.** Faixa de preço continua em `live-calculator`.
// • **Não inventa canal.** Quem sabe se um canal existe é o registro de
//   guardiões da mídia, e é dele que se lê.

import { GUARDIOES, type CanalDeMidia } from "@/lib/integrations/midia/guardioes";

/**
 * A MISTURA DE FORMATOS — quantas peças de cada formato cabem numa entrega.
 *
 * Veio de `execution/especialistas.ts`, onde nasceu, sem um número alterado.
 * Está aqui porque quem escreve a proposta também precisa dela, e ir buscá-la
 * dentro do motor de produção arrastaria a produção inteira para a sala de
 * briefing (que roda no navegador).
 */
export const LIMITES_POR_FORMATO = { carrossel: [1, 2], story: [2, 3], feed: [2, 3] } as const;

export type FormatoComLimite = keyof typeof LIMITES_POR_FORMATO;

/** O teto de um formato — o número que a proposta não pode passar. */
export function tetoDoFormato(f: FormatoComLimite): number {
  return LIMITES_POR_FORMATO[f][1];
}

/** O piso de um formato, quando ele está no escopo. */
export function pisoDoFormato(f: FormatoComLimite): number {
  return LIMITES_POR_FORMATO[f][0];
}

/**
 * O que a casa PODE oferecer de um formato, dado o que o cliente pediu.
 *
 * ── AS TRÊS RESPOSTAS, E NENHUMA É SILENCIOSA ──────────────────────────────
 *
 *   • Pediu ZERO (ou não pediu): oferece zero. **Zero é resposta**, não campo
 *     vazio — foi o cliente que escreveu. A proposta não inventa volume, e o
 *     contrato de produção não cobra formato que ele recusou.
 *   • Pediu dentro do teto: oferece exatamente o que ele pediu.
 *   • Pediu acima do teto: oferece o TETO e devolve a recusa POR ESCRITO, com
 *     a instrução gêmea — toda proibição diz também o que é possível. Recusar
 *     7 stories sem dizer "até 3 por semana" é mandar o cliente adivinhar.
 *
 * Devolver a recusa como DADO, e não como texto solto, é o ponto: quem chama
 * não tem como esquecer de mostrá-la, porque ela vem junto do número.
 */
export interface QuantidadeQueCabe {
  /** O que a proposta pode prometer. Nunca acima do teto da casa. */
  oferecido: number;
  /** Preenchido só quando o pedido do cliente passou do que a casa faz. */
  recusa: {
    pedido: number;
    teto: number;
    /** Uma frase, para o cliente ler. Já contém a instrução gêmea. */
    frase: string;
  } | null;
}

const NOME_NO_PLURAL: Record<FormatoComLimite, string> = {
  carrossel: "carrosséis",
  story: "stories",
  feed: "posts",
};

export function quantidadeQueCabe(
  formato: FormatoComLimite,
  pedidoPorSemana: number | undefined,
): QuantidadeQueCabe {
  const nome = NOME_NO_PLURAL[formato];
  const teto = tetoDoFormato(formato);

  if (typeof pedidoPorSemana !== "number" || !Number.isFinite(pedidoPorSemana) || pedidoPorSemana <= 0) {
    return { oferecido: 0, recusa: null };
  }
  const pedido = Math.floor(pedidoPorSemana);
  if (pedido <= teto) return { oferecido: pedido, recusa: null };

  return {
    oferecido: teto,
    recusa: {
      pedido,
      teto,
      frase:
        `Você pediu ${pedido} ${nome} por semana e a nossa entrega vai até ${teto} por semana — ` +
        `é o que a produção fecha com a qualidade que a gente assina. ` +
        `A proposta está montada com ${teto} ${nome}/semana; ` +
        `se ${pedido} for essencial pra você, a gente conversa sobre uma segunda frente antes de fechar.`,
    },
  };
}

// ═══ OS CANAIS ══════════════════════════════════════════════════════════════
//
// A proposta do Farol 27 mandava a verba para "Google/Meta" — texto fixo, no
// código — quando a cliente tinha pedido **Meta e TikTok**. Inventar um canal
// que ela não pediu e apagar um que ela pediu é, para quem lê, a prova de que
// ninguém escutou. E trocar o TikTok pelo Meta em silêncio seria pior ainda:
// ela descobriria depois de pagar.
//
// Quem sabe se um canal existe nesta casa é o registro de guardiões da mídia
// (`lib/integrations/midia/guardioes.ts`), que é a mesma régua que barra a
// verba na hora de criar campanha. Uma lista nova aqui seria a segunda régua —
// exatamente o defeito que este arquivo existe para não repetir.

export interface CanalPedido {
  /** Como o cliente escreveu. */
  comoOClientePediu: string;
  /** O canal do registro, quando dá para reconhecer. */
  canal: CanalDeMidia | null;
  /** A casa entrega neste canal hoje? Desconhecido é NÃO (falha fechada). */
  atendido: boolean;
  /** Preenchido quando não atende: a frase que o cliente lê. */
  frase?: string;
}

/** As formas como gente escreve o nome do canal. Meta cobre Instagram e
 *  Facebook porque é literalmente a mesma integração (`meta/client.ts`). */
const APELIDOS: { padrao: RegExp; canal: CanalDeMidia }[] = [
  { padrao: /instagram|\binsta\b|facebook|\bface\b|\bmeta\b/i, canal: "meta_ads" },
  { padrao: /tik\s*tok/i, canal: "tiktok_ads" },
  { padrao: /google|\bads?\s+do\s+google\b/i, canal: "google_ads" },
  { padrao: /youtube|\byt\b/i, canal: "youtube_ads" },
  { padrao: /linked\s*in/i, canal: "linkedin_ads" },
];

/**
 * Lê um canal escrito por gente e diz se a casa o atende.
 *
 * FALHA FECHADA: canal que não dá para reconhecer volta como NÃO atendido, com
 * a frase pedindo confirmação. Ausência de informação não é informação — e
 * dizer "sim" a um canal desconhecido é vender o que não se produz.
 */
export function lerCanal(comoOClientePediu: string): CanalPedido {
  const bruto = (comoOClientePediu ?? "").trim();
  const achado = APELIDOS.find((a) => a.padrao.test(bruto));

  if (!achado) {
    return {
      comoOClientePediu: bruto,
      canal: null,
      atendido: false,
      frase:
        `${bruto}: não conseguimos confirmar que atendemos este canal hoje — ` +
        "antes de fechar, a gente confirma com você em vez de prometer.",
    };
  }

  const g = GUARDIOES[achado.canal];
  if (g.temIntegracaoDeEscrita) {
    return { comoOClientePediu: bruto, canal: achado.canal, atendido: true };
  }
  return {
    comoOClientePediu: bruto,
    canal: achado.canal,
    atendido: false,
    frase:
      `${g.rotulo}: **a casa não entrega neste canal hoje** — não temos integração com ele, ` +
      "e por isso ele não entra na proposta. Estamos dizendo isso agora, e não depois: " +
      "o que está aqui dentro é só o que a gente produz de verdade.",
  };
}

/** Os canais pedidos, lidos em bloco. Preserva a ordem em que o cliente falou. */
export function lerCanais(pedidos: readonly string[] | undefined): CanalPedido[] {
  return (pedidos ?? [])
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .map(lerCanal);
}
