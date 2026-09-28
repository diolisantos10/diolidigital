import { describe, it, expect } from "vitest";
import {
  ordenarPagasAntesDeSelecionadas,
  duracaoDoPlanoEmDias,
  repostAindaElegivel,
  legendaDoRepost,
  legendaIdentica,
  minutoDoRepostNaJanela,
  dentroDaJanelaDeDuplicado,
  janelaDeDuplicadoEmDias,
  JANELA_DUPLICADO_FEED_DIAS,
  JANELA_DUPLICADO_STORY_DIAS,
  proximoSlotDoDia,
  type OcupanteDoDia,
} from "@/lib/integracoes/cityjobs/regras";

describe("ordem: pagas antes de selecionadas", () => {
  it("reordena pagas para a frente, preservando a ordem relativa dentro do mesmo grupo", () => {
    const itens = [
      { id: "s1", prioridade: "selecionada" as const },
      { id: "p1", prioridade: "paga" as const },
      { id: "s2", prioridade: "selecionada" as const },
      { id: "p2", prioridade: "paga" as const },
    ];
    const ordenado = ordenarPagasAntesDeSelecionadas(itens).map((i) => i.id);
    expect(ordenado).toEqual(["p1", "p2", "s1", "s2"]);
  });

  it("lista vazia não quebra", () => {
    expect(ordenarPagasAntesDeSelecionadas([])).toEqual([]);
  });
});

describe("proximoSlotDoDia — a paga empurra a selecionada mais antiga do dia", () => {
  const t0 = new Date("2026-09-01T00:00:00Z");
  const t1 = new Date("2026-09-01T00:01:00Z");

  it("dia com vaga livre: não empurra ninguém", () => {
    const ocupacao = new Map<number, OcupanteDoDia[]>([[0, [{ id: "s1", prioridade: "selecionada", criadoEm: t0 }]]]);
    const d = proximoSlotDoDia({ ocupacaoPorDia: ocupacao, prioridade: "paga", tetoPorDia: 2, diaIndiceInicial: 0 });
    expect(d).toEqual({ diaIndice: 0 });
  });

  it("dia cheio de selecionadas: a PAGA empurra a mais ANTIGA", () => {
    const ocupacao = new Map<number, OcupanteDoDia[]>([
      [0, [
        { id: "s-nova", prioridade: "selecionada", criadoEm: t1 },
        { id: "s-antiga", prioridade: "selecionada", criadoEm: t0 },
      ]],
    ]);
    const d = proximoSlotDoDia({ ocupacaoPorDia: ocupacao, prioridade: "paga", tetoPorDia: 2, diaIndiceInicial: 0 });
    expect(d.diaIndice).toBe(0);
    expect(d.empurrado?.id).toBe("s-antiga");
  });

  it("dia cheio de pagas: uma nova PAGA não empurra — vai para o próximo dia com vaga", () => {
    const ocupacao = new Map<number, OcupanteDoDia[]>([
      [0, [
        { id: "p1", prioridade: "paga", criadoEm: t0 },
        { id: "p2", prioridade: "paga", criadoEm: t1 },
      ]],
    ]);
    const d = proximoSlotDoDia({ ocupacaoPorDia: ocupacao, prioridade: "paga", tetoPorDia: 2, diaIndiceInicial: 0 });
    expect(d).toEqual({ diaIndice: 1 });
  });

  it("uma SELECIONADA nova NUNCA empurra ninguém — só ocupa vaga livre", () => {
    const ocupacao = new Map<number, OcupanteDoDia[]>([
      [0, [
        { id: "p1", prioridade: "paga", criadoEm: t0 },
        { id: "s1", prioridade: "selecionada", criadoEm: t1 },
      ]],
    ]);
    const d = proximoSlotDoDia({ ocupacaoPorDia: ocupacao, prioridade: "selecionada", tetoPorDia: 2, diaIndiceInicial: 0 });
    expect(d).toEqual({ diaIndice: 1 });
  });
});

