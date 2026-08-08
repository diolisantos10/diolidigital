// Screenshot de tela AUTENTICADA em 3 tamanhos. Faz login antes de capturar —
// `shot.mjs` cai no /auth/signin em qualquer rota de /agency.
// Uso: node scripts/shot-logado.mjs <rota> <nome>
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const rota = process.argv[2] || "/agency/dashboard";
const nome = process.argv[3] || "page";
const base = process.argv[4] || "http://localhost:3000";
const outDir = process.env.SHOT_DIR || "./shots";
const email = process.env.SHOT_EMAIL || "master@dioli.studio";
const senha = process.env.SHOT_PASSWORD || "";

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];
mkdirSync(outDir, { recursive: true });
let executablePath;
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const DEVICES = [
  { device: "mobile", width: 375, height: 812 },
  { device: "tablet", width: 768, height: 1024 },
  { device: "desktop", width: 1440, height: 900 },
];
try {
  for (const { device, width, height } of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(base + "/auth/signin", { waitUntil: "networkidle", timeout: 45000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', senha);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/agency\//, { timeout: 30000 }).catch(() => {});
    // O guia de papel abre sozinho na primeira visita e cobre a tela inteira.
    // Marcá-lo como visto é o que a própria interface faz no botão "Entendi".
    await page.evaluate(() => {
      for (const r of ["master", "project_manager"]) window.localStorage.setItem("role_guide_seen_" + r, "true");
    }).catch(() => {});
    const resp = await page.goto(base + rota, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ err: e }));
    await page.waitForTimeout(1200);
    const file = `${outDir}/${nome}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${device.padEnd(7)} ${width}x${height}  ${page.url()}  HTTP ${resp?.status?.() ?? resp?.err?.message ?? "?"} -> ${file}`);
    await ctx.close();
  }
} finally { await browser.close(); }
