// escopo-do-cliente.ts — O QUE O CLIENTE COMPROU, lido do que ele escreveu.
//
// ── O DEFEITO QUE PRODUZIU ESTE ARQUIVO (15/08/2026) ────────────────────────
//
// `contratoDasLegendas` (`especialistas.ts`) exigia de TODO cliente:
//
//     6 a 8 peças · 1 a 2 carrossel · 2 a 3 story · 2 a 3 feed
//
// Números fixos, no código, iguais para todo mundo. E o contrato do CityJobs
// (`docs/projetos/cityjobs-orcamento.md`) diz o contrário em três pontos:
//
//   • **exclui carrossel** — "decisão do CEO: por enquanto, só post simples";
//   • **exclui story** — o sistema do próprio cliente já cobre;
//   • **exclui vídeo e reels**;
//   • **compra 60 posts simples por mês**, e o teto do especialista é 8.
//
// Ou seja: a trava mais cara da casa cobrava do especialista exatamente o que o
// cliente NÃO comprou, e o teto dela era 13% do volume vendido. Não é uma
// calibragem errada — é a régua vindo do lugar errado. O contrato de SAÍDA tem
// de derivar do contrato de ENTRADA.
//
// ── A REGRA DESTE ARQUIVO: LER, NUNCA INFERIR ──────────────────────────────
//
// Ele lê o que o cliente escreveu (serviços contratados, bloco de escopo do
// briefing, contexto bruto) com padrões determinísticos. O que ele NÃO acha
// vira **lacuna nomeada**, nunca um número inventado — é o guardrail 1 da
// companhia: ausência de informação não é informação. Quem tem lacuna continua
// caindo no padrão da casa, DECLARANDO que caiu, e a lacuna sobe para alguém
// perguntar ao cliente.

import { volumeDeclarado } from "@/lib/agency/live-calculator";
import { ENTREGAS_POR_MES } from "@/lib/agency/contrato-de-quantidade";
import type { SocialScope } from "@/lib/agency/briefing-conversation";

/** Os formatos que a esteira sabe produzir. */
export type FormatoContratado = "carrossel" | "story" | "feed" | "reel";

export const FORMATOS_CONTRATAVEIS: readonly FormatoContratado[] = ["carrossel", "story", "feed", "reel"];

export interface EscopoDeConteudo {
  /** Quantas peças o cliente comprou por MÊS. `null` = não achei, e não chuto. */
  pecasPorMes: number | null;
  /**
   * Os formatos que o cliente EXCLUIU explicitamente.
   *
   * Exclusão é a informação mais valiosa aqui e a mais fácil de perder: ela é
   * uma frase negativa ("sem carrossel", "não inclui story"), e nenhum campo do
   * banco a guardava. Formato excluído entregue é quebra de contrato — o cliente
   * paga por uma coisa e recebe outra.
   */
  excluidos: FormatoContratado[];
  /** O que este leitor NÃO conseguiu ler. Nomeado, para virar pergunta. */
  lacunas: string[];
  /** De onde saiu cada coisa. Sem procedência ninguém confere a régua. */
  procedencia: string[];
}

/** O escopo de quem não declarou nada — tudo em lacuna, nada excluído. */
export function escopoNaoDeclarado(): EscopoDeConteudo {
  return {
    pecasPorMes: null,
    excluidos: [],
    lacunas: [
      "quantas peças por mês o cliente comprou",
      "quais formatos estão dentro e quais estão fora do escopo",
    ],
    procedencia: [],
  };
}

function dobrar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** As palavras que nomeiam cada formato num texto de contrato. */
const NOMES: Record<FormatoContratado, RegExp> = {
  carrossel: /carross?[eé]?is|carrossel|carousel/,
  story: /stor(?:y|ies|ys)|st[oó]ries/,
  feed: /feed|post simples|posts simples/,
  reel: /reels?|v[ií]deos?/,
};

/**
 * As formas de dizer "isto está FORA".
 *
 * Estreitas de propósito. Um padrão largo ("não") marcaria como excluído todo
 * formato citado numa frase negativa qualquer — e apagar do calendário um
 * formato que o cliente comprou é o dano maior dos dois.
 */
const EXCLUSAO = [
  /\bsem\b/,
  /\bnao (?:inclui|est[aá] inclu|entra|tem|haver[aá])\b/,
  /\bn[aã]o inclu[ií]/,
  /\bfora do escopo\b/,
  /\bexclu[ií]d/,
  /\bo que n[aã]o est[aá] inclu[ií]d/,
];

