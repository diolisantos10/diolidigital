// guardioes.ts — TODO CANAL DE MÍDIA TEM GUARDIÃO. CANAL SEM GUARDIÃO NÃO GASTA.
//
// ── O que o case Farol 27 mediu (24/08/2026) ────────────────────────────────
//
// A Meta tinha guardião e ele funcionava: no case, `conferirOrcamento`
// (`lib/integrations/meta/ads.ts:353`) recusou R$ 900 contra um teto de R$ 150
// **antes de qualquer chamada de rede**. O TikTok não tinha guardião nenhum — e
// o motor de tráfego já distribui verba para ele: `traffic-engine.ts:164,177`
// aloca 15% do budget em `tiktok_ads`, e `traffic-canvas.ts:10-15` declara
// cinco canais pagos, dos quais **um** passava por trava de teto.
//
// Verba de canal sem guardião é verba sem teto. Este arquivo acaba com o caso
// particular: o teto deixa de ser uma constante dentro do módulo da Meta e vira
// um REGISTRO por canal, com a mesma pergunta feita a todos.
//
// ── A REGRA DO ZERO ─────────────────────────────────────────────────────────
//
// Canal sem teto configurado ⇒ teto ZERO ⇒ nada gasta. Zero aqui significa
// ZERO, nunca "sem limite".
//
// ── ⚖️ 24/08/2026 — O ZERO DOS QUATRO CANAIS É DECISÃO, NÃO PENDÊNCIA ───────
//
// Google, YouTube, TikTok e LinkedIn ficam em zero **por escolha registrada**,
// e não esperando alguém setar variável. O motivo é factual: esta casa não tem
// integração de leitura nem de escrita para nenhum deles. Não existe canal —
// logo não existe verba, e zero é a resposta honesta.
//
// Isso muda o que a recusa precisa dizer. A frase não manda ninguém procurar o
// CEO: **proibição sem instrução gêmea empurra o operador para o contorno**, e
// "fale com o CEO" não é instrução, é fila. A frase diz o que é verdade — o
// canal não está integrado — e diz quando o teto se define: junto com a
// integração, por quem a construir.
//
// O teste de classe garante o resto: quem construir o canal não consegue
// entregá-lo sem declarar guardião e teto.
//
// Isto não é hipótese: outro produto desta casa leu "teto padrão 0" como "sem
// limite" e o resultado foi o oposto do pretendido. Por isso o zero não é um
// número solto no meio de um `if` — ele é o estado `sem_teto`, tem frase
// própria, e a única coisa que um teto zero autoriza é R$ 0,00. A trava é o
// MECANISMO (guardrail 4 do kit): o comparador nunca vê `0` como "pule esta
// conferência", porque a conferência do `sem_teto` acontece ANTES dele.
//
// ── FAIL-CLOSED EM TRÊS PONTOS ──────────────────────────────────────────────
//
//   1. Canal que não está no registro: recusado (não existe canal "genérico").
//   2. Canal no registro sem teto: recusado, com o gesto de onde configurar.
//   3. Teto ilegível (texto, NaN, negativo, Infinity): tratado como ZERO.
//      Variável de ambiente com typo não vira permissão.
//
// Nada aqui toca em rede. É de propósito: é a parte que precisa estar certa
// mesmo se a plataforma mudar, e a única que dá para testar sem gastar um
// centavo de ninguém.

import type { TrafficChannel } from "@/lib/dioli-brain/traffic-canvas";

/** O canal de mídia paga. Mesmo vocabulário do `TrafficCanvas` — duas listas de
 *  canais divergem no dia em que alguém acrescenta em uma e esquece a outra. */
export type CanalDeMidia = TrafficChannel;

/** Piso da Meta para orçamento diário, em reais. Abaixo disto não entrega.
 *  Vale como piso desta casa para os demais canais até haver fonte própria. */
export const PISO_DIARIO_BRL = 6;

