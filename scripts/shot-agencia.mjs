// CAPTURA AUTENTICADA — as telas da agência em 375 / 768 / 1440.
//
// POR QUE ESTE ARQUIVO EXISTE, e não é duplicata de `scripts/shot.mjs`: aquele
// abre a URL cru, sem sessão. Toda rota sob `/agency` exige login, então
// `node scripts/shot.mjs /agency/leads leads` produz **três fotos da tela de
// entrar** — e uma auto-revisão feita sobre elas dá nota 9 para uma tela que
// nunca foi olhada. Foto da tela errada é pior que nenhuma foto: ela vira prova.
//
// Uso:
//   node scripts/shot-agencia.mjs <rota> <nome> [--abrir="<texto do cartão>"]
//
// `--abrir` clica no primeiro elemento clicável cujo texto casa, antes de
// fotografar. É o que permite capturar um acordeão ABERTO — bloco que só existe
// depois do clique não aparece em screenshot de página recém-carregada.
//
// Credencial: SHOT_EMAIL / SHOT_SENHA (padrão: o master do seed local).
// Saída: $SHOT_DIR/<nome>-<device>.png
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { sessaoDaAgencia } from "./lib/sessao-da-agencia.mjs";

const rota = process.argv[2] || "/";
const nome = process.argv[3] || "page";
const argAbrir = process.argv.find((a) => a.startsWith("--abrir="));
const abrir = argAbrir ? argAbrir.slice("--abrir=".length) : null;
const base = process.env.SHOT_BASE || "http://localhost:3000";
const outDir = process.env.SHOT_DIR || `${process.cwd()}/.shots`;
const email = process.env.SHOT_EMAIL || "master@dioli.studio";
const senha = process.env.SHOT_SENHA || "DioliLocal!2026";

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

const DEVICES = [
  { device: "mobile", width: 375, height: 812 },
  { device: "tablet", width: 768, height: 1024 },
  { device: "desktop", width: 1440, height: 900 },
];

mkdirSync(outDir, { recursive: true });

let executablePath;
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
let falhou = false;

// UM login para os três tamanhos — e, com o cache, um para várias execuções.
// Ver `scripts/lib/sessao-da-agencia.mjs`: o teto de tentativas do signin é
// baixo de propósito, e ferramenta de captura que loga do zero se auto-bloqueia.
let sessao;
try {
  sessao = await sessaoDaAgencia(browser, base, email, senha);
} catch (e) {
  console.error(`✗ ${e.message}`);
  await browser.close();
  process.exit(1);
}

try {
  for (const { device, width, height } of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      storageState: sessao,
    });
    const page = await ctx.newPage();

    await page.goto(base + rota, { waitUntil: "networkidle", timeout: 45000 });

    // A tela é cliente e busca a fila depois de montar: sem esperar o dado, a
    // foto sai do esqueleto pulsante.
    await page.waitForTimeout(1200);

    // O "Guia do Master" abre por cima de tudo no primeiro acesso e cobre a
    // tela inteira a 375px. Fotografar por baixo dele seria fotografar o guia.
    const guia = page.locator('button:has-text("Entendi, começar")').first();
    if (await guia.count()) {
      await guia.click();
      await page.waitForTimeout(400);
    }

    if (abrir) {
      const alvo = page.locator(`button:has-text("${abrir}")`).first();
      const achou = await alvo.count();
      if (!achou) {
        // Silenciar isto produziria a foto da tela FECHADA com nome de "aberta".
        console.error(`✗ ${device}: nenhum elemento com o texto "${abrir}" — nada foi aberto.`);
        falhou = true;
      } else {
        await alvo.click();
        await page.waitForTimeout(500);
      }
    }

    const file = `${outDir}/${nome}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const alturaDoc = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`${device.padEnd(7)} ${width}x${height}  doc ${alturaDoc}px  -> ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (falhou) process.exit(1);
