// ─────────────────────────────────────────────────────────────────────────────
// A TRAVA DA REGRA "TUDO PRECISA TER HORA E DATA" (CEO, 15/08/2026)
// ─────────────────────────────────────────────────────────────────────────────
//
// O risco desta frente NÃO é esquecer um carimbo — isso se vê na tela. O risco é
// o contrário: preencher o buraco. Registro sem campo de data é fácil de
// "resolver" com `new Date()`, com "hoje", ou com a data de outro campo
// parecido. Aí a tela fica bonita e passa a mentir, que é pior do que o vazio.
//
// Guardrail 4 da casa: prompt é aviso, código é trava. Estes testes são a trava.

import { describe, expect, it } from "vitest";
import {
  carimbar,
  textoDoCarimbo,
  SEM_CARIMBO,
  FUSO_DA_CASA,
} from "@/lib/carimbo-de-tempo";

const AGORA = new Date("2026-08-15T18:47:00.000Z"); // 15:47 em São Paulo

describe("registro sem carimbo NUNCA vira data inventada", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string vazia", ""],
    ["data inválida", "não é data"],
    ["NaN", Number.NaN],
    ["Date inválido", new Date("xxx")],
  ])("%s devolve null — não devolve 'hoje'", (_rotulo, valor) => {
    expect(carimbar(valor as never, AGORA)).toBeNull();
  });

  it("a versão em texto diz a ausência com todas as letras", () => {
    expect(textoDoCarimbo(null, AGORA)).toBe(SEM_CARIMBO);
    expect(textoDoCarimbo(undefined, AGORA)).toBe(SEM_CARIMBO);
  });

  it("a frase de ausência não contém dígito nenhum — nada que pareça data", () => {
    // Se um dia alguém trocar SEM_CARIMBO por "hoje, 15/08", este teste cai.
    expect(SEM_CARIMBO).not.toMatch(/\d/);
    expect(SEM_CARIMBO.toLowerCase()).not.toContain("hoje");
  });

  it("o relógio de referência não vaza para dentro do resultado ausente", () => {
    // O erro clássico: `carimbar(null) ?? carimbar(new Date())`. Aqui, ausência
    // é ausência mesmo com um `agora` perfeitamente válido em mãos.
    expect(carimbar(null, AGORA)).toBeNull();
  });
});

describe("o carimbo traz a prova E o alarme, juntos", () => {
  it("absoluta com dia, mês, ANO e hora em 24h — e a idade relativa colada", () => {
    const c = carimbar("2026-08-15T00:47:00.000Z", AGORA)!; // 14/08 21:47 em SP
    expect(c.absoluto).toBe("14/08/2026 às 21:47");
    expect(c.relativo).toBe("há 18 h");
    expect(c.completo).toBe("14/08/2026 às 21:47 · há 18 h");
  });

  it("o formato é pt-BR: dia/mês/ano, NUNCA mm/dd/yyyy", () => {
    // A perícia achou um campo em mm/dd/yyyy no portal — era `toLocaleDateString()`
    // sem locale, caindo no en-US do servidor. Dia 03 do mês 11 prova a ordem.
    const c = carimbar("2026-11-03T15:00:00.000Z", AGORA)!;
    expect(c.absoluto.startsWith("03/11/2026")).toBe(true);
  });

  it("o fuso é o da casa, não o de quem renderizou", () => {
    // 15/08 02:30 UTC é ainda 14/08 23:30 em São Paulo. Sem timeZone fixo, o
    // servidor da Railway (UTC) escreveria 15/08 e o navegador do CEO, 14/08 —
    // o mesmo card mudando de dia conforme quem desenhou a tela.
    expect(FUSO_DA_CASA).toBe("America/Sao_Paulo");
    expect(carimbar("2026-08-15T02:30:00.000Z", AGORA)!.absoluto).toBe("14/08/2026 às 23:30");
  });

  it("o ISO vai junto, para o atributo dateTime do <time>", () => {
    expect(carimbar("2026-08-15T02:30:00.000Z", AGORA)!.iso).toBe("2026-08-15T02:30:00.000Z");
  });
});

describe("a idade sabe olhar para os dois lados do relógio", () => {
  it("passado diz 'há'", () => {
    expect(carimbar(new Date(AGORA.getTime() - 3 * 86400000), AGORA)!.relativo).toBe("há 3 dias");
  });

  it("futuro diz 'em' — é o caso do PRAZO, que é metade da tela de aprovações", () => {
    // O formatador antigo (`timeAgo`) só sabia o passado: um prazo para daqui a
    // dois dias saía como "há -2 dias" ou como "agora".
    expect(carimbar(new Date(AGORA.getTime() + 2 * 86400000), AGORA)!.relativo).toBe("em 2 dias");
  });

  it("`passado` separa prazo vencido de prazo em pé — é a régua que a tela usa", () => {
    expect(carimbar(new Date(AGORA.getTime() - 60_000), AGORA)!.passado).toBe(true);
    expect(carimbar(new Date(AGORA.getTime() + 60_000), AGORA)!.passado).toBe(false);
  });

  it("segundos viram 'agora' — sem 'há 0 min'", () => {
    expect(carimbar(new Date(AGORA.getTime() - 5_000), AGORA)!.relativo).toBe("agora");
  });
});
