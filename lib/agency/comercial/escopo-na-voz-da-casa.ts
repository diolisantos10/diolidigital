// O ESCOPO DITO NA VOZ DA CASA — uma fonte, duas plateias.
//
// ── Por que isto existe ─────────────────────────────────────────────────────
// Medido em 27/08/2026 no escopo do CLIENTE 001 (Foocci), na tela que ELE lê
// (`PublicBriefingRoom`) e no painel interno (`app/agency/requests`):
//
//   • "Posts: 28/mês"           → 28 não existe na tabela (12 · 20 · 36);
//   • "Vídeo: A definir"        → vídeo NÃO TEM PRODUTOR nesta casa;
//   • "Vídeo: Produção pela Dioli" → o mesmo campo, no ramo em que o cliente
//     PEDE vídeo, prometia produção. É pior que "a definir": é um sim;
//   • "Modalidade: Projeto pontual" com 28 peças/MÊS e ciclo de 30 dias —
//     pontual e recorrente cobram diferente, e a tela afirmava os dois.
//
// ── A correção anterior existia e não alcançava ninguém ─────────────────────
// `volumeQueACasaVende` e `aCasaProduz` nasceram em `tabela-de-precos.ts` no
// mesmo dia, com teste e mutação — e **nenhuma tela as chamava**. Régua verde
// sobre o componente errado é pior que régua nenhuma: a régua nenhuma deixa a
// dúvida viva; a verde no lugar errado mata a dúvida e deixa o defeito. Este
// arquivo é o fio que faltava, e é por ele que as duas telas passam a falar.
//
// ⛔ NUNCA devolva "a definir", "sob consulta" ou "a combinar" daqui. Promessa
// com a assinatura em branco é dívida: o cliente conta, a casa não produz, e a
// conversa difícil acontece depois de ele já ter dito sim.

import { volumeQueACasaVende, aCasaProduz } from "@/lib/agency/financeiro/tabela-de-precos";
import type { BriefingScope, SocialScope } from "@/lib/agency/briefing-conversation";

/** Uma linha do quadro de escopo, na voz da casa. */
export type LinhaDeEscopo = {
  label: string;
  value: string;
  /** Apagada: é uma ausência, não um problema ("Não incluído"). */
  dim?: boolean;
  /** Destacada: a casa está dizendo NÃO, ou corrigindo o pedido. É o oposto de
   *  `dim` — precisa ser lida, não passada por cima. */
  alerta?: boolean;
  /** A explicação por extenso, quando a resposta curta não basta sozinha. */
  detalhe?: string;
};

/** Há volume que se repete todo mês neste escopo? */
export function temVolumeRecorrente(social: SocialScope | undefined): boolean {
  if (!social) return false;
  return (social.postsPerWeek ?? 0) > 0
    || (social.storiesPerWeek ?? 0) > 0
    || (social.reelsPerMonth ?? 0) > 0;
}

/**
 * O VOLUME — dito no degrau que a casa vende, nunca no número cru do pedido.
 *
 * Mostrar 28 como se fosse o contratado é o caminho mais curto para um preço
 * inventado, e para o cliente descobrir na fatura que comprou outra coisa.
 */
export function linhaDeVolume(label: string, pecasPorMes: number): LinhaDeEscopo {
  if (pecasPorMes <= 0) return { label, value: "Não incluído", dim: true };

  const resposta = volumeQueACasaVende(pecasPorMes);
  if (!resposta.vende) {
    return { label, value: "Não vendemos esse volume", alerta: true, detalhe: resposta.frase };
  }
  if (resposta.degrau.pecasPorMes === pecasPorMes) {
    return { label, value: `${pecasPorMes}/mês` };
  }
  // O degrau COBRE o pedido — nunca arredonda para baixo. Quem pede 28 recebe
  // 36, e o número que ele pediu continua na tela para ele conferir.
  return {
    label,
    value: `${resposta.degrau.pecasPorMes}/mês (você pediu ${pecasPorMes})`,
    alerta: true,
    detalhe: resposta.frase,
  };
}

/**
 * O VÍDEO — a casa não produz, e diz isso nos DOIS ramos.
 *
 * O ramo perigoso não era "a definir": era `needsVideoProduction`, que
 * respondia "Produção pela Dioli". Um sim para um serviço sem produtor.
 */
export function linhaDeVideo(social: SocialScope | undefined): LinhaDeEscopo | null {
  if (!social) return null;
  if (social.hasVideomaker === undefined && social.needsVideoProduction === undefined) return null;

  if (social.needsVideoProduction) {
    const veredito = aCasaProduz("Vídeo");
    return {
      label: "Vídeo",
      value: "Não fazemos",
      alerta: true,
      detalhe: veredito.frase.replace(/\*\*/g, ""),
    };
  }
  if (social.hasVideomaker) {
    return { label: "Vídeo", value: "Videomaker próprio (seu)" };
  }
  // Nem pediu produção, nem tem quem produza. A resposta honesta continua sendo
  // a nossa incapacidade, não um "vamos ver".
  return {
    label: "Vídeo",
    value: "Não fazemos",
    alerta: true,
    detalhe: aCasaProduz("Vídeo").frase.replace(/\*\*/g, ""),
  };
}

/**
 * A MODALIDADE — e a incoerência resolvida em voz alta.
 *
 * "Projeto pontual" com peças/MÊS e ciclo de 30 dias são duas afirmações que
 * não podem ser verdade ao mesmo tempo, e elas cobram diferente. A casa decide
 * pelo que o cliente DESCREVEU (volume que se repete = mensalidade), diz que
 * decidiu, e diz por quê. Calar seria escolher também — só que escondido.
 */
export function linhaDeModalidade(scope: BriefingScope): LinhaDeEscopo {
  const recorrente = temVolumeRecorrente(scope.social);

  if (scope.serviceMode === "umbrella") {
    return { label: "Modalidade", value: "Parceria contínua (guarda-chuva)" };
  }
  if (scope.serviceMode === "one_off" && recorrente) {
    return {
      label: "Modalidade",
      value: "Gestão mensal",
      alerta: true,
      detalhe:
        "Você marcou projeto pontual, mas descreveu peças por MÊS, que se repetem. " +
        "Pontual e recorrente cobram diferente, e volume que volta todo mês é mensalidade. " +
        "Seguimos como gestão mensal — se a intenção era uma entrega única, é só dizer que refazemos.",
    };
  }
  if (scope.serviceMode === "one_off") {
    return { label: "Modalidade", value: "Projeto pontual" };
  }
  if (scope.serviceMode === "monthly") {
    return { label: "Modalidade", value: "Gestão mensal" };
  }
  // Sem modalidade declarada: o volume responde. Nunca "a definir".
  return recorrente
    ? {
        label: "Modalidade",
        value: "Gestão mensal",
        detalhe: "Deduzida do volume que você descreveu — peças que se repetem todo mês.",
      }
    : { label: "Modalidade", value: "Projeto pontual" };
}
