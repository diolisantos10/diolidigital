// Screenshots das 11 abas do portal, nas 3 larguras, MEDINDO rolagem lateral.
// A medição é a parte que importa: "parece que cabe" já deixou 4 abas fora da
// tela em produção. `scrollWidth > clientWidth` é o único juiz.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const SAIDA = process.env.SAIDA ?? "/tmp/claude-0/-home-user-FOOCCI/b9c343fc-6047-5924-8ea8-b9312faba7f6/scratchpad/shots-portal";
const TOKEN = process.env.TOKEN ?? "tok-foocci";
const PREFIXO = process.env.PREFIXO ?? "cheio";

const ABAS = [
  "inicio", "social", "trafego", "resultados", "projetos", "aprovacoes",
  "entregas", "marca", "solicitacoes", "integracoes", "conta",
];
const LARGURAS = [[375, 812], [768, 1024], [1280, 900]];

mkdirSync(SAIDA, { recursive: true });

const navegador = await chromium.launch();
const problemas = [];

for (const [w, h] of LARGURAS) {
  const ctx = await navegador.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const pag = await ctx.newPage();
  for (const aba of ABAS) {
    await pag.goto(`${BASE}/portal/access/${TOKEN}?aba=${aba}`, { waitUntil: "networkidle" });
    await pag.waitForTimeout(700);
    const medida = await pag.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
    }));
    if (medida.scroll > medida.client + 1 || medida.body > medida.client + 1) {
      problemas.push(`${w}px · ${aba} → rolagem lateral: scrollWidth ${medida.scroll} > ${medida.client}`);
    }
    await pag.screenshot({ path: `${SAIDA}/${PREFIXO}-${w}-${aba}.png`, fullPage: true });
  }
  await ctx.close();
}

await navegador.close();
if (problemas.length) {
  console.log("ROLAGEM LATERAL ENCONTRADA:");
  for (const p of problemas) console.log("  " + p);
  process.exitCode = 1;
} else {
  console.log(`OK — ${ABAS.length * LARGURAS.length} telas, nenhuma com rolagem lateral.`);
}
