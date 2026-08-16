// GUARDA: nenhum teste de integração da V2 sobe banco num caminho FIXO em
// /tmp. Ver `banco-descartavel.ts` para o porquê — caminho fixo é estado
// compartilhado entre PROCESSOS (sessões de agente diferentes rodando `npm
// test` na mesma máquina ao mesmo tempo), não só entre arquivos do mesmo
// processo. Foi exatamente isso que produzia o portão instável de
// `criterios-de-aceite.test.ts`: 14/14 sozinho, contagem de falha variável
// (5, depois 7, depois 0) dentro da suíte cheia.
//
// Este teste lê o CÓDIGO-FONTE dos arquivos de `__tests__/v2/` — se alguém
// reintroduzir `const CAMINHO_DB = "/tmp/algo-fixo.db"`, ele conta a
// história antes que a flakiness volte.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR_V2 = join(__dirname, "..");

function arquivosDeTeste(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "_infra") continue; // o próprio helper e esta guarda
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontrados.push(...arquivosDeTeste(caminho));
    } else if (entrada.isFile() && /\.test\.tsx?$/.test(entrada.name)) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

describe("guarda: banco de teste da V2 nunca usa caminho fixo em /tmp", () => {
  it("todo CAMINHO_DB vem de caminhoDeBancoDescartavel(...), nunca de um literal", () => {
    const arquivos = arquivosDeTeste(DIR_V2);
    expect(arquivos.length).toBeGreaterThan(0); // a guarda não pode varrer pasta vazia

    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, "utf8");
      if (!/\bCAMINHO_DB\s*=/.test(fonte)) continue; // arquivo não sobe banco próprio

      const usaHelper = /CAMINHO_DB\s*=\s*caminhoDeBancoDescartavel\(/.test(fonte);
      const usaLiteralFixo = /CAMINHO_DB\s*=\s*["'`]\/tmp\/[^$"'`]*\.db["'`]/.test(fonte);

      expect(usaLiteralFixo, `${arquivo}: CAMINHO_DB usa um caminho FIXO em /tmp — troque por caminhoDeBancoDescartavel(), ver _infra/banco-descartavel.ts`).toBe(false);
      expect(usaHelper, `${arquivo}: CAMINHO_DB não usa caminhoDeBancoDescartavel() — o caminho pode colidir entre processos`).toBe(true);
    }
  });
});
