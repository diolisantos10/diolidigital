// PACOTE CORTADO NÃO LEVA O ESCOPO JUNTO (16/08/2026).
//
// Caso real, piloto ao vivo do CEO, 12:41 e 12:43 — duas vezes em três minutos.
// O SDR devolve UM pacote com duas cargas dentro: `reply` (a fala) e `scope`
// (os dados do briefing). O teto de tokens cortou a resposta no meio, o JSON
// nunca fechou, `JSON.parse` recusou o texto INTEIRO — inclusive os campos que
// já tinham chegado completos — e o turno virou `parse_error`.
//
// O CEO tinha acabado de dizer "2 posts por dia" e "verba de R$ 500/mês".
// Aquele escopo virou pó: o painel foi para "0 posts/mês" e a casa devolveu um
// orçamento de R$ 1.800–3.400 com 3 posts por semana. Nem a verba dele, nem o
// volume.
//
// A hierarquia das duas perdas não é a mesma, e é disso que este arquivo trata:
// a FALA o motor de regras refaz na hora e o cliente nem percebe; o NÚMERO que
// o cliente falou uma vez ninguém recupera. Então o escopo passa a sobreviver
// sozinho, e o guarda NÃO foi afrouxado — barrar a fala continua sendo melhor
// que empurrar lixo ao prospect; o que mudou é que barrar a fala deixou de
// significar jogar fora o briefing.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  // O teto de ritmo das rotas públicas mora no banco. Aqui ele LIBERA, para
  // isolar o assunto deste arquivo do assunto de lá.
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

import { POST } from "@/app/api/sdr/chat/route";

/** A resposta crua da API, com o texto e o motivo de parada que ela declara. */
function respostaDaApi(text: string, stop_reason = "end_turn") {
  return { ok: true, json: async () => ({ content: [{ type: "text", text }], stop_reason }) };
}

function chamar(corpo: Record<string, unknown>) {
  return POST(new NextRequest("http://localhost/api/sdr/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }));
}

/** O que o modelo devolveu no turno de 12:41, cortado exatamente como veio: a
 *  fala inteira, o escopo aberto no meio de `social`.
 *  (A fala aqui não repete a verba em reais só para manter este arquivo sobre
 *  UM assunto: o guarda de preço é outro portão, com testes próprios.) */
const PACOTE_CORTADO_NO_ESCOPO = `{
  "reply": "Anotei, Dioli: 2 posts por dia. Qual é o público que você quer alcançar?",
  "needsClarification": false,
  "scope": {
    "prospectName": "Dioli",
    "businessName": "City Jobs",
    "wantsSocialMedia": true,
    "social": { "platforms": ["Instagram"], "postsPerWeek": 14, "storiesPerWeek": 0`;

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
});

describe("o pacote cortado no teto de tokens não leva o briefing junto", () => {
  it("salva os números que o cliente disse quando o corte cai dentro do escopo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(PACOTE_CORTADO_NO_ESCOPO, "max_tokens")));

    const res = await chamar({ messages: [], currentMessage: "2 posts por dia, uns R$ 500 por mês", sessionId: "s1" });
    const corpo = await res.json();

    // Antes deste conserto o turno inteiro virava `parse_error` e isto aqui era
    // `undefined` — os 14 posts/semana que o cliente acabara de falar sumiam.
    expect(corpo.ok).toBe(true);
    expect((corpo.scope.social as { postsPerWeek: number }).postsPerWeek).toBe(14);
    expect(corpo.scope.businessName).toBe("City Jobs");
    expect(corpo.reply).toContain("2 posts por dia");
  });

  it("o escopo sobrevive mesmo quando a fala não vem — é a metade que ninguém recupera", async () => {
    // Pacote sem `reply` utilizável, mas com o dado inteiro. A fala cai no motor
    // de regras (`ok: false`); o número do cliente vai junto na resposta.
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(
      `{"reply": "", "scope": {"prospectName": "Dioli", "traffic": {"monthlyAdBudget": "R$ 500"}}}`,
    )));

    const res = await chamar({ messages: [], currentMessage: "verba de 500 por mês", sessionId: "s2" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect((corpo.scope.traffic as { monthlyAdBudget: string }).monthlyAdBudget).toBe("R$ 500");
  });

  it("meia frase não vai para o prospect: corte dentro da FALA cai no motor de regras", async () => {
    // Aqui o corte foi antes de `scope` existir — ou seja, caiu na própria fala.
    // Remendar devolveria ao cliente uma frase pela metade, que é pior que
    // deixar o motor de regras responder. O remendo fecha o JSON; ele não
    // completa o que o modelo não escreveu.
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(
      `{"reply": "Que legal, Dioli! Me conta uma coisa: você já tem fotos ou a gente`,
      "max_tokens",
    )));

    const res = await chamar({ messages: [], currentMessage: "quero social media", sessionId: "s3" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reply).toBeUndefined();
  });

  it("os guardas continuam valendo sobre o escopo salvo do remendo", async () => {
    // Guarda que existe num caminho e não no outro é guarda que não existe. O
    // escopo resgatado de um pacote cortado passa pelas MESMAS travas: nome da
    // pessoa não vira nome do negócio, e-mail não vem do chat, faixa só por
    // allowlist.
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(
      `{"reply": "Boa, Diego!", "scope": {"prospectName": "Diego", "businessName": "Diego",
        "prospectEmail": "diego@x.com", "budgetRange": "R$ 500", "segment": "RH`,
      "max_tokens",
    )));

    const res = await chamar({ messages: [], currentMessage: "sou o Diego", sessionId: "s4" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.scope.businessName).toBeUndefined();  // igual ao nome da pessoa
    expect(corpo.scope.prospectEmail).toBeUndefined(); // e-mail vem do login
    expect(corpo.scope.budgetRange).toBeUndefined();   // faixa inventada não entra
    expect(corpo.scope.prospectName).toBe("Diego");
  });
});

describe("o diário para de misturar as duas causas de parse_error", () => {
  it("corte no teto é registrado como truncado — o remédio é o teto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi("texto sem nenhuma chave", "max_tokens")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s5" });
    expect((await res.json()).reason).toBe("parse_error_truncado");
  });

  it("formato quebrado é registrado como formato — o remédio é o prompt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi("desculpa, não consigo responder isso", "end_turn")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s6" });
    expect((await res.json()).reason).toBe("parse_error_formato");

    // As duas causas caíam no mesmo balde (`parse_error`): quem abrisse o diário
    // no dia seguinte não sabia se subia o teto ou consertava o prompt.
    const barrada = (db.portalMessage.create.mock.calls as unknown as Array<[{ data: { body: string } }]>)
      .map((c) => c[0].data.body).find((b) => b.includes("guarda"));
    expect(barrada).toContain("parse_error_formato");
  });
});
