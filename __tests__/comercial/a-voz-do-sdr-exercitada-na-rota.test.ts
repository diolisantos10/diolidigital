// A VOZ DO SDR, EXERCITADA DE PROPÓSITO — E SEM CHAMAR IA (Fase 1, 26/08/2026).
//
// ═══ POR QUE ESTE ARQUIVO EXISTE ═════════════════════════════════════════════
//
// Dois consertos da 9ª/10ª volta estavam **verdes por ausência**:
//
//   1. a fala em terceira pessoa (*"você consegue me dizer se **ele** já tem
//      fotos?"*) — o conserto "passou" porque, nas passadas seguintes, o modelo
//      simplesmente não repetiu o erro. Nunca se viu o guarda AGIR;
//   2. a cortesia da retratação — provada no nível da função, e a ligação com a
//      rota provada só por LEITURA do arquivo (`expect(fonte).toContain(...)`).
//
// Verde por ausência não é verde, e leitura de arquivo-fonte é a régua mais
// fraca que existe: ela prova que a linha está escrita, nunca que ela roda.
//
// Aqui os dois caminhos são percorridos DE PROPÓSITO, pela rota de verdade
// (`POST /api/sdr/chat`), com a entrada exata que produziu cada defeito. **O
// modelo é dublê** — nenhuma chamada paga, custo US$ 0,00 — e ele é dublado
// para dizer justamente a coisa errada, que é o único jeito de ver o guarda
// trabalhar.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
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
import { falaSobreOClienteEmTerceiraPessoa } from "@/lib/agency/comercial/pergunta-repetida";

/** O DUBLÊ DO MODELO. Ele nunca é chamado de verdade: `fetch` é substituído e
 *  devolve, palavra por palavra, o que o modelo devolveu em produção. */
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

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
});

// A FRASE MEDIDA EM PRODUÇÃO, inteira. Nada aqui é inventado para o teste.
const A_FRASE_ERRADA = "Deixa eu tentar de outro jeito: você consegue me dizer se ele já tem fotos, vídeos ou logo prontos?";

describe("o guarda da terceira pessoa AGE — o caminho percorrido de propósito", () => {
  it("o modelo diz a frase errada e o cliente NÃO a recebe", async () => {
    // Pré-condição do teste: a frase que o dublê vai dizer é, de fato, o
    // defeito. Sem esta linha o teste poderia ficar verde medindo uma frase
    // boa — o defeito de sempre, régua sobre o componente errado.
    expect(falaSobreOClienteEmTerceiraPessoa(A_FRASE_ERRADA)).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(
      JSON.stringify({
        reply: A_FRASE_ERRADA,
        needsClarification: false,
        // Escopo com a sondagem ABERTA: há próxima pergunta para pôr no lugar.
        scope: { prospectName: "Rafael", businessName: "Café do Rafael" },
      }),
    )));

    const res = await chamar({
      messages: [], currentMessage: "quero divulgar meu café", sessionId: "voz-1",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    // MUTAÇÃO QUE PROVA: em `app/api/sdr/chat/route.ts`, troque
    // `if (jaRespondida || emTerceiraPessoa)` por `if (jaRespondida)` — o
    // guarda desligado — e as três linhas abaixo caem juntas.
    expect(corpo.reply, "a frase medida em produção chegou ao cliente").not.toBe(A_FRASE_ERRADA);
    expect(corpo.reply).not.toMatch(/\bele j[áa] tem\b/i);
    expect(falaSobreOClienteEmTerceiraPessoa(corpo.reply)).toBe(false);

    // E o cliente não fica sem pergunta: no lugar sai a PRÓXIMA em aberto —
    // uma redação da FILA, que é escrita para o cliente. Calar seria trocar um
    // defeito por outro.
    expect(corpo.reply).toContain("?");
    const { PERGUNTAS_DA_FILA } = await import("@/lib/agency/comercial/pergunta-repetida");
    expect(PERGUNTAS_DA_FILA, "a fala posta no lugar não é uma redação da fila")
      .toContain(corpo.reply);
  });

  it("com a sondagem FECHADA o cliente recebe o FECHO — nunca a frase errada", async () => {
    // A rota tem um comentário dizendo que "terceira pessoa sem nada em aberto:
    // a fala do modelo passa". Exercitado aqui: **esse ramo não é alcançável**
    // pelo caminho da terceira pessoa. Se a pergunta da vez está em aberto,
    // `proximaPerguntaEmAberto` a devolve; se está respondida, o ramo de
    // `jaRespondida` age antes e o fecho sai. Ou seja, o cliente NUNCA recebe a
    // frase em terceira pessoa — o que é melhor do que o comentário promete.
    //
    // Fica registrado como o que é: comentário mais pessimista que o código.
    // Ponto fraco declarado é dívida; silencioso é armadilha — e aqui a
    // "fraqueza" não existe.
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(
      JSON.stringify({
        reply: A_FRASE_ERRADA, needsClarification: false,
        scope: {
          prospectName: "Rafael", businessName: "Café do Rafael",
          objectives: ["cliente novo"], targetAudience: "vizinhança",
          social: { platforms: ["Instagram"], hasPhotos: true },
          deadline: "este mês", decisionMaker: true, preferredChannel: "email",
        },
      }),
    )));

    const res = await chamar({
      messages: [], currentMessage: "é isso mesmo", sessionId: "voz-2",
    });
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.reply).not.toBe(A_FRASE_ERRADA);
    expect(falaSobreOClienteEmTerceiraPessoa(corpo.reply)).toBe(false);
    expect(corpo.reply).toMatch(/já tenho o essencial/i);
  });
});

