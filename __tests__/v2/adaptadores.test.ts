// ADAPTADORES — as duas metades: traduz o conhecido E recusa o desconhecido.

import { describe, it, expect } from "vitest";
import { BRAIN_DEPARTMENTS } from "@/lib/dioli-brain/departments";
import { DEPARTAMENTOS as DEPARTAMENTOS_ORGANIZACAO } from "@/lib/agency/organizacao/departamentos";
import { DEPARTAMENTOS as DEPARTAMENTOS_PORTAL } from "@/lib/agency/portal/vista-do-cliente";
import { deSlugLegado, paraSlugLegado, funcaoDeSlugLegado } from "@/lib/agency/catalogo-v2/adaptadores";
import { departamentoV2 } from "@/lib/agency/catalogo-v2/catalogo";

describe("adaptadores de slug legado ↔ canônico", () => {
  it("TODO id do BRAIN_DEPARTMENTS traduz para um departamento canônico", () => {
    for (const d of BRAIN_DEPARTMENTS) {
      const canonico = deSlugLegado(d.id);
      expect(canonico, `Brain "${d.id}" sem tradução`).toBeDefined();
      expect(departamentoV2(canonico!)).toBeDefined();
    }
  });

  it("TODO id da organização traduz — inclusive brand-hub e financeiro", () => {
    for (const d of DEPARTAMENTOS_ORGANIZACAO) {
      const canonico = deSlugLegado(d.id);
      expect(canonico, `organização "${d.id}" sem tradução`).toBeDefined();
    }
    expect(deSlugLegado("brand-hub")).toBe("branding");
    expect(deSlugLegado("financeiro")).toBe("finance");
  });

  it("TODA chave de exibição do portal traduz", () => {
    for (const d of DEPARTAMENTOS_PORTAL) {
      expect(deSlugLegado(d.chave), `portal "${d.chave}" sem tradução`).toBeDefined();
    }
  });

  it("prospeccao vira FUNÇÃO (prospecting), não departamento", () => {
    expect(deSlugLegado("prospeccao")).toBeUndefined();
    expect(funcaoDeSlugLegado("prospeccao")).toBe("prospecting");
  });

  it("a volta: todo canônico tem slug legado, e o ciclo fecha", () => {
    expect(paraSlugLegado("finance")).toBe("financeiro");
    expect(paraSlugLegado("branding")).toBe("brand-hub");
    expect(paraSlugLegado("social-media")).toBe("social-media");
    // ida e volta é identidade no canônico
    for (const id of ["finance", "branding", "design", "operations", "quality"]) {
      expect(deSlugLegado(paraSlugLegado(id)!)).toBe(id);
    }
  });

  it("slug desconhecido devolve undefined nas duas direções — fail-closed", () => {
    expect(deSlugLegado("juridico")).toBeUndefined();
    expect(paraSlugLegado("juridico")).toBeUndefined();
    expect(funcaoDeSlugLegado("juridico")).toBeUndefined();
  });
});
