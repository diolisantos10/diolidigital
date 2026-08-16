// Reusable screenshot tool — captures a URL at 3 breakpoints (mobile/tablet/desktop).
// Usage: node scripts/shot.mjs <path> <name> [baseUrl]
//   node scripts/shot.mjs /auth/signin signin
// Output: scratchpad/shots/<name>-<device>.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const path = process.argv[2] || "/";
const name = process.argv[3] || "page";
const base = process.argv[4] || "http://localhost:3000";
// Caminho de sessão de agente não sobrevive à sessão que o criou — o padrão
// anterior apontava para o scratchpad de OUTRA execução e escrevia num diretório
// que ninguém abria. `.shots/` é local, previsível e está no .gitignore.
const outDir = process.env.SHOT_DIR || `${process.cwd()}/.shots`;

// ── O "N" QUE APARECEU EM CIMA DO CARTÃO (16/08/2026) ──────────────────────
//
// Uma captura de `/agency/leads` a 375px foi commitada com um círculo escuro
// marcado "N" flutuando na borda esquerda, TAPANDO a linha de preço do primeiro
// cartão — e a leitura óbvia (badge de sessão, avatar, defeito do
// `AgencySidebar`) estava toda errada.
//
// É o **indicador de dev do Next.js**, o botão de devtools que o `next dev`
// injeta no canto inferior esquerdo. Ele é `position: fixed`, então numa
// captura `fullPage` ele não some no rodapé: ele fica ancorado à altura do
// viewport inicial (812px no celular) e cai NO MEIO da página comprida.
//
// Ele não existe em produção, não é componente desta casa e nenhum ajuste de
// layout o move. O lugar de consertar isto é a FERRAMENTA DE CAPTURA — quem
// olhar a imagem depois não tem como saber que aquilo era do framework.
const ESCONDER_OVERLAY_DE_DEV = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
  [data-nextjs-dev-tools-button], nextjs-route-announcer { display: none !important; }
`;

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
    await page.addStyleTag({ content: ESCONDER_OVERLAY_DE_DEV }).catch(() => {});
    await page.waitForTimeout(600);
    const file = `${outDir}/${name}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${device.padEnd(7)} ${width}x${height}  HTTP ${resp?.status?.() ?? resp?.err?.message ?? "?"}  -> ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
