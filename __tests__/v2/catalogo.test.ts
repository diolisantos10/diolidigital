// O TESTE DE CONTRATO DO CATÁLOGO — manifesto ↔ código, sem mão no meio.
//
// Se este teste quebrar, alguém editou o catálogo sem editar o manifesto (ou
// vice-versa). A regra de precedência do 00-README: pasta → manifesto →
// código. E a conta de 62 é determinação literal do CEO (15/08/2026).

import { describe, it, expect } from "vitest";
import manifesto from "@/docs/arquitetura-operacional-v2/architecture.manifest.json";
import {
  DEPARTAMENTOS_V2,
  FUNCOES_V2,
  FLUXO_V2,
  ESTADOS_V2,
  BLOQUEIOS_V2,
  DECISOES_DO_CLIENTE_V2,
  departamentoV2,
  funcaoV2,
  departamentoDaFuncao,
} from "@/lib/agency/catalogo-v2/catalogo";

describe("catálogo canônico V2 — contrato com o manifesto", () => {
  it("tem exatamente 12 departamentos, na ordem do manifesto", () => {
    expect(DEPARTAMENTOS_V2.map((d) => d.id)).toEqual(manifesto.departments.map((d) => d.id));
    expect(DEPARTAMENTOS_V2).toHaveLength(12);
  });

  it("tem exatamente 69 funções executoras", () => {
    expect(FUNCOES_V2).toHaveLength(69);
  });

  it("cada função do manifesto existe no catálogo, no departamento certo", () => {
    for (const d of manifesto.departments) {
      for (const agente of d.agents) {
        expect(departamentoDaFuncao(agente)).toBe(d.id);
      }
    }
  });

  it("não há id de função duplicado entre departamentos", () => {
    const ids = FUNCOES_V2.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda função nasce DESLIGADA — ligar é decisão registrada, não deploy", () => {
    for (const f of FUNCOES_V2) expect(f.ativaPorPadrao).toBe(false);
  });

  it("o fluxo tem 9 marcos e todo dono/contribuinte é departamento real", () => {
    expect(FLUXO_V2).toHaveLength(9);
    for (const marco of FLUXO_V2) {
      expect(departamentoV2(marco.donoDepartamentoId), `dono de ${marco.id}`).toBeDefined();
      for (const c of marco.contribuintes) {
        expect(departamentoV2(c), `contribuinte ${c} de ${marco.id}`).toBeDefined();
      }
    }
  });

  it("estados, bloqueios e decisões do cliente batem com o manifesto", () => {
    expect(ESTADOS_V2).toEqual(manifesto.canonicalStates);
    expect(ESTADOS_V2).toHaveLength(20);
    expect(BLOQUEIOS_V2).toEqual(manifesto.blockingReasons);
    expect(BLOQUEIOS_V2).toHaveLength(9);
    expect(DECISOES_DO_CLIENTE_V2).toEqual(manifesto.clientDecisions);
    expect(DECISOES_DO_CLIENTE_V2).toHaveLength(4);
  });

  it("id desconhecido devolve undefined — e undefined não é 'pode passar'", () => {
    expect(departamentoV2("marketing-geral")).toBeUndefined();
    expect(funcaoV2("agente-que-nao-existe")).toBeUndefined();
    expect(departamentoDaFuncao("agente-que-nao-existe")).toBeUndefined();
  });
});
