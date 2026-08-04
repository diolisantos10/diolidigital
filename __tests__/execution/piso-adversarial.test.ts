import { describe, it, expect, beforeEach, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// A RE-AUDITORIA ADVERSARIAL DO PISO DE ANCORAGEM (04/08/2026).
//
// A primeira correção do piso trabalhava por TERMO e deixava o MODELO escolher
// a segmentação: cortava em `[,;.·•\n]`, mas o prompt pede "1 a 2 frases". A
// auditora rodou o fluxo REAL com duas legendas de padaria e obteve — persistido
// e a caminho do gerador de imagem:
//
//   "Fotos de produto saindo do forno com paleta pastel tipografia serifada e
//    bancada de mármore italiano"
//
// Só "forno" tinha lastro. O teste "CORTA PELO MEIO" passava porque O TESTE
// escrevia a vírgula; o adversário não escreve.
//
// Estes testes são o contrário do anterior: quem escolhe a segmentação é o
// ADVERSÁRIO. Frase corrida, sem pontuação nenhuma.
// ─────────────────────────────────────────────────────────────────────────────

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
  sinteseDoFeedDoCliente,
  corpusDoFeed, apenasAncorado, comLastro, coberturaDeLastro, lemasDoToken,
  COBERTURA_MINIMA_DE_LASTRO,
} from "@/lib/agency/execution/leitura-do-cliente";

/** As legendas EXATAS que a auditora usou. */
const LEGENDAS_DA_AUDITORA = [
  "Pão quentinho saindo do forno todo dia as 6h",
  "Bastidor da madrugada na padaria",
];

function post(id: string, caption: string) {
  return {
    id, caption,
    media_type: "IMAGE", media_product_type: "FEED", media_url: null, thumbnail_url: null,
    permalink: null, timestamp: "2026-07-01T10:00:00+0000",
    like_count: 10, comments_count: 2, children: [],
  };
}

const FEED_DA_AUDITORA = {
  ok: true as const,
  posts: LEGENDAS_DA_AUDITORA.map((c, i) => post(`a${i}`, c)),
};

/** A saída REAL que o modelo devolveu na re-auditoria. Sem uma vírgula. */
const ESTILO_ADVERSARIAL =
  "Fotos de produto saindo do forno com paleta pastel tipografia serifada e bancada de mármore italiano";

beforeEach(() => {
  vi.clearAllMocks();
  db.brainArtifact.findFirst.mockResolvedValue(null);
  db.brainArtifact.create.mockResolvedValue({});
  lerFeedDoCliente.mockResolvedValue(FEED_DA_AUDITORA);
  lerMetricasDosPosts.mockResolvedValue({ ok: false, error: "sem métricas" });
  generate.mockResolvedValue({ ok: true, data: {
    temas: ["pão fresco", "bastidor da padaria"],
    tom: "próximo e cotidiano",
    estiloVisual: ESTILO_ADVERSARIAL,
    ausencias: ["depoimento de cliente"],
  } });
});

