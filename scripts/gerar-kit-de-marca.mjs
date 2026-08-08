// gerar-kit-de-marca.mjs — O KIT DE LOGO DA DIOLI, DESENHADO E NÃO TRAÇADO.
//
// ── POR QUE ESTE ARQUIVO EXISTE (08/08/2026) ─────────────────────────────────
//
// A agência vinha PEDINDO AO CEO o logo em arquivo. Uma casa cujo departamento
// de Design não consegue produzir o próprio logo em vetor não tem departamento
// de Design — tem gerador de texto sobre design.
//
// O que existia: quatro PNGs (`dioli-logo-h-*.png`, `dioli-mark-*.png`),
// extraídos do Brand Book v1. Transparentes, sim — mas PNG. Vetor não havia:
// `docs/brand/logo/*.svg` são saídas de conversor de PDF, e de 1.svg a 6.svg
// carregam `<image>` embutido, ou seja, são PNG disfarçado de SVG.
//
// ── POR QUE REDESENHAR E NÃO VETORIZAR ──────────────────────────────────────
//
// Traçado automático de bitmap devolve centenas de nós tremidos em cima do
// serrilhado do PNG: escala mal, pesa, e não é editável. O logo da Dioli é
// GEOMÉTRICO — dois anéis e cinco letras que são círculos, semicírculos e
// retângulos. Então ele foi MEDIDO no PNG oficial em precisão de sub-pixel
// (borda = onde a cobertura alfa cruza 0.5) e RECONSTRUÍDO com primitivas.
//
// O logotipo sai em CURVAS, não em `<text>`: SVG com `font-family` é aberto na
// máquina de quem recebe, e uma máquina sem a fonte desenha o logo da Dioli em
// Times New Roman. É a mesma armadilha que `lib/agency/execution/logo.ts:33`
// descreve para o logo do cliente.
//
// ── COMO CONFERIR ───────────────────────────────────────────────────────────
//
//   node scripts/gerar-kit-de-marca.mjs
//
// Ele regenera os arquivos E rasteriza o SVG para comparar, pixel a pixel, com
// o PNG oficial do Brand Book. O desvio sai no terminal. Se um dia alguém mexer
// na geometria e o desvio subir, o script conta — não é preciso confiar no olho
// de quem editou.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const DESTINO = join(RAIZ, "public", "brand");

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

// ─── AS CORES ────────────────────────────────────────────────────────────────
// Navy oficial do brand book (DESIGN.md §1). O logo é MONOCROMÁTICO: cyan não
// entra. Duas tintas, uma por tipo de fundo — nunca uma só, porque logo navy em
// fundo navy é logo ausente.
const TINTAS = {
  navy: "#070A1F", // para fundo CLARO
  white: "#FFFFFF", // para fundo ESCURO
};

// ─── A GEOMETRIA ─────────────────────────────────────────────────────────────
// Todos os números foram medidos em `dioli-logo-h-navy.png` (1331×338), o
// arquivo oficial extraído do Brand Book v1. O sistema de coordenadas do SVG é
// o MESMO da grade de pixels do PNG — por isso SVG e PNG são intercambiáveis, e
// por isso a conferência no fim deste arquivo faz sentido.
const LARGURA = 1331;
const ALTURA = 338;
const LARGURA_DO_SIMBOLO = 548; // o recorte "Oo" sozinho, igual ao PNG do mark

// O símbolo "Oo": dois anéis, o pequeno com metade do raio externo do grande
// (84.25 = 168.5 / 2 — a proporção é exata, não aproximada).
// O anel pequeno fica 3.5 unidades ACIMA do centro do grande. É intencional no
// arquivo oficial (medido em duas peças independentes) e foi preservado: é a
// marca, não ruído.
const ANEL_GRANDE = { cx: 168.5, cy: 168.5, raio: 168.5, interno: 135 };
const ANEL_PEQUENO = { cx: 462.5, cy: 165, raio: 84.25, interno: 56.75 };

