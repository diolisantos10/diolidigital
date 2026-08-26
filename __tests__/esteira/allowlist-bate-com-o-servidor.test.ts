// A TRAVA CONTRA A DERIVA — 16/08/2026, segunda rodada do mesmo incidente.
//
// Piloto ao vivo, 16/08, 12:41–12:43: 2 posts/dia e R$ 500/mês viraram
// "0 posts/mês". O conserto do dia foi: quando a fala do SDR é barrada por
// corte/formato, o servidor ainda devolve o `scope` que sobreviveu, e o
// cliente (`PublicBriefingRoom.tsx`) aproveita esse `scope` — mas só quando o
// `reason` está numa allowlist local (`MOTIVOS_COM_ESCOPO_APROVEITAVEL`).
//
// Três chats consertaram isso em paralelo. O merge `5d806a60` ("Reconcilia
// TRÊS consertos paralelos") renomeou os `reason` que a rota emite —
// `parse_error_truncado`/`parse_error_formato` viraram `truncado`/
// `malformado`. A allowlist do cliente continuou apontando para os nomes
// mortos por algumas horas. Fail-closed segurou (nada vazou, o resgate só
// ficou desligado) — mas DOIS testes ficaram verdes o tempo todo, porque os
// dois mockavam o servidor em vez de chamá-lo:
//   - `__tests__/briefing/escopo-sobrevive-a-recusa.test.ts` mockava
//     `parse_error_truncado` (o nome antigo);
//   - `__tests__/briefing/escopo-sobrevive-no-cliente.test.ts` mockava
//     `truncado` (o nome novo).
// Cada um provou a própria ficção; nenhum ancorou o contrato entre as duas
// pontas. Este arquivo é essa âncora: chama a rota de VERDADE (só a chamada
// HTTP à Anthropic é mockada), lê o `reason` REAL que ela devolve, e afirma
// que esse `reason` está na allowlist do cliente — importada, nunca copiada
// como string literal. Se um dia alguém renomear o `reason` de novo sem
// atualizar a allowlist, é ESTE teste que quebra, alto, em vez do resgate
// desligar em silêncio.
//
// Molde de mock (prisma, chaveDeRotaPublica, fetch):
// `__tests__/esteira/escopo-sobrevive-ao-corte.test.ts`.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { MOTIVOS_COM_ESCOPO_APROVEITAVEL } from "@/components/agency/briefing/PublicBriefingRoom";

const db = vi.hoisted(() => ({
  // O teto de gasto soma `AIRunLog` da janela — dublê vazio = gasto zero.
  aIRunLog: { findMany: vi.fn(async () => []) },
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
// A rota passou a andar na ordem de provedores da casa (24/08/2026), então ela
// chama `primeiraChaveDeRotaPublica`. O mock DERIVA da mesma função de sempre:
// todo `chaveDeRotaPublica.mockResolvedValue(...)` deste arquivo continua
// mandando, e nenhuma expectativa abaixo precisou mudar — só o encanamento.
vi.mock("@/lib/ai/chave-publica", () => ({
  chaveDeRotaPublica,
  // ── O TETO DE GASTO DA PORTA PÚBLICA (24/08/2026) ────────────────────────
  // A rota passou a resolver DE QUEM É A CONTA e a conferir o teto de gasto
  // antes de gastar chave paga (`lib/ai/teto-de-custo.ts`), e ele é FAIL-CLOSED:
  // sem workspace resolvido não gasta. Sem esta linha todo teste deste arquivo
  // mediria o teto, não o que ele existe para medir.
  workspaceDaRotaPublica: async () => "ws-de-teste",
  primeiraChaveDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? { provider: "claude", chave } : null;
  },
  // A rota passou a pedir a LISTA (medido 26/08/2026: a porta da rua ficou
  // fechada com um provedor bom parado ao lado). O mock continua derivando da
  // mesma função de sempre — um provedor, que é o cenário destes testes.
  chavesDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? [{ provider: "claude", chave }] : [];
  },
}));

import { POST } from "@/app/api/sdr/chat/route";

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

describe("o reason que a rota realmente emite está na allowlist do cliente", () => {
  it("pacote CORTADO com escopo (o caso do incidente: R$ 500/mês, 14 posts/semana) — reason bate com a allowlist", async () => {
    const cortado =
      '{"needsClarification": false, "scope": {"budgetRange": "entre R$ 150 e R$ 500", ' +
      '"social": {"postsPerWeek": 14}}, "reply": "Perfeito! Deixa eu confirmar isso pra vo';

    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(cortado, "max_tokens")));

    const res = await chamar({
      messages: [],
      currentMessage: "quero 2 posts por dia, uns R$ 500 por mês",
      sessionId: "s-corte-trava",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    // A afirmação que importa: o `reason` REAL devolvido pela rota está na
    // allowlist REAL do cliente. Nada aqui é string literal repetida dos dois
    // lados — se um dos dois nomes mudar sem o outro, esta linha falha.
    expect(MOTIVOS_COM_ESCOPO_APROVEITAVEL.has(corpo.reason)).toBe(true);
    expect(corpo.scope).toBeDefined();
    expect(corpo.scope.social.postsPerWeek).toBe(14);
  });

  it("pacote MALFORMADO (JSON que não fecha e a API não confirma corte) — reason bate com a allowlist", async () => {
    const lixo = "isso aqui não é JSON de jeito nenhum, é só uma frase solta.";
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(lixo, "end_turn")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s-malformado-trava" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(MOTIVOS_COM_ESCOPO_APROVEITAVEL.has(corpo.reason)).toBe(true);
  });

  it("guarda de e-mail (email_hallucination) — reason NÃO está na allowlist: continua suspeito, não incompleto", async () => {
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: { businessName: "City Jobs", budgetRange: "entre R$ 150 e R$ 500", social: { postsPerWeek: 14 } },
      reply: "Perfeito! Só confirmando: qual é o seu e-mail?",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({
      messages: [],
      currentMessage: "quero 2 posts por dia, uns R$ 500 por mês",
      sessionId: "s-email-trava",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("email_hallucination");
    // A rota manda `scope` mesmo aqui (o guarda barra a fala, não o dado) —
    // é exatamente por isso que a decisão de descartar tem que morar na
    // allowlist do cliente, não em "o servidor não mandou".
    expect(corpo.scope).toBeDefined();
    expect(MOTIVOS_COM_ESCOPO_APROVEITAVEL.has(corpo.reason)).toBe(false);
  });

  it("guarda de preço (price_leak) — reason NÃO está na allowlist", async () => {
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: { social: { postsPerWeek: 14 } },
      reply: "Fica R$ 2.500 por mês, com desconto.",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({
      messages: [],
      currentMessage: "quanto custa? quero 2 posts por dia, uns R$ 500 por mês",
      sessionId: "s-price-trava",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("price_leak");
    expect(MOTIVOS_COM_ESCOPO_APROVEITAVEL.has(corpo.reason)).toBe(false);
  });
});
