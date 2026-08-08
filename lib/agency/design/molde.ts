// molde.ts — O LAYOUT SAI DE CÓDIGO. A FOTO SAI DA IA.
//
// ── O DIAGNÓSTICO (CEO, 05/08/2026) ─────────────────────────────────────────
//
// "O modelo faz FOTO; ele não faz LAYOUT." Até aqui a peça inteira era pedida
// ao `gpt-image-1` (`lib/ai/design-engine.ts`) — e modelo de imagem ERRA LETRA.
// Por isso `artes.ts` proibia texto na arte, e por isso os 36 criativos do
// lançamento da Foocci foram montados À MÃO em HTML e rasterizados. Este módulo
// é aquele trabalho manual virando motor.
//
// A divisão de trabalho, e o motivo de cada metade:
//
//   • FOTO (cenário, luz, textura) → IA de imagem. É o que ela faz bem.
//   • TEXTO, LOGO, COR e MARGEM  → CÓDIGO. HTML + tipografia real, rasterizado
//     pelo navegador que a casa já usa (`scripts/shot.mjs` é o precedente).
//     A letra sai do rasterizador de FONTE, não de um modelo generativo: ela é
//     certa por construção, do mesmo jeito que o wordmark do logo em SVG
//     (`lib/agency/execution/logo.ts:21`).
//
// ── ESTE ARQUIVO É PURO ─────────────────────────────────────────────────────
//
// Nada de banco, rede, navegador ou IA. Entra dado, sai string de HTML. Quem
// rasteriza é `renderizar.ts`; quem decide QUE texto pode entrar é
// `trava-de-texto.ts`. Separado assim porque o molde é a parte que precisa ser
// testável sem subir Chromium.
//
// ── DUAS REGRAS DE LAYOUT QUE NÃO SÃO GOSTO ─────────────────────────────────
//
// 1. NENHUM `text-transform` no CSS. O verificador do renderizador compara o
//    texto PEDIDO com o texto do DOM; `text-transform` pinta uma coisa e deixa
//    outra no DOM, ou seja, criaria exatamente o ponto cego que este motor
//    existe para fechar. Quando a peça pede caixa alta, a caixa alta é aplicada
//    em JavaScript ANTES — o texto conferido passa a ser o texto pintado.
// 2. NENHUMA fonte buscada na rede. `@import` de webfont num render offline
//    cai em silêncio para a fonte padrão do sistema, e a peça sai com outra
//    cara sem ninguém saber. As pilhas abaixo terminam sempre em família
//    genérica (`serif`/`sans-serif`), que existe em qualquer máquina.
//
//    ── E A REGRA 2 NÃO BASTAVA (08/08/2026) ─────────────────────────────────
//    Não buscar fonte na rede impede a peça de MENTIR sobre a letra; não
//    garante que a letra seja a certa. O contêiner que rasteriza tem Liberation
//    e DejaVu, e mais nada: `Inter`, `Helvetica Neue`, `Arial`, `Playfair
//    Display`, `Poppins`, `Oswald` — nenhuma existe ali. Toda peça desta casa
//    saía na última linha da pilha, e o CEO viu isso na peça reprovada do
//    CityJobs. O conserto é `fontes-embutidas.ts`: os BYTES da fonte viajam
//    dentro do documento, exatamente como os do logo real. A regra continua de
//    pé — o que mudou é que agora existe fonte de verdade para ela proteger.
//
// ── CLIENTE SEM MARCA DEFINIDA ──────────────────────────────────────────────
//
// Vazio é vazio. Sem cor no `BrandBrain`, o molde NÃO inventa cor de marca:
// entra o MOLDE NEUTRO, declarado como neutro em `origem` e com a falta listada
// em `lacunas`. Quem lê a peça sabe que aquele cinza é ausência de marca, não a
// marca do cliente.

//
// ── A VIRADA DE 07/08/2026: UMA COMPOSIÇÃO SÓ ERA O DEFEITO ─────────────────
//
// Até aqui este arquivo tinha UMA composição: foto cheia + degradê + texto por
// cima. Foi ela que produziu as 36 telas iguais da Foocci, e é ela que o CEO
// apontou em 07/08/2026: "as peças de referência DIVIDEM A TELA — um lado é
// fundo sólido com o texto, o outro é foto. Divisão reta OU em curva. As nossas
// jogam texto por cima da foto com degradê."
//
// Agora o molde sabe desenhar TRÊS composições (`Composicao`, definida em
// `repertorio.ts`), e quem escolhe qual **não é este arquivo**: é o cérebro
// criativo da marca, a partir do papel que a tela cumpre na história.
//
// Duas coisas NÃO mudaram, e são o que mantém a conferência de letra de pé:
//   • os elementos de texto são os MESMOS em qualquer composição (`data-papel`).
//     Composição que inventasse elemento novo criaria texto não conferido;
//   • nenhuma composição usa `text-transform` nem fonte de rede.

