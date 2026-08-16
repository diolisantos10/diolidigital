// Prova por FOTO: os dois avisos de falha de conversa do /briefing —
// BARRADO (429, freio de IP) e QUEBRADO (falha de rede real) — na tela real,
// em 375 / 768 / 1440. "Mudamos o que o cliente vê e ninguém olhou" não é
// aceitável nesta casa; este script é o "alguém olhou".
//
// Textos-fonte (não reescrever, só ler e comparar com o que a tela mostra):
//   PublicBriefingRoom.tsx → TEXTO_AVISO_BARRADO / TEXTO_AVISO_QUEBRADO
//   "Você está mandando mensagens rápido demais. Espere alguns segundos e
//    continue — sua conversa não foi perdida."
//   "Não conseguimos falar com a consultora agora. Continue digitando — sua
//    mensagem foi salva, e você pode tentar de novo em instantes."
//
// ── Por que o 429 é PRODUZIDO DE VERDADE, não simulado ──────────────────────
// `app/api/sdr/chat/route.ts` roda DOIS freios: o de IP (`limiteExcedido(req,
// "sdr-chat", 30, 60_000)`, linha ~312) ANTES de tudo, e o de sessão
// (`sdr-chat-sessao`, linha ~369) DEPOIS de resolver a chave de IA. Este
// ambiente não tem chave configurada — `chaveDeRotaPublica("claude")` falha e
// a rota devolve `{ok:false, reason:"not_configured"}` (200) antes de chegar
// no freio de sessão. Ou seja: o ÚNICO freio que este ambiente consegue
// mesmo estourar é o de IP, e é isso que o laço de `fetch` abaixo faz — 34
// POSTs seguidos, do PRÓPRIO NAVEGADOR (mesmo IP, mesma janela de 60s que a
// captura), medido por quem escreveu a ficha: 200×30, depois 429 429 429 429,
// `retry-after: 46`.
//
// Os dois freios (IP e sessão) produzem a MESMA `respostaDeRecusa` (429 +
// `Retry-After`) e o cliente NÃO os distingue por construção — o componente
// só enxerga `res.status === 429` → `{ kind: "barrado" }`. A foto vale para
// os dois casos.
//
// ── Por que o "quebrado" é falha de rede de verdade ──────────────────────────
// `page.route("**/api/sdr/chat", r => r.abort())` faz o `fetch` do navegador
// LANÇAR — é exatamente o caminho `catch` → `{ kind: "quebrado" }` em
// `fetchSdrReply` (PublicBriefingRoom.tsx). Não é 503 fingido, é a chamada
// nunca completando do ponto de vista do navegador.
//
// Uso:
//   node scripts/foto-barrado-e-quebrado.mjs [baseUrl]
//
// Saída: docs/entregas/barrado-16-08/
//   barrado-{mobile,tablet,desktop}.png
//   quebrado-{mobile,tablet,desktop}.png
//   barrado-com-texto-mobile.png   (quadro extra: campo já aceita texto de novo)

import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const base = process.argv[2] || "http://localhost:3000";
const outDir = "docs/entregas/barrado-16-08";

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

const DEVICES = [
  { device: "mobile", width: 375, height: 812 },
  { device: "tablet", width: 768, height: 1024 },
  { device: "desktop", width: 1440, height: 900 },
];

const TEXTO_AVISO_BARRADO =
  "Você está mandando mensagens rápido demais. Espere alguns segundos e continue — sua conversa não foi perdida.";
const TEXTO_AVISO_QUEBRADO =
  "Não conseguimos falar com a consultora agora. Continue digitando — sua mensagem foi salva, e você pode tentar de novo em instantes.";

mkdirSync(outDir, { recursive: true });

let executablePath;
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });

// Registro final — arquivo, texto do alerta, estado de campo/botão.
const relatorio = [];
// Falhas — impressas com todas as letras, nunca escondidas atrás de uma foto que não existe.
const falhas = [];

