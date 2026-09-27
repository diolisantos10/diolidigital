// o-estado-do-card-de-semana-usa-a-mira-da-refacao.test.ts — achado colateral
// do C8, consertado no C9 (27/09/2026; leia .despacho/C9-colateral.md e
// .despacho/C8-bloqueantes.out, "Achado colateral").
//
// ── O DEFEITO ────────────────────────────────────────────────────────────────
//
// `refazerPorPedidoDoCliente` passou a NÃO regenerar nada no card de semana
// quando o ajuste não tem mira reconhecível (ordinal ou dia/data) — escala e
// pergunta ao cliente. Mas a ROTA (`/api/portal/approvals`) continuava usando
// a régua ANTIGA (`pecasApontadasPeloAjuste`, a do `Deliverable`) para
// carimbar o ESTADO: sem mira, ela devolve o LOTE INTEIRO, e a rota gravava
// `revision_requested` em TODAS as peças do card. Como a refação não tocava
// nenhuma delas, elas ficavam PRESAS nesse estado — `ESTADOS_PROMOVIVEIS`
// (`esteira/publicacao.ts`) não o inclui — até o cliente escrever uma mira
// reconhecível.
//
// ── O CONSERTO ───────────────────────────────────────────────────────────────
//
// No CARD DE SEMANA (peça do calendário editorial: sem `deliverableId`, com
// `MARCADOR_DE_ORIGEM` no `scriptJson`), a rota agora usa a MESMA função que
// o ramo de refação usa — `miraDoCardDeSemana`, exportada de `refacao.ts`.
// Sem mira, NENHUMA peça muda de estado. Com mira, SÓ a apontada.
//
// O fluxo de `Deliverable` (sem o marcador) continua na régua antiga —
// provado no segundo describe, sem regressão.
//
// `miraDoCardDeSemana` é mockada aqui: este arquivo prova a FIAÇÃO da rota
// (que ela decide entrar no ramo certo e usar o resultado certo), não a
// lógica da mira em si — essa é `__tests__/esteira/mira-do-card-de-semana.test.ts`.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  approvalRequest: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  socialPost: { findMany: vi.fn(), updateMany: vi.fn() },
  project: { findFirst: vi.fn() },
  materialRequest: { create: vi.fn() },
  portalMessage: { create: vi.fn() },
  transicaoDeEstado: { create: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const updateApprovalStatus = vi.hoisted(() => vi.fn());
const addApprovalComment = vi.hoisted(() => vi.fn());
const refazer = vi.hoisted(() => vi.fn());
const recusar = vi.hoisted(() => vi.fn());
const mira = vi.hoisted(() =>
  vi.fn((_c: string | null | undefined, _pecas: Array<{ id: string; scheduledFor: Date | null }>): string | null => null),
);

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));
vi.mock("@/lib/agency/persistence/approval-service", () => ({
  updateApprovalStatus, addApprovalComment,
  cardGenerico: () => false,
  decidirIrmaosGenericos: vi.fn(async () => 0),
}));
vi.mock("@/lib/agency/execution/create-project-from-request", () => ({ createProjectFromRequest: vi.fn() }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution: vi.fn() }));
vi.mock("@/lib/agency/execution/negotiate-proposal", () => ({ negotiateProposal: vi.fn() }));
vi.mock("@/lib/agency/execution/assess-resources", () => ({ assessResources: vi.fn() }));
// Mockado inteiro (inclusive `miraDoCardDeSemana`, importada dinamicamente
// dentro da rota): sem os três nomes, o import dinâmico devolveria `undefined`
// e a chamada explodiria — o mesmo cuidado que `a-mira-do-ajuste.test.ts` já
// toma com `refazerPorPedidoDoCliente`/`recusarPorPedidoDoCliente`.
vi.mock("@/lib/agency/esteira/refacao", () => ({
  refazerPorPedidoDoCliente: refazer,
  recusarPorPedidoDoCliente: recusar,
  miraDoCardDeSemana: mira,
}));

import { POST } from "@/app/api/portal/approvals/route";

const IDS = ["sp1", "sp2", "sp3"];
const MARCADOR = "calendario-editorial-v1";

function postDoCalendario(id: string, scheduledFor: Date): {
  id: string; deliverableId: null; scriptJson: string; scheduledFor: Date;
} {
  return {
    id, deliverableId: null,
    scriptJson: JSON.stringify({ origemGerador: MARCADOR, mes: "2026-10", fase: "final" }),
    scheduledFor,
  };
}

const CARD_DE_SEMANA = {
  id: "ap1", clientRequestId: null, clientId: "c1", department: "social-media",
  clientVisible: true, status: "pending", questionOpenedAt: null as Date | null,
  sourcePostIdsJson: JSON.stringify(IDS),
  clientRequest: null,
  deliverableVersion: null,
};