import { escaparHtml, type TextoDaPeca } from "./texto-da-peca";
import { cssDoMockup } from "./mockup";
import { cssDasFontesEmbutidas } from "./fontes-embutidas";
import type { Composicao } from "./repertorio";

// Reexportados para que nenhum chamador antigo precise mudar de import. A
// definição mora em `texto-da-peca.ts` desde 06/08/2026 — ver o porquê lá.
export { escaparHtml };
export type { TextoDaPeca };

/** Os formatos que um molde só atende. Mesma peça, mesma cara, sem redesenho. */
export type FormatoDaPeca = "feed" | "story" | "carrossel" | "quadrado";

export interface Dimensao {
  largura: number;
  altura: number;
  /** Área que a interface do Instagram cobre ou que o corte pode comer. Texto
   *  NUNCA entra aqui — o renderizador reprova a peça que invadir. */
  margemTopo: number;
  margemBase: number;
  margemLateral: number;
}

/**
 * As dimensões reais de publicação.
 *
 * Story é 1080×1920 com margens enormes em cima e embaixo de propósito: ali
 * moram o avatar, a barra de progresso e a caixa de resposta do Instagram. Peça
 * que escreve nessa faixa é peça publicada com o texto por baixo da interface.
 */
export const FORMATOS: Record<FormatoDaPeca, Dimensao> = {
  feed: { largura: 1080, altura: 1350, margemTopo: 72, margemBase: 88, margemLateral: 80 },
  carrossel: { largura: 1080, altura: 1350, margemTopo: 72, margemBase: 88, margemLateral: 80 },
  quadrado: { largura: 1080, altura: 1080, margemTopo: 72, margemBase: 88, margemLateral: 80 },
  story: { largura: 1080, altura: 1920, margemTopo: 260, margemBase: 300, margemLateral: 88 },
};

/** O formato de peça a partir do `format` do SocialPost. */
export function formatoDoPost(format: string | null | undefined): FormatoDaPeca {
  const f = (format ?? "").toLowerCase();
  if (f === "story") return "story";
  if (f === "carousel" || f === "carrossel") return "carrossel";
  if (f === "quadrado" || f === "square") return "quadrado";
  return "feed";
}

/**
 * As pilhas tipográficas.
 *
 * Espelham as de `lib/agency/execution/logo.ts:33` de propósito: o wordmark do
 * cliente e a arte dele têm de ser a mesma família. Estão duplicadas porque
 * `logo.ts` arrasta Prisma e o motor de imagem no import, e este arquivo é puro
 * — a extração da lista para um módulo comum ficou registrada como pendência.
 */
export const FAMILIAS_DA_ARTE: Record<string, string> = {
  serifada: "'Playfair Display', 'Georgia', 'Liberation Serif', 'DejaVu Serif', serif",
  geometrica: "'Poppins', 'Futura', 'Century Gothic', 'DejaVu Sans', sans-serif",
  // `Archivo` vai NA FRENTE porque é a única desta linha que existe de verdade
  // no rasterizador (ela viaja embutida). As outras ficam: se um dia a peça for
  // aberta numa máquina que tenha Inter ou Helvetica de sistema, elas valem.
  neutra: "'Archivo', 'Inter', 'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif",
  manuscrita: "'Pacifico', 'Brush Script MT', cursive",
  condensada: "'Oswald', 'Impact', 'Arial Narrow', 'Liberation Sans Narrow', sans-serif",
};

/**
 * A pilha do TÍTULO — o peso de display, que não é o mesmo do corpo.
 *
 * ── POR QUE ISTO PRECISOU EXISTIR ───────────────────────────────────────────
 *
 * Até aqui a peça inteira usava UMA família e o título se distinguia só por
 * `font-weight:800`. Numa pilha que caía em Liberation Sans, `800` vira o
 * Bold comum — e a diferença entre título e apoio virava quase nada. É metade
 * da distância entre a peça reprovada e a referência: hierarquia tipográfica
 * de verdade é famílias diferentes, não um número no CSS.
 *
 * `Archivo Black` é o substituto declarado de `Arial Black` (ver
 * `fontes-embutidas.ts`) — que é o que o manual do CityJobs pede e o que o
 * logo oficial dele usa. Marca cuja tipografia é sans NUNCA recebe display
 * serifado por este mapa: o display de cada chave é da MESMA linhagem do
 * corpo dela.
 */
