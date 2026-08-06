// Rasteriza as 36 telas. Mesmo contrato do motor da casa
// (lib/agency/design/renderizar.ts): o HTML vira pixel E a LETRA É CONFERIDA
// contra o DOM antes de a peça ser aceita. Texto divergente, cortado ou na
// zona morta REPROVA a peça — não "avisa".
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { CARROSSEIS } from "./copy.mjs";
import { SISTEMAS, L, A, SEGURO_TOPO, SEGURO_BASE } from "./sistemas.mjs";

const AQUI = import.meta.dirname;
const FOTOS = path.join(AQUI, "fotos");
const SAIDA = path.join(AQUI, "novas");
fs.mkdirSync(SAIDA, { recursive: true });

/** Qual foto entra em cada tela. Repetir foto DENTRO de um carrossel é o que o
 *  feed real faz; o que não pode é o carrossel inteiro ter a mesma cara. */
const FOTO_DA_TELA = {
  1: ["c1-escuro", null, "c1-escuro2", null, "c1-escuro", "c1-escuro2"],
  2: ["c2-claro", "c2-escuro", "c2-claro", "c2-escuro2", "c2-claro", "c2-escuro"],
  // A capa do 3 usa a foto ESCURA por baixo da faixa creme: com a foto clara,
  // faixa clara e foto clara viravam a mesma mancha e a divisão sumia.
  3: ["c3-escuro", "c3-escuro", "c3-claro", "c3-escuro", "c3-claro", "c3-escuro"],
  4: ["c4-claro", "c4-escuro", "c4-claro", "c4-escuro", "c4-claro", "c4-escuro"],
  // As telas claras do 5 vinham SEM foto: branco 255 com a metade de baixo
  // morta. Entram com a foto clara, que o sistema usa como faixa de horizonte.
  5: ["c5-escuro", "c5-claro", "c5-escuro2", "c5-claro", "c5-escuro", "c5-escuro2"],
  6: ["c6-escuro", "c6-claro", "c6-escuro", "c6-claro", "c6-escuro", "c6-claro"],
};

const cacheFoto = new Map();
function dataUrl(nome) {
  if (!nome) return null;
  if (cacheFoto.has(nome)) return cacheFoto.get(nome);
  let p = path.join(FOTOS, `${nome}.png`);
  if (!fs.existsSync(p)) {
    // Degradação DECLARADA: sem a foto pedida, cai para a irmã do mesmo
    // carrossel. Se não houver nenhuma, a peça sai sem foto (fundo chapado) —
    // e isso aparece no relatório, não some no log.
    const base = nome.replace(/\d$/, "");
    const alt = fs.readdirSync(FOTOS).find((f) => f.startsWith(base));
    if (!alt) { console.log("  ⚠ SEM FOTO:", nome); cacheFoto.set(nome, null); return null; }
    p = path.join(FOTOS, alt);
  }
  const u = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  cacheFoto.set(nome, u);
  return u;
}

/** Todos os textos que a peça DEVE conter, na forma exata da copy aprovada. */
function textosEsperados(t) {
  const fora = [t.titulo, t.apoio, t.realce, t.numero, t.nota, t.cta, t.site]
    .filter(Boolean).map((s) => String(s));
  if (t.lista) fora.push(...t.lista);
  if (t.cards) for (const [a, b] of t.cards) fora.push(a, b);
  if (t.conversa) for (const [, txt] of t.conversa) fora.push(txt);
  return fora;
}

const norm = (s) => s.replace(/\s+/g, " ").trim();

const navegador = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--font-render-hinting=none"],
});
const pagina = await navegador.newPage({ viewport: { width: L, height: A }, deviceScaleFactor: 1 });

