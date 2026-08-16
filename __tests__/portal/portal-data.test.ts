// A fronteira do portal nos cards de aprovação (achados A1 e A2, Hub).
//
// A2: o fallback `leftoverContent.shift()` casava conteúdo por SOBRA DE FILA —
// o cliente podia aprovar um card lendo o texto de OUTRA entrega. Morreu:
// casamento por FK à versão ou por agente dono; sem casamento, card sem corpo.
// A1: o filtro de preço era uma regex que "USD 500" e "3k" atravessavam.
// Visibilidade: entrega "interno" nunca abastece card de portal.

import { escopoFalso } from "../_stubs/escopo-do-token";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  // rodada 8: a cerca do filho apura evidência de troca de dono em quatro
  // tabelas (ver `solicitacao-que-mudou-de-dono`). Sem estes mocks a apuração
  // falha e FECHA — que é o certo, mas deixa a suíte sem exercitar o caminho
  // limpo.
  portalMessage: { findMany: vi.fn() },
  portalAccess: { findMany: vi.fn() },
  clientRequestDb: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  brainArtifact: { findMany: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
  project: { findFirst: vi.fn(), findMany: vi.fn() },
  deliverable: { findMany: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());
// `escopoDoToken` (rodada 3): a trava do ponteiro andado mudou de casa.
const escopoDoToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess, escopoDoToken }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET } from "@/app/api/brain/portal-data/route";

const SOLICITACAO = {
  id: "cr1", businessName: "Padaria do João", status: "active", segment: "alimentação",
  services: '["social"]', objectives: '["vender mais"]', briefingJson: "{}",
  createdAt: new Date(),
};

function aprovacao(over: Record<string, unknown> = {}) {
  return {
    id: "ap1", department: "social-media", status: "pending", reviewedAt: null,
    reviewNote: null, questionOpenedAt: null, deliverableVersion: null, comments: [],
    ...over,
  };
}

function req(): NextRequest {
  return new NextRequest("http://localhost/api/brain/portal-data?token=tok-1");
}

beforeEach(() => {
  vi.clearAllMocks();
  db.portalMessage?.findMany?.mockResolvedValue?.([]);
  db.portalAccess?.findMany?.mockResolvedValue?.([]);
  db.project?.findMany?.mockResolvedValue?.([]);
  db.approvalRequest?.findMany?.mockResolvedValue?.([]);
  // rodada 4: as solicitações do escopo saem do CLIENTE, não do token.
  db.clientRequestDb.findMany?.mockResolvedValue?.([{ id: "cr1" }]);
  escopoDoToken.mockImplementation(escopoFalso(validatePortalAccess, db));
  // ⚠️ 15/08/2026 (rodada 4) — O TOKEN PASSOU A EXIGIR `clientId` NO REGISTRO.
  // `PortalAccess.clientId` virou a ÚNICA prova de pertencimento de um token:
  // sem ela não se DERIVA dono do ponteiro `ClientRequestDb.clientId`, porque
  // derivar de ponteiro mutável foi o que produziu o incidente (um link legado
  // do cliente A abria o portal do cliente B). Por isso os fixtures abaixo
  // carregam o dono, que é a forma que os links emitidos passam a ter.
  // Token legado (sem `clientId`) é RECUSADO — ver a pendência de reemissão.
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: "c1" } });
  db.clientRequestDb.findUnique.mockResolvedValue({ ...SOLICITACAO });
  db.brainArtifact.findMany.mockResolvedValue([]);
  db.approvalRequest.findMany.mockResolvedValue([]);
  db.project.findFirst.mockResolvedValue({ id: "p1" });
  db.deliverable.findMany.mockResolvedValue([]);
});

describe("A2 — o card nunca mostra conteúdo de outra entrega", () => {
  it("aprovação sem casamento fica SEM corpo — integridade acima de completude", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      aprovacao({ id: "ap-social", department: "social-media" }),
      aprovacao({ id: "ap-design", department: "design" }),
    ]);
    // Uma entrega do social (casa por agente) e uma SOBRA sem agente conhecido.
    db.deliverable.findMany.mockResolvedValue([
      { name: "Calendário", content: "posts do mês", ownerAgentId: "a3" },
      { name: "Relatório interno de custos", content: "margem por cliente", ownerAgentId: "financeiro-x" },
    ]);

    const json = await (await GET(req())).json();
    const social = json.approvals.find((a: { id: string }) => a.id === "ap-social");
    const design = json.approvals.find((a: { id: string }) => a.id === "ap-design");
    expect(social.reviewNote).toContain("posts do mês");
    // Antes, a sobra viraria o corpo do card de design via shift(). Agora: nada.
    expect(design.reviewNote).toBeNull();
    expect(JSON.stringify(design)).not.toContain("margem por cliente");
  });

  it("com FK à versão, o corpo vem DELA — e o número da versão sai no card", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      aprovacao({
        deliverableVersion: { number: 2, content: "corpo da v2 refeita", deliverable: { name: "Carrossel" } },
      }),
    ]);
    const json = await (await GET(req())).json();
    expect(json.approvals[0].reviewNote).toContain("corpo da v2 refeita");
    expect(json.approvals[0].version).toBe(2);
  });

  it("dúvida aberta viaja no payload como questionOpen", async () => {
    db.approvalRequest.findMany.mockResolvedValue([aprovacao({ questionOpenedAt: new Date() })]);
    const json = await (await GET(req())).json();
    expect(json.approvals[0].questionOpen).toBe(true);
  });
});

describe("visibilidade — 'interno' nunca abastece a rota do portal", () => {
  it("a consulta de entregas exige visibility 'compartilhado'", async () => {
    await GET(req());
    expect(db.deliverable.findMany.mock.calls[0]![0].where).toMatchObject({
      projectId: "p1", visibility: "compartilhado",
    });
  });
});

describe("A1 — o deny-list de valores internos (mínimo seguro; a trava por campo fica p/ próximo lote)", () => {
  it.each([
    ["Investimento de USD 500 no primeiro mês", "USD passava na regex antiga"],
    ["Orçamento estimado: 2.400 para produção", "milhar com ponto passava"],
    ["Verba de 3k por mês para tráfego", "abreviação k passava"],
    ["Custo interno de 900 por peça", "palavra 'custo' + número"],
  ])("headline com '%s' não chega ao cliente (%s)", async (texto) => {
    db.brainArtifact.findMany.mockResolvedValue([{
      id: "ba1", department: "strategy", canvasId: "cv", version: 1, status: "approved",
      approvedAt: new Date(), canvasJson: JSON.stringify({ executiveSummary: texto }),
    }]);
    const json = await (await GET(req())).json();
    expect(JSON.stringify(json.departments)).not.toContain(texto);
  });

  it("texto inocente continua passando — o filtro não pode emudecer o portal", async () => {
    db.brainArtifact.findMany.mockResolvedValue([{
      id: "ba1", department: "strategy", canvasId: "cv", version: 1, status: "approved",
      approvedAt: new Date(),
      canvasJson: JSON.stringify({ executiveSummary: "Posicionar a padaria como referência do bairro." }),
    }]);
    const json = await (await GET(req())).json();
    expect(json.departments.strategy.headline).toContain("referência do bairro");
  });
});
