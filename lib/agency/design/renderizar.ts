// renderizar.ts — O HTML VIRA PIXEL, E A LETRA É CONFERIDA ANTES DE SAIR.
//
// SERVER-ONLY. Sobe um Chromium (o mesmo que `scripts/shot.mjs` usa desde
// sempre — não é dependência nova), carrega o HTML do molde e rasteriza.
//
// ── ESTE MÓDULO É UM PORTÃO, NÃO UM CONVERSOR ───────────────────────────────
//
// A razão de existir do motor de molde é "a letra nunca sai errada". Um
// conversor que só rasteriza não prova nada: fonte que não carrega, texto que
// estoura a caixa e é cortado, texto que cai debaixo da interface do Instagram
// — nos três casos a peça sai bonita no log e errada no perfil do cliente.
//
// Por isso, antes de devolver os bytes, este módulo confere TRÊS coisas, e
// reprova a peça (nunca "avisa") quando alguma falha:
//
//   1. TEXTO IDÊNTICO. Cada string pedida pelo chamador — a string de
//      JavaScript, não o HTML — é procurada no DOM já renderizado, e tem de
//      bater CARACTERE A CARACTERE. É a volta completa: JS → HTML → DOM → JS.
//      Um erro de escape, um `text-transform` esquecido ou uma substituição
//      silenciosa aparecem aqui como divergência.
//   2. NADA CORTADO. Nenhum elemento de texto pode transbordar a própria caixa.
//      Texto cortado é texto errado — "PROMOÇÃO" virando "PROMOÇÃ" é o mesmo
//      defeito que o motor veio consertar, só que com outra causa.
//   3. NADA NA ZONA MORTA. Nenhum texto pode invadir a margem de topo/base do
//      formato (no story, onde ficam o avatar e a caixa de resposta).
//
// Antes de reprovar por (2) ele TENTA CABER: encolhe o título em passos e
// remede. Encolher é decisão de layout, é reversível e não muda uma letra.
//
// ── DEGRADAÇÃO DECLARADA ────────────────────────────────────────────────────
//
// Nada aqui lança para o chamador. Sem Chromium instalado, o retorno é
// `motivo: "sem_navegador"` e quem chamou decide o que fazer (em `artes.ts`, a
// peça sai só com a foto, e a falta da camada de texto é registrada). Mesmo
// contrato de `lib/ai/visao.ts` e de `lib/integrations/meta/leitura.ts`.

import { existsSync } from "node:fs";

export type MotivoDeFalhaDeRender =
  | "sem_navegador"        // degradação declarada: não há Chromium para rasterizar
  | "pedido_invalido"
  | "texto_divergente"     // o DOM não tem exatamente o texto pedido
  | "texto_cortado"        // transbordou a caixa mesmo depois de encolher
  | "texto_na_zona_morta"  // caiu sob a interface do Instagram
  | "erro_do_navegador"
  | "timeout";

export interface PedidoDeRender {
  html: string;
  largura: number;
  altura: number;
  /** Os textos EXATOS que têm de aparecer no DOM. Vazio = peça sem texto. */
  textosEsperados: string[];
  /** Faixa (em px, do topo e da base) proibida para texto. Ver FORMATOS. */
  zonaMortaTopo?: number;
  zonaMortaBase?: number;
}

export interface ConferenciaDaLetra {
  /** Quantos textos foram conferidos contra o DOM. */
  conferidos: number;
  /** Encolhemos algum título para caber? Layout mudou, letra não. */
  encolheu: boolean;
  /** Tamanho final do título, em px. Só para o registro de oficina. */
  tituloPx: number | null;
}

export type ResultadoDeRender =
  | { ok: true; bytes: Buffer; largura: number; altura: number; conferencia: ConferenciaDaLetra }
  | { ok: false; erro: string; motivo: MotivoDeFalhaDeRender };

/** Onde o Chromium mora nesta máquina. Mesma lista de `scripts/shot.mjs`, mais
 *  um override por env para quem roda em outro lugar. */
const EXECUTAVEIS = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || "",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
].filter(Boolean);

const TIMEOUT_MS = 45_000;
/** Quantos passos de encolhimento antes de desistir. 12 × 6% ≈ metade do corpo. */
const PASSOS_DE_ENCOLHIMENTO = 12;

/**
 * O código que roda DENTRO da página, como texto.
 *
 * É string de propósito, e não uma função passada ao `page.evaluate`: o
 * empacotador desta casa (esbuild, via tsx/Next) reescreve funções com o
 * ajudante `__name` do `--keep-names`, e o ajudante não existe dentro do
 * navegador — a chamada morre com "ReferenceError: __name is not defined" e o
 * motor inteiro cai no ramo de erro. Custou uma rodada de render para descobrir;
 * fica escrito para não custar duas.
 *
 * O que ele faz: encolhe o título até caber, e devolve a medição — o que
 * transbordou, o que invadiu a zona morta e QUAL TEXTO está no DOM.
 */
