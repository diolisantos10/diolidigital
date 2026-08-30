// TRAVA 3 — EXCEÇÃO VENCIDA GRITA. Prioridade → prazo como DADO, não `if`.
// Silêncio é proibido: com vencida, grita; sem nenhuma vencida, não inventa
// alarme.

import { describe, it, expect } from "vitest";
import { PRAZO_EM_MINUTOS_POR_PRIORIDADE } from "@/lib/agency/celula/excecoes/tipos";
import { excecoesVencidas, gritoDaFila } from "@/lib/agency/celula/excecoes/fila";

const AGORA = new Date("2026-08-30T12:00:00.000Z");

function minutosAtras(minutos: number): string {
  return new Date(AGORA.getTime() - minutos * 60_000).toISOString();
}

function minutosNoFuturo(minutos: number): string {
  return new Date(AGORA.getTime() + minutos * 60_000).toISOString();
}

describe("PRAZO_EM_MINUTOS_POR_PRIORIDADE — a tabela, como DADO", () => {
  it("p0 = 15 min, p1 = 2h, p2 = 24h", () => {
    expect(PRAZO_EM_MINUTOS_POR_PRIORIDADE.p0).toBe(15);
    expect(PRAZO_EM_MINUTOS_POR_PRIORIDADE.p1).toBe(120);
    expect(PRAZO_EM_MINUTOS_POR_PRIORIDADE.p2).toBe(1440);
  });
});

describe("excecoesVencidas — fail closed em 'agora' e na lista", () => {
  it("'agora' inválido → ok:false", () => {
    // @ts-expect-error propositalmente inválido, para provar o fail-closed
    const r1 = excecoesVencidas("hoje", []);
    expect(r1.ok).toBe(false);

    const r2 = excecoesVencidas(new Date("data-invalida"), []);
    expect(r2.ok).toBe(false);
  });

  it("lista undefined/null/não-array → ok:false", () => {
    for (const lista of [undefined, null, "x", 1]) {
      const r = excecoesVencidas(AGORA, lista);
      expect(r.ok, `deveria falhar para ${JSON.stringify(lista)}`).toBe(false);
    }
  });

  it("lista vazia → ok:true, vencidas: []", () => {
    const r = excecoesVencidas(AGORA, []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vencidas).toEqual([]);
  });
});

