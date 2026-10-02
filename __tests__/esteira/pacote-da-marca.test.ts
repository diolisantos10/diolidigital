// pacote-da-marca.test.ts — O QUE SE PRODUZ PARA A MARCA (CEO, 27/09/2026).
//
// O que estes testes travam:
//   • um pacote bem formado passa e devolve o objeto tipado;
//   • pacote nulo/ausente recusa com "preciso do pacote da marca" — nunca um
//     default inventado;
//   • pacote incoerente (mais posts por semana do que dias×postsPorDia
//     permite) recusa, mesmo com todos os campos presentes.

import { describe, it, expect } from "vitest";
import { PacoteDaMarcaSchema, lerPacote } from "@/lib/agency/esteira/pacote-da-marca";

// ─── W12a — os campos novos: cardápio, fontes de prova, carrossel, séries,
// colaboradores, e o "repost" → "terceiro_autorizado" da mistura de stories.
// Cópias LITERAIS dos três pacotes de `scripts/marcas-proprias.mts` — não
// importadas de lá de propósito: aquele arquivo executa `main()` (banco,
// `process.exit`) no import, o que quebraria a suíte.

const PACOTE_REAL_FOOCCI = {
  formatos: ["carrossel", "stories"],
  dias: [0, 1, 2, 3, 4, 5, 6],
  postsPorDia: 1,
  postsPorSemana: 7,
  horarios: ["12:00"],
  pilares: [
    { nome: "dor", peso: 1 },
    { nome: "transformação", peso: 1 },
    { nome: "prova", peso: 1 },
  ],
  carrossel: {
    porDia: 1,
    cardsMin: 3,
    cardsMax: 6,
    sequencia: ["dor", "transformacao", "prova", "cta"],
    cta: "Link na bio ou chame no WhatsApp",
    horarioPadrao: "12:00",
    usarHorarioDoDna: true,
  },
  stories: {
    porDiaMin: 2,
    porDiaMax: 2,
    aPartirDe: "12:30",
    intervaloMinimoMin: 30,
    combosMinPorDia: 0,
    mistura: ["reciclado"],
    derivados: ["capa_do_post_do_dia", "reel_do_acervo"],
  },
  fontesDeProva: [],
};

const PACOTE_REAL_DIOLI_DIGITAL = {
  formatos: ["carrossel", "stories"],
  dias: [1, 3, 5],
  postsPorDia: 1,
  postsPorSemana: 3,
  horarios: ["09:00", "12:00"],
  pilares: [
    { nome: "radar", peso: 1 },
    { nome: "servico", peso: 1 },
  ],
  series: [
    {
      id: "radar",
      nome: "Radar Dioli Tech",
      dias: [1],
      formato: "carrossel",
      cardsMin: 8,
      exigeFonte: true,
      layout: "radar",
      horario: "09:00",
    },
    {
      id: "servico",
      nome: "Serviço",
      dias: [3, 5],
      formato: "carrossel",
      cardsMin: 3,
      cardsMax: 6,
      sequencia: ["dor", "importancia_do_servico", "cta"],
      layout: "servico",
      horario: "12:00",
    },
  ],
  stories: {
    porDiaMin: 1,
    porDiaMax: 1,
    aPartirDe: "12:30",
    intervaloMinimoMin: 30,
    combosMinPorDia: 0,
    mistura: ["reciclado"],
    derivados: ["capa_do_post_do_dia"],
  },
  colaboradores: { ativo: false, contas: [] },
};

const PACOTE_REAL_SUSHI_CAZZA = {
  formatos: ["stories"],
  dias: [0, 1, 2, 3, 4, 5, 6],
  postsPorDia: 0,
  postsPorSemana: 0,
  horarios: [],
  pilares: [
    { nome: "combo", peso: 1 },
    { nome: "produto", peso: 1 },
  ],
  stories: {
    porDiaMin: 6,
    porDiaMax: 8,
    aPartirDe: "18:00",
    intervaloMinimoMin: 30,
    combosMinPorDia: 1,
    mistura: ["combo", "reciclado", "terceiro_autorizado"],
  },
  cardapio: { combos: [] },
};

const PACOTE_VALIDO = {
  postsPorDia: 1,
  postsPorSemana: 5,
  formatos: ["feed_imagem", "reels"],
  dias: [1, 2, 3, 4, 5],
  horarios: ["09:00", "18:30"],
  pilares: [{ nome: "bastidor", peso: 1 }, { nome: "produto", peso: 2 }],
};