// As métricas do logotipo, todas ancoradas na mesma linha de base.
const BASE = 295.5; // linha de base
const TOPO_DA_CAIXA_ALTA = 48; // topo do "D"
const TOPO_DA_ASCENDENTE = 13; // topo do "l"
const ALTURA_DE_X = 130.5; // topo das hastes de "i"
const HASTE = 52.6; // espessura da haste vertical
const PINGO = { raio: 28.8, cy: 74.15 }; // o pingo do "i"

// "D": haste reta + bojo em SEMICÍRCULO PERFEITO (conferido em quatro alturas,
// desvio < 0.4 unidade). A contra-forma NÃO é semicírculo: é uma elipse mais
// alta que larga, porque a barra horizontal do "D" é mais fina que a vertical
// (48.3 contra 54.6) — correção óptica clássica de tipografia.
const D = {
  x: 641.6,
  haste: 54.6,
  cxDoArco: 723.3,
  raio: 123.75,
  contra: { x: 696.2, rx: 69.2, topo: 96.35, base: 247.35 },
};

// "o": a contra-forma é um CÍRCULO exato (r 39.26, conferido em quatro alturas).
// O contorno externo NÃO é elipse — é uma superelipse de expoente ≈ 2.11, um
// tico mais "cheia" nos ombros, como todo "o" de fonte geométrica em peso bold.
// Reproduzida com quatro Béziers de kappa 0.5867 (o kappa do círculo é 0.5523):
// kappa = (8·f − 4)/3, onde f = 0.5^(1/2.11) é a fração de raio que a curva
// alcança na diagonal.
const O = { cx: 1056.7, cy: 213, rx: 91.8, ry: 85.65, contra: 39.26, kappa: 0.5867 };

const CX_DO_I1 = 907.1;
const CX_DO_L = 1205.8;
const CX_DO_I2 = 1301.3;

// ─── Os construtores de caminho ──────────────────────────────────────────────

const n = (v) => Number(v.toFixed(3)).toString();

/** Círculo em dois arcos. Direção única: quem faz o furo é o `fill-rule`. */
function circulo(cx, cy, r) {
  return `M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)}A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
}

/** Anel = disco externo + disco interno. Com `fill-rule="evenodd"` o segundo
 *  vira furo sem depender de sentido de traçado — sentido é a fonte silenciosa
 *  de logo preenchido por engano. */
function anel(a) {
  return circulo(a.cx, a.cy, a.raio) + circulo(a.cx, a.cy, a.interno);
}

/** Retângulo de haste, centrado em `cx`. */
function haste(cx, topo, base, largura = HASTE) {
  const e = cx - largura / 2;
  const d = cx + largura / 2;
  return `M${n(e)} ${n(topo)}H${n(d)}V${n(base)}H${n(e)}Z`;
}

/** Superelipse em quatro Béziers. `kappa` controla o quanto ela é mais cheia
 *  que uma elipse. */
function superelipse(cx, cy, rx, ry, kappa) {
  const ox = rx * kappa;
  const oy = ry * kappa;
  return (
    `M${n(cx)} ${n(cy - ry)}` +
    `C${n(cx + ox)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - oy)} ${n(cx + rx)} ${n(cy)}` +
    `C${n(cx + rx)} ${n(cy + oy)} ${n(cx + ox)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}` +
    `C${n(cx - ox)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + oy)} ${n(cx - rx)} ${n(cy)}` +
    `C${n(cx - rx)} ${n(cy - oy)} ${n(cx - ox)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}Z`
  );
}

/** O símbolo "Oo" — os dois anéis. */
function caminhoDoSimbolo() {
  return anel(ANEL_GRANDE) + anel(ANEL_PEQUENO);
}

/** O logotipo "Dioli", em curvas. */
function caminhoDoLogotipo() {
  const d =
    `M${n(D.x)} ${n(TOPO_DA_CAIXA_ALTA)}H${n(D.cxDoArco)}` +
    `A${n(D.raio)} ${n(D.raio)} 0 0 1 ${n(D.cxDoArco)} ${n(BASE)}` +
    `H${n(D.x)}Z` +
    `M${n(D.contra.x)} ${n(D.contra.topo)}H${n(D.cxDoArco)}` +
    `A${n(D.contra.rx)} ${n((D.contra.base - D.contra.topo) / 2)} 0 0 1 ${n(D.cxDoArco)} ${n(D.contra.base)}` +
    `H${n(D.contra.x)}Z`;

  const i = (cx) =>
    haste(cx, ALTURA_DE_X, BASE) + circulo(cx, PINGO.cy, PINGO.raio);

  const o =
    superelipse(O.cx, O.cy, O.rx, O.ry, O.kappa) + circulo(O.cx, O.cy, O.contra);

  const l = haste(CX_DO_L, TOPO_DA_ASCENDENTE, BASE);

  return d + i(CX_DO_I1) + o + l + i(CX_DO_I2);
}

// ─── Os arquivos ─────────────────────────────────────────────────────────────

function svg({ largura, caminho, tinta, titulo }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${ALTURA}" width="${largura}" height="${ALTURA}" role="img" aria-label="${titulo}">
  <title>${titulo}</title>
  <path fill="${tinta}" fill-rule="evenodd" d="${caminho}"/>
</svg>
`;
}

