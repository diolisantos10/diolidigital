// TEST DRIVE DE 04/10/2026 — telas do menu que liam a cópia do navegador ou
// dado de demonstração. Esta trava impede a volta.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ler = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");

describe("telas do menu leem do banco, não da cópia do navegador", () => {
  it("Aprovações: proposta não se aprova na cópia do navegador; clientes e projetos do banco", () => {
    const s = ler("app/agency/approvals/page.tsx");
    expect(s).not.toMatch(/approveProposal|rejectProposal|useAgencyStore\(/);
    expect(s).toContain("useDbProjects()");
    expect(s).toContain("useDbClients()");
  });

  it("Clientes: a contagem de projetos vem do banco", () => {
    expect(ler("app/agency/clients/page.tsx")).toContain("const { projects } = useDbProjects();");
  });

  it("Configurações: sem cliente fictício e sem botões de dados de demonstração", () => {
    const s = ler("app/agency/settings/page.tsx");
    expect(s).not.toMatch(/PILOT_CLIENT_ID|loadPilotData|clearAllData|resetStore/);
  });

  it("Integrações: 'configurada' só com confirmação do banco", () => {
    const s = ler("app/agency/integrations/page.tsx");
    expect(s).toContain('fetch("/api/ai-keys"');
    expect(s).not.toMatch(/integrationConfigs\.find\(\(c\) => c\.integrationId === i\.id\)/);
  });

  it("Solicitações: a lista antiga da cópia do navegador fica fora da tela, e o vazio se anuncia", () => {
    const s = ler("app/agency/requests/page.tsx");
    expect(s).toContain("const MOSTRAR_COPIA_DO_NAVEGADOR = false as boolean;");
    expect(s).toContain("Nenhuma solicitação no momento");
  });
});
