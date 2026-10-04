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
    expect(TELA).toContain("<MaterialDeMarca key={escolhido.id} clientId={escolhido.id} />");
  });

  it("fala português", () => {
    expect(TELA).not.toMatch(/No assets found|All Clients|Brand assets are added/);
  });
});

const COMP = fs.readFileSync(path.join(process.cwd(), "components/agency/clients/MaterialDeMarca.tsx"), "utf8");

describe("test drive de 04/10/2026 — Ativos de Marca", () => {
  it("trocar de cliente recomeça a tela (a mensagem não vaza)", () => {
    expect(TELA).toContain("key={escolhido.id}");
  });

  it("o manual enviado aparece com data e botão de abrir", () => {
    expect(COMP).toContain("enviado em");
    expect(COMP).toContain("href={m.url}");
    expect(COMP).toContain(">\n                    Abrir");
  });

  it('"Enviados" só conta o que virou material, e a tela confere a lista depois', () => {
    expect(COMP).toContain("não virou material de marca");
    expect(COMP).toContain("não apareceu na lista");
  });
});
