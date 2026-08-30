// acompanhamento-unico.test.ts — a trava do M14: UM acompanhamento, e seis
// motivos para nenhum. Ver
// docs/celula-prospeccao/despachos/ONDA-2B-C-um-acompanhamento-so.md
//
// Cada trava com as DUAS metades: barra o caso plantado E libera o caso
// limpo. `policy.json` da 99Freelas tem `acompanhamento.intervalo_da_casa_horas: 72`
// e `maximo_por_oportunidade: 1` — os testes usam esses números reais, sem
// mockar o arquivo, porque a ficha pede o comportamento observável.

import { describe, it, expect } from "vitest";
import {
  podeAcompanhar,
  configuracaoDeAcompanhamento,
  type EstadoDaOportunidade,
} from "@/lib/agency/celula/mensagens/acompanhamento";

const AGORA = new Date("2026-08-30T12:00:00Z");

/** 100h antes de AGORA — bem acima do intervalo da casa (72h). */
const HA_100_HORAS = new Date(AGORA.getTime() - 100 * 3_600_000);

function estadoLimpo(overrides: Partial<EstadoDaOportunidade> = {}): EstadoDaOportunidade {
  return {
    referencia: "op-1",
    ultimaMensagemDaAgenciaEm: HA_100_HORAS,
    acompanhamentosJaEnviados: 0,
    clienteRecusou: false,
    projetoEncerrado: false,
    outraPessoaContratada: false,
    clientePediuParaNaoReceber: false,
    plataformaBloqueou: false,
    clienteRespondeu: false,
    ...overrides,
  };
}

// ── O caso limpo ──────────────────────────────────────────────────────────

describe("caso limpo", () => {
  it("libera: tudo false, zero acompanhamentos, 100 h desde a proposta", () => {
    const decisao = podeAcompanhar(estadoLimpo(), AGORA, "99freelas");
    expect(decisao.pode).toBe(true);
    expect(decisao.motivos).toEqual([]);
    expect(decisao.motivo).not.toBe("");
    expect(decisao.intervaloHoras).toBe(72);
    expect(decisao.horasDesdeAUltimaMensagem).toBe(100);
  });
});

// ── As seis condições do CEO, cada uma isolada ──────────────────────────────

describe("as seis condições do CEO — cada uma bloqueia sozinha e nomeia a si mesma", () => {
  it("cliente recusou", () => {
    const decisao = podeAcompanhar(estadoLimpo({ clienteRecusou: true }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("o cliente recusou"))).toBe(true);
  });

  it("projeto encerrado", () => {
    const decisao = podeAcompanhar(estadoLimpo({ projetoEncerrado: true }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("o projeto encerrou"))).toBe(true);
  });

  it("outra pessoa contratada", () => {
    const decisao = podeAcompanhar(estadoLimpo({ outraPessoaContratada: true }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("outra pessoa foi contratada"))).toBe(true);
  });

  it("cliente pediu para não receber", () => {
    const decisao = podeAcompanhar(estadoLimpo({ clientePediuParaNaoReceber: true }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("o cliente pediu para não receber"))).toBe(true);
  });

  it("já houve acompanhamento (acompanhamentosJaEnviados >= 1)", () => {
    const decisao = podeAcompanhar(estadoLimpo({ acompanhamentosJaEnviados: 1 }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("já houve acompanhamento"))).toBe(true);
  });

  it("plataforma bloqueou", () => {
    const decisao = podeAcompanhar(estadoLimpo({ plataformaBloqueou: true }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("a plataforma bloqueou"))).toBe(true);
  });
});

// ── acompanhamentosJaEnviados: os limites exatos ────────────────────────────

