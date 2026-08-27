// O caminho do PARCEIRO — modelo de parceria (03/08/2026).
// O parceiro não tem sessão: a única credencial dele é o token do portal, e o
// dono da conexão (clientId/workspace) é DERIVADO desse token — nunca aceito de
// query ou corpo. Estes testes são a trava disso.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Prisma mock ─────────────────────────────────────────────────────────────
const portalFindUnique = vi.hoisted(() => vi.fn());
const portalUpdate = vi.hoisted(() => vi.fn());
const clientRequestFindUnique = vi.hoisted(() => vi.fn());
const clientFindUnique = vi.hoisted(() => vi.fn());
const metaConnectionFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  prisma: {
    portalAccess: {
      findUnique: (...a: unknown[]) => portalFindUnique(...a),
      update: (...a: unknown[]) => portalUpdate(...a),
    },
    clientRequestDb: { findUnique: (...a: unknown[]) => clientRequestFindUnique(...a) },
    client: { findUnique: (...a: unknown[]) => clientFindUnique(...a) },
    metaConnection: { findMany: (...a: unknown[]) => metaConnectionFindMany(...a) },
  },
}));

// Parceiro NÃO tem sessão — o mock garante que nada aqui depende dela.
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => null),
}));

import { GET as connectParceiro } from "@/app/api/meta/connect-parceiro/route";
import { GET as listarConexoes } from "@/app/api/portal/conexoes/route";

const TOKEN = "tok-parceiro-1"; // segredo-permitido: rótulo de fixture, não credencial

/**
 * O `Host` vai junto porque TODO navegador manda `Host` — é obrigatório em
 * HTTP/1.1. Sem ele o fixture representa uma requisição que não existe no mundo,
 * e desde 06/08/2026 o código recusa montar endereço público a partir do nada
 * (`lib/http/endereco-publico.ts`): sem saber por onde o cliente chega, o
 * redirect sairia com o endereço interno do contêiner — foi o que abriu
 * `http://0.0.0.0:8080` na tela do CEO.
 */
function req(url: string): NextRequest {
  return new NextRequest(url, { headers: { host: new URL(url).host } });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Credenciais do app via env (o resolver cai no env quando o DB mock não
  // tem dbIntegrationConfig).
  process.env.META_APP_ID = "app-123";
  process.env.META_APP_SECRET = "secret-xyz";

  // Token válido → clientId cli-1 → workspace ws-1.
  portalFindUnique.mockResolvedValue({
    token: TOKEN, clientId: "cli-1", clientRequestId: null,
    revokedAt: null, expiresAt: null,
  });
  portalUpdate.mockResolvedValue({});
  clientFindUnique.mockResolvedValue({ id: "cli-1", workspaceId: "ws-1" });
});

describe("GET /api/meta/connect-parceiro — só entra com token de portal válido", () => {
  it("sem token → recusa legível, e a Meta nem é consultada", async () => {
    const res = await connectParceiro(req("http://localhost/api/meta/connect-parceiro"));
    await esperaFalhaLegivel(res);
    expect(portalFindUnique).not.toHaveBeenCalled();
  });

  it("token inexistente → recusa legível", async () => {
    portalFindUnique.mockResolvedValue(null);
    const res = await connectParceiro(req(`http://localhost/api/meta/connect-parceiro?token=falso`));
    await esperaFalhaLegivel(res);
  });

  it("token revogado → recusa legível", async () => {
    portalFindUnique.mockResolvedValue({
      token: TOKEN, clientId: "cli-1", clientRequestId: null,
      revokedAt: new Date(), expiresAt: null,
    });
    const res = await connectParceiro(req(`http://localhost/api/meta/connect-parceiro?token=${TOKEN}`));
    await esperaFalhaLegivel(res);
  });

  it("token válido mas sem cliente vinculado → recusa legível (conexão sem dono não existe)", async () => {
    portalFindUnique.mockResolvedValue({
      token: TOKEN, clientId: null, clientRequestId: null,
      revokedAt: null, expiresAt: null,
    });
    const res = await connectParceiro(req(`http://localhost/api/meta/connect-parceiro?token=${TOKEN}`));
    await esperaFalhaLegivel(res);
  });

  it("token válido → redirect para o diálogo da Meta com os três cookies", async () => {
    const res = await connectParceiro(req(`http://localhost/api/meta/connect-parceiro?token=${TOKEN}`));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("facebook.com");

    const cookies = res.headers.getSetCookie().join("; ");
    expect(cookies).toMatch(/_meta_oauth_state=[^;]+/);
    // O clientId do cookie é o DERIVADO do token — nunca veio de query.
    expect(cookies).toContain("_meta_oauth_client=cli-1");
    expect(cookies).toContain(`_meta_oauth_portal=${TOKEN}`);
  });

  it("clientId na query é IGNORADO — derivação, não comparação", async () => {
    const res = await connectParceiro(
      req(`http://localhost/api/meta/connect-parceiro?token=${TOKEN}&clientId=cli-de-outro`),
    );
    expect(res.headers.getSetCookie().join("; ")).toContain("_meta_oauth_client=cli-1");
  });
});

