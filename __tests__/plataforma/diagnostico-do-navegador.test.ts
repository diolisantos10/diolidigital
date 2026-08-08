// A rota que mede o navegador do contêiner não pode virar uma porta.
//
// Ela nasceu para trocar adivinhação por medida no P0 do molde (08/08/2026), e
// por isso vive fechada e sem verbo de escrita. Cada trava aqui tem AS DUAS
// METADES: prova que barra o problema plantado E que não inventa problema no
// caso limpo.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ARQUIVO = path.join(process.cwd(), "app/api/admin/diagnostico-do-navegador/route.ts");
const FONTE = fs.readFileSync(ARQUIVO, "utf8");

describe("a rota é SOMENTE LEITURA, por construção", () => {
  it("metade 1 — não exporta POST, PUT, PATCH nem DELETE", () => {
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        new RegExp(`export\\s+(async\\s+)?function\\s+${verbo}\\b`).test(FONTE),
        `a rota passou a exportar ${verbo} — ela é de leitura`,
      ).toBe(false);
    }
  });

  it("metade 2 — o GET existe (senão a trava acima estaria protegendo um arquivo vazio)", () => {
    expect(/export\s+async\s+function\s+GET\b/.test(FONTE)).toBe(true);
  });

  it("não escreve no disco, nem no banco", () => {
    for (const proibido of ["writeFile", "mkdir", "unlink", "rm(", "prisma.", "execSync", "spawn"]) {
      expect(FONTE.includes(proibido), `a rota passou a usar ${proibido}`).toBe(false);
    }
  });

  it("não sobe navegador — lançar é outro teste, e trava o processo por 45s", () => {
    expect(FONTE.includes(".launch(")).toBe(false);
  });
});

describe("a porta é fechada, e fecha MAIS quando o segredo some", () => {
  it("metade 1 — sem CRON_SECRET no ambiente, responde 503 (nunca abre)", () => {
    expect(/CRON_SECRET/.test(FONTE)).toBe(true);
    expect(/status:\s*503/.test(FONTE)).toBe(true);
  });

  it("metade 2 — com segredo, a conferência é em tempo constante e devolve 401", () => {
    expect(FONTE.includes("segredoConfere")).toBe(true);
    expect(/status:\s*401/.test(FONTE)).toBe(true);
  });
});

describe("nenhum segredo sai pela resposta", () => {
  it("o corpo devolve presença/caminho, nunca o valor de uma credencial", () => {
    for (const segredo of [
      "process.env.CRON_SECRET,",
      "AUTH_SECRET",
      "JWT_SECRET",
      "OPENAI_API_KEY",
      "GOOGLE_CLIENT_SECRET",
      "META_APP_SECRET",
    ]) {
      expect(FONTE.includes(segredo), `${segredo} apareceu no corpo da rota`).toBe(false);
    }
  });
});
