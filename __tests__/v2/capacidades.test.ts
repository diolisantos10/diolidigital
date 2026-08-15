// CAPACIDADE POR FUNÇÃO — a matriz do 04-PERMISSOES como teste, não como prosa.
//
// As duas metades de toda trava: barra o caso plantado E não acusa o caso
// limpo. Perfis usados são os REAIS de PERFIL_DO_PAPEL — se um papel mudar de
// perfil, este teste conta a história.

import { describe, it, expect } from "vitest";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";
import { podeExecutarFuncao } from "@/lib/agency/catalogo-v2/capacidades";
import { FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";

describe("podeExecutarFuncao — negar por padrão", () => {
  it("master e diretor executam qualquer função do catálogo", () => {
    for (const papel of ["master", "diretor"] as const) {
      const perfil = PERFIL_DO_PAPEL[papel];
      expect(podeExecutarFuncao(perfil, "copywriter").permitido).toBe(true);
      expect(podeExecutarFuncao(perfil, "billing").permitido).toBe(true);
      expect(podeExecutarFuncao(perfil, "security-and-audit").permitido).toBe(true);
    }
  });

  it("staff executa no próprio departamento — o caso limpo passa", () => {
    expect(podeExecutarFuncao(PERFIL_DO_PAPEL.social_staff, "copywriter").permitido).toBe(true);
    expect(podeExecutarFuncao(PERFIL_DO_PAPEL.ads_staff, "campaign-builder").permitido).toBe(true);
    expect(podeExecutarFuncao(PERFIL_DO_PAPEL.executivo_comercial, "conversational-sdr").permitido).toBe(true);
  });

  it("staff NÃO executa função de outro departamento — o caso plantado barra", () => {
    expect(podeExecutarFuncao(PERFIL_DO_PAPEL.social_staff, "graphic-designer").permitido).toBe(false);
    expect(podeExecutarFuncao(PERFIL_DO_PAPEL.ads_staff, "billing").permitido).toBe(false);
    expect(podeExecutarFuncao(PERFIL_DO_PAPEL.executivo_comercial, "credentials-and-access").permitido).toBe(false);
  });

  it("design_staff alcança branding pelo adaptador (brand-hub → branding)", () => {
    const veredito = podeExecutarFuncao(PERFIL_DO_PAPEL.design_staff, "brandbook-and-assets");
    // O perfil legado do design escreve em design e brand-hub; na V2 isso é
    // design + branding. Se o perfil mudar, este teste conta a mudança.
    expect(veredito.permitido).toBe(true);
  });

  it("função inexistente é negada até para master — não existe 'pode passar'", () => {
    expect(podeExecutarFuncao(PERFIL_DO_PAPEL.master, "funcao-fantasma").permitido).toBe(false);
  });

  it("project_manager coordena, não executa produção especializada", () => {
    const pm = PERFIL_DO_PAPEL.project_manager;
    // as funções do próprio departamento project-management: sim
    expect(podeExecutarFuncao(pm, "pm-orchestrator").permitido).toBe(
      pm.departamentos.length > 0 ? true : false,
    );
    // produção especializada de outros: não (a menos que o perfil declare)
    const executaDesign = podeExecutarFuncao(pm, "graphic-designer").permitido;
    const declaraDesign = pm.departamentos.includes("design" as never);
    expect(executaDesign).toBe(declaraDesign);
  });

  it("toda função do catálogo tem dono resolvível (nenhuma órfã de permissão)", () => {
    for (const f of FUNCOES_V2) {
      const veredito = podeExecutarFuncao(PERFIL_DO_PAPEL.master, f.id);
      expect(veredito.permitido, `função ${f.id} inavaliável`).toBe(true);
    }
  });
});
