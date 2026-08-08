// Prova do DESIGN.md §6.1/§6.2 — o flutuante não pode cruzar conteúdo.
// Duas métricas, não uma impressão:
//   • RECORTE PARCIAL: linha cruzada por um fixo opaco que NÃO cobre a largura
//     visível dela (sobra meia palavra) — meta 0.
//   • NUNCA LIMPO: conteúdo sem nenhuma posição de rolagem em que esteja
//     visível E livre do fixo — meta 0.
// Rolagem instantânea: o `scroll-behavior: smooth` do globals mede antes de
// chegar ao destino.
import { chromium } from "playwright";

const ROTA = process.argv[2] || "/portal/access/qa-portal-token-visual";
const SECOES = (process.env.SECOES || "inicio,projetos,aprovacoes,arquivos,conta").split(",");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

for (const largura of (process.env.LARGURAS || "375,768").split(",").map(Number)) {
  for (const secao of SECOES) {
    const ctx = await b.newContext({ viewport: { width: largura, height: 812 } });
    const p = await ctx.newPage();
    await p.goto(`http://localhost:3000${ROTA}?secao=${secao}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(900);

    const r = await p.evaluate(async () => {
      const fixo = [...document.querySelectorAll("button")].find((x) => getComputedStyle(x).position === "fixed" && x.getAttribute("aria-label") === "Fale com seu PM");
      if (!fixo) return { semFixo: true };
      const alvos = [...document.querySelectorAll("main p, main h1, main h2, main h3, main h4, main li, main span")]
        .filter((e) => e.textContent.trim() && e.offsetParent !== null && e.getClientRects().length === 1);

      const recortes = new Set(); const limpo = new Set(); const vistos = new Set();
      const alturaTotal = document.documentElement.scrollHeight;
      for (let y = 0; y <= alturaTotal; y += 200) {
        window.scrollTo({ top: y, behavior: "instant" });
        await new Promise((r) => requestAnimationFrame(r));
        const f = fixo.getBoundingClientRect();
        for (const e of alvos) {
          const c = e.getBoundingClientRect();
          if (c.bottom <= 0 || c.top >= innerHeight) continue;   // fora da tela
          vistos.add(e);
          const cruza = !(c.right <= f.left || c.left >= f.right || c.bottom <= f.top || c.top >= f.bottom);
          const x1 = Math.max(c.left, 0), x2 = Math.min(c.right, innerWidth); // parte VISÍVEL
          if (cruza && !(f.left <= x1 && f.right >= x2)) recortes.add(e);
          if (!cruza) limpo.add(e);
        }
      }
      const nuncaLimpo = [...vistos].filter((e) => !limpo.has(e));
      return {
        recorteParcial: [...recortes].map((e) => e.textContent.trim().slice(0, 48)),
        nuncaLimpo: nuncaLimpo.map((e) => e.textContent.trim().slice(0, 48)),
      };
    });
    const rp = r.recorteParcial?.length ?? 0, nl = r.nuncaLimpo?.length ?? 0;
    console.log(`${String(largura).padEnd(4)} ${secao.padEnd(11)} recorte=${rp}  nunca-limpo=${nl}` +
      (rp ? `\n     ↳ ${r.recorteParcial.slice(0, 4).join(" | ")}` : "") +
      (nl ? `\n     ↳ ${r.nuncaLimpo.slice(0, 4).join(" | ")}` : ""));
    await ctx.close();
  }
}
await b.close();
