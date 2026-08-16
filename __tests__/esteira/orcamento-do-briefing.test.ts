// O orçamento que já existia e ninguém entregava.
//
// O CEO entregou briefing e esperou horas por um número que estava gravado no
// próprio pedido desde o primeiro segundo. A metade que importa neste teste
// não é "entregou": é **não inventou**. Um briefing sem estimativa derivada não
// pode ganhar número nenhum — nesta casa, valor vem de cálculo, e a IA só
// explica.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findMany: vi.fn(), update: vi.fn() },
  portalMessage: { create: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { entregarOrcamentosPendentes, textoDoOrcamento } from "@/lib/agency/esteira/orcamento-do-briefing";

function pedido(over: Record<string, unknown> = {}) {
  return {
    id: "req1",
    clientId: "cli1",
    businessName: "CityJobs",
    status: "new",
    createdAt: new Date("2026-08-16T01:12:00Z"),
    briefingJson: JSON.stringify({
      estimate: { totalMin: 1390, totalMax: 2590, items: [{ label: "Social media", detail: "3 posts/semana" }] },
    }),
    ...over,
  };
}

beforeEach(() => {
  db.clientRequestDb.findMany.mockReset();
  db.clientRequestDb.update.mockReset();
  db.portalMessage.create.mockReset();
  db.$transaction.mockClear();
});

describe("entrega o número que já estava calculado", () => {
  it("escreve a conversa e tira o pedido da fila de novos", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(1);
    expect(r.semOrcamento).toBe(0);
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
    expect(db.clientRequestDb.update).toHaveBeenCalledTimes(1);

    // Mensagem e mudança de estado na MESMA transação: entregar sem sair de
    // `new` faria a casa mandar o mesmo orçamento a cada cinco minutos.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const estado = db.clientRequestDb.update.mock.calls[0][0];
    expect(estado.data.status).toBe("proposal_pending");
  });

  it("a mensagem vai como equipe, para o cliente daquele pedido", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido()]);
    await entregarOrcamentosPendentes();
    const msg = db.portalMessage.create.mock.calls[0][0].data;
    expect(msg.authorRole).toBe("team");
    expect(msg.clientRequestId).toBe("req1");
    expect(msg.clientId).toBe("cli1");
  });
});

describe("NÃO inventa número — a metade que importa", () => {
  it("briefing sem estimativa não vira mensagem nenhuma", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: JSON.stringify({ scope: {} }) })]);
    const r = await entregarOrcamentosPendentes();

    expect(r.entregues).toBe(0);
    expect(r.semOrcamento).toBe(1);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
    // E continua em `new`: fica para gente resolver, não some da fila.
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });

  it("JSON quebrado não derruba a rodada nem inventa valor", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: "{isso não é json" })]);
    const r = await entregarOrcamentosPendentes();
    expect(r.semOrcamento).toBe(1);
    expect(r.falhas).toEqual([]);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("estimativa zerada é o mesmo que estimativa nenhuma", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([
      pedido({ briefingJson: JSON.stringify({ estimate: { totalMin: 0, totalMax: 0 } }) }),
    ]);
    const r = await entregarOrcamentosPendentes();
    expect(r.semOrcamento).toBe(1);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("um pedido com erro não impede o seguinte de ser entregue", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ id: "req1" }), pedido({ id: "req2" })]);
    db.$transaction.mockRejectedValueOnce(new Error("banco travou"));
    const r = await entregarOrcamentosPendentes();
    expect(r.entregues).toBe(1);
    expect(r.falhas).toHaveLength(1);
  });
});

describe("o texto que o cliente lê", () => {
  const e = {
    totalMin: 1390,
    totalMax: 2590,
    items: [{ label: "Social media", detail: "3 posts/semana" }],
    notIncluded: ["verba de mídia"],
    missingForEstimate: ["Frequência de posts por semana"],
  };

  it("mostra a faixa em reais e o que entra", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).toContain("CityJobs");
    expect(t).toMatch(/1\.390/);
    expect(t).toMatch(/2\.590/);
    expect(t).toContain("Social media");
  });

  it("diz o que NÃO está incluído e o que ainda falta", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).toContain("verba de mídia");
    expect(t).toContain("Frequência de posts por semana");
  });

  it("deixa claro que é estimativa, não proposta fechada", () => {
    expect(textoDoOrcamento("CityJobs", e)).toMatch(/estimativa/i);
    expect(textoDoOrcamento("CityJobs", e)).toMatch(/não a proposta final/i);
  });

  it("NÃO promete prazo — ordem do CEO em 16/08", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).not.toMatch(/\b1 dia\b|\bum dia\b|\b24 horas\b|\bat[ée] \d+ dias?\b/i);
  });

  it("não vaza vocabulário de máquina nem custo interno", () => {
    const t = textoDoOrcamento("CityJobs", e);
    expect(t).not.toMatch(/\$\d|clientRequestId|correlation|orchestrator/i);
  });
});