/** Quatro semanas por mês, e não 4,33. Ver o comentário do volume: o calendário
 *  do cliente é mensal, e arredondar para baixo é o lado seguro. */
export const SEMANAS_POR_MES = 4;

/**
 * O VOLUME LIDO DO CAMPO QUE O SDR JÁ PREENCHE.
 *
 * `escopo` chega como JSON em todo o caminho da esteira (`avaliarCasoNormal`,
 * `run-execution`) porque o bloco `briefingJson.scope` é serializado antes de
 * entrar aqui. Quando ele é JSON, `social.postsPerWeek` é a resposta do próprio
 * cliente, gravada — e vale mais que qualquer regex sobre prosa.
 *
 * `volumeDeclarado` (`live-calculator.ts`) é quem decide, em toda a casa, se um
 * volume é utilizável: zero, negativo, NaN e fora de tipo são todos "o dado não
 * chegou". Não há segunda régua aqui — chamar a de lá é o ponto.
 *
 * Devolve `null` quando o escopo não é JSON, não traz o campo, ou o traz vazio.
 * Nunca lança: escopo quebrado vira lacuna, não exceção.
 */
function volumeDoCampoEstruturado(
  escopo: string | undefined,
): { pecasPorMes: number; procedencia: string; zerados: FormatoContratado[] } | null {
  if (!escopo || !escopo.trim().startsWith("{")) return null;
  let corpo: unknown;
  try {
    corpo = JSON.parse(escopo);
  } catch {
    return null;
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;

  // O bloco pode chegar como `scope` ou já desembrulhado — os dois acontecem na
  // casa, e exigir um dos dois seria a régua achar que o formato é um só.
  const raiz = corpo as Record<string, unknown>;
  const dentro = raiz.scope;
  const s = (dentro && typeof dentro === "object" && !Array.isArray(dentro) ? dentro : raiz) as Record<string, unknown>;
  const social = s.social;
  if (!social || typeof social !== "object" || Array.isArray(social)) return null;

  const porSemana = volumeDeclarado(social as SocialScope);
  if (porSemana === null) return null;

  const partes: string[] = [`${porSemana} posts/semana`];
  let total = porSemana * SEMANAS_POR_MES;

  // Stories e vídeos são PEÇAS produzidas, e o contrato de saída cobra peça —
  // não "post de feed". Deixá-los de fora fazia a casa cobrar do especialista
  // um terço do que o cliente comprou. Só entra número declarado e utilizável.
  const stories = volumeDeclarado({ postsPerWeek: (social as SocialScope).storiesPerWeek } as SocialScope);
  if (stories !== null) {
    total += stories * SEMANAS_POR_MES;
    partes.push(`${stories} stories/semana`);
  }
  for (const [campo, rotulo] of [["reelsPerMonth", "reels/mês"], ["videosPerMonth", "vídeos/mês"]] as const) {
    const n = volumeDeclarado({ postsPerWeek: (social as unknown as Record<string, number | undefined>)[campo] } as SocialScope);
    if (n !== null) {
      total += n;
      partes.push(`${n} ${rotulo}`);
    }
  }

  // ── ZERO DECLARADO É EXCLUSÃO, NÃO LACUNA (25/08/2026) ────────────────────
  //
  // Medido no case Farol 27: a cliente escreveu `storiesPerWeek: 0` — ela NÃO
  // quer stories, e disse isso no campo estruturado. A leitura de exclusões
  // abaixo varre PROSA ("sem stories"), e um zero não é prosa: `excluidos`
  // saía vazio, `permitidos` continha `story`, e o contrato da produção passava
  // a COBRAR de 2 a 3 stories de quem tinha pedido nenhum.
  //
  // Repare que isto NÃO é inferir: `volumeDeclarado` já ensina que zero é "o
  // dado não chegou" quando o campo é o volume que ESCOLHE o plano. Aqui o
  // caso é outro e o oposto: o campo do formato só existe porque alguém o
  // preencheu, e o zero é a resposta dele. Só entra formato cujo campo veio
  // como número zero de verdade — ausente continua sendo ausente.
  const zerados: FormatoContratado[] = [];
  const bruto = social as unknown as Record<string, unknown>;
  const zeroEm = (campo: string) => typeof bruto[campo] === "number" && bruto[campo] === 0;
  if (zeroEm("storiesPerWeek")) zerados.push("story");
  // Vídeo entra por DOIS campos (`reelsPerMonth` e `videosPerMonth`). Só é
  // exclusão quando NENHUM dos dois traz número positivo — senão zerar um
  // apagaria o que o cliente comprou pelo outro.
  const positivoEm = (campo: string) => typeof bruto[campo] === "number" && (bruto[campo] as number) > 0;
  if ((zeroEm("reelsPerMonth") || zeroEm("videosPerMonth")) && !positivoEm("reelsPerMonth") && !positivoEm("videosPerMonth")) {
    zerados.push("reel");
  }

  return {
    pecasPorMes: total,
    procedencia: `campo do briefing (${partes.join(" + ")}) = ${total}/mês`,
    zerados,
  };
}

/**
 * Lê o escopo de conteúdo do que o cliente escreveu.
 *
 * `fontes` são textos crus: cada serviço contratado, o bloco de escopo do
 * briefing e o contexto bruto da solicitação. Nada aqui vai ao banco e nada
 * chama IA — é leitura determinística, e por isso é auditável.
 */
export function lerEscopoDeConteudo(fontes: {
  servicos?: string[];
  escopo?: string;
  contextoBruto?: string;
}): EscopoDeConteudo {
  const pedacos = [
    ...(fontes.servicos ?? []),
    fontes.escopo ?? "",
    fontes.contextoBruto ?? "",
  ].filter((s) => typeof s === "string" && s.trim());

  if (pedacos.length === 0) return escopoNaoDeclarado();

  const texto = dobrar(pedacos.join("\n"));
  const lacunas: string[] = [];
  const procedencia: string[] = [];

  // ── O VOLUME ──────────────────────────────────────────────────────────────
  //
  // ⚠️ O DEFEITO QUE ESTE BLOCO PAGOU DUAS VEZES (24/08/2026, medido em
  // produção pelo case Farol 27, e reproduzido por dois caminhos independentes)
  //
  // A régua lia só prosa, e só conhecia "/mês" e "/dia". O cliente diz o volume
  // como GENTE DIZ — *"3 posts por semana no feed"* — e o próprio SDR da casa
  // anotava certo, no campo estruturado (`social.postsPerWeek: 3`), ao lado.
  // Resultado medido: `pecasPorMes = null`, o caminho automático recusava o
  // briefing por "a casa não sabe o que vendeu", e o que era recusado não era o
  // caso excepcional — era o CASO TÍPICO.
  //
  // Duas leituras entram aqui, nesta ordem, e a ordem é a regra:
  //
  //   1. O CAMPO ESTRUTURADO, quando `escopo` chega como JSON. Ele é o dado que
  //      a casa GRAVOU, não o que ela adivinhou de um texto — é a fonte mais
  //      forte que existe, e ignorá-la para reler a prosa era o defeito.
  //   2. A PROSA, como antes, para o briefing que só tem texto.
  //
  // Nada aqui infere: continua valendo o guardrail 1 — o que não estiver
  // escrito (num campo ou numa frase) segue virando LACUNA, nunca número.
  let pecasPorMes: number | null = null;

  const doCampo = volumeDoCampoEstruturado(fontes.escopo);
  if (doCampo) {
    pecasPorMes = doCampo.pecasPorMes;
    procedencia.push(`volume: ${doCampo.procedencia}`);
  }
  /** Os formatos que o cliente ZEROU no campo estruturado — exclusão escrita
   *  em número, e não em prosa. Entram no mesmo conjunto das de frase. */
  const zeradosNoCampo = doCampo?.zerados ?? [];

  if (pecasPorMes === null) {
    const porMes = /(\d{1,3})\s*(?:posts?|pe[cç]as?|publicac[oõ]es|conte[uú]dos?)[^.\n]{0,30}?(?:\/\s*m[eê]s|por m[eê]s|mensa)/.exec(texto);
    if (porMes) {
      pecasPorMes = Number(porMes[1]);
      procedencia.push(`volume: "${porMes[0].trim()}"`);
    } else {
      // "3 posts por semana" — a forma como o cliente fala, e a que faltava.
      // 4 semanas, e não 4,33: mesma escolha do "× 30 dias" logo abaixo — o
      // calendário do cliente é mensal, não astronômico —, e para baixo, que é
      // o lado seguro: prometer menos do que se leu nunca entrega a menos.
      const porSemana = /(\d{1,2})\s*(?:posts?|pe[cç]as?|publicac[oõ]es|conte[uú]dos?)[^.\n]{0,30}?(?:por semana|\/\s*semana|semanal)/.exec(texto);
      if (porSemana) {
        pecasPorMes = Number(porSemana[1]) * SEMANAS_POR_MES;
        procedencia.push(`volume: "${porSemana[0].trim()}" × ${SEMANAS_POR_MES} semanas`);
      } else {
        const porDia = /(\d{1,2})\s*(?:posts?|pe[cç]as?)[^.\n]{0,30}?(?:por dia|\/\s*dia|di[aá]ri)/.exec(texto);
        if (porDia) {
          // 30 dias, e não 30,4: o calendário do cliente é mensal, não astronômico.
          pecasPorMes = Number(porDia[1]) * 30;
          procedencia.push(`volume: "${porDia[0].trim()}" × 30 dias`);
        }
      }
    }
  }
  if (pecasPorMes === null || !Number.isFinite(pecasPorMes) || pecasPorMes <= 0) {
    pecasPorMes = null;
    lacunas.push("quantas peças por mês o cliente comprou");
  }

  // ── OS FORMATOS EXCLUÍDOS ─────────────────────────────────────────────────
  //
  // Contrato escreve exclusão de DUAS formas, e ler só uma perde metade:
  //
  //   1. NA FRASE — "Sem carrossel."
  //   2. NUMA SEÇÃO — um título ("O que NÃO está incluído") seguido de uma
  //      lista. Foi assim que o CityJobs escreveu três das quatro exclusões
  //      dele, e uma varredura frase a frase acharia só a primeira.
  //
  // A granularidade importa nas duas. Na frase, a unidade é a SENTENÇA: a linha
  // "só post simples, dois por dia... Sem carrossel" tem "post simples" (feed)
  // e "carrossel" juntas, e uma varredura de linha inteira excluiria o feed —
  // que é justamente o que o cliente comprou. No item de lista, a unidade é a
  // PRIMEIRA CLÁUSULA: "- Carrossel — decisão do CEO: por enquanto, só post
  // simples" nomeia o formato excluído antes do travessão, e explica depois.
  const excluidos = new Set<FormatoContratado>();
  const excluir = (f: FormatoContratado, onde: string) => {
    excluidos.add(f);
    procedencia.push(`${f} fora do escopo: "${onde.trim().slice(0, 80)}"`);
  };
  for (const f of zeradosNoCampo) excluir(f, "o cliente declarou 0 no campo do briefing");
  const formatosEm = (trecho: string): FormatoContratado[] =>
    FORMATOS_CONTRATAVEIS.filter((f) => NOMES[f].test(trecho));

  let emSecaoDeExclusao = false;
  for (const linha of texto.split("\n")) {
    const l = linha.trim();
    if (!l) continue;
    const ehItem = /^[-*·•\d]+[\s.)]/.test(l);

    // Um TÍTULO de exclusão: diz "fora" e não nomeia formato nenhum. É ele que
    // abre a seção; a lista abaixo dela é que carrega os formatos.
    if (!ehItem && EXCLUSAO.some((p) => p.test(l)) && formatosEm(l).length === 0) {
      emSecaoDeExclusao = true;
      continue;
    }
    if (emSecaoDeExclusao && ehItem) {
      const primeiraClausula = l.replace(/^[-*·•\d]+[\s.)]+/, "").split(/[—–(:,]/)[0] ?? "";
      for (const f of formatosEm(primeiraClausula)) excluir(f, l);
      continue;
    }
    // Linha comum encerra a seção — e é conferida frase a frase.
    if (!ehItem) emSecaoDeExclusao = false;
    for (const frase of l.split(/[;.]/)) {
      if (!EXCLUSAO.some((p) => p.test(frase))) continue;
      for (const f of formatosEm(frase)) excluir(f, frase);
    }
  }
  if (excluidos.size === 0) {
    lacunas.push("quais formatos estão fora do escopo (nenhuma exclusão foi escrita)");
  }

  return { pecasPorMes, excluidos: [...excluidos], lacunas, procedencia };
}