export interface Guardiao {
  canal: CanalDeMidia;
  /** Nome em português, para a frase que uma pessoa lê. */
  rotulo: string;
  /**
   * Teto absoluto da casa, em reais por dia. `0` = SEM TETO CONFIGURADO = nada
   * gasta. Nunca use `null`/`undefined` aqui: ausência já tem um número, e ele
   * é zero.
   */
  tetoDiarioBRL: number;
  /** A variável de ambiente que configura o teto — vai na frase da recusa. */
  variavelDeAmbiente: string;
  /** Existe caminho de escrita implementado nesta casa para o canal? */
  temIntegracaoDeEscrita: boolean;
  /** Existe caminho de LEITURA implementado? Sem leitura não há medição, e sem
   *  medição a verba é gasta às cegas — o canal não existe para esta casa. */
  temIntegracaoDeLeitura: boolean;
  /** O gesto concreto que destrava. Nunca "fale com fulano": o que FAZER. */
  comoDestravar: string;
}

/**
 * Lê um teto de variável de ambiente. FAIL-CLOSED: o que não for um número
 * finito e positivo vira ZERO.
 *
 * `Number("")` é 0 e `Number("abc")` é NaN — os dois entravam como "valor" numa
 * leitura ingênua. Aqui os dois viram zero, que é "nada gasta".
 */
export function tetoDoAmbiente(bruto: string | undefined): number {
  if (bruto === undefined || bruto.trim() === "") return 0;
  const v = Number(bruto);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v;
}

/**
 * O REGISTRO. `Record<CanalDeMidia, …>` de propósito: acrescentar um canal em
 * `TrafficChannel` sem declarar guardião aqui **não compila**. O teste de
 * classe cobre a fuga que o tipo não cobre (canal citado em texto/JSON solto).
 */
