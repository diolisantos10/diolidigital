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

describe("briefing SEM contato tambem e atendido — a causa raiz da noite de 16/08", () => {
  it("pega lead_incompleto, nao so new", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([]);
    await entregarOrcamentosPendentes();
    const where = db.clientRequestDb.findMany.mock.calls[0][0].where;
    // O briefing do CEO entrou sem contato (o SDR havia parado de pedir
    // e-mail) e a porta de entrada o gravou como `lead_incompleto`. Nesse
    // estado ele ficava fora da vista de TUDO — e o CEO esperou a noite
    // inteira por um orcamento de um pedido tratado como lixo.
    expect(where.status.in).toContain("new");
    expect(where.status.in).toContain("lead_incompleto");
    // Terceiro estado, achado pelo diario do piloto: o auto-scope move o
    // pedido para `scope_ready` e ali ele morria — escopo pronto era o fim da
    // linha em vez do meio dela.
    expect(where.status.in).toContain("scope_ready");
  });

  it("entrega o orcamento de um lead_incompleto pelo portal", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ status: "lead_incompleto", clientId: null })]);
    const r = await entregarOrcamentosPendentes();
    // Faltar contato impede AVISAR por fora; nao impede ATENDER. O portal nao
    // precisa de e-mail para funcionar.
    expect(r.entregues).toBe(1);
    expect(db.portalMessage.create).toHaveBeenCalledTimes(1);
  });
});

describe("estimativa travada nao vira orcamento — o CityJobs de 16/08", () => {
  // O cliente pediu 2 posts estaticos por DIA. O volume chegou ZERADO ao
  // calculo, atravessou os guardioes (que testavam `=== undefined`, e zero e
  // definido), virou "Plano Essencial" de 3 posts/semana por tabela e saiu como
  // R$ 1.800 a R$ 3.400 — com `confidence: "high"`.
  //
  // O que torna esse caso perigoso, e o motivo deste teste existir: a
  // estimativa travada TEM numero. R$ 1.800 e maior que zero e passaria por
  // toda conferencia de "tem estimativa?" que existia neste arquivo.
  const travada = JSON.stringify({
    estimate: {
      totalMin: 1800,
      totalMax: 3400,
      items: [{ label: "Plano Essencial", detail: "3 posts + 5 stories/semana" }],
      travadaPor: "O volume de posts nao chegou no pedido, e e ele que define o plano.",
    },
  });

  it("nao manda mensagem nenhuma ao cliente", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: travada })]);
    const r = await entregarOrcamentosPendentes();

    // Numero que nao se sustenta nao vira preco nesta casa. Nesta casa valor
    // vem de calculo, e a IA nunca inventa.
    expect(r.entregues).toBe(0);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("conta como semOrcamento — o pedido fica parado, mas nunca em silencio", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: travada })]);
    const r = await entregarOrcamentosPendentes();

    // `semOrcamento` e o numero que faz gente olhar. Travar sem contar seria
    // trocar um orcamento errado por um pedido desaparecido — e o CEO ja
    // esperou uma noite inteira por um pedido que o sistema tratava como lixo.
    expect(r.semOrcamento).toBe(1);
    expect(r.falhas).toHaveLength(0);
  });

  it("deixa o pedido de pe, no estado em que estava", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([pedido({ briefingJson: travada })]);
    await entregarOrcamentosPendentes();
    // Sem `proposal_pending`: o pedido nao avanca para uma fila que promete um
    // numero que ele nao tem.
    expect(db.clientRequestDb.update).not.toHaveBeenCalled();
  });
});