describe("acompanhamentosJaEnviados", () => {
  it(": 1 bloqueia (o teto é UM, >= 1)", () => {
    const decisao = podeAcompanhar(estadoLimpo({ acompanhamentosJaEnviados: 1 }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
  });

  it(": 0 passa", () => {
    const decisao = podeAcompanhar(estadoLimpo({ acompanhamentosJaEnviados: 0 }), AGORA, "99freelas");
    expect(decisao.pode).toBe(true);
  });

  it("negativo bloqueia como dado corrompido, não como permissão", () => {
    const decisao = podeAcompanhar(estadoLimpo({ acompanhamentosJaEnviados: -1 }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("corrompido"))).toBe(true);
  });
});

// ── clienteRespondeu: bloqueio A MAIS do que a ordem literal do CEO ─────────

describe("clienteRespondeu (bloqueio a mais, declarado)", () => {
  it("true bloqueia, mesmo sem estar nas seis condições literais do CEO", () => {
    const decisao = podeAcompanhar(estadoLimpo({ clienteRespondeu: true }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.toLowerCase().includes("já respondeu"))).toBe(true);
  });

  it("false (a metade gêmea) não bloqueia por conta própria", () => {
    const decisao = podeAcompanhar(estadoLimpo({ clienteRespondeu: false }), AGORA, "99freelas");
    expect(decisao.pode).toBe(true);
  });
});

// ── Cada um dos oito campos em null bloqueia por DESCONHECIDO ──────────────

describe("null é DESCONHECIDO, e desconhecido bloqueia — um campo por vez", () => {
  const camposBooleanos: Array<keyof EstadoDaOportunidade> = [
    "clienteRecusou",
    "projetoEncerrado",
    "outraPessoaContratada",
    "clientePediuParaNaoReceber",
    "plataformaBloqueou",
    "clienteRespondeu",
  ];

  for (const campo of camposBooleanos) {
    it(`"${campo}" em null bloqueia`, () => {
      const decisao = podeAcompanhar(estadoLimpo({ [campo]: null }), AGORA, "99freelas");
      expect(decisao.pode).toBe(false);
      expect(decisao.motivos.some((m) => m.includes("DESCONHECIDO") && m.includes(campo))).toBe(true);
    });
  }

  it('"acompanhamentosJaEnviados" em null bloqueia', () => {
    const decisao = podeAcompanhar(estadoLimpo({ acompanhamentosJaEnviados: null }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("DESCONHECIDO") && m.includes("acompanhamentosJaEnviados"))).toBe(true);
  });

  it('"ultimaMensagemDaAgenciaEm" em null bloqueia, e a contagem de horas fica null', () => {
    const decisao = podeAcompanhar(estadoLimpo({ ultimaMensagemDaAgenciaEm: null }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("DESCONHECIDO") && m.includes("ultimaMensagemDaAgenciaEm"))).toBe(true);
    expect(decisao.horasDesdeAUltimaMensagem).toBeNull();
  });
});

// ── Intervalo: 1 h bloqueia, 72 h passa, exatamente no limite passa ────────

describe("intervalo mínimo desde a última mensagem da agência", () => {
  it("1 h desde a proposta bloqueia e diz quantas faltam", () => {
    const umaHoraAtras = new Date(AGORA.getTime() - 1 * 3_600_000);
    const decisao = podeAcompanhar(estadoLimpo({ ultimaMensagemDaAgenciaEm: umaHoraAtras }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
    const motivoDeIntervalo = decisao.motivos.find((m) => m.includes("Intervalo ainda não cumprido"));
    expect(motivoDeIntervalo).toBeDefined();
    expect(motivoDeIntervalo).toContain("71"); // faltam 71h das 72h exigidas
    expect(decisao.horasDesdeAUltimaMensagem).toBe(1);
  });

  it("72 h desde a proposta passa (no limite exato, comportamento declarado: >= libera)", () => {
    const setentaEDuasHorasAtras = new Date(AGORA.getTime() - 72 * 3_600_000);
    const decisao = podeAcompanhar(estadoLimpo({ ultimaMensagemDaAgenciaEm: setentaEDuasHorasAtras }), AGORA, "99freelas");
    expect(decisao.pode).toBe(true);
    expect(decisao.horasDesdeAUltimaMensagem).toBe(72);
  });

  it("71.9 h (um tico antes do limite) ainda bloqueia", () => {
    const quaseLa = new Date(AGORA.getTime() - 71.9 * 3_600_000);
    const decisao = podeAcompanhar(estadoLimpo({ ultimaMensagemDaAgenciaEm: quaseLa }), AGORA, "99freelas");
    expect(decisao.pode).toBe(false);
  });

  it("100 h desde a proposta passa, folgado", () => {
    const decisao = podeAcompanhar(estadoLimpo({ ultimaMensagemDaAgenciaEm: HA_100_HORAS }), AGORA, "99freelas");
    expect(decisao.pode).toBe(true);
  });
});

// ── Duas condições ao mesmo tempo → motivos tem os dois ────────────────────

describe("duas condições ao mesmo tempo", () => {
  it("cliente recusou + plataforma bloqueou → motivos tem os dois", () => {
    const decisao = podeAcompanhar(
      estadoLimpo({ clienteRecusou: true, plataformaBloqueou: true }),
      AGORA,
      "99freelas",
    );
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.length).toBeGreaterThanOrEqual(2);
    expect(decisao.motivos.some((m) => m.includes("o cliente recusou"))).toBe(true);
    expect(decisao.motivos.some((m) => m.includes("a plataforma bloqueou"))).toBe(true);
  });

  it("já houve acompanhamento + intervalo não cumprido → motivos tem os dois", () => {
    const umaHoraAtras = new Date(AGORA.getTime() - 1 * 3_600_000);
    const decisao = podeAcompanhar(
      estadoLimpo({ acompanhamentosJaEnviados: 1, ultimaMensagemDaAgenciaEm: umaHoraAtras }),
      AGORA,
      "99freelas",
    );
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.some((m) => m.includes("já houve acompanhamento"))).toBe(true);
    expect(decisao.motivos.some((m) => m.includes("Intervalo ainda não cumprido"))).toBe(true);
  });

  it("todos os oito campos em null ao mesmo tempo → oito motivos DESCONHECIDO", () => {
    const decisao = podeAcompanhar(
      {
        referencia: "op-null",
        ultimaMensagemDaAgenciaEm: null,
        acompanhamentosJaEnviados: null,
        clienteRecusou: null,
        projetoEncerrado: null,
        outraPessoaContratada: null,
        clientePediuParaNaoReceber: null,
        plataformaBloqueou: null,
        clienteRespondeu: null,
      },
      AGORA,
      "99freelas",
    );
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.length).toBe(8);
    expect(decisao.motivos.every((m) => m.includes("DESCONHECIDO"))).toBe(true);
  });
});

// ── pode === (motivos.length === 0), numa bateria de combinações ──────────

describe("pode nunca diverge de motivos.length === 0", () => {
  const combinacoes: Array<Partial<EstadoDaOportunidade>> = [
    {},
    { clienteRecusou: true },
    { clienteRecusou: null },
    { acompanhamentosJaEnviados: 1 },
    { acompanhamentosJaEnviados: -5 },
    { clienteRespondeu: true },
    { ultimaMensagemDaAgenciaEm: new Date(AGORA.getTime() - 1 * 3_600_000) },
    { clienteRecusou: true, projetoEncerrado: true, plataformaBloqueou: null },
    { outraPessoaContratada: false, clientePediuParaNaoReceber: false },
    { projetoEncerrado: true, acompanhamentosJaEnviados: 2, clienteRespondeu: null },
  ];

  for (const [i, overrides] of combinacoes.entries()) {
    it(`combinação ${i}: pode === (motivos.length === 0)`, () => {
      const decisao = podeAcompanhar(estadoLimpo(overrides), AGORA, "99freelas");
      expect(decisao.pode).toBe(decisao.motivos.length === 0);
    });
  }
});

// ── Plataforma sem bloco `acompanhamento` no policy.json ────────────────────
// (política desconhecida ⇒ POLITICA_DESCONHECIDA ⇒ cru vazio ⇒ fail closed:
// máximo 1, intervalo Infinity — nunca libera sozinho sem número configurado.)

describe("plataforma sem policy.json conhecido — fail closed", () => {
  // ANTES: este teste aceitava "qualquer bloqueio", sem nomear o motivo — e o
  // `estadoLimpo()` usado aqui tem `acompanhamentosJaEnviados: 0`, que NUNCA
  // dispara o teto (0 >= 1 é falso, 0 >= Infinity também é falso). Ou seja,
  // este teste NUNCA exercitou o fallback de `maximoPorOportunidade`, mesmo
  // parecendo que sim — o bloqueio de intervalo (que também cai para
  // `Infinity` sem política) escondia essa lacuna. O fallback do teto tem
  // teste próprio, isolado, no bloco "configuracaoDeAcompanhamento" abaixo.
  it("intervalo indeterminado bloqueia sozinho, e o único motivo nomeado é o intervalo (não o teto, que este caso não exercita)", () => {
    const decisao = podeAcompanhar(estadoLimpo(), AGORA, "plataforma-inexistente");
    expect(decisao.intervaloHoras).toBe(Infinity);
    expect(decisao.pode).toBe(false);
    expect(decisao.motivos.length).toBe(1);
    expect(decisao.motivos[0]).toContain("Intervalo ainda não cumprido");
  });
});

// ── configuracaoDeAcompanhamento: a porta injetada, cada fallback isolado ──
// Cada teste aqui injeta o bloco `acompanhamento` diretamente — sem depender
// de o `policy.json` real ter (ou não ter) o campo. É esse isolamento que
// faz a mutação `: 1 → : Infinity` cair: com a porta, dá para afirmar
// `maximoPorOportunidade === 1` num bloco que nunca declara o campo, coisa
// que nenhum `policy.json` real desta casa hoje permite testar.

describe("configuracaoDeAcompanhamento — maximoPorOportunidade, cada fallback isolado", () => {
  it("bloco {} (campo ausente) → maximoPorOportunidade === 1", () => {
    const config = configuracaoDeAcompanhamento("99freelas", {});
    expect(config.maximoPorOportunidade).toBe(1);
  });

  it('maximo_por_oportunidade: "dois" (texto) → 1', () => {
    const config = configuracaoDeAcompanhamento("99freelas", { maximo_por_oportunidade: "dois" });
    expect(config.maximoPorOportunidade).toBe(1);
  });

  it("maximo_por_oportunidade: null → 1", () => {
    const config = configuracaoDeAcompanhamento("99freelas", { maximo_por_oportunidade: null });
    expect(config.maximoPorOportunidade).toBe(1);
  });

  it("maximo_por_oportunidade: -3 (negativo) → 1, negativo não vira permissão", () => {
    const config = configuracaoDeAcompanhamento("99freelas", { maximo_por_oportunidade: -3 });
    expect(config.maximoPorOportunidade).toBe(1);
  });

  it("maximo_por_oportunidade: 0 → 0 (zero acompanhamentos permitidos — MAIS restritivo que 1, não menos)", () => {
    const config = configuracaoDeAcompanhamento("99freelas", { maximo_por_oportunidade: 0 });
    expect(config.maximoPorOportunidade).toBe(0);
  });

  it('bloco não-objeto ("texto") → 1', () => {
    const config = configuracaoDeAcompanhamento("99freelas", "texto");
    expect(config.maximoPorOportunidade).toBe(1);
  });

  it("bloco não-objeto (null) → 1", () => {
    const config = configuracaoDeAcompanhamento("99freelas", null);
    expect(config.maximoPorOportunidade).toBe(1);
  });

  it("bloco não-objeto (42) → 1", () => {
    const config = configuracaoDeAcompanhamento("99freelas", 42);
    expect(config.maximoPorOportunidade).toBe(1);
  });

  it("sem blocoBruto injetado, plataforma sem policy.json conhecido → 1 (lê politicaDe de verdade)", () => {
    const config = configuracaoDeAcompanhamento("plataforma-inexistente");
    expect(config.maximoPorOportunidade).toBe(1);
    expect(config.intervaloHoras).toBe(Infinity);
  });
});

describe("configuracaoDeAcompanhamento — intervaloHoras, cada fallback isolado", () => {
  it("bloco {} → intervaloHoras === Infinity (nenhum dos dois lados configurado)", () => {
    const config = configuracaoDeAcompanhamento("99freelas", {});
    expect(config.intervaloHoras).toBe(Infinity);
  });

  it("só intervalo_da_casa_horas → usa o da casa", () => {
    const config = configuracaoDeAcompanhamento("99freelas", { intervalo_da_casa_horas: 48 });
    expect(config.intervaloHoras).toBe(48);
  });

  it("os dois presentes → o da plataforma vence", () => {
    const config = configuracaoDeAcompanhamento("99freelas", {
      intervalo_da_plataforma_horas: 24,
      intervalo_da_casa_horas: 48,
    });
    expect(config.intervaloHoras).toBe(24);
  });

  it('intervalo_da_casa_horas: "72" (texto, não número) → Infinity', () => {
    const config = configuracaoDeAcompanhamento("99freelas", { intervalo_da_casa_horas: "72" });
    expect(config.intervaloHoras).toBe(Infinity);
  });
});

// ── O teste de ponta: o teto bloqueia mesmo com o intervalo já cumprido ────
// Este é o teste que fecha o buraco de verdade — mata a mutação `: 1 →
// : Infinity` diretamente em `podeAcompanhar`, não só em
// `configuracaoDeAcompanhamento`. Sem ele, o bloqueio de intervalo sempre
// teria a chance de esconder o do teto (foi exatamente isso que aconteceu com
// o teste antigo de "plataforma sem policy.json conhecido").

describe("o teste de ponta: o teto do M14 não pode ficar escondido atrás do intervalo", () => {
  it(
    "intervalo já cumprido (nada bloqueia por tempo) + acompanhamentosJaEnviados: 1 + " +
      "política sem maximo_por_oportunidade → BLOQUEIA pelo teto, e só pelo teto",
    () => {
      const decisao = podeAcompanhar(
        estadoLimpo({ acompanhamentosJaEnviados: 1, ultimaMensagemDaAgenciaEm: HA_100_HORAS }),
        AGORA,
        "99freelas",
        // Bloco injetado SEM maximo_por_oportunidade: cai no fallback fail
        // closed (1). Se a mutação `: 1 → : Infinity` estivesse presente,
        // `1 >= Infinity` é falso e este teste falharia.
        { intervalo_da_casa_horas: 1 },
      );
      expect(decisao.pode).toBe(false);
      expect(decisao.motivos.length).toBe(1);
      expect(decisao.motivos[0]).toContain("já houve acompanhamento");
    },
  );
});
