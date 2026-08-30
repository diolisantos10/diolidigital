// PAPÉIS E PERMISSÕES DE GERENTE E SDR — item obrigatório da ordem do CEO.
//
// Sem isto, os 22 modelos M01–M22 ficam em `rascunho` para sempre: havia um
// campo `aprovador` esperando um nome e ninguém no sistema com poder de
// preenchê-lo. Modelo que só pode ser aprovado por quem edita arquivo é modelo
// aprovado por programador — o contrário exato do que o CEO ordenou.

import { describe, it, expect } from "vitest";
import { podeNaCelula, papelNaCelula, type Credencial } from "@/lib/agency/celula/papeis";

const GERENTE: Credencial = {
  autoridade: "department_member",
  departamentos: ["client-service-sdr"],
  papelDeclaradoNaCelula: "gerente_de_atendimento",
};
const SDR: Credencial = {
  autoridade: "department_member",
  departamentos: ["client-service-sdr"],
  papelDeclaradoNaCelula: "sdr",
};
const CEO: Credencial = { autoridade: "master", departamentos: [] };
const DIRETOR: Credencial = { autoridade: "director", departamentos: [] };
const DESIGNER: Credencial = { autoridade: "department_member", departamentos: ["design"] };
const CLIENTE: Credencial = { autoridade: "client", departamentos: [] };

describe("o Gerente aprova — e é a única porta para os 22 modelos saírem do rascunho", () => {
  it("aprova, pausa, autoriza envio e opera a fila", () => {
    for (const a of ["aprovar_modelo", "pausar_modelo", "autorizar_envio", "operar_fila_de_excecoes"]) {
      expect(podeNaCelula(GERENTE, a).pode, a).toBe(true);
    }
  });
});

describe("o SDR usa os modelos, mas não libera o que vai dizer", () => {
  it("NÃO aprova nem pausa modelo", () => {
    for (const a of ["aprovar_modelo", "pausar_modelo"]) {
      const v = podeNaCelula(SDR, a);
      expect(v.pode, a).toBe(false);
      if (!v.pode) expect(v.regra).toBe("papel_nao_permite");
    }
  });

  it("NÃO dá o aceite do modo supervisionado", () => {
    expect(podeNaCelula(SDR, "autorizar_envio").pode).toBe(false);
  });

  it("mas opera a fila de exceções e lê a Célula — a metade gêmea", () => {
    expect(podeNaCelula(SDR, "operar_fila_de_excecoes").pode).toBe(true);
    expect(podeNaCelula(SDR, "ler_a_celula").pode).toBe(true);
  });
});

describe('🔴 "O CEO NÃO opera essa fila" — ordem literal, e autoridade não destrava', () => {
  it("CEO e direção são BARRADOS na fila de exceções", () => {
    for (const c of [CEO, DIRETOR]) {
      const v = podeNaCelula(c, "operar_fila_de_excecoes");
      expect(v.pode).toBe(false);
      if (!v.pode) expect(v.regra).toBe("o_ceo_nao_opera_a_fila");
    }
  });

  it("CEO e direção NÃO aprovam nem pausam a fala que vai ao cliente", () => {
    for (const c of [CEO, DIRETOR]) {
      for (const a of ["aprovar_modelo", "pausar_modelo"]) {
        const v = podeNaCelula(c, a);
        expect(v.pode, `${c.autoridade} × ${a}`).toBe(false);
        if (!v.pode) expect(v.regra).toBe("direcao_nao_aprova_a_propria_fala");
      }
    }
  });

  it("mas LER é largo: o CEO enxerga a Célula inteira", () => {
    expect(podeNaCelula(CEO, "ler_a_celula").pode).toBe(true);
    expect(podeNaCelula(DIRETOR, "ler_a_celula").pode).toBe(true);
    expect(podeNaCelula(DESIGNER, "ler_a_celula").pode).toBe(true);
  });

  it("o cliente não lê a Célula — /agency/** é território proibido", () => {
    expect(podeNaCelula(CLIENTE, "ler_a_celula").pode).toBe(false);
    expect(podeNaCelula(CLIENTE, "aprovar_modelo").pode).toBe(false);
  });
});

describe("o papel é DADO declarado, nunca inferido do cargo", () => {
  it("membro do departamento SEM papel declarado não é gerente", () => {
    const semPapel: Credencial = { autoridade: "department_member", departamentos: ["client-service-sdr"] };
    expect(papelNaCelula(semPapel)).toBeNull();
    const v = podeNaCelula(semPapel, "aprovar_modelo");
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.regra).toBe("fora_da_celula");
  });

  it("papel declarado fora do conjunto fechado NÃO vale", () => {
    for (const p of ["GERENTE_DE_ATENDIMENTO", " gerente_de_atendimento", "gerente", "ceo", "", null, 7, {}]) {
      const c: Credencial = {
        autoridade: "department_member",
        departamentos: ["client-service-sdr"],
        papelDeclaradoNaCelula: p,
      };
      expect(papelNaCelula(c), JSON.stringify(p)).toBeNull();
    }
  });

  it("quem é de OUTRO departamento não vira gerente nem declarando o papel", () => {
    const impostor: Credencial = {
      autoridade: "department_member",
      departamentos: ["design"],
      papelDeclaradoNaCelula: "gerente_de_atendimento",
    };
    expect(papelNaCelula(impostor)).toBeNull();
    expect(podeNaCelula(impostor, "aprovar_modelo").pode).toBe(false);
  });

  it("credencial malformada BLOQUEIA, nunca vira permissão", () => {
    for (const c of [{}, { autoridade: "master" }, { departamentos: null }, { departamentos: "todos" }]) {
      expect(podeNaCelula(c as unknown as Credencial, "aprovar_modelo").pode).toBe(false);
    }
  });
});

describe("ação desconhecida é indisponível, nunca 'deve ser nova'", () => {
  it("qualquer coisa fora do conjunto fechado BLOQUEIA", () => {
    for (const a of ["publicar", "APROVAR_MODELO", " aprovar_modelo", "", null, undefined, 1]) {
      const v = podeNaCelula(GERENTE, a);
      expect(v.pode, JSON.stringify(a)).toBe(false);
      if (!v.pode) expect(v.regra).toBe("acao_desconhecida");
    }
  });
});
