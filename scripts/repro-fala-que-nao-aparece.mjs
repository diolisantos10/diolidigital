// repro-fala-que-nao-aparece.mjs
//
// MEDE, com o app de pé, a queixa do CEO: "Na tela do SDR, enquanto ele
// digita ou manda áudio, ele não enxerga o que o agente está falando."
// Ficha de despacho: defeito 2, 16/08/2026 — o mesmo relato já registrado em
// `docs/pendencias.md` ("Reportado pelo CEO e NÃO reproduzido") e reaberto
// com hipóteses mais específicas nesta ficha (guarda, 429, provedor fora do
// ar, `reply === null`).
//
// O QUE ESTE SCRIPT FAZ, e por quê:
//   1. Abre /briefing em 375x812 (a largura do CEO — prioridade da casa).
//   2. Passa pela porta de contato (LeadNaPorta): nome + e-mail.
//   3. Digita UMA resposta na sala de briefing e envia.
//   4. Conta balões do AGENTE (role="assistant", `div.justify-start` dentro
//      do container de mensagens) antes e depois do envio — nunca a
//      contagem de TODOS os balões, porque a mensagem do próprio visitante
//      também entra na lista e mascararia um agente mudo.
//   5. Ao mesmo tempo, escuta a resposta HTTP de /api/sdr/chat — para amarrar
//      "o que a rota devolveu" a "o que a tela mostrou". Sem essa amarra, um
//      silêncio na tela não prova nada: pode ser a rota que não respondeu,
//      ou a rota respondendo e a tela engolindo a resposta.
//   6. Tira UM screenshot de VIEWPORT (nunca fullPage — é o que a pessoa
//      efetivamente vê, sem rolar) do estado final.
//   7. Imprime um veredito LITERAL, sem interpretação: quem lê a saída não
//      precisa abrir o código para saber se o defeito apareceu.
//
// ESTE AMBIENTE NÃO TEM CHAVE DE IA NENHUMA (.env só tem DATABASE_URL e
// JWT_SECRET) — então toda chamada ao SDR aqui reproduz, de graça, o caminho
// "o provedor de IA não responde" (`reason: "not_configured"`, ver
// `lib/ai/chave-publica.ts`). É o caso 4 da ficha, e é o único que este
// ambiente consegue reproduzir sem simular nada.
//
// Fora de escopo (outro despacho, ver cabeçalho do arquivo original): rolagem,
// teclado virtual, layout. Este script mede SÓ o caminho da fala.

import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT_DIR =
  process.env.SHOT_DIR ||
  "/tmp/claude-0/-home-user-dioli-agency-os-1/983c67cf-eb46-5de4-84ee-e27eb4a1080e/scratchpad/shots";

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];

const TETO_ESPERA_MS = 30_000;
const PASSO_MS = 300;

function agora() {
  return new Date().toISOString();
}

