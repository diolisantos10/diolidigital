// A TRAVA DA ESCADA — o Gerente Geral não chama agente de linha.
//
// As duas metades de toda trava desta casa: ela BARRA o caso plantado (o GG
// despachando direto ao especialista, o agente de linha falando para fora do
// departamento) e NÃO acusa o caso limpo (o GG despachando ao gerente certo).
//
// Prova de mutação registrada no relatório: trocar `ehAgenteDeLinha` por
// `false` em `despacho.ts` deixa "o Gerente Geral não chama agente de linha"
// vermelho, e só ele.

import { describe, it, expect } from "vitest";
import {
  entrarPeloGerenteGeral,
  despacharDoGerenteGeral,
  subirDoDepartamento,
  type Demanda,
} from "@/lib/agency/gerencia/despacho";
import { GERENTE_GERAL, GERENTES, gerenteDe, ehAgenteDeLinha } from "@/lib/agency/gerencia/cadeia";
import { FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";

function demanda(over: Partial<Demanda> = {}): Demanda {
  return {
    descricao: "Dois posts de Instagram do mês",
    departamentoId: "social-media",
    clienteId: "cli_teste",
    aceiteComercial: true,
    correlationId: "corr-1",
    ...over,
  };
}

describe("a cadeia de comando é derivada do manifesto, não escrita à mão", () => {
  it("os 12 departamentos têm gerente, e o do PM é o Gerente Geral", () => {
    expect(GERENTES).toHaveLength(12);
    expect(gerenteDe("project-management")).toBe(GERENTE_GERAL);
    expect(gerenteDe("design")).toBe("manager-design");
  });

  it("gerente não é agente de linha, e agente de linha não é gerente", () => {
    expect(ehAgenteDeLinha("manager-design")).toBe(false);
    expect(ehAgenteDeLinha(GERENTE_GERAL)).toBe(false);
    expect(ehAgenteDeLinha("copywriter")).toBe(true);
  });
});

describe("o despacho do Gerente Geral", () => {
  it("a porta resolve o gerente sozinha — quem chama não escolhe destinatário", () => {
    const r = entrarPeloGerenteGeral(demanda());
    expect(r.decisao).toBe("despachado");
    if (r.decisao !== "despachado") throw new Error("impossível");
    expect(r.paraFuncaoId).toBe("manager-social");
  });

  it("⛔ o Gerente Geral NÃO chama agente de linha — a chamada direta falha", () => {
    // O caso plantado: o GG tentando o especialista, pulando o gerente.
    const r = despacharDoGerenteGeral("copywriter", demanda());
    expect(r.decisao).toBe("recusado");
    if (r.decisao !== "recusado") throw new Error("impossível");
    expect(r.motivo).toContain("não chama agente de linha");
  });

  it("⛔ NENHUM dos 69 agentes de linha do catálogo aceita despacho do GG", () => {
    // A trava vale para o catálogo inteiro, não para o exemplo que eu escolhi.
    const linha = FUNCOES_V2.filter((f) => ehAgenteDeLinha(f.id));
    expect(linha.length).toBeGreaterThan(60);
    for (const f of linha) {
      const r = despacharDoGerenteGeral(f.id, demanda({ departamentoId: f.departamentoId }));
      expect(r.decisao, `${f.id} aceitou despacho direto do Gerente Geral`).toBe("recusado");
    }
  });

  it("⛔ gerente do departamento ERRADO é recusado — porta errada é pior que porta ausente", () => {
    const r = despacharDoGerenteGeral("manager-financeiro", demanda({ departamentoId: "design" }));
    expect(r.decisao).toBe("recusado");
    if (r.decisao !== "recusado") throw new Error("impossível");
    expect(r.motivo).toContain("é gerente de finance");
  });

  it("⛔ demanda sem aceite comercial não entra na casa", () => {
    const r = entrarPeloGerenteGeral(demanda({ aceiteComercial: false }));
    expect(r.decisao).toBe("recusado");
  });

  it("⛔ o Gerente Geral não despacha para si mesmo", () => {
    expect(despacharDoGerenteGeral(GERENTE_GERAL, demanda({ departamentoId: "project-management" })).decisao).toBe(
      "recusado",
    );
  });

  it("departamento desconhecido é recusa, nunca um chute de destino", () => {
    expect(entrarPeloGerenteGeral(demanda({ departamentoId: "marketing" })).decisao).toBe("recusado");
  });
});

describe("a subida — cada departamento é um mundo fechado", () => {
  it("o gerente sobe ao Gerente Geral", () => {
    const r = subirDoDepartamento("manager-design", "design");
    expect(r).toMatchObject({ decisao: "subiu", paraFuncaoId: GERENTE_GERAL });
  });

  it("o Gerente Geral sobe ao Diretor — é a comunicação de rotina da direção", () => {
    const r = subirDoDepartamento(GERENTE_GERAL, "project-management");
    expect(r).toMatchObject({ decisao: "subiu", paraFuncaoId: "diretor" });
  });

  it("⛔ NENHUM agente de linha fala para fora do próprio departamento", () => {
    for (const f of FUNCOES_V2.filter((x) => ehAgenteDeLinha(x.id))) {
      const r = subirDoDepartamento(f.id, f.departamentoId);
      expect(r.decisao, `${f.id} falou para fora do departamento`).toBe("recusado");
    }
  });
});
