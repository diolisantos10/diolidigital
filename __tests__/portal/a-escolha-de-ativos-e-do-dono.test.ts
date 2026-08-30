// A ESCOLHA DE ATIVOS É DO DONO — a rota do pior incidente, sem régua nenhuma.
//
// ═══ POR QUE ESTA ROTA IMPORTA MAIS QUE AS OUTRAS ════════════════════════════
//
// 06/08/2026: o CEO clicou "Conectar Facebook/Instagram" no portal. A Meta
// devolveu um token do USUÁRIO, e a agência passou a alcançar **14 contas de
// anúncio** e todas as Páginas/Instagram da vida dele — inclusive contas
// pessoais e de outros negócios. Ele autorizou UMA agência; a agência ganhou o
// resto junto.
//
// `/api/portal/meta-ativos` é a rota que nasceu desse incidente: o dono vê o
// que o acesso dele alcança e marca o que a agência pode usar. É a superfície
// mais perigosa do portal — e a varredura da Fase 1 encontrou **zero testes**
// referenciando ela.
//
// As três regras estão escritas no cabeçalho da rota. Este arquivo as
// EXERCITA, uma por uma.
//
// ⚠️ NENHUMA CHAMADA À META. Nada é publicado, nada é lido de rede. Custo
// US$ 0,00.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  metaConnection: { findFirst: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const resolvePortalClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ resolvePortalClient }));

const escolha = vi.hoisted(() => ({
  alcanceDoAcesso: vi.fn(),
  marcarAutorizados: vi.fn(),
  aplicarEscolha: vi.fn(),
}));
vi.mock("@/lib/integrations/meta/escolha-de-ativos", () => escolha);

const revogarAtivo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/ativos-autorizados", () => ({
  revogarAtivo,
  TIPOS_DE_ATIVO: ["page", "instagram", "adaccount"] as const,
}));

import { GET, POST, DELETE } from "@/app/api/portal/meta-ativos/route";

const DONO = { clientId: "cli-do-token", workspaceId: "ws-do-token" };
const OUTRO = { clientId: "cli-de-outra-pessoa", workspaceId: "ws-alheio" };

const url = (q = "") => `http://localhost/api/portal/meta-ativos${q}`;
// ⚠️ O `RequestInit` daqui é o do NEXT, não o do DOM — os dois têm o mesmo
// nome e `signal` incompatível, e foi exatamente esta a classe de erro que
// barrou o CI desta casa cinco vezes (e que a catraca nova pegou antes do
// push desta vez). Deriva-se do próprio construtor: nome que se digita
// envelhece; tipo derivado, não.
type IniciarPedido = ConstructorParameters<typeof NextRequest>[1];
const req = (q = "", init?: IniciarPedido) => new NextRequest(url(q), init);

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue(DONO);
  db.metaConnection.findFirst.mockResolvedValue({ id: "conn-do-dono" });
  escolha.alcanceDoAcesso.mockResolvedValue({
    ativos: [
      { tipo: "page", externalId: "pg-1", nome: "Padaria", autorizado: true },
      { tipo: "adaccount", externalId: "act_9", nome: "Conta pessoal", autorizado: false },
    ],
    lacunas: [],
  });
  escolha.marcarAutorizados.mockResolvedValue(undefined);
  escolha.aplicarEscolha.mockResolvedValue({ autorizados: 1, conexoes: 1, recusados: [] });
  revogarAtivo.mockResolvedValue({ removidos: 1, conexoes: 1 });
});