/**
 * O TETO POR ENTREGA — e ele é de custo, não de contrato.
 *
 * O cliente pode ter comprado 32 posts no mês; UMA passada do especialista não
 * pode devolver 32 legendas boas, e cada peça vira arte paga. Este teto existe
 * para que o volume mensal seja entregue em várias passadas, não numa só.
 *
 * ⚠️ **O teto não é a entrega do mês.** Ele é o teto de UMA LEVA. Quantas levas
 * o mês tem está em `ENTREGAS_POR_MES`, e o produto dos dois é o que a casa
 * entrega — a conta que a catraca da vitrine confere.
 */
export const TETO_DE_PECAS_POR_ENTREGA = 12;

// ═══ AS LEVAS — a capacidade que faz o plano Completo caber ═════════════════
//
// ── O QUE ESTAVA QUEBRADO ───────────────────────────────────────────────────
//
// A casa entregava UMA passada por mês. Não por escolha comercial: por
// construção. `retomarProducao` (`despertador.ts`) só pega projeto `pending`, e
// depois da primeira passada do ciclo o projeto vira `done`; a idempotência do
// motor é por especialista DENTRO DO CICLO. Não havia como existir uma segunda.
//
// Resultado medido em 25/08/2026: teto real de 12 peças/mês contra planos que
// anunciavam de 34 a 160. NENHUM plano cabia.
//
// ── O QUE DISSOLVEU O DILEMA ────────────────────────────────────────────────
//
// Cada peça custa à casa ~R$ 1,30 entre texto e imagem. 32 peças custam ~R$ 45
// contra um plano de R$ 1.790. **O limite de 12 era escolha de software, não de
// dinheiro.** Então o conserto é o motor entregar mais vezes, e não a vitrine
// prometer menos.
//
// ── O NÚMERO, E O MOTIVO AO LADO DELE ───────────────────────────────────────
//
// **TRÊS levas, uma a cada DEZ dias.**
//
//   • **Por que três, e não duas nem seis.** Três é o menor número de levas
//     cujo teto (3 × 12 = 36) cobre as 32 peças do plano mais caro da casa. Duas
//     dariam 24 e o Completo não caberia; seis dariam 72 de teto que ninguém
//     vende, e cada leva a mais é uma rodada a mais de julgamento da Qualidade e
//     de chamada paga de IA. Capacidade que ninguém vende é custo sem receita.
//
//   • **Por que dez dias, e não "tudo no dia 1".** Se as 32 peças saíssem de uma
//     vez, o cliente receberia 32 cartões no mesmo dia e a Qualidade julgaria 32
//     de uma vez. Ninguém aprova 32 peças numa sentada — o portal vira um muro e
//     a aprovação para, que é o oposto do que a capacidade nova serve. Dez dias
//     dão três levas dentro de qualquer mês (30 e 31 dias) e põem ~11 peças na
//     mão do cliente de cada vez: pouco mais de uma semana de publicação, que é
//     o horizonte que uma pessoa consegue olhar de uma sentada.
//
//   • **Por que o teto por leva NÃO subiu.** Ele é de custo e de qualidade, e
//     nada no que foi medido diz que uma passada devolve mais de 12 legendas
//     boas. Afrouxá-lo seria trocar a promessa que não se entrega por uma
//     entrega que não se aprova.
//
// ── E NENHUM RELÓGIO NOVO ───────────────────────────────────────────────────
//
// As levas pegam carona no despertador que já bate a cada 5 minutos
// (`lib/agency/esteira/levas.ts::abrirLevasVencidas`). Esta casa já perdeu dez
// dias com um cron que morreu em silêncio com o painel verde; um segundo
// agendador seria o mesmo defeito com outra roupa.

