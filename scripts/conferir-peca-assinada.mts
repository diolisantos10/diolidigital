// conferir-peca-assinada.mts — A PROVA VISUAL DAS DUAS METADES DA REGRA.
//
// `__tests__/design/kit-de-marca.test.ts` prova por asserção que a peça da Dioli
// sai com o logo real e que a de todo o resto sai com o monograma e a falta
// declarada. Este script prova a MESMA coisa com o olho: monta as quatro peças
// de verdade, com `montarHtmlDaPeca`, e rasteriza.
//
// Existe porque teste verde não mostra logo cortado, logo branco em fundo claro
// nem assinatura amassada contra o índice do carrossel.
//
//   CONFERENCIA_DIR=<pasta> npx tsx scripts/conferir-peca-assinada.mts

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { montarHtmlDaPeca, moldeDoCliente, moldeComLogo, LACUNA_DO_LOGO } from "../lib/agency/design/molde";
import { logoDaCasa } from "../lib/agency/design/logo-da-casa";

const SAIDA = process.env.CONFERENCIA_DIR || join(process.cwd(), "scratchpad", "marca");
const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

/** As duas metades, e uma marca com cor clara para o terceiro caso: o tom do
 *  símbolo tem de VIRAR navy quando o fundo é claro. */
const CASOS = [
  {
    id: "1-dioli-fundo-escuro",
    rotulo: "DEPOIS · Dioli — molde neutro (fundo escuro): símbolo BRANCO, sem monograma",
    nome: "Dioli Digital Studio",
    marca: null,
  },
  {
    id: "2-dioli-fundo-claro",
    rotulo: "DEPOIS · Dioli — marca de fundo CLARO: o símbolo vira NAVY sozinho",
    nome: "Dioli Digital",
    marca: { primaryColor: "#F7F8FA", secondaryColor: "#9AF5F0", typography: "Inter" },
  },
  {
    id: "3-cliente-sem-logo",
    rotulo: "REGRA MANTIDA · cliente sem logo: monograma das iniciais + falta declarada",
    nome: "Padaria do João",
    marca: { primaryColor: "#7A3B12", secondaryColor: "#E8C39E", typography: "Playfair Display" },
  },
  {
    id: "4-cliente-nome-parecido",
    rotulo: "REGRA MANTIDA · 'Dioli Móveis' NÃO é a casa: monograma, nunca a marca da agência",
    nome: "Dioli Móveis",
    marca: { primaryColor: "#14342B", secondaryColor: "#C9A227", typography: "Oswald" },
  },
];

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  let exec: string | undefined;
  for (const e of EXECS) if (existsSync(e)) { exec = e; break; }
  const navegador = await chromium.launch({ executablePath: exec });

  const cartoes: string[] = [];

  for (const caso of CASOS) {
    const base = moldeDoCliente(caso.marca);
    const molde = moldeComLogo(base, logoDaCasa(caso.nome, base.primaria));
    const html = montarHtmlDaPeca(
      {
        formato: "feed",
        selo: "identidade",
        titulo: "Estratégia humana. Execução inteligente.",
        apoio: "A peça é assinada pelo mesmo símbolo, no mesmo lugar, em toda campanha.",
        assinatura: caso.nome,
        fundo: null,
        indice: { atual: 3, total: 6 },
      },
      molde,
    );

    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await pagina.setContent(html, { waitUntil: "load" });
    const png = await pagina.screenshot({ type: "png" });
    await pagina.close();

    const temLogo = html.includes('class="logo-real"');
    const temMonograma = html.includes('class="monograma"');
    const declarou = molde.lacunas.includes(LACUNA_DO_LOGO);
    console.log(
      `${caso.id}: logo-real=${temLogo} monograma=${temMonograma} lacuna-declarada=${declarou}`,
    );

    cartoes.push(`
      <figure style="margin:0">
        <figcaption style="font:600 13px/1.5 ui-sans-serif,system-ui;color:#1F2937;padding:0 0 10px">
          ${caso.rotulo}
          <div style="font-weight:400;opacity:.6;padding-top:4px">
            logo real: <b>${temLogo ? "sim" : "não"}</b> ·
            monograma: <b>${temMonograma ? "sim" : "não"}</b> ·
            lacuna declarada: <b>${declarou ? "sim" : "não"}</b>
          </div>
        </figcaption>
        <img src="data:image/png;base64,${png.toString("base64")}"
             style="width:100%;display:block;border:1px solid #E5E7EB;border-radius:10px">
      </figure>`);
  }

  const folha = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:1180px;background:#F7F8FA;font-family:ui-sans-serif,system-ui,sans-serif;padding:32px}
    h1{font:700 20px/1.3 ui-sans-serif;color:#070A1F;margin-bottom:6px}
    p{font:400 14px/1.6 ui-sans-serif;color:#4B5563;margin-bottom:26px;max-width:820px}
    .grade{display:grid;grid-template-columns:1fr 1fr;gap:30px}
  </style></head><body>
    <h1>A peça assinada — as duas metades da regra</h1>
    <p>À esquerda, a Dioli assinando com o próprio símbolo em vetor. À direita, o comportamento
       que <b>não</b> mudou: cliente sem arquivo de logo recebe o monograma das iniciais e a falta
       fica declarada no relatório da peça. Nenhum logo foi desenhado em nenhum dos quatro casos.</p>
    <div class="grade">${cartoes.join("")}</div>
  </body></html>`;

  const pagina = await navegador.newPage({ viewport: { width: 1180, height: 1400 }, deviceScaleFactor: 1 });
  await pagina.setContent(folha, { waitUntil: "load" });
  const destino = join(SAIDA, "peca-assinada.png");
  await pagina.screenshot({ path: destino, fullPage: true });
  await pagina.close();
  await navegador.close();
  console.log("\nfolha: " + destino);
}

main().catch((e) => { console.error(e); process.exit(1); });