describe("a cortesia da retratação sai NA FALA — pela rota, não pelo arquivo-fonte", () => {
  it("o cliente pede para apagar o WhatsApp e a casa DIZ que apagou", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(
      JSON.stringify({
        reply: "Perfeito! E para quando você quer isso de pé?",
        needsClarification: false,
        scope: { prospectName: "Rafael", businessName: "Café do Rafael", prospectPhone: "11 98888-7777" },
      }),
    )));

    const res = await chamar({
      messages: [], currentMessage: "esquece o WhatsApp, prefiro e-mail", sessionId: "voz-3",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    // MUTAÇÃO QUE PROVA: apague o bloco `if (cortesia)` de `route.ts` e as
    // duas linhas abaixo caem. É o defeito exato das três passadas da 9ª
    // volta: o dado saía das três memórias e a fala não dizia uma palavra.
    expect(corpo.reply, "a casa apagou o canal e não disse nada").toMatch(/apaguei o seu WhatsApp/i);
    expect(corpo.reply).toMatch(/falo com voc[êe] por e-mail/i);

    // EMENDA, NUNCA SUBSTITUIÇÃO: a pergunta que o SDR ia fazer continua lá.
    expect(corpo.reply).toContain("para quando você quer isso de pé");

    // E o número sai do patch — cortesia sem apagamento seria só uma frase.
    expect(corpo.scope.prospectPhone).toBeUndefined();
    expect(corpo.scope.canaisRetratados).toContain("whatsapp");
  });

  it("turno sem retratação nenhuma NÃO ganha a frase — ela não pode virar bordão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDaApi(
      JSON.stringify({
        reply: "Boa! Em quais redes vocês estão hoje?",
        needsClarification: false,
        scope: { prospectName: "Rafael", canaisRetratados: ["whatsapp"] },
      }),
    )));

    const res = await chamar({
      messages: [], currentMessage: "a gente abre de terça a domingo", sessionId: "voz-4",
    });
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    // A marca é acumulativa; a cortesia é do TURNO. Se ela lesse a marca, esta
    // linha cairia — e o cliente ouviria "apaguei o seu WhatsApp" para sempre.
    expect(corpo.reply).not.toMatch(/apaguei o seu/i);
  });
});
