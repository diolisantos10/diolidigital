// ── UMA DECISÃO, UM CARD (CEO, 07/08/2026) ──────────────────────────────────
//
// O CEO abriu o portal e viu SEIS aprovações esperando, três delas com o mesmo
// título ("Pauta do Mês — Dioli Digital Studio") e duas com "Estratégia". Não
// eram três decisões: o motor de produção cria uma `ApprovalRequest` por
// ESPECIALISTA, todas carimbadas com o mesmo `department`, e o portal dava a
// TODAS o mesmo corpo (o único entregável daquele departamento).
//
// Pior que a repetição: `refazerPorPedidoDoCliente` e `aprovarPacote` agem por
// DEPARTAMENTO. Decidir um card já decidia o assunto — os outros dois eram o
// mesmo clique pedido de novo, e o cliente não tinha como saber se já havia
// decidido. Era exatamente a confusão relatada.
//
// Estes testes travam as três metades da correção:
//   1. ESCRITA — card genérico de departamento que já tem pendente não nasce
//      de novo (a duplicata para de ser criada);
//   2. LEITURA — o que a base JÁ tem é agrupado (`cardGenerico` é o critério);
//   3. FECHAMENTO — decidir o card que sobrou fecha os irmãos escondidos, para
//      não sobrar "pending" fora da tela travando `aprovarPacote`.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  // rodada 5: a aprovação passou a nascer CARIMBADA com o dono (derivado da
  // solicitação no instante da escrita) — a posse deixou de aceitar o ponteiro.
  clientRequestDb: { findUnique: vi.fn() },
  approvalRequest: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  cardGenerico,
  createApprovalRequest,
  decidirIrmaosGenericos,
} from "@/lib/agency/persistence/approval-service";

beforeEach(() => {
  vi.clearAllMocks();
  db.clientRequestDb.findUnique.mockResolvedValue({ clientId: "c1" });
  db.approvalRequest.create.mockResolvedValue({ id: "novo" });
  db.approvalRequest.findFirst.mockResolvedValue(null);
  db.approvalRequest.findMany.mockResolvedValue([]);
  db.approvalRequest.updateMany.mockResolvedValue({ count: 0 });
});

// ── 1 · O critério ──────────────────────────────────────────────────────────
describe("cardGenerico — o que torna dois cards indistinguíveis", () => {
  const base = { reviewNote: null, deliverableVersionId: null, sourcePostIdsJson: "[]" };

  it("sem nota, sem versão e sem posts é genérico — nada nele diz o que é", () => {
    expect(cardGenerico(base)).toBe(true);
  });

  it("nota própria distingue: aquilo é uma decisão de verdade", () => {
    expect(cardGenerico({ ...base, reviewNote: "Calendário de agosto\n\n12 posts." })).toBe(false);
  });

  it("versão vinculada distingue — o cliente decide a v2, não 'social-media'", () => {
    expect(cardGenerico({ ...base, deliverableVersionId: "dv1" })).toBe(false);
  });

  it("card de calendário (com posts) distingue", () => {
    expect(cardGenerico({ ...base, sourcePostIdsJson: '["p1","p2"]' })).toBe(false);
  });

  it("JSON corrompido não vira exceção — cai para genérico, nunca derruba a leitura", () => {
    expect(cardGenerico({ ...base, sourcePostIdsJson: "{quebrado" })).toBe(true);
  });

  it("nota só de espaços não conta como conteúdo próprio", () => {
    expect(cardGenerico({ ...base, reviewNote: "   \n  " })).toBe(true);
  });
});

