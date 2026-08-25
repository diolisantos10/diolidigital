// O LAÇO QUE NÃO PARA — e a regra que ele existe para impor:
//
//   COLUNA GRAVADA NÃO É CLIENTE INFORMADO.
//
// Gravar o bloqueio resolve o problema da casa. O cliente continua achando
// que a data está de pé. Por isso o atraso que queima prazo PROMETIDO tem de
// produzir as DUAS coisas — o bloqueio com dono e a fala ao cliente — e este
// arquivo reprova quem entregar só a primeira.

import { describe, it, expect } from "vitest";
import { varrerOsProjetos, fraseDoLaco, type ProjetoAberto } from "@/lib/agency/gerencia/laco";
import { GERENTE_GERAL } from "@/lib/agency/gerencia/cadeia";
import { VOZ_DO_CLIENTE } from "@/lib/agency/gerencia/voz-unica";

const AGORA = new Date("2026-08-25T12:00:00Z");
const h = (n: number) => new Date(AGORA.getTime() - n * 3_600_000);

function projeto(over: Partial<ProjetoAberto> = {}): ProjetoAberto {
  return {
    id: "prj_1",
    clienteId: "cli_1",
    titulo: "Campanha de agosto",
    departamentoResponsavel: "design",
    estadoCanonico: "production", // SLA 72h
    atualizadoEm: h(1),
    ...over,
  };
}

describe("o laço percorre TODO projeto aberto e dá um veredito para cada um", () => {
  it("no prazo também é resposta — é o que prova que o laço olhou", () => {
    const r = varrerOsProjetos([projeto()], AGORA);
    expect(r.vereditos).toHaveLength(1);
    expect(r.vereditos[0]).toMatchObject({ situacao: "no_prazo", donoFuncaoId: "manager-design" });
    expect(r.bloqueios).toHaveLength(0);
    expect(fraseDoLaco(r)).toContain("dentro do cronograma");
  });

  it("atrasado diz de quem é a bola e qual a próxima ação — nunca 'deu problema'", () => {
    const r = varrerOsProjetos([projeto({ atualizadoEm: h(100) })], AGORA);
    const v = r.vereditos[0]!;
    expect(v.situacao).toBe("atrasado");
    expect(v.donoFuncaoId).toBe("manager-design"); // a bola é do GERENTE, não do agente
    expect(v.horasDeAtraso).toBe(28); // 100h num estado de 72h
    expect(v.proximaAcao).toContain("o prazo desse estado é 72h");
  });

  it("⛔ atraso vira COISA VISÍVEL COM DONO — bloqueio tipado, não linha de log", () => {
    const r = varrerOsProjetos([projeto({ atualizadoEm: h(100) })], AGORA);
    expect(r.bloqueios).toHaveLength(1);
    expect(r.bloqueios[0]).toMatchObject({
      entidadeTipo: "Project",
      entidadeId: "prj_1",
      donoFuncaoId: "manager-design",
      escalonadoPara: GERENTE_GERAL,
    });
    expect(r.bloqueios[0]!.acaoRecomendada.length).toBeGreaterThan(20);
    expect(r.bloqueios[0]!.evidencia).toContain("parado há 100h");
  });

  it("sem dono é pior que atrasado: a bola volta para o Gerente Geral, não fica órfã", () => {
    const r = varrerOsProjetos([projeto({ departamentoResponsavel: null, atualizadoEm: h(10) })], AGORA);
    expect(r.vereditos[0]).toMatchObject({ situacao: "sem_dono", donoFuncaoId: GERENTE_GERAL });
    expect(r.bloqueios).toHaveLength(1);
  });

  it("estado sem régua de SLA sobe DECLARADO — nunca vira cobrança inventada", () => {
    const r = varrerOsProjetos([projeto({ estadoCanonico: "negotiation", atualizadoEm: h(500) })], AGORA);
    expect(r.vereditos[0]!.situacao).toBe("sem_regua");
    expect(r.estadosSemRegua).toEqual(["negotiation"]);
    expect(r.bloqueios).toHaveLength(0);
  });
});

describe("coluna gravada não é cliente informado", () => {
  it("⛔ prazo PROMETIDO queimado produz bloqueio E fala ao cliente, pela voz única", () => {
    const r = varrerOsProjetos([projeto({ prazoPrometido: h(5), atualizadoEm: h(2) })], AGORA);
    expect(r.bloqueios, "gravou o bloqueio?").toHaveLength(1);
    expect(r.avisosAoCliente, "avisou o cliente?").toHaveLength(1);
    const aviso = r.avisosAoCliente[0]!;
    expect(aviso.decisao).toBe("enviar");
    if (aviso.decisao !== "enviar") throw new Error("impossível");
    expect(aviso.autorNome).toBe(VOZ_DO_CLIENTE);
    expect(aviso.mensagem.corpo).toContain("Campanha de agosto");
    // Antes de o cliente perguntar — é a métrica da ficha do Gerente Geral.
    expect(aviso.mensagem.corpo).toContain("antes de você perguntar");
    // Nada de id na frase do cliente.
    expect(aviso.mensagem.corpo).not.toContain("prj_1");
  });

  it("atraso interno que ainda cabe na data NÃO vira mensagem — ansiedade não se terceiriza", () => {
    const r = varrerOsProjetos([projeto({ atualizadoEm: h(100), prazoPrometido: h(-48) })], AGORA);
    expect(r.bloqueios).toHaveLength(1);
    expect(r.avisosAoCliente).toHaveLength(0);
  });

  it("cliente já avisado há menos de 24h não é avisado de novo — honestidade não é spam", () => {
    const r = varrerOsProjetos(
      [projeto({ prazoPrometido: h(5), atualizadoEm: h(2), clienteAvisadoEm: h(3) })],
      AGORA,
    );
    expect(r.bloqueios).toHaveLength(1);
    expect(r.avisosAoCliente).toHaveLength(0);
  });

  it("passadas 24h do último aviso, o cliente é avisado de novo", () => {
    const r = varrerOsProjetos(
      [projeto({ prazoPrometido: h(50), atualizadoEm: h(2), clienteAvisadoEm: h(30) })],
      AGORA,
    );
    expect(r.avisosAoCliente).toHaveLength(1);
  });

  it("o pior aparece primeiro — é a fila do Gerente Geral, não uma lista", () => {
    const r = varrerOsProjetos(
      [
        projeto({ id: "a", atualizadoEm: h(80) }),
        projeto({ id: "b", atualizadoEm: h(300) }),
        projeto({ id: "c", atualizadoEm: h(1) }),
      ],
      AGORA,
    );
    expect(r.vereditos.map((v) => v.projetoId)).toEqual(["b", "a", "c"]);
  });
});