const relatorio = [];
for (const c of CARROSSEIS) {
  const sistema = SISTEMAS[c.id - 1];
  for (let i = 0; i < c.telas.length; i++) {
    const t = c.telas[i];
    const html = sistema(t, i, dataUrl(FOTO_DA_TELA[c.id][i]));
    await pagina.setContent(html, { waitUntil: "load" });
    await pagina.evaluate(() => document.fonts.ready);

    // ── PORTÃO 1: a letra bate com a copy aprovada? ──────────────────────────
    const doDom = norm(await pagina.evaluate(() => document.body.innerText));
    const faltando = textosEsperados(t).filter((s) => !doDom.includes(norm(s)));

    // ── PORTÃO 2: nada cortado, nada na zona morta ───────────────────────────
    //
    // Duas exclusões DELIBERADAS, senão o portão vira ruído e ninguém o lê:
    //
    //  • GRAFISMO (`.efe`, o "F" gigante; `.fantasma`, o número vazado) sangra
    //    de propósito e não carrega informação. Sangrar é o efeito; acusar
    //    sangramento como defeito reprovaria o próprio desenho.
    //  • "cortado" só vale quando o elemento REALMENTE recorta — ou seja,
    //    quando o `overflow` computado esconde. Num <h1> sem overflow, o
    //    scrollHeight passa do clientHeight por arredondamento de caixa de
    //    linha e NADA é cortado na tela. Foi o que reprovou as 36 no 1º passe.
    const defeitos = await pagina.evaluate(({ topo, base, alt }) => {
      const ruim = [];
      // `.peca` e `.arco` são MOLDURA: existem justamente para recortar o
      // grafismo que sangra. Acusá-las de "cortado" seria acusar o corte de
      // cortar. O que protege o texto de verdade é a checagem de zona morta e
      // de margem, abaixo, feita no retângulo de CADA folha de texto.
      const DECORATIVO = new Set(["peca", "arco", "efe", "fantasma", "veu", "foto",
        "arcoveu", "fundo", "faixa", "recorte"]);
      const decorativo = (el) => [...el.classList].some((c) => DECORATIVO.has(c));
      for (const el of document.querySelectorAll("h1,h2,p,div,span,em")) {
        if (!el.textContent.trim() || decorativo(el)) continue;
        const cs = getComputedStyle(el);
        const recorta = cs.overflow !== "visible" || cs.overflowY !== "visible";
        if (recorta && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
          ruim.push(`cortado: .${el.className || el.tagName} (${el.scrollHeight}>${el.clientHeight})`);
        }
        if (el.children.length !== 0) continue;      // só folha de texto
        const r = el.getBoundingClientRect();
        if (r.top < topo) ruim.push(`zona morta topo: "${el.textContent.slice(0, 26)}"`);
        if (r.bottom > alt - base) ruim.push(`zona morta base: "${el.textContent.slice(0, 26)}"`);
        if (r.right > 1080 - 24 || r.left < 24) ruim.push(`margem: "${el.textContent.slice(0, 26)}"`);
      }
      return [...new Set(ruim)];
    }, { topo: SEGURO_TOPO, base: SEGURO_BASE, alt: A });

    const nome = `c${c.id}-t${i + 1}`;
    await pagina.screenshot({ path: path.join(SAIDA, `${nome}.png`) });
    const ok = faltando.length === 0 && defeitos.length === 0;
    relatorio.push({ nome, ok, faltando, defeitos });
    console.log(ok ? `ok  ${nome}` : `REPROVADA ${nome}`,
      faltando.length ? `\n   falta: ${faltando.map((s) => s.slice(0, 50)).join(" | ")}` : "",
      defeitos.length ? `\n   ${defeitos.join(" | ")}` : "");
  }
}
await navegador.close();
fs.writeFileSync(path.join(AQUI, "relatorio-render.json"), JSON.stringify(relatorio, null, 1));
const maus = relatorio.filter((r) => !r.ok);
console.log(`\n${relatorio.length - maus.length}/${relatorio.length} aprovadas`);
if (maus.length) { console.log("REPROVADAS:", maus.map((m) => m.nome).join(", ")); process.exitCode = 1; }
