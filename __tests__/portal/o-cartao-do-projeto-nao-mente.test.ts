// O CARTÃO DO PROJETO NÃO PODE DIZER "EM PRODUÇÃO" DE UM PROJETO PARADO.
//
// ── O que o cliente oculto encontrou em produção (26/08/2026) ──────────────
//
// Projeto cmt9f1f7w001y0xo781zi2jt4 (CANTINA DO PORTO TESTE). Ao mesmo tempo:
//
//   • despertador: "1 projeto(s) parados por falta de pagamento confirmado";
//   • `/api/portal/messages`: "Este projeto está aguardando o pagamento";
//   • `/api/portal/projetos`: etapa **"Em produção"**.
//
// Duas superfícies do MESMO portal contando coisas opostas — e a que o cliente
// vê primeiro (o cartão) era a que mentia, do jeito mais caro: dizendo que o
// trabalho anda quando ele está parado esperando uma ação DELE.
//
// A causa era um `else`: a função tinha três ramos, e o último devolvia
// "Em produção" para tudo o que não tinha sido apresentado. `directionApprovedAt`
// chegava até ela e não era lido por ninguém.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
  pagamentoConfirmado: { findMany: vi.fn() },
}));
const resolvePortalClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ resolvePortalClient }));
vi.mock("@/lib/agency/persistence/portal-cookie", () => ({
  tokenDoPortal: (_r: unknown, q: string | null) => q,
}));

import { GET } from "@/app/api/portal/projetos/route";

const PROJETO = {
  id: "p1", name: "Reativação — CANTINA DO PORTO TESTE", goal: "encher o salão",
  createdAt: new Date("2026-08-26T01:29:00Z"),
  presentedAt: null, clientApprovedAt: null, directionApprovedAt: null,
  clientRequestId: "cr1",
};

async function etapa(): Promise<string> {
  const r = await GET(new NextRequest("http://localhost/api/portal/projetos?token=t"));
  const j = await r.json() as { projetos: { etapa: string }[] };
  return j.projetos[0]!.etapa;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue({ clientId: "c1", workspaceId: "ws1" });
  db.project.findMany.mockResolvedValue([{ ...PROJETO }]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.pagamentoConfirmado.findMany.mockResolvedValue([]);
});

describe("a etapa que o cliente lê no cartão", () => {
  it("SEM pagamento não é 'Em produção' — é o que falta, e é ação DELE", async () => {
    expect(await etapa()).toBe("Aguardando o pagamento para começar");
  });

  it("PAGO mas sem aval da direção: espera o cliente, não 'produz'", async () => {
    db.pagamentoConfirmado.findMany.mockResolvedValue([{ clientRequestId: "cr1" }]);
    expect(await etapa()).toBe("Esperando o seu aval no caminho");
  });

  it("pago e com o aval: aí sim, em produção", async () => {
    db.pagamentoConfirmado.findMany.mockResolvedValue([{ clientRequestId: "cr1" }]);
    db.project.findMany.mockResolvedValue([{ ...PROJETO, directionApprovedAt: new Date() }]);
    expect(await etapa()).toBe("Em produção");
  });

  it("os dois ramos antigos continuam de pé", async () => {
    db.pagamentoConfirmado.findMany.mockResolvedValue([{ clientRequestId: "cr1" }]);
    db.project.findMany.mockResolvedValue([{ ...PROJETO, directionApprovedAt: new Date(), presentedAt: new Date() }]);
    expect(await etapa()).toBe("Esperando a sua aprovação");
    db.project.findMany.mockResolvedValue([{ ...PROJETO, clientApprovedAt: new Date() }]);
    expect(await etapa()).toBe("Aprovado por você — colocando no ar");
  });
});

describe("a leitura do pagamento é fail-closed", () => {
  it("banco tossindo NÃO vira 'pago' — o cartão erra para 'ainda não começou'", async () => {
    db.pagamentoConfirmado.findMany.mockRejectedValue(new Error("banco fora"));
    expect(await etapa()).toBe("Aguardando o pagamento para começar");
  });

  it("pagamento de VALOR ZERO não conta — a consulta exige dinheiro", async () => {
    await etapa();
    const where = db.pagamentoConfirmado.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.valorCentavos).toEqual({ gt: 0 });
  });

  it("o id do PEDIDO não vaza para a resposta do cliente", async () => {
    const r = await GET(new NextRequest("http://localhost/api/portal/projetos?token=t"));
    const j = await r.json() as { projetos: Record<string, unknown>[] };
    expect(j.projetos[0]!).not.toHaveProperty("clientRequestId");
  });
});
