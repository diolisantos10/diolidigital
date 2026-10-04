// Menu em torno do cliente (CEO, 03/10/2026) — PR 2: 9 entradas.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MENU = fs.readFileSync(path.join(process.cwd(), "components/agency/layout/AgencySidebar.tsx"), "utf8");
const nav = MENU.slice(MENU.indexOf("const NAV = ["), MENU.indexOf("];", MENU.indexOf("const NAV = [")));

describe("o menu tem as 9 entradas aprovadas", () => {
  it("5 itens soltos e 4 grupos, nesta ordem", () => {
    for (const item of ["Início", "Clientes", "Aprovações", "Oportunidades", "Agenda geral"]) {
      expect(nav).toContain(`label: "${item}"`);
    }
    const grupos = [...nav.matchAll(/group: "([^"]+)"/g)].map((m) => m[1]);
    expect(grupos).toEqual(["Entrada", "Conversas", "Gestão", "Agência por dentro"]);
  });

  it("o que é de UM cliente saiu do menu (mora nas abas dele)", () => {
    for (const href of ["/agency/projects", "/agency/pipeline", "/agency/tasks", "/agency/deliverables", "/agency/brand-assets", "/agency/social/analista", "/agency/radar"]) {
      expect(nav, href).not.toContain(`href: "${href}"`);
    }
  });

  it("Desempenho pago e WhatsApp mantêm porta (análise do app da Meta)", () => {
    expect(nav).toContain('href: "/agency/desempenho-pago"');
    expect(nav).toContain('href: "/agency/whatsapp"');
  });

  it("nenhuma tela foi apagada — só saiu do menu", () => {
    for (const p of ["projects", "pipeline", "tasks", "deliverables", "brand-assets", "social/analista", "radar"]) {
      expect(fs.existsSync(path.join(process.cwd(), `app/agency/${p}/page.tsx`)), p).toBe(true);
    }
  });
});
