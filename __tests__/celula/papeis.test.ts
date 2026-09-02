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
// Shape REAL: as rotas de produção sempre hard-codam
// `departamentos: ["client-service-sdr"]` em `credencialDe` — nunca `[]`.
// Um teste com `departamentos: []` não passa pela primeira guarda de
// `papelNaCelula()` do mesmo jeito que a produção passa, e por isso já
// deixou passar um furo (achado do `seguranca`, 2026-09-02).
const CEO: Credencial = { autoridade: "master", departamentos: ["client-service-sdr"] };
const DIRETOR: Credencial = { autoridade: "director", departamentos: ["client-service-sdr"] };
const CEO_AUTO_GERENTE: Credencial = {
  autoridade: "master",
  departamentos: ["client-service-sdr"],
  papelDeclaradoNaCelula: "gerente_de_atendimento",
};
const DIRETOR_AUTO_GERENTE: Credencial = {
  autoridade: "director",
  departamentos: ["client-service-sdr"],
  papelDeclaradoNaCelula: "gerente_de_atendimento",
};
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

describe("🔴 achado do seguranca (2026-09-02): auto-atribuição não destrava a fila nem a aprovação", () => {
  // O Caminho A depende de master conseguir se auto-atribuir
  // "gerente_de_atendimento" (é assim que o CEO libera arquivo). Essa mesma
  // auto-atribuição NÃO pode virar chave para as duas ações que o CEO baniu
  // por nome de master/director. Shape de credencial REAL em todos os casos.

  it("(a) master SEM papel atribuído: operar_fila_de_excecoes continua recusado", () => {
    const v = podeNaCelula(CEO, "operar_fila_de_excecoes");
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.regra).toBe("o_ceo_nao_opera_a_fila");
  });

  it("(b) master COM gerente_de_atendimento auto-atribuído: operar_fila_de_excecoes AGORA recusado", () => {
    for (const c of [CEO_AUTO_GERENTE, DIRETOR_AUTO_GERENTE]) {
      const v = podeNaCelula(c, "operar_fila_de_excecoes");
      expect(v.pode, c.autoridade).toBe(false);
      if (!v.pode) expect(v.regra, c.autoridade).toBe("o_ceo_nao_opera_a_fila");
    }
  });

  it("(c) master COM gerente_de_atendimento auto-atribuído: aprovar_modelo e pausar_modelo AGORA recusados", () => {
    for (const c of [CEO_AUTO_GERENTE, DIRETOR_AUTO_GERENTE]) {
      for (const a of ["aprovar_modelo", "pausar_modelo"]) {
        const v = podeNaCelula(c, a);
        expect(v.pode, `${c.autoridade} × ${a}`).toBe(false);
        if (!v.pode) expect(v.regra, `${c.autoridade} × ${a}`).toBe("direcao_nao_aprova_a_propria_fala");
      }
    }
  });

  it("(d) master COM gerente_de_atendimento auto-atribuído: autorizar_envio CONTINUA permitido — o motivo desta frente existir", () => {
    for (const c of [CEO_AUTO_GERENTE, DIRETOR_AUTO_GERENTE]) {
      expect(podeNaCelula(c, "autorizar_envio").pode, c.autoridade).toBe(true);
    }
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

describe("🔴 achado do `plataforma` (02/09/2026, item 4 do despacho de fechar o alvo-cliente)", () => {
  // A pergunta do despacho: `podeNaCelula` já recusa `autoridade: "client"`
  // para `autorizar_envio`/`operar_fila_de_excecoes`/`aprovar_modelo`/
  // `pausar_modelo` MESMO QUE `papel` esteja preenchido? Resposta: NÃO —
  // confirmado por este teste, não por leitura.
  //
  // Os quatro `if` de `podeNaCelula` que barram master/director checam
  // `c?.autoridade === "master" || c?.autoridade === "director"`
  // EXPLICITAMENTE — "client" nunca cai neles. A única trava que já barra
  // "client" incondicionalmente é a de `ler_a_celula`
  // (`eDeDentroDaCasa`). Para as quatro ações de ESCRITA, uma credencial com
  // `autoridade: "client"` e `papelDeclaradoNaCelula` preenchido segue o
  // caminho normal de `papel !== null` → `PODE[papel].includes(a)` — e É
  // PERMITIDA.
  //
  // Isto NÃO é explorável pelas rotas de produção HOJE, depois do resto
  // deste despacho: `atribuirPapelNaCelula` agora recusa gravar
  // `papelNaCelula` em qualquer `User.role === "client"` (item 2), e é a
  // ÚNICA escrita do campo. Mas `papeis.ts` continua sem a trava
  // INCONDICIONAL que os outros quatro blocos já têm para master/director —
  // é lógica pura, sem I/O, e não sabe (nem deveria saber) que a única
  // escrita hoje impede o dado sujo de existir. Se um dia surgir uma segunda
  // escrita (import, script, migração de dado) que não passe por
  // `atribuirPapelNaCelula`, o dado sujo volta a ser suficiente.
  //
  // Por instrução do despacho: NÃO conserto `papeis.ts` aqui — `papeis.ts`
  // já foi tocado duas vezes hoje e cada mudança pede rodar a mutação de
  // novo. `it.fails` documenta o gap e mantém a suíte verde; response ao
  // PM leva o alerta para decisão explícita antes de qualquer conserto.
  const CLIENTE_COM_PAPEL_SUJO: Credencial = {
    autoridade: "client",
    departamentos: ["client-service-sdr"],
    papelDeclaradoNaCelula: "gerente_de_atendimento",
  };

  it.fails(
    "HOJE NÃO RECUSA: client com papel sujo consegue autorizar_envio/operar_fila_de_excecoes/aprovar_modelo/pausar_modelo — gap real, decisão do PM/seguranca pendente",
    () => {
      for (const a of [
        "autorizar_envio",
        "operar_fila_de_excecoes",
        "aprovar_modelo",
        "pausar_modelo",
      ]) {
        const v = podeNaCelula(CLIENTE_COM_PAPEL_SUJO, a);
        expect(v.pode, a).toBe(false);
      }
    },
  );

  it("mas ler_a_celula JÁ recusa client incondicionalmente, mesmo com papel preenchido", () => {
    expect(podeNaCelula(CLIENTE_COM_PAPEL_SUJO, "ler_a_celula").pode).toBe(false);
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
