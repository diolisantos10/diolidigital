// O DRE NÃO ESCREVE ZERO QUANDO A RESPOSTA É "NÃO SEI".
//
// Regra da casa, e aqui ela vale em dobro porque é dinheiro: "não medido" e
// "custou zero" são coisas diferentes. Painel que confunde as duas ensina o
// dono a não confiar nele — e a decisão errada sai com cara de dado.
//
// As duas metades, em todo bloco: barra o problema plantado (uma parcela sem
// medição não vira zero na soma) E não inventa problema no caso limpo (janela
// vazia de verdade continua sendo zero de verdade, e soma medida soma).

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn() },
  lancamentoFinanceiro: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  somar, subtrair, medido, emReais, mesDeReferencia,
  custoDeIaNoPeriodo, montarDre, porProjeto, MEDICAO_DE_IA_COMPLETA_DESDE,
} from "@/lib/agency/financeiro/dre";

const AGOSTO = mesDeReferencia("2026-08");

beforeEach(() => {
  db.aIRunLog.findMany.mockReset().mockResolvedValue([]);
  db.lancamentoFinanceiro.findMany.mockReset().mockResolvedValue([]);
});

describe("Dinheiro — os três estados", () => {
  it("BARRA: soma com uma parcela NÃO MEDIDA não vira número", () => {
    const r = somar([
      { rotulo: "receita", valor: medido(100_00, "manual") },
      { rotulo: "custo de IA", valor: { estado: "nao_medido", motivo: "provedor não devolveu uso" } },
    ]);
    expect(r.estado).toBe("nao_medido");
    expect(r.estado === "nao_medido" && r.motivo).toContain("custo de IA");
  });

  it("NÃO INVENTA: soma de medidos soma", () => {
    const r = somar([
      { rotulo: "a", valor: medido(100_00, "manual") },
      { rotulo: "b", valor: medido(50_00, "contrato") },
    ]);
    expect(r).toMatchObject({ estado: "medido", centavos: 150_00 });
  });

  it("NÃO INVENTA: janela vazia é 'nada lançado' — que É zero de verdade, e diz isso", () => {
    const r = somar([{ rotulo: "a", valor: { estado: "nao_lancado", motivo: "mês vazio" } }]);
    expect(r.estado).toBe("nao_lancado");
    expect(emReais(r)).toBe("nada lançado");
  });

  it("BARRA: BRL + USD sem câmbio não produz número", () => {
    const r = somar([
      { rotulo: "custo BRL", valor: medido(100_00, "manual", "BRL") },
      { rotulo: "custo IA", valor: medido(3_00, "registro_de_ia", "USD") },
    ]);
    expect(r.estado).toBe("nao_medido");
    expect(r.estado === "nao_medido" && r.motivo).toContain("câmbio");
  });

  it("a tela NUNCA recebe 'R$ 0,00' para o que não foi medido", () => {
    expect(emReais({ estado: "nao_medido", motivo: "x" })).toBe("não medido");
    expect(emReais(medido(0, "manual"))).toBe("R$ 0,00");   // zero MEDIDO continua sendo zero
  });

  it("subtração herda a disciplina: resultado com custo desconhecido é desconhecido", () => {
    const r = subtrair(
      { rotulo: "receita", valor: medido(1000_00, "contrato") },
      { rotulo: "custo", valor: { estado: "nao_medido", motivo: "ninguém lançou" } },
    );
    expect(r.estado).toBe("nao_medido");
  });
});

describe("custo de IA — a pergunta do CEO", () => {
  it("BARRA: chamada SEM preço não conta como custo zero", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { agentId: "social-copy", clientId: "c1", departmentId: "social-media", custoEstimadoUsd: null },
      { agentId: "social-copy", clientId: "c1", departmentId: "social-media", custoEstimadoUsd: null },
    ]);
    const r = await custoDeIaNoPeriodo("w1", AGOSTO);
    expect(r.total.estado).toBe("nao_medido");
    expect(r.chamadas).toBe(2);
    expect(r.chamadasSemPreco).toBe(2);
  });

  it("NÃO INVENTA: período sem nenhuma chamada é 'nada lançado', não 'não medido'", async () => {
    const r = await custoDeIaNoPeriodo("w1", AGOSTO);
    expect(r.total.estado).toBe("nao_lancado");
  });

  it("BARRA: falha de LEITURA não vira o fato 'não gastou'", async () => {
    db.aIRunLog.findMany.mockRejectedValue(new Error("banco fora do ar"));
    const r = await custoDeIaNoPeriodo("w1", AGOSTO);
    expect(r.total.estado).toBe("nao_medido");
    expect(r.total.estado === "nao_medido" && r.total.motivo).toContain("não consegui ler");
  });

  it("quebra por AGENTE e por CLIENTE, e o gasto sem cliente aparece SEPARADO", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { agentId: "social-copy", clientId: "c1", departmentId: "social-media", custoEstimadoUsd: 0.10 },
      { agentId: "design-criativo-social", clientId: "c1", departmentId: "design", custoEstimadoUsd: 0.25 },
      { agentId: "radar-tendencias", clientId: null, departmentId: "strategy", custoEstimadoUsd: 0.05 },
    ]);
    const r = await custoDeIaNoPeriodo("w1", AGOSTO, (id) => (id === "c1" ? "Foocci" : id));
    expect(r.total).toMatchObject({ estado: "medido", centavos: 40, moeda: "USD" });
    expect(r.porAgente[0]).toMatchObject({ id: "design-criativo-social", label: "Criativo de social" });
    expect(r.porCliente.map((l) => l.label)).toContain("Foocci");
    expect(r.porCliente.map((l) => l.label)).toContain("Casa (sem cliente)");
  });

  it("chamada gravada SEM DONO é contada e nomeada — não some na média", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { agentId: null, clientId: null, departmentId: "desconhecido", custoEstimadoUsd: 0.5 },
    ]);
    const r = await custoDeIaNoPeriodo("w1", AGOSTO);
    expect(r.chamadasSemDono).toBe(1);
    expect(r.porAgente[0].label).toBe("SEM DONO DECLARADO");
  });

  it("período anterior à cobertura completa sai MARCADO como parcial", async () => {
    const julho = mesDeReferencia("2026-07");
    expect(julho.inicio < MEDICAO_DE_IA_COMPLETA_DESDE).toBe(true);
    const r = await custoDeIaNoPeriodo("w1", julho);
    expect(r.periodoParcial).toBe(true);
    const depois = await custoDeIaNoPeriodo("w1", mesDeReferencia("2026-09"));
    expect(depois.periodoParcial).toBe(false);
  });
});

