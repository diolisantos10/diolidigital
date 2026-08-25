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
 * O cliente pode ter comprado 60 posts no mês; UMA passada do especialista não
 * pode devolver 60 legendas boas, e cada peça vira arte paga. Este teto existe
 * para que o volume mensal seja entregue em várias passadas, não numa só.
 *
 * ⚠️ **O teto não é a entrega do mês.** Quando ele morde, quem chama precisa
 * dizer isso em voz alta — senão o cliente compra 60 e o sistema entrega 8 em
 * silêncio, para sempre, que é exatamente o que acontecia até hoje.
 */
export const TETO_DE_PECAS_POR_ENTREGA = 12;

export interface ExigenciaDeConteudo {
  min: number;
  max: number;
  /** Os formatos que o especialista PODE entregar. */
  permitidos: FormatoContratado[];
  /** Quanto do mês esta entrega cobre. `null` quando o volume não é legível. */
  cobreDoMes: { entrega: number; contratado: number } | null;
  /** O que ficou sem resposta no contrato do cliente. */
  lacunas: string[];
}

/**
 * A exigência do especialista, DERIVADA do contrato do cliente.
 *
 * Sem contrato legível, cai na régua histórica da casa (6 a 8, todos os
 * formatos) — DECLARANDO a lacuna. É a leitura conservadora: parar a produção
 * de todo cliente cujo briefing não escreveu o volume seria trocar um dano por
 * um maior.
 */
export function exigenciaDeConteudo(escopo: EscopoDeConteudo): ExigenciaDeConteudo {
  const permitidos = FORMATOS_CONTRATAVEIS.filter((f) => !escopo.excluidos.includes(f));

  if (escopo.pecasPorMes === null) {
    return { min: 6, max: 8, permitidos, cobreDoMes: null, lacunas: escopo.lacunas };
  }

  const porEntrega = Math.min(escopo.pecasPorMes, TETO_DE_PECAS_POR_ENTREGA);
  return {
    min: porEntrega,
    max: porEntrega,
    permitidos,
    cobreDoMes: { entrega: porEntrega, contratado: escopo.pecasPorMes },
    lacunas: escopo.lacunas,
  };
}

/**
 * A frase que sobe quando a entrega não cobre o mês comprado.
 *
 * Vazia quando cobre, ou quando o volume não é legível (aí a lacuna já foi
 * nomeada em outro lugar). Não é parecer para o especialista — ele não tem como
 * resolver isto sozinho: é aviso para gente.
 */
export function avisoDeCobertura(e: ExigenciaDeConteudo, cliente: string): string {
  if (!e.cobreDoMes) return "";
  const { entrega, contratado } = e.cobreDoMes;
  if (entrega >= contratado) return "";
  return (
    `${cliente} comprou ${contratado} peças no mês e esta entrega traz ${entrega}. ` +
    `Faltam ${contratado - entrega} para o contrato fechar — o teto por entrega é ${TETO_DE_PECAS_POR_ENTREGA} ` +
    "(uma passada não devolve o mês inteiro com qualidade, e cada peça vira arte paga). " +
    "O mês só fecha com mais passadas; enquanto isso, o cliente está recebendo menos do que pagou."
  );
}