function codigoDoConferidor(passos: number, topo: number, base: number): string {
  return `(() => {
    var passos = ${JSON.stringify(passos)}, topo = ${JSON.stringify(topo)}, base = ${JSON.stringify(base)};
    var alvos = Array.prototype.slice.call(document.querySelectorAll("[data-papel]"));
    function transborda(el) {
      return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
    }
    function invade() {
      for (var i = 0; i < alvos.length; i++) {
        var r = alvos[i].getBoundingClientRect();
        if (r.height > 0 && (r.top < topo - 1 || r.bottom > window.innerHeight - base + 1)) return true;
      }
      return false;
    }
    function conteudoEstourou() {
      var c = document.querySelector(".conteudo");
      return c ? c.scrollHeight > c.clientHeight + 1 : false;
    }
    function algumTransborda() {
      for (var i = 0; i < alvos.length; i++) if (transborda(alvos[i])) return true;
      return false;
    }
    var titulo = document.querySelector('[data-papel="titulo"]');
    var encolheu = false;
    var px = titulo ? parseFloat(getComputedStyle(titulo).fontSize) : 0;
    for (var passo = 0; passo < passos && titulo; passo++) {
      if (!(algumTransborda() || invade() || conteudoEstourou())) break;
      px = Math.round(px * 0.94);
      titulo.style.fontSize = px + "px";
      encolheu = true;
    }
    var textos = [];
    for (var j = 0; j < alvos.length; j++) textos.push(alvos[j].textContent || "");
    return {
      encolheu: encolheu,
      tituloPx: titulo ? px : null,
      cortado: algumTransborda() || conteudoEstourou(),
      zonaMorta: invade(),
      textosNoDom: textos,
    };
  })()`;
}

function acharExecutavel(): string | undefined {
  for (const e of EXECUTAVEIS) if (existsSync(e)) return e;
  return undefined; // deixa o Playwright procurar na instalação padrão
}

/** Dá para rasterizar nesta máquina? Para o chamador decidir ANTES de gastar
 *  uma imagem de IA que ele não conseguiria compor. Nunca lança. */
export async function renderizadorDisponivel(): Promise<{ disponivel: boolean; caminho: string | null }> {
  try {
    await import("playwright");
  } catch {
    return { disponivel: false, caminho: null };
  }
  const caminho = acharExecutavel();
  // Sem caminho conhecido ainda pode haver instalação padrão do Playwright —
  // mas aí não dá para AFIRMAR que existe. Ausência de informação não é
  // informação: respondemos o que sabemos.
  return { disponivel: Boolean(caminho), caminho: caminho ?? null };
}

/**
 * Rasteriza o HTML e confere a letra. Nunca lança.
 */
export async function renderizarHtml(p: PedidoDeRender): Promise<ResultadoDeRender> {
  if (!p.html?.trim()) return { ok: false, motivo: "pedido_invalido", erro: "HTML vazio." };
  if (!(p.largura > 0 && p.altura > 0)) {
    return { ok: false, motivo: "pedido_invalido", erro: "dimensão inválida." };
  }

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return {
      ok: false,
      motivo: "sem_navegador",
      erro: "Playwright não está instalado neste ambiente — a peça não pode receber a camada de texto.",
    };
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({
      executablePath: acharExecutavel(),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
    });
    const ctx = await browser.newContext({
      viewport: { width: p.largura, height: p.altura },
      deviceScaleFactor: 1,
      // O molde não busca nada na rede. Se um dia buscar, queremos saber por
      // erro visível, não por peça sem fonte.
      offline: true,
    });
    const page = await ctx.newPage();
    await page.setContent(p.html, { waitUntil: "load", timeout: TIMEOUT_MS });
    // Espera a fonte estar pronta ANTES de medir. Medir com a fonte substituta
    // e rasterizar com a definitiva dá um "cabe" que não vale.
    await page.evaluate("document.fonts.ready");

    // ── AJUSTE: encolhe o título até caber (layout muda, letra não) ─────────
    const ajuste = (await page.evaluate(
      codigoDoConferidor(PASSOS_DE_ENCOLHIMENTO, p.zonaMortaTopo ?? 0, p.zonaMortaBase ?? 0),
    )) as {
      encolheu: boolean;
      tituloPx: number | null;
      cortado: boolean;
      zonaMorta: boolean;
      textosNoDom: string[];
    };

    // ── PORTÃO 1: a letra é a letra pedida ─────────────────────────────────
    const noDom = ajuste.textosNoDom.map((t) => t.replace(/\s+/g, " ").trim());
    for (const esperado of p.textosEsperados) {
      const alvo = esperado.replace(/\s+/g, " ").trim();
      if (!alvo) continue;
      if (!noDom.includes(alvo)) {
        return {
          ok: false,
          motivo: "texto_divergente",
          erro: `o texto pedido não saiu igual no DOM: "${alvo.slice(0, 60)}" — encontrados: ${noDom.map((t) => `"${t.slice(0, 40)}"`).join(", ") || "nenhum"}`,
        };
      }
    }

    // ── PORTÃO 2 e 3: nada cortado, nada na zona morta ─────────────────────
    if (ajuste.cortado) {
      return {
        ok: false,
        motivo: "texto_cortado",
        erro: "o texto não coube na caixa nem depois de encolher — texto cortado é texto errado.",
      };
    }
    if (ajuste.zonaMorta) {
      return {
        ok: false,
        motivo: "texto_na_zona_morta",
        erro: "o texto invadiu a faixa coberta pela interface do Instagram.",
      };
    }

    const bytes = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: p.largura, height: p.altura } });
    await ctx.close();
    return {
      ok: true,
      bytes: Buffer.from(bytes),
      largura: p.largura,
      altura: p.altura,
      conferencia: {
        conferidos: p.textosEsperados.filter((t) => t.trim()).length,
        encolheu: ajuste.encolheu,
        tituloPx: ajuste.tituloPx,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    const timeout = /timeout/i.test(msg);
    const semNavegador = /executable doesn't exist|browsertype\.launch|failed to launch/i.test(msg);
    return {
      ok: false,
      motivo: timeout ? "timeout" : semNavegador ? "sem_navegador" : "erro_do_navegador",
      erro: msg.slice(0, 300),
    };
  } finally {
    await browser?.close().catch(() => { /* best-effort */ });
  }
}
