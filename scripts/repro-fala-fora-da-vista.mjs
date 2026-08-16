// repro-fala-fora-da-vista.mjs
//
// Rodada 2, defeito 2 — o balão EXISTE mas o visitante não o VÊ.
//
// `scripts/repro-fala-que-nao-aparece.mjs` (a rodada anterior) mediu o
// caminho de DADOS: o motor de regras responde, um balão novo entra no DOM.
// Concluiu "não reproduzido" — e estava medindo a coisa errada. **Contar
// balões no DOM não é ver.** Um balão pode existir e estar fora da área
// visível — foi exatamente isso que o CEO relatou em 16/08/2026: na tela do
// SDR, enquanto ele digitava ou gravava áudio, não enxergava o que o agente
// estava falando.
//
// O laudo do `experiencia` (ficha de despacho, rodada 2) nomeou dois
// mecanismos em `PublicBriefingRoom.tsx`:
//
//   MECANISMO B — `messagesEndRef.current?.scrollIntoView({ behavior:
//   "smooth" })` (linha ~1353) SEM `block` explícito usa o padrão `"start"` e
//   sobe por TODA a cadeia de ancestrais roláveis: o container interno de
//   mensagens (correto) E a página (porque o card não tem altura própria —
//   quem rola por fora é o `body`). No nível da página isso tenta colar o
//   topo do sentinela (que fica colado na caixa de digitação) no topo da
//   janela — empurrando a conversa inteira, inclusive a mensagem recém-
//   chegada, para ACIMA da dobra. Só aparece quando a conversa passa do teto
//   de 480px do container.
//
//   MECANISMO A — `min-h-[320px]`/`max-h-[480px]` fixos em pixels dentro de
//   uma página que também rola. Com o teclado do celular aberto, a viewport
//   visual cai para ~380–520px e o navegador empurra a página para trazer o
//   `<textarea>` acima do teclado — sem que nada no componente saiba quanto
//   empurrou.
//
// ESTE SCRIPT MEDE VISIBILIDADE, NÃO EXISTÊNCIA:
//   1. 375x812, abre /briefing, entra pela porta sem deixar contato
//      (LeadNaPorta — "Prefiro não deixar contato agora").
//   2. Envia de 5 a 6 mensagens curtas, esperando o balão novo a cada turno,
//      até a conversa passar do teto de 480px do container.
//   3. A CADA turno mede: window.scrollY antes/depois, o retângulo do
//      ÚLTIMO balão do agente, a fração dele dentro de [0, innerHeight], e o
//      retângulo do <textarea> — para flagrar o mecanismo B (o textarea colado
//      no topo é a assinatura dele).
//   4. Veredito por turno, LITERAL: "ÚLTIMA FALA DO AGENTE VISÍVEL: sim/não
//      (x% dentro da viewport)". Reprova (exit 1) se em QUALQUER turno a
//      fração visível for < 50%.
//   5. Segunda bateria (mecanismo A): foca o textarea e encolhe a viewport
//      para 375x420 e depois 375x380 (pior caso), repetindo a medição.
//      Playwright NÃO abre teclado real — encolher a viewport é a técnica
//      padrão disponível, e este script NÃO vende isso como teclado real.
//   6. Screenshot de VIEWPORT (nunca fullPage) de cada estado reprovado.
//
// Fora de escopo: barra branca / layout dos outros blocos (outro despacho).

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
const FRACAO_MINIMA = 0.5; // < 50% visível reprova o turno

const MENSAGENS = [
  "Meu nome é Visitante Repro e meu negócio é Estúdio Repro.",
  "Quero social media para Instagram e Facebook.",
  "Algo em torno de 12 posts por mês, com stories todo dia.",
  "Não tenho videomaker próprio, preciso que vocês produzam.",
  "As fotos eu tenho, os criativos preciso que criem do zero.",
  "O objetivo principal é gerar mais leads qualificados pelo Instagram.",
];

function agora() {
  return new Date().toISOString();
}

async function contarBaloesDoAgente(page) {
  return page.locator('[data-testid="mensagens-container"] [data-testid="balao-do-agente"]').count();
}