export const FAMILIAS_DE_DISPLAY: Record<string, string> = {
  serifada: "'Playfair Display', 'Georgia', 'Liberation Serif', 'DejaVu Serif', serif",
  geometrica: "'Poppins', 'Futura', 'Century Gothic', 'DejaVu Sans', sans-serif",
  neutra: "'Archivo Black', 'Archivo', 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif",
  manuscrita: "'Pacifico', 'Brush Script MT', cursive",
  condensada: "'Oswald', 'Impact', 'Arial Narrow', 'Liberation Sans Narrow', sans-serif",
};

/** O molde neutro. NÃO é a marca de ninguém — é a ausência dela, declarada. */
export const NEUTRO = {
  primaria: "#141414",
  secundaria: "#8A8A8A",
  tinta: "#FFFFFF",
  familia: FAMILIAS_DA_ARTE.neutra!,
  familiaDisplay: FAMILIAS_DE_DISPLAY.neutra!,
} as const;

export interface Molde {
  /** "marca" = veio do BrandBrain do cliente. "neutro" = ele não tem marca
   *  definida, e o molde diz isso em vez de inventar uma. */
  origem: "marca" | "neutro";
  primaria: string;
  secundaria: string;
  /** A cor do texto sobre a faixa/scrim. Calculada por contraste, nunca chutada. */
  tinta: string;
  familia: string;
  /**
   * A pilha do TÍTULO. Ausente = usa a mesma do corpo (o comportamento de
   * antes de 08/08/2026), e nunca uma família de outra linhagem escolhida por
   * conta própria.
   */
  familiaDisplay?: string;
  /** O que faltava no BrandBrain. Entra no relatório da peça: a agência sabe o
   *  que não sabe, e o cliente pode preencher. */
  lacunas: string[];
  /**
   * O LOGO REAL DO CLIENTE, em data URL — o arquivo que ele mesmo mandou.
   *
   * ── POR QUE ESTE CAMPO PRECISOU EXISTIR (07/08/2026) ─────────────────────
   *
   * Até aqui a peça era assinada pelo NOME DO CLIENTE EM TEXTO, mais um
   * monograma derivado das iniciais. O molde não tinha campo para imagem de
   * logo — nenhum. Então o cliente conectava o Drive, mandava o logo oficial
   * dele, o arquivo entrava na casa com papel `logo` declarado por ele, e a
   * peça saía assinada com duas letras desenhadas por CSS. O material chegava
   * e a peça não mudava, que é o defeito inteiro desta frente.
   *
   * ── AUSÊNCIA CONTINUA SENDO AUSÊNCIA ────────────────────────────────────
   *
   * `null` = o cliente NÃO deu logo. Aí vale o comportamento de sempre:
   * monograma derivado do nome, e a falta declarada em `lacunas`. O que este
   * campo **nunca** autoriza é desenhar um logo: modelo de imagem erra letra, e
   * logo errado é a marca do cliente publicada torta, em nome dele.
   *
   * ── POR QUE DATA URL, E NÃO CAMINHO ─────────────────────────────────────
   *
   * Este arquivo é PURO e o documento HTML é autossuficiente: sem rede, sem
   * fonte externa, sem `file://`. Um `src` que o rasterizador não alcança falha
   * em SILÊNCIO — a peça sai sem o logo e ninguém sabe. Mesma armadilha da
   * webfont, resolvida do mesmo jeito: os bytes viajam dentro do documento.
   */
  logo?: LogoDoMolde | null;
}

/** O logo real, pronto para virar pixel. */
export interface LogoDoMolde {
  /** `data:image/png;base64,...`. Nunca URL de rede, nunca `file://`. */
  dataUrl: string;
  /** O nome do arquivo, para o registro da peça. Não vira pixel. */
  nome: string;
}

/** Os MIMEs de logo que o navegador desenha. SVG entra: é vetor, e é o formato
 *  em que a maioria dos clientes tem o logo oficial. */
export const MIMES_DE_LOGO = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/** Hex de 3 ou 6 dígitos. Qualquer outra coisa é tratada como ausência. */
export function corValida(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s.toUpperCase() : null;
}

/** Luminância relativa (WCAG). É o que decide se a tinta é branca ou preta —
 *  decisão de contraste é conta, não preferência. */
