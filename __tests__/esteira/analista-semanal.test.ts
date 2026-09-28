// analista-semanal.test.ts — O ANALISTA DE SOCIAL SEMANAL (F2-F1, 27/09/2026).
//
// O que esta suíte trava, e por quê:
//   • `classificarDesempenho` é DETERMINÍSTICO: compara engajamento contra a
//     MEDIANA do histórico da marca; amostra insuficiente, post sem métrica e
//     empate exato viram "não dá para concluir" — NUNCA um veredito inventado.
//   • Toda classificação carrega o `socialPostId` como evidência.
//   • `engajamentoDoPost`: vazio é NÃO MEDIDO, nunca 0 fingido.
//   • `ajustesPropostos` só ajusta pilar que o pacote já declara, sempre com
//     os ids que sustentam a afirmação.
//   • `pacoteComAjustesAplicados` é pura e nunca muta o pacote original.
//   • `gerarRelatorioSemanal`: número sem fonte regenera 1x; falhando de novo,
//     cai no relatório determinístico (nunca sem relatório nenhum).
//   • `conteudoDeDnaComAjustes` nunca muda o que já existe — só ACRESCENTA.
//   • `rodarAnaliseSemanal` é IDEMPOTENTE por (clientId, semanaDe) e NUNCA
//     promove o DNA proposto a vigente.
//   • `aplicarAjustes`/`ajustesDaUltimaAnaliseAplicada`: só o que foi
//     "aplicada" muda o pacote que o gerador usa — proposta sozinha não muda
//     nada.
//   • `ehSegunda08hBrasilia`: segunda 11h UTC (08h Brasília), hora inteira.
//
// A cobertura de "classes de fusão/reset" (o modelo novo não pode virar
// resquício órfão numa fusão de cliente nem sobreviver ao modo inauguração)
// já é travada dinamicamente por `__tests__/agency/fundir-cliente.test.ts` e
// `__tests__/agency/inauguracao.test.ts` — os dois leem o SCHEMA e o
// `cliente-vinculos.ts`/`admin/reset` de verdade, então o registro de
// `analiseSemanal`/`AnaliseSemanal` feito nesta ficha é conferido por eles
// sem precisar duplicar o teste aqui.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mesma régua de `dna-da-marca.test.ts`: mock ANOTADO, nunca `vi.fn()` cru —
// mock sem assinatura infere `never`/tupla vazia e é o erro que já barrou PR
// desta casa (CLAUDE.md, "Antes de dar push").
const db = vi.hoisted(() => ({
  client: {
    findUnique: vi.fn(async (..._args: any[]): Promise<any> => null),
    findMany: vi.fn(async (..._args: any[]): Promise<any[]> => []),
  },
  socialPost: {
    findMany: vi.fn(async (..._args: any[]): Promise<any[]> => []),
  },
  analiseSemanal: {
    findUnique: vi.fn(async (..._args: any[]): Promise<any> => null),
    findFirst: vi.fn(async (..._args: any[]): Promise<any> => null),
    findMany: vi.fn(async (..._args: any[]): Promise<any[]> => []),
    create: vi.fn(async (..._args: any[]): Promise<any> => ({ id: "analise_1" })),
    update: vi.fn(async (..._args: any[]): Promise<any> => ({})),
  },
  dnaDaMarca: {
    findFirst: vi.fn(async (..._args: any[]): Promise<any> => null),
    create: vi.fn(async (..._args: any[]): Promise<any> => ({ id: "dna_1" })),
    updateMany: vi.fn(async (..._args: any[]): Promise<any> => ({})),
    update: vi.fn(async (..._args: any[]): Promise<any> => ({})),
  },
  activityEvent: {
    create: vi.fn(async (..._args: any[]): Promise<any> => ({})),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

// Nunca chamado de verdade nos testes de orquestração (`gerar`/`lerMetricas`
// são sempre injetados) — mockado mesmo assim para nenhum caminho esquecido
// tentar atravessar a rede de verdade.
const generateReal = vi.hoisted(() => vi.fn(async (..._args: any[]): Promise<any> => ({ ok: false, error: "não deveria ser chamado" })));
vi.mock("@/lib/ai/generate", () => ({ generate: generateReal }));

const lerMetricasReal = vi.hoisted(() => vi.fn(async (..._args: any[]): Promise<any> => ({ ok: false, error: "não deveria ser chamado" })));
vi.mock("@/lib/integrations/meta/leitura", () => ({ lerMetricasDosPosts: lerMetricasReal }));

import {
  classificarDesempenho,
  engajamentoDoPost,
  ajustesPropostos,
  pacoteComAjustesAplicados,
  gerarRelatorioSemanal,
  conteudoDeDnaComAjustes,
  rodarAnaliseSemanal,
  aplicarAjustes,
  descartarAnalise,
  ajustesDaUltimaAnaliseAplicada,
  pacoteComUltimaAnaliseAplicada,
  ehSegunda08hBrasilia,
  semanaAnterior,
  semanaDaData,
  MINIMO_DE_AMOSTRAS_PARA_CLASSIFICAR,
  type MetricaDoPostParaAnalise,
  type AjusteProposto,
  type ResultadoDaClassificacao,
} from "@/lib/agency/esteira/analista-semanal";
import type { PacoteDaMarca } from "@/lib/agency/esteira/pacote-da-marca";
import type { DnaDaMarcaConteudo } from "@/lib/agency/esteira/dna-da-marca";
import type { ResultadoDeLeitura, MetricasDoPost } from "@/lib/integrations/meta/leitura";

const WORKSPACE_ID = "ws_1";
const CLIENT_ID = "client_1";

beforeEach(() => {
  vi.clearAllMocks();
  db.client.findUnique.mockReset();
  db.client.findMany.mockReset();
  db.socialPost.findMany.mockReset();
  db.analiseSemanal.findUnique.mockReset();
  db.analiseSemanal.findFirst.mockReset();
  db.analiseSemanal.findMany.mockReset();
  db.analiseSemanal.create.mockReset().mockResolvedValue({ id: "analise_1" });
  db.analiseSemanal.update.mockReset();
  db.dnaDaMarca.findFirst.mockReset();
  db.dnaDaMarca.create.mockReset().mockResolvedValue({ id: "dna_1" });
  db.dnaDaMarca.updateMany.mockReset();
  db.dnaDaMarca.update.mockReset();
  db.activityEvent.create.mockReset();
  generateReal.mockReset();
  lerMetricasReal.mockReset();
});

// ─── util: uma métrica de post, com defaults "medido" ───────────────────────
function metrica(over: Partial<MetricaDoPostParaAnalise> = {}): MetricaDoPostParaAnalise {
  return {
    socialPostId: "post_1",
    externalPostId: "ext_1",
    formato: "feed",
    pilar: "institucional",
    publicadoEm: "2026-09-08T12:00:00.000Z",
    alcance: 100,
    salvos: 10,
    compartilhamentos: 5,
    comentarios: 5,
    cliques: null,
    medido: true,
    ...over,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// 1. engajamentoDoPost — vazio = não medido, nunca 0
// ═════════════════════════════════════════════════════════════════════════

describe("engajamentoDoPost", () => {
  it("soma só o que foi medido", () => {
    expect(engajamentoDoPost(metrica({ alcance: 100, salvos: 10, compartilhamentos: 5, comentarios: 5, cliques: null }))).toBe(120);
  });

  it("tudo nulo devolve null — NUNCA 0 fingido de ausência", () => {
    expect(
      engajamentoDoPost({ alcance: null, salvos: null, compartilhamentos: null, comentarios: null, cliques: null }),
    ).toBeNull();
  });

  it("parcialmente medido soma só o que existe (o resto não conta nem a favor nem contra)", () => {
    expect(engajamentoDoPost({ alcance: 50, salvos: null, compartilhamentos: null, comentarios: null, cliques: null })).toBe(50);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 2. classificarDesempenho — DETERMINÍSTICO
// ═════════════════════════════════════════════════════════════════════════

describe("classificarDesempenho", () => {
  it("amostra insuficiente no histórico: TUDO vira 'não dá para concluir'", () => {
    const semana = [metrica({ socialPostId: "s1" }), metrica({ socialPostId: "s2" })];
    const historico = [metrica({ socialPostId: "h1", alcance: 10, salvos: 0, compartilhamentos: 0, comentarios: 0 })]; // só 1 amostra < mínimo (3)
    const r = classificarDesempenho(semana, historico);
    expect(r.funcionou).toEqual([]);
    expect(r.naoFuncionou).toEqual([]);
    expect(r.naoDaParaConcluir.map((x) => x.socialPostId).sort()).toEqual(["s1", "s2"]);
    expect(r.naoDaParaConcluir[0].motivo).toContain("não dá para concluir");
    expect(r.naoDaParaConcluir[0].motivo).toContain(String(MINIMO_DE_AMOSTRAS_PARA_CLASSIFICAR));
  });

  it("acima e abaixo da mediana — cada post SEMPRE carrega o socialPostId como evidência", () => {
    // Histórico: engajamentos 10, 20, 30 → mediana 20.
    const historico = [
      metrica({ socialPostId: "h1", alcance: 10, salvos: 0, compartilhamentos: 0, comentarios: 0 }),
      metrica({ socialPostId: "h2", alcance: 20, salvos: 0, compartilhamentos: 0, comentarios: 0 }),
      metrica({ socialPostId: "h3", alcance: 30, salvos: 0, compartilhamentos: 0, comentarios: 0 }),
    ];
    const semana = [
      metrica({ socialPostId: "acima", alcance: 90, salvos: 0, compartilhamentos: 0, comentarios: 0, pilar: "dicas" }),
      metrica({ socialPostId: "abaixo", alcance: 1, salvos: 0, compartilhamentos: 0, comentarios: 0, pilar: "bastidores" }),
    ];
    const r = classificarDesempenho(semana, [...historico, ...semana]);

    expect(r.funcionou).toHaveLength(1);
    expect(r.funcionou[0].socialPostId).toBe("acima");
    expect(r.funcionou[0].evidencia.mediaDaMarca).toBeGreaterThan(0);
    expect(r.funcionou[0].evidencia.valor).toBe(90);

    expect(r.naoFuncionou).toHaveLength(1);
    expect(r.naoFuncionou[0].socialPostId).toBe("abaixo");
  });

  it("post sem NENHUMA métrica medida: 'não dá para concluir', nunca entra em funcionou/naoFuncionou", () => {
    const historico = [
      metrica({ socialPostId: "h1", alcance: 10 }),
      metrica({ socialPostId: "h2", alcance: 20 }),
      metrica({ socialPostId: "h3", alcance: 30 }),
    ];
    const semana = [metrica({ socialPostId: "sem-dado", alcance: null, salvos: null, compartilhamentos: null, comentarios: null, cliques: null, medido: false })];
    const r = classificarDesempenho(semana, [...historico, ...semana]);
    expect(r.funcionou).toEqual([]);
    expect(r.naoFuncionou).toEqual([]);
    expect(r.naoDaParaConcluir).toEqual([
      { socialPostId: "sem-dado", motivo: "não dá para concluir — nenhuma métrica foi medida para este post" },
    ]);
  });

  it("empate EXATO com a mediana: 'não dá para concluir', nunca um lado inventado", () => {
    const historico = [
      metrica({ socialPostId: "h1", alcance: 10, salvos: 0, compartilhamentos: 0, comentarios: 0 }),
      metrica({ socialPostId: "h2", alcance: 20, salvos: 0, compartilhamentos: 0, comentarios: 0 }),
      metrica({ socialPostId: "h3", alcance: 30, salvos: 0, compartilhamentos: 0, comentarios: 0 }),
    ];
    const semana = [metrica({ socialPostId: "empate", alcance: 20, salvos: 0, compartilhamentos: 0, comentarios: 0 })];
    const r = classificarDesempenho(semana, [...historico, ...semana]);
    expect(r.funcionou).toEqual([]);
    expect(r.naoFuncionou).toEqual([]);
    expect(r.naoDaParaConcluir[0].socialPostId).toBe("empate");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 3. ajustesPropostos — sempre com evidência, só pilar que o pacote declara
// ═════════════════════════════════════════════════════════════════════════

function pacoteBase(): PacoteDaMarca {
  return {
    postsPorDia: 1,
    postsPorSemana: 5,
    formatos: ["feed_imagem"],
    dias: [1, 2, 3, 4, 5],
    horarios: ["10:00"],
    pilares: [{ nome: "dicas", peso: 1 }, { nome: "bastidores", peso: 1 }],
  };
}

describe("ajustesPropostos", () => {
  it("propõe AUMENTAR o peso de um pilar que ficou acima da mediana, com os ids como evidência", () => {
    const classificacao: ResultadoDaClassificacao = {
      funcionou: [{ socialPostId: "p1", pilar: "dicas", formato: "feed", porque: "x", evidencia: { metrica: "engajamento", valor: 90, mediaDaMarca: 20 } }],
      naoFuncionou: [],
      naoDaParaConcluir: [],
    };
    const ajustes = ajustesPropostos(classificacao, pacoteBase(), null);
    expect(ajustes).toEqual([
      {
        tipo: "peso_pilar",
        pilar: "dicas",
        direcao: "aumentar",
        porque: expect.stringContaining("dicas"),
        evidencia: { posts: ["p1"], metrica: "engajamento" },
      },
    ]);
  });

  it("NUNCA propõe ajuste para pilar que o pacote não declara", () => {
    const classificacao: ResultadoDaClassificacao = {
      funcionou: [{ socialPostId: "p1", pilar: "pilar-inexistente", formato: "feed", porque: "x", evidencia: { metrica: "engajamento", valor: 90, mediaDaMarca: 20 } }],
      naoFuncionou: [],
      naoDaParaConcluir: [],
    };
    expect(ajustesPropostos(classificacao, pacoteBase(), null)).toEqual([]);
  });

  it("sem pacote (null), não propõe ajuste de pilar — mas ainda propõe horário do DNA", () => {
    const dna = {
      melhoresHorarios: [{ diaDaSemana: 2, hora: "18:00", engajamentoMedio: 50, amostras: 5 }],
    } as unknown as DnaDaMarcaConteudo;
    const vazio: ResultadoDaClassificacao = { funcionou: [], naoFuncionou: [], naoDaParaConcluir: [] };
    const ajustes = ajustesPropostos(vazio, null, dna);
    expect(ajustes).toEqual([
      expect.objectContaining({ tipo: "horario", diaDaSemana: 2, hora: "18:00" }),
    ]);
  });

  it("NUNCA sugere um horário que o pacote já usa", () => {
    const dna = {
      melhoresHorarios: [{ diaDaSemana: 2, hora: "10:00", engajamentoMedio: 50, amostras: 5 }],
    } as unknown as DnaDaMarcaConteudo;
    const vazio: ResultadoDaClassificacao = { funcionou: [], naoFuncionou: [], naoDaParaConcluir: [] };
    expect(ajustesPropostos(vazio, pacoteBase(), dna)).toEqual([]); // "10:00" já está no pacote
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 4. pacoteComAjustesAplicados — PURA, nunca muta o pacote original
// ═════════════════════════════════════════════════════════════════════════

describe("pacoteComAjustesAplicados", () => {
  it("aumenta o peso do pilar em +20% e acrescenta o horário sugerido", () => {
    const original = pacoteBase();
    const ajustes: AjusteProposto[] = [
      { tipo: "peso_pilar", pilar: "dicas", direcao: "aumentar", porque: "x", evidencia: { posts: ["p1"], metrica: "engajamento" } },
      { tipo: "horario", diaDaSemana: 2, hora: "18:00", porque: "y", evidencia: { amostras: 5, engajamentoMedio: 50 } },
    ];
    const efetivo = pacoteComAjustesAplicados(original, ajustes);

    expect(efetivo.pilares.find((p) => p.nome === "dicas")?.peso).toBeCloseTo(1.2);
    expect(efetivo.pilares.find((p) => p.nome === "bastidores")?.peso).toBe(1); // não mexido
    expect(efetivo.horarios).toEqual(["10:00", "18:00"]);

    // NUNCA muta o original.
    expect(original.pilares.find((p) => p.nome === "dicas")?.peso).toBe(1);
    expect(original.horarios).toEqual(["10:00"]);
  });

  it("diminui o peso sem nunca zerar (piso de 0.1)", () => {
    const original: PacoteDaMarca = { ...pacoteBase(), pilares: [{ nome: "dicas", peso: 0.1 }] };
    const ajustes: AjusteProposto[] = [
      { tipo: "peso_pilar", pilar: "dicas", direcao: "diminuir", porque: "x", evidencia: { posts: ["p1"], metrica: "engajamento" } },
    ];
    expect(pacoteComAjustesAplicados(original, ajustes).pilares[0].peso).toBe(0.1);
  });

  it("ajuste de pilar que não existe mais no pacote é ignorado, silenciosamente", () => {
    const original = pacoteBase();
    const ajustes: AjusteProposto[] = [
      { tipo: "peso_pilar", pilar: "pilar-que-sumiu", direcao: "aumentar", porque: "x", evidencia: { posts: [], metrica: "engajamento" } },
    ];
    expect(pacoteComAjustesAplicados(original, ajustes)).toEqual(original);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 5. gerarRelatorioSemanal — número sem fonte regenera 1x, depois cai no piso
// ═════════════════════════════════════════════════════════════════════════

function classificacaoComUmPost(): ResultadoDaClassificacao {
  return {
    funcionou: [{ socialPostId: "p1", pilar: "dicas", formato: "feed", porque: "engajamento acima", evidencia: { metrica: "engajamento", valor: 90, mediaDaMarca: 60 } }],
    naoFuncionou: [],
    naoDaParaConcluir: [],
  };
}

describe("gerarRelatorioSemanal", () => {
  const semana = { de: new Date("2026-09-07T03:00:00.000Z"), ate: new Date("2026-09-14T02:59:59.999Z") };

  it("aceita o texto da IA quando só cita números que existem nas fontes (percentual pré-calculado)", async () => {
    const gerar = vi.fn(async () => ({ ok: true as const, data: { relatorio: "O post p1 ficou +50% acima da mediana. Ótima semana." }, model: "m", provider: "openai" as const }));
    const texto = await gerarRelatorioSemanal({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, nomeDoNegocio: "Padoca", semana,
      classificacao: classificacaoComUmPost(), ajustes: [], gerar,
    });
    expect(texto).toContain("+50%");
    expect(gerar).toHaveBeenCalledTimes(1);
  });

  it("número SEM fonte: regenera 1x — se a segunda vier limpa, usa a segunda", async () => {
    const gerar = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, data: { relatorio: "Alcance subiu 999% essa semana!" }, model: "m", provider: "openai" as const })
      .mockResolvedValueOnce({ ok: true as const, data: { relatorio: "O post p1 ficou +50% acima da mediana." }, model: "m", provider: "openai" as const });
    const texto = await gerarRelatorioSemanal({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, nomeDoNegocio: "Padoca", semana,
      classificacao: classificacaoComUmPost(), ajustes: [], gerar,
    });
    expect(gerar).toHaveBeenCalledTimes(2);
    expect(texto).toContain("+50%");
  });

  it("número sem fonte NAS DUAS tentativas: cai no relatório DETERMINÍSTICO, nunca sem relatório", async () => {
    const gerar = vi.fn(async () => ({ ok: true as const, data: { relatorio: "Alcance subiu 999% essa semana!" }, model: "m", provider: "openai" as const }));
    const texto = await gerarRelatorioSemanal({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, nomeDoNegocio: "Padoca", semana,
      classificacao: classificacaoComUmPost(), ajustes: [], gerar,
    });
    expect(gerar).toHaveBeenCalledTimes(2);
    expect(texto).not.toContain("999%");
    expect(texto).toContain("Padoca");
    expect(texto).toContain("post p1");
  });

  it("IA fora do ar: cai no relatório determinístico direto, sem lançar", async () => {
    const gerar = vi.fn(async () => ({ ok: false as const, error: "sem chave" }));
    const texto = await gerarRelatorioSemanal({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, nomeDoNegocio: "Padoca", semana,
      classificacao: classificacaoComUmPost(), ajustes: [], gerar,
    });
    expect(texto).toContain("Padoca");
  });

  // ── Achado `qualidade` (Q7, F3): número CRU (sem %, x, vezes, R$, mil ou
  // unidade da lista fechada de `prova-com-fonte.ts`) não era checado —
  // "340 comentários" inventado passava direto. Duas metades da régua nova.
  it("número CRU inventado (sem unidade reconhecida por prova-com-fonte): regenera, e se insistir cai no piso", async () => {
    const gerar = vi.fn(async () => ({
      ok: true as const,
      data: { relatorio: "O post p1 teve 340 comentários essa semana." },
      model: "m",
      provider: "openai" as const,
    }));
    const texto = await gerarRelatorioSemanal({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, nomeDoNegocio: "Padoca", semana,
      classificacao: classificacaoComUmPost(), ajustes: [],
      metricas: [metrica({ socialPostId: "p1", comentarios: 5 })], // 5 medido, NUNCA 340
      gerar,
    });
    expect(gerar).toHaveBeenCalledTimes(2); // tentou de novo, insistiu, caiu no piso
    expect(texto).not.toContain("340");
    expect(texto).toContain("Padoca");
    expect(texto).toContain("post p1");
  });

  it("número cru que É um valor bruto medido (metricasJson): passa sem regenerar", async () => {
    const gerar = vi.fn(async () => ({
      ok: true as const,
      data: { relatorio: "O post p1 teve 340 comentários essa semana." },
      model: "m",
      provider: "openai" as const,
    }));
    const texto = await gerarRelatorioSemanal({
      workspaceId: WORKSPACE_ID, clientId: CLIENT_ID, nomeDoNegocio: "Padoca", semana,
      classificacao: classificacaoComUmPost(), ajustes: [],
      metricas: [metrica({ socialPostId: "p1", comentarios: 340 })], // 340 é real
      gerar,
    });
    expect(gerar).toHaveBeenCalledTimes(1); // passou de primeira — não precisou regenerar
    expect(texto).toContain("340 comentários");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 6. conteudoDeDnaComAjustes — nunca muda o que já existe, só acrescenta
// ═════════════════════════════════════════════════════════════════════════

function dnaValido(): DnaDaMarcaConteudo {
  return {
    paleta: ["azul"],
    tipografia: "sem serifa",
    estilosDeLayout: [],
    tomDeVoz: "direto",
    pilares: [{ nome: "dicas", posts: [] }],
    melhoresHorarios: [{ diaDaSemana: 1, hora: "10:00", engajamentoMedio: 40, amostras: 4 }],
    top10: [],
    observacoes: "nota antiga",
  };
}

describe("conteudoDeDnaComAjustes", () => {
  it("acrescenta horário novo e observação, sem tocar no que já existia", () => {
    const atual = dnaValido();
    const ajustes: AjusteProposto[] = [
      { tipo: "horario", diaDaSemana: 3, hora: "18:00", porque: "bom engajamento", evidencia: { amostras: 5, engajamentoMedio: 80 } },
      { tipo: "peso_pilar", pilar: "dicas", direcao: "aumentar", porque: "posts [p1] acima da mediana em salvos", evidencia: { posts: ["p1"], metrica: "engajamento" } },
    ];
    const semana = { de: new Date("2026-09-07T03:00:00.000Z"), ate: new Date("2026-09-14T02:59:59.999Z") };
    const novo = conteudoDeDnaComAjustes(atual, ajustes, semana);

    expect(novo.melhoresHorarios).toEqual([
      atual.melhoresHorarios[0],
      { diaDaSemana: 3, hora: "18:00", engajamentoMedio: 80, amostras: 5 },
    ]);
    expect(novo.observacoes).toContain("nota antiga");
    expect(novo.observacoes).toContain("dicas");
    expect(novo.paleta).toEqual(atual.paleta);

    // NUNCA muta o objeto original.
    expect(atual.melhoresHorarios).toHaveLength(1);
    expect(atual.observacoes).toBe("nota antiga");
  });

  it("não duplica um horário que o DNA já tem", () => {
    const atual = dnaValido();
    const ajustes: AjusteProposto[] = [
      { tipo: "horario", diaDaSemana: 1, hora: "10:00", porque: "x", evidencia: { amostras: 4, engajamentoMedio: 40 } },
    ];
    const semana = { de: new Date("2026-09-07T03:00:00.000Z"), ate: new Date("2026-09-14T02:59:59.999Z") };
    expect(conteudoDeDnaComAjustes(atual, ajustes, semana).melhoresHorarios).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 7. semanaAnterior / semanaDaData / ehSegunda08hBrasilia — PURAS, fuso
// ═════════════════════════════════════════════════════════════════════════

describe("ehSegunda08hBrasilia", () => {
  it("segunda 11:00 UTC (08h Brasília) é true", () => {
    expect(ehSegunda08hBrasilia(new Date("2026-09-28T11:00:00.000Z"))).toBe(true); // 2026-09-28 é segunda
  });
  it("segunda 11:59 UTC ainda é true — vale a hora inteira", () => {
    expect(ehSegunda08hBrasilia(new Date("2026-09-28T11:59:59.000Z"))).toBe(true);
  });
  it("segunda 10:59 UTC é false — ainda não bateu a hora", () => {
    expect(ehSegunda08hBrasilia(new Date("2026-09-28T10:59:00.000Z"))).toBe(false);
  });
  it("segunda 12:00 UTC é false — já passou a hora", () => {
    expect(ehSegunda08hBrasilia(new Date("2026-09-28T12:00:00.000Z"))).toBe(false);
  });
  it("terça 11:00 UTC é false — dia errado", () => {
    expect(ehSegunda08hBrasilia(new Date("2026-09-29T11:00:00.000Z"))).toBe(false);
  });
});

describe("semanaAnterior", () => {
  it("segunda de manhã devolve a semana que acabou de terminar (segunda a domingo, em Brasília)", () => {
    // 2026-09-28 é segunda. A semana anterior: 2026-09-21 (seg) 00:00 BRT a
    // 2026-09-27 (dom) 23:59:59.999 BRT — que em UTC é 2026-09-28 02:59:59.999
    // (mesma régua de `semanaSeguinte`/`semana-editorial.test.ts`: domingo
    // 23:59:59.999 BRT cai no dia UTC seguinte).
    const r = semanaAnterior(new Date("2026-09-28T11:00:00.000Z"));
    expect(r.de.toISOString()).toBe("2026-09-21T03:00:00.000Z");
    expect(r.ate.toISOString()).toBe("2026-09-28T02:59:59.999Z");
  });
});

describe("semanaDaData", () => {
  it("constrói a janela a partir da segunda declarada", () => {
    const r = semanaDaData("2026-09-21");
    expect(r).not.toBeNull();
    expect(r!.de.toISOString()).toBe("2026-09-21T03:00:00.000Z");
    expect(r!.ate.toISOString()).toBe("2026-09-28T02:59:59.999Z");
  });
  it("formato inválido devolve null — nunca adivinha uma data", () => {
    expect(semanaDaData("21/09/2026")).toBeNull();
    expect(semanaDaData("")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 8. rodarAnaliseSemanal — orquestração: idempotência, DNA proposto, custo
// ═════════════════════════════════════════════════════════════════════════

const AGORA = new Date("2026-09-28T11:00:00.000Z"); // segunda 08h Brasília

function socialPostRow(over: Partial<{ id: string; externalPostId: string | null; format: string; pillar: string | null; publishedAt: Date }> = {}) {
  return {
    id: "sp_1",
    externalPostId: "ext_1",
    format: "feed",
    pillar: "dicas",
    publishedAt: new Date("2026-09-22T12:00:00.000Z"),
    ...over,
  };
}

describe("rodarAnaliseSemanal", () => {
  it("IDEMPOTENTE: já existe análise desta semana → pula, nunca cria de novo", async () => {
    db.client.findUnique.mockResolvedValue({ id: CLIENT_ID, workspaceId: WORKSPACE_ID, name: "Padoca", pacoteJson: null });
    db.analiseSemanal.findUnique.mockResolvedValue({ id: "ja-existe" });

    const r = await rodarAnaliseSemanal({ clientId: CLIENT_ID, agora: AGORA, lerMetricas: lerMetricasReal, gerar: generateReal });

    expect(r.analisadas).toEqual([]);
    expect(r.puladas).toEqual([{ clientId: CLIENT_ID, motivo: "já existe análise desta semana" }]);
    expect(db.analiseSemanal.create).not.toHaveBeenCalled();
  });

  it("sem post publicado na semana: pula, sem tocar em métrica nenhuma", async () => {
    db.client.findUnique.mockResolvedValue({ id: CLIENT_ID, workspaceId: WORKSPACE_ID, name: "Padoca", pacoteJson: null });
    db.analiseSemanal.findUnique.mockResolvedValue(null);
    db.socialPost.findMany.mockResolvedValue([]);

    const r = await rodarAnaliseSemanal({ clientId: CLIENT_ID, agora: AGORA, lerMetricas: lerMetricasReal, gerar: generateReal });

    expect(r.puladas).toEqual([{ clientId: CLIENT_ID, motivo: "nenhum post publicado nesta semana" }]);
    expect(lerMetricasReal).not.toHaveBeenCalled();
  });

  it("analisa, grava metricasJson com 'vazio = não medido' e PROPÕE DNA sem tocar no vigente", async () => {
    db.client.findUnique.mockResolvedValue({
      id: CLIENT_ID, workspaceId: WORKSPACE_ID, name: "Padoca",
      pacoteJson: JSON.stringify(pacoteBase()),
    });
    db.analiseSemanal.findUnique.mockResolvedValue(null);
    db.socialPost.findMany.mockResolvedValue([
      socialPostRow({ id: "sp_1", externalPostId: "ext_1" }),
      socialPostRow({ id: "sp_2", externalPostId: "ext_2" }),
      socialPostRow({ id: "sp_3", externalPostId: null }), // sem externalPostId — nunca medido
    ]);
    // Histórico anterior com amostra suficiente (2 posts medidos, mais o post
    // medido desta semana = 3 — o mínimo exato) para a mediana ser confiável e
    // a classificação ter algo a dizer sobre o pilar "dicas".
    db.analiseSemanal.findMany.mockResolvedValue([
      { metricasJson: JSON.stringify([metrica({ socialPostId: "old_1", alcance: 30, salvos: 0, compartilhamentos: 0, comentarios: 0, cliques: null })]) },
      { metricasJson: JSON.stringify([metrica({ socialPostId: "old_2", alcance: 60, salvos: 0, compartilhamentos: 0, comentarios: 0, cliques: null })]) },
    ]);
    // DNA vigente existe (versao 3) — `dnaVigente`/`editarDna` de verdade leem daqui.
    db.dnaDaMarca.findFirst.mockResolvedValue({
      versao: 3,
      status: "vigente",
      conteudoJson: JSON.stringify(dnaValido()),
    });

    // Mock ANOTADO com a assinatura real de `lerMetricasDosPosts` — mock sem
    // assinatura infere `never`/tupla vazia (CLAUDE.md, "Antes de dar push").
    const lerMetricas = vi.fn(
      async (
        _workspaceId: string,
        _clientId: string,
        _mediaIds: string[],
      ): Promise<ResultadoDeLeitura<{ posts: MetricasDoPost[] }>> => ({
        ok: true,
        posts: [
          { mediaId: "ext_1", tipo: "FEED", metricas: { reach: 500, saved: 50, shares: 10, comments: 5 }, erro: null },
          { mediaId: "ext_2", tipo: "FEED", metricas: {}, erro: "sem permissão" }, // não medido — nunca 0
        ],
      }),
    );
    const gerar = vi.fn(async () => ({ ok: true as const, data: { relatorio: "resumo qualquer" }, model: "m", provider: "openai" as const }));

    const r = await rodarAnaliseSemanal({ clientId: CLIENT_ID, agora: AGORA, lerMetricas, gerar });

    expect(r.analisadas).toHaveLength(1);
    expect(r.analisadas[0].postsAnalisados).toBe(3);
    // sp_1 (565 de engajamento) fica acima da mediana (60 — de [30, 60, 565])
    // do histórico + desta semana, no pilar "dicas", que o pacote declara —
    // isso é o que produz o ajuste de peso de pilar abaixo.
    expect(r.analisadas[0].ajustesPropostos).toBe(1);

    const gravado = db.analiseSemanal.create.mock.calls[0][0].data;
    const metricas = JSON.parse(gravado.metricasJson) as MetricaDoPostParaAnalise[];
    const medido = metricas.find((m) => m.socialPostId === "sp_1")!;
    const naoMedidoPorErro = metricas.find((m) => m.socialPostId === "sp_2")!;
    const naoMedidoSemExterno = metricas.find((m) => m.socialPostId === "sp_3")!;

    expect(medido.medido).toBe(true);
    expect(medido.alcance).toBe(500);
    expect(naoMedidoPorErro.medido).toBe(false);
    expect(naoMedidoPorErro.alcance).toBeNull(); // NUNCA 0
    expect(naoMedidoSemExterno.medido).toBe(false);
    expect(naoMedidoSemExterno.alcance).toBeNull();

    // DNA: propõe (create), NUNCA promove a vigente (updateMany é só de tornarVigente).
    expect(db.dnaDaMarca.create).toHaveBeenCalledTimes(1);
    expect(db.dnaDaMarca.create.mock.calls[0][0].data.status).toBe("proposto");
    expect(db.dnaDaMarca.updateMany).not.toHaveBeenCalled();

    // A análise é gravada como "proposta" — nunca "aplicada" sozinha.
    expect(gravado.status).toBe("proposta");

    // Custo com clientId (item explícito da ficha).
    expect(gerar).toHaveBeenCalledWith(expect.objectContaining({ clientId: CLIENT_ID, workspaceId: WORKSPACE_ID }));
  });

  it("varre todos os clientes do workspace quando clientId não é informado, respeitando 'limite'", async () => {
    db.client.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);
    db.client.findUnique.mockImplementation(async ({ where }: any) => ({
      id: where.id, workspaceId: WORKSPACE_ID, name: where.id, pacoteJson: null,
    }));
    db.analiseSemanal.findUnique.mockResolvedValue(null);
    db.socialPost.findMany.mockResolvedValue([]); // todos pulam por falta de post — mas o teto é por ANALISADA

    const r = await rodarAnaliseSemanal({ workspaceId: WORKSPACE_ID, agora: AGORA, limite: 1, lerMetricas: lerMetricasReal, gerar: generateReal });
    // Nenhum tinha post publicado, então nenhum é "analisada" mesmo com o teto —
    // o teto nunca impede de tentar o próximo candidato quando o anterior só pulou.
    expect(r.puladas).toHaveLength(3);
    expect(r.analisadas).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 9. aplicarAjustes / descartarAnalise / o hook do gerador
// ═════════════════════════════════════════════════════════════════════════

describe("aplicarAjustes / descartarAnalise", () => {
  it("aplicar marca 'aplicada' e registra QUEM decidiu", async () => {
    db.analiseSemanal.findUnique.mockResolvedValue({ status: "proposta", workspaceId: WORKSPACE_ID, clientId: CLIENT_ID });
    const r = await aplicarAjustes({ analiseId: "a1", porQuem: "master@dioli.studio" });
    expect(r.ok).toBe(true);
    expect(db.analiseSemanal.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "aplicada" } });
    expect(db.activityEvent.create).toHaveBeenCalled();
  });

  it("aplicar uma análise DESCARTADA recusa", async () => {
    db.analiseSemanal.findUnique.mockResolvedValue({ status: "descartada", workspaceId: WORKSPACE_ID, clientId: CLIENT_ID });
    const r = await aplicarAjustes({ analiseId: "a1", porQuem: "master@dioli.studio" });
    expect(r.ok).toBe(false);
    expect(db.analiseSemanal.update).not.toHaveBeenCalled();
  });

  it("descartar uma análise JÁ APLICADA recusa — não desfaz o que já mudou o gerador", async () => {
    db.analiseSemanal.findUnique.mockResolvedValue({ status: "aplicada", workspaceId: WORKSPACE_ID, clientId: CLIENT_ID });
    const r = await descartarAnalise({ analiseId: "a1", porQuem: "master@dioli.studio" });
    expect(r.ok).toBe(false);
    expect(db.analiseSemanal.update).not.toHaveBeenCalled();
  });

  it("análise inexistente: ok:false nos dois casos", async () => {
    db.analiseSemanal.findUnique.mockResolvedValue(null);
    expect((await aplicarAjustes({ analiseId: "x", porQuem: "q" })).ok).toBe(false);
    expect((await descartarAnalise({ analiseId: "x", porQuem: "q" })).ok).toBe(false);
  });
});

describe("ajustesDaUltimaAnaliseAplicada / pacoteComUltimaAnaliseAplicada — só o APLICADO muda o gerador", () => {
  it("sem nenhuma análise 'aplicada': devolve null, e o pacote sai IGUAL ao original", async () => {
    db.analiseSemanal.findFirst.mockResolvedValue(null); // a query já filtra status:"aplicada"
    expect(await ajustesDaUltimaAnaliseAplicada(CLIENT_ID)).toBeNull();

    const original = pacoteBase();
    const efetivo = await pacoteComUltimaAnaliseAplicada(CLIENT_ID, original);
    expect(efetivo).toEqual(original);
  });

  it("com uma análise 'aplicada': o pacote sai AJUSTADO — proposta sozinha (não aplicada) não teria efeito", async () => {
    const ajustes: AjusteProposto[] = [
      { tipo: "peso_pilar", pilar: "dicas", direcao: "aumentar", porque: "x", evidencia: { posts: ["p1"], metrica: "engajamento" } },
    ];
    db.analiseSemanal.findFirst.mockResolvedValue({ ajustesJson: JSON.stringify(ajustes) });

    const efetivo = await pacoteComUltimaAnaliseAplicada(CLIENT_ID, pacoteBase());
    expect(efetivo.pilares.find((p) => p.nome === "dicas")?.peso).toBeCloseTo(1.2);

    // A própria query só busca `status: "aplicada"` — confirmando o contrato
    // de que proposta sozinha nunca é lida por este caminho.
    expect(db.analiseSemanal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: CLIENT_ID, status: "aplicada" }) }),
    );
  });
});