/** Quantas levas um ciclo tem. Vem da fonte única do quanto. */
export const LEVAS_POR_CICLO = ENTREGAS_POR_MES;

/** Dias entre uma leva e a seguinte. Ver o motivo no bloco acima. */
export const DIAS_ENTRE_LEVAS = 10;

/** O que a casa entrega num mês, pelo que o código faz. */
export const TETO_MENSAL_DE_PECAS = TETO_DE_PECAS_POR_ENTREGA * LEVAS_POR_CICLO;

/**
 * COMO O MÊS COMPRADO SE REPARTE ENTRE AS LEVAS.
 *
 * Reparte o mais igualmente possível, com as sobras nas PRIMEIRAS levas — um
 * cliente que cancelar no meio do ciclo recebeu a maior parte do que pagou, e
 * não a menor. Nenhuma leva passa de `TETO_DE_PECAS_POR_ENTREGA`; o que não
 * couber em `LEVAS_POR_CICLO × teto` simplesmente não é prometido, e quem chama
 * fica sabendo pela conta não fechar (é `avisoDeCobertura` que diz isso em voz
 * alta).
 */
export function planoDeLevas(pecasPorMes: number): number[] {
  if (!Number.isFinite(pecasPorMes) || pecasPorMes <= 0) return [];
  const total = Math.min(Math.floor(pecasPorMes), TETO_MENSAL_DE_PECAS);
  const base = Math.floor(total / LEVAS_POR_CICLO);
  const sobra = total - base * LEVAS_POR_CICLO;
  return Array.from({ length: LEVAS_POR_CICLO }, (_, i) => base + (i < sobra ? 1 : 0))
    .filter((n) => n > 0);
}

