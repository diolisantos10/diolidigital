// O QUE EU QUEBREI CONSERTANDO, NO MESMO DIA — e a faixa que a allowlist deixou passar.
//
// ═══════════════════════════════════════════════════════════════════════════
// 1. O ECO VIROU UM CANO DE PII (dívida minha, medida em produção)
// ═══════════════════════════════════════════════════════════════════════════
//
// O eco nasceu nesta rodada para matar a frase de despedida repetida nove
// vezes. Subiu, e na volta seguinte contra produção a casa respondeu:
//
//   EU : "Pode mandar tudo pro marina2.oculta@trattoria-oculta.invalid."
//   SDR: Anotei: "Pode mandar tudo pro marina2.oculta@trattoria-oculta.invalid."
//
// Essa fala vira HISTÓRICO: volta em `messages` a cada turno seguinte. Ou seja,
// o endereço passou a viajar para dentro do prompt do modelo **pela porta que
// eu abri** — a mesma doutrina que o resto da rodada existe para proteger
// (`aplicarTravasDeEscopo` apaga `prospectEmail`, a lacuna é mascarada,
// `contatoOferecido` mora fora do escopo). Consertei um cano e abri outro.
//
// ═══════════════════════════════════════════════════════════════════════════
// 2. ALLOWLIST NÃO É CORREÇÃO (medido na mesma volta)
// ═══════════════════════════════════════════════════════════════════════════
//
// O cliente disse *"Tá caro. Meu teto é R$ 900 por mês."* e o escopo saiu com
// **"entre R$ 150 e R$ 500"** — metade do teto que ele acabara de declarar.
//
// A allowlist funcionou: aquele rótulo É válido. Ela responde "este rótulo
// existe?", e a pergunta que importa é "este rótulo é o do número que ele
// disse?". O estrago é de preço: `tetoDaFaixa` devolve 500, e o confronto de
// verba passa a comparar a proposta contra um teto que ele nunca deu.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { oQueDizerNoLugar } from "@/lib/agency/comercial/pergunta-repetida";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn(async () => []) },
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  rateLimitBucket: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(), findUnique: vi.fn(),
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
  // A rota passou a pedir a LISTA (medido 26/08/2026: a porta da rua ficou
  // fechada com um provedor bom parado ao lado). O mock continua derivando da
  // mesma função de sempre — um provedor, que é o cenário destes testes.
  chavesDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? [{ provider: "claude", chave }] : [];
  },
}));
import { POST } from "@/app/api/sdr/chat/route";

const EMAIL = "marina2.oculta@trattoria-oculta.invalid";

describe("1. o eco devolve as palavras dele, nunca o e-mail dele", () => {
  it("🔴 o endereço não volta na fala da casa — ela vira histórico e entra no prompt", () => {
    const fala = oQueDizerNoLugar(
      "objetivo", { objectives: ["x"], targetAudience: "y", social: { platforms: ["ig"], hasPhotos: true },
                    deadline: "já", decisionMaker: true, preferredChannel: "email" },
      [], `Pode mandar tudo pro ${EMAIL}.`,
    );
    expect(fala, "o e-mail voltou na fala da casa — e a fala vira histórico").not.toContain(EMAIL);
    expect(fala, "a FRASE dele fica; só o endereço sai").toContain("Pode mandar tudo pro");
    expect(fala).toContain("[e-mail do cliente]");
  });

  it("fala sem e-mail volta palavra por palavra", () => {
    const fala = oQueDizerNoLugar("objetivo", {}, [], "abrimos de terça a domingo das 18h às 23h");
    expect(fala).toContain("abrimos de terça a domingo das 18h às 23h");
  });
});

