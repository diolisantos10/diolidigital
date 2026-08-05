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
// ── CLIENTE SEM MARCA DEFINIDA ──────────────────────────────────────────────
//
// Vazio é vazio. Sem cor no `BrandBrain`, o molde NÃO inventa cor de marca:
// entra o MOLDE NEUTRO, declarado como neutro em `origem` e com a falta listada
// em `lacunas`. Quem lê a peça sabe que aquele cinza é ausência de marca, não a
// marca do cliente.

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
  neutra: "'Inter', 'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif",
  manuscrita: "'Pacifico', 'Brush Script MT', cursive",
  condensada: "'Oswald', 'Impact', 'Arial Narrow', 'Liberation Sans Narrow', sans-serif",
};

/** O molde neutro. NÃO é a marca de ninguém — é a ausência dela, declarada. */
export const NEUTRO = {
  primaria: "#141414",
  secundaria: "#8A8A8A",
  tinta: "#FFFFFF",
  familia: FAMILIAS_DA_ARTE.neutra!,
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
  /** O que faltava no BrandBrain. Entra no relatório da peça: a agência sabe o
   *  que não sabe, e o cliente pode preencher. */
  lacunas: string[];
}

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
export function familiaDeclarada(typography: string | null | undefined): { chave: string; pilha: string; declarada: boolean } {
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
  if (!chave) return { chave: "neutra", pilha: FAMILIAS_DA_ARTE.neutra!, declarada: false };
  return { chave, pilha: FAMILIAS_DA_ARTE[chave]!, declarada: true };
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
      lacunas,
    };
  }

  return {
    origem: "marca",
    primaria,
    secundaria: secundaria ?? NEUTRO.secundaria,
    tinta: tintaSobre(primaria),
    familia: fam.pilha,
    lacunas,
  };
}

// ─── A peça ─────────────────────────────────────────────────────────────────

/** Um pedaço de texto que vai virar pixel — e que o renderizador vai conferir. */
export interface TextoDaPeca {
  /** Identificador do papel no layout: "titulo", "apoio", "selo", "assinatura". */
  papel: "titulo" | "apoio" | "selo" | "assinatura" | "indice";
  /** O texto EXATO. É este string que o renderizador confere no DOM. */
  texto: string;
}

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
}

/** Escapa para conteúdo de elemento E para valor de atributo. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Os textos que a peça vai pintar, na ordem, já com a caixa aplicada.
 *
 * Existe separado do HTML porque é ESTA lista que o renderizador confere contra
 * o DOM. Se a conferência lesse o próprio HTML, ela estaria conferindo o
 * gerador contra o gerador.
 */
export function textosDaPeca(peca: PecaDoMolde): TextoDaPeca[] {
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
  const textos = new Map(textosDaPeca(peca).map((t) => [t.papel, t.texto]));
  const temFundo = typeof peca.fundo === "string" && peca.fundo.length > 0;

  // Sobre foto, o texto precisa de um degradê por baixo — sem ele a legibilidade
  // depende da sorte do que a IA desenhou naquele canto. A cor do degradê é a
  // PRIMÁRIA da marca, então até a sombra pertence à identidade do cliente.
  const scrim = temFundo
    ? `linear-gradient(to top, ${molde.primaria} 0%, ${molde.primaria}F2 26%, ${molde.primaria}00 62%)`
    : "none";

  const tinta = temFundo ? tintaSobre(molde.primaria) : molde.tinta;
  const apoioCor = molde.secundaria;
  const el = (papel: string, tag: string, classe: string) => {
    const t = textos.get(papel as TextoDaPeca["papel"]);
    if (!t) return "";
    return `<${tag} class="${classe}" data-papel="${papel}" data-texto-exato="${escaparHtml(t)}">${escaparHtml(t)}</${tag}>`;
  };

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
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
    position:absolute; inset:0;
    background-image:${temFundo ? `url("${escaparHtml(peca.fundo!)}")` : "none"};
    background-size:cover; background-position:center;
    background-color:${molde.primaria};
  }
  .scrim { position:absolute; inset:0; background:${scrim}; }
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
    top:${dim.margemTopo}px;
    display:flex; flex-direction:column; justify-content:flex-end;
    gap:22px;
  }
  .selo {
    font-size:26px; font-weight:700; letter-spacing:5px; color:${apoioCor};
    max-width:100%; word-break:break-word;
  }
  .titulo {
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
  .assinatura { font-size:24px; font-weight:600; letter-spacing:1px; opacity:.85; }
  .indice {
    font-size:22px; font-weight:700; letter-spacing:2px; opacity:.8;
    border:2px solid currentColor; border-radius:999px; padding:6px 16px;
  }
</style></head>
<body><div class="peca">
  <div class="foto"></div>
  <div class="scrim"></div>
  <div class="conteudo">
    <div class="acento"></div>
    ${el("selo", "div", "selo")}
    ${el("titulo", "h1", "titulo")}
    ${el("apoio", "p", "apoio")}
  </div>
  <div class="rodape">
    ${el("assinatura", "div", "assinatura")}
    ${el("indice", "div", "indice")}
  </div>
</div></body></html>`;
}
