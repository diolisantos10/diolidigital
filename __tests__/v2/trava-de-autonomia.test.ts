// A TRAVA DA AUTONOMIA — a letra da ficha vira mecanismo.
//
// ─── O DEFEITO ──────────────────────────────────────────────────────────────
//
// As 69 fichas da linha declaram `autonomia: "A" | "B" | "C"` desde que
// nasceram, e a semântica está escrita na tabela de cada uma:
//
//   A — só informa/analisa
//   B — recomenda/prepara; passo externo exige aprovação
//   C — executa com log; irreversível continua vetado
//
// Até 16/08/2026 o CI conferia UMA coisa sobre essa coluna: que a letra
// estivesse entre A, B e C. O motor nunca a lia. As sete fichas do 12º
// departamento nasceram B e nada no código impedia uma delas de fazer o que só
// C poderia — a letra era decoração, e decoração é o que o guardrail 4 proíbe
// ("prompt é aviso, código é trava"). O CEO cobrou isso com todas as letras ao
// mandar dar mãos ao departamento.
//
// ─── E POR QUE O PADRÃO É "informar" ────────────────────────────────────────
//
// O primeiro desenho desta trava usava `"preparar"` como padrão, por parecer o
// que toda chamada viva da casa já fazia. A suíte derrubou em minutos: OITO das
// 69 fichas são autonomia A, e as oito passariam a ser recusadas por uma trava
// que ninguém pediu para elas. Trava nova que reprova o que já roda não é
// trava, é incidente — e o incidente quase foi meu.
//
// O motor não adivinha a intenção do chamador, então assume a MENOR delas.
// Quem prepara artefato ou toca o mundo declara isso, e é aí que a letra da
// ficha passa a valer. A última metade deste arquivo prova que a esteira
// assistida — o piloto que está no ar com cliente parceiro — passa intacta.

import { describe, it, expect } from "vitest";
import {
  AUTONOMIA_PERMITE,
  executarFuncao,
  type ContextoDeExecucao,
  type DependenciasDoExecutor,
  type EfeitoDaExecucao,
} from "@/lib/agency/execucao-v2/executor";
import { specDaFuncao, type SpecOperacional } from "@/lib/agency/catalogo-v2/specs";
import { CADEIA_ASSISTIDA } from "@/lib/agency/esteira-assistida/cadeia";
import { ORDEM_TECNICA } from "@/lib/agency/produto-tecnologia/cadeia-tecnica";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

const PERFIL: PerfilOrganizacional = { autoridade: "director", departamentos: [] };

function specFalsa(autonomia: "A" | "B" | "C"): SpecOperacional {
  return {
    funcao: "backend-engineer",
    departamento: "product-technology",
    ativa: true,
    entradas_obrigatorias: ["pedido"],
    saida: { formato: "markdown", esquema: "texto" },
    ferramentas_permitidas: ["repositório em leitura"],
    ferramentas_proibidas: ["deploy direto"],
    dados_acessiveis: [],
    dados_proibidos: [],
    handoff: { recebe_de: "project-management", entrega_para: "quality" },
    sla_horas: 8,
    timeout_min: 10,
    retentativas: 0,
    metrica_sucesso: "faz o que a ficha diz",
    golden_set: [],
    modelo: { recomendado: "x", fallback: "y" },
    teto_custo_usd_execucao: 1,
    autonomia,
    gatilhos_humanos: ["qualquer ação irreversível, gasto ou risco legal"],
    // A régua de atuação é campo obrigatório da spec (0–100). Aqui ela é só
    // ruído de fixture: a trava sob teste é a AUTONOMIA, e a régua orienta,
    // não trava. 85 = "FAZ", que é o que um engenheiro de fato é.
    indice_operacional: 85,
  };
}

function contexto(efeito?: EfeitoDaExecucao): ContextoDeExecucao {
  return {
    modo: "homologacao",
    sintetico: true,
    entradas: { pedido: "conserta o que está quebrado, com detalhe suficiente" },
    ferramentasPrevistas: [],
    custoPrevistoUsd: 0,
    correlationId: "autonomia:teste",
    escopos: [],
    ...(efeito ? { efeito } : {}),
  };
}