describe("2. a faixa de verba vem do NÚMERO que ele disse", () => {
  function respostaBruta(pacote: unknown) {
    return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(pacote) }] }) };
  }
  async function turno(fala: string, faixaDoModelo: string) {
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta({
      needsClarification: false,
      scope: { budgetRange: faixaDoModelo },
      reply: "Certo, anotei a sua faixa de investimento.",
    })));
    const res = await POST(new NextRequest("http://localhost/api/sdr/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [], currentMessage: fala, sessionId: "s-faixa" }),
    }));
    return (await res.json() as { scope?: Record<string, unknown> }).scope?.budgetRange;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
    db.portalMessage.create.mockResolvedValue({});
    db.portalMessage.findFirst.mockResolvedValue(null);
    db.clientRequestDb.findUnique.mockResolvedValue(null);
  });

  it("🔴 R$ 900 não vira 'entre R$ 150 e R$ 500', por mais válido que esse rótulo seja", async () => {
    const faixa = await turno("Tá caro. Meu teto é R$ 900 por mês.", "entre R$ 150 e R$ 500");
    expect(
      faixa,
      "o modelo escolheu um rótulo válido e ERRADO; o número que ele disse é que manda",
    ).toBe("entre R$ 500 e R$ 1.500");
  });

  it("R$ 300 continua em 'entre R$ 150 e R$ 500' — a derivação não empurra ninguém para cima", async () => {
    expect(await turno("Consigo uns R$ 300 por mês.", "entre R$ 500 e R$ 1.500"))
      .toBe("entre R$ 150 e R$ 500");
  });

  it("sem número na fala, o rótulo do modelo continua valendo — nada foi endurecido demais", async () => {
    expect(await turno("Não sei ainda quanto posso investir.", "entre R$ 150 e R$ 500"))
      .toBe("entre R$ 150 e R$ 500");
  });

  it("rótulo inventado continua sumindo — a allowlist não foi afrouxada", async () => {
    expect(await turno("Não sei ainda.", "uns trocados")).toBeUndefined();
  });
});

// ── A CLASSE, NÃO A INSTÂNCIA (27/08/2026) ─────────────────────────────────
//
// A primeira máscara tapou o e-mail, porque foi o e-mail que a medição pegou.
// O cano, porém, é "contato do cliente voltando para dentro do prompt" — e a
// FILA desta casa PERGUNTA o telefone ("e-mail ou WhatsApp?"). A resposta
// natural é um número, e o eco o devolvia inteiro. Mesmo defeito, outro campo:
// é a lição do "allowlist não é correção" aplicada ao próprio conserto.
describe("3. o eco também não devolve o TELEFONE dele", () => {
  it("o número sai do eco com a mesma marca de máscara", () => {
    const saida = oQueDizerNoLugar(
      "canal_de_contato",
      { prospectName: "Marina" },
      [],
      "Pode me chamar no (11) 98877-6655 que eu respondo rápido",
    );
    expect(saida).not.toContain("98877");
    expect(saida).not.toContain("6655");
    expect(saida).toContain("[telefone do cliente]");
    // A frase continua sendo dele — só o número sai.
    expect(saida).toContain("Pode me chamar");
  });

  it("MUTAÇÃO: número que NÃO é telefone sobrevive — a máscara não come a fala dele", () => {
    const saida = oQueDizerNoLugar(
      "prazo",
      { prospectName: "Marina" },
      [],
      "Quero 3 posts por semana, das 18h às 23h, com teto de R$ 1.500,00 por mês",
    );
    expect(saida).toContain("3 posts por semana");
    expect(saida).toContain("18h");
    expect(saida).toContain("1.500");
    expect(saida).not.toContain("[telefone do cliente]");
  });

  it("os dois juntos, na mesma frase, saem os dois", () => {
    const saida = oQueDizerNoLugar(
      "canal_de_contato",
      { prospectName: "Marina" },
      [],
      `Manda pro ${EMAIL} ou no 11988776655`,
    );
    expect(saida).not.toContain(EMAIL);
    expect(saida).not.toContain("11988776655");
    expect(saida).toContain("[e-mail do cliente]");
    expect(saida).toContain("[telefone do cliente]");
  });
});
