// O ESCOPO PRECISA SOBREVIVER MESMO QUANDO A FALA NÃO SOBREVIVE.
//
// Piloto ao vivo, 16/08/2026, 12h41 e 12h43: duas vezes em três minutos a
// resposta do SDR foi barrada por `parse_error`. O cliente tinha dito
// "R$ 500/mês" e "2 posts por dia"; o briefing saiu com R$ 1.800–3.400 e
// 3 posts/semana. Não foi só a fala que se perdeu — foi o pacote inteiro,
// porque o teto de tokens cortou a resposta no meio do JSON e `JSON.parse`
// recusou o texto inteiro, inclusive os campos que já tinham chegado
// completos.
//
// Este arquivo guarda as quatro coisas que fecham esse buraco:
//
//   1. `stop_reason: "max_tokens"` (a própria API dizendo que cortou) é
//      distinguido de um JSON que terminou de ser escrito e ainda assim não
//      é JSON válido — motivos diferentes, ações diferentes.
//   2. `extractJson` falhando não é mais o fim da linha: o servidor tenta
//      fechar à força o que ficou aberto antes de desistir.
//   3. Quando isso recupera um `scope` mas não uma `reply` confiável, o
//      escopo viaja mesmo com `ok: false` — o número que o cliente falou uma
//      vez, ninguém recupera; a fala, o motor de regras refaz.
//   4. O escopo recuperado passa pelas MESMAS travas de sempre — nada entra
//      por atalho só por ter vindo de um pacote remendado.
//
// O guarda NÃO afrouxa: pacote genuinamente ilegível continua sem soltar
// nada, e pacote limpo continua passando inteiro, sem o reparo inventar
// problema onde não há.

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

import { POST } from "@/app/api/sdr/chat/route";

type LinhaGravada = { authorRole: string; authorName: string; body: string };
const gravadas = (): LinhaGravada[] =>
  (db.portalMessage.create.mock.calls as unknown as Array<[{ data: LinhaGravada }]>).map((c) => c[0].data);

/** Simula a resposta bruta da Anthropic: `text` é exatamente o que o modelo
 *  escreveu (pode vir cortado); `stopReason` é o que a API diz sobre o
 *  motivo de ter parado — a peça que faltava ler. */