function log(msg) {
  console.log(msg);
}

async function abrirNoBriefing(page) {
  await page.goto(base + "/briefing", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(400);

  // LeadNaPorta — sair pela saída declarada, sem preencher contato.
  const pular = page.getByText("Prefiro não deixar contato agora", { exact: false });
  if (await pular.count() > 0) {
    await pular.first().click();
    await page.waitForTimeout(400);
  }

  const textarea = page.locator("textarea");
  await textarea.waitFor({ state: "visible", timeout: 15000 });
  return textarea;
}

async function enviarMensagem(page, textarea, texto) {
  await textarea.fill(texto);
  await page.getByLabel("Enviar").click();
}

// Estoura o freio de IP DO PRÓPRIO NAVEGADOR — mesmo IP, mesma janela de 60s
// que a captura, sem depender de um curl externo correndo em paralelo.
async function estourarBaldeDeIp(page) {
  const resultados = await page.evaluate(async () => {
    const respostas = [];
    for (let i = 0; i < 34; i++) {
      try {
        const res = await fetch("/api/sdr/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [],
            currentMessage: `estourando o balde ${i}`,
          }),
        });
        respostas.push(res.status);
      } catch {
        respostas.push("erro-de-rede");
      }
    }
    return respostas;
  });
  const contagem = resultados.reduce((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  return contagem;
}

// Verifica se sobrou número de segundos ou código HTTP cru na tela — é
// defeito, e o script precisa denunciar, não só fotografar.
function conferirTextoLimpo(texto, contexto) {
  if (/\b429\b/.test(texto) || /\b503\b/.test(texto)) {
    falhas.push(`${contexto}: código HTTP apareceu no texto do aviso — "${texto}"`);
  }
  if (/\b\d{1,3}\s*(segundos?|s\b)/i.test(texto)) {
    falhas.push(`${contexto}: contagem de segundos apareceu no texto do aviso — "${texto}"`);
  }
}

async function estadoDoCampo(page) {
  const textarea = page.locator("textarea");
  const botao = page.getByLabel("Enviar");
  const textareaDisabled = await textarea.isDisabled().catch(() => "indeterminado");
  const botaoDisabled = await botao.isDisabled().catch(() => "indeterminado");
  return { textareaDisabled, botaoDisabled };
}

async function capturarBarrado({ device, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  try {
    const textarea = await abrirNoBriefing(page);

    // Mensagem normal, para a conversa existir na tela antes do aviso.
    await enviarMensagem(page, textarea, "Meu nome é Diego, meu negócio é City Jobs");
    await page.waitForTimeout(1800);

    // Estoura o balde IMEDIATAMENTE antes de mandar a mensagem que vai barrar
    // — a janela é de 60s, não confiar em um estouro só durar as 3 capturas.
    const contagem = await estourarBaldeDeIp(page);
    log(`[barrado/${device}] estouro do balde: ${JSON.stringify(contagem)}`);
    if (!contagem[429]) {
      falhas.push(`barrado/${device}: o estouro de 34 POSTs não produziu NENHUM 429 (contagem: ${JSON.stringify(contagem)}). O freio de IP pode não estar ativo, ou o limite mudou.`);
    }

    await enviarMensagem(page, textarea, "quero 2 posts por dia, verba de R$ 500 por mês");

    const alerta = page.locator('[role="alert"]');
    await alerta.first().waitFor({ state: "visible", timeout: 20000 });
    const textoAlerta = (await alerta.first().textContent())?.trim() ?? "";
    conferirTextoLimpo(textoAlerta, `barrado/${device}`);
    if (textoAlerta !== TEXTO_AVISO_BARRADO) {
      falhas.push(`barrado/${device}: texto do aviso é DIFERENTE do TEXTO_AVISO_BARRADO esperado.\n  esperado: "${TEXTO_AVISO_BARRADO}"\n  na tela:  "${textoAlerta}"`);
    }

    const { textareaDisabled, botaoDisabled } = await estadoDoCampo(page);

    const file = `${outDir}/barrado-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    relatorio.push({ arquivo: file, alerta: textoAlerta, textareaDisabled, botaoDisabled });
    log(`barrado  ${device.padEnd(7)} ${width}x${height} -> ${file}`);

    // Quadro extra (só mobile, é onde a dobra dói): a conversa NÃO morre —
    // o campo aceita texto de novo enquanto o esfriamento ainda corre.
    if (device === "mobile") {
      await page.locator("textarea").fill("ainda estou aqui, escrevendo de novo");
      const file2 = `${outDir}/barrado-com-texto-mobile.png`;
      await page.screenshot({ path: file2, fullPage: true });
      const { textareaDisabled: td2, botaoDisabled: bd2 } = await estadoDoCampo(page);
      relatorio.push({ arquivo: file2, alerta: textoAlerta, textareaDisabled: td2, botaoDisabled: bd2, obs: "quadro extra — texto digitado após o aviso" });
      log(`barrado  ${device.padEnd(7)} (com texto) -> ${file2}`);
    }
  } catch (e) {
    falhas.push(`barrado/${device}: FALHOU no passo em andamento — ${e?.message ?? e}`);
  } finally {
    await ctx.close();
  }
}

async function capturarQuebrado({ device, width, height }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  try {
    // Falha de rede de verdade do ponto de vista do navegador — o fetch
    // LANÇA, cai no `catch` → `{ kind: "quebrado" }`.
    await page.route("**/api/sdr/chat", (route) => route.abort());

    const textarea = await abrirNoBriefing(page);
    await enviarMensagem(page, textarea, "Meu nome é Diego, meu negócio é City Jobs");

    const alerta = page.locator('[role="alert"]');
    await alerta.first().waitFor({ state: "visible", timeout: 20000 });
    const textoAlerta = (await alerta.first().textContent())?.trim() ?? "";
    conferirTextoLimpo(textoAlerta, `quebrado/${device}`);
    if (textoAlerta !== TEXTO_AVISO_QUEBRADO) {
      falhas.push(`quebrado/${device}: texto do aviso é DIFERENTE do TEXTO_AVISO_QUEBRADO esperado.\n  esperado: "${TEXTO_AVISO_QUEBRADO}"\n  na tela:  "${textoAlerta}"`);
    }

    const { textareaDisabled, botaoDisabled } = await estadoDoCampo(page);

    const file = `${outDir}/quebrado-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    relatorio.push({ arquivo: file, alerta: textoAlerta, textareaDisabled, botaoDisabled });
    log(`quebrado ${device.padEnd(7)} ${width}x${height} -> ${file}`);
  } catch (e) {
    falhas.push(`quebrado/${device}: FALHOU no passo em andamento — ${e?.message ?? e}`);
  } finally {
    await ctx.close();
  }
}

try {
  // 375 PRIMEIRO, sempre — é onde a faixa pode empurrar conteúdo para fora da
  // dobra, e é onde a maioria das pessoas está.
  for (const d of DEVICES) await capturarBarrado(d);
  for (const d of DEVICES) await capturarQuebrado(d);
} finally {
  await browser.close();
}

log("\n──────── RELATÓRIO ────────");
for (const r of relatorio) {
  log(`${r.arquivo}`);
  log(`  alerta:           "${r.alerta}"`);
  log(`  textarea disabled: ${r.textareaDisabled}`);
  log(`  botão disabled:    ${r.botaoDisabled}`);
  if (r.obs) log(`  obs: ${r.obs}`);
}

if (falhas.length > 0) {
  log("\n──────── FALHAS (não invente foto, não descreva o que não viu) ────────");
  for (const f of falhas) log(`⚠️  ${f}`);
  process.exitCode = 1;
} else {
  log("\nSem falhas registradas.");
}
