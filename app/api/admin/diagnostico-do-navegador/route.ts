// GET /api/admin/diagnostico-do-navegador — O QUE EXISTE NO DISCO DO CONTÊINER.
//
// ── POR QUE ESTA ROTA EXISTE (08/08/2026) ───────────────────────────────────
//
// `GET /api/capacidades` responde `montar-molde → pronta: false` e
// `onde_achei_o_navegador: null` há dias, e a agência inteira parou de produzir
// peça por causa disso. A casa sabia dizer **que não achou** o navegador e não
// tinha um só lugar capaz de dizer **o que existe lá dentro** — então toda
// tentativa de conserto era palpite sobre um contêiner que ninguém abriu.
//
// Palpite sobre build custa um deploy por hipótese, e um build quebrado para
// três agentes de uma vez. Esta rota troca adivinhação por medida: ela lista o
// que o Playwright acha que instalou, quais dos caminhos candidatos de
// `lib/agency/design/renderizar.ts` existem de fato, e o que há nas pastas onde
// um Chromium poderia estar.
//
// ── AUTENTICAÇÃO: O MESMO SEGREDO DAS ROTAS DE CRON ─────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>`, conferido por `segredoConfere` (tempo
// constante). **Segredo ausente do ambiente → PORTA FECHADA (503)**, nunca
// aberta — o mesmo contrato de `/api/admin/diagnostico-de-conexoes`. Ela conta
// caminho de binário e variável de ambiente presente: é mapa de superfície para
// quem estiver de fora.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Não escreve nada.** Nem no disco, nem no banco, nem em plataforma
//     nenhuma. Só `existsSync`, `readdir` e `stat`.
//   • **Não sobe navegador — a menos que lhe peçam `?lancar=1`.** Subir o
//     Chromium é a única parte cara desta rota, e a pergunta padrão é anterior:
//     o binário existe? A prova de vida é opt-in, usa o MESMO `renderizarHtml`
//     da esteira e descarta os bytes.
//   • **Não devolve VALOR de variável de ambiente** — só se está definida e,
//     para as que são caminho, o caminho em si (que não é segredo). Rota de
//     admin que imprime segredo é vazamento por screenshot.

import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { segredoConfere } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";

/** Os candidatos de `lib/agency/design/renderizar.ts`, na MESMA ordem.
 *  Repetidos aqui de propósito: esta rota mede o mundo, não o código — se um
 *  dia as duas listas divergirem, é a divergência que queremos ver. */
const CANDIDATOS = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || "",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  // Não são candidatos do renderizador — são onde o apt do Debian/Ubuntu e o
  // Playwright costumam deixar o binário. Medir os dois separa "não instalou"
  // de "instalou noutro lugar".
  "/usr/bin/chromium-browser-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
].filter(Boolean);

/** Pastas onde um Chromium pode ter caído. Listadas rasas, um nível. */
function pastasDeInteresse(): string[] {
  const casa = process.env.HOME?.trim() || "/root";
  return [
    "/usr/bin",
    "/usr/lib/chromium",
    "/opt/pw-browsers",
    `${casa}/.cache/ms-playwright`,
    "/root/.cache/ms-playwright",
    "/app/pw-browsers",
    process.env.PLAYWRIGHT_BROWSERS_PATH?.trim() || "",
  ].filter(Boolean);
}

interface Caminho {
  caminho: string;
  existe: boolean;
  /** Tamanho em bytes, só quando existe. Binário de 0 byte é pacote de
   *  transição — "instalou" sem instalar nada. */
  bytes: number | null;
}

function olharCaminho(caminho: string): Caminho {
  try {
    if (!existsSync(caminho)) return { caminho, existe: false, bytes: null };
    const s = statSync(caminho);
    return { caminho, existe: true, bytes: s.isFile() ? s.size : null };
  } catch {
    return { caminho, existe: false, bytes: null };
  }
}

type Pasta =
  | { pasta: string; existe: true; entradas: string[]; truncado: boolean }
  | { pasta: string; existe: false; motivo: string };