/**
 * QUAL LEVA ESTÁ VENCIDA AGORA, contando do começo do ciclo.
 *
 * 1 nos primeiros dez dias, 2 nos dez seguintes, 3 daí em diante — e nunca mais
 * que `LEVAS_POR_CICLO`, porque um ciclo que atrasou não vira crédito de peça.
 */
export function levaDevidaEm(inicioDoCiclo: Date, agora: Date): number {
  const dias = Math.floor((agora.getTime() - inicioDoCiclo.getTime()) / 86_400_000);
  if (!Number.isFinite(dias) || dias < 0) return 1;
  return Math.min(LEVAS_POR_CICLO, Math.floor(dias / DIAS_ENTRE_LEVAS) + 1);
}

export interface ExigenciaDeConteudo {
  min: number;
  max: number;
  /** Os formatos que o especialista PODE entregar. */
  permitidos: FormatoContratado[];
  /** Quanto do mês esta entrega cobre. `null` quando o volume não é legível. */
  cobreDoMes: { entrega: number; contratado: number; leva: number; levas: number } | null;
  /** O que ficou sem resposta no contrato do cliente. */
  lacunas: string[];
}

/**
 * A exigência do especialista, DERIVADA do contrato do cliente e DA LEVA.
 *
 * Sem contrato legível, cai na régua histórica da casa (6 a 8, todos os
 * formatos) — DECLARANDO a lacuna. É a leitura conservadora: parar a produção
 * de todo cliente cujo briefing não escreveu o volume seria trocar um dano por
 * um maior. Cliente sem volume legível continua com UMA leva: não se multiplica
 * gasto por um número que ninguém leu.
 */
