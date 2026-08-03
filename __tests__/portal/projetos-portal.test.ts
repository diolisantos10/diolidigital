// A fronteira do portal na aba Projetos (correção do lançamento da Foocci).
//
// O buraco: cliente criado DIRETO (sem ClientRequestDb) via a aba Projetos
// vazia — tudo derivava de clientRequestId, e o projeto/calendário dele viviam
// por clientId. A rota /api/portal/projetos fecha isso, e estes testes guardam
// as três regras que não podem regredir:
//   1. o dono vem SEMPRE do token — clientId de query não entra;
//   2. cliente A nunca vê projeto de cliente B;
//   3. nada interno atravessa (proposalPricing, executionError, post "interno").

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
}));
const resolvePortalClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ resolvePortalClient }));

import { GET } from "@/app/api/portal/projetos/route";

// O que o Prisma devolve com o `select` da rota — de propósito SEM os campos
// internos: o select explícito é a trava, e o teste de payload confirma.
const PROJETO_NO_BANCO = {
  id: "p1", name: "Foocci — Lançamento (donos de restaurante)",
  goal: "Lançar o app para donos de restaurante",
  createdAt: new Date("2026-08-01T10:00:00Z"),
  presentedAt: null, clientApprovedAt: null, directionApprovedAt: new Date("2026-08-02T10:00:00Z"),
};

const POST_NO_BANCO = {
  id: "sp1", caption: "Seu cardápio no piloto automático",
  networks: '["instagram"]', format: "carousel", pillar: "produto",
  mediaUrl: "/api/media/abc", scheduledFor: new Date("2026-08-10T12:00:00Z"), status: "scheduled",
};

function req(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue({ clientId: "cli-foocci", workspaceId: "ws1" });
  db.project.findMany.mockResolvedValue([PROJETO_NO_BANCO]);
  db.socialPost.findMany.mockResolvedValue([POST_NO_BANCO]);
});

describe("GET /api/portal/projetos — o dono vem do token", () => {
  it("sem token: 400, sem tocar no banco", async () => {
    const res = await GET(req("http://localhost/api/portal/projetos"));
    expect(res.status).toBe(400);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("token inválido: 403, sem tocar no banco", async () => {
    resolvePortalClient.mockResolvedValue(null);
    const res = await GET(req("http://localhost/api/portal/projetos?token=tok-roubado"));
    expect(res.status).toBe(403);
    expect(db.project.findMany).not.toHaveBeenCalled();
  });

  it("a consulta usa o clientId DERIVADO do token — cliente A nunca vê projeto de B", async () => {
    // O atacante manda o clientId de outro cliente na query; a rota ignora.
    await GET(req("http://localhost/api/portal/projetos?token=tok-a&clientId=cli-do-outro"));
    expect(resolvePortalClient).toHaveBeenCalledWith("tok-a");
    expect(db.project.findMany.mock.calls[0]![0].where).toEqual({ clientId: "cli-foocci" });
    expect(db.socialPost.findMany.mock.calls[0]![0].where).toMatchObject({ clientId: "cli-foocci" });
  });

  it("o calendário filtra por visibility 'compartilhado' — interno não sai nem por engano", async () => {
    await GET(req("http://localhost/api/portal/projetos?token=tok-a"));
    expect(db.socialPost.findMany.mock.calls[0]![0].where).toEqual({
      clientId: "cli-foocci", visibility: "compartilhado",
    });
  });
});

describe("GET /api/portal/projetos — o que o cliente recebe", () => {
  it("projeto vem com nome, objetivo, etapa legível em português e criadoEm", async () => {
    const res = await GET(req("http://localhost/api/portal/projetos?token=tok-a"));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.projetos).toHaveLength(1);
    expect(json.projetos[0]).toMatchObject({
      id: "p1",
      nome: "Foocci — Lançamento (donos de restaurante)",
      objetivo: "Lançar o app para donos de restaurante",
      etapa: "Em produção",
    });
    expect(json.projetos[0].criadoEm).toBeTruthy();
  });

  it("a etapa é derivada dos carimbos, nunca do stage escrito à mão", async () => {
    db.project.findMany.mockResolvedValue([
      { ...PROJETO_NO_BANCO, id: "p2", presentedAt: new Date(), clientApprovedAt: null },
      { ...PROJETO_NO_BANCO, id: "p3", presentedAt: new Date(), clientApprovedAt: new Date() },
    ]);
    const res = await GET(req("http://localhost/api/portal/projetos?token=tok-a"));
    const json = await res.json();
    expect(json.projetos[0].etapa).toBe("Esperando a sua aprovação");
    expect(json.projetos[1].etapa).toBe("Aprovado por você — colocando no ar");
  });

  it("NENHUM campo interno atravessa: proposalPricing, custo e erro de execução não existem no payload", async () => {
    const res = await GET(req("http://localhost/api/portal/projetos?token=tok-a"));
    const texto = JSON.stringify(await res.json());
    // Ausência das CHAVES, não só de valores — null ainda confirmaria que existe.
    for (const interno of ["proposalPricing", "proposalScope", "proposalStatus", "executionError", "executionStatus", "agents", "stage", "workspaceId", "scriptJson"]) {
      expect(texto).not.toContain(interno);
    }
  });

  it("o post do calendário sai com o essencial + status legível, sem roteiro interno", async () => {
    const res = await GET(req("http://localhost/api/portal/projetos?token=tok-a"));
    const json = await res.json();
    expect(json.calendario).toHaveLength(1);
    expect(json.calendario[0]).toMatchObject({
      id: "sp1", pillar: "produto", format: "carousel",
      mediaUrl: "/api/media/abc", status: "scheduled", statusLegivel: "Programado",
      networks: ["instagram"],
    });
    expect(Object.keys(json.calendario[0])).not.toContain("script");
  });

  it("cliente sem projeto ainda: lista vazia, não erro — o portal mostra o estado honesto", async () => {
    db.project.findMany.mockResolvedValue([]);
    db.socialPost.findMany.mockResolvedValue([]);
    const res = await GET(req("http://localhost/api/portal/projetos?token=tok-a"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.projetos).toEqual([]);
    expect(json.calendario).toEqual([]);
  });

  it("banco fora do ar: 503 com mensagem de gente, sem vazar detalhe técnico", async () => {
    db.project.findMany.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5"));
    const res = await GET(req("http://localhost/api/portal/projetos?token=tok-a"));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("ECONNREFUSED");
  });
});
