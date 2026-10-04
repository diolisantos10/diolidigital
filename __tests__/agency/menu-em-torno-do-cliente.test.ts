// Menu em torno do cliente (CEO, 03/10/2026) — PR 2: 9 entradas.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MENU_PRINCIPAL, itemAtivo } from "@/lib/agency/menu/menu-principal";

const MENU = fs.readFileSync(path.join(process.cwd(), "components/agency/layout/AgencySidebar.tsx"), "utf8");
const nav = MENU.slice(MENU.indexOf("const NAV = ["), MENU.indexOf("];", MENU.indexOf("const NAV = [")));

describe("o menu tem as 9 entradas aprovadas", () => {
  it("nove entradas, nesta ordem — sem grupos abertos (04/10/2026)", () => {
    expect(MENU_PRINCIPAL.map((i) => i.rotulo)).toEqual([
      "Início", "Clientes", "Entrada", "Aprovações", "Conversas",
      "Oportunidades", "Agenda geral", "Gestão", "Agência por dentro",
    ]);
    // O menu lateral lê da fonte única — não tem lista própria.
    expect(MENU).toContain("MENU_PRINCIPAL");
    expect(nav).not.toMatch(/group: "/);
  });

  it("o que é de UM cliente saiu do menu (mora nas abas dele)", () => {
    const todos = JSON.stringify(MENU_PRINCIPAL);
    for (const href of ["/agency/projects", "/agency/pipeline", "/agency/tasks", "/agency/deliverables", "/agency/brand-assets", "/agency/social/analista", "/agency/radar"]) {
      expect(nav, href).not.toContain(`href: "${href}"`);
      expect(todos, href).not.toContain(`"${href}"`);
    }
  });

  it("Desempenho pago e WhatsApp mantêm porta (análise do app da Meta)", () => {
    expect(itemAtivo("/agency/desempenho-pago")?.rotulo).toBe("Gestão");
    expect(itemAtivo("/agency/whatsapp")?.rotulo).toBe("Conversas");
  });

  it("nenhuma tela foi apagada — só saiu do menu", () => {
    for (const p of ["projects", "pipeline", "tasks", "deliverables", "brand-assets", "social/analista", "radar"]) {
      expect(fs.existsSync(path.join(process.cwd(), `app/agency/${p}/page.tsx`)), p).toBe(true);
    }
  });
});
