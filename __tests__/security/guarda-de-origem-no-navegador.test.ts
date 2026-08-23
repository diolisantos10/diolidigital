import http from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ehNavegacaoCrossSite } from "@/lib/security/navegacao-cross-site";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

// ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
//
// `ehNavegacaoCrossSite` (`lib/security/navegacao-cross-site.ts`) foi
// declarada "risco aceito e declarado" DUAS VEZES — uma no comentário do
// próprio arquivo, outra na descrição do teste unitário — e as duas vezes por
// LEITURA de spec (o Fetch Metadata do WHATWG), nunca por um navegador de
// verdade batendo num servidor de verdade. Leitura de spec e navegador real
// concordam quase sempre; a distância entre os dois é exatamente onde este
// tipo de trava mais falha, porque é a distância que ninguém mediu.
//
// Este arquivo EXERCITA a guarda: sobe dois servidores `node:http` em
// ORIGENS DIFERENTES de verdade (127.0.0.1 × localhost — cross-site medido,
// não suposto: nomes de host diferentes, mesmo que ambos caiam no loopback),
// abre o Chromium via Playwright, e olha o que REALMENTE chega no servidor —
// não o que a spec diz que deveria chegar.
//
// O que exercitar achou e a leitura não tinha como achar sozinha:
//   1. `Origin` não é "às vezes ausente" em GET de navegação — ele NUNCA
//      aparece, em nenhuma das seis variações abaixo (nem nas outras cinco
//      da rodada completa: `<img>`, fetch no-cors, iframe, form GET,
//      `location.href` — ver o cabeçalho de `navegacao-cross-site.ts`). Uma
//      guarda para esta fresta que tentasse usar `Origin` não teria dado
//      NENHUMA vez — não é escolha de estilo, é a única opção que existe.
//   2. `Referer` é o cabeçalho errado para confiar: o próprio atacante o
//      apaga com `rel="noreferrer"` — e mesmo com o Referer zerado,
//      `Sec-Fetch-Site` continuou `cross-site`. Só ele sobrevive à tentativa
//      de forjar.
//   3. O cookie `SameSite=Lax` desta casa REALMENTE chega nas quatro formas
//      de navegação de topo cruzada (link — com ou sem `rel=noreferrer`,
//      mesma mecânica —, `<meta refresh>`, form GET e `location.href`) — a
//      ameaça que a guarda existe para cobrir não é hipotética, o cookie
//      está no request quando chega no servidor.
//   4. O caminho legítimo (abrir o portal a partir do link do e-mail) não é
//      barrado: o fetch que a própria SPA dispara depois de carregada sai
//      como `same-origin`, não `cross-site` — não há regressão operacional
//      medida.
//
// Instrumento: Chromium 141.0.7390.37 (/opt/pw-browsers/chromium-1194),
// medido em 16/08/2026.

// ── ONDE O CHROMIUM MORA: PERGUNTA-SE, NÃO SE ADIVINHA ─────────────────────
//
// 23/08/2026: este arquivo reprovou TODA rodada de CI — e com ela travou o
// "Wait for CI" do Railway, ou seja, travou o deploy da casa inteira. A causa
// não era a guarda: era o caminho fixo abaixo, com a VERSÃO do Chromium dentro
// ("chromium-1194"). O `npx playwright install chromium` do `ci.yml` instala a
// versão que o Playwright atual pede (1228 hoje), o caminho 1194 deixa de
// existir, e o sentinela conclui — corretamente, pela regra que ele tem — que
// não há navegador. Máquina de dev antiga continuava verde por ainda ter a
// pasta velha: verde por herança, vermelho em qualquer máquina limpa.
//
// `lib/agency/design/renderizar.ts:185` já tinha escrito a lição desta casa com
// todas as letras: *"caminho fixo com versão dentro é dívida com data
// marcada"*. Aqui a dívida venceu. A ordem agora é a mesma de lá — PERGUNTAR
// ao Playwright onde ele instalou, e só então cair para os caminhos conhecidos.
//
// ⛔ O SENTINELA NÃO FOI AFROUXADO: se não houver navegador em lugar nenhum, a
// rodada continua reprovando. O que mudou é que ele passou a achar o navegador
// que o CI de fato instala — antes ele reprovava com o Chromium ali do lado.
const CAMINHOS_CONHECIDOS = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || "",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].filter(Boolean);

