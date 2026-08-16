// A ROTA REAL, não um servidor-eco — o conserto da reprovação de `qualidade`.
//
// `__tests__/security/guarda-de-origem-no-navegador.test.ts` prova que o
// Chromium manda os cabeçalhos que este arquivo assume. Ali o comentário
// dizia "contra a rota real (banco de verdade)" mas o teste só fala com um
// servidor `node:http` que ecoa headers — nunca importou um handler desta
// casa. Este arquivo fecha essa distância: importa os handlers REAIS
// (`GET` de `app/api/portal/messages/route.ts`, `POST` de
// `app/api/portal/messages/suggest/route.ts`) e alimenta cada um com os
// CONJUNTOS DE CABEÇALHOS EXATOS capturados do navegador — a mesma tabela
// que está no cabeçalho da ficha de despacho, medida em 16/08/2026 com
// Chromium 141.0.7390.37 (Playwright, /opt/pw-browsers) contra dois
// servidores em origens diferentes de verdade, e (para a metade fail-closed)
// com login REAL (`master@dioli.studio`) contra `/api/portal/messages/suggest`.
//
// Padrão de mock copiado de `__tests__/portal/csrf-marcar-lida.test.ts`
// (`vi.hoisted` + `vi.mock` do prisma, `requireSession`, `validatePortalAccess`)
// — só os conjuntos de cabeçalhos mudam, para virarem os medidos, não os
// mínimos que bastavam para exercitar a função isolada.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  client: { findFirst: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET } from "@/app/api/portal/messages/route";
import { POST as suggestPOST } from "@/app/api/portal/messages/suggest/route";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

const MSG_DA_EQUIPE = {
  id: "m1", authorRole: "team", authorName: "Equipe Dioli",
  body: "Enviamos a arte.", createdAt: new Date(),
};

// ─── PARTE A — GET /api/portal/messages, tabela "GET de navegação" ─────────
//
// Cliente entra por token de portal (cookie httpOnly) — o caminho público de
// verdade que `ehNavegacaoCrossSite` protege dentro da rota.
describe("guarda de origem contra a ROTA REAL — GET /api/portal/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validatePortalAccess.mockResolvedValue({
      valid: true,
      record: { clientId: "cli1", clientRequestId: null },
    });
    db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr1" }]);
    db.portalMessage.findMany.mockResolvedValue([MSG_DA_EQUIPE]);
    db.portalMessage.updateMany.mockResolvedValue({ count: 1 });
  });

  /** Monta o request com o CONJUNTO EXATO de cabeçalhos capturado do
   *  navegador para cada linha da tabela — nunca só `sec-fetch-site` isolado. */
  function requisicaoMedida(linha: {
    secFetchSite?: string;
    referer?: string;
  }): NextRequest {
    const headers: Record<string, string> = {
      cookie: `${PORTAL_COOKIE}=tok-cookie-real`,
    };
    // Origin: NUNCA aparece em GET de navegação — medido nos 11 casos do
    // teste-irmão contra o Chromium. Não entra aqui de propósito.
    if (linha.secFetchSite) headers["sec-fetch-site"] = linha.secFetchSite;
    if (linha.referer) headers["referer"] = linha.referer;
    return new NextRequest("http://localhost:3001/api/portal/messages", { headers });
  }

  const CASOS_QUE_MARCAM = [
    { nome: "URL digitada", secFetchSite: "none" },
    { nome: "navegação interna da casa", secFetchSite: "same-origin", referer: "http://localhost:3001/portal" },
    { nome: "fetch do SPA da casa", secFetchSite: "same-origin", referer: "http://localhost:3001/portal" },
  ];

  const CASOS_QUE_NAO_MARCAM = [
    { nome: "link de outro site", secFetchSite: "cross-site", referer: "http://atacante.evil/pagina" },
    { nome: "link com rel=noreferrer", secFetchSite: "cross-site" }, // Referer apagado pelo atacante
    { nome: "<meta refresh> de outro site", secFetchSite: "cross-site", referer: "http://atacante.evil/pagina" },
  ];

  for (const caso of CASOS_QUE_MARCAM) {
    it(`MARCA como lida (rota real): ${caso.nome}`, async () => {
      const res = await GET(requisicaoMedida(caso));
      expect(res.status).toBe(200);
      const corpo = await res.json();
      // A leitura nunca regride — as três variações da tabela devolvem as
      // mensagens de qualquer forma.
      expect(corpo.messages).toHaveLength(1);
      expect(db.portalMessage.updateMany).toHaveBeenCalledTimes(1);
    });
  }

  for (const caso of CASOS_QUE_NAO_MARCAM) {
    it(`NÃO marca como lida, mas a leitura não regride (rota real): ${caso.nome}`, async () => {
      const res = await GET(requisicaoMedida(caso));
      expect(res.status).toBe(200);
      const corpo = await res.json();
      expect(corpo.messages).toHaveLength(1);
      expect(db.portalMessage.updateMany).not.toHaveBeenCalled();
    });
  }
});

