// Menu em torno do cliente (CEO, 03/10/2026) — PR 1: abas dentro do cliente e
// as listas gerais lendo o BANCO, não a cópia do navegador.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("Projetos, Tarefas e Entregas leem o banco", () => {
  it("os hooks não misturam a cópia do navegador quando o banco respondeu", () => {
    expect(ler("lib/hooks/useDbProjects.ts")).toContain("dbProjects ?? storeProjects");
    expect(ler("lib/hooks/useDbTasks.ts")).toContain("dbTasks ?? storeTasks");
    expect(ler("lib/hooks/useDbDeliverables.ts")).toContain("dbDeliverables ??");
  });

  it("as três páginas tiram projetos, clientes, tarefas e entregas dos hooks do banco", () => {
    const projetos = ler("app/agency/projects/page.tsx");
    expect(projetos).toContain("useDbTasks()");
    expect(projetos).toContain("useDbClients()");
    expect(projetos).not.toMatch(/const \{[^}]*\btasks\b[^}]*\} = useAgencyStore/);
    const tarefas = ler("app/agency/tasks/page.tsx");
    expect(tarefas).toContain("useDbProjects()");
    expect(tarefas).toContain("useDbDeliverables()");
    expect(ler("app/agency/deliverables/page.tsx")).toContain("useDbProjects()");
  });
});

describe("dentro do cliente", () => {
  it("a aba Social tem o calendário do cliente e o Analista dele", () => {
    const social = ler("components/agency/clients/workspace/SocialMediaTab.tsx");
    expect(social).toContain("/agency/planner?cliente=");
    expect(social).toContain('sub === "Analytics" && analista');
    expect(ler("components/agency/clients/workspace/PaginaDoCliente.tsx")).toContain("<AnalistaDeSocial ehMaster={ehMaster} clientId={id} />");
  });

  it("o calendário abre filtrado pelo ?cliente=", () => {
    expect(ler("app/agency/planner/page.tsx")).toContain('get("cliente")');
  });
});