function acharChromium(): string | null {
  try {
    // `require` síncrono de propósito: a decisão "há prova ou não há" é tomada
    // no carregamento do módulo, antes de qualquer `it`, e um `await import`
    // não serve nesse ponto.
    const { chromium } = createRequire(import.meta.url)("playwright") as typeof import("playwright");
    const dele = chromium.executablePath();
    if (dele && existsSync(dele)) return dele;
  } catch {
    // Sem playwright ou sem registro: cai para os caminhos conhecidos abaixo.
  }
  for (const c of CAMINHOS_CONHECIDOS) if (existsSync(c)) return c;
  return null;
}

const CAMINHO_CHROMIUM = acharChromium();

// ── S5-style: GATE QUE NÃO REGISTRA RESULTADO REPROVA (ver
// __tests__/design/molde-render.test.ts, linhas ~39-70, para o precedente
// desta casa) ────────────────────────────────────────────────────────────
//
// Sem o Chromium, esta prova simplesmente não aconteceu nesta máquina. Isso
// não pode virar verde por omissão: ou o navegador está aqui, ou a ausência
// dele foi DECLARADA com GUARDA_SEM_NAVEGADOR=1 — e mesmo declarada, a
// rodada registra que a prova não existiu, não finge que existiu.
const NAVEGADOR_DISPONIVEL = CAMINHO_CHROMIUM !== null;
const DECLARADO_SEM_NAVEGADOR = process.env.GUARDA_SEM_NAVEGADOR === "1";
const provaNoNavegador = NAVEGADOR_DISPONIVEL ? it : it.skip;

describe("a prova da guarda de origem REGISTRA resultado — não some em silêncio", () => {
  it("ou o Chromium está aqui, ou a ausência dele está declarada", () => {
    expect(
      NAVEGADOR_DISPONIVEL || DECLARADO_SEM_NAVEGADOR,
      "Sem Chromium, a guarda de Sec-Fetch-Site NUNCA foi exercitada contra um navegador de " +
        "verdade nesta máquina — só contra requisições forjadas à mão. Isto não pode passar como " +
        "verde: instale o navegador (`npx playwright install chromium`) ou declare a lacuna com " +
        "GUARDA_SEM_NAVEGADOR=1, e então a rodada registra que a prova não existiu.",
    ).toBe(true);
  });
});

// ⚠️ A LACUNA QUE FICA, DITA E NÃO CONTORNADA: só há Chromium instalado nesta
// máquina (/opt/pw-browsers). Não há WebKit nem Firefox. O caso "navegador
// sem Fetch Metadata" (Safari < 16.4 de verdade) NÃO foi reproduzido em
// NAVEGADOR por este arquivo — só existe, aqui e no teste unitário irmão,
// como cliente HTTP que simplesmente não manda o cabeçalho. Fechar essa
// lacuna de verdade exige `npx playwright install webkit` (ou um Safari
// real) rodando o mesmo roteiro abaixo contra os dois servidores.

type Captura = { url: string; headers: http.IncomingHttpHeaders };

/** Traduz os headers crus do `node:http` para a interface que
 *  `ehNavegacaoCrossSite` espera — a MESMA função, sem stub. */
function paraGuarda(headers: http.IncomingHttpHeaders) {
  return {
    headers: {
      get: (name: string): string | null => {
        const v = headers[name.toLowerCase()];
        if (Array.isArray(v)) return v[0] ?? null;
        return v ?? null;
      },
    },
  };
}