export const GUARDIOES: Record<CanalDeMidia, Guardiao> = {
  meta_ads: {
    canal: "meta_ads",
    rotulo: "Meta Ads",
    // O único canal com teto default diferente de zero, e a razão é factual:
    // a integração de escrita existe, foi exercida em produção e o número já
    // valia (`ads.ts:57`, desde 05/08/2026). Mudar esse default para zero aqui
    // não seria prudência, seria desligar o que já funciona sem ninguém pedir.
    tetoDiarioBRL: tetoDoAmbiente(process.env.ADS_TETO_DIARIO_BRL ?? "500"),
    variavelDeAmbiente: "ADS_TETO_DIARIO_BRL",
    temIntegracaoDeEscrita: true,
    temIntegracaoDeLeitura: true,
    comoDestravar: "ajustar ADS_TETO_DIARIO_BRL (reais por dia) — o canal está integrado e o teto é o número que se move.",
  },
  google_ads: {
    canal: "google_ads",
    rotulo: "Google Ads",
    tetoDiarioBRL: tetoDoAmbiente(process.env.ADS_TETO_DIARIO_GOOGLE_BRL),
    variavelDeAmbiente: "ADS_TETO_DIARIO_GOOGLE_BRL",
    temIntegracaoDeEscrita: false,
    temIntegracaoDeLeitura: false,
    comoDestravar:
      "Google Ads não está integrado nesta casa — não há leitura nem escrita para o canal, e por isso o teto é ZERO por decisão, não por esquecimento. "
      + "O teto se define no dia em que a integração existir, por quem a construir, junto com ela: declarar aqui o teto e a variável ADS_TETO_DIARIO_GOOGLE_BRL no mesmo commit da integração. "
      + "Até lá, o gesto certo é levar a verba para um canal integrado — não é esperar liberação.",
  },
  youtube_ads: {
    canal: "youtube_ads",
    rotulo: "YouTube Ads",
    tetoDiarioBRL: tetoDoAmbiente(process.env.ADS_TETO_DIARIO_YOUTUBE_BRL),
    variavelDeAmbiente: "ADS_TETO_DIARIO_YOUTUBE_BRL",
    temIntegracaoDeEscrita: false,
    temIntegracaoDeLeitura: false,
    comoDestravar:
      "YouTube Ads não está integrado nesta casa — não há leitura nem escrita para o canal, e por isso o teto é ZERO por decisão, não por esquecimento. "
      + "O teto se define no dia em que a integração existir, por quem a construir, junto com ela: declarar aqui o teto e a variável ADS_TETO_DIARIO_YOUTUBE_BRL no mesmo commit da integração. "
      + "Até lá, o gesto certo é levar a verba para um canal integrado — não é esperar liberação.",
  },
  tiktok_ads: {
    canal: "tiktok_ads",
    rotulo: "TikTok Ads",
    tetoDiarioBRL: tetoDoAmbiente(process.env.ADS_TETO_DIARIO_TIKTOK_BRL),
    variavelDeAmbiente: "ADS_TETO_DIARIO_TIKTOK_BRL",
    temIntegracaoDeEscrita: false,
    temIntegracaoDeLeitura: false,
    comoDestravar:
      "TikTok Ads não está integrado nesta casa — não há leitura nem escrita para o canal, e por isso o teto é ZERO por decisão, não por esquecimento. "
      + "O teto se define no dia em que a integração existir, por quem a construir, junto com ela: declarar aqui o teto e a variável ADS_TETO_DIARIO_TIKTOK_BRL no mesmo commit da integração. "
      + "Até lá, o gesto certo é levar a verba para um canal integrado — não é esperar liberação.",
  },
  linkedin_ads: {
    canal: "linkedin_ads",
    rotulo: "LinkedIn Ads",
    tetoDiarioBRL: tetoDoAmbiente(process.env.ADS_TETO_DIARIO_LINKEDIN_BRL),
    variavelDeAmbiente: "ADS_TETO_DIARIO_LINKEDIN_BRL",
    temIntegracaoDeEscrita: false,
    temIntegracaoDeLeitura: false,
    comoDestravar:
      "LinkedIn Ads não está integrado nesta casa — não há leitura nem escrita para o canal, e por isso o teto é ZERO por decisão, não por esquecimento. "
      + "O teto se define no dia em que a integração existir, por quem a construir, junto com ela: declarar aqui o teto e a variável ADS_TETO_DIARIO_LINKEDIN_BRL no mesmo commit da integração. "
      + "Até lá, o gesto certo é levar a verba para um canal integrado — não é esperar liberação.",
  },
};

export const CANAIS_COM_GUARDIAO = Object.keys(GUARDIOES) as CanalDeMidia[];

export function canalConhecido(nome: string | undefined): nome is CanalDeMidia {
  return !!nome && Object.prototype.hasOwnProperty.call(GUARDIOES, nome);
}

/** O guardião do canal, ou `null` quando o canal não tem guardião declarado.
 *  Nunca devolve um guardião "genérico": um teto inventado é pior que nenhum. */
export function guardiaoDoCanal(nome: string | undefined): Guardiao | null {
  return canalConhecido(nome) ? GUARDIOES[nome] : null;
}

export type MotivoDaRecusa =
  | "canal_sem_guardiao"
  | "canal_sem_teto"
  | "sem_teto_do_cliente"
  | "orcamento_invalido"
  | "abaixo_do_piso"
  | "passa_do_teto_do_cliente"
  | "passa_do_teto_da_casa"
  | "sem_integracao_de_escrita";

export interface VeredictoDeVerba {
  /** Pode seguir para a chamada de rede? */
  liberado: boolean;
  motivo?: MotivoDaRecusa;
  /** A frase que a pessoa lê, com o gesto que resolve. Vazia quando liberado. */
  erro?: string;
  /**
   * O GESTO que destrava, em português. Preenchido em TODA recusa.
   *
   * Nunca um nome de pessoa: proibição sem instrução gêmea empurra o operador
   * para o contorno, e "fale com fulano" não é instrução, é fila.
   */
  comoDestravar?: string;
}