export function luminancia(hex: string): number {
  const s = hex.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const canal = (i: number) => {
    const v = parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

/** A tinta legível sobre um fundo. Branco em fundo escuro, quase-preto no claro. */
export function tintaSobre(fundo: string): string {
  return luminancia(fundo) > 0.45 ? "#111111" : "#FFFFFF";
}

/**
 * Escolhe a família a partir do que o cliente declarou.
 *
 * Sem declaração, NEUTRA — nunca "combina com o segmento". Adivinhar tipografia
 * por ramo de negócio é a agência decidindo a identidade do cliente sozinha.
 */
export function familiaDeclarada(typography: string | null | undefined): { chave: string; pilha: string; display: string; declarada: boolean } {
  const t = (typography ?? "").toLowerCase();
  const achar = (): string | null => {
    if (/serif|playfair|georgia|times|garamond/.test(t) && !/sans/.test(t)) return "serifada";
    if (/poppins|futura|geom|century/.test(t)) return "geometrica";
    if (/oswald|impact|condens|narrow/.test(t)) return "condensada";
    if (/script|manuscrit|pacifico|cursiv|handwrit/.test(t)) return "manuscrita";
    if (/inter|helvetica|arial|sans|neutra|grotesk/.test(t)) return "neutra";
    return null;
  };
  const chave = achar();
  // O display SEMPRE sai da MESMA chave do corpo. É a trava que impede a
  // tipografia de uma marca de vazar para outra: marca declarada `sans` não
  // recebe display serifado nem por engano, e a serifada de display da Dioli
  // não aparece numa peça do CityJobs porque a chave dele não é `serifada`.
  if (!chave) {
    return { chave: "neutra", pilha: FAMILIAS_DA_ARTE.neutra!, display: FAMILIAS_DE_DISPLAY.neutra!, declarada: false };
  }
  return { chave, pilha: FAMILIAS_DA_ARTE[chave]!, display: FAMILIAS_DE_DISPLAY[chave]!, declarada: true };
}

export interface MarcaDoCliente {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  typography?: string | null;
}

/**
 * O molde DESTE cliente.
 *
 * É o que faz a tela 6 do carrossel ter a mesma cara da tela 1: as duas nascem
 * do mesmo objeto, e o objeto vem do banco — não de um prompt escrito de novo a
 * cada peça.
 */
export function moldeDoCliente(marca: MarcaDoCliente | null | undefined): Molde {
  const lacunas: string[] = [];
  const primaria = corValida(marca?.primaryColor);
  const secundaria = corValida(marca?.secondaryColor);
  const fam = familiaDeclarada(marca?.typography);

  if (!primaria) lacunas.push("cor primária da marca");
  if (!secundaria) lacunas.push("cor secundária da marca");
  if (!fam.declarada) lacunas.push("tipografia da marca");

  // Sem cor primária não existe marca para seguir. Mesmo que a secundária
  // exista, promovê-la a principal seria a agência escolhendo a cor do cliente.
  if (!primaria) {
    return {
      origem: "neutro",
      primaria: NEUTRO.primaria,
      secundaria: NEUTRO.secundaria,
      tinta: NEUTRO.tinta,
      familia: fam.pilha,
      familiaDisplay: fam.display,
      lacunas,
    };
  }

  return {
    origem: "marca",
    primaria,
    secundaria: secundaria ?? NEUTRO.secundaria,
    tinta: tintaSobre(primaria),
    familia: fam.pilha,
    familiaDisplay: fam.display,
    lacunas,
  };
}

/** A LACUNA do logo, escrita uma vez só. Aparece em `Molde.lacunas` e no
 *  registro da peça, e as duas têm de dizer a mesma frase. */
export const LACUNA_DO_LOGO = "logo do cliente em arquivo (a peça foi assinada com o monograma das iniciais, não com o logo real)";

/**
 * Prega o LOGO REAL no molde — ou declara que não há.
 *
 * Mora aqui, e não em `moldeDoCliente`, porque o logo não vem do `BrandBrain`:
 * vem de um ARQUIVO no armazenamento, e ler arquivo é assíncrono e toca disco.
 * Este arquivo é puro por contrato (ver o cabeçalho), e quebrar essa pureza
 * significaria não conseguir testar o molde sem montar meia casa.
 *
 * As duas metades, e a segunda é a que costuma faltar:
 *   • COM logo, ele entra e a lacuna NÃO é declarada — declarar falta que não
 *     existe treina quem lê a ignorar as declarações;
 *   • SEM logo (ou com MIME que o navegador não desenha), o molde volta
 *     INTACTO e com a lacuna declarada. Nunca um logo desenhado.
 */
export function moldeComLogo(
  molde: Molde,
  logo: { dataUrl?: string | null; nome?: string | null; mimeType?: string | null } | null | undefined,
): Molde {
  const dataUrl = (logo?.dataUrl ?? "").trim();
  const mimeOk = !logo?.mimeType || MIMES_DE_LOGO.has(logo.mimeType);

  if (!dataUrl || !dataUrl.startsWith("data:") || !mimeOk) {
    // Ausência de material NÃO vira invenção: ela vira declaração.
    const lacunas = molde.lacunas.includes(LACUNA_DO_LOGO) ? molde.lacunas : [...molde.lacunas, LACUNA_DO_LOGO];
    return { ...molde, logo: null, lacunas };
  }
  return { ...molde, logo: { dataUrl, nome: (logo?.nome ?? "").trim() || "logo" } };
}

// ─── A peça ─────────────────────────────────────────────────────────────────

export interface PecaDoMolde {
  formato: FormatoDaPeca;
  /** A frase principal. Passou pela trava (`trava-de-texto.ts`) antes de chegar aqui. */
  titulo: string;
  /** Linha de apoio, opcional. */
  apoio?: string | null;
  /** O chapéu (pilar de conteúdo). É pintado em caixa alta — aplicada em JS. */
  selo?: string | null;
  /** Nome do cliente, no rodapé. */
  assinatura?: string | null;
  /** A FOTO. Data URL (`data:image/png;base64,...`) ou caminho `file://`.
   *  `null` = peça sem foto: fundo chapado na cor do molde. Isso é degradação
   *  declarada, não erro — melhor uma peça sóbria que uma peça vazia. */
  fundo?: string | null;
  /** "3/6" no canto do carrossel. */
  indice?: { atual: number; total: number } | null;
  /**
   * O bloco de mockup, JÁ MONTADO por `montarMockup` (`mockup.ts`).
   *
   * Vem pronto, e não como pedido, por um motivo que é o coração da trava: o
   * mockup pode RECUSAR (captura declarada sem imagem, número sem origem). Se o
   * molde montasse, a recusa teria que virar exceção no meio do layout ou —
   * pior — um bloco vazio pintado do mesmo jeito. Aqui, peça sem mockup é peça
   * sóbria; peça com mockup é peça cuja procedência alguém declarou.
   *
   * Os `textos` entram na conferência do renderizador junto com os do molde.
   */
  mockup?: { html: string; textos: TextoDaPeca[] } | null;
  /**
   * A COMPOSIÇÃO desta tela — onde o texto mora dentro da peça.
   *
   * Ausente = `foto-cheia`, o layout histórico. Nenhuma peça muda de cara sem
   * alguém pedir; o que muda é que agora existe pedido possível.
   *
   * Quem escolhe NÃO é este arquivo: é o cérebro criativo da marca, a partir do
   * PAPEL que a tela cumpre na história (`repertorio.ts`,
   * `composicaoParaFuncao`). Layout deixou de ser preferência e virou
   * consequência da função.
   */
  composicao?: Composicao | null;
}

/**
 * O MONOGRAMA DA ASSINATURA — token, não decisão de peça.
 *
 * Até 06/08/2026 a assinatura era o nome do cliente solto no rodapé, e cada
 * peça decidia sozinha se e como assinava. "Decidir sozinha 36 vezes foi o que
 * produziu as 36 telas iguais" (comparativo do CEO): quando não há token, o
 * gerador repete o mesmo default para sempre — e, na peça de referência, a
 * marca no mundo físico aparece justamente porque a assinatura é constante.
 *
 * Derivado por regra do nome, nunca inventado: iniciais das duas primeiras
 * palavras com letra; nome de uma palavra só vira as duas primeiras letras.
 *
 * ── A EMENDA INTERNA CONTA COMO ESPAÇO (07/08/2026) ────────────────────────
 * "CityJobs" é UMA palavra para `split(/\s+/)`, então o monograma saía "CI" —
 * duas letras da mesma palavra, com o J de Jobs sumido. Silencioso e errado: a
 * assinatura é o token que aparece em TODA peça de TODA campanha, e ninguém
 * revisa 60 rodapés por mês.
 *
 * Marca escrita em caixa camelo é uma composição de duas palavras que perdeu o
 * espaço na hora de virar logotipo — e o logo oficial do CityJobs prova isso,
 * porque desenha "CITY" e "JOBS" em DUAS linhas
 * (`public/brand/cityjobs/01_city_jobs_quadrado_principal.svg`). A transição
 * minúscula→MAIÚSCULA é, portanto, fronteira de palavra.
 *
 * Só essa transição, e de propósito: "Foocci" continua "FO" e "MOGI" continua
 * "MO", porque nem toda maiúscula é emenda — sequência de maiúsculas é ênfase
 * ou sigla, não composição.
 */
export function monogramaDe(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim();
  if (!limpo) return null;
  const palavras = limpo
    // A emenda camelo vira espaço ANTES do corte por espaço.
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((p) => p.length > 0);
  if (palavras.length === 0) return null;
  if (palavras.length === 1) return palavras[0]!.slice(0, 2).toUpperCase();
  return (palavras[0]![0]! + palavras[1]![0]!).toUpperCase();
}

/**
 * Os textos que a peça vai pintar, na ordem, já com a caixa aplicada.
 *
 * Existe separado do HTML porque é ESTA lista que o renderizador confere contra
 * o DOM. Se a conferência lesse o próprio HTML, ela estaria conferindo o
 * gerador contra o gerador.
 */
export function textosDaPeca(peca: PecaDoMolde): TextoDaPeca[] {
  return [...textosDoMolde(peca), ...(peca.mockup?.textos ?? [])];
}

/**
 * Só os textos que o MOLDE pinta — sem os do mockup.
 *
 * Existe separado porque `montarHtmlDaPeca` indexa estes por `papel`, e o
 * mockup emite vários textos com o mesmo papel (`apoio`, uma vez por linha do
 * painel e por balão da conversa). Indexar os dois juntos faria a última linha
 * do painel SUBSTITUIR a linha de apoio da peça — um layout errado que nenhum
 * teste de texto pegaria, porque a lista conferida continuaria completa.
 */
function textosDoMolde(peca: PecaDoMolde): TextoDaPeca[] {
  const fora: TextoDaPeca[] = [];
  if (peca.selo?.trim()) fora.push({ papel: "selo", texto: peca.selo.trim().toUpperCase() });
  if (peca.titulo?.trim()) fora.push({ papel: "titulo", texto: peca.titulo.trim() });
  if (peca.apoio?.trim()) fora.push({ papel: "apoio", texto: peca.apoio.trim() });
  if (peca.assinatura?.trim()) fora.push({ papel: "assinatura", texto: peca.assinatura.trim() });
  if (peca.indice) fora.push({ papel: "indice", texto: `${peca.indice.atual}/${peca.indice.total}` });
  return fora;
}

/** A faixa do rodapé (assinatura + índice do carrossel), medida a partir do fim
 *  da margem de base. O conteúdo principal começa acima dela. */
const ALTURA_DO_RODAPE = 76;

/** Tamanho base do título por formato — o renderizador só encolhe a partir daqui. */
const TITULO_PX: Record<FormatoDaPeca, number> = {
  feed: 84, carrossel: 84, quadrado: 78, story: 96,
};

/**
 * Monta o HTML da peça.
 *
 * O documento é autossuficiente: sem rede, sem script, sem fonte externa. O
 * mesmo HTML aberto no navegador de qualquer pessoa mostra a mesma peça.
 */
export function montarHtmlDaPeca(peca: PecaDoMolde, molde: Molde): string {
  const dim = FORMATOS[peca.formato];
  const textos = new Map(textosDoMolde(peca).map((t) => [t.papel, t.texto]));
  const monograma = monogramaDe(peca.assinatura);
  const temFundo = typeof peca.fundo === "string" && peca.fundo.length > 0;

  // ── O CAMPO PRÓPRIO DO TEXTO ──────────────────────────────────────────────
  //
  // Nas composições DIVIDIDAS o texto não fica sobre a foto: ele tem um campo
  // sólido só dele, e a foto ocupa a parte de cima. Não é estética — com campo
  // próprio a legibilidade deixa de depender do que a IA desenhou naquele
  // canto, e por isso o degradê (que escurecia a foto inteira para salvar a
  // letra) não precisa existir ali. A CURVA é o mesmo painel com recorte
  // elíptico subindo sobre a foto.
  const composicao: Composicao = peca.composicao ?? "foto-cheia";
  const dividida = composicao === "dividido-reto" || composicao === "dividido-curva";
  const ALTURA_DA_FOTO_PCT = 46;
  const SUBIDA_DA_CURVA_PX = 90;

  // Sobre foto, o texto precisa de um degradê por baixo — sem ele a legibilidade
  // depende da sorte do que a IA desenhou naquele canto. A cor do degradê é a
  // PRIMÁRIA da marca, então até a sombra pertence à identidade do cliente.
  // Na composição dividida ele não existe: o campo sólido já resolve.
  const scrim = temFundo && !dividida
    ? `linear-gradient(to top, ${molde.primaria} 0%, ${molde.primaria}F2 26%, ${molde.primaria}00 62%)`
    : "none";

  const tinta = temFundo || dividida ? tintaSobre(molde.primaria) : molde.tinta;
  const apoioCor = molde.secundaria;
  const el = (papel: string, tag: string, classe: string) => {
    const t = textos.get(papel as TextoDaPeca["papel"]);
    if (!t) return "";
    return `<${tag} class="${classe}" data-papel="${papel}" data-texto-exato="${escaparHtml(t)}">${escaparHtml(t)}</${tag}>`;
  };

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
${cssDasFontesEmbutidas()}
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${dim.largura}px; height:${dim.altura}px; overflow:hidden; }
  body {
    font-family: ${molde.familia};
    background: ${molde.primaria};
    color: ${tinta};
    -webkit-font-smoothing: antialiased;
  }
  .peca { position:relative; width:${dim.largura}px; height:${dim.altura}px; overflow:hidden; }
  .foto {
    position:absolute;
    /* Composição de painel: a foto ocupa só a parte de cima. Composição de
       foto cheia: ela ocupa a tela inteira, como sempre ocupou. */
    left:0; right:0; top:0;
    ${dividida ? `height:${ALTURA_DA_FOTO_PCT}%;` : "bottom:0;"}
    background-image:${temFundo ? `url("${escaparHtml(peca.fundo!)}")` : "none"};
    background-size:cover; background-position:center;
    background-color:${molde.primaria};
  }
  .scrim { position:absolute; inset:0; background:${scrim}; }
  /* O PAINEL: o campo próprio do texto. Existe só nas composições divididas.
     A CURVA é este mesmo painel com recorte elíptico no topo, subindo sobre a
     foto — é a assinatura mais reconhecível do repertório de referência.
     Fica ANTES do conteúdo no DOM e sem z-index próprio: pinta atrás do texto
     pela ordem natural, e não por uma camada que um dia alguém reordena. */
  .painel {
    position:absolute; left:0; right:0; bottom:0;
    top:${dividida ? `calc(${ALTURA_DA_FOTO_PCT}% - ${composicao === "dividido-curva" ? SUBIDA_DA_CURVA_PX : 0}px)` : "100%"};
    background:${molde.primaria};
    ${composicao === "dividido-curva" ? "border-radius:50% 50% 0 0 / 120px 120px 0 0;" : ""}
  }
  /* O traço de acento. Fica DENTRO do bloco de texto, encostado no selo —
     elemento solto no canto vira sujeira quando o formato muda de proporção. */
  .acento { width:96px; height:8px; background:${apoioCor}; border-radius:4px; }
  .conteudo {
    position:absolute;
    left:${dim.margemLateral}px; right:${dim.margemLateral}px;
    /* O rodapé mora ACIMA da margem de base, e o conteúdo acima do rodapé.
       Nada de texto pode entrar na faixa de ${dim.margemBase}px do pé — é ali
       que a interface do Instagram desenha por cima. */
    bottom:${dim.margemBase + ALTURA_DO_RODAPE}px;
    /* Na composição dividida o conteúdo começa DENTRO do painel — nunca em
       cima da foto. É o "campo próprio" da referência: se o texto pudesse
       subir para a área da foto, a divisão seria decorativa. */
    top:${dividida ? `calc(${ALTURA_DA_FOTO_PCT}% + 24px)` : `${dim.margemTopo}px`};
    display:flex; flex-direction:column;
    /* Na foto cheia o texto SENTA no pé: o topo é a foto, e empurrar o bloco
       para baixo é o que deixa o assunto respirar. No painel é o contrário —
       ancorar no pé abre um vazio no meio do campo sólido, que é a mesma
       crítica do CEO ("a metade de baixo fica vazia") de cabeça para baixo.

       No painel COM bloco de mockup, o texto encosta no alto e o bloco ocupa o
       resto — o espaço que sobra é o lugar do PRODUTO. Sem bloco, o texto vai
       para o centro do campo: melhor centrar o que existe do que reservar um
       vazio para uma coisa que aquela peça não tem. */
    justify-content:${dividida ? (peca.mockup ? "flex-start" : "center") : "flex-end"};
    gap:${dividida ? 26 : 22}px;
  }
  .selo {
    font-size:26px; font-weight:700; letter-spacing:5px; color:${apoioCor};
    max-width:100%; word-break:break-word;
  }
  .titulo {
    /* A família de DISPLAY, não a do corpo. Ausente = a do corpo, que é o
       comportamento de antes de 08/08/2026 — nunca uma família escolhida aqui. */
    font-family: ${molde.familiaDisplay ?? molde.familia};
    font-size:${TITULO_PX[peca.formato]}px; font-weight:800; line-height:1.06;
    letter-spacing:-1.5px; max-width:100%; word-break:break-word;
  }
  .apoio {
    font-size:34px; font-weight:400; line-height:1.34; opacity:.92;
    max-width:92%; word-break:break-word;
  }
  .rodape {
    position:absolute; left:${dim.margemLateral}px; right:${dim.margemLateral}px;
    bottom:${dim.margemBase}px; height:${ALTURA_DO_RODAPE - 20}px;
    display:flex; align-items:center; justify-content:space-between; gap:24px;
  }
  /* A ASSINATURA COMO TOKEN: monograma + wordmark, sempre no mesmo lugar, com
     a mesma medida, em toda peça de toda campanha. É o que o comparativo de
     06/08 chamou de "assinatura fixa de rodapé" — a referência tem, nós não
     tínhamos. O monograma vem de monogramaDe(), derivado do nome; nunca
     desenhado pelo modelo, porque modelo de imagem erra letra. */
  .lockup { display:flex; align-items:center; gap:12px; }
  .monograma {
    display:flex; align-items:center; justify-content:center;
    width:44px; height:44px; border-radius:12px; flex:0 0 auto;
    background:${apoioCor}; color:${tintaSobre(apoioCor)};
    font-size:22px; font-weight:800; letter-spacing:0;
  }
  /* O LOGO REAL, quando o cliente deu um. Ocupa o lugar do monograma — os dois
     nunca aparecem juntos, porque monograma É o substituto declarado do logo.
     contain e não cover: logo cortado é logo errado, e a proporção de uma
     marca não é nossa para ajustar. Altura fixa (a mesma do monograma) para que
     um logo largo e um logo quadrado assinem na mesma linha de base. */
  /* A LARGURA subiu de 220 para 240; a ALTURA continua 44.
     Wordmark horizontal (o do CityJobs é "CITY JOBS" numa linha, proporção
     ~6,5:1) batia no teto de 220px e encolhia até virar borrão. Mas soltar a
     altura foi pior: a 52px a assinatura vira um SEGUNDO TÍTULO no pé da peça e
     briga com o de cima — medido nas duas renderizações das peças refeitas do
     CityJobs. Assinatura é assinatura: ela se lê depois do título, nunca junto. */
  .logo-real { height:44px; width:auto; max-width:240px; object-fit:contain; flex:0 0 auto; display:block; }
  .assinatura { font-size:24px; font-weight:600; letter-spacing:1px; opacity:.85; }
  .indice {
    font-size:22px; font-weight:700; letter-spacing:2px; opacity:.8;
    border:2px solid currentColor; border-radius:999px; padding:6px 16px;
  }
${cssDoMockup({ primaria: molde.primaria, secundaria: apoioCor, tinta })}
</style></head>
<body><div class="peca">
  <div class="foto"></div>
  <div class="scrim"></div>
  ${dividida ? `<div class="painel"></div>` : ""}
  <div class="conteudo">
    <div class="acento"></div>
    ${el("selo", "div", "selo")}
    ${el("titulo", "h1", "titulo")}
    ${el("apoio", "p", "apoio")}
    ${peca.mockup?.html ?? ""}
  </div>
  <div class="rodape">
    <div class="lockup">
      <!-- O LOGO REAL TEM PRECEDÊNCIA SOBRE O MONOGRAMA.
           O monograma sempre foi o SUBSTITUTO declarado do logo que a casa não
           tinha ("o logo da Foocci é, hoje, o nome escrito em fonte"). Tendo o
           arquivo real do cliente, manter as iniciais ao lado dele seria assinar
           a peça duas vezes, uma delas com um símbolo que a agência inventou.
           O nome em texto (o elemento .assinatura) CONTINUA — é ele que o renderizador
           confere no DOM, e é o que mantém a peça legível se a imagem falhar. -->
      ${molde.logo?.dataUrl
        ? `<img class="logo-real" src="${escaparHtml(molde.logo.dataUrl)}" alt="" aria-hidden="true" />`
        : monograma ? `<div class="monograma" aria-hidden="true">${escaparHtml(monograma)}</div>` : ""}
      ${el("assinatura", "div", "assinatura")}
    </div>
    ${el("indice", "div", "indice")}
  </div>
</div></body></html>`;
}