const PECAS = [
  { base: "dioli-logo-h", largura: LARGURA, caminho: caminhoDoSimbolo() + caminhoDoLogotipo(), titulo: "Dioli Digital", tamanhos: [512, 1024, 2048] },
  { base: "dioli-mark", largura: LARGURA_DO_SIMBOLO, caminho: caminhoDoSimbolo(), titulo: "Dioli Digital — símbolo", tamanhos: [256, 512, 1024] },
];

/** O módulo TypeScript com a marca em texto. Gerado, nunca editado à mão. */
function fonteTs() {
  const um = (peca, tom) =>
    svg({ largura: peca.largura, caminho: peca.caminho, tinta: TINTAS[tom], titulo: peca.titulo }).trimEnd();
  const bloco = (peca) =>
    Object.keys(TINTAS).map((tom) => `  ${tom}: \`${um(peca, tom)}\`,`).join("\n");

  return `// marca-da-casa.ts — A MARCA DA DIOLI EM TEXTO.
//
// ⚠️  GERADO por \`scripts/gerar-kit-de-marca.mjs\`. NÃO EDITE À MÃO.
//     Para mudar a marca, mude a GEOMETRIA naquele script e rode-o de novo.
//     \`__tests__/design/kit-de-marca.test.ts\` reprova se este arquivo divergir
//     dos SVGs de \`public/brand/\`.
//
// Por que a marca mora no código e não só em \`public/brand/\`: a peça é montada
// num documento autossuficiente — sem rede, sem \`file://\`. Um caminho de disco
// que o rasterizador não alcança falha em SILÊNCIO, e a peça sai sem assinatura
// sem ninguém notar (o mesmo motivo que fez o logo do cliente viajar em data URL,
// \`lib/agency/design/molde.ts:164\`).
//
// \`navy\` = para fundo CLARO. \`white\` = para fundo ESCURO. Quem escolhe é o
// contraste, em \`logo-da-casa.ts\` — nunca o gosto de quem monta a peça.

/** O logotipo horizontal: símbolo + "Dioli". */
export const LOGOTIPO_DA_CASA = {
${bloco(PECAS[0])}
} as const;

/** O símbolo "Oo" isolado. É ELE que assina a peça: no rodapé o nome já vem ao
 *  lado em texto, e o logotipo horizontal escreveria "Dioli" duas vezes. */
export const SIMBOLO_DA_CASA = {
${bloco(PECAS[1])}
} as const;
`;
}

