// ─────────────────────────────────────────────────────────────────────────
// DEFEITO 2 — medido em 16/08/2026 EXERCITANDO "npm run reivindicar --
// abrir" DE VERDADE com o working tree sujo (não lendo o código).
//
// Saída REAL colhida do comando, com quatro arquivos modificados e não
// staged (código de status " M" — o "X" é um ESPAÇO):
//
//   - _tests__/coordenacao/reivindicacoes.test.ts      <- falta um "_"
//   - lib/coordenacao/reivindicacoes.ts
//   - scripts/reivindicar.mts
//   - __tests__/coordenacao/ancora-de-sessao.test.ts
//
// Só a PRIMEIRA linha vinha comida — as outras três, idênticas em formato,
// saíam certas. A causa: a implementação antiga lia "git status --porcelain"
// assim: `execFileSync(...).trim().split("\n")`. `.trim()` age na string
// INTEIRA, não linha a linha — e como a PRIMEIRA linha da saída real
// começava com um espaço (o código de status " M"), esse `.trim()` comia
// esse espaço só ali, antes do `slice(3)` rodar. O resultado: a primeira
// linha perdia um caractere, e "__tests__/..." virava "_tests__/..." — um
// caminho que não existe em disco e não é colável em lugar nenhum.
//
// O conserto: quem lê o processo (`scripts/reivindicar.mts`,
// `linhasCruasDoStatus`) não passa mais a saída inteira por `.trim()` antes
// de dividir por linha — só descarta linhas vazias e o '\r' de CRLF, DEPOIS
// de já estar dividida. A régua de parsing de verdade agora é PURA
// (`caminhosDoStatusPorcelain`, em `lib/coordenacao/reivindicacoes.ts`), e
// é ela que este arquivo testa — sem precisar de um `git status` real.
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";

import { caminhosDoStatusPorcelain } from "@/lib/coordenacao/reivindicacoes";

describe("caminhosDoStatusPorcelain — a primeira linha não pode perder caractere", () => {
  it("reproduz a saída REAL de 16/08/2026: quatro arquivos ' M', o primeiro com dois underscores intactos", () => {
    const linhasCruas = [
      " M __tests__/coordenacao/reivindicacoes.test.ts",
      " M lib/coordenacao/reivindicacoes.ts",
      " M scripts/reivindicar.mts",
      " M __tests__/coordenacao/ancora-de-sessao.test.ts",
      "", // a quebra de linha final que "git status --porcelain" sempre produz
    ];

    const caminhos = caminhosDoStatusPorcelain(linhasCruas);

    expect(caminhos).toEqual([
      "__tests__/coordenacao/reivindicacoes.test.ts",
      "lib/coordenacao/reivindicacoes.ts",
      "scripts/reivindicar.mts",
      "__tests__/coordenacao/ancora-de-sessao.test.ts",
    ]);

    // A checagem mais direta do defeito: o caminho começa com DOIS
    // underscores ("__tests__/"), não um ("_tests__/").
    expect(caminhos[0]).toBe("__tests__/coordenacao/reivindicacoes.test.ts");
    expect(caminhos[0]!.startsWith("__tests__/")).toBe(true);
  });

  it("também não perde caractere para arquivo DELETADO (' D'), o outro código de status comum que começa com espaço", () => {
    const caminhos = caminhosDoStatusPorcelain([" D __tests__/coordenacao/algo-apagado.test.ts", ""]);
    expect(caminhos).toEqual(["__tests__/coordenacao/algo-apagado.test.ts"]);
  });

  it("arquivo NÃO RASTREADO ('??', que não começa com espaço) já funcionava e continua funcionando", () => {
    const caminhos = caminhosDoStatusPorcelain(["?? __tests__/coordenacao/novo.test.ts", ""]);
    expect(caminhos).toEqual(["__tests__/coordenacao/novo.test.ts"]);
  });

  it("renomeio ('R  de -> para') devolve só o caminho de DESTINO, sem perder caractere nele também", () => {
    const caminhos = caminhosDoStatusPorcelain([
      "R  __tests__/coordenacao/antigo.test.ts -> __tests__/coordenacao/novo.test.ts",
      "",
    ]);
    expect(caminhos).toEqual(["__tests__/coordenacao/novo.test.ts"]);
  });

  it("REGRESSÃO — documenta o bug antigo lado a lado com o conserto: '.trim()' na string INTEIRA comia o caractere; nas linhas CRUAS, não", () => {
    const saidaBrutaComoStringUnica =
      " M __tests__/coordenacao/reivindicacoes.test.ts\n M lib/coordenacao/reivindicacoes.ts\n";

    // O código ANTIGO: `.trim()` na saída inteira, DEPOIS split.
    const linhasComOBugAntigo = saidaBrutaComoStringUnica.trim().split("\n");
    const primeiraLinhaComBug = linhasComOBugAntigo[0]!.slice(3).trim();
    expect(primeiraLinhaComBug).toBe("_tests__/coordenacao/reivindicacoes.test.ts"); // o defeito, fixado aqui de propósito

    // O código NOVO: split primeiro, sem `.trim()` na string inteira — as
    // linhas chegam CRUAS em `caminhosDoStatusPorcelain`.
    const linhasCruas = saidaBrutaComoStringUnica.split("\n");
    expect(caminhosDoStatusPorcelain(linhasCruas)[0]).toBe("__tests__/coordenacao/reivindicacoes.test.ts");
  });
});
