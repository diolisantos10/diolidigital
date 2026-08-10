// A leitura da conta do cliente.
//
// A trava central deste arquivo é sobre NÚMERO: **nulo é "não medido", zero é
// "a plataforma devolveu zero"**. Tratar os dois igual faz a agência declarar
// fracasso onde houve silêncio — e aprender a lição errada para sempre.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  metricaDePost: { findMany: vi.fn(), createMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  buscarNaPlataforma, guardarMetricas, desempenhoDoCliente, podeConcluirAlgo, MINIMO_PARA_CONCLUIR,
} from "@/lib/agency/medicao/leitura-da-conta";

function linha(over: Record<string, unknown> = {}) {
  return {
    externalPostId: "ig_1", alcance: 1000, curtidas: 50, comentarios: 10,
    salvamentos: 5, compartilham: 5, cliques: null,
    lidoEm: new Date("2026-08-09T10:00:00Z"), origem: "api",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.metricaDePost.createMany.mockResolvedValue({ count: 1 });
});

describe("a busca na plataforma está FECHADA até existir parecer", () => {
  it("devolve não_verificado — não uma lista vazia, não um zero", async () => {
    // Lista vazia diria "não teve nada". Zero diria "foi mal". As duas seriam
    // mentira: a verdade é que a casa ainda não sabe se PODE ler.
    const r = await buscarNaPlataforma("cli1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("nao_verificado");
    expect(r.detalhe).toMatch(/parecer/i);
  });

  it("o motivo diz que o que falta NÃO é código", () => {
    // Para ninguém, daqui a um mês, "consertar" isto escrevendo a chamada.
    return buscarNaPlataforma("cli1").then((r) => {
      if (r.ok) throw new Error("deveria estar fechada");
      expect(r.detalhe).toMatch(/não é código|nao é código/i);
    });
  });
});

describe("nulo é NÃO MEDIDO, e nunca vira zero", () => {
  it("post sem nenhuma métrica fica FORA do ranking", async () => {
    db.metricaDePost.findMany.mockResolvedValue([
      linha({ externalPostId: "ig_vazio", alcance: null, curtidas: null, comentarios: null, salvamentos: null, compartilham: null, cliques: null }),
    ]);
    const r = await desempenhoDoCliente("cli1");
    expect(r.ranking).toEqual([]);
    expect(r.semMedicao).toEqual(["ig_vazio"]);
  });

  it("a metade oposta: post medido entra e é somado", async () => {
    db.metricaDePost.findMany.mockResolvedValue([linha()]);
    const r = await desempenhoDoCliente("cli1");
    expect(r.ranking[0]!.interacoes).toBe(70);
    expect(r.semMedicao).toEqual([]);
  });

  it("métrica ausente não entra na soma como zero", async () => {
    // 50 + 10, com o resto nulo. Se nulo virasse zero o total seria o mesmo —
    // mas a soma tem de vir de DOIS medidos, não de seis.
    db.metricaDePost.findMany.mockResolvedValue([
      linha({ salvamentos: null, compartilham: null, cliques: null }),
    ]);
    const r = await desempenhoDoCliente("cli1");
    expect(r.ranking[0]!.interacoes).toBe(60);
  });

  it("alcance zero não vira divisão — a taxa fica nula", async () => {
    db.metricaDePost.findMany.mockResolvedValue([linha({ alcance: 0 })]);
    const r = await desempenhoDoCliente("cli1");
    expect(r.ranking[0]!.taxa).toBeNull();
  });
});

describe("o ranking não compara o que não é comparável", () => {
  it("quem tem taxa vem antes de quem não tem", async () => {
    db.metricaDePost.findMany.mockResolvedValue([
      linha({ externalPostId: "sem_taxa", alcance: null, curtidas: 900, comentarios: null, salvamentos: null, compartilham: null }),
      linha({ externalPostId: "com_taxa", alcance: 100, curtidas: 10, comentarios: null, salvamentos: null, compartilham: null }),
    ]);
    const r = await desempenhoDoCliente("cli1");
    expect(r.ranking[0]!.externalPostId).toBe("com_taxa");
  });

  it("usa a leitura MAIS RECENTE de cada post", async () => {
    db.metricaDePost.findMany.mockResolvedValue([
      linha({ curtidas: 99, lidoEm: new Date("2026-08-09T10:00:00Z") }),
      linha({ curtidas: 1, lidoEm: new Date("2026-08-01T10:00:00Z") }),
    ]);
    const r = await desempenhoDoCliente("cli1");
    expect(r.ranking.length).toBe(1);
    expect(r.ranking[0]!.interacoes).toBe(119);
  });
});

describe("a casa declara quando ainda não pode concluir nada", () => {
  it("poucos posts medidos NÃO sustentam conclusão", async () => {
    db.metricaDePost.findMany.mockResolvedValue([linha()]);
    const r = await podeConcluirAlgo("cli1");
    expect(r.pode).toBe(false);
    expect(r.falta).toBe(MINIMO_PARA_CONCLUIR - 1);
  });

  it("a metade oposta: com o mínimo, pode", async () => {
    db.metricaDePost.findMany.mockResolvedValue(
      Array.from({ length: MINIMO_PARA_CONCLUIR }, (_, i) => linha({ externalPostId: `ig_${i}` })),
    );
    const r = await podeConcluirAlgo("cli1");
    expect(r.pode).toBe(true);
  });
});

describe("guardar não sobrescreve — desempenho é curva", () => {
  it("cada leitura vira uma linha nova", async () => {
    await guardarMetricas("cli1", [
      { externalPostId: "ig_1", alcance: 10, curtidas: 1, comentarios: null, salvamentos: null, compartilham: null, cliques: null, lidoEm: new Date() },
    ]);
    expect(db.metricaDePost.createMany).toHaveBeenCalled();
  });

  it("nada para guardar não chama o banco", async () => {
    const n = await guardarMetricas("cli1", []);
    expect(n).toBe(0);
    expect(db.metricaDePost.createMany).not.toHaveBeenCalled();
  });

  it("banco fora do ar não lança — devolve zero guardadas", async () => {
    db.metricaDePost.createMany.mockRejectedValue(new Error("db down"));
    const n = await guardarMetricas("cli1", [
      { externalPostId: "ig_1", alcance: 1, curtidas: null, comentarios: null, salvamentos: null, compartilham: null, cliques: null, lidoEm: new Date() },
    ]);
    expect(n).toBe(0);
  });
});