// Mede, no estado ATUAL da página (sem mexer em scroll), tudo que o veredito
// precisa: posição da rolagem da PÁGINA, retângulo do último balão do
// agente e retângulo do textarea — e a fração do balão que cai dentro da
// janela visível.
async function medirVisibilidade(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const baloes = Array.from(
      document.querySelectorAll('[data-testid="mensagens-container"] [data-testid="balao-do-agente"]'),
    );
    const ultimo = baloes[baloes.length - 1] || null;
    const rectBalao = ultimo ? ultimo.getBoundingClientRect() : null;
    const textarea = document.querySelector('[data-testid="textarea-resposta"]');
    const rectTextarea = textarea ? textarea.getBoundingClientRect() : null;

    function fracaoVisivel(rect) {
      if (!rect) return null;
      if (rect.height <= 0) return 0;
      const topoVisivel = Math.max(rect.top, 0);
      const baseVisivel = Math.min(rect.bottom, vh);
      const alturaVisivel = Math.max(0, baseVisivel - topoVisivel);
      return alturaVisivel / rect.height;
    }

    return {
      scrollY: window.scrollY,
      innerHeight: vh,
      balao: rectBalao ? { top: rectBalao.top, bottom: rectBalao.bottom, height: rectBalao.height } : null,
      fracaoBalaoVisivel: fracaoVisivel(rectBalao),
      textarea: rectTextarea ? { top: rectTextarea.top, bottom: rectTextarea.bottom } : null,
    };
  });
}

