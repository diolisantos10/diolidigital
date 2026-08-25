// O AVISO AO CLIENTE É FAIL-CLOSED — sem linha de flag, nada sai.
//
// Esta é a trava que separa "construído e provado" de "ligado". O laço já
// enfileira a fala do Gerente Geral quando um prazo prometido queima; a fala
// só ALCANÇA o cliente com `v2_execucao` ligada no escopo daquele cliente.
//
// As duas metades: barra o caso plantado (flag ausente, flag desligada, flag
// ligada em OUTRO cliente) e não acusa o caso limpo (flag do cliente ligada).

import { describe, it, expect } from "vitest";
import { entregarAvisoAoCliente } from "@/lib/agency/gerencia/aviso-ao-cliente";
import { FLAGS_V2, type ArmazemDeFlags, type LinhaDeFlag } from "@/lib/agency/flags-v2/flags";

function armazem(linhas: LinhaDeFlag[]): ArmazemDeFlags {
  return { async buscar(chave, escopos) { return linhas.filter((l) => l.chave === chave && escopos.includes(l.escopo)); } };
}

function deps(linhas: LinhaDeFlag[]) {
  const enviadas: Array<{ clienteId: string; autorNome: string; corpo: string }> = [];
  return {
    enviadas,
    deps: {
      armazemDeFlags: armazem(linhas),
      async gravarMensagem(d: { clienteId: string; autorNome: string; corpo: string }) {
        enviadas.push(d);
      },
    },
  };
}

const carga = { clienteId: "cli_1", autorNome: "Gerente de projeto", corpo: "A data mudou." };

describe("a entrega do aviso de atraso", () => {
  it("⛔ SEM linha de flag nenhuma, nada é enviado — ausência é desligada", async () => {
    const { enviadas, deps: d } = deps([]);
    await expect(entregarAvisoAoCliente(carga, "c1", d)).rejects.toThrow(/v2_execucao desligada/);
    expect(enviadas).toHaveLength(0);
  });

  it("⛔ flag DESLIGADA no cliente não envia", async () => {
    const { enviadas, deps: d } = deps([{ chave: FLAGS_V2.execucao, escopo: "cli_1", ligada: false }]);
    await expect(entregarAvisoAoCliente(carga, "c1", d)).rejects.toThrow();
    expect(enviadas).toHaveLength(0);
  });

  it("⛔ flag ligada em OUTRO cliente não vaza para este", async () => {
    const { enviadas, deps: d } = deps([{ chave: FLAGS_V2.execucao, escopo: "cli_2", ligada: true }]);
    await expect(entregarAvisoAoCliente(carga, "c1", d)).rejects.toThrow();
    expect(enviadas).toHaveLength(0);
  });

  it("⛔ carga sem cliente ou sem corpo falha declarada, nunca vira mensagem vazia", async () => {
    const { deps: d } = deps([{ chave: FLAGS_V2.execucao, escopo: "cli_1", ligada: true }]);
    await expect(entregarAvisoAoCliente({ corpo: "oi" }, "c1", d)).rejects.toThrow(/sem cliente/);
    await expect(entregarAvisoAoCliente({ clienteId: "cli_1", corpo: "  " }, "c1", d)).rejects.toThrow();
  });

  it("com a flag ligada NO ESCOPO do cliente, a mensagem sai pela voz única", async () => {
    const { enviadas, deps: d } = deps([{ chave: FLAGS_V2.execucao, escopo: "cli_1", ligada: true }]);
    await entregarAvisoAoCliente(carga, "c1", d);
    expect(enviadas).toEqual([{ clienteId: "cli_1", autorNome: "Gerente de projeto", corpo: "A data mudou." }]);
  });

  it("a flag GLOBAL não é a porta deste efeito quando o cliente tem a própria linha desligada", async () => {
    const { enviadas, deps: d } = deps([
      { chave: FLAGS_V2.execucao, escopo: "cli_1", ligada: false },
      { chave: FLAGS_V2.execucao, escopo: "global", ligada: true },
    ]);
    await expect(entregarAvisoAoCliente(carga, "c1", d)).rejects.toThrow();
    expect(enviadas).toHaveLength(0);
  });
});