// ── 2 · A trava de escrita ──────────────────────────────────────────────────
describe("createApprovalRequest — a duplicata para de nascer", () => {
  it("segundo especialista do mesmo departamento REUSA o card pendente", async () => {
    db.approvalRequest.findFirst.mockResolvedValue({ id: "ja-existe", department: "social-media" });

    const r = await createApprovalRequest({
      clientRequestId: "cr1",
      department: "social-media",
      requestedBy: "Especialista de Copy dos posts (Social Media)",
    });

    // ⚠️ 16/08/2026 (rodada 9) — REVERTIDO, e a reversão é o conserto.
    // O re-carimbo aqui FABRICAVA PROVA FALSA: card órfão de A, solicitação
    // re-apontada, e o reuso gravava `clientId = B` com autoridade — o rastro
    // forense sumia. Carimbo retroativo só no backfill, offline e curado.
    expect(r).toEqual({ id: "ja-existe", department: "social-media" });
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
  });

  it("sem card pendente, cria normalmente — a trava não bloqueia o primeiro", async () => {
    await createApprovalRequest({ clientRequestId: "cr1", department: "social-media" });
    expect(db.approvalRequest.create).toHaveBeenCalledOnce();
  });

  it("card COM conteúdo próprio sempre cria — proposta e calendário são decisões distintas", async () => {
    db.approvalRequest.findFirst.mockResolvedValue({ id: "ja-existe" });

    await createApprovalRequest({
      clientRequestId: "cr1",
      department: "social-media",
      reviewNote: "Calendário da semana 2\n\nTrês peças.",
    });
    await createApprovalRequest({
      clientId: "c1",
      department: "social-media",
      sourcePostIds: ["p1"],
    });

    expect(db.approvalRequest.create).toHaveBeenCalledTimes(2);
    // Nem consultou: card com conteúdo próprio não passa pelo agrupamento.
    expect(db.approvalRequest.findFirst).not.toHaveBeenCalled();
  });

  it("aprovação sem dono continua falhando alto — a trava nova não afrouxa a antiga", async () => {
    await expect(createApprovalRequest({ department: "social-media" })).rejects.toThrow(/dono/);
  });
});

// ── 3 · O fechamento dos irmãos ─────────────────────────────────────────────
describe("decidirIrmaosGenericos — nada fica pendente fora da tela", () => {
  it("fecha os irmãos GENÉRICOS com a mesma decisão", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "ap2", reviewNote: null, deliverableVersionId: null, sourcePostIdsJson: "[]" },
      { id: "ap3", reviewNote: null, deliverableVersionId: null, sourcePostIdsJson: "[]" },
    ]);
    db.approvalRequest.updateMany.mockResolvedValue({ count: 2 });

    const n = await decidirIrmaosGenericos({
      id: "ap1", clientRequestId: "cr1", clientId: null,
      department: "social-media", status: "approved", reviewedBy: "client:portal",
    });

    expect(n).toBe(2);
    const [args] = db.approvalRequest.updateMany.mock.calls[0];
    expect(args.where.id.in).toEqual(["ap2", "ap3"]);
    expect(args.data.status).toBe("approved");
  });

  it("NÃO toca no irmão que tem conteúdo próprio — aquilo o cliente ainda precisa decidir", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "ap2", reviewNote: "Calendário de agosto", deliverableVersionId: null, sourcePostIdsJson: "[]" },
      { id: "ap3", reviewNote: null, deliverableVersionId: "dv9", sourcePostIdsJson: "[]" },
    ]);

    const n = await decidirIrmaosGenericos({
      id: "ap1", clientRequestId: "cr1", clientId: null,
      department: "social-media", status: "approved", reviewedBy: "client:portal",
    });

    expect(n).toBe(0);
    expect(db.approvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it("cliente DIRETO (só clientId) também tem os irmãos fechados", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "ap2", reviewNote: null, deliverableVersionId: null, sourcePostIdsJson: "[]" },
    ]);
    db.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

    await decidirIrmaosGenericos({
      id: "ap1", clientRequestId: null, clientId: "c1",
      department: "social-media", status: "revision_requested", reviewedBy: "client:portal",
    });

    const [busca] = db.approvalRequest.findMany.mock.calls[0];
    expect(busca.where.clientId).toBe("c1");
  });

  it("card sem dono nenhum não sai varrendo o banco", async () => {
    const n = await decidirIrmaosGenericos({
      id: "ap1", clientRequestId: null, clientId: null,
      department: "social-media", status: "approved", reviewedBy: "client:portal",
    });
    expect(n).toBe(0);
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
  });
});
