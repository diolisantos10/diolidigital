// Captura AUTENTICADA em 375 / 768 / 1440. Local, banco de teste, nada real.
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const rota = process.argv[2] || "/";
const nome = process.argv[3] || "page";
const base = "http://localhost:3000";
const outDir = process.env.SHOT_DIR || "./shots";

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "/usr/bin/chromium",
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

// UM login só, reusado nos três tamanhos. Um login por viewport estoura o teto
// de tentativas do próprio app (5 por e-mail / 5 min) e as capturas seguintes
// saem DESLOGADAS com HTTP 200 — verde por fora, tela errada por dentro.
const login = await browser.newContext();
const rl = await login.request.post(`${base}/api/auth/signin`, {
  data: { email: "master@dioli.studio", password: "dev-local-only-9x" },
});
if (!rl.ok()) console.log(`  login HTTP ${rl.status()} — ${(await rl.text()).slice(0, 160)}`);
const cookies = await login.cookies();
await login.close();
if (cookies.length === 0) throw new Error("login não devolveu cookie — as capturas sairiam deslogadas");

try {
  for (const { device, width, height } of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();

    // O guia de onboarding cobre a tela no primeiro acesso — marcá-lo como
    // visto é o estado normal de quem já usa o painel.
    await page.goto(base + "/auth/signin", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.evaluate(() => {
      for (const p of ["master", "project_manager", "social_staff", "design_staff", "ads_staff"]) {
        window.localStorage.setItem("role_guide_seen_" + p, "true");
      }
    }).catch(() => {});

    const resp = await page.goto(base + rota, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ err: e }));
    await page.waitForTimeout(1500);
    const file = `${outDir}/${nome}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${device.padEnd(7)} ${width}x${height}  HTTP ${resp?.status?.() ?? resp?.err?.message ?? "?"}  -> ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
