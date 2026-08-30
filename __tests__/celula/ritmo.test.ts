// O LIMITADOR DE RITMO — item obrigatório da ordem do CEO de 30/08/2026.
//
// A trava existe por causa de um incidente que não é do 99Freelas: em
// 03/08/2026 a Meta restringiu a conta de anúncios da agência por operação em
// ritmo de máquina. Aqui a conta é a PESSOAL do CEO, e o banimento do
// 99Freelas alcança outras contas do mesmo titular.

import { describe, it, expect } from "vitest";
import {
  avaliarRitmo,
  configuracaoDeRitmo,
  type ConfiguracaoDeRitmo,
  type HistoricoDeRitmo,
} from "@/lib/agency/celula/ritmo";

const CFG: ConfiguracaoDeRitmo = {
  intervaloMinimoSegundos: 45,
  maximoPorHora: 20,
  maximoPorDia: 80,
};
const AGORA = new Date("2026-08-30T12:00:00Z");
const LIMPO: HistoricoDeRitmo = { ultimaAcaoEm: null, acoesNaUltimaHora: 0, acoesNoDia: 0 };

describe("a configuração vem da política, não do código", () => {
  it("lê os números reais de policy.json → ritmo_de_operacao", () => {
    const c = configuracaoDeRitmo();
    expect(c).not.toBeNull();
    expect(c!.intervaloMinimoSegundos).toBeGreaterThan(0);
    expect(c!.maximoPorHora).toBeGreaterThan(0);
    expect(c!.maximoPorDia).toBeGreaterThan(0);
  });

  it("configuração ausente ou malformada BLOQUEIA — nunca vira ritmo livre", () => {
    for (const ruim of [
      {},
      { ritmo_de_operacao: null },
      { ritmo_de_operacao: { maximo_de_acoes_por_hora: 20, maximo_de_acoes_por_dia: 80 } },
      { ritmo_de_operacao: { intervalo_minimo_entre_acoes_segundos: 0, maximo_de_acoes_por_hora: 20, maximo_de_acoes_por_dia: 80 } },
      { ritmo_de_operacao: { intervalo_minimo_entre_acoes_segundos: -5, maximo_de_acoes_por_hora: 20, maximo_de_acoes_por_dia: 80 } },
      { ritmo_de_operacao: { intervalo_minimo_entre_acoes_segundos: "45", maximo_de_acoes_por_hora: 20, maximo_de_acoes_por_dia: 80 } },
    ]) {
      expect(configuracaoDeRitmo(ruim), JSON.stringify(ruim)).toBeNull();
    }
  });

  it("sem configuração, NADA age — ausência de limite não é permissão de correr", () => {
    const v = avaliarRitmo(LIMPO, AGORA, null);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.regra).toBe("sem_configuracao");
  });
});

describe("o caso limpo — a metade gêmea", () => {
  it("primeira ação do dia passa", () => {
    expect(avaliarRitmo(LIMPO, AGORA, CFG).pode).toBe(true);
  });

  it("passado o intervalo mínimo, passa", () => {
    const h: HistoricoDeRitmo = {
      ultimaAcaoEm: new Date(AGORA.getTime() - 46_000),
      acoesNaUltimaHora: 3,
      acoesNoDia: 10,
    };
    expect(avaliarRitmo(h, AGORA, CFG).pode).toBe(true);
  });
});

describe("o intervalo mínimo — o que separa ritmo humano de ritmo de máquina", () => {
  it("BLOQUEIA antes do intervalo, e diz quando tentar de novo", () => {
    const ultima = new Date(AGORA.getTime() - 10_000);
    const v = avaliarRitmo({ ultimaAcaoEm: ultima, acoesNaUltimaHora: 1, acoesNoDia: 1 }, AGORA, CFG);
    expect(v.pode).toBe(false);
    if (!v.pode) {
      expect(v.regra).toBe("cedo_demais");
      expect(v.tentarDeNovoEm).toEqual(new Date(ultima.getTime() + 45_000));
      expect(v.motivo).toMatch(/Meta/);
    }
  });

  it("exatamente no limite ainda BLOQUEIA — a borda erra para o lado seguro", () => {
    const ultima = new Date(AGORA.getTime() - 45_000 + 1);
    expect(avaliarRitmo({ ultimaAcaoEm: ultima, acoesNaUltimaHora: 1, acoesNoDia: 1 }, AGORA, CFG).pode).toBe(false);
  });
});

describe("os tetos", () => {
  it("teto da hora bloqueia e manda tentar daqui a uma hora", () => {
    const v = avaliarRitmo({ ultimaAcaoEm: new Date(AGORA.getTime() - 600_000), acoesNaUltimaHora: 20, acoesNoDia: 30 }, AGORA, CFG);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.regra).toBe("teto_da_hora");
  });

  it("teto do dia bloqueia, e VENCE o da hora — a espera informada é a mais longa que se aplica", () => {
    // Bateu os dois tetos ao mesmo tempo. Se a hora respondesse primeiro, o
    // chamador voltaria a cada hora até descobrir que o dia acabou — e cada
    // volta é uma batida a mais na porta da plataforma.
    const v = avaliarRitmo({ ultimaAcaoEm: new Date(AGORA.getTime() - 600_000), acoesNaUltimaHora: 20, acoesNoDia: 80 }, AGORA, CFG);
    expect(v.pode).toBe(false);
    if (!v.pode) {
      expect(v.regra).toBe("teto_do_dia");
      expect(v.tentarDeNovoEm).toEqual(new Date("2026-08-31T00:00:00Z"));
    }
  });

  it("o teto é >=, não > — a 80ª ação não pode virar a 81ª", () => {
    expect(avaliarRitmo({ ...LIMPO, acoesNoDia: 79 }, AGORA, CFG).pode).toBe(true);
    expect(avaliarRitmo({ ...LIMPO, acoesNoDia: 80 }, AGORA, CFG).pode).toBe(false);
  });
});

describe("histórico ilegível bloqueia — não saber quantas ações houve é não ter freio", () => {
  it("contagens ausentes, negativas ou não numéricas BLOQUEIAM", () => {
    for (const h of [
      { ultimaAcaoEm: null, acoesNaUltimaHora: -1, acoesNoDia: 0 },
      { ultimaAcaoEm: null, acoesNaUltimaHora: 0, acoesNoDia: undefined },
      { ultimaAcaoEm: null, acoesNaUltimaHora: "3", acoesNoDia: 0 },
      { ultimaAcaoEm: null, acoesNaUltimaHora: NaN, acoesNoDia: 0 },
    ]) {
      const v = avaliarRitmo(h as unknown as HistoricoDeRitmo, AGORA, CFG);
      expect(v.pode, JSON.stringify(h)).toBe(false);
    }
  });

  it("última ação NO FUTURO bloqueia — relógio torto não vira crédito de tempo", () => {
    const futuro = new Date(AGORA.getTime() + 60_000);
    const v = avaliarRitmo({ ultimaAcaoEm: futuro, acoesNaUltimaHora: 1, acoesNoDia: 1 }, AGORA, CFG);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.regra).toBe("historico_ilegivel");
  });

  it("data da última ação inválida bloqueia", () => {
    const v = avaliarRitmo(
      { ultimaAcaoEm: new Date("nao-e-data"), acoesNaUltimaHora: 1, acoesNoDia: 1 },
      AGORA,
      CFG,
    );
    expect(v.pode).toBe(false);
  });
});
