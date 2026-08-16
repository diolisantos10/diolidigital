// MEDE A GEOMETRIA DO CARTÃO DO /briefing — a ferramenta que fechou o B1.
//
// ── Por que ela existe ──────────────────────────────────────────────────────
// O defeito B1 (16/08/2026) era invisível para a suíte inteira: nenhum teste
// renderiza `PublicBriefingRoom`, e `jsdom` não faz layout — não existe teste
// unitário capaz de dizer que um botão saiu de dentro de um `overflow-hidden`.
// A prova pedida pelo auditor era explícita: *"provado por medição de
// geometria, não por afirmação"*.
//
// O que ela responde, no navegador de verdade: com o painel de materiais
// ABERTO, os botões **Falar** e **Anexar** estão dentro do cartão e alcançáveis
// pelo dedo — em vários pontos de rolagem, porque recortado NÃO é rolável.
//
// ── O que ela mediu ─────────────────────────────────────────────────────────
//   ANTES (f03efb8), 375×600, painel aberto:
//     cartão 213–584 · Falar/Anexar 620–652 · clicável: false · recortado: TRUE
//   DEPOIS:
//     cartão 213–584 · Falar/Anexar 541–573 · clicável: true  · recortado: false
//   Conferido também em 375×812, 768×1024 e 1440×900.
//
// ── Como rodar ──────────────────────────────────────────────────────────────
//   npm run dev                       # em outro terminal
//   node scripts/medir-cartao-do-briefing.mjs
//   W=768 H=1024 node scripts/medir-cartao-do-briefing.mjs
//
// Sai com código 1 quando algum controle está recortado — dá para pendurar num
// portão de CI que tenha navegador e servidor de pé.

import { chromium } from "playwright";

const alvo = process.env.ALVO || "http://localhost:3000/briefing";
const W = Number(process.env.W || 375);
const H = Number(process.env.H || 600);

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto(alvo, { waitUntil: "networkidle" });
await p.waitForTimeout(1200);

const medir = async (rotulo) =>
  p.evaluate((rotulo) => {
    const botoes = [...document.querySelectorAll("button")];
    const anexar = botoes.find((b) => /Anexar/i.test(b.textContent || ""));
    const falar = botoes.find(
      (b) => /Falar/i.test(b.textContent || "") || /Falar em vez/i.test(b.title || ""),
    );
    // O cartão: o ancestral do botão que é `overflow-hidden` e coluna flex — a
    // combinação que recorta em silêncio.
    let cartao = anexar;
    while (cartao && cartao !== document.body) {
      const cs = getComputedStyle(cartao);
      if (cs.overflow === "hidden" && cs.display === "flex" && cs.flexDirection === "column") break;
      cartao = cartao.parentElement;
    }
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom) };
    };
    // Alcançável de verdade: o ponto central do botão devolve o próprio botão.
    // `getBoundingClientRect` sozinho não sabe que alguém está por cima.
    const alcancavel = (el) => {
      if (!el) return false;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return false;
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const sob = document.elementFromPoint(x, y);
      return !!sob && (el.contains(sob) || sob.contains(el));
    };
    return {
      rotulo,
      cartao: r(cartao),
      anexar: r(anexar),
      falar: r(falar),
      anexarClicavel: alcancavel(anexar),
      falarClicavel: alcancavel(falar),
      recortado:
        cartao && anexar
          ? Math.round(anexar.getBoundingClientRect().top) >
            Math.round(cartao.getBoundingClientRect().bottom)
          : null,
    };
  }, rotulo);

const linhas = [await medir("painel FECHADO")];

await p.getByRole("button", { name: /Anexar/i }).click();
await p.waitForTimeout(800);

// Vários pontos de rolagem: o defeito original sobrevivia a TODOS eles, e foi
// isso que provou que "é só rolar" não era saída.
for (const y of [0, 150, 300, 305]) {
  await p.evaluate((y) => scrollTo(0, y), y);
  await p.waitForTimeout(250);
  linhas.push(await medir(`painel ABERTO · scroll y=${y}`));
}

if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });

let falhou = false;
for (const l of linhas) {
  const ok = l.falarClicavel && l.anexarClicavel && l.recortado === false;
  if (!ok) falhou = true;
  console.log(
    `${ok ? "OK " : "FALHA"} | ${l.rotulo.padEnd(28)} | cartão ${l.cartao?.top}–${l.cartao?.bottom}` +
      ` | Falar ${l.falar?.top}–${l.falar?.bottom} (clicável ${l.falarClicavel})` +
      ` | Anexar ${l.anexar?.top}–${l.anexar?.bottom} (clicável ${l.anexarClicavel})` +
      ` | recortado: ${l.recortado}`,
  );
}
await nav.close();
console.log(falhou ? `\n=== ${W}×${H}: B1 ABERTO ===` : `\n=== ${W}×${H}: nenhum controle recortado ===`);
process.exit(falhou ? 1 : 0);
