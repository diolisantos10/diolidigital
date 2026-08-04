import { describe, it, expect, beforeEach, vi } from "vitest";

// A leitura minuciosa do cliente (pedido do CEO, 04/08/2026): o feed real do
// Instagram vira síntese ANTES da produção. O que estes testes protegem:
//   1. a síntese entra no contexto, curta e ancorada no dado;
//   2. sem conexão → degradação DECLARADA e nenhuma invenção;
//   3. o TTL segura o ritmo — síntese fresca não fala com a Graph de novo;
//   4. o caminho das artes lê SÓ o persistido, nunca a Graph.

const db = vi.hoisted(() => ({
  brainArtifact: { findFirst: vi.fn(), create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const lerFeedDoCliente = vi.hoisted(() => vi.fn());
const lerMetricasDosPosts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/integrations/meta/leitura", () => ({ lerFeedDoCliente, lerMetricasDosPosts }));

import {
  sinteseDoFeedDoCliente, estiloVisualPersistido,
  TTL_DA_SINTESE_MS, MAX_CARACTERES_DA_SINTESE, DEPARTAMENTO_DA_LEITURA,
} from "@/lib/agency/execution/leitura-do-cliente";

function post(sobre: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1", caption: "Pão quentinho saindo do forno #padaria #paodequeijo",
    media_type: "IMAGE", media_product_type: "FEED", media_url: null, thumbnail_url: null,
    permalink: null, timestamp: "2026-07-01T10:00:00+0000",
    like_count: 10, comments_count: 2, children: [],
    ...sobre,
  };
}

const FEED = {
  ok: true as const,
  posts: [
    post(),
    post({ id: "m2", media_type: "CAROUSEL_ALBUM", timestamp: "2026-07-10T10:00:00+0000", like_count: 50, comments_count: 8, caption: "3 sinais de que seu pão é artesanal #padaria" }),
    post({ id: "m3", media_product_type: "REELS", media_type: "VIDEO", timestamp: "2026-07-20T10:00:00+0000", like_count: 30, comments_count: 3, caption: "Bastidor da madrugada #padaria" }),
  ],
};

const QUALITATIVA = {
  ok: true,
  data: {
    temas: ["produto artesanal", "bastidor da produção"],
    tom: "próximo e cotidiano, fala direto com o freguês",
    estiloVisual: "fotos quentes de produto em close, luz de forno, bastidor real",
    ausencias: ["promoção com preço", "depoimento de cliente"],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.brainArtifact.findFirst.mockResolvedValue(null);
  db.brainArtifact.create.mockResolvedValue({});
  lerFeedDoCliente.mockResolvedValue(FEED);
  lerMetricasDosPosts.mockResolvedValue({ ok: true, posts: [{ mediaId: "m2", tipo: "FEED", metricas: { total_interactions: 70 }, erro: null }] });
  generate.mockResolvedValue(QUALITATIVA);
});

describe("a síntese do feed real — o que os especialistas veem", () => {
  it("lê o feed, sintetiza e o bloco carrega número medido + análise das legendas", async () => {
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.lida).toBe(true);
    expect(s.texto).toContain("FEED REAL DO CLIENTE");
    expect(s.texto).toMatch(/carrossel/);
    expect(s.texto).toContain("produto artesanal");
    expect(s.texto).toContain("Não aparece no feed");
    expect(s.texto).toMatch(/CONVERSAR com este feed/);
  });

  it("é síntese, não despejo: cabe no teto de caracteres", async () => {
    generate.mockResolvedValue({ ok: true, data: { ...QUALITATIVA.data, estiloVisual: "x".repeat(3000) } });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.texto.length).toBeLessThanOrEqual(MAX_CARACTERES_DA_SINTESE);
  });

  it("o formato que mais engaja sai de NÚMERO, com a métrica real quando ela veio", async () => {
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    // m2 (carrossel) tem total_interactions=70 medido — ganha dos outros.
    expect(s.texto).toMatch(/O que mais engaja: carrossel/);
  });

  it("persiste a síntese como BrainArtifact do departamento de leitura", async () => {
    await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    const arg = db.brainArtifact.create.mock.calls[0]![0].data;
    expect(arg.department).toBe(DEPARTAMENTO_DA_LEITURA);
    expect(arg.clientRequestId).toBe("cr1");
    const canvas = JSON.parse(arg.canvasJson);
    expect(canvas.lida).toBe(true);
    expect(canvas.estiloVisual).toMatch(/luz de forno/);
  });

  it("a IA qualitativa só enxerga as legendas REAIS — nada além do feed entra no prompt", async () => {
    await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toContain("Pão quentinho saindo do forno");
    expect(generate.mock.calls[0]![0].system).toMatch(/não identificável/i);
  });
});

describe("vazio é vazio — a regra de ouro do kit", () => {
  it("sem conexão → 'feed não lido: <motivo>' e a PROIBIÇÃO de inferir estilo", async () => {
    lerFeedDoCliente.mockResolvedValue({ ok: false, error: "o cliente ainda não conectou o Instagram", semConexao: true });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.lida).toBe(false);
    expect(s.texto).toContain("feed não lido: o cliente ainda não conectou o Instagram");
    expect(s.texto).toMatch(/PROIBIDO/);
    expect(s.estiloVisual).toBe("");
    // Degradação NÃO é persistida: na próxima execução tenta ler de novo.
    expect(db.brainArtifact.create).not.toHaveBeenCalled();
    // E nenhuma IA é chamada para "adivinhar" um feed que ninguém viu.
    expect(generate).not.toHaveBeenCalled();
  });

  it("conta conectada e sem posts → diz isso com clareza, sem inventar estilo", async () => {
    lerFeedDoCliente.mockResolvedValue({ ok: true, posts: [] });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.lida).toBe(true);
    expect(s.texto).toMatch(/NÃO tem nenhum post publicado/);
    expect(s.estiloVisual).toBe("");
    expect(generate).not.toHaveBeenCalled();
  });

  it("IA qualitativa fora do ar → a síntese sai SÓ com os números, declarando o buraco", async () => {
    generate.mockResolvedValue({ ok: false, error: "timeout" });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.lida).toBe(true);
    expect(s.texto).toMatch(/Formatos publicados/);
    expect(s.texto).toMatch(/Análise qualitativa indisponível/);
    expect(s.estiloVisual).toBe("");
  });

  it("estilo 'não identificável pelas legendas' NÃO vira estilo de arte", async () => {
    generate.mockResolvedValue({ ok: true, data: { ...QUALITATIVA.data, estiloVisual: "não identificável pelas legendas" } });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.estiloVisual).toBe("");
  });

  it("métricas indisponíveis não derrubam a leitura — likes públicos sustentam", async () => {
    lerMetricasDosPosts.mockResolvedValue({ ok: false, error: "ritmo limitado" });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.lida).toBe(true);
    expect(s.texto).toMatch(/O que mais engaja: carrossel/); // 50+8 público
  });
});