describe("lerPacote — o válido passa", () => {
  it("devolve o pacote tipado quando o JSON é válido", () => {
    const r = lerPacote(JSON.stringify(PACOTE_VALIDO));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.postsPorSemana).toBe(5);
      expect(r.pacote.formatos).toContain("reels");
    }
  });
});

describe("lerPacote — nulo recusa com a frase que a esteira reconhece", () => {
  it("null vira 'preciso do pacote da marca'", () => {
    const r = lerPacote(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("string vazia também recusa", () => {
    const r = lerPacote("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("JSON quebrado recusa (nunca lança)", () => {
    const r = lerPacote("{ isto não é json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });
});

describe("lerPacote — incoerente recusa", () => {
  it("postsPorSemana maior que postsPorDia × dias declarados recusa", () => {
    const incoerente = { ...PACOTE_VALIDO, postsPorDia: 1, dias: [1], postsPorSemana: 5 };
    const r = lerPacote(JSON.stringify(incoerente));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("formato fora da lista fechada recusa", () => {
    const invalido = { ...PACOTE_VALIDO, formatos: ["reel_de_verdade"] };
    const r = lerPacote(JSON.stringify(invalido));
    expect(r.ok).toBe(false);
  });

  it("horário fora do formato HH:MM recusa", () => {
    const invalido = { ...PACOTE_VALIDO, horarios: ["9h"] };
    const r = lerPacote(JSON.stringify(invalido));
    expect(r.ok).toBe(false);
  });

  it("dia da semana fora de 0..6 recusa", () => {
    const invalido = { ...PACOTE_VALIDO, dias: [7] };
    const r = lerPacote(JSON.stringify(invalido));
    expect(r.ok).toBe(false);
  });

  it("lista vazia (formatos, dias, horarios ou pilares) recusa", () => {
    expect(lerPacote(JSON.stringify({ ...PACOTE_VALIDO, pilares: [] })).ok).toBe(false);
    expect(lerPacote(JSON.stringify({ ...PACOTE_VALIDO, formatos: [] })).ok).toBe(false);
  });
});

describe("PacoteDaMarcaSchema — usada direto pela rota PUT", () => {
  it("safeParse aceita o pacote válido", () => {
    expect(PacoteDaMarcaSchema.safeParse(PACOTE_VALIDO).success).toBe(true);
  });

  it("safeParse recusa corpo que não é objeto", () => {
    expect(PacoteDaMarcaSchema.safeParse("nao é objeto").success).toBe(false);
    expect(PacoteDaMarcaSchema.safeParse(null).success).toBe(false);
  });
});

// ─── STORIES, E MARCA SÓ DE STORIES (CEO, 27/09/2026) ───────────────────────

const STORIES_VALIDO = {
  porDiaMin: 6,
  porDiaMax: 8,
  aPartirDe: "18:00",
  intervaloMinimoMin: 30,
  combosMinPorDia: 1,
  mistura: ["combo", "reciclado", "repost"] as const,
};

describe("pacote com stories — o bloco novo, aditivo", () => {
  it("pacote com feed + stories válido passa e devolve o bloco tipado", () => {
    const r = lerPacote(JSON.stringify({ ...PACOTE_VALIDO, formatos: ["feed_imagem", "stories"], stories: STORIES_VALIDO }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.stories?.porDiaMin).toBe(6);
      expect(r.pacote.stories?.mistura).toContain("reciclado");
    }
  });

  it("porDiaMax < porDiaMin recusa", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        formatos: ["feed_imagem", "stories"],
        stories: { ...STORIES_VALIDO, porDiaMin: 8, porDiaMax: 6 },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/^preciso do pacote da marca/);
  });

  it("pacote antigo (sem `stories`) continua válido do mesmo jeito", () => {
    const r = lerPacote(JSON.stringify(PACOTE_VALIDO));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pacote.stories).toBeUndefined();
  });
});

describe("marca SÓ DE STORIES — postsPorDia/postsPorSemana/horarios podem ser 0/vazios", () => {
  const PACOTE_SUSHI_CAZZA = {
    formatos: ["stories"] as const,
    dias: [0, 1, 2, 3, 4, 5, 6],
    postsPorDia: 0,
    postsPorSemana: 0,
    horarios: [] as string[],
    pilares: [{ nome: "combo", peso: 1 }, { nome: "produto", peso: 1 }],
    stories: STORIES_VALIDO,
  };

  it("só-stories com postsPorDia 0 e horarios vazios é válido", () => {
    const r = lerPacote(JSON.stringify(PACOTE_SUSHI_CAZZA));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.postsPorDia).toBe(0);
      expect(r.pacote.horarios).toEqual([]);
    }
  });

  it("stories ausente com formatos:['stories'] e postsPorDia 0 CONTINUA recusando (não é 'só de stories' de verdade sem o bloco)", () => {
    const { stories: _semStories, ...semBlocoDeStories } = PACOTE_SUSHI_CAZZA;
    const r = lerPacote(JSON.stringify(semBlocoDeStories));
    expect(r.ok).toBe(false);
  });

  it("marca com feed E postsPorDia 0 continua recusando — só formatos:['stories'] libera o zero", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_SUSHI_CAZZA, formatos: ["feed_imagem", "stories"] }),
    );
    expect(r.ok).toBe(false);
  });
});