describe("REGRA 1 — derivação, nunca comparação: o dono vem do TOKEN", () => {
  it("GET: `clientId` e `workspaceId` de query NÃO entram na consulta", async () => {
    await GET(req(`?token=t&clientId=${OUTRO.clientId}&workspaceId=${OUTRO.workspaceId}`));

    // MUTAÇÃO QUE PROVA: leia `q.get("clientId")` em `dono()` e estas linhas
    // caem. Seria o incidente pela outra ponta: o portal de um cliente
    // listando o alcance de outro.
    expect(db.metaConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: DONO.workspaceId, clientId: DONO.clientId }),
      }),
    );
    expect(escolha.alcanceDoAcesso).toHaveBeenCalledWith(DONO.workspaceId, "conn-do-dono");
  });

  it("POST: a escolha é aplicada ao dono do token, com a conexão DELE", async () => {
    await POST(req(`?token=t&clientId=${OUTRO.clientId}`, {
      method: "POST",
      body: JSON.stringify({ ativos: [{ tipo: "page", externalId: "pg-1" }] }),
    }));
    expect(escolha.aplicarEscolha).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: DONO.workspaceId, clientId: DONO.clientId, connectionId: "conn-do-dono",
      autorizadoPor: `portal:${DONO.clientId}`,
    }));
  });

  it("DELETE: revoga no escopo do dono do token — o externalId da query não muda o dono", async () => {
    await DELETE(req(`?token=t&tipo=adaccount&externalId=act_9&clientId=${OUTRO.clientId}`, { method: "DELETE" }));
    expect(revogarAtivo).toHaveBeenCalledWith(DONO.workspaceId, DONO.clientId, "adaccount", "act_9");
  });

  it("sem token, os TRÊS verbos são 401 — e nada é lido nem escrito", async () => {
    resolvePortalClient.mockResolvedValue(null);
    for (const res of [
      await GET(req("?token=x")),
      await POST(req("?token=x", { method: "POST", body: "{}" })),
      await DELETE(req("?token=x&tipo=page&externalId=pg-1", { method: "DELETE" })),
    ]) {
      expect(res.status).toBe(401);
    }
    expect(escolha.alcanceDoAcesso).not.toHaveBeenCalled();
    expect(escolha.aplicarEscolha).not.toHaveBeenCalled();
    expect(revogarAtivo).not.toHaveBeenCalled();
  });
});

describe("REGRA 2 — sem conexão é 'conecte primeiro', nunca erro nem lista vazia mentirosa", () => {
  it("GET sem conexão de usuário devolve `semConexao`, e NÃO chama a Meta", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    const corpo = await (await GET(req("?token=t"))).json();
    expect(corpo.semConexao).toBe(true);
    expect(corpo.ativos).toEqual([]);
    // Lista vazia SEM o sinalizador diria ao cliente "você não tem nada" —
    // que é uma afirmação, e ele nem conectou ainda.
    expect(escolha.alcanceDoAcesso).not.toHaveBeenCalled();
  });

  it("POST sem conexão é 409 com frase de gente — a escolha não é aplicada no vazio", async () => {
    db.metaConnection.findFirst.mockResolvedValue(null);
    const res = await POST(req("?token=t", {
      method: "POST", body: JSON.stringify({ ativos: [{ tipo: "page", externalId: "pg-1" }] }),
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Conecte");
    expect(escolha.aplicarEscolha).not.toHaveBeenCalled();
  });

  it("a conexão lida é a de USUÁRIO e está CONECTADA — não uma de Página qualquer", async () => {
    await GET(req("?token=t"));
    expect(db.metaConnection.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ platform: "user", status: "connected" }),
    }));
  });
});

describe("REGRA 3 — o corpo do cliente não vira comando", () => {
  it("corpo que não é JSON não derruba a rota nem vira escolha", async () => {
    const res = await POST(req("?token=t", { method: "POST", body: "isto não é json" }));
    expect(res.status).toBe(200);
    // Pedidos vazios: nada é autorizado por engano.
    expect(escolha.aplicarEscolha).toHaveBeenCalledWith(expect.objectContaining({ pedidos: [] }));
  });

  it("`ativos` que não é lista vira lista vazia — nunca um objeto solto virando pedido", async () => {
    await POST(req("?token=t", { method: "POST", body: JSON.stringify({ ativos: { tipo: "page" } }) }));
    expect(escolha.aplicarEscolha).toHaveBeenCalledWith(expect.objectContaining({ pedidos: [] }));
  });

  it("DELETE com tipo desconhecido é 400 — allowlist, não texto livre", async () => {
    const res = await DELETE(req("?token=t&tipo=tudo&externalId=x", { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(revogarAtivo).not.toHaveBeenCalled();
  });

  it("DELETE sem externalId é 400 — revogar 'tudo' por omissão seria o pior desfecho", async () => {
    const res = await DELETE(req("?token=t&tipo=page", { method: "DELETE" }));
    expect(res.status).toBe(400);
    expect(revogarAtivo).not.toHaveBeenCalled();
  });
});
