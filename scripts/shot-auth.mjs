// Login + screenshot a protected route at 3 breakpoints.
// Usage: node scripts/shot-auth.mjs <path> <name>
//   node scripts/shot-auth.mjs /agency/dashboard dashboard
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const path = process.argv[2] || "/agency/dashboard";
const name = process.argv[3] || "page";
const base = process.argv[4] || "http://localhost:3000";
const EMAIL = process.env.LOGIN_EMAIL || "master@dioli.studio";
// Senha do AMBIENTE, nunca do código. Sem variável o script para: uma captura
// de tela não justifica deixar a credencial de dono da agência escrita aqui.
const PASS = process.env.LOGIN_PASS || process.env.SEED_MASTER_PASSWORD;
if (!PASS) {
  console.error(
    "✗ Defina LOGIN_PASS (ou SEED_MASTER_PASSWORD) — este script não tem senha padrão.",
  );
  process.exit(1);
}
const outDir = process.env.SHOT_DIR || "/tmp/claude-0/-home-user-dioli-agency-os-1/983c67cf-eb46-5de4-84ee-e27eb4a1080e/scratchpad/shots";

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
try {
  // Log in once, reuse the session cookie across viewports.
  const login = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await login.newPage();
  await lp.goto(base + "/auth/signin", { waitUntil: "networkidle", timeout: 45000 });
  await lp.fill('input[name="email"]', EMAIL);
  await lp.fill('input[name="password"]', PASS);
  await Promise.all([
    lp.waitForNavigation({ waitUntil: "networkidle", timeout: 45000 }).catch(() => {}),
    lp.click('button[type="submit"]'),
  ]);
  await lp.waitForTimeout(1500);
  console.log("after login, url =", lp.url());
  // Dismiss the first-run guided tour so it doesn't cover the screenshots.
  for (const label of ["Entendi, começar", "Entendi", "Começar"]) {
    const btn = lp.getByRole("button", { name: label });
    if (await btn.count().catch(() => 0)) { await btn.first().click().catch(() => {}); break; }
  }
  await lp.waitForTimeout(600);
  const state = await login.storageState();
  await login.close();

  for (const { device, width, height } of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, storageState: state });
    const page = await ctx.newPage();
    const resp = await page.goto(base + path, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ err: e }));
    await page.waitForTimeout(1000);
    const file = `${outDir}/${name}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${device.padEnd(7)} ${width}x${height}  HTTP ${resp?.status?.() ?? resp?.err?.message ?? "?"}  url=${page.url()}  -> ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
