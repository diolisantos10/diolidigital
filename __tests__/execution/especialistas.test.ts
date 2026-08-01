import { describe, it, expect } from "vitest";
import { DEPARTAMENTOS, TODOS_OS_ESPECIALISTAS, type Ctx } from "@/lib/agency/execution/especialistas";

const ctx: Ctx = {
  businessName: "Sushi Cazza",
  segment: "Restaurante japonês",
  targetAudience: "famílias e casais",
  tone: "sofisticado",
  services: ["Social", "Design"],
  objectives: ["Vender mais"],
  strategyHeadline: "Premium acessível",
  hasBrandAssets: true,
  hasRawMaterial: false,
};

describe("o organograma da agência", () => {
  it("todo id de especialista é único — é a chave da idempotência do motor", () => {
    const ids = TODOS_OS_ESPECIALISTAS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("os ids históricos foram preservados — renomear reprocessaria entregas já feitas", () => {
    // a3/a2/a4/a5 já estão gravados como ownerAgentId em entregas existentes.
    // Se mudarem, o motor deixa de reconhecê-las e produz tudo de novo.
    const ids = TODOS_OS_ESPECIALISTAS.map((e) => e.id);
    for (const historico of ["a2", "a3", "a4", "a5"]) expect(ids).toContain(historico);
  });

  it("departamento é equipe: as casas de produção têm mais de um especialista", () => {
    const social = DEPARTAMENTOS.find((d) => d.id === "social-media")!;
    const design = DEPARTAMENTOS.find((d) => d.id === "design")!;
    expect(social.especialistas.length).toBeGreaterThan(1);
    expect(design.especialistas.length).toBeGreaterThan(1);
  });

  it("existe o especialista de vídeo — prioridade do CEO", () => {
    const ids = TODOS_OS_ESPECIALISTAS.map((e) => e.id);
    expect(ids).toContain("social-roteiro-video");
  });

  it("existe o departamento Financeiro", () => {
    expect(DEPARTAMENTOS.map((d) => d.id)).toContain("financeiro");
  });

  it("o criativo de tráfego é peça própria — anúncio não é post", () => {
    const design = DEPARTAMENTOS.find((d) => d.id === "design")!;
    expect(design.especialistas.map((e) => e.id)).toContain("design-criativo-trafego");
  });
});

describe("as travas de verdade em cada prompt", () => {
  it("todo especialista proíbe inventar dado — sem revisor humano, é a única defesa", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      const p = e.prompt(ctx);
      expect(p, `${e.id} não proíbe inventar`).toMatch(/Não invente/i);
      expect(p, `${e.id} não ensina a admitir falta de dado`).toMatch(/PRECISO CONFIRMAR/);
    }
  });

  it("todo prompt carrega o nome do negócio — nada genérico sai daqui", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(e.prompt(ctx), `${e.id} ignora o cliente`).toContain("Sushi Cazza");
    }
  });

  it("todo prompt exige JSON — o motor não sabe ler prosa solta", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(e.prompt(ctx), `${e.id} não pede JSON`).toMatch(/JSON/);
    }
  });

  it("o financeiro é o mais travado de todos — número errado ali é promessa comercial falsa", () => {
    const fin = TODOS_OS_ESPECIALISTAS.find((e) => e.id === "financeiro-plano")!;
    expect(fin.prompt(ctx)).toMatch(/não invente nenhum valor/i);
  });
});

describe("o roteiro de vídeo se adapta ao que o cliente tem", () => {
  const video = TODOS_OS_ESPECIALISTAS.find((e) => e.id === "social-roteiro-video")!;

  it("cliente NÃO manda material → roteiro para ele gravar com o celular", () => {
    const p = video.prompt({ ...ctx, hasRawMaterial: false });
    expect(p).toMatch(/GRAVAR/);
    expect(p).toMatch(/celular/i);
  });

  it("cliente manda material → roteiro de EDIÇÃO do material dele", () => {
    const p = video.prompt({ ...ctx, hasRawMaterial: true });
    expect(p).toMatch(/EDIÇÃO/);
  });
});

describe("quem precisa de insumo não inventa — abre pedido", () => {
  it("identidade visual sem material de marca não produz", () => {
    const design = DEPARTAMENTOS.find((d) => d.id === "design")!;
    const identidade = design.especialistas.find((e) => e.id === "a2")!;
    expect(identidade.precisaDe).toBeDefined();
    expect(identidade.precisaDe!.tem({ ...ctx, hasBrandAssets: false })).toBe(false);
    expect(identidade.precisaDe!.tem({ ...ctx, hasBrandAssets: true })).toBe(true);
  });
});