// ─── W12a — CARDÁPIO, FONTES DE PROVA, CARROSSEL, SÉRIES, COLABORADORES ─────

describe("os campos novos do W12a são aditivos — pacote antigo continua válido", () => {
  it("pacote sem nenhum campo novo continua passando, e os campos vêm undefined", () => {
    const r = lerPacote(JSON.stringify(PACOTE_VALIDO));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.cardapio).toBeUndefined();
      expect(r.pacote.fontesDeProva).toBeUndefined();
      expect(r.pacote.carrossel).toBeUndefined();
      expect(r.pacote.series).toBeUndefined();
      expect(r.pacote.colaboradores).toBeUndefined();
    }
  });
});

describe("cardapio — combos com preço por extenso", () => {
  it("combo com nome e preço passa", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_VALIDO, cardapio: { combos: [{ nome: "Combo 1", preco: "R$ 39,90" }] } }),
    );
    expect(r.ok).toBe(true);
  });

  it("cardapio.combos: [] (CEO ainda não cadastrou) passa", () => {
    const r = lerPacote(JSON.stringify({ ...PACOTE_VALIDO, cardapio: { combos: [] } }));
    expect(r.ok).toBe(true);
  });

  it("combo sem preço é aceito (sai sem número — CEO, 01/10/2026)", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_VALIDO, cardapio: { combos: [{ nome: "Combo 1", preco: "" }] } }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("fontesDeProva — a biblioteca de afirmações com fonte", () => {
  it("lista de afirmações com fonte passa", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        fontesDeProva: [{ afirmacao: "30% de redução comprovada", fonte: "https://exemplo.com/estudo" }],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("fontesDeProva: [] passa", () => {
    const r = lerPacote(JSON.stringify({ ...PACOTE_VALIDO, fontesDeProva: [] }));
    expect(r.ok).toBe(true);
  });

  it("afirmação sem fonte recusa", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_VALIDO, fontesDeProva: [{ afirmacao: "30% de redução", fonte: "" }] }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("carrossel — a régua-padrão de cards da marca", () => {
  const CARROSSEL_VALIDO = {
    cardsMin: 3,
    cardsMax: 6,
    sequencia: ["dor", "transformacao", "prova", "cta"] as const,
    cta: "Chame no WhatsApp",
    horarioPadrao: "12:00",
    usarHorarioDoDna: true,
  };

  it("carrossel bem formado passa", () => {
    const r = lerPacote(JSON.stringify({ ...PACOTE_VALIDO, carrossel: CARROSSEL_VALIDO }));
    expect(r.ok).toBe(true);
  });

  it("cardsMax menor que cardsMin recusa", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_VALIDO, carrossel: { ...CARROSSEL_VALIDO, cardsMin: 6, cardsMax: 3 } }),
    );
    expect(r.ok).toBe(false);
  });

  it("sequência com valor fora da lista fechada recusa", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_VALIDO, carrossel: { ...CARROSSEL_VALIDO, sequencia: ["inventado"] } }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("series — séries editoriais nomeadas", () => {
  const SERIE_RADAR = {
    id: "radar",
    nome: "Radar Dioli Tech",
    dias: [1],
    formato: "carrossel" as const,
    cardsMin: 8,
    exigeFonte: true,
    layout: "radar",
    horario: "09:00",
  };

  it("série bem formada passa", () => {
    const r = lerPacote(JSON.stringify({ ...PACOTE_VALIDO, series: [SERIE_RADAR] }));
    expect(r.ok).toBe(true);
  });

  it("série com cardsMax menor que cardsMin recusa", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_VALIDO, series: [{ ...SERIE_RADAR, cardsMax: 3 }] }),
    );
    expect(r.ok).toBe(false);
  });

  it("série com formato fora de 'carrossel' recusa", () => {
    const r = lerPacote(
      JSON.stringify({ ...PACOTE_VALIDO, series: [{ ...SERIE_RADAR, formato: "reels" }] }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("colaboradores — máx. 3 contas, inativo por padrão até o parecer do meta", () => {
  it("colaboradores.ativo:false com contas vazias passa", () => {
    const r = lerPacote(JSON.stringify({ ...PACOTE_VALIDO, colaboradores: { ativo: false, contas: [] } }));
    expect(r.ok).toBe(true);
  });

  it("4 contas (acima do máximo) recusa", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        colaboradores: { ativo: false, contas: ["@a", "@b", "@c", "@d"] },
      }),
    );
    expect(r.ok).toBe(false);
  });
});

