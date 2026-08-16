import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ehNavegacaoCrossSite, deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

function req(secFetchSite?: string) {
  return {
    headers: {
      get: (name: string) => (name === "sec-fetch-site" ? secFetchSite ?? null : null),
    },
  };
}

describe("ehNavegacaoCrossSite", () => {
  it("cross-site → true", () => {
    expect(ehNavegacaoCrossSite(req("cross-site"))).toBe(true);
  });

  it("same-origin → false", () => {
    expect(ehNavegacaoCrossSite(req("same-origin"))).toBe(false);
  });

  it("same-site → false (subdomínio comprometido é outro risco, não este)", () => {
    expect(ehNavegacaoCrossSite(req("same-site"))).toBe(false);
  });

  it("ausente (navegador sem Fetch Metadata) → false, risco aceito e declarado", () => {
    expect(ehNavegacaoCrossSite(req(undefined))).toBe(false);
  });
});

// ─── deveBloquearMutacaoCrossSite — a trava da FAIXA 1 (POST que publica,
// dispara WhatsApp, liga campanha ou gasta a chave de IA da agência) ─────────
//
// Diferente de `ehNavegacaoCrossSite` (fail-OPEN quando os sinais faltam), esta
// função é fail-CLOSED: ausência total de sinal é tratada como requisição
// forjada, não como navegador legado — ver o cabeçalho de
// `lib/security/navegacao-cross-site.ts` para a medição que sustenta a escolha.
function reqCompleto(headers: Record<string, string | undefined>) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe("deveBloquearMutacaoCrossSite", () => {
  // `origemPublica` (usada por dentro) lê NEXT_PUBLIC_APP_URL/APP_URL do
  // ambiente — isolar aqui evita que outro arquivo de teste que sete essas
  // variáveis (ex.: __tests__/http/endereco-publico.test.ts) vaze um valor
  // inesperado para dentro destes casos.
  const antesAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const antesApiUrl = process.env.APP_URL;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
  });
  afterEach(() => {
    if (antesAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = antesAppUrl;
    if (antesApiUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = antesApiUrl;
  });

  it("Sec-Fetch-Site cross-site → bloqueia, mesmo com Origin batendo", () => {
    expect(
      deveBloquearMutacaoCrossSite(
        reqCompleto({ "sec-fetch-site": "cross-site", origin: "https://app.dioli.test", host: "app.dioli.test" }),
      ),
    ).toBe(true);
  });

  it("Sec-Fetch-Site same-origin → libera, mesmo sem Origin/Referer", () => {
    expect(deveBloquearMutacaoCrossSite(reqCompleto({ "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("Sec-Fetch-Site same-site → libera (subdomínio é outro risco)", () => {
    expect(deveBloquearMutacaoCrossSite(reqCompleto({ "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("sem Sec-Fetch-Site, Origin bate com o host da requisição → libera", () => {
    expect(
      deveBloquearMutacaoCrossSite(reqCompleto({ origin: "https://app.dioli.test", host: "app.dioli.test" })),
    ).toBe(false);
  });

  it("sem Sec-Fetch-Site, Origin de outro site → bloqueia (o caso clássico de CSRF)", () => {
    expect(
      deveBloquearMutacaoCrossSite(reqCompleto({ origin: "https://atacante.evil", host: "app.dioli.test" })),
    ).toBe(true);
  });

  it("sem Sec-Fetch-Site, Origin presente mas sem host/x-forwarded-host para comparar → bloqueia (não dá para confirmar)", () => {
    expect(deveBloquearMutacaoCrossSite(reqCompleto({ origin: "https://app.dioli.test" }))).toBe(true);
  });

  it("sem Sec-Fetch-Site e sem Origin, Referer bate → libera", () => {
    expect(
      deveBloquearMutacaoCrossSite(
        reqCompleto({ referer: "https://app.dioli.test/agency/campanhas", host: "app.dioli.test" }),
      ),
    ).toBe(false);
  });

  it("sem Sec-Fetch-Site e sem Origin, Referer de outro site → bloqueia", () => {
    expect(
      deveBloquearMutacaoCrossSite(reqCompleto({ referer: "https://atacante.evil/pagina-forjada", host: "app.dioli.test" })),
    ).toBe(true);
  });

  it("Referer malformado → bloqueia (não prova nada)", () => {
    expect(deveBloquearMutacaoCrossSite(reqCompleto({ referer: "não-é-uma-url", host: "app.dioli.test" }))).toBe(true);
  });

  it("porta diferente conta como origem diferente → bloqueia", () => {
    expect(
      deveBloquearMutacaoCrossSite(reqCompleto({ origin: "https://app.dioli.test:8443", host: "app.dioli.test" })),
    ).toBe(true);
  });

  it("os três ausentes (Sec-Fetch-Site, Origin, Referer) → bloqueia — o achado documentado no cabeçalho", () => {
    expect(deveBloquearMutacaoCrossSite(reqCompleto({ host: "app.dioli.test" }))).toBe(true);
  });

  it("x-forwarded-host (atrás do proxy do Railway) também serve de origem esperada", () => {
    expect(
      deveBloquearMutacaoCrossSite(
        reqCompleto({
          origin: "https://www.diolidigital.com.br",
          "x-forwarded-host": "www.diolidigital.com.br",
          "x-forwarded-proto": "https",
          host: "127.0.0.1:8080", // o endereço interno do contêiner — não é o que importa aqui
        }),
      ),
    ).toBe(false);
  });
});