function respostaBruta(text: string, stopReason?: string) {
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

describe("pacote cortado no meio da fala: o escopo chega, a fala é barrada", () => {
  it("o scope (budgetRange e volume de posts) sobrevive; a fala não", async () => {
    // O modelo escreve `scope` ANTES de `reply` (é o próprio contrato do
    // prompt, ver route.ts). Aqui o escopo já fechou — budgetRange e
    // postsPerWeek estão completos — e é a FALA que fica cortada no meio da
    // palavra, sem aspa nem chave de fechamento.
    const cortado =
      '{"needsClarification": false, "scope": {"budgetRange": "entre R$ 150 e R$ 500", ' +
      '"social": {"postsPerWeek": 14}}, "reply": "Perfeito! Deixa eu confirmar isso pra vo';

    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(cortado, "max_tokens")));

    const res = await chamar({
      messages: [],
      currentMessage: "quero 2 posts por dia, uns R$ 500 por mês",
      sessionId: "s-corte",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("truncado");

    // O dado que o cliente falou uma vez — ninguém recupera se ele se perder
    // aqui. É o item que vale mais que todos os outros juntos.
    expect(corpo.scope.budgetRange).toBe("entre R$ 150 e R$ 500");
    expect(corpo.scope.social.postsPerWeek).toBe(14);

    // A fala cortada NUNCA chega ao cliente nem ao diário — nem inteira nem
    // pela metade.
    expect(corpo.reply).toBeUndefined();

    const linhas = gravadas();
    const doSdr = linhas.find((l) => l.authorName === "SDR");
    expect(doSdr?.body).toContain("truncado");
    expect(doSdr?.body).toContain("escopo");
    expect(doSdr?.body).not.toContain("Perfeito! Deixa eu confirmar");
  });
});

describe("stop_reason distingue CORTE de FORMATO QUEBRADO", () => {
  it("texto que não é JSON e a API não diz que cortou: malformado", async () => {
    const lixo = "isso aqui não é JSON de jeito nenhum, é só uma frase solta.";
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(lixo, "end_turn")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s-malformado" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("malformado");
    expect(corpo.scope).toBeUndefined(); // nada foi recuperado — não inventa

    const linhas = gravadas();
    const doSdr = linhas.find((l) => l.authorName === "SDR");
    expect(doSdr?.body).toContain("malformado");
    expect(doSdr?.body).not.toContain("truncado");
  });

  it("o MESMO texto ilegível, mas a API confirma que cortou: truncado", async () => {
    const lixo = "isso aqui não é JSON de jeito nenhum, é só uma frase solta.";
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(lixo, "max_tokens")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s-truncado-sem-remendo" });
    const corpo = await res.json();

    // A causa mudou (a API confirma o corte), mesmo sem nada para recuperar
    // — `stop_reason` é a fonte de verdade, não um heurístico local.
    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("truncado");

    const linhas = gravadas();
    const doSdr = linhas.find((l) => l.authorName === "SDR");
    expect(doSdr?.body).toContain("truncado");
  });
});

describe("a metade que quase ninguém escreve: pacote limpo continua passando inteiro", () => {
  it("JSON completo não passa pelo remendo, e nada é descartado à toa", async () => {
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: { businessName: "City Jobs", budgetRange: "entre R$ 150 e R$ 500", social: { postsPerWeek: 7 } },
      reply: "Perfeito! Já anotei aqui. Me conta mais um pouco sobre o público.",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({ messages: [], currentMessage: "oi, sou da City Jobs", sessionId: "s-limpo" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.reply).toBe("Perfeito! Já anotei aqui. Me conta mais um pouco sobre o público.");
    expect(corpo.scope).toEqual({
      businessName: "City Jobs",
      budgetRange: "entre R$ 150 e R$ 500",
      social: { postsPerWeek: 7 },
    });
  });
});

// ── O MESMO BURACO, NOUTRA PORTA (auditoria de 16/08) ───────────────────────
//
// Os testes acima cobrem `truncado` e `malformado`: o PACOTE chegou quebrado.
// Mas existem dois guardas que barram a FALA com o pacote perfeito — o JSON
// abriu limpo, o `scope` é válido, e mesmo assim o servidor devolvia
// `{ ok: false, reason }` sem o campo `scope`. `PublicBriefingRoom.tsx`
// (`fetchSdrReply`) já dizia no comentário que aplicava o scope também nesses
// dois casos; o servidor é quem não mandava. Estes dois blocos guardam que o
// dado que o cliente realmente falou — o mesmo "R$ 500/mês, 2 posts por dia"
// do piloto de 16/08 — não é descartado só porque o AGENTE, não o CLIENTE,
// errou a frase.

describe("guarda de e-mail barra a FALA, não o escopo que já tinha chegado", () => {
  it("email_hallucination: a fala é recusada, o scope válido viaja junto", async () => {
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: { businessName: "City Jobs", budgetRange: "entre R$ 150 e R$ 500", social: { postsPerWeek: 14 } },
      // Não há "@" na mensagem do visitante — o modelo alucinou pedir e-mail
      // mesmo assim, e é isso que o guarda pega.
      reply: "Perfeito! Só confirmando: qual é o seu e-mail?",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({
      messages: [],
      currentMessage: "quero 2 posts por dia, uns R$ 500 por mês",
      sessionId: "s-email-halluc",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("email_hallucination");
    // A fala nunca chega — o guarda não afrouxa.
    expect(corpo.reply).toBeUndefined();
    // O dado que o cliente falou (faixa e volume de posts) não tem culpa no
    // erro do agente e sobrevive à recusa.
    expect(corpo.scope.budgetRange).toBe("entre R$ 150 e R$ 500");
    expect(corpo.scope.social.postsPerWeek).toBe(14);

    const linhas = gravadas();
    const doSdr = linhas.find((l) => l.authorName === "SDR");
    expect(doSdr?.body).toContain("email_hallucination");
  });
});

describe("guarda de preço barra a FALA, não o escopo que já tinha chegado", () => {
  it("price_leak: a fala é recusada, e o scope filtrado pelas travas viaja junto", async () => {
    const limpo = JSON.stringify({
      needsClarification: false,
      // Os três campos que NUNCA podem atravessar, mesmo aqui: e-mail
      // (login com Google, nunca chat), nome do negócio igual ao do
      // prospect (fail-closed) e faixa fora da allowlist.
      scope: {
        prospectEmail: "ana@exemplo.com",
        prospectName: "Ana",
        businessName: "Ana",
        budgetRange: "R$ 999",
        social: { postsPerWeek: 14 },
      },
      reply: "Fica R$ 2.500 por mês, com desconto.",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({
      messages: [],
      currentMessage: "quanto custa? quero 2 posts por dia, uns R$ 500 por mês",
      sessionId: "s-price-leak",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("price_leak");
    expect(corpo.reply).toBeUndefined();

    // Metade 1: o dado do cliente sobrevive.
    expect(corpo.scope.social.postsPerWeek).toBe(14);
    expect(corpo.scope.prospectName).toBe("Ana");

    // Metade 2 — a que quase ninguém escreve: o scope que viaja aqui PASSOU
    // pelas mesmas travas de sempre, mesmo vindo de um guarda diferente.
    expect(corpo.scope.prospectEmail).toBeUndefined(); // login com Google, nunca do chat
    expect(corpo.scope.businessName).toBeUndefined();  // igual ao prospectName — descartado
    expect(corpo.scope.budgetRange).toBeUndefined();   // "R$ 999" não é faixa da allowlist

    const linhas = gravadas();
    const doSdr = linhas.find((l) => l.authorName === "SDR");
    expect(doSdr?.body).toContain("price_leak");
    // O preço cotado não vira linha de banco — o motivo fica, a fala proibida não.
    expect(doSdr?.body).not.toContain("2.500");
  });
});

describe("o escopo recuperado passa pelas MESMAS travas de sempre", () => {
  it("prospectEmail some, businessName igual a prospectName some, budgetRange fora da allowlist some", async () => {
    // O mesmo padrão de corte do primeiro teste — escopo fechado, fala
    // cortada — mas agora o escopo carrega três coisas que NUNCA podem
    // atravessar, nem vindas de um pacote remendado.
    const cortado =
      '{"needsClarification": false, "scope": {"prospectEmail": "ana@exemplo.com", ' +
      '"prospectName": "Ana", "businessName": "Ana", "budgetRange": "R$ 999", ' +
      '"social": {"postsPerWeek": 14}}, "reply": "Show, Ana! Deixa eu confirmar rapidinho com vo';

    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(cortado, "max_tokens")));

    const res = await chamar({ messages: [], currentMessage: "meu e-mail é ana@exemplo.com", sessionId: "s-travas" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.scope.prospectEmail).toBeUndefined();
    expect(corpo.scope.businessName).toBeUndefined(); // igual a prospectName — descartado
    expect(corpo.scope.budgetRange).toBeUndefined();  // "R$ 999" não é uma faixa da allowlist
    // O que passa nas travas continua chegando — a trava não é afrouxada, mas
    // também não é generosa demais: só descarta o que precisa descartar.
    expect(corpo.scope.prospectName).toBe("Ana");
    expect(corpo.scope.social.postsPerWeek).toBe(14);
  });
});
