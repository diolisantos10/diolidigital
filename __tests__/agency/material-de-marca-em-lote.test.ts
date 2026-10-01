// 01/10/2026 — o acervo do Sushi Cazza tem 229 itens e chega SEM Drive, pelo
// painel. A tela pedia o papel arquivo a arquivo, e o limite de 20 envios por
// minuto do `/api/media` descartava o resto em silêncio.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const COMP = fs.readFileSync(path.join(process.cwd(), "components/agency/clients/MaterialDeMarca.tsx"), "utf8");

describe("subir material em lote pelo painel", () => {
  it("dá para aplicar o mesmo papel a todos os arquivos sem papel", () => {
    expect(COMP).toContain("function papelParaTodos");
    expect(COMP).toContain("Aplicar o mesmo papel a todos os arquivos sem papel");
  });

  it("o 429 do limite de envio espera e tenta de novo, em vez de descartar o arquivo", () => {
    expect(COMP).toContain("res.status === 429");
    expect(COMP).toMatch(/setTimeout\(r, 15_000\)/);
  });

  it("o que falhou de verdade fica na lista para reenviar", () => {
    expect(COMP).toContain("setFila(falharam)");
    expect(COMP).not.toContain("setFila([]);\n    setEnviando(false);");
  });
});
