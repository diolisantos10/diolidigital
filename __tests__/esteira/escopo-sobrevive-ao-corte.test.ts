// OS TRÊS ENXERTOS SOBRE O CONSERTO DE 16/08 — achados de `seguranca` e
// `qualidade` que a base do outro pm (171014e4) ainda não tinha.
//
// Este arquivo NÃO repete a cobertura de
// `__tests__/comercial/pacote-cortado-nao-leva-o-escopo.test.ts` (que continua
// a fonte da verdade para "pacote cortado não leva o escopo junto"). Aqui só
// os três enxertos:
//
//   1. TETO_DO_REPARO — `seguranca`, PODE COM AJUSTE: teto de tamanho fixo
//      DENTRO de `repararJsonTruncado`, que não depende do `max_tokens` do
//      chamador.
//   2. Valor BARE truncado (número, true/false/null) — `qualidade`: um dígito
//      cortado não tem marca de truncamento nenhuma e sobrevivia como um
//      número plausível-e-errado (`1` no lugar de `14`).
//   3. O desfecho do escopo no diário (`_escopo_salvo` / `_escopo_perdido`) —
//      `qualidade`: sem isso o diário dizia que houve corte, mas não se o
//      número do cliente sobreviveu.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  rateLimitBucket: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const chaveDeRotaPublica = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/chave-publica", () => ({ chaveDeRotaPublica }));

import { POST, repararJsonTruncado } from "@/app/api/sdr/chat/route";

type LinhaGravada = { clientId?: string; clientRequestId?: string; authorRole: string; authorName: string; body: string };
const gravadas = (): LinhaGravada[] =>
  (db.portalMessage.create.mock.calls as unknown as Array<[{ data: LinhaGravada }]>).map((c) => c[0].data);

function respostaCrua(text: string, stopReason?: string) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: "text", text }], stop_reason: stopReason }),
  };
}

function chamar(corpo: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/sdr/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
});

// ── ENXERTO 1 — TETO_DO_REPARO ───────────────────────────────────────────────

describe("TETO_DO_REPARO — parecer do `seguranca`", () => {
  it("entrada absurdamente grande é descartada pelo teto de tamanho, sem varrer nada", () => {
    const enorme = '{"scope":{"x":"' + "a".repeat(25_000);
    expect(repararJsonTruncado(enorme)).toBeNull();
  });

  it("entrada dentro do teto continua sendo reparada normalmente", () => {
    const dentroDoTeto = '{"scope":{"businessName":"Ana Doces"';
    const reparado = repararJsonTruncado(dentroDoTeto);
    expect(reparado).not.toBeNull();
    expect((reparado!.scope as Record<string, unknown>).businessName).toBe("Ana Doces");
  });

  it("o teto não depende do max_tokens do chamador — vale mesmo se a rota subir de novo", () => {
    // O teto mora na função (20_000), bem acima do max_tokens atual (3000)
    // mas fixo por si só: não é um múltiplo nem uma fração de max_tokens.
    const textoDe19999Chars = '{"scope":{"x":"' + "a".repeat(19_960);
    expect(textoDe19999Chars.length).toBeLessThan(20_000);
    // Não é bem formado (string nunca fecha em chave real), mas passa do teto
    // e chega a tentar o reparo — não é descartado ANTES de olhar o conteúdo.
    const resultado = repararJsonTruncado(textoDe19999Chars);
    expect(resultado).not.toBeNull();
  });
});

// ── ENXERTO 2 — valor BARE truncado ──────────────────────────────────────────

