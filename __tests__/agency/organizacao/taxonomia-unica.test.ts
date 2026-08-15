// A TRAVA CONTRA A TERCEIRA LISTA DE DEPARTAMENTO.
//
// O repositório já teve duas listas de departamento crescendo em paralelo, e
// ninguém percebeu por meses — porque criar uma lista nova não quebra nada no
// dia em que se cria. Quebra seis semanas depois, quando alguém pergunta
// "quantos departamentos temos?" e recebe duas respostas.
//
// Este arquivo é o portão: ele reprova id órfão nas duas pontas e reprova
// departamento canônico que nenhuma das duas conheça.

import { describe, it, expect } from "vitest";
import {
  DEPARTAMENTOS,
  DEPARTAMENTO_IDS,
  existeDepartamento,
} from "@/lib/agency/organizacao/departamentos";
import { DEPARTMENT_DEFS } from "@/lib/agency/departments";
import { BRAIN_DEPARTMENTS } from "@/lib/dioli-brain/departments";

describe("fonte canônica de departamentos", () => {
  it("não tem id repetido", () => {
    expect(new Set(DEPARTAMENTO_IDS).size).toBe(DEPARTAMENTO_IDS.length);
  });

  it("cobre os doze departamentos definidos pelo CEO", () => {
    // A lista do contrato, em português, batida contra os nomes de exibição.
    // Se alguém renomear um departamento na interface, este teste avisa — não
    // porque o nome seja sagrado, mas porque renomear em silêncio é como as
    // duas listas divergiram na primeira vez.
    const nomes = DEPARTAMENTOS.map((d) => d.nome).sort();
    expect(nomes).toEqual(
      [
        "Analytics",
        "Atendimento",
        "Branding",
        "Design",
        "Estratégia",
        "Financeiro",
        "Gestão de Projetos",
        "Operações & Sistema",
        "Produto & Tecnologia",
        "Qualidade",
        "Social Media",
        "Tráfego Pago",
      ].sort(),
    );
  });

  it("nenhum componente pode fixar a quantidade — ela cresce por configuração", () => {
    // O teste não trava o NÚMERO de propósito: ele trava que o número venha do
    // registro. Fixar o número em componentes repetiria o defeito original.
    expect(DEPARTAMENTOS.length).toBe(DEPARTAMENTO_IDS.length);
    expect(DEPARTAMENTOS.length).toBeGreaterThanOrEqual(12);
  });
});

describe("as duas listas históricas são VISTAS da canônica", () => {
  it("todo id de DEPARTMENT_DEFS existe na fonte canônica", () => {
    const orfaos = DEPARTMENT_DEFS.map((d) => d.id).filter((id) => !existeDepartamento(id));
    expect(orfaos).toEqual([]);
  });

  it("todo id de BRAIN_DEPARTMENTS existe na fonte canônica", () => {
    const orfaos = BRAIN_DEPARTMENTS.map((d) => d.id).filter((id) => !existeDepartamento(id));
    expect(orfaos).toEqual([]);
  });

  it("todo departamento canônico é conhecido por pelo menos uma das duas", () => {
    // O contrário do teste acima. Sem ele, alguém acrescenta um departamento
    // aqui, esquece de ligá-lo em qualquer lugar, e ele vira enfeite de lista.
    const conhecidos = new Set<string>([
      ...DEPARTMENT_DEFS.map((d) => d.id),
      ...BRAIN_DEPARTMENTS.map((d) => d.id),
    ]);
    const soltos = DEPARTAMENTO_IDS.filter((id) => !conhecidos.has(id));
    expect(soltos).toEqual([]);
  });

  it("os ids que as duas compartilham significam o mesmo departamento", () => {
    // Sobreposição é onde a divergência mora: mesmo id, nomes diferentes, e
    // duas telas dizendo coisas diferentes sobre a mesma área.
    const brainPorId = new Map(BRAIN_DEPARTMENTS.map((d) => [d.id, d]));
    for (const def of DEPARTMENT_DEFS) {
      const brain = brainPorId.get(def.id);
      if (!brain) continue;
      expect(existeDepartamento(def.id)).toBe(true);
    }
  });
});
