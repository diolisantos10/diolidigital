// Prova por FOTO: o escopo do briefing sobrevive quando a resposta do SDR vem
// CORTADA pelo teto de tokens (caso real do piloto, 16/08/2026, 12:41–12:43).
//
// Intercepta `POST /api/sdr/chat` no NAVEGADOR (page.route) e responde com o
// corpo EXATO que `app/api/sdr/chat/route.ts` produz hoje — não simula, não
// inventa formato. Os dois corpos usados aqui vêm do próprio código-fonte da
// rota (confira antes de usar; não confie de cabeça):
//
//   DEPOIS (com resgate, o comportamento de hoje):
//     { ok:false, reason:"truncado", scope:{ wantsSocialMedia:true,
//       social:{ postsPerWeek:14, platforms:["instagram"] } } }
//
//   ANTES (o defeito, comportamento anterior ao conserto de 16/08):
//     { ok:false, reason:"truncado" }   -- sem `scope`
//
// Isso exercita o componente React de verdade (PublicBriefingRoom.tsx) no
// navegador de verdade, contra um contrato ancorado por
// __tests__/esteira/allowlist-bate-com-o-servidor.test.ts.
//
// Uso:
//   node scripts/foto-escopo-cortado.mjs [baseUrl]
//
// Saída: docs/entregas/escopo-sobrevive-16-08/{antes,depois}-{mobile,tablet,desktop}.png

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] || "http://localhost:3000";
const outDir = "docs/entregas/escopo-sobrevive-16-08";

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

const DEVICES = [
  { device: "mobile", width: 375, height: 812 },
  { device: "tablet", width: 768, height: 1024 },
  { device: "desktop", width: 1440, height: 900 },
];

// Os dois corpos — EXATAMENTE o contrato hoje em app/api/sdr/chat/route.ts.
const CORPO_DEPOIS = {
  ok: false,
  reason: "truncado",
  scope: {
    wantsSocialMedia: true,
    social: { postsPerWeek: 14, platforms: ["instagram"] },
  },
};
const CORPO_ANTES = {
  ok: false,
  reason: "truncado",
  // sem `scope` — era assim que a rota respondia antes do conserto de 16/08.
};

mkdirSync(outDir, { recursive: true });

let executablePath;
const { existsSync } = await import("node:fs");
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

async function capturarCenario(nome, corpoDaRota) {
  for (const { device, width, height } of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();

    // Intercepta a rota do SDR ANTES de qualquer navegação.
    await page.route("**/api/sdr/chat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(corpoDaRota),
      });
    });

    await page.goto(base + "/briefing", { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(400);

    // 1) LeadNaPorta — pular contato para chegar direto na sala.
    const pular = page.getByText("Prefiro não deixar contato agora", { exact: false });
    if (await pular.count() > 0) {
      await pular.first().click();
      await page.waitForTimeout(400);
    }

    // 2) Mandar a mensagem do caso real.
    const textarea = page.locator("textarea");
    await textarea.waitFor({ state: "visible", timeout: 15000 });
    await textarea.fill("Meu nome é Diego, meu negócio é City Jobs");
    await page.getByLabel("Enviar").click();
    await page.waitForTimeout(1500);

    await textarea.fill("quero 2 posts por dia, verba de R$ 500 por mês");
    await page.getByLabel("Enviar").click();
    // Espera o turno (chamada interceptada) resolver e o painel recalcular.
    await page.waitForTimeout(2500);

    const file = `${outDir}/${nome}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${nome.padEnd(7)} ${device.padEnd(7)} ${width}x${height} -> ${file}`);

    await ctx.close();
  }
}

try {
  await capturarCenario("depois", CORPO_DEPOIS);
  await capturarCenario("antes", CORPO_ANTES);
} finally {
  await browser.close();
}