describe("o DRE", () => {
  it("mês vazio: nenhuma linha vira R$ 0,00 escondido — a falta é declarada", async () => {
    const dre = await montarDre("w1", AGOSTO);
    expect(dre.receita.valor.estado).toBe("nao_lancado");
    expect(dre.ressalvas.join(" ")).toContain("Nenhum faturamento lançado");
  });

  it("estimado NÃO entra no resultado — fica em linha própria", async () => {
    db.lancamentoFinanceiro.findMany.mockResolvedValue([
      { tipo: "receita", categoria: "mensalidade", valorCentavos: 300000, moeda: "BRL", origem: "contrato", natureza: "realizado" },
      { tipo: "receita", categoria: "projeto", valorCentavos: 900000, moeda: "BRL", origem: "manual", natureza: "estimado" },
      { tipo: "custo", categoria: "midia", valorCentavos: 100000, moeda: "BRL", origem: "manual", natureza: "realizado" },
      { tipo: "custo", categoria: "ferramenta", valorCentavos: 50000, moeda: "BRL", origem: "manual", natureza: "realizado" },
    ]);
    const dre = await montarDre("w1", AGOSTO);
    expect(dre.receita.valor).toMatchObject({ centavos: 300000 });
    expect(dre.receitaEstimada.valor).toMatchObject({ centavos: 900000 });
    expect(dre.custoDireto.valor).toMatchObject({ centavos: 100000 });
    expect(dre.despesa.valor).toMatchObject({ centavos: 50000 });
    // 3000 − (1000 + 500) = 1500. Se o estimado tivesse entrado, daria 10500.
    expect(dre.resultado.valor).toMatchObject({ centavos: 150000 });
  });

  it("toda linha carrega PROCEDÊNCIA — número sem origem não sobe para a tela", async () => {
    const dre = await montarDre("w1", AGOSTO);
    for (const linha of [dre.receita, dre.receitaEstimada, dre.custoDireto, dre.despesa, dre.resultado]) {
      expect(linha.procedencia.trim().length).toBeGreaterThan(10);
    }
  });

  it("custo de IA em dólar NÃO é convertido em silêncio — vira ressalva", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { agentId: "social-copy", clientId: "c1", departmentId: "social-media", custoEstimadoUsd: 2 },
    ]);
    const dre = await montarDre("w1", AGOSTO);
    expect(dre.ressalvas.join(" ")).toContain("não há câmbio declarado");
    expect(dre.resultado.procedencia).toContain("NÃO inclui o custo de IA");
  });

  it("livro ilegível: as linhas ficam 'não medido' e a ressalva diz o motivo", async () => {
    db.lancamentoFinanceiro.findMany.mockRejectedValue(new Error("sem banco"));
    const dre = await montarDre("w1", AGOSTO);
    expect(dre.receita.valor.estado).toBe("nao_medido");
    expect(dre.ressalvas.join(" ")).toContain("NÃO são zero");
  });
});

describe("'este projeto se paga?'", () => {
  it("o projeto que consome IA e não fatura APARECE — e aparece primeiro", async () => {
    db.lancamentoFinanceiro.findMany.mockResolvedValue([
      { tipo: "receita", valorCentavos: 500000, moeda: "BRL", origem: "contrato", clientId: "c1", centroDeCusto: null },
      { tipo: "custo", valorCentavos: 800000, moeda: "BRL", origem: "manual", clientId: "c2", centroDeCusto: null },
    ]);
    db.aIRunLog.findMany.mockResolvedValue([
      { agentId: "social-copy", clientId: "c2", departmentId: "social-media", custoEstimadoUsd: 9 },
    ]);
    const linhas = await porProjeto("w1", AGOSTO, (id) => (id === "c1" ? "Foocci" : "CityJobs"));
    // c2 dá prejuízo (custo sem receita) e tem que vir na frente, não no rodapé.
    expect(linhas[0].label).toBe("CityJobs");
    expect(linhas[0].resultado).toMatchObject({ centavos: -800000 });
    expect(linhas[0].chamadasDeIa).toBe(1);
    // O que não teve receita lançada não vira "faturou R$ 0,00".
    expect(linhas[0].receita.estado).toBe("nao_lancado");
    expect(linhas.find((l) => l.label === "Foocci")?.resultado).toMatchObject({ centavos: 500000 });
  });
});