function deps(autonomia: "A" | "B" | "C"): DependenciasDoExecutor {
  return {
    specDe: () => ({ ok: true, spec: specFalsa(autonomia) }),
    flagLigada: async () => true,
    gravarExecucao: async () => undefined,
    realizar: async () => ({ saida: "trabalho feito, com corpo mais que suficiente para o piso", custoUsd: 0 }),
    agora: () => new Date(1_760_000_000_000),
  };
}

const rodar = (autonomia: "A" | "B" | "C", efeito?: EfeitoDaExecucao) =>
  executarFuncao("backend-engineer", PERFIL, contexto(efeito), { ator: "ia", modelo: "m", versaoModelo: "1" }, deps(autonomia));

describe("a letra da ficha decide o que a execução pode causar", () => {
  it("A só informa — preparar e externo são recusados", async () => {
    expect((await rodar("A", "informar")).decisao).toBe("executado");
    for (const efeito of ["preparar", "externo"] as const) {
      const r = await rodar("A", efeito);
      expect(r.decisao, efeito).toBe("recusado");
      if (r.decisao === "recusado") expect(r.motivo).toContain("autonomia A");
    }
  });

  it("B informa e prepara", async () => {
    expect((await rodar("B", "informar")).decisao).toBe("executado");
    expect((await rodar("B", "preparar")).decisao).toBe("executado");
  });

  it("B diante de efeito externo ESCALA, não recusa — a ficha diz 'exige aprovação', não 'nunca'", async () => {
    // A diferença importa: recusar joga o pedido fora; escalar devolve um
    // pacote que É o pedido de aprovação, com entradas e correlationId.
    const r = await rodar("B", "externo");
    expect(r.decisao).toBe("escalado");
    if (r.decisao === "escalado") {
      expect(r.pacote.motivo).toContain("exige aprovação");
      expect(r.pacote.entradas).toHaveProperty("pedido");
      expect(r.pacote.correlationId).toBe("autonomia:teste");
    }
  });

  it("C faz os três — o irreversível continua barrado pelos gatilhos, não por aqui", async () => {
    for (const efeito of ["informar", "preparar", "externo"] as const) {
      expect((await rodar("C", efeito)).decisao, efeito).toBe("executado");
    }
  });
});

describe("o padrão não muda nada do que já roda", () => {
  it("sem `efeito` declarado, a execução vale como `informar` — e nenhuma letra reprova", async () => {
    // O primeiro desenho desta trava usava `preparar` como padrão, e a suíte
    // denunciou em minutos: OITO das 69 fichas são autonomia A e todas as oito
    // passariam a ser recusadas. O motor não adivinha a intenção do chamador,
    // então assume a menor — quem prepara diz que prepara.
    for (const letra of ["A", "B", "C"] as const) {
      expect((await rodar(letra)).decisao, letra).toBe("executado");
    }
  });

  it("as oito fichas de autonomia A continuam executando o caso normal delas", async () => {
    const oitoQueAnalisam = [
      "client-profitability", "brand-audit-and-evolution", "creative-performance-analysis",
      "observability", "trends-and-radar", "insights", "attribution-and-funnel", "forecast-and-alerts",
    ];
    for (const funcaoId of oitoQueAnalisam) {
      const r = specDaFuncao(funcaoId);
      expect(r.ok, funcaoId).toBe(true);
      if (r.ok) {
        expect(r.spec.autonomia, funcaoId).toBe("A");
        expect(AUTONOMIA_PERMITE.A, funcaoId).toContain("informar");
      }
    }
  });

  it("nenhuma função da esteira assistida é A — o piloto no ar passa intacto", async () => {
    // Trava nova que reprova o que já roda não é trava, é incidente. Este teste
    // é a conferência, não a esperança.
    for (const funcaoId of CADEIA_ASSISTIDA) {
      const r = specDaFuncao(funcaoId);
      expect(r.ok, funcaoId).toBe(true);
      if (r.ok) {
        expect(AUTONOMIA_PERMITE[r.spec.autonomia], `${funcaoId} (${r.spec.autonomia})`).toContain("preparar");
      }
    }
  });

  it("as sete do 12º departamento são B — preparam, e nenhuma publica", async () => {
    for (const funcaoId of ORDEM_TECNICA) {
      const r = specDaFuncao(funcaoId);
      if (r.ok) {
        expect(r.spec.autonomia, funcaoId).toBe("B");
        expect(AUTONOMIA_PERMITE[r.spec.autonomia], funcaoId).not.toContain("externo");
      }
    }
  });
});