// ─── PARTE B — POST /api/portal/messages/suggest, a metade fail-CLOSED ─────
//
// `deveBloquearMutacaoCrossSite` contra uma rota real da FAIXA 1 (gasta a
// chave de IA da agência a cada chamada). Sessão de equipe válida mockada em
// `requireSession` — a guarda de origem é a SEGUNDA trava, não substitui a
// sessão. `prisma.client.findFirst` devolve `null` nos dois casos que passam
// pela guarda, o que os leva ao 404 "Cliente não encontrado" — não ao 403 da
// guarda de origem, que é o que este bloco mede.
describe("guarda de origem contra a ROTA REAL — POST /api/portal/messages/suggest (fail-closed)", () => {
  const antesAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const antesApiUrl = process.env.APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    // `origemPublica` lê estas duas do ambiente antes de cair para o `host`
    // do request — isolar evita que outro arquivo de teste vaze um valor.
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    requireSession.mockResolvedValue({
      session: { workspaceId: "ws1", role: "master", name: "Master" },
      error: null,
    });
    db.client.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    if (antesAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = antesAppUrl;
    if (antesApiUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = antesApiUrl;
  });

  function reqMedido(headers: Record<string, string>): NextRequest {
    return new NextRequest("http://localhost:3001/api/portal/messages/suggest", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "dioli_session=tok-sessao-real", ...headers },
      body: JSON.stringify({ clientId: "cli-x" }),
    });
  }

  it("POST do SPA da própria casa (same-origin, Origin PRESENTE e batendo — medido): passa pela guarda, chega ao 404 do handler, não ao 403 da guarda", async () => {
    const res = await suggestPOST(
      reqMedido({
        "sec-fetch-site": "same-origin",
        origin: "http://localhost:3001",
        host: "localhost:3001",
        "x-forwarded-proto": "http",
      }),
    );
    const status = res.status;
    const corpo = await res.json();
    expect(status).toBe(404);
    expect(corpo.error).toBe("Cliente não encontrado");
  });

  it("cliente HTTP com cookie válido, sem os três cabeçalhos (Sec-Fetch-Site/Origin/Referer ausentes): 403 'Origem não confiável'", async () => {
    const res = await suggestPOST(reqMedido({ host: "localhost:3001", "x-forwarded-proto": "http" }));
    const status = res.status;
    const corpo = await res.json();
    expect(status).toBe(403);
    expect(corpo.error).toBe("Origem não confiável para esta ação.");
  });

  it("o mesmo cliente HTTP declarando Origin correto (sem Sec-Fetch-Site): passa pela guarda, chega ao 404 do handler", async () => {
    // `x-forwarded-proto: http` é o que faz `origemPublica` devolver
    // "http://localhost:3001" em vez do "https://" default — sem ele o
    // Origin batendo ainda seria recusado por descasar protocolo, e o teste
    // provaria o efeito errado (guarda "vazando" por engano de fixture, não
    // por comportamento real).
    const res = await suggestPOST(
      reqMedido({ origin: "http://localhost:3001", host: "localhost:3001", "x-forwarded-proto": "http" }),
    );
    const status = res.status;
    const corpo = await res.json();
    expect(status).toBe(404);
    expect(corpo.error).toBe("Cliente não encontrado");
  });
});
