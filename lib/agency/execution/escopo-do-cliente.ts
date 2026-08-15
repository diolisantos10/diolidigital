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
  // "60 posts por mês", "60 posts simples/mês", "2 posts por dia".
  let pecasPorMes: number | null = null;
  const porMes = /(\d{1,3})\s*(?:posts?|pe[cç]as?|publicac[oõ]es|conte[uú]dos?)[^.\n]{0,30}?(?:\/\s*m[eê]s|por m[eê]s|mensa)/.exec(texto);
  if (porMes) {
    pecasPorMes = Number(porMes[1]);
    procedencia.push(`volume: "${porMes[0].trim()}"`);
  } else {
    const porDia = /(\d{1,2})\s*(?:posts?|pe[cç]as?)[^.\n]{0,30}?(?:por dia|\/\s*dia|di[aá]ri)/.exec(texto);
    if (porDia) {
      // 30 dias, e não 30,4: o calendário do cliente é mensal, não astronômico.
      pecasPorMes = Number(porDia[1]) * 30;
      procedencia.push(`volume: "${porDia[0].trim()}" × 30 dias`);
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