async function olharPasta(pasta: string, filtro?: RegExp): Promise<Pasta> {
  try {
    const tudo = await readdir(pasta);
    const alvo = filtro ? tudo.filter((n) => filtro.test(n)) : tudo;
    // `/usr/bin` tem milhares de entradas: nunca despeje pasta inteira.
    return { pasta, existe: true, entradas: alvo.slice(0, 60), truncado: alvo.length > 60 };
  } catch (e) {
    return { pasta, existe: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Rota administrativa não configurada — defina CRON_SECRET" },
      { status: 503 },
    );
  }
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. O que o Playwright diz de si mesmo ────────────────────────────────
  // Separado em três perguntas porque as três falham por motivos diferentes: o
  // pacote não está instalado · está e não sabe dizer o caminho · sabe dizer e
  // o arquivo não existe. Colapsar as três em "false" é o que já custou dias.
  const playwright: {
    importou: boolean;
    erroDoImport: string | null;
    executablePath: string | null;
    executablePathExiste: boolean | null;
    erroDoExecutablePath: string | null;
  } = {
    importou: false,
    erroDoImport: null,
    executablePath: null,
    executablePathExiste: null,
    erroDoExecutablePath: null,
  };
  try {
    const { chromium } = await import("playwright");
    playwright.importou = true;
    try {
      const p = chromium.executablePath();
      playwright.executablePath = p || null;
      playwright.executablePathExiste = p ? existsSync(p) : null;
    } catch (e) {
      playwright.erroDoExecutablePath = e instanceof Error ? e.message : String(e);
    }
  } catch (e) {
    playwright.erroDoImport = e instanceof Error ? e.message : String(e);
  }

  // ── 2. Os caminhos candidatos, um a um ───────────────────────────────────
  const caminhos = CANDIDATOS.map(olharCaminho);

  // ── 3. As pastas onde ele poderia estar ──────────────────────────────────
  const pastas = await Promise.all(
    pastasDeInteresse().map((p) =>
      olharPasta(p, p === "/usr/bin" ? /chrom|chrome|headless/i : undefined),
    ),
  );

  // ── 4. As variáveis que mudam onde se procura. PRESENÇA, não valor —
  //      exceto as que SÃO caminho (caminho não é segredo).
  const ambiente = {
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? null,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD ?? null,
    HOME: process.env.HOME ?? null,
    PWD: process.cwd(),
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };

  // ── 5. A PROVA DE VIDA, e por que ela é OPT-IN ───────────────────────────
  //
  // "O arquivo existe" NÃO é "o navegador funciona". `/usr/bin/chromium` do
  // Debian é um script de 5 KB que faz exec no binário de verdade, e um wrapper
  // pode falhar por biblioteca faltando, por sandbox ou por versão de protocolo
  // — e `/api/capacidades` responderia `pronta: true` do mesmo jeito, porque
  // ela só sabe se o caminho existe.
  //
  // Isso importa em DINHEIRO: `produzirArtesPendentes` consulta
  // `renderizadorDisponivel()` e, se ela disser que sim, manda gerar a foto de
  // IA de cada peça — que custa, por peça — para só então tentar aplicar o
  // molde. Um "pronta: true" que mente vira fatura sem entregável.
  //
  // Fica atrás de `?lancar=1` porque subir um Chromium leva segundos e é a
  // única parte cara desta rota; e usa o MESMO `renderizarHtml` da esteira —
  // uma segunda implementação provaria outro caminho que não é o que produz a
  // peça do cliente. Nada é escrito: os bytes são contados e descartados.
  const querLancar = request.nextUrl.searchParams.get("lancar") === "1";
  let provaDeVida:
    | { tentado: false }
    | { tentado: true; ok: true; bytes: number; conferidos: number; ms: number }
    | { tentado: true; ok: false; motivo: string; erro: string; ms: number } = { tentado: false };
  if (querLancar) {
    const t0 = Date.now();
    const { renderizarHtml } = await import("@/lib/agency/design/renderizar");
    const r = await renderizarHtml({
      html: '<html><body style="margin:0;background:#111"><div data-papel="titulo" style="font:700 40px sans-serif;color:#fff">PROVA DE VIDA</div></body></html>',
      largura: 320,
      altura: 320,
      textosEsperados: ["PROVA DE VIDA"],
    });
    provaDeVida = r.ok
      ? { tentado: true, ok: true, bytes: r.bytes.length, conferidos: r.conferencia.conferidos, ms: Date.now() - t0 }
      : { tentado: true, ok: false, motivo: r.motivo, erro: r.erro, ms: Date.now() - t0 };
  }

  const achou = caminhos.find((c) => c.existe) ?? null;
  const veredito = achou
    ? `binário encontrado em ${achou.caminho}`
    : playwright.executablePathExiste
      ? `binário encontrado pelo Playwright em ${playwright.executablePath}`
      : "NENHUM binário de navegador existe neste contêiner";

  return NextResponse.json({
    veredito,
    // A mesma pergunta que `/api/capacidades` faz, respondida com o disco na mão.
    temNavegador: Boolean(achou) || playwright.executablePathExiste === true,
    playwright,
    provaDeVida,
    caminhos,
    pastas,
    ambiente,
    medidoEm: new Date().toISOString(),
  });
}