function cookieDoPortalChegou(headers: http.IncomingHttpHeaders): boolean {
  const bruto = headers.cookie;
  if (!bruto) return false;
  return bruto.split(";").some((par) => par.trim().startsWith(`${PORTAL_COOKIE}=`));
}

describe("a guarda de Sec-Fetch-Site contra um Chromium de verdade", () => {
  let servidorCasa: http.Server;
  let servidorAtacante: http.Server;
  const capturasCasa: Captura[] = [];
  let casaBase = "";
  let atacanteBase = "";
  let browser: import("playwright").Browser;
  let context: import("playwright").BrowserContext;

  function ultimaCaptura(caminho: string): Captura {
    const achados = capturasCasa.filter((c) => c.url === caminho);
    const cap = achados[achados.length - 1];
    if (!cap) {
      throw new Error(
        `nenhuma requisição capturada em "${caminho}" — a navegação não chegou ao servidor da casa.`,
      );
    }
    return cap;
  }

  beforeAll(async () => {
    if (!NAVEGADOR_DISPONIVEL) return;

    // ── "A CASA": bind explícito em 127.0.0.1 ──────────────────────────────
    servidorCasa = http.createServer((req, res) => {
      const url = req.url ?? "/";
      capturasCasa.push({ url, headers: { ...req.headers } });
      if (url === "/pagina-interna") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><html><body><a id="ir" href="/alvo-interno">ir</a></body></html>`);
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><body>ok</body></html>`);
    });
    await new Promise<void>((resolve) => servidorCasa.listen(0, "127.0.0.1", resolve));
    const portaCasa = (servidorCasa.address() as AddressInfo).port;
    casaBase = `http://127.0.0.1:${portaCasa}`;

    // ── "O ATACANTE": outro host (localhost) — origem DIFERENTE de 127.0.0.1,
    // medido, não suposto. Escuta em todas as interfaces para responder tanto
    // a 127.0.0.1 quanto a localhost sem depender de qual delas o DNS local
    // resolve primeiro. ──────────────────────────────────────────────────────
    servidorAtacante = http.createServer((req, res) => {
      const url = req.url ?? "/";
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (url === "/link-cruzado") {
        res.end(`<!doctype html><html><body><a id="ir" href="${casaBase}/alvo">ir</a></body></html>`);
        return;
      }
      if (url === "/link-noreferrer") {
        res.end(
          `<!doctype html><html><body><a id="ir" rel="noreferrer" href="${casaBase}/alvo-noref">ir</a></body></html>`,
        );
        return;
      }
      if (url === "/meta-refresh") {
        res.end(
          `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${casaBase}/alvo-meta"></head><body>refresh</body></html>`,
        );
        return;
      }
      res.end(`<!doctype html><html><body>atacante</body></html>`);
    });
    await new Promise<void>((resolve) => servidorAtacante.listen(0, resolve));
    const portaAtacante = (servidorAtacante.address() as AddressInfo).port;
    atacanteBase = `http://localhost:${portaAtacante}`;

    const { chromium } = await import("playwright");
    browser = await chromium.launch({ executablePath: CAMINHO_CHROMIUM!, args: ["--no-sandbox"] });
    context = await browser.newContext();
    // O MESMO cookie da casa: dioli_portal, httpOnly, SameSite=Lax — simula
    // uma sessão de portal já aberta antes do ataque.
    await context.addCookies([
      {
        name: PORTAL_COOKIE,
        value: "medindo-guarda-de-origem",
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  });

  afterAll(async () => {
    if (!NAVEGADOR_DISPONIVEL) return;
    await context?.close();
    await browser?.close();
    await new Promise<void>((resolve) => servidorCasa.close(() => resolve()));
    await new Promise<void>((resolve) => servidorAtacante.close(() => resolve()));
  });

  // ── METADE 1: NÃO INVENTA PROBLEMA NO CASO LIMPO ──────────────────────────
  describe("metade 1 — navegação legítima não é barrada", () => {
    provaNoNavegador(
      "URL digitada direto: Sec-Fetch-Site = none, Origin ausente, ehNavegacaoCrossSite = false",
      async () => {
        const page = await context.newPage();
        await page.goto(`${casaBase}/direto`);
        const cap = ultimaCaptura("/direto");
        expect(cap.headers["sec-fetch-site"]).toBe("none");
        expect(cap.headers.origin).toBeUndefined();
        expect(ehNavegacaoCrossSite(paraGuarda(cap.headers))).toBe(false);
        await page.close();
      },
      30_000,
    );

    provaNoNavegador(
      "fetch da própria casa: Sec-Fetch-Site = same-origin, Origin ausente, ehNavegacaoCrossSite = false",
      async () => {
        const page = await context.newPage();
        await page.goto(`${casaBase}/pagina-interna`);
        await page.evaluate(() => fetch("/alvo-fetch").then(() => undefined));
        const cap = ultimaCaptura("/alvo-fetch");
        expect(cap.headers["sec-fetch-site"]).toBe("same-origin");
        expect(cap.headers.origin).toBeUndefined();
        expect(ehNavegacaoCrossSite(paraGuarda(cap.headers))).toBe(false);
        await page.close();
      },
      30_000,
    );

    provaNoNavegador(
      "navegação interna (link da própria casa): Sec-Fetch-Site = same-origin, ehNavegacaoCrossSite = false",
      async () => {
        const page = await context.newPage();
        await page.goto(`${casaBase}/pagina-interna`);
        await Promise.all([page.waitForURL(`${casaBase}/alvo-interno`), page.click("#ir")]);
        const cap = ultimaCaptura("/alvo-interno");
        expect(cap.headers["sec-fetch-site"]).toBe("same-origin");
        expect(cap.headers.origin).toBeUndefined();
        expect(ehNavegacaoCrossSite(paraGuarda(cap.headers))).toBe(false);
        // A sessão continua andando junto — não é a guarda que segura aqui.
        expect(cookieDoPortalChegou(cap.headers)).toBe(true);
        await page.close();
      },
      30_000,
    );
  });

  // ── METADE 2: BARRA O PLANTADO ────────────────────────────────────────────
  describe("metade 2 — navegação cross-site plantada é detectada", () => {
    provaNoNavegador(
      "link de outro site (<a href>): Sec-Fetch-Site = cross-site, cookie Lax chega, ehNavegacaoCrossSite = true",
      async () => {
        const page = await context.newPage();
        await page.goto(`${atacanteBase}/link-cruzado`);
        await Promise.all([page.waitForURL(`${casaBase}/alvo`), page.click("#ir")]);
        const cap = ultimaCaptura("/alvo");
        expect(cap.headers["sec-fetch-site"]).toBe("cross-site");
        expect(cap.headers.origin).toBeUndefined();
        expect(cap.headers.referer).toContain(atacanteBase);
        // A AMEAÇA REAL: o cookie da sessão do portal chega mesmo vindo de
        // outro site. É exatamente essa fresta que a guarda existe para
        // cobrir — sem ela, esta requisição pareceria uma navegação normal.
        expect(cookieDoPortalChegou(cap.headers)).toBe(true);
        expect(ehNavegacaoCrossSite(paraGuarda(cap.headers))).toBe(true);
        await page.close();
      },
      30_000,
    );

    provaNoNavegador(
      "link com rel=noreferrer: Referer some, mas Sec-Fetch-Site continua cross-site — ehNavegacaoCrossSite = true",
      async () => {
        const page = await context.newPage();
        await page.goto(`${atacanteBase}/link-noreferrer`);
        await Promise.all([page.waitForURL(`${casaBase}/alvo-noref`), page.click("#ir")]);
        const cap = ultimaCaptura("/alvo-noref");
        // O atacante CONSEGUE apagar o Referer — é por isso que Referer não
        // é o sinal em que esta guarda confia.
        expect(cap.headers.referer).toBeUndefined();
        expect(cap.headers.origin).toBeUndefined();
        expect(cap.headers["sec-fetch-site"]).toBe("cross-site");
        expect(cookieDoPortalChegou(cap.headers)).toBe(true);
        expect(ehNavegacaoCrossSite(paraGuarda(cap.headers))).toBe(true);
        await page.close();
      },
      30_000,
    );

    provaNoNavegador(
      "<meta refresh> de outro site: Sec-Fetch-Site = cross-site, cookie Lax chega, ehNavegacaoCrossSite = true",
      async () => {
        const page = await context.newPage();
        await page.goto(`${atacanteBase}/meta-refresh`);
        await page.waitForURL(`${casaBase}/alvo-meta`, { timeout: 10_000 });
        const cap = ultimaCaptura("/alvo-meta");
        expect(cap.headers["sec-fetch-site"]).toBe("cross-site");
        expect(cap.headers.origin).toBeUndefined();
        expect(cookieDoPortalChegou(cap.headers)).toBe(true);
        expect(ehNavegacaoCrossSite(paraGuarda(cap.headers))).toBe(true);
        await page.close();
      },
      30_000,
    );
  });

  // ── OS FATOS QUE JUSTIFICAM A ESCOLHA DO CABEÇALHO ────────────────────────
  provaNoNavegador(
    "Origin nunca apareceu em nenhuma das seis variações medidas neste arquivo",
    async () => {
      const caminhos = ["/direto", "/alvo-fetch", "/alvo-interno", "/alvo", "/alvo-noref", "/alvo-meta"];
      for (const caminho of caminhos) {
        expect(ultimaCaptura(caminho).headers.origin, `Origin apareceu em ${caminho}`).toBeUndefined();
      }
    },
    30_000,
  );

  // ── A PERGUNTA CARA: A GUARDA DERRUBA OPERAÇÃO LEGÍTIMA? ──────────────────
  //
  // O link do portal viaja por e-mail (lib/agency/esteira/orcamento-do-briefing.ts
  // monta a URL; lib/email/templates.ts monta o corpo). Abrir esse link a
  // partir de um webmail É navegação cruzada até a PÁGINA do portal — mas o
  // teste acima já mostra que o fetch disparado DEPOIS de carregada, pela
  // própria SPA, sai como same-origin (é o caso "fetch da própria casa" acima:
  // mesmo princípio, mesma origem). Não há regressão operacional medida: a
  // guarda intercepta a navegação de TOPO forjada, não a leitura legítima que
  // acontece depois que a página do próprio site já carregou.
  provaNoNavegador(
    "chegar pela navegação e então operar por dentro da própria casa não aciona a guarda",
    async () => {
      // Reencena o caminho do e-mail: chegada por navegação cruzada até uma
      // página da CASA (o clique em "/alvo" acima já prova isto: mesmo vindo
      // de outro site, uma vez que a página carregou, o que ela faz por
      // dentro fala com o próprio host). Confirmamos aqui o segundo passo:
      // uma vez na página, o fetch interno da SPA é same-origin.
      const page = await context.newPage();
      await page.goto(`${atacanteBase}/link-cruzado`);
      await Promise.all([page.waitForURL(`${casaBase}/alvo`), page.click("#ir")]);
      await page.evaluate(() => fetch("/alvo-fetch").then(() => undefined));
      const cap = ultimaCaptura("/alvo-fetch");
      expect(cap.headers["sec-fetch-site"]).toBe("same-origin");
      expect(ehNavegacaoCrossSite(paraGuarda(cap.headers))).toBe(false);
      await page.close();
    },
    30_000,
  );
});