export function exigenciaDeConteudo(escopo: EscopoDeConteudo, leva = 1): ExigenciaDeConteudo {
  const permitidos = FORMATOS_CONTRATAVEIS.filter((f) => !escopo.excluidos.includes(f));

  if (escopo.pecasPorMes === null) {
    return { min: 6, max: 8, permitidos, cobreDoMes: null, lacunas: escopo.lacunas };
  }

  const plano = planoDeLevas(escopo.pecasPorMes);
  const indice = Math.min(Math.max(1, Math.floor(leva)), plano.length || 1);
  const porEntrega = Math.min(plano[indice - 1] ?? 0, TETO_DE_PECAS_POR_ENTREGA);
  return {
    min: porEntrega,
    max: porEntrega,
    permitidos,
    cobreDoMes: {
      entrega: plano.reduce((a, b) => a + b, 0),
      contratado: escopo.pecasPorMes,
      leva: indice,
      levas: plano.length,
    },
    lacunas: escopo.lacunas,
  };
}

/**
 * A frase que sobe quando a entrega do MÊS não cobre o mês comprado.
 *
 * Vazia quando cobre, ou quando o volume não é legível (aí a lacuna já foi
 * nomeada em outro lugar). Não é parecer para o especialista — ele não tem como
 * resolver isto sozinho: é aviso para gente.
 *
 * ⚠️ Repare no que ela mede AGORA: o mês inteiro contra o contrato, e não uma
 * passada contra o contrato. Antes das levas, esta frase disparava para todo
 * cliente de mais de 12 peças — inclusive os que a casa hoje entrega inteiros —
 * e um aviso que dispara sempre é um aviso que ninguém lê.
 */
export function avisoDeCobertura(e: ExigenciaDeConteudo, cliente: string): string {
  if (!e.cobreDoMes) return "";
  const { entrega, contratado } = e.cobreDoMes;
  if (entrega >= contratado) return "";
  return (
    `${cliente} comprou ${contratado} peças no mês e a casa entrega ${entrega}. ` +
    `Faltam ${contratado - entrega} para o contrato fechar — o teto do mês é ${TETO_MENSAL_DE_PECAS} ` +
    `(${LEVAS_POR_CICLO} levas de até ${TETO_DE_PECAS_POR_ENTREGA} peças; uma passada não devolve o mês ` +
    "inteiro com qualidade, e cada peça vira arte paga). " +
    "O cliente está recebendo menos do que pagou, e isto é pergunta para gente."
  );
}
