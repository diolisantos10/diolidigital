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
  corpusDoFeed, apenasAncorado, comLastro, coberturaDeLastro, termoAncorado, lemasDoToken,
  COBERTURA_MINIMA_DE_LASTRO,
} from "@/lib/agency/execution/leitura-do-cliente";

/** As legendas EXATAS que a auditora usou. */
const LEGENDAS_DA_AUDITORA = [
  "Pão quentinho saindo do forno todo dia as 6h",
  "Bastidor da madrugada na padaria",
];

/**
 * O volume REAL do piloto: 24 legendas de padaria, só horário e cardápio.
 *
 * É o corpus que torna o enchimento BARATO — quanto mais o cliente escreveu,
 * mais palavra comum tem lastro, e mais fácil fica compor um termo meio
 * verdadeiro meio inventado. É por isso que o piso não pode ser uma fração.
 */
const LEGENDAS_DO_PILOTO = [
  "Pão quentinho saindo do forno todo dia as 6h",
  "Bastidor da madrugada na padaria",
  "Estamos abertos hoje das 8h às 18h",
  "Cardápio do dia atualizado no perfil",
  "Bolo de cenoura com cobertura saiu agora",
  "Café fresquinho passado na hora",
  "Salgados assados a partir das 11h",
  "Croissant folhado do jeito que você gosta",
  "Encomendas para o fim de semana já abertas",
  "Sonho de creme voltou ao balcão",
  "Pão de queijo quentinho a tarde toda",
  "Domingo abrimos das 7h às 13h",
  "Torta salgada nova no cardápio",
  "Fermentação natural de 24 horas",
  "Baguete crocante saindo agora",
  "Delivery pelo whatsapp da loja",
  "Combo café da manhã com dois pães",
  "Bolo de fubá acompanha o café",
  "Feriado abrimos em horario especial",
  "Sanduiche natural para o almoço",
  "Rosca doce da vovó no balcão",
  "Trabalhamos de segunda a sabado",
  "Panetone de fim de ano em pre venda",
  "Obrigado por mais um ano com a gente",
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

const FEED_DO_PILOTO = {
  ok: true as const,
  posts: LEGENDAS_DO_PILOTO.map((c, i) => post(`b${i}`, c)),
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

  // REESCRITO na TERCEIRA auditoria (04/08/2026). Antes este teste afirmava que
  // "Fotos de produto saindo do forno" sobrevivia — 2 de 4 tokens com lastro,
  // "exatamente o piso". Era o próprio bug escrito como expectativa: "fotos" e
  // "produto" não aparecem em legenda nenhuma, e saíam sob o rótulo OBSERVADO.
  // Sob a cobertura de 100%, o segmento inteiro cai e o campo esvazia.
  it("nem o pedaço com token de álibi sobrevive: metade inventada é invenção", async () => {
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    // "fotos" e "produto" não têm lastro — o segmento inteiro morre com eles.
    expect(s.estiloVisual).toBe("");
    expect(s.texto).not.toMatch(/fotos de produto/i);
    // E o vazio é DECLARADO, nunca silêncio: silêncio outro agente preenche.
    expect(s.texto).toMatch(/Estilo visual: NÃO foi possível observar/);
    expect(s.texto).not.toMatch(/- Estilo visual observado/);
  });

  // A CALIBRAGEM DA TERCEIRA AUDITORIA. Sob a cobertura de 0,5, bastava um token
  // verdadeiro por token inventado — e a auditora acertou o enchimento na
  // PRIMEIRA tentativa. Cada um destes passava inteiro; nenhum passa mais.
  it("o enchimento calibrado em 0,5 — um token verdadeiro por inventado — morre", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    // "padaria" ✓ "forno" ✓ | "marmore" ✗ "italiano" ✗ → 0,50 exatos.
    expect(coberturaDeLastro("padaria de forno de marmore italiano", c)).toBe(0.5);
    expect(apenasAncorado("padaria de forno de marmore italiano", c)).toBe("");
    // O caso mínimo: 2 tokens, 1 ancorado. Também 0,50.
    expect(coberturaDeLastro("forno marmore", c)).toBe(0.5);
    expect(apenasAncorado("forno marmore", c)).toBe("");
  });

  it("DILUIÇÃO: muitos tokens verdadeiros carregando um falso não compram o falso", () => {
    const c = corpusDoFeed(FEED_DO_PILOTO.posts);
    const diluido = "padaria de forno de croissant de bolo de cafe de salgados de marmore italiano";
    // Com o corpus grande do piloto a cobertura sobe para 0,75 — o enchimento
    // fica MAIS barato quanto mais o cliente escreve. É por isso que o único
    // limiar honesto é 1.
    expect(coberturaDeLastro(diluido, c)).toBe(0.75);
    expect(termoAncorado(diluido, c)).toBe(false);
    expect(apenasAncorado(diluido, c)).toBe("");
  });

  it("o corpus grande do piloto não abre a porta: o mármore continua fora", async () => {
    lerFeedDoCliente.mockResolvedValue(FEED_DO_PILOTO);
    const s = await sinteseDoFeedDoCliente("ws1", "c1", "cr1");
    expect(s.estiloVisual).toBe("");
    expect(s.texto).not.toMatch(/pastel|serifad|m[áa]rmore|italiano|bancada/i);
    expect(s.texto).toMatch(/Estilo visual: NÃO foi possível observar/);
  });

  it("um único token de álibi numa frase inventada NÃO carrega mais a frase", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    // Só "forno" tem lastro em 6 tokens de conteúdo → 17%, muito abaixo do piso.
    const alibi = "estudio fotografico profissional iluminado ao lado do forno";
    expect(apenasAncorado(alibi, c)).toBe("");
    // E o mesmo vale para a frase da auditoria depois do primeiro corte.
    expect(apenasAncorado("paleta pastel tipografia serifada bancada de marmore italiano", c)).toBe("");
  });

  // A metade que DEIXA PASSAR — RECONSTRUÍDA para a regra de 100%, não removida.
  // Um piso que só barra é indistinguível de um campo desligado: sem esta
  // metade, ninguém sabe se o detector detecta ou se apenas carimba "vazio".
  it("a metade que DEIXA PASSAR: termo cujos tokens TODOS ecoam o feed sobrevive", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    // Corpus: "forno" e "bastidor" estão lá — o termo composto pelos dois passa.
    expect(apenasAncorado("bastidor do forno", c)).toBe("bastidor do forno");
    // Frase corrida, SEM pontuação nenhuma, inteira feita de eco: passa inteira.
    const ancorada = "bastidor da padaria de madrugada no forno";
    expect(coberturaDeLastro(ancorada, c)).toBe(1);
    expect(apenasAncorado(ancorada, c)).toBe(ancorada);
    // E a segmentação por conjunção não é um picador: os dois lados sobrevivem
    // quando os dois lados têm lastro.
    expect(apenasAncorado("padaria de madrugada com forno quentinho", c))
      .toBe("padaria de madrugada, forno quentinho");
  });

  it("plural e diminutivo continuam ancorando — a tolerância NÃO caiu junto com o piso", () => {
    const c = corpusDoFeed(FEED_DA_AUDITORA.posts);
    // "quentinho" (legenda) ↔ "quentes" (termo): mesmo lema "quent".
    expect(comLastro("quentes", c)).toBe(true);
    expect(comLastro("fornos", c)).toBe(true);
    // Logo um termo inteiro de plurais/diminutivos sobrevive a 100%.
    expect(coberturaDeLastro("fornos quentes", c)).toBe(1);
    expect(apenasAncorado("fornos quentes", c)).toBe("fornos quentes");
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
    // O LIMIAR. A regra mede um trecho e EMITE o trecho inteiro; com qualquer
    // fração < 1, essa fração de texto sai como "observado" sem nunca ter sido
    // escrita pelo cliente. Baixar isto reabre o furo das três auditorias.
    expect(COBERTURA_MINIMA_DE_LASTRO).toBe(1);
    // E o limiar é aplicado, não decorativo: 0,99 de cobertura não passa.
    expect(termoAncorado("bastidor da madrugada", c)).toBe(true);
    expect(termoAncorado("bastidor da madrugada italiana", c)).toBe(false);
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
    // Nada sobrou: os TRÊS segmentos da frase adversarial foram descartados.
    expect(estilo.mantidos).toBe(0);
    expect(estilo.descartados).toHaveLength(3);
    // O rastro registra a cobertura REAL de cada corte — e o primeiro é
    // justamente o de 0,50, o enchimento que a auditora calibrou. Sem este
    // número no log, ninguém consegue distinguir, na operação, um detector
    // calibrado de um que descarta tudo.
    expect(estilo.descartados[0].termo).toBe("Fotos de produto saindo do forno");
    expect(estilo.descartados[0].cobertura).toBe(0.5);
    expect(estilo.coberturaMinima).toBe(1);
    // O motivo tem de descrever a regra que roda HOJE, não a anterior: log que
    // mente sobre o próprio critério é pior que log ausente.
    expect(estilo.motivo).toMatch(/algum token de conteúdo do termo NÃO tem lastro/);
    expect(estilo.motivo).not.toMatch(/metade/i);
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
