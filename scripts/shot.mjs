// Reusable screenshot tool — captures a URL at 3 breakpoints (mobile/tablet/desktop).
// Usage: node scripts/shot.mjs <path> <name> [baseUrl]
//   node scripts/shot.mjs /auth/signin signin
// Output: scratchpad/shots/<name>-<device>.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const path = process.argv[2] || "/";
const name = process.argv[3] || "page";
const base = process.argv[4] || "http://localhost:3000";
const outDir = process.env.SHOT_DIR || "/tmp/claude-0/-home-user-dioli-agency-os-1/983c67cf-eb46-5de4-84ee-e27eb4a1080e/scratchpad/shots";

// Prefer the full chromium build; fall back to the headless shell.
const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

const DEVICES = [
  { device: "mobile",  width: 375,  height: 812 },
  { device: "tablet",  width: 768,  height: 1024 },
  { device: "desktop", width: 1440, height: 900 },
];

mkdirSync(outDir, { recursive: true });

let executablePath;
const { existsSync } = await import("node:fs");
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
try {
  for (const { device, width, height } of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const url = base + path;
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ err: e }));
    await page.waitForTimeout(600);
    const file = `${outDir}/${name}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${device.padEnd(7)} ${width}x${height}  HTTP ${resp?.status?.() ?? resp?.err?.message ?? "?"}  -> ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