/** O popup NÃO pode devolver JSON: quem lê é o dono do negócio, numa janela
 *  pequena. E tem de avisar a aba que o abriu — falha invisível é o pior tipo
 *  de falha, porque o cliente conclui que o sistema não funciona e a agência
 *  nunca fica sabendo que ele tentou. (Raio-x de 05/08/2026.) */
async function esperaFalhaLegivel(res: Response): Promise<void> {
  expect(res.headers.get("content-type")).toContain("text/html");
  const corpo = await res.text();
  expect(corpo).toContain("postMessage");
  expect(corpo).toContain("meta_auth_error");
  expect(corpo).not.toContain('"error":"Acesso negado"');
}

describe("GET /api/portal/conexoes — a lista é SÓ do cliente do token", () => {
  beforeEach(() => {
    metaConnectionFindMany.mockResolvedValue([
      {
        id: "mc-1", platform: "facebook", name: "Página do Parceiro",
        status: "connected", connectedAt: new Date("2026-08-03T12:00:00Z"),
      },
      {
        id: "mc-2", platform: "user", name: "Acesso da conta Meta",
        status: "connected", connectedAt: new Date("2026-08-03T12:00:00Z"),
      },
    ]);
  });

  it("sem token → 401", async () => {
    const res = await listarConexoes(req("http://localhost/api/portal/conexoes"));
    expect(res.status).toBe(401);
    expect(metaConnectionFindMany).not.toHaveBeenCalled();
  });

  it("token inválido → 401, sem tocar no banco de conexões", async () => {
    portalFindUnique.mockResolvedValue(null);
    const res = await listarConexoes(req("http://localhost/api/portal/conexoes?token=falso"));
    expect(res.status).toBe(401);
    expect(metaConnectionFindMany).not.toHaveBeenCalled();
  });

  it("a consulta é filtrada pelo clientId DO TOKEN — mesmo se a query tentar outro", async () => {
    const res = await listarConexoes(
      req(`http://localhost/api/portal/conexoes?token=${TOKEN}&clientId=cli-de-outro`),
    );
    expect(res.status).toBe(200);
    const where = metaConnectionFindMany.mock.calls[0]![0].where;
    expect(where).toEqual({ workspaceId: "ws-1", clientId: "cli-1" });
  });

  // ⚠️ TRAVA REESCRITA EM 08/08/2026, com o motivo declarado.
  //
  // A letra antiga era um `toEqual` do objeto INTEIRO — ou seja, ela congelava
  // "a resposta tem exatamente estes cinco campos". Isso reprovava o conserto
  // do dia: a rota passou a devolver `estado`, `funcionouEm`, `falha` e
  // `registradaEm`, porque "Conectada · desde 03/08" era rótulo de um acesso
  // que ninguém tinha testado.
  //
  // O invariante nunca foi a lista de campos: é **nenhuma credencial sai
  // daqui**, e é isso que a trava passa a exigir — agora por proibição
  // explícita, que é mais forte, porque campo novo perigoso reprova mesmo que
  // alguém acrescente outros junto.
  it("devolve nome/plataforma/estado e NUNCA credencial; a pseudo-conexão 'user' fica de fora", async () => {
    const res = await listarConexoes(req(`http://localhost/api/portal/conexoes?token=${TOKEN}`));
    const json = await res.json();
    expect(json.conexoes).toHaveLength(1);
    expect(json.conexoes[0]).toMatchObject({
      id: "mc-1", platform: "facebook", name: "Página do Parceiro",
      status: "connected", connectedAt: "2026-08-03T12:00:00.000Z",
    });
    // Os três estados nascem aqui, no SERVIDOR — fonte única. Sem exame
    // registrado, o estado é "não verificada": nunca "viva".
    expect(json.conexoes[0].estado).toBe("nao_verificada");
    expect(json.conexoes[0].funcionouEm).toBeNull();
    const raw = JSON.stringify(json);
    expect(raw).not.toContain("accessToken");
    expect(raw).not.toContain("tokenHint");
    expect(raw).not.toContain("externalId");
    // O select da consulta também não pede credenciais ao banco.
    const select = metaConnectionFindMany.mock.calls[0]![0].select;
    expect(select.accessTokenEncrypted).toBeUndefined();
  });

  it("cliente sem conexão recebe lista vazia (o portal mostra o estado vazio)", async () => {
    metaConnectionFindMany.mockResolvedValue([]);
    const res = await listarConexoes(req(`http://localhost/api/portal/conexoes?token=${TOKEN}`));
    expect((await res.json()).conexoes).toEqual([]);
  });

  it("token vinculado só a uma solicitação resolve o cliente por ela", async () => {
    portalFindUnique.mockResolvedValue({
      token: TOKEN, clientId: null, clientRequestId: "req-1",
      revokedAt: null, expiresAt: null,
    });
    clientRequestFindUnique.mockResolvedValue({ clientId: "cli-1" });
    const res = await listarConexoes(req(`http://localhost/api/portal/conexoes?token=${TOKEN}`));
    expect(res.status).toBe(200);
    expect(metaConnectionFindMany.mock.calls[0]![0].where.clientId).toBe("cli-1");
  });
});
