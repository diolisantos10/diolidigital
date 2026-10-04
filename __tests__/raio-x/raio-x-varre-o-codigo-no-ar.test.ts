// BLOCO G (04/10/2026): a metade de CÓDIGO do Raio-X noturno varria uma
// branch 1.032 commits atrás da produção. Esta trava garante que a varredura
// roda no checkout do código que está no ar, e que a coleta continua sendo
// guardada fora da branch de deploy (gravar lá = um deploy por noite).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const wf = fs.readFileSync(path.join(process.cwd(), ".github/workflows/raio-x-noturno.yml"), "utf8");

describe("Raio-X noturno", () => {
  it("varre o código da branch de produção, num checkout próprio", () => {
    expect(wf).toMatch(/ref: claude\/dioli-agency-os-architecture-kk7kp\s+path: producao/);
    const coleta = wf.slice(wf.indexOf("- name: Coletar as duas metades"), wf.indexOf("- name: Resumo da noite"));
    expect(coleta).toContain("cd producao");
    expect(coleta.indexOf("cd producao")).toBeLessThan(coleta.indexOf("npm run raio-x"));
  });

  it("copia só a coleta desta noite para a branch de coletas", () => {
    expect(wf).toContain("-newer /tmp/marca-da-coleta");
  });

  it("a coleta NÃO é empurrada para a branch de deploy", () => {
    expect(wf).not.toMatch(/git push origin HEAD:claude\/dioli-agency-os-architecture-kk7kp/);
  });
});