async function contarBaloesDoAgente(page) {
  // Container das mensagens: `div.overflow-y-auto.min-h-[320px].max-h-[480px]`
  // (ver PublicBriefingRoom.tsx). Balão do AGENTE = filho direto com as
  // classes `flex justify-start` — o indicador de "digitando" tem `flex`
  // mas NÃO tem `justify-start`, e o balão do VISITANTE tem `justify-end`.
  // Contar por essa marca exclui os dois de propósito.
  return page
    .locator('div.overflow-y-auto.min-h-\\[320px\\].max-h-\\[480px\\] > div.flex.justify-start')
    .count();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let executablePath;
  for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();

  // ── Captura da resposta de /api/sdr/chat, amarrada ao que a tela mostrou ──
  /** @type {{ status: number|null, ok: boolean|null, reason: string|null, temReply: boolean|null, corpoBruto: string|null } } */
  const respostaDaRota = { status: null, ok: null, reason: null, temReply: null, corpoBruto: null };
  page.on("response", async (resp) => {
    if (!resp.url().includes("/api/sdr/chat")) return;
    respostaDaRota.status = resp.status();
    try {
      const corpo = await resp.text();
      respostaDaRota.corpoBruto = corpo;
      try {
        const json = JSON.parse(corpo);
        respostaDaRota.ok = json.ok ?? null;
        respostaDaRota.reason = typeof json.reason === "string" ? json.reason : null;
        respostaDaRota.temReply = typeof json.reply === "string" && json.reply.trim().length > 0
          ? true
          : (json.reply === null ? "null" : false);
      } catch {
        // corpo não é JSON — fica só o bruto, o veredito abaixo já cobre isso.
      }
    } catch (err) {
      respostaDaRota.corpoBruto = `<falha ao ler corpo: ${err instanceof Error ? err.message : String(err)}>`;
    }
  });

  console.log(`[${agora()}] abrindo ${BASE}/briefing …`);
  const nav = await page.goto(`${BASE}/briefing`, { waitUntil: "networkidle", timeout: 45_000 }).catch((e) => ({ err: e }));
  if (nav?.err) {
    console.log(`VEREDITO: NÃO MEDIDO — /briefing não respondeu (${nav.err.message}). App está de pé?`);
    await browser.close();
    process.exit(2);
  }

  // ── Porta de entrada: LeadNaPorta (nome + e-mail) ──────────────────────────
  const campoNome = page.getByPlaceholder("Como podemos te chamar?");
  if (await campoNome.count()) {
    console.log(`[${agora()}] preenchendo a porta de contato (LeadNaPorta) …`);
    await campoNome.fill("Visitante de Reprodução");
    await page.getByPlaceholder("voce@empresa.com.br").fill("visitante-repro@example.com");
    await page.getByRole("button", { name: "Começar o briefing" }).click();
    await page.waitForTimeout(400);
  }

  // ── Sala de briefing: espera o textarea existir ────────────────────────────
  const textarea = page.locator("textarea");
  await textarea.waitFor({ state: "visible", timeout: 15_000 });

  const baloesAntes = await contarBaloesDoAgente(page);
  console.log(`[${agora()}] balões do agente ANTES do envio: ${baloesAntes}`);

  const MENSAGEM = "Meu nome é Visitante Repro e meu negócio é Estúdio Repro. Quero social media.";
  await textarea.fill(MENSAGEM);
  const botaoEnviar = page.getByRole("button", { name: "Enviar" });

  console.log(`[${agora()}] enviando: "${MENSAGEM}"`);
  const disparoEm = Date.now();
  await botaoEnviar.click();

  // ── Espera até aparecer um balão NOVO, ou até o teto de 30s ────────────────
  let baloesDepois = baloesAntes;
  let tempoAteBalaoNovoMs = null;
  while (Date.now() - disparoEm < TETO_ESPERA_MS) {
    baloesDepois = await contarBaloesDoAgente(page);
    if (baloesDepois > baloesAntes) {
      tempoAteBalaoNovoMs = Date.now() - disparoEm;
      break;
    }
    await page.waitForTimeout(PASSO_MS);
  }

  // Dá uma folga curta para a resposta de /api/sdr/chat (capturada via
  // page.on("response") acima) terminar de chegar, mesmo quando o balão já
  // apareceu antes dela — o registro em rede pode ficar alguns ms atrás do
  // repaint.
  await page.waitForTimeout(500);

  const balaoNovoNaTela = baloesDepois > baloesAntes;

  const nomeArquivo = `${OUT_DIR}/repro-fala-que-nao-aparece.png`;
  await page.screenshot({ path: nomeArquivo, fullPage: false });

  await browser.close();

  // ── Veredito literal ────────────────────────────────────────────────────
  const rotaFalou = respostaDaRota.status !== null;
  const agenteFalou =
    respostaDaRota.temReply === true ? "sim (campo reply preenchido)" :
    respostaDaRota.temReply === "null" ? "não (reply: null — barrado, ver comentário PublicBriefingRoom.tsx:812)" :
    respostaDaRota.temReply === false ? "não (reply ausente/vazio)" :
    "não medido (corpo não chegou ou não é JSON)";

  console.log("");
  console.log("─── VEREDITO ─────────────────────────────────────────────");
  console.log(`ROTA RESPONDEU:      ${rotaFalou ? "sim" : "não"}`);
  console.log(`HTTP:                 ${respostaDaRota.status ?? "<sem resposta>"}`);
  console.log(`ok no corpo:          ${respostaDaRota.ok}`);
  console.log(`reason no corpo:      ${respostaDaRota.reason ?? "<ausente>"}`);
  console.log(`AGENTE FALOU:         ${agenteFalou}`);
  console.log(`BALÃO NOVO NA TELA:   ${balaoNovoNaTela ? "sim" : "não"}`);
  console.log(`tempo até balão novo: ${tempoAteBalaoNovoMs !== null ? tempoAteBalaoNovoMs + "ms" : `>${TETO_ESPERA_MS}ms (desisti)`}`);
  console.log(`balões antes/depois:  ${baloesAntes} / ${baloesDepois}`);
  console.log(`screenshot:           ${nomeArquivo}`);
  console.log(`corpo bruto da rota:  ${respostaDaRota.corpoBruto ?? "<não capturado>"}`);
  console.log("─────────────────────────────────────────────────────────");

  if (!balaoNovoNaTela) {
    console.log("");
    console.log(
      "DEFEITO REPRODUZIDO: a rota respondeu e/ou o tempo esgotou, e NENHUM " +
      "balão novo apareceu — o visitante ficou sem ver o agente falar.",
    );
    process.exit(1);
  } else {
    console.log("");
    console.log(
      "NÃO REPRODUZIDO NESTE CAMINHO: um balão novo apareceu na tela " +
      "(agente via IA OU motor de regras — Lei 2). Ver a devolução do " +
      "especialista para a lista de caminhos ainda não cobertos por este script.",
    );
  }
}

main().catch((err) => {
  console.error("ERRO NO SCRIPT:", err);
  process.exit(2);
});