describe("o TTL segura o ritmo com a Meta", () => {
  const persistida = (idadeMs: number) => ({
    createdAt: new Date(Date.now() - idadeMs),
    canvasJson: JSON.stringify({ lida: true, texto: "FEED REAL DO CLIENTE (persistido)", estiloVisual: "close de produto com luz quente", geradoEm: "x" }),
  });

  it("síntese fresca no banco → devolve a persistida SEM falar com a Graph", async () => {
    db.brainArtifact.findFirst.mockResolvedValue(persistida(60_000));
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.texto).toBe("FEED REAL DO CLIENTE (persistido)");
    expect(lerFeedDoCliente).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("síntese vencida → relê o feed e persiste de novo", async () => {
    db.brainArtifact.findFirst.mockResolvedValue(persistida(TTL_DA_SINTESE_MS + 1));
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(lerFeedDoCliente).toHaveBeenCalled();
    expect(s.texto).toContain("posts lidos");
    expect(db.brainArtifact.create).toHaveBeenCalled();
  });

  it("o caminho das ARTES lê só o persistido — a Graph nunca é chamada", async () => {
    db.brainArtifact.findFirst.mockResolvedValue(persistida(60_000));
    const estilo = await estiloVisualPersistido("cr1");
    expect(estilo).toBe("close de produto com luz quente");
    expect(lerFeedDoCliente).not.toHaveBeenCalled();
    expect(lerMetricasDosPosts).not.toHaveBeenCalled();
  });

  it("artes com síntese vencida → vazio, e vazio é vazio (não regenera)", async () => {
    db.brainArtifact.findFirst.mockResolvedValue(persistida(TTL_DA_SINTESE_MS + 1));
    expect(await estiloVisualPersistido("cr1")).toBe("");
    expect(lerFeedDoCliente).not.toHaveBeenCalled();
  });

  it("post sem clientRequestId → vazio sem tocar o banco", async () => {
    expect(await estiloVisualPersistido(null)).toBe("");
    expect(db.brainArtifact.findFirst).not.toHaveBeenCalled();
  });
});

describe("a leitura nunca derruba a produção", () => {
  it("erro inesperado no meio → degradação declarada, não exceção", async () => {
    lerFeedDoCliente.mockRejectedValue(new Error("boom"));
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.lida).toBe(false);
    expect(s.texto).toContain("feed não lido");
  });

  it("banco de persistência falhou → a síntese ainda é devolvida", async () => {
    db.brainArtifact.create.mockRejectedValue(new Error("db off"));
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.lida).toBe(true);
    expect(s.texto).toContain("FEED REAL DO CLIENTE");
  });
});
