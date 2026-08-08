// conferir-kit-de-marca.mjs — a PROVA VISUAL do kit de logo.
//
// Portão de código não vê logo torto: a conferência de `gerar-kit-de-marca.mjs`
// mede desvio de pixel, e desvio de pixel baixo ainda pode ser um logo ilegível
// a 16px ou com um branco esquecido em volta. Este script monta a folha de
// prova — antes/depois, fundo claro e fundo escuro, do tamanho de fachada ao
// tamanho de favicon — e a folha é olhada por gente.
//
//   CONFERENCIA_DIR=<pasta> node scripts/conferir-kit-de-marca.mjs

import { chromium } from "playwright";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const MARCA = join(RAIZ, "public", "brand");
const SAIDA = process.env.CONFERENCIA_DIR || join(RAIZ, "scratchpad", "marca");

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

const dataUrl = (arquivo) => {
  const bytes = readFileSync(join(MARCA, arquivo));
  const mime = arquivo.endsWith(".svg") ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
};

/** Xadrez atrás de tudo: fundo transparente FALSO (retângulo branco embutido no
 *  arquivo) fica invisível sobre página branca e salta sobre o xadrez. É o teste
 *  que a reclamação de origem pedia. */
const XADREZ =
  "background-image:linear-gradient(45deg,#d9dbe0 25%,transparent 25%),linear-gradient(-45deg,#d9dbe0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#d9dbe0 75%),linear-gradient(-45deg,transparent 75%,#d9dbe0 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0px;background-color:#fff;";

function folha() {
  const linha = (rotulo, arquivos, fundo, estiloExtra = "") => `
    <section style="${fundo}padding:28px 32px;">
      <div style="font:600 12px/1 ui-sans-serif,system-ui;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin-bottom:18px;${estiloExtra}">${rotulo}</div>
      <div style="display:flex;align-items:center;gap:40px;flex-wrap:wrap;">
        ${arquivos.map((a) => `<img src="${dataUrl(a.f)}" style="height:${a.h}px;width:auto;display:block;" alt="">`).join("")}
      </div>
    </section>`;

  const claro = "background:#F7F8FA;color:#070A1F;";
  const escuro = "background:#070A1F;color:#fff;";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:1240px;font-family:ui-sans-serif,system-ui,sans-serif;background:#fff}
    h2{font:700 15px/1 ui-sans-serif;padding:22px 32px 6px;color:#070A1F}
  </style></head><body>

  <h2>ANTES — PNG do Brand Book (o que existia)</h2>
  ${linha("fundo claro · 64 / 40 / 24 px", [{ f: "dioli-logo-h-navy.png", h: 64 }, { f: "dioli-logo-h-navy.png", h: 40 }, { f: "dioli-logo-h-navy.png", h: 24 }], claro)}
  ${linha("fundo escuro · 64 / 40 / 24 px", [{ f: "dioli-logo-h-white.png", h: 64 }, { f: "dioli-logo-h-white.png", h: 40 }, { f: "dioli-logo-h-white.png", h: 24 }], escuro, "color:#fff")}

  <h2>DEPOIS — SVG redesenhado (o kit novo)</h2>
  ${linha("fundo claro · 64 / 40 / 24 px", [{ f: "dioli-logo-h-navy.svg", h: 64 }, { f: "dioli-logo-h-navy.svg", h: 40 }, { f: "dioli-logo-h-navy.svg", h: 24 }], claro)}
  ${linha("fundo escuro · 64 / 40 / 24 px", [{ f: "dioli-logo-h-white.svg", h: 64 }, { f: "dioli-logo-h-white.svg", h: 40 }, { f: "dioli-logo-h-white.svg", h: 24 }], escuro, "color:#fff")}
  ${linha("símbolo isolado · 72 / 44 / 28 / 16 px", [{ f: "dioli-mark-navy.svg", h: 72 }, { f: "dioli-mark-navy.svg", h: 44 }, { f: "dioli-mark-navy.svg", h: 28 }, { f: "dioli-mark-navy.svg", h: 16 }], claro)}
  ${linha("símbolo isolado · fundo escuro", [{ f: "dioli-mark-white.svg", h: 72 }, { f: "dioli-mark-white.svg", h: 44 }, { f: "dioli-mark-white.svg", h: 28 }, { f: "dioli-mark-white.svg", h: 16 }], escuro, "color:#fff")}

  <h2>PNG transparente — sobre xadrez (fundo branco embutido apareceria aqui)</h2>
  ${linha("navy 1024 · mark 512", [{ f: "dioli-logo-h-navy-1024.png", h: 56 }, { f: "dioli-mark-navy-512.png", h: 56 }], XADREZ)}
  ${linha("white 1024 · mark 512 (sobre xadrez claro, deve quase sumir)", [{ f: "dioli-logo-h-white-1024.png", h: 56 }, { f: "dioli-mark-white-512.png", h: 56 }], XADREZ)}

  <h2>Escala — o motivo do vetor</h2>
  <section style="background:#F7F8FA;padding:28px 32px;">
    <img src="${dataUrl("dioli-logo-h-navy.svg")}" style="width:1100px;display:block" alt="">
  </section>
  </body></html>`;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  let exec;
  for (const e of EXECS) if (existsSync(e)) { exec = e; break; }
  const navegador = await chromium.launch({ executablePath: exec });
  const pagina = await navegador.newPage({ viewport: { width: 1240, height: 1400 }, deviceScaleFactor: 2 });
  await pagina.setContent(folha(), { waitUntil: "load" });
  const destino = join(SAIDA, "folha-de-prova.png");
  await pagina.screenshot({ path: destino, fullPage: true });
  await navegador.close();
  console.log("folha de prova: " + destino);
}

main().catch((e) => { console.error(e); process.exit(1); });
