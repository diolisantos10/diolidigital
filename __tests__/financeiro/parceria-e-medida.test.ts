// TODO GASTO É MEDIDO — PARCERIA INCLUSIVE.
//
// Ordem do CEO (D-0B9), literal:
//   "Todo gasto tem que ser salvo, medido e contabilizado. Independente se é
//    parceria ou não, porque alguém vai pagar por esse investimento. Tudo tem
//    que ser medido, inclusive as parcerias."
//
// ── O defeito, medido em 27/08/2026 ─────────────────────────────────────────
// `porProjeto` calculava receita a partir de `LancamentoFinanceiro`. Um parceiro
// não tem lançamento de receita — então a linha dele saía com
// `nao_lancado: "nenhuma receita lançada"`.
//
// `nao_lancado` quer dizer *a janela está vazia*, e o leitor entende
// **esqueceram de lançar** ou **o cliente não pagou**. A parceria autorizada
// ficava idêntica ao caloteiro e ao descuido — e é exatamente a distinção que a
// ordem do CEO manda existir.
//
// A receita de um parceiro é CONHECIDA e igual a zero. Isso é `medido`, com
// origem própria.

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn() },
  lancamentoFinanceiro: { findMany: vi.fn() },
  isencaoDeParceria: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const { porProjeto, mesDeReferencia, emReais } = await import("@/lib/agency/financeiro/dre");

const AGOSTO = mesDeReferencia("2026-08");
const NOME = (id: string) => (id === "c_foocci" ? "Foocci" : id);

/** O cliente 001: sem receita, com custo — o retrato de uma parceria. */
function custoSemReceita() {
  db.lancamentoFinanceiro.findMany.mockResolvedValue([
    { tipo: "custo", valorCentavos: 4_000, moeda: "BRL", origem: "manual", clientId: "c_foocci", centroDeCusto: null },
  ]);
}

function parceriaViva() {
  db.isencaoDeParceria.findMany.mockResolvedValue([
    {
      clientId: "c_foocci",
      autorizadaPor: "Dioli Santos (CEO) — D-0B9",
      validaAte: new Date("2026-11-27T00:00:00.000Z"),
      escopo: "Social Media — cliente 001",
    },
  ]);
}

beforeEach(() => {
  db.aIRunLog.findMany.mockReset().mockResolvedValue([]);
  db.lancamentoFinanceiro.findMany.mockReset().mockResolvedValue([]);
  // O padrão é NÃO haver parceria: ela é a exceção nomeada, nunca o repouso.
  db.isencaoDeParceria.findMany.mockReset().mockResolvedValue([]);
});

describe("a parceria aparece como R$ 0 POR DECISÃO, não como ausência", () => {
  it("sem parceria, receita ausente continua sendo 'nada lançado'", async () => {
    custoSemReceita();
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.receita.estado).toBe("nao_lancado");
    expect(l.parceria).toBeUndefined();
  });

  it("com parceria viva, a receita é MEDIDA e vale zero", async () => {
    custoSemReceita(); parceriaViva();
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.receita).toMatchObject({ estado: "medido", centavos: 0, origem: "parceria" });
    expect(emReais(l.receita)).toBe("R$ 0,00");
  });

  it("a linha carrega QUEM autorizou e ATÉ QUANDO — isenção sem dono é buraco", async () => {
    custoSemReceita(); parceriaViva();
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.parceria?.autorizadaPor).toContain("D-0B9");
    expect(l.parceria?.validaAte).toBeInstanceOf(Date);
    expect(l.parceria?.escopo).toBeTruthy();
  });

  it("o CUSTO é contado normalmente — parceria não isenta de medir gasto", async () => {
    custoSemReceita(); parceriaViva();
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.custo).toMatchObject({ estado: "medido", centavos: 4_000 });
  });

  it("e a MARGEM NEGATIVA fica visível — que é o ponto da ordem", async () => {
    custoSemReceita(); parceriaViva();
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.resultado.estado).toBe("medido");
    expect(l.resultado.estado === "medido" && l.resultado.centavos).toBe(-4_000);
  });

  it("NUNCA vira receita: não há linha de pagamento, e a origem tem nome próprio", async () => {
    custoSemReceita(); parceriaViva();
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.receita.estado === "medido" && l.receita.origem).toBe("parceria");
    expect(l.receita.estado === "medido" && l.receita.origem).not.toBe("manual");
    expect(l.receita.estado === "medido" && l.receita.origem).not.toBe("contrato");
  });
});

describe("as bordas — a parceria explica a ausência, nunca apaga o fato", () => {
  it("receita LANÇADA vence a parceria: se entrou dinheiro, o fato é o dinheiro", async () => {
    parceriaViva();
    db.lancamentoFinanceiro.findMany.mockResolvedValue([
      { tipo: "receita", valorCentavos: 29_000, moeda: "BRL", origem: "manual", clientId: "c_foocci", centroDeCusto: null },
    ]);
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.receita).toMatchObject({ estado: "medido", centavos: 29_000, origem: "manual" });
  });

  it("isenção VENCIDA antes do período não explica mais nada", async () => {
    custoSemReceita();
    db.isencaoDeParceria.findMany.mockResolvedValue([]); // a consulta filtra por validade
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.receita.estado).toBe("nao_lancado");
    expect(l.parceria).toBeUndefined();
  });

  it("a consulta pede só as VIVAS — filtro por validade, não filtro na memória", async () => {
    custoSemReceita(); parceriaViva();
    await porProjeto("w1", AGOSTO, NOME);
    const where = db.isencaoDeParceria.findMany.mock.calls[0][0].where;
    expect(where.validaAte).toBeDefined();
  });

  // ⚠️ O QUE ESTE CASO PROVA, E O QUE NÃO PROVA. Ele mede o RESULTADO (a
  // isenção órfã não gruda em linha nenhuma) e isso vale. Ele NÃO prova a
  // guarda `if (!v.clientId) continue` de `dre.ts`: a mutação que remove
  // aquela linha sobrevive a esta suíte, porque hoje a chave nula já não casa
  // com nada. A guarda é defesa em profundidade e está declarada como tal no
  // próprio arquivo. Verde por ausência não é verde — então fica escrito.
  it("isenção SEM cliente não gruda em linha nenhuma (mede o RESULTADO, não a guarda)", async () => {
    custoSemReceita();
    db.isencaoDeParceria.findMany.mockResolvedValue([
      { clientId: null, autorizadaPor: "X", validaAte: new Date("2026-11-27"), escopo: "y" },
    ]);
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.parceria).toBeUndefined();
    expect(l.receita.estado).toBe("nao_lancado");
  });

  it("leitura que falha NÃO inventa parceria — fica no estado conservador", async () => {
    custoSemReceita();
    db.isencaoDeParceria.findMany.mockRejectedValue(new Error("banco fora"));
    const [l] = await porProjeto("w1", AGOSTO, NOME);
    expect(l.parceria).toBeUndefined();
    expect(l.receita.estado).toBe("nao_lancado");
  });
});
