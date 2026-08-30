// CONSERTO B2/1 — o arquivo-fonte de `quarentena.ts` é TEXTO LEGÍVEL, sem um
// único byte de controle cru. Antes deste conserto, `quarentena.ts` continha
// (como bytes de verdade, não como texto) 2 NUL bytes e caracteres Unicode de
// sobrescrita/isolamento de direção — dentro da própria classe de caracteres
// que a checagem varre, e também em comentários que afirmavam o contrário.
// Consequência medida pelo PM: `git diff` saía como `Bin ... bytes` (revisão
// por diff impossível) e a ferramenta de despacho recusava transportar o
// trecho.
//
// A varredura na hora deste conserto também achou o MESMO defeito num
// segundo arquivo: `ponte-quarentena.test.ts` continha, cru, o glifo de
// sobrescrita de direção usado no teste "RTL override" — mesmo comentário
// alegando "escape", mesma contradição. Por isso este teste varre os DOIS
// arquivos, não só `quarentena.ts`: o mesmo defeito já se repetiu uma vez
// nesta pasta, e a prova precisa cobrir a família, não só o primeiro caso.
//
// Este teste varre o ARQUIVO-FONTE (não o comportamento em runtime — isso já
// é coberto por `ponte-quarentena.test.ts`) e falha se qualquer byte de
// controle cru aparecer: NUL, e as duas faixas de sobrescrita/isolamento de
// direção do Unicode (0x202A–0x202E, 0x2066–0x2069). Mesmo padrão de
// varredura estática de `__tests__/celula/trilha-e-append-only.test.ts`.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ARQUIVOS_VARRIDOS: readonly string[] = [
  "lib/agency/celula/ponte/quarentena.ts",
  "__tests__/celula/ponte-quarentena.test.ts",
];

describe.each(ARQUIVOS_VARRIDOS)("%s é texto legível — nenhum byte de controle cru no arquivo-fonte", (caminhoRelativo) => {
  const bytesDoArquivo = readFileSync(path.join(process.cwd(), caminhoRelativo));

  it("não contém NUL byte (0x00) cru", () => {
    const posicao = bytesDoArquivo.indexOf(0x00);
    expect(posicao, `NUL byte cru encontrado no offset ${posicao}`).toBe(-1);
  });

  it("não contém caractere Unicode de sobrescrita de direção cru (0x202A–0x202E)", () => {
    const codigoFonte = bytesDoArquivo.toString("utf-8");
    for (let codigo = 0x202a; codigo <= 0x202e; codigo++) {
      const caractere = String.fromCharCode(codigo);
      expect(
        codigoFonte.includes(caractere),
        `caractere de sobrescrita de direção cru (0x${codigo.toString(16)}) encontrado no arquivo-fonte`,
      ).toBe(false);
    }
  });

  it("não contém caractere Unicode de isolamento de direção cru (0x2066–0x2069)", () => {
    const codigoFonte = bytesDoArquivo.toString("utf-8");
    for (let codigo = 0x2066; codigo <= 0x2069; codigo++) {
      const caractere = String.fromCharCode(codigo);
      expect(
        codigoFonte.includes(caractere),
        `caractere de isolamento de direção cru (0x${codigo.toString(16)}) encontrado no arquivo-fonte`,
      ).toBe(false);
    }
  });

  it("varredura geral: nenhum byte de controle fora de \\n, \\t, \\r em qualquer lugar do arquivo", () => {
    const proibidos: number[] = [];
    for (const b of bytesDoArquivo) {
      if (b < 0x20 && b !== 0x0a && b !== 0x09 && b !== 0x0d) proibidos.push(b);
    }
    expect(proibidos, `bytes de controle crus encontrados: ${JSON.stringify(proibidos)}`).toEqual([]);
  });

  it("é UTF-8 válido de ponta a ponta (a varredura acima não está sendo enganada por um arquivo truncado/corrompido)", () => {
    expect(() => bytesDoArquivo.toString("utf-8")).not.toThrow();
    expect(bytesDoArquivo.length).toBeGreaterThan(500);
  });
});