describe("stories.derivados e stories.mistura com 'terceiro_autorizado' (W12a)", () => {
  it("derivados com os dois tipos passa", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        formatos: ["feed_imagem", "stories"],
        stories: { ...STORIES_VALIDO, derivados: ["capa_do_post_do_dia", "reel_do_acervo"] },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pacote.stories?.derivados).toEqual(["capa_do_post_do_dia", "reel_do_acervo"]);
  });

  it("derivados com valor fora da lista fechada recusa", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        formatos: ["feed_imagem", "stories"],
        stories: { ...STORIES_VALIDO, derivados: ["inventado"] },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("mistura com 'terceiro_autorizado' (o nome novo) passa e é lido como está", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        formatos: ["feed_imagem", "stories"],
        stories: { ...STORIES_VALIDO, mistura: ["combo", "terceiro_autorizado"] },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pacote.stories?.mistura).toEqual(["combo", "terceiro_autorizado"]);
  });

  it("mistura legada com 'repost' continua sendo ACEITA, mas é LIDA como 'terceiro_autorizado'", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        formatos: ["feed_imagem", "stories"],
        stories: { ...STORIES_VALIDO, mistura: ["combo", "repost"] },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pacote.stories?.mistura).toEqual(["combo", "terceiro_autorizado"]);
      expect(r.pacote.stories?.mistura).not.toContain("repost");
    }
  });

  it("porDia FIXO (porDiaMin === porDiaMax) continua sendo aceito", () => {
    const r = lerPacote(
      JSON.stringify({
        ...PACOTE_VALIDO,
        formatos: ["feed_imagem", "stories"],
        stories: { ...STORIES_VALIDO, porDiaMin: 1, porDiaMax: 1 },
      }),
    );
    expect(r.ok).toBe(true);
  });
});

// ─── OS TRÊS PACOTES REAIS DAS MARCAS PRÓPRIAS (marcas-proprias.mts) ────────
//
// A ficha pede: "valide os três no teste". Cópias literais definidas no topo
// do arquivo — sincronizadas à mão com `scripts/marcas-proprias.mts` (não
// importadas: aquele script executa `main()` no import).

describe("os três pacotes de marcas-proprias.mts validam contra o schema", () => {
  it("PACOTE_REAL_FOOCCI é válido", () => {
    const r = PacoteDaMarcaSchema.safeParse(PACOTE_REAL_FOOCCI);
    expect(r.success).toBe(true);
  });

  it("PACOTE_REAL_DIOLI_DIGITAL é válido", () => {
    const r = PacoteDaMarcaSchema.safeParse(PACOTE_REAL_DIOLI_DIGITAL);
    expect(r.success).toBe(true);
  });

  it("PACOTE_REAL_SUSHI_CAZZA é válido, e a mistura sai lida como 'terceiro_autorizado'", () => {
    const r = PacoteDaMarcaSchema.safeParse(PACOTE_REAL_SUSHI_CAZZA);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stories?.mistura).toContain("terceiro_autorizado");
      expect(r.data.stories?.mistura).not.toContain("repost");
    }
  });
});