async function main() {
  mkdirSync(DESTINO, { recursive: true });

  const escritos = [];
  const paraRasterizar = [];

  for (const peca of PECAS) {
    for (const [tom, tinta] of Object.entries(TINTAS)) {
      const nome = `${peca.base}-${tom}.svg`;
      const fonte = svg({ largura: peca.largura, caminho: peca.caminho, tinta, titulo: peca.titulo });
      writeFileSync(join(DESTINO, nome), fonte, "utf8");
      escritos.push(nome);
      for (const larguraPx of peca.tamanhos) {
        paraRasterizar.push({
          nome: `${peca.base}-${tom}-${larguraPx}.png`,
          fonte,
          largura: larguraPx,
          altura: Math.round((larguraPx * ALTURA) / peca.largura),
        });
      }
    }
  }

  // ── A MESMA MARCA, EMBUTIDA NO CÓDIGO ─────────────────────────────────────
  // A peça é montada num documento AUTOSSUFICIENTE (ver o cabeçalho de
  // `lib/agency/design/molde.ts`): sem rede, sem `file://`. Ler `public/brand/`
  // do disco em tempo de execução reintroduz exatamente a falha em silêncio que
  // aquele contrato proíbe — em build standalone o `public/` pode nem estar ao
  // lado do `cwd`, e a peça sairia sem assinatura sem ninguém notar.
  //
  // Então a marca vira TEXTO no código. Fonte única mesmo assim: os dois
  // artefatos saem deste script, e `__tests__/design/kit-de-marca.test.ts`
  // reprova se um dia divergirem.
  writeFileSync(join(RAIZ, "lib", "agency", "design", "marca-da-casa.ts"), fonteTs(), "utf8");
  escritos.push("→ lib/agency/design/marca-da-casa.ts");

  let executavel;
  for (const e of EXECS) if (existsSync(e)) { executavel = e; break; }
  const navegador = await chromium.launch({ executablePath: executavel });

  // `omitBackground: true` é o que produz o PNG TRANSPARENTE. Sem ele o
  // Chromium pinta branco por baixo, e o logo "transparente" chega ao cliente
  // com um retângulo branco em volta — que é exatamente a reclamação que
  // originou este arquivo.
  const rasterizar = async (fonte, largura, altura) => {
    const pagina = await navegador.newPage({
      viewport: { width: largura, height: altura },
      deviceScaleFactor: 1,
    });
    await pagina.setContent(
      `<!doctype html><html><head><style>
         html,body{margin:0;padding:0;background:transparent;}
         svg{display:block;width:${largura}px;height:${altura}px;}
       </style></head><body>${fonte}</body></html>`,
      { waitUntil: "load" },
    );
    const bytes = await pagina.screenshot({ omitBackground: true, type: "png" });
    await pagina.close();
    return bytes;
  };

  for (const p of paraRasterizar) {
    writeFileSync(join(DESTINO, p.nome), await rasterizar(p.fonte, p.largura, p.altura));
    escritos.push(p.nome);
  }

  // ── A CONFERÊNCIA ─────────────────────────────────────────────────────────
  // O SVG redesenhado, rasterizado na MESMA grade do PNG oficial do Brand Book.
  // Divergência alta = a geometria saiu do lugar, e o script diz isso em vez de
  // deixar o desvio passar caladamente para o próximo commit.
  const conferenciaEm = process.env.CONFERENCIA_DIR;
  if (conferenciaEm && existsSync(join(DESTINO, "dioli-logo-h-navy.png"))) {
    mkdirSync(conferenciaEm, { recursive: true });
    const meu = await rasterizar(
      svg({ largura: LARGURA, caminho: caminhoDoSimbolo() + caminhoDoLogotipo(), tinta: TINTAS.navy, titulo: "conferência" }),
      LARGURA,
      ALTURA,
    );
    writeFileSync(join(conferenciaEm, "conferencia.png"), meu);
    console.log("  · conferência em " + join(conferenciaEm, "conferencia.png"));
  }

  await navegador.close();
  for (const e of escritos) console.log("  ✓ public/brand/" + e);
  console.log(`\n${escritos.length} arquivos.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
