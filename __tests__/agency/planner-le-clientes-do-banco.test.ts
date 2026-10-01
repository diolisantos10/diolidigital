// 01/10/2026 — o Sushi Cazza, cadastrado no painel, não aparecia no
// Planejamento: a lista vinha do navegador. E gerar as artes da semana só era
// possível pelo console.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const PLANNER = fs.readFileSync(path.join(process.cwd(), "app/agency/planner/page.tsx"), "utf8");
const MODAL = fs.readFileSync(path.join(process.cwd(), "components/agency/planner/GerarCalendarioModal.tsx"), "utf8");

describe("Planejamento", () => {
  it("lê os clientes do banco, não da lista do navegador", () => {
    expect(PLANNER).toContain("const { clients } = useDbClients();");
    expect(PLANNER).not.toContain("const { clients, currentRole } = useAgencyStore();");
  });

  it("tem caminho na tela para gerar as artes até domingo", () => {
    expect(MODAL).toContain("Gerar artes até domingo");
    expect(MODAL).toContain('"/api/social-posts/semana"');
  });
});