function req(body: Record<string, unknown>): NextRequest {
  // "sec-fetch-site: same-origin" — a FAIXA 1 do CSRF exige isto por padrão.
  return new NextRequest("http://localhost/api/portal/approvals", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ token: "tok-1", approvalRequestId: "ap1", ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: "c1" } });
  db.approvalRequest.findUnique.mockResolvedValue({ ...CARD_DE_SEMANA });
  db.approvalRequest.update.mockResolvedValue({});
  db.approvalRequest.count.mockResolvedValue(1);
  db.transicaoDeEstado.create.mockResolvedValue({});
  db.socialPost.findMany.mockResolvedValue([
    postDoCalendario("sp1", new Date("2026-12-11T13:00:00.000Z")),
    postDoCalendario("sp2", new Date("2026-12-12T13:00:00.000Z")),
    postDoCalendario("sp3", new Date("2026-12-13T13:00:00.000Z")),
  ]);
  db.socialPost.updateMany.mockResolvedValue({ count: 0 });
  updateApprovalStatus.mockResolvedValue({ id: "ap1", status: "revision_requested", reviewedAt: new Date() });
  addApprovalComment.mockResolvedValue({ id: "cm1" });
  refazer.mockResolvedValue({ refeitas: [], versoesNovas: [], escalado: false, avisouCliente: true });
  mira.mockReturnValue(null);
});

describe("card de semana — o ESTADO usa a MESMA mira da refação (C9, achado colateral do C8)", () => {
  it("sem mira → NENHUMA peça muda de estado (estados intactos, card aguardando decisão)", async () => {
    mira.mockReturnValue(null);
    const res = await POST(req({ action: "request_revision", comment: "está tudo meio sem graça" }));
    expect(res.status).toBe(200);
    expect(
      db.socialPost.updateMany,
      "sem mira, o card de semana não pode carimbar revision_requested em ninguém — a régua do Deliverable devolveria o lote inteiro",
    ).not.toHaveBeenCalled();
  });

  it("com mira → SÓ a peça apontada muda de estado", async () => {
    mira.mockReturnValue("sp2");
    const res = await POST(req({ action: "request_revision", comment: "a segunda peça está sem graça" }));
    expect(res.status).toBe(200);
    expect(db.socialPost.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sp2"] }, clientId: "c1" },
      data: { status: "revision_requested" },
    });
  });

  it("a mira recebe as peças NA ORDEM do card (sourcePostIdsJson), não na ordem devolvida pelo banco", async () => {
    db.socialPost.findMany.mockResolvedValue([
      postDoCalendario("sp3", new Date("2026-12-13T13:00:00.000Z")),
      postDoCalendario("sp1", new Date("2026-12-11T13:00:00.000Z")),
      postDoCalendario("sp2", new Date("2026-12-12T13:00:00.000Z")),
    ]);
    await POST(req({ action: "request_revision", comment: "x" }));
    const pecasRecebidas = mira.mock.calls[0]![1];
    expect(pecasRecebidas.map((p) => p.id)).toEqual(IDS);
  });

  it("recusar não é ajuste: carimba TODO o card, sem perguntar a mira", async () => {
    updateApprovalStatus.mockResolvedValue({ id: "ap1", status: "rejected", reviewedAt: new Date() });
    const res = await POST(req({ action: "reject", comment: "não gostei de nada" }));
    expect(res.status).toBe(200);
    expect(mira, "recusa é do CARD inteiro, não aponta uma peça").not.toHaveBeenCalled();
    expect(db.socialPost.updateMany).toHaveBeenCalledWith({
      where: { id: { in: IDS }, clientId: "c1" },
      data: { status: "rejected" },
    });
  });
});

describe("card de Deliverable — sem o marcador do calendário, régua antiga intacta", () => {
  it("peça com deliverableId (fora do calendário) usa pecasApontadasPeloAjuste — sem mira, lote inteiro", async () => {
    db.socialPost.findMany.mockResolvedValue([
      { id: "sp1", deliverableId: "d1", scriptJson: null, scheduledFor: null },
      { id: "sp2", deliverableId: "d1", scriptJson: null, scheduledFor: null },
      { id: "sp3", deliverableId: "d1", scriptJson: null, scheduledFor: null },
    ]);
    const res = await POST(req({ action: "request_revision", comment: "sem mira nenhuma" }));
    expect(res.status).toBe(200);
    expect(mira, "fluxo de Deliverable não passa pela mira do card de semana").not.toHaveBeenCalled();
    expect(db.socialPost.updateMany).toHaveBeenCalledWith({
      where: { id: { in: IDS }, clientId: "c1" },
      data: { status: "revision_requested" },
    });
  });

  it("peça sem o marcador MAS com ordinal reconhecido → só a apontada (régua antiga também mira, quando reconhece)", async () => {
    db.socialPost.findMany.mockResolvedValue([
      { id: "sp1", deliverableId: "d1", scriptJson: null, scheduledFor: null },
      { id: "sp2", deliverableId: "d1", scriptJson: null, scheduledFor: null },
      { id: "sp3", deliverableId: "d1", scriptJson: null, scheduledFor: null },
    ]);
    const res = await POST(req({ action: "request_revision", comment: "a segunda peça está errada" }));
    expect(res.status).toBe(200);
    expect(db.socialPost.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sp2"] }, clientId: "c1" },
      data: { status: "revision_requested" },
    });
  });
});
