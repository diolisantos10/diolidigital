import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/portal/access/qa-portal-token-visual", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const r = await p.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Navegação do portal"]');
  const btns = [...nav.querySelectorAll("button")];
  const barra = nav.getBoundingClientRect();
  const header = document.querySelector("header").getBoundingClientRect();
  return {
    larguraJanela: innerWidth,
    rolagemHorizontal: document.documentElement.scrollWidth > innerWidth,
    alturaCabecalho: Math.round(header.height),
    barraRola: nav.querySelector("div>div").scrollWidth > nav.querySelector("div>div").clientWidth,
    itens: btns.map(x => { const c = x.getBoundingClientRect();
      return { txt: x.innerText.replace(/\n/g," ").trim(), x1: Math.round(c.left), x2: Math.round(c.right),
               foraDaTela: c.right > innerWidth || c.left < 0,
               transbordou: [...x.querySelectorAll("span")].some(sp => sp.offsetParent!==null && sp.scrollWidth > sp.clientWidth + 1) }; }),
  };
});
console.log(JSON.stringify(r, null, 2));
await b.close();