describe("repararJsonTruncado — valor bare truncado não sobrevive como número plausível-e-errado", () => {
  it("número cortado no MEIO (1 de 14, sem delimitador depois) descarta o campo inteiro", () => {
    // Corte exatamente como o incidente real: depois do PRIMEIRO dígito de 14.
    const cortado = '{"scope":{"social":{"postsPerWeek":1';
    const reparado = repararJsonTruncado(cortado);

    expect(reparado).not.toBeNull();
    const social = (reparado!.scope as Record<string, unknown>).social as Record<string, unknown>;
    // O campo some inteiro — nunca vira 1, nunca vira 14 adivinhado.
    expect(Object.hasOwn(social, "postsPerWeek")).toBe(false);
  });

  it("número COMPLETO, seguido de delimitador que o próprio modelo escreveu (}), sobrevive intacto", () => {
    // O "}" que fecha `social` já veio na resposta: prova que o 14 terminou
    // ali. Esta é a metade que NÃO pode virar baixa.
    const completo = '{"scope":{"social":{"postsPerWeek":14}';
    const reparado = repararJsonTruncado(completo);

    expect(reparado).not.toBeNull();
    const social = (reparado!.scope as Record<string, unknown>).social as Record<string, unknown>;
    expect(social.postsPerWeek).toBe(14);
  });

  it("true/false/null cortados no fim, sem delimitador depois, também descartam o campo", () => {
    const cortadoTrue = '{"scope":{"decisionMaker":tru';
    const cortadoFalse = '{"scope":{"branding":{"requested":fals';
    const cortadoNull = '{"scope":{"deadline":nul';

    const rTrue = repararJsonTruncado(cortadoTrue);
    expect(rTrue).not.toBeNull();
    expect(Object.hasOwn(rTrue!.scope as Record<string, unknown>, "decisionMaker")).toBe(false);

    const rFalse = repararJsonTruncado(cortadoFalse);
    expect(rFalse).not.toBeNull();
    const branding = (rFalse!.scope as Record<string, unknown>).branding as Record<string, unknown>;
    expect(Object.hasOwn(branding, "requested")).toBe(false);

    const rNull = repararJsonTruncado(cortadoNull);
    expect(rNull).not.toBeNull();
    expect(Object.hasOwn(rNull!.scope as Record<string, unknown>, "deadline")).toBe(false);
  });

  it("true/false/null COMPLETOS, seguidos de delimitador do próprio modelo, sobrevivem intactos", () => {
    const completoTrue = '{"scope":{"decisionMaker":true}';
    const completoFalse = '{"scope":{"branding":{"requested":false}}';
    const completoNull = '{"scope":{"deadline":null}';

    expect((repararJsonTruncado(completoTrue)!.scope as Record<string, unknown>).decisionMaker).toBe(true);
    const branding = (repararJsonTruncado(completoFalse)!.scope as Record<string, unknown>).branding as Record<
      string,
      unknown
    >;
    expect(branding.requested).toBe(false);
    expect((repararJsonTruncado(completoNull)!.scope as Record<string, unknown>).deadline).toBeNull();
  });

  it("via POST: o corte real do incidente (1 de 14) some do scope devolvido, não vira 1 chutado", async () => {
    const textoCortado = '{"scope":{"prospectName":"Ana","social":{"postsPerWeek":1';
    vi.stubGlobal("fetch", vi.fn(async () => respostaCrua(textoCortado, "max_tokens")));

    const res = await chamar({ messages: [], currentMessage: "2 posts por dia", sessionId: "s-bare-1" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.scope.prospectName).toBe("Ana");
    expect((corpo.scope.social as Record<string, unknown> | undefined)?.postsPerWeek).toBeUndefined();
  });
});

// ── ENXERTO 3 — o desfecho do escopo aparece no diário ───────────────────────

describe("o desfecho do escopo aparece separado no registro (motivoDaRecusa), nunca no `reason` devolvido", () => {
  // NOTA DE DESENHO: no formato desta casa `reply` vem ANTES de `scope` no
  // JSON. Por isso, sempre que `scope` sobrevive ao reparo, a fala já tinha
  // fechado antes do corte (`falaConfiavel = true`) — é o desenho do outro pm,
  // deliberado (ver comentário "O ESCOPO SOBREVIVE SEM A FALA" na rota). Para
  // isolar o desfecho do escopo SEM depender de simular uma fala truncada
  // depois de scope (o que o formato real não produz), os dois casos abaixo
  // usam `reply: ""` — pacote sintaticamente completo, mas com a fala vazia,
  // que é o outro jeito real do turno cair no mesmo `if` de recusa.
  it("scope recuperado com conteúdo mas reply vazia grava '..._escopo_salvo' — nos dois motivos de parse", async () => {
    const textoReplyVazia = JSON.stringify({
      reply: "",
      needsClarification: false,
      scope: { prospectName: "Ana Paula", social: { postsPerWeek: 14 } },
    });

    // Variante truncado (stop_reason max_tokens).
    vi.stubGlobal("fetch", vi.fn(async () => respostaCrua(textoReplyVazia, "max_tokens")));
    const resTruncado = await chamar({ messages: [], currentMessage: "2 posts por dia", sessionId: "s-salvo-truncado" });
    const corpoTruncado = await resTruncado.json();

    expect(corpoTruncado.ok).toBe(false);
    expect(corpoTruncado.reason).toBe("parse_error_truncado"); // `reason` NUNCA leva o sufixo
    expect(corpoTruncado.scope.social).toMatchObject({ postsPerWeek: 14 });
    const linhaTruncado = gravadas().find((l) => l.body.includes("parse_error"));
    expect(linhaTruncado?.body).toContain("parse_error_truncado_escopo_salvo");
    expect(linhaTruncado?.body).not.toContain("escopo_perdido");

    vi.clearAllMocks();
    chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
    db.portalMessage.create.mockResolvedValue({});
    db.portalMessage.findFirst.mockResolvedValue(null);
    db.clientRequestDb.findUnique.mockResolvedValue(null);

    // Mesmo pacote, variante formato (stop_reason que não é max_tokens).
    vi.stubGlobal("fetch", vi.fn(async () => respostaCrua(textoReplyVazia, "end_turn")));
    const resFormato = await chamar({ messages: [], currentMessage: "2 posts por dia", sessionId: "s-salvo-formato" });
    const corpoFormato = await resFormato.json();

    expect(corpoFormato.reason).toBe("parse_error_formato");
    const linhaFormato = gravadas().find((l) => l.body.includes("parse_error"));
    expect(linhaFormato?.body).toContain("parse_error_formato_escopo_salvo");
    expect(linhaFormato?.body).not.toContain("escopo_perdido");
  });

  it("corte dentro da FALA, antes de `scope` sequer existir, grava '..._escopo_perdido' — não há dado nenhum para salvar", async () => {
    // Aqui sim o corte é real: nada depois de `reply` chegou a abrir.
    const textoSemEscopo = '{"reply":"Perfeito! Me conta mais sobre o seu neg';
    vi.stubGlobal("fetch", vi.fn(async () => respostaCrua(textoSemEscopo, "max_tokens")));
    const res = await chamar({ messages: [], currentMessage: "quero social media", sessionId: "s-desfecho-perdido" });
    const corpo = await res.json();

    expect(corpo.reason).toBe("parse_error_truncado");
    expect(corpo.reply).toBeUndefined();
    const linha = gravadas().find((l) => l.body.includes("parse_error"));
    expect(linha?.body).toContain("parse_error_truncado_escopo_perdido");
    expect(linha?.body).not.toContain("escopo_salvo");
  });

  it("scope existe mas o guarda (prospectEmail) descarta por completo: motivo grava 'escopo_perdido', não 'escopo_salvo' de mentira", async () => {
    // Desfecho tem de refletir o que SOBROU do saneamento, não o que chegou
    // bruto no `scope` — por isso reply vazia + único campo é o que o guarda
    // sempre apaga.
    const textoSoFiltrado = JSON.stringify({
      reply: "",
      needsClarification: false,
      scope: { prospectEmail: "ana@exemplo.com" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaCrua(textoSoFiltrado, "end_turn")));
    await chamar({ messages: [], currentMessage: "meu email é ana@exemplo.com", sessionId: "s-desfecho-filtrado" });

    const linha = gravadas().find((l) => l.body.includes("parse_error"));
    expect(linha?.body).toContain("escopo_perdido");
    expect(linha?.body).not.toContain("escopo_salvo");
  });

  it("nenhum objeto sequer se formou (parsed === null): sempre 'escopo_perdido', nunca 'escopo_salvo'", async () => {
    const textoQuebrado = '{"reply" "sem dois pontos"}';
    vi.stubGlobal("fetch", vi.fn(async () => respostaCrua(textoQuebrado, "end_turn")));
    await chamar({ messages: [], currentMessage: "oi", sessionId: "s-desfecho-sem-parse" });

    const linha = gravadas().find((l) => l.body.includes("parse_error"));
    expect(linha?.body).toContain("parse_error_formato_escopo_perdido");
  });

  it("motivos que não são de parse (price_leak, provider_error…) não ganham o sufixo — o sufixo é só dos dois returns de parse_error", async () => {
    // JSON válido, com fala vazando preço: cai no guarda de preço, não no de parse.
    const textoComPreco = JSON.stringify({
      reply: "Fechado! Fica R$ 500 por mês.",
      needsClarification: false,
      scope: { prospectName: "Ana" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaCrua(textoComPreco, "end_turn")));
    await chamar({ messages: [], currentMessage: "quanto custa?", sessionId: "s-price-leak" });

    const linha = gravadas().find((l) => l.body.includes("price_leak"));
    expect(linha?.body).toContain("price_leak");
    expect(linha?.body).not.toContain("escopo_salvo");
    expect(linha?.body).not.toContain("escopo_perdido");
  });
});
