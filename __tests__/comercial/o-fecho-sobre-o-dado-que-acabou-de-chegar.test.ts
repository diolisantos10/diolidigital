// "VOU SEGUIR SEM ESSE DADO" — SOBRE UM DADO QUE A CASA ACABARA DE RECEBER.
//
// ⚠️ DEFEITO MEU, medido no ar na 9ª volta (26/08/2026), uma hora depois de eu
// escrever a trava que o produziu. O cliente escreveu:
//
//     "Já temos fotos boas do café e dos doces, tiradas por um amigo fotógrafo."
//
// e a casa respondeu:
//
//     "Entendi, Rafael — e tudo bem. Anotei isso do seu jeito e vou seguir sem
//      esse dado por enquanto; a equipe confirma com você depois."
//
// `social.hasPhotos` estava no patch DAQUELE MESMO turno.
//
// A causa é ordem, não régua: `perguntaDaVez` é calculada da fala ORIGINAL do
// modelo. A trava nova trocava a fala inteira pela próxima pergunta em aberto —
// e o contador de insistência, logo abaixo, continuava agindo sobre a pergunta
// da fala que já não existia mais, sobrescrevendo a substituição com o fecho.
//
// Contar uma fala que não foi dita é a mesma família de erro que esta rota
// passa o tempo todo fechando.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn(async () => []) },
  portalMessage: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
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
vi.mock("@/lib/ai/chave-publica", () => ({
  chaveDeRotaPublica,
  workspaceDaRotaPublica: async () => "ws-de-teste",
  primeiraChaveDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? { provider: "claude", chave } : null;
  },
  chavesDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? [{ provider: "claude", chave }] : [];
  },
}));

import { POST } from "@/app/api/sdr/chat/route";

const A_FRASE_DO_ABANDONO = "vou seguir sem esse dado";

// A pergunta do material, como o modelo a escreve — e que o cliente ACABOU de
// responder no mesmo turno.
const PERGUNTA_DO_MATERIAL = "Vocês já têm fotos e vídeos do negócio, ou a gente produz do zero?";

function respostaDoModelo(reply: string, scope: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify({ needsClarification: false, scope, reply }) }],
      stop_reason: "end_turn",
    }),
  };
}

function chamar(corpo: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/sdr/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.portalMessage.findMany.mockResolvedValue([]);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
  db.aIRunLog.findMany.mockResolvedValue([]);
});

describe("a casa não desiste de um dado que acabou de receber", () => {
  it("o caso medido no ar: o cliente responde as fotos e NÃO ouve 'vou seguir sem esse dado'", async () => {
    // O modelo é teimoso: repete a pergunta do material o tempo todo — e, no
    // turno em que o cliente responde, ele grava o dado E repete a pergunta no
    // mesmo pacote. É exatamente o que a produção devolveu.
    vi.stubGlobal("fetch", vi.fn(async () =>
      respostaDoModelo(PERGUNTA_DO_MATERIAL, { social: { platforms: ["Instagram"], hasPhotos: true } })));

    // O histórico já traz a pergunta feita duas vezes — o contador de
    // insistência está no limite, que é a condição que disparava o fecho.
    const messages = [
      { role: "user", text: "oi" },
      { role: "assistant", text: PERGUNTA_DO_MATERIAL },
      { role: "user", text: "depois eu vejo" },
      { role: "assistant", text: PERGUNTA_DO_MATERIAL },
    ];

    const res = await chamar({
      messages,
      currentMessage: "Já temos fotos boas do café e dos doces, tiradas por um amigo fotógrafo.",
      scope: { prospectName: "Rafael", businessName: "CANTO DO GRAO NOME TESTE" },
      sessionId: "s-fecho",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.reply.toLowerCase()).not.toContain(A_FRASE_DO_ABANDONO);
    // E a pergunta respondida também não sai de novo — a substituição é a que
    // sobrevive, não o fecho.
    expect(corpo.reply).not.toBe(PERGUNTA_DO_MATERIAL);
    // A conversa AVANÇA: a instrução gêmea da proibição continua valendo.
    expect(corpo.reply.length).toBeGreaterThan(20);
  });

  it("o fecho continua existindo para quem de fato NÃO respondeu", async () => {
    // Mesma teimosia do modelo, mesmo contador no limite — e desta vez o dado
    // não chega: nem no escopo acumulado, nem no patch do turno. A trava velha
    // segue de pé, e é ela que impede a terceira repetição.
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo(PERGUNTA_DO_MATERIAL, {})));
    const messages = [
      { role: "user", text: "oi" },
      { role: "assistant", text: PERGUNTA_DO_MATERIAL },
      { role: "user", text: "hmm" },
      { role: "assistant", text: PERGUNTA_DO_MATERIAL },
    ];
    const res = await chamar({
      messages,
      currentMessage: "não sei te dizer agora",
      scope: { prospectName: "Rafael" },
      sessionId: "s-fecho-2",
    });
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    // A pergunta não sai pela terceira vez — que é o que a trava velha existe
    // para garantir.
    expect(corpo.reply).not.toBe(PERGUNTA_DO_MATERIAL);
  });
});
