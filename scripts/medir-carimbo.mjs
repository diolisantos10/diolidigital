// MEDIÇÃO, não olhômetro: o carimbo de repetição estoura a pílula a 375px?
//
// A suspeita do Diretor era concreta — texto longo ("3º briefing deste mesmo
// contato (de 5)") numa pílula de altura FIXA (`h-6`) dentro de um cartão
// estreito. Pílula de altura fixa não quebra com elegância: ela quebra POR FORA
// do próprio fundo. Olhar a foto responde pelo caso que está na tela hoje; medir
// responde também pelo 12º briefing, que ninguém tem em banco ainda.
//
// Uso: node scripts/medir-carimbo.mjs
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { sessaoDaAgencia } from "./lib/sessao-da-agencia.mjs";

const base = process.env.SHOT_BASE || "http://localhost:3000";
const email = process.env.SHOT_EMAIL || "master@dioli.studio";
const senha = process.env.SHOT_SENHA || "DioliLocal!2026";
const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];
let executablePath;
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const sessao = await sessaoDaAgencia(browser, base, email, senha);
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, storageState: sessao });
const page = await ctx.newPage();
await page.goto(`${base}/agency/leads`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const guia = page.locator('button:has-text("Entendi, começar")').first();
if (await guia.count()) { await guia.click(); await page.waitForTimeout(300); }

const medida = await page.evaluate(() => {
  const carimbos = [...document.querySelectorAll("span")].filter((s) =>
    /briefing deste mesmo contato/.test(s.textContent || ""),
  );
  const ler = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      texto: el.textContent.trim(),
      larguraPilula: Math.round(r.width),
      alturaPilula: Math.round(r.height),
      alturaDaCaixaCss: cs.height,
      /** > altura declarada = o texto saiu do fundo colorido. */
      textoTransbordou: el.scrollHeight > el.clientHeight + 1,
      larguraDisponivel: Math.round(el.parentElement.getBoundingClientRect().width),
      /** o cartão inteiro, para saber quanto sobra. */
      larguraDoCartao: Math.round(el.closest("div[class*=rounded-]").getBoundingClientRect().width),
    };
  };
  const antes = carimbos.map(ler);

  // O CASO QUE AINDA NÃO EXISTE EM BANCO: dois dígitos nos dois números. É o
  // 10º briefing de uma pessoa que mandou 12 — nada impede que aconteça.
  const cobaia = carimbos[0];
  const original = cobaia.textContent;
  cobaia.textContent = "10º briefing deste mesmo contato (de 12)";
  const comDoisDigitos = ler(cobaia);

  // A METADE CARA: um texto que REALMENTE não cabe em uma linha. Com a altura
  // travada em `h-6`, o fundo colorido ficava em 24px e as letras saíam por
  // cima do que estivesse embaixo. O que se espera agora é o oposto: a pílula
  // CRESCE (altura > 24) e o texto continua dentro dela.
  cobaia.textContent =
    "12º briefing deste mesmo contato (de 15) — enviado pelo formulário público da agência";
  const textoQueNaoCabe = ler(cobaia);

  // E a comparação honesta: o MESMO texto com a altura travada de volta em
  // 24px, que era como o selo nascia. Sem isto, "a pílula agora cresce" é uma
  // afirmação sobre um antes que ninguém mediu.
  cobaia.style.height = "24px";
  const comAAlturaTravadaDeAntes = ler(cobaia);
  cobaia.style.height = "";
  cobaia.textContent = original;

  return {
    antes,
    comDoisDigitos,
    textoQueNaoCabe,
    comAAlturaTravadaDeAntes,
    larguraDaJanela: window.innerWidth,
  };
});

console.log(JSON.stringify(medida, null, 2));
await browser.close();
