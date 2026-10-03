// Test drive de Branding (03/10/2026): a tela de Ativos de Marca lia dados de
// exemplo, falava inglês e não tinha ação nenhuma.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const TELA = fs.readFileSync(path.join(process.cwd(), "app/agency/brand-assets/page.tsx"), "utf8");

describe("Ativos de Marca", () => {
  it("não usa dado de exemplo nem lista de clientes do navegador", () => {
    expect(TELA).not.toContain("MOCK_BRAND_ASSETS");
    expect(TELA).not.toContain("useAgencyStore");
    expect(TELA).toContain("useDbClients()");
  });

  it("mostra o material real e deixa subir na mesma tela", () => {
    expect(TELA).toContain("<MaterialDeMarca clientId={escolhido.id} />");
  });

  it("fala português", () => {
    expect(TELA).not.toMatch(/No assets found|All Clients|Brand assets are added/);
  });
});