describe("trava de duplicado — 7 dias feed / 3 dias stories", () => {
  it("os números são os do contrato", () => {
    expect(JANELA_DUPLICADO_FEED_DIAS).toBe(7);
    expect(JANELA_DUPLICADO_STORY_DIAS).toBe(3);
    expect(janelaDeDuplicadoEmDias("feed_imagem")).toBe(7);
    expect(janelaDeDuplicadoEmDias("carrossel")).toBe(7);
    expect(janelaDeDuplicadoEmDias("story")).toBe(3);
  });

  it("dentro da janela do feed (5 dias atrás)", () => {
    const agora = new Date("2026-09-28T12:00:00Z");
    const publicadoEm = new Date("2026-09-23T12:00:00Z");
    expect(dentroDaJanelaDeDuplicado(publicadoEm, agora, "feed_imagem")).toBe(true);
  });

  it("fora da janela do feed (8 dias atrás)", () => {
    const agora = new Date("2026-09-28T12:00:00Z");
    const publicadoEm = new Date("2026-09-20T12:00:00Z");
    expect(dentroDaJanelaDeDuplicado(publicadoEm, agora, "feed_imagem")).toBe(false);
  });

  it("gêmeo AGENDADO no futuro dentro da janela também é duplicado", () => {
    const agora = new Date("2026-09-28T12:00:00Z");
    const agendadoPara = new Date("2026-09-30T10:00:00Z");
    expect(dentroDaJanelaDeDuplicado(agendadoPara, agora, "feed_imagem")).toBe(true);
  });

  it("gêmeo agendado para além da janela não é duplicado", () => {
    const agora = new Date("2026-09-28T12:00:00Z");
    const agendadoPara = new Date("2026-10-10T10:00:00Z");
    expect(dentroDaJanelaDeDuplicado(agendadoPara, agora, "feed_imagem")).toBe(false);
  });

  it("story: 4 dias atrás já está fora (janela é 3)", () => {
    const agora = new Date("2026-09-28T12:00:00Z");
    const publicadoEm = new Date("2026-09-24T11:00:00Z");
    expect(dentroDaJanelaDeDuplicado(publicadoEm, agora, "story")).toBe(false);
  });
});

describe("repost de vaga paga — legenda variada e teto do plano", () => {
  it("plano de 5 dias corridos → 5 dias elegíveis, nunca 6", () => {
    const criadoEm = new Date("2026-09-28T10:00:00Z");
    const validadePlano = new Date("2026-10-03T10:00:00Z"); // +5 dias
    const dias = duracaoDoPlanoEmDias(criadoEm, validadePlano);
    expect(dias).toBe(5);
    expect(repostAindaElegivel(5, dias)).toBe(true);
    expect(repostAindaElegivel(6, dias)).toBe(false);
    expect(repostAindaElegivel(0, dias)).toBe(false);
  });

  it("a legenda do repost nunca é byte-idêntica entre dois dias", () => {
    const base = "Vaga aberta: Analista de Logística.";
    const dia1 = legendaDoRepost(base, 1, 5);
    const dia2 = legendaDoRepost(base, 2, 5);
    expect(legendaIdentica(dia1, dia2)).toBe(false);
    expect(dia1).toContain("dia 1 de 5");
    expect(dia2).toContain("dia 2 de 5");
  });

  it("o horário do repost varia por dia, dentro da janela declarada", () => {
    const inicio = 9 * 60; // 09:00
    const fim = 17 * 60; // 17:00
    const minutosPorDia = [1, 2, 3, 4, 5].map((d) => minutoDoRepostNaJanela("vaga-4821", d, inicio, fim));
    for (const m of minutosPorDia) {
      expect(m).toBeGreaterThanOrEqual(inicio);
      expect(m).toBeLessThanOrEqual(fim);
    }
    // Determinístico: recalcular o MESMO dia dá o MESMO minuto.
    expect(minutoDoRepostNaJanela("vaga-4821", 3, inicio, fim)).toBe(minutoDoRepostNaJanela("vaga-4821", 3, inicio, fim));
    // Nem todo dia cai no mesmo minuto (senão não seria "variando").
    expect(new Set(minutosPorDia).size).toBeGreaterThan(1);
  });
});
