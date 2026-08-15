// FLAGS DA V2 — desligado por padrão; a mais específica vence.

import { describe, it, expect } from "vitest";
import { flagLigada, type ArmazemDeFlags, type LinhaDeFlag } from "@/lib/agency/flags-v2/flags";

function armazem(linhas: LinhaDeFlag[]): ArmazemDeFlags {
  return {
    async buscar(chave, escopos) {
      return linhas.filter((l) => l.chave === chave && escopos.includes(l.escopo));
    },
  };
}

describe("flagLigada", () => {
  it("sem linha nenhuma = DESLIGADA — fail-closed", async () => {
    expect(await flagLigada("v2_escrita", ["ws1"], armazem([]))).toBe(false);
  });

  it("linha global liga para todo mundo", async () => {
    const a = armazem([{ chave: "v2_escrita", escopo: "global", ligada: true }]);
    expect(await flagLigada("v2_escrita", ["ws1"], a)).toBe(true);
    expect(await flagLigada("v2_escrita", ["ws2"], a)).toBe(true);
  });

  it("escopo específico vence o global — nos dois sentidos", async () => {
    const a = armazem([
      { chave: "v2_escrita", escopo: "global", ligada: true },
      { chave: "v2_escrita", escopo: "ws1", ligada: false },
    ]);
    expect(await flagLigada("v2_escrita", ["ws1"], a)).toBe(false); // desligada só pra ws1
    expect(await flagLigada("v2_escrita", ["ws2"], a)).toBe(true);

    const b = armazem([
      { chave: "v2_escrita", escopo: "global", ligada: false },
      { chave: "v2_escrita", escopo: "ws1", ligada: true },
    ]);
    expect(await flagLigada("v2_escrita", ["ws1"], b)).toBe(true); // piloto por workspace
    expect(await flagLigada("v2_escrita", ["ws2"], b)).toBe(false);
  });

  it("chave diferente não interfere", async () => {
    const a = armazem([{ chave: "v2_leitura_dupla", escopo: "global", ligada: true }]);
    expect(await flagLigada("v2_escrita", ["ws1"], a)).toBe(false);
  });
});
