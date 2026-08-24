// A SÉRIE — o passado mínimo, e o que ele se recusa a guardar.
//
// Antes de 24/08/2026 o detector de "parou de chegar" existia e não tinha o que
// comparar. Detector que só funciona no teste é o mesmo verde que esta casa
// aprendeu a não aceitar.
//
// As duas metades deste arquivo:
//   1. a série guarda NOME de evento, e só isso;
//   2. sem período anterior, o estado é NÃO MEDIDO — primeiro período de
//      cliente novo não nasce verde por falta de passado.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  medicaoDeEventos: { upsert: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import {
  registrarPeriodo, eventosDoPeriodoAnterior, passadoDasCampanhas, chaveDaMedicao,
} from "@/lib/agency/medicao/serie";
import { conciliarCampanhaDaMeta, confiavel } from "@/lib/agency/medicao/conciliacao";
import { medirIntegridade, relatorioConfiavel } from "@/lib/agency/medicao/integridade-do-panorama";
import { medirContaComSerie } from "@/lib/agency/medicao/medir-conta-com-serie";
import type { DesempenhoDaCampanha } from "@/lib/integrations/meta/ads-leitura";

const PERIODO = { desde: "2026-08-01", ate: "2026-08-31" };

beforeEach(() => {
  vi.clearAllMocks();
  db.medicaoDeEventos.upsert.mockResolvedValue({});
  db.medicaoDeEventos.findFirst.mockResolvedValue(null);
  db.medicaoDeEventos.findMany.mockResolvedValue([]);
});

describe("a série guarda o mínimo — nome de evento, e nada além", () => {
  it("grava só os NOMES: nem quantidade, nem gasto, nem público", async () => {
    await registrarPeriodo({
      campanhaId: "c1", contaId: "act_1", periodo: PERIODO,
      eventos: ["lead", "link_click", "lead"],
    });
    const { create } = db.medicaoDeEventos.upsert.mock.calls[0]![0];
    expect(create.eventos).toBe("lead,link_click");           // ordenado e sem repetição
    expect(Object.keys(create).sort()).toEqual(
      ["ate", "campanhaId", "contaId", "desde", "eventos", "id"],
    );
    // A prova negativa: nenhum número de desempenho atravessa para o banco.
    expect(JSON.stringify(create)).not.toMatch(/gasto|spend|quantidade|valor|alcance|impress/i);
  });

  it("a chave é determinística — duas réplicas colidem em vez de duplicar", async () => {
    expect(chaveDaMedicao("c1", "2026-08-01", "2026-08-31")).toBe("c1:2026-08-01:2026-08-31");
    await registrarPeriodo({ campanhaId: "c1", contaId: "act_1", periodo: PERIODO, eventos: [] });
    expect(db.medicaoDeEventos.upsert.mock.calls[0]![0].where.id).toBe("c1:2026-08-01:2026-08-31");
  });

  it("leitura que NÃO respondeu não vira linha vazia — isso seria falha disfarçada de fato", async () => {
    const gravou = await registrarPeriodo({ campanhaId: "c1", contaId: "act_1", periodo: PERIODO, eventos: null });
    expect(gravou).toBe(false);
    expect(db.medicaoDeEventos.upsert).not.toHaveBeenCalled();
  });

  it("banco fora do ar não derruba a leitura do cliente, e não mente", async () => {
    db.medicaoDeEventos.upsert.mockRejectedValue(new Error("disco cheio"));
    await expect(registrarPeriodo({ campanhaId: "c1", contaId: "act_1", periodo: PERIODO, eventos: ["lead"] }))
      .resolves.toBe(false);
  });
});

describe("linha ausente ≠ linha vazia", () => {
  it("sem período anterior: null (não sei)", async () => {
    expect(await eventosDoPeriodoAnterior("c1", PERIODO)).toBeNull();
  });

  it("período anterior sem evento nenhum: [] (sei, e não veio nada)", async () => {
    db.medicaoDeEventos.findFirst.mockResolvedValue({ eventos: "" });
    expect(await eventosDoPeriodoAnterior("c1", PERIODO)).toEqual([]);
  });

  it("banco fora do ar é passado DESCONHECIDO, nunca 'não faltou nada'", async () => {
    db.medicaoDeEventos.findFirst.mockRejectedValue(new Error("timeout"));
    expect(await eventosDoPeriodoAnterior("c1", PERIODO)).toBeNull();
  });

  it("só compara com período que TERMINOU antes deste — nunca consigo mesmo", async () => {
    await eventosDoPeriodoAnterior("c1", PERIODO);
    expect(db.medicaoDeEventos.findFirst.mock.calls[0]![0].where.ate).toEqual({ lt: "2026-08-01" });
  });

  it("o passado em lote pega o mais recente de cada campanha, e omite quem não tem", async () => {
    db.medicaoDeEventos.findMany.mockResolvedValue([
      { campanhaId: "c1", eventos: "lead,link_click" },
      { campanhaId: "c1", eventos: "lead" },          // mais antigo, ignorado
    ]);
    const mapa = await passadoDasCampanhas(["c1", "c2"], PERIODO);
    expect(mapa.c1).toEqual(["lead", "link_click"]);
    expect(mapa.c2).toBeUndefined();                  // sem passado = ausente = null
  });
});