/**
 * O PORTÃO DE VERBA DE QUALQUER CANAL. Determinístico, sem rede, e chamado
 * ANTES da chamada de rede — como o da Meta já fazia.
 *
 * A ordem das conferências é parte da trava: `canal_sem_teto` é decidido antes
 * de qualquer comparação numérica, porque é aí que "0" precisa significar zero
 * e não "pule esta conferência".
 */
export function conferirVerbaDoCanal(entrada: {
  canal: string;
  /** Reais por dia que se quer gastar. */
  orcamentoDiarioBRL: number;
  /** Teto que o CLIENTE aprovou, em reais por dia. */
  tetoAprovadoBRL: number;
  /** true exige que a casa tenha caminho de escrita implementado no canal. */
  exigirIntegracaoDeEscrita?: boolean;
}): VeredictoDeVerba {
  const g = guardiaoDoCanal(entrada.canal);
  if (!g) {
    return {
      liberado: false,
      motivo: "canal_sem_guardiao",
      erro:
        `o canal "${entrada.canal}" não tem guardião de verba declarado — canal sem guardião não recebe verba. `
        + `O gesto: declarar o canal em lib/integrations/midia/guardioes.ts (GUARDIOES), com teto próprio, no mesmo commit da integração do canal. `
        + `Enquanto isso, a verba vai para um canal integrado — não fica em fila.`,
      comoDestravar: "declarar o canal e o teto em lib/integrations/midia/guardioes.ts, junto com a integração.",
    };
  }

  // ── A REGRA DO ZERO, ANTES DE QUALQUER COMPARAÇÃO ─────────────────────────
  if (g.tetoDiarioBRL <= 0) {
    return {
      liberado: false,
      motivo: "canal_sem_teto",
      erro:
        `${g.rotulo} está com teto ZERO — e teto ZERO significa ZERO, não "sem limite". Nada é gasto neste canal. `
        + g.comoDestravar,
      comoDestravar: g.comoDestravar,
    };
  }

  if (entrada.exigirIntegracaoDeEscrita && !g.temIntegracaoDeEscrita) {
    return {
      liberado: false,
      motivo: "sem_integracao_de_escrita",
      erro: `${g.rotulo} tem teto configurado, mas esta casa não tem caminho de escrita implementado para o canal — nada é criado nem ativado por aqui. ` + g.comoDestravar,
      comoDestravar: g.comoDestravar,
    };
  }

  const v = entrada.orcamentoDiarioBRL;
  if (!Number.isFinite(v) || v <= 0) {
    return {
      liberado: false,
      motivo: "orcamento_invalido",
      erro: "orçamento diário inválido",
      comoDestravar: g.comoDestravar,
    };
  }
  if (v < PISO_DIARIO_BRL) {
    return {
      liberado: false,
      motivo: "abaixo_do_piso",
      erro: `orçamento diário de R$ ${v} está abaixo do mínimo (R$ ${PISO_DIARIO_BRL}) — a campanha não entregaria`,
      comoDestravar: g.comoDestravar,
    };
  }
  if (!Number.isFinite(entrada.tetoAprovadoBRL) || entrada.tetoAprovadoBRL <= 0) {
    return {
      liberado: false,
      motivo: "sem_teto_do_cliente",
      erro: "não há teto aprovado pelo cliente — sem isso não se cria campanha",
      comoDestravar: g.comoDestravar,
    };
  }
  if (v > entrada.tetoAprovadoBRL) {
    return {
      liberado: false,
      motivo: "passa_do_teto_do_cliente",
      erro: `orçamento diário de R$ ${v} passa do teto que o cliente aprovou (R$ ${entrada.tetoAprovadoBRL})`,
      comoDestravar: g.comoDestravar,
    };
  }
  if (v > g.tetoDiarioBRL) {
    return {
      liberado: false,
      motivo: "passa_do_teto_da_casa",
      erro: `orçamento diário de R$ ${v} passa do teto desta agência para ${g.rotulo} (R$ ${g.tetoDiarioBRL})`,
      comoDestravar: g.comoDestravar,
    };
  }
  return { liberado: true };
}
