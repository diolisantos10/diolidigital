// A MIRA DO AJUSTE — o cliente aponta UMA peça; é ELA que volta ao autor.
//
// ── O DEFEITO, MEDIDO EM PRODUÇÃO (Farol 27, rodada 4, 24/08/2026) ──────────
//
// O CEO, como cliente, abriu o card que mostrava a **Pauta do Mês**, apertou
// "Pedir ajuste" e escreveu que queria trocar um título. A máquina reescreveu
// os **Roteiros de Vídeo** — outra peça, que estava boa — e não encostou na
// Pauta. Ele então RECUSOU por mérito, dizendo com todas as letras "vocês
// mexeram na peça errada". Ela refez a peça errada de novo.
//
// Duas causas, as duas visíveis daqui:
//   1. `refazerPorPedidoDoCliente` mirava o DEPARTAMENTO. Social Media tem três
//      especialistas, então um clique varria os três;
//   2. a rota mandava o mesmo objeto para "pedir ajuste" e para "recusar" — o
//      código não sabia qual dos dois atos tinha acontecido.
//
// ── POR QUE ESTE ARQUIVO COBRE A ROTA, E NÃO SÓ A FUNÇÃO ────────────────────
//
// A pergunta obrigatória desta casa é se o teste alcança o código que ATENDE O
// CLIENTE. O botão do portal fala com `POST /api/portal/approvals` — é ela quem
// sabe qual card foi decidido, qual versão ele aponta e qual botão foi
// apertado. Um teste que só chamasse `refazerPorPedidoDoCliente` com o
// `deliverableId` já na mão provaria a mira e deixaria passar exatamente o
// defeito medido: as informações existiam e não atravessavam a fronteira.
//
// Então são duas metades, e as duas são necessárias:
//   • a ROTA entrega a peça e o ato (este bloco fala com o handler de verdade);
//   • a REFAÇÃO mira só ela (o bloco de baixo fala com a função de verdade).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// METADE 1 — A ROTA QUE O BOTÃO CHAMA
// ─────────────────────────────────────────────────────────────────────────────
const db = vi.hoisted(() => ({
  approvalRequest: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  socialPost: { updateMany: vi.fn() },
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
vi.mock("@/lib/agency/esteira/refacao", () => ({
  refazerPorPedidoDoCliente: refazer,
  recusarPorPedidoDoCliente: recusar,
}));

import { POST } from "@/app/api/portal/approvals/route";

/** O card que o cliente estava lendo: ele aponta a PAUTA por FK. */
const CARD_DA_PAUTA = {
  id: "ap1", clientRequestId: "cr1", clientId: null, department: "social-media",
  clientVisible: true, status: "pending", questionOpenedAt: null as Date | null,
  sourcePostIdsJson: "[]",
  clientRequest: { id: "cr1", clientId: "c1" },
  deliverableVersion: { deliverableId: "pauta-do-mes" },
};

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/portal/approvals", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ token: "tok-1", approvalRequestId: "ap1", ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
  db.approvalRequest.findUnique.mockResolvedValue({ ...CARD_DA_PAUTA });
  db.approvalRequest.update.mockResolvedValue({});
  db.approvalRequest.count.mockResolvedValue(1);
  db.transicaoDeEstado.create.mockResolvedValue({});
  updateApprovalStatus.mockResolvedValue({ id: "ap1", status: "revision_requested", reviewedAt: new Date() });
  addApprovalComment.mockResolvedValue({ id: "cm1" });
  refazer.mockResolvedValue({ refeitas: [], versoesNovas: [], escalado: false, avisouCliente: true });
});

describe("a rota entrega A PEÇA que o cliente estava decidindo", () => {
  it("pedir ajuste manda o deliverableId do card — não só o departamento", async () => {
    const res = await POST(req({ action: "request_revision", comment: "troca o título da semana 2" }));
    expect(res.status).toBe(200);
    const arg = refazer.mock.calls[0]![0];
    expect(arg.deliverableId, "sem isto a refação volta a mirar o departamento inteiro").toBe("pauta-do-mes");
  });

  it("a rota LÊ a versão vinculada — sem o include, o id nunca existiria para ser mandado", async () => {
    await POST(req({ action: "request_revision", comment: "troca o título" }));
    const include = db.approvalRequest.findUnique.mock.calls[0]![0].include;
    expect(include.deliverableVersion).toBeTruthy();
  });

  it("card SEM versão vinculada não inventa alvo: manda null e deixa a refação derivar", async () => {
    db.approvalRequest.findUnique.mockResolvedValue({ ...CARD_DA_PAUTA, deliverableVersion: null });
    await POST(req({ action: "request_revision", comment: "muda" }));
    expect(refazer.mock.calls[0]![0].deliverableId).toBeNull();
  });
});

describe("os DOIS atos do cliente chegam como dois atos", () => {
  it('"pedir ajuste" viaja como ajuste', async () => {
    await POST(req({ action: "request_revision", comment: "troca só o título" }));
    expect(refazer.mock.calls[0]![0].modo).toBe("ajuste");
  });

  it('"recusar" NÃO viaja para a refação — a máquina PARA', async () => {
    // ── O QUE MUDOU EM 25/08/2026, E POR QUE ─────────────────────────────
    //
    // Este teste afirmava que "recusar" chegava a `refazerPorPedidoDoCliente`
    // com `modo: "recusa"`. Estava certo sobre o que o código FAZIA, e a
    // investigação que o produziu continua valendo inteira: os dois atos
    // chegavam como um só, e o motivo do cliente se perdia.
    //
    // Só que mandar a recusa para a REFAÇÃO — ainda que com outro prompt —
    // significa responder a um "não" com outra tentativa automática, e reabrir
    // o card para o cliente decidir de novo. Medido na Operação Salvaguarda:
    // **em nenhum produto da casa a recusa ficava recusada.**
    //
    // Decisão do CEO: recusar PARA. A metade valiosa deste teste (os dois atos
    // são dois atos, e o motivo dele chega) continua afirmada — agora com os
    // dois destinos certos.
    updateApprovalStatus.mockResolvedValue({ id: "ap1", status: "rejected", reviewedAt: new Date() });
    await POST(req({ action: "reject", comment: "vocês mexeram na peça errada" }));

    expect(refazer, "recusa não manda a máquina tentar de novo sozinha").not.toHaveBeenCalled();
    expect(recusar).toHaveBeenCalledTimes(1);

    // O MOTIVO CHEGA — é a metade que a investigação original descobriu.
    const arg = recusar.mock.calls[0]![0];
    expect(arg.comentario).toBe("vocês mexeram na peça errada");
    // E a MIRA continua valendo: a recusa sabe qual entrega o cliente apontou.
    expect(arg.deliverableId, "sem isto a recusa carimbaria o departamento inteiro").toBe("pauta-do-mes");
  });

  it('"pedir ajuste" NÃO passa pela recusa — os destinos não se cruzam', async () => {
    await POST(req({ action: "request_revision", comment: "troca só o título" }));
    expect(recusar).not.toHaveBeenCalled();
    expect(refazer).toHaveBeenCalledTimes(1);
  });
});