function fmtPct(f) {
  return f === null ? "<sem balão>" : `${Math.round(f * 100)}%`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  let executablePath;
  for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();

  console.log(`[${agora()}] abrindo ${BASE}/briefing …`);
  const nav = await page.goto(`${BASE}/briefing`, { waitUntil: "networkidle", timeout: 45_000 }).catch((e) => ({ err: e }));
  if (nav?.err) {
    console.log(`VEREDITO: NÃO MEDIDO — /briefing não respondeu (${nav.err.message}). App está de pé?`);
    await browser.close();
    process.exit(2);
  }

  // ── Porta de entrada: pula o formulário de contato ──────────────────────
  const pularContato = page.getByRole("button", { name: "Prefiro não deixar contato agora" });
  if (await pularContato.count()) {
    console.log(`[${agora()}] entrando sem deixar contato (LeadNaPorta) …`);
    await pularContato.click();
    await page.waitForTimeout(400);
  }

  const textarea = page.locator('[data-testid="textarea-resposta"]');
  await textarea.waitFor({ state: "visible", timeout: 15_000 });

  let algumTurnoReprovado = false;
  const resultadosPorTurno = [];

  console.log("");
  console.log("─── BATERIA 1 — viewport cheia (375x812), conversa crescendo ─────");

  for (let i = 0; i < MENSAGENS.length; i++) {
    const msg = MENSAGENS[i];
    const baloesAntes = await contarBaloesDoAgente(page);

    await textarea.fill(msg);
    const botaoEnviar = page.getByRole("button", { name: "Enviar" });
    console.log(`[${agora()}] turno ${i + 1}: enviando "${msg}"`);
    await botaoEnviar.click();

    // Espera um balão novo do agente, ou o teto.
    const inicio = Date.now();
    let baloesDepois = baloesAntes;
    while (Date.now() - inicio < TETO_ESPERA_MS) {
      baloesDepois = await contarBaloesDoAgente(page);
      if (baloesDepois > baloesAntes) break;
      await page.waitForTimeout(PASSO_MS);
    }
    // Deixa o `scrollIntoView({behavior:"smooth"})` do componente terminar
    // de rolar (é `smooth`, não instantâneo) antes de medir.
    await page.waitForTimeout(700);

    const balaoNovo = baloesDepois > baloesAntes;
    const medida = await medirVisibilidade(page);
    const visivel = medida.fracaoBalaoVisivel !== null && medida.fracaoBalaoVisivel >= FRACAO_MINIMA;

    console.log(
      `  balão novo: ${balaoNovo ? "sim" : "NÃO (turno sem resposta — pulei a medição de visibilidade)"}`,
    );
    if (balaoNovo) {
      console.log(`  scrollY: ${medida.scrollY} · innerHeight: ${medida.innerHeight}`);
      console.log(
        `  balão do agente: top=${medida.balao?.top?.toFixed(0)} bottom=${medida.balao?.bottom?.toFixed(0)} altura=${medida.balao?.height?.toFixed(0)}`,
      );
      console.log(`  textarea: top=${medida.textarea?.top?.toFixed(0)} bottom=${medida.textarea?.bottom?.toFixed(0)}`);
      console.log(
        `  ÚLTIMA FALA DO AGENTE VISÍVEL: ${visivel ? "sim" : "NÃO"} (${fmtPct(medida.fracaoBalaoVisivel)} dentro da viewport)`,
      );
    }

    resultadosPorTurno.push({ turno: i + 1, msg, balaoNovo, ...medida, visivel });

    if (balaoNovo && !visivel) {
      algumTurnoReprovado = true;
      const nomeArq = `${OUT_DIR}/repro-fala-fora-da-vista-turno${i + 1}-viewport-cheia.png`;
      await page.screenshot({ path: nomeArq, fullPage: false });
      console.log(`  screenshot (reprovado): ${nomeArq}`);
    }
  }

  console.log("");
  console.log("─── BATERIA 2 — viewport encolhida (proxy de teclado aberto) ─────");
  console.log(
    "Playwright não abre teclado real de celular. Encolher a viewport com " +
      "setViewportSize é a técnica padrão disponível neste ambiente — é uma " +
      "APROXIMAÇÃO do efeito (menos altura visível), não uma simulação do " +
      "evento de teclado do SO. Tratado como tal no veredito abaixo.",
  );

  const alturasBateria2 = [420, 380];
  for (const altura of alturasBateria2) {
    await textarea.focus();
    await page.setViewportSize({ width: 375, height: altura });
    await page.waitForTimeout(300);
    const medida = await medirVisibilidade(page);
    const visivel = medida.fracaoBalaoVisivel !== null && medida.fracaoBalaoVisivel >= FRACAO_MINIMA;

    console.log(`[altura ${altura}px] scrollY: ${medida.scrollY} · innerHeight: ${medida.innerHeight}`);
    console.log(
      `  balão do agente: top=${medida.balao?.top?.toFixed(0)} bottom=${medida.balao?.bottom?.toFixed(0)}`,
    );
    console.log(`  textarea: top=${medida.textarea?.top?.toFixed(0)} bottom=${medida.textarea?.bottom?.toFixed(0)}`);
    console.log(
      `  ÚLTIMA FALA DO AGENTE VISÍVEL (viewport ${altura}px): ${visivel ? "sim" : "NÃO"} (${fmtPct(medida.fracaoBalaoVisivel)} dentro da viewport)`,
    );

    resultadosPorTurno.push({ turno: `bateria2-${altura}px`, balaoNovo: true, ...medida, visivel });

    if (!visivel) {
      algumTurnoReprovado = true;
      const nomeArq = `${OUT_DIR}/repro-fala-fora-da-vista-teclado-${altura}px.png`;
      await page.screenshot({ path: nomeArq, fullPage: false });
      console.log(`  screenshot (reprovado): ${nomeArq}`);
    }
  }

  await browser.close();

  console.log("");
  console.log("─── TABELA — fração visível por turno ─────────────────────────");
  for (const r of resultadosPorTurno) {
    console.log(
      `  turno=${String(r.turno).padEnd(14)} balaoNovo=${String(r.balaoNovo).padEnd(5)} visivel=${fmtPct(r.fracaoBalaoVisivel).padStart(6)} ${r.visivel ? "OK" : "REPROVADO"}`,
    );
  }

  console.log("");
  console.log("─── VEREDITO FINAL ─────────────────────────────────────────────");
  if (algumTurnoReprovado) {
    console.log(
      "DEFEITO REPRODUZIDO: em pelo menos um turno, a última fala do agente " +
        "ficou com menos de 50% da área visível na viewport — o balão existe " +
        "no DOM, mas o visitante não o vê sem rolar por conta própria.",
    );
    process.exit(1);
  } else {
    console.log(
      "NÃO REPRODUZIDO NESTE CAMINHO: em todos os turnos medidos (viewport " +
        "cheia e as duas alturas encolhidas), a última fala do agente ficou " +
        "com 50%+ da área dentro da viewport. Ver tabela acima para os números " +
        "exatos por turno.",
    );
  }
}

main().catch((err) => {
  console.error("ERRO NO SCRIPT:", err);
  process.exit(2);
});
