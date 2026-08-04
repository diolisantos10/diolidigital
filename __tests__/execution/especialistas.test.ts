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
  materiaisEntregues: [],
  criandoIdentidade: false,
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

  it("quem contratou CRIAR a marca não é cobrado por ela — era um deadlock", () => {
    // O especialista pedia ao cliente o que o cliente pagou para receber. Quem
    // contrata identidade visual contrata porque NÃO tem marca; o pacote nunca
    // era apresentado, e travava justamente o cliente que mais precisa.
    const design = DEPARTAMENTOS.find((d) => d.id === "design")!;
    const identidade = design.especialistas.find((e) => e.id === "a2")!;
    expect(
      identidade.precisaDe!.tem({ ...ctx, hasBrandAssets: false, criandoIdentidade: true }),
    ).toBe(true);
  });

  it("criando do zero, o prompt manda PROPOR a marca em vez de pedir material", () => {
    const design = DEPARTAMENTOS.find((d) => d.id === "design")!;
    const identidade = design.especialistas.find((e) => e.id === "a2")!;
    const p = identidade.prompt({ ...ctx, criandoIdentidade: true });
    expect(p).toMatch(/DO ZERO/);
    expect(p).toMatch(/NÃO peça material/i);
  });

  it("marca que já existe → trabalha a partir dela, sem reinventar", () => {
    const design = DEPARTAMENTOS.find((d) => d.id === "design")!;
    const identidade = design.especialistas.find((e) => e.id === "a2")!;
    expect(identidade.prompt({ ...ctx, criandoIdentidade: false })).toMatch(/já existe/i);
  });

  it("o cliente que JÁ mandou o material não é cobrado outra vez", () => {
    // O laço cruel que isto impede: o agente pede o logo, o cliente manda, a
    // produção retoma, a marca no banco continua vazia — e o agente pede o logo
    // de novo. Para sempre.
    const design = DEPARTAMENTOS.find((d) => d.id === "design")!;
    const identidade = design.especialistas.find((e) => e.id === "a2")!;
    expect(
      identidade.precisaDe!.tem({ ...ctx, hasBrandAssets: false, materiaisEntregues: ["design"] }),
    ).toBe(true);
  });
});

describe("cada especialista usa a IA que faz melhor o trabalho dele", () => {
  it("a concorrência usa uma IA de PESQUISA — concorrente inventado é o erro mais caro", () => {
    const conc = TODOS_OS_ESPECIALISTAS.find((e) => e.id === "strategy-concorrencia")!;
    expect(conc.provedor).toBe("perplexity");
    expect(conc.prompt(ctx)).toMatch(/cite a fonte/i);
  });

  it("nenhum outro especialista usa a IA de pesquisa — ela não é redatora", () => {
    const pesquisa = TODOS_OS_ESPECIALISTAS.filter((e) => e.provedor === "perplexity");
    expect(pesquisa.map((e) => e.id)).toEqual(["strategy-concorrencia"]);
  });

  it("todo especialista declara seu provedor — escolha explícita, não sorte do padrão", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(e.provedor, `${e.id} sem provedor declarado`).toBeDefined();
    }
  });
});

describe("os especialistas novos da rodada 90+", () => {
  it("existe o de SEGMENTAÇÃO — era o elo que faltava entre prosa e Marketing API", () => {
    const e = TODOS_OS_ESPECIALISTAS.find((x) => x.id === "traffic-segmentacao")!;
    expect(e).toBeDefined();
    const p = e.prompt(ctx);
    // A saída dele não é texto: são os campos que criam o conjunto de anúncios.
    expect(p).toMatch(/"raioKm"/);
    expect(p).toMatch(/"idadeMin"/);
    expect(p).toMatch(/"cidade"/);
  });

  it("a segmentação proíbe anunciar no país inteiro por falta de cidade", () => {
    // Negócio local anunciado no Brasil inteiro é dinheiro queimado.
    const p = TODOS_OS_ESPECIALISTAS.find((x) => x.id === "traffic-segmentacao")!.prompt(ctx);
    expect(p).toMatch(/PRECISO CONFIRMAR: cidade/);
    expect(p).toMatch(/dinheiro queimado/);
  });

  it("a segmentação prefere NÃO segmentar a segmentar por palpite", () => {
    const p = TODOS_OS_ESPECIALISTAS.find((x) => x.id === "traffic-segmentacao")!.prompt(ctx);
    expect(p).toMatch(/lista vazia/);
  });

  it("existe o de OTIMIZAÇÃO — sem ele o mês 2 era o mês 1 com datas novas", () => {
    const e = TODOS_OS_ESPECIALISTAS.find((x) => x.id === "analytics-otimizacao")!;
    expect(e).toBeDefined();
  });

  it("sem ciclo anterior, a otimização é PROIBIDA de inventar desempenho passado", () => {
    const p = TODOS_OS_ESPECIALISTAS.find((x) => x.id === "analytics-otimizacao")!
      .prompt({ ...ctx, resultadoDoCicloAnterior: undefined });
    expect(p).toMatch(/AINDA NÃO HÁ CICLO ANTERIOR/);
    expect(p).toMatch(/Não invente desempenho passado/);
  });

  it("com ciclo anterior, os números reais entram no prompt", () => {
    const p = TODOS_OS_ESPECIALISTAS.find((x) => x.id === "analytics-otimizacao")!
      .prompt({ ...ctx, resultadoDoCicloAnterior: "- Alcance: 4200\n- Posts publicados: 8" });
    expect(p).toContain("Alcance: 4200");
    expect(p).toMatch(/use SOMENTE estes/);
  });

  it("mudança sem número que a sustente não entra — palpite não é otimização", () => {
    const p = TODOS_OS_ESPECIALISTAS.find((x) => x.id === "analytics-otimizacao")!.prompt(ctx);
    expect(p).toMatch(/Palpite não entra/);
    expect(p).toMatch(/Escalar o que não funciona/);
  });
});

// O pedido literal do CEO (04/08/2026): ler a rede social do cliente antes de
// produzir. O bloco entra pelo ctxBlock — ou seja, em TODO especialista.
describe("o feed real do cliente no contexto de todos", () => {
  it("com a síntese, o bloco aparece no prompt de todo especialista", () => {
    const comFeed = { ...ctx, feedRealDoCliente: "FEED REAL DO CLIENTE (Instagram, 24 posts lidos em 2026-08-04):\n- Tom das legendas: próximo" };
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(e.prompt(comFeed), `${e.id} ignora o feed real`).toContain("FEED REAL DO CLIENTE");
    }
  });

  it("a degradação declarada também vai — 'feed não lido' É instrução", () => {
    const semFeed = { ...ctx, feedRealDoCliente: "FEED REAL DO CLIENTE (Instagram): feed não lido: sem conexão. PROIBIDO descrever o estilo do perfil." };
    const p = TODOS_OS_ESPECIALISTAS[0]!.prompt(semFeed);
    expect(p).toContain("feed não lido");
    expect(p).toMatch(/PROIBIDO/);
  });

  it("Ctx sem o campo (fluxos e testes antigos) continua válido", () => {
    const p = TODOS_OS_ESPECIALISTAS[0]!.prompt(ctx);
    expect(p).not.toContain("FEED REAL DO CLIENTE");
  });
});