describe("PRIMEIRO PERÍODO NÃO NASCE VERDE", () => {
  it("evento esperado chegou, mas sem passado: NÃO MEDIDO, não íntegro", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { lead: 40 }, eventosAntes: null });
    expect(c.estado).toBe("nao_medido");
    expect(c.comparacaoRodou).toBe(false);
    expect(confiavel(c)).toBe(false);
    expect(c.motivo).toMatch(/não há período anterior registrado/);
  });

  it("com passado, o mesmo dado vira íntegro — a segunda leitura é que fecha", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { lead: 40 }, eventosAntes: ["lead"] });
    expect(c.estado).toBe("integro");
  });

  it("o evento declarado que NUNCA chegou é dito mesmo sem passado — achado concreto vale", () => {
    const c = conciliarCampanhaDaMeta({ objetivo: "OUTCOME_LEADS", acoes: { link_click: 9 }, eventosAntes: null });
    expect(c.estado).toBe("incompleto");
    expect(c.faltando[0]!.nome).toBe("lead");
  });

  it("o panorama de uma conta nova inteira sai NÃO MEDIDO", () => {
    const d: DesempenhoDaCampanha = {
      campanhaId: "c1", nome: "Padaria", objetivo: "OUTCOME_LEADS",
      gasto: 300, impressoes: 1, alcance: 1, frequencia: 1, cliques: 1,
      cpm: null, cpc: null, ctrPct: null, resultado: null, custoPorResultado: null,
      acoes: { lead: 40 }, naoMedido: [],
    };
    const i = medirIntegridade({
      desempenho: [d],
      totais: { gasto: 300, impressoes: 1, alcance: 1, cliques: 1 },
      passado: {},                                  // conta nova: sem série
    });
    expect(i.estado).toBe("nao_medido");
    expect(relatorioConfiavel(i)).toBe(false);
    expect(i.totais.gasto!.confiavel).toBe(false);
  });
});

// ── O DETECTOR LIGADO NO CAMINHO REAL ───────────────────────────────────────
//
// Estes testes são a resposta à pergunta "'parou de chegar' morde em produção
// ou só no teste?". Eles exercem a MESMA função que a rota chama, com o banco
// mockado — não o texto do arquivo da rota.

const campanhaLead = (over: Partial<DesempenhoDaCampanha> = {}): DesempenhoDaCampanha => ({
  campanhaId: "c1", nome: "Padaria — leads", objetivo: "OUTCOME_LEADS",
  gasto: 300, impressoes: 10_000, alcance: 8_000, frequencia: 1, cliques: 200,
  cpm: null, cpc: null, ctrPct: null, resultado: null, custoPorResultado: null,
  acoes: { lead: 40 }, naoMedido: [], ...over,
});
const TOTAIS = { gasto: 300, impressoes: 10_000, alcance: 8_000, cliques: 200 };

describe("o caminho real: lê o passado, mede contra ele, grava o presente", () => {
  it("O CASO DO CASE, ponta a ponta: o evento chegava, parou, e o relatório denuncia", async () => {
    // Mês passado a campanha entregou `lead`. Este mês, só `link_click`.
    db.medicaoDeEventos.findMany.mockResolvedValue([{ campanhaId: "c1", eventos: "lead,link_click" }]);

    const i = await medirContaComSerie({
      contaId: "act_1", periodo: PERIODO, totais: TOTAIS,
      desempenho: [campanhaLead({ acoes: { link_click: 200 } })],
    });

    expect(i.estado).toBe("incompleto");
    const faltando = i.porCampanha[0]!.conciliacao.faltando;
    expect(faltando.map((f) => f.como)).toContain("parou_de_chegar");
    expect(i.aviso).toContain("lead");
    // E o número não sai limpo.
    expect(i.totais.gasto!.confiavel).toBe(false);
    expect(i.totais.gasto!.texto).toContain("INCOMPLETO");
  });

  it("sem ler o passado, o mesmo dado íntegro sairia NÃO MEDIDO — o detector desligado não fica verde", async () => {
    db.medicaoDeEventos.findMany.mockResolvedValue([]);   // série vazia
    const i = await medirContaComSerie({
      contaId: "act_1", periodo: PERIODO, totais: TOTAIS, desempenho: [campanhaLead()],
    });
    expect(i.estado).toBe("nao_medido");
    expect(relatorioConfiavel(i)).toBe(false);
  });

  it("com passado, o mesmo dado fecha íntegro", async () => {
    db.medicaoDeEventos.findMany.mockResolvedValue([{ campanhaId: "c1", eventos: "lead" }]);
    const i = await medirContaComSerie({
      contaId: "act_1", periodo: PERIODO, totais: TOTAIS, desempenho: [campanhaLead()],
    });
    expect(i.estado).toBe("integro");
    expect(relatorioConfiavel(i)).toBe(true);
  });

  it("GRAVA este período — sem isso, amanhã não há passado", async () => {
    await medirContaComSerie({
      contaId: "act_1", periodo: PERIODO, totais: TOTAIS, desempenho: [campanhaLead()],
    });
    expect(db.medicaoDeEventos.upsert).toHaveBeenCalledTimes(1);
    const { create } = db.medicaoDeEventos.upsert.mock.calls[0]![0];
    expect(create).toMatchObject({ campanhaId: "c1", contaId: "act_1", eventos: "lead", desde: "2026-08-01" });
  });

  it("BUSCA o passado, e só o que terminou antes deste período", async () => {
    await medirContaComSerie({
      contaId: "act_1", periodo: PERIODO, totais: TOTAIS, desempenho: [campanhaLead()],
    });
    const where = db.medicaoDeEventos.findMany.mock.calls[0]![0].where;
    expect(where.campanhaId).toEqual({ in: ["c1"] });
    expect(where.ate).toEqual({ lt: "2026-08-01" });
  });
});