describe("quem escolhe a segmentação é o ADVERSÁRIO, não o teste", () => {
  it("frase corrida com UM token de álibi: a invenção NÃO chega ao gerador de imagem", async () => {
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");

    // Nada do que ninguém viu sobrevive — nem no estilo que vira prompt de arte…
    expect(s.estiloVisual).not.toMatch(/pastel|serifad|m[áa]rmore|italiano|tipografia|bancada/i);
    // …nem no bloco que entra no contexto de TODOS os especialistas…
    expect(s.texto).not.toMatch(/pastel|serifad|m[áa]rmore|italiano|tipografia|bancada/i);
    // …nem no que fica persistido 24h.
    const canvas = JSON.parse(db.brainArtifact.create.mock.calls[0]![0].data.canvasJson);
    expect(canvas.estiloVisual).not.toMatch(/pastel|serifad|m[áa]rmore|italiano/i);
  });

  it("o pedaço que sobrevive é SÓ o eco do que o cliente escreveu", async () => {
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    // "Fotos de produto saindo do forno" — 2 de 4 tokens de conteúdo com lastro
    // ("saindo", "forno"), exatamente o piso. É o único trecho que fica.
    expect(s.estiloVisual).toBe("Fotos de produto saindo do forno");
  });

  it("um único token de álibi numa frase inventada NÃO carrega mais a frase", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    // Só "forno" tem lastro em 6 tokens de conteúdo → 17%, muito abaixo do piso.
    const alibi = "estudio fotografico profissional iluminado ao lado do forno";
    expect(apenasAncorado(alibi, c)).toBe("");
    // E o mesmo vale para a frase da auditoria depois do primeiro corte.
    expect(apenasAncorado("paleta pastel tipografia serifada bancada de marmore italiano", c)).toBe("");
  });

  it("a metade que DEIXA PASSAR: frase corrida majoritariamente ancorada sobrevive", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    // padaria ✓, madrugada ✓, forno ✓, quentes ✓ (lema de "quentinho").
    const ancorada = "bastidor da padaria de madrugada no forno com paes quentes";
    expect(apenasAncorado(ancorada, c)).toBe("bastidor da padaria de madrugada no forno, paes quentes");
    // Uma frase corrida SEM pontuação nenhuma, toda ela eco do feed: passa.
    expect(apenasAncorado("padaria de madrugada com forno quentinho", c))
      .toBe("padaria de madrugada, forno quentinho");
  });

  it("o corte não é só a pontuação: conjunção e preposição de ligação também separam", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    expect(apenasAncorado("forno e bancada de marmore italiano", c)).toBe("forno");
    expect(apenasAncorado("padaria mas com estudio fotografico profissional", c)).toBe("padaria");
    expect(apenasAncorado("madrugada alem de cenografia editorial sofisticada", c)).toBe("madrugada");
  });

  it("a cobertura é a trava — e ela é medida, não opinada", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    expect(coberturaDeLastro("forno marmore italiano serifada", c)).toBeCloseTo(0.25);
    expect(coberturaDeLastro("bastidor da madrugada", c)).toBe(1);
    // Termo só de palavra vazia: null, "não há o que ancorar".
    expect(coberturaDeLastro("muito bem", c)).toBeNull();
    expect(COBERTURA_MINIMA_DE_LASTRO).toBe(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — A COLISÃO DE RAIZ DE 5 LETRAS. Plausível no piloto: uma padaria/
// lanchonete vende PASTÉIS e fala de ingredientes NATURAIS.
// ─────────────────────────────────────────────────────────────────────────────

describe("lastro por lema conservador — a raiz de 5 letras colidia", () => {
  const FEED_LANCHONETE = {
    ok: true as const,
    posts: [
      post("p1", "Pastéis fritos na hora, todo dia a partir das 11h"),
      post("p2", "Ingredientes naturais, sem conservantes"),
    ],
  };

  it("'pastéis' (a comida) NÃO ancora 'paleta pastel' (a cor)", () => {
    const c = corpusDoFeed(FEED_LANCHONETE.posts);
    expect(comLastro("pastel", c)).toBe(false);
    expect(apenasAncorado("paleta pastel e tons suaves", c)).toBe("");
  });

  it("'naturais' (o ingrediente) NÃO ancora 'luz natural difusa'", () => {
    const c = corpusDoFeed(FEED_LANCHONETE.posts);
    expect(comLastro("natural", c)).toBe(false);
    expect(apenasAncorado("luz natural difusa", c)).toBe("");
  });

  it("mas plural e diminutivo continuam ancorando — a tolerância não foi jogada fora", () => {
    const c = corpusDoFeed([post("q1", "Pão quentinho saindo do forno"), post("q2", "Ingredientes selecionados")]);
    expect(comLastro("quentes", c)).toBe(true);      // quentinho → quent ← quentes
    expect(comLastro("ingrediente", c)).toBe(true);  // ingredientes → ingrediente
    expect(comLastro("fornos", c)).toBe(true);       // forno → forno ← fornos
    expect(comLastro("marmore", c)).toBe(false);
  });

  it("o lema é conservador: nada de alternância vocálica, e nada abaixo de 5 letras", () => {
    expect(lemasDoToken("pao")).toEqual([]);           // curto demais: nada a comparar
    expect(lemasDoToken("quentinho")).toContain("quent");
    expect(lemasDoToken("quentes")).toContain("quent");
    // "pastéis" NUNCA vira "pastel" — é aí que a raiz de 5 colidia.
    expect(lemasDoToken("pasteis")).not.toContain("pastel");
    expect(lemasDoToken("naturais")).not.toContain("natural");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — `ausencias` afirmava o negativo sem checar contradição.
// ─────────────────────────────────────────────────────────────────────────────

describe("não se declara ausente o que está no próprio feed", () => {
  it("feed COM promoção → 'promoções' não entra em 'Não aparece no feed'", async () => {
    lerFeedDoCliente.mockResolvedValue({ ok: true, posts: [
      post("r1", "Reels novo no ar, passa lá pra ver"),
      post("r2", "Promoção: 20% off hoje na padaria"),
    ] });
    generate.mockResolvedValue({ ok: true, data: {
      temas: ["padaria"],
      tom: "animado",
      estiloVisual: "não identificável pelas legendas",
      ausencias: ["promoções", "depoimento de cliente"],
    } });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    // A afirmação negativa contraditória some — ela viraria "vamos começar a
    // mostrar promoções, que hoje você não faz" numa mensagem ao cliente.
    expect(s.texto).not.toMatch(/Não aparece no feed:.*promo/i);
    // A ausência que NÃO é contradita continua valendo: o piso não é uma
    // tesoura cega.
    expect(s.texto).toMatch(/Não aparece no feed: depoimento de cliente/);
  });

  it("todas as ausências contraditas → a linha inteira desaparece", async () => {
    lerFeedDoCliente.mockResolvedValue({ ok: true, posts: [
      post("r1", "Reels novo no ar com promoção de inverno"),
    ] });
    generate.mockResolvedValue({ ok: true, data: {
      temas: ["promoção"], tom: "animado",
      estiloVisual: "não identificável pelas legendas",
      ausencias: ["promoções", "reels"],
    } });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.texto).not.toMatch(/Não aparece no feed/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — o `tom` sem lastro era LICENCIADO pela própria guarda do bloco.
// ─────────────────────────────────────────────────────────────────────────────

describe("o bloco separa o OBSERVADO da LEITURA INTERPRETATIVA", () => {
  it("a linha de tom se declara interpretativa e a guarda não a licencia como fato", async () => {
    generate.mockResolvedValue({ ok: true, data: {
      temas: ["bastidor da padaria"],
      tom: "sofisticado, voltado a um público premium",
      estiloVisual: "bastidor da madrugada",
      ausencias: ["depoimento"],
    } });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.texto).toMatch(/Tom das legendas \(LEITURA INTERPRETATIVA, sem lastro verificado\): sofisticado/);
    // A guarda deixou de autorizar em bloco: ela diz o que é observado e o que
    // é hipótese, e proíbe repetir a hipótese ao cliente como fato.
    expect(s.texto).toMatch(/a linha de tom é LEITURA INTERPRETATIVA/);
    expect(s.texto).toMatch(/NUNCA a repita ao cliente como fato/);
    // E a última linha continua sendo a guarda.
    const linhas = s.texto.split("\n");
    expect(linhas[linhas.length - 1]).toMatch(/NÃO afirme nada sobre este perfil/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 — o descarte era mudo. Sem evidência, a escada não anda.
// ─────────────────────────────────────────────────────────────────────────────

describe("o piso deixa rastro do que descartou", () => {
  it("cada descarte vira log estruturado com campo, termo e cobertura", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    const linhas = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[piso-de-ancoragem]"));
    expect(linhas.length).toBeGreaterThan(0);
    const estilo = linhas.map((l) => JSON.parse(l.replace("[piso-de-ancoragem] ", "")))
      .find((e) => e.campo === "estiloVisual");
    expect(estilo).toBeTruthy();
    expect(estilo.clientId).toBe("c1");
    expect(JSON.stringify(estilo.descartados)).toMatch(/pastel/i);
    expect(estilo.descartados[0].cobertura).toBeLessThan(0.5);
    warn.mockRestore();
  });

  it("temas esvaziado pelo piso DECLARA a lacuna — não some em silêncio", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    generate.mockResolvedValue({ ok: true, data: {
      temas: ["consultoria financeira premium", "gestão de patrimônio"],
      tom: "formal",
      estiloVisual: "bastidor da madrugada",
      ausencias: ["depoimento"],
    } });
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.texto).not.toMatch(/consultoria|patrimônio/i);
    expect(s.texto).toMatch(/Temas recorrentes: NENHUM tema com lastro/);
    expect(s.texto).toMatch(/PROIBIDO afirmar sobre o que este perfil costuma publicar/);
    vi.restoreAllMocks();
  });
});