describe("excecoesVencidas — a metade suja: prazo estourado e aberta/em_tratamento entra", () => {
  it("uma exceção 'aberta' com prazoEm no passado é vencida, com vencidaHaMinutos correto", () => {
    const r = excecoesVencidas(AGORA, [
      {
        id: "exc-1",
        caso: "captcha",
        responsavel: "sdr",
        prioridade: "p0",
        estado: "aberta",
        prazoEm: minutosAtras(20),
        abertaEm: minutosAtras(35),
      },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.vencidas).toHaveLength(1);
      expect(r.vencidas[0].id).toBe("exc-1");
      expect(r.vencidas[0].caso).toBe("captcha");
      expect(r.vencidas[0].vencidaHaMinutos).toBe(20);
    }
  });

  it("'em_tratamento' também pode vencer", () => {
    const r = excecoesVencidas(AGORA, [
      { id: "exc-2", caso: "limite_atingido", responsavel: "gerente_de_atendimento", prioridade: "p2", estado: "em_tratamento", prazoEm: minutosAtras(5), abertaEm: minutosAtras(1440) },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vencidas).toHaveLength(1);
  });

  it("item com caso/responsavel/prioridade ilegíveis, mas id/prazoEm/estado legíveis, AINDA é reportado como vencido — com esses campos null (nunca inventados, nunca some)", () => {
    const r = excecoesVencidas(AGORA, [
      { id: "exc-corrompida", caso: "xpto", responsavel: "zzz", prioridade: "p9", estado: "aberta", prazoEm: minutosAtras(3), abertaEm: minutosAtras(10) },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.vencidas).toHaveLength(1);
      expect(r.vencidas[0].caso).toBeNull();
      expect(r.vencidas[0].responsavel).toBeNull();
      expect(r.vencidas[0].prioridade).toBeNull();
    }
  });
});

describe("excecoesVencidas — a metade limpa: dentro do prazo, resolvida ou sem identidade não entra", () => {
  it("prazoEm no futuro NÃO é vencida", () => {
    const r = excecoesVencidas(AGORA, [
      { id: "exc-3", caso: "arquivo_suspeito", responsavel: "sdr", prioridade: "p1", estado: "aberta", prazoEm: minutosNoFuturo(30), abertaEm: minutosAtras(90) },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vencidas).toEqual([]);
  });

  it("estado 'resolvida' com prazo no passado NÃO conta como vencida (já foi fechada)", () => {
    const r = excecoesVencidas(AGORA, [
      { id: "exc-4", caso: "captcha", responsavel: "sdr", prioridade: "p0", estado: "resolvida", prazoEm: minutosAtras(100), abertaEm: minutosAtras(200) },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vencidas).toEqual([]);
  });

  it("estado 'descartada' com prazo no passado também NÃO conta", () => {
    const r = excecoesVencidas(AGORA, [
      { id: "exc-5", caso: "captcha", responsavel: "sdr", prioridade: "p0", estado: "descartada", prazoEm: minutosAtras(100), abertaEm: minutosAtras(200) },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vencidas).toEqual([]);
  });

  it("item sem id legível é ignorado do cálculo (não há como identificá-lo com segurança)", () => {
    const r = excecoesVencidas(AGORA, [
      { id: 42, caso: "captcha", responsavel: "sdr", prioridade: "p0", estado: "aberta", prazoEm: minutosAtras(5), abertaEm: minutosAtras(20) },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vencidas).toEqual([]);
  });
});

describe("gritoDaFila — silêncio é proibido, nos dois sentidos", () => {
  it("sem nenhuma vencida, NÃO inventa alarme: totalVencidas 0, resumo diz 'em dia'", () => {
    const r = gritoDaFila(AGORA, []);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.grito.totalVencidas).toBe(0);
      expect(r.grito.maisAntiga).toBeNull();
      expect(r.grito.resumoEmPortugues.toLowerCase()).toContain("nenhuma exceção vencida");
    }
  });

  it("com vencidas, o grito não silencia: total, por caso, por responsável e a mais antiga", () => {
    const abertas = [
      { id: "a", caso: "captcha", responsavel: "sdr", prioridade: "p0", estado: "aberta", prazoEm: minutosAtras(10), abertaEm: minutosAtras(25) },
      { id: "b", caso: "captcha", responsavel: "sdr", prioridade: "p0", estado: "aberta", prazoEm: minutosAtras(50), abertaEm: minutosAtras(65) },
      { id: "c", caso: "limite_atingido", responsavel: "gerente_de_atendimento", prioridade: "p2", estado: "em_tratamento", prazoEm: minutosAtras(2), abertaEm: minutosAtras(1442) },
    ];
    const r = gritoDaFila(AGORA, abertas);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.grito.totalVencidas).toBe(3);
      expect(r.grito.porCaso["captcha"]).toBe(2);
      expect(r.grito.porCaso["limite_atingido"]).toBe(1);
      expect(r.grito.porResponsavel["sdr"]).toBe(2);
      expect(r.grito.porResponsavel["gerente_de_atendimento"]).toBe(1);
      expect(r.grito.maisAntiga?.id).toBe("b"); // vencida há mais tempo (50 min)
      expect(r.grito.resumoEmPortugues).toContain("3 exceção");
      expect(r.grito.resumoEmPortugues).not.toContain("Nenhuma exceção vencida");
    }
  });

  it("propaga o fail-closed de excecoesVencidas (lista ilegível) em vez de fingir que está tudo bem", () => {
    const r = gritoDaFila(AGORA, "não é uma lista");
    expect(r.ok).toBe(false);
  });
});
