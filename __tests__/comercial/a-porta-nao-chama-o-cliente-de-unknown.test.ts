// A CASA NÃO CHAMA O CLIENTE DE "<UNKNOWN>", E NÃO SE DESPEDE NOVE VEZES.
//
// ═══════════════════════════════════════════════════════════════════════════
// OS DOIS ACHADOS, MEDIDOS EM PRODUÇÃO (cliente oculto, 6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// Uma volta de 14 turnos em `https://www.diolidigital.com.br/api/sdr/chat`.
//
// ── 1. O PLACEHOLDER VIROU O NOME DO CLIENTE ───────────────────────────────
// O modelo devolveu `prospectName: "<UNKNOWN>"` — o jeito dele de dizer "não
// sei". A casa gravou como nome, e a consultora passou a falar assim COM ELE:
//
//     "Entendi, <UNKNOWN> — e tudo bem."
//
// Guardrail 1 na forma mais literal que já apareceu aqui: ausência de
// informação não é informação. O modelo DECLAROU ausência e a casa a promoveu
// a fato — e depois a leu de volta em voz alta.
//
// ── 2. O REMÉDIO DA REPETIÇÃO VIROU A REPETIÇÃO ────────────────────────────
// A frase de fecho de `oQueDizerNoLugar` — a máquina que existe para acabar
// com a pergunta repetida — saiu **nove turnos seguidos, palavra por palavra**.
// E saiu nos turnos em que o cliente ESTAVA RESPONDENDO: o e-mail dele, o
// horário de funcionamento, a área atendida. A casa disse nove vezes "vou
// seguir sem esse dado" sobre dados que acabara de receber.
//
// Pior que a pergunta repetida: a pergunta ao menos admite que quer algo; isto
// afirma que desistiu.
//
// ── AS MUTAÇÕES QUE ESTE ARQUIVO PEGA ──────────────────────────────────────
// Apague a trava de placeholder e o primeiro grupo quebra. Apague a checagem
// `jaDisseOFecho` e o segundo quebra.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

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
import { identificarPergunta } from "@/lib/agency/comercial/pergunta-repetida";

function respostaBruta(pacote: unknown) {
  return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(pacote) }] }) };
}

async function chamar(corpo: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/sdr/chat", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  }));
  return res.json() as Promise<{ ok: boolean; reply?: string; scope?: Record<string, unknown> }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
});

describe("1. placeholder não é nome", () => {
  const PLACEHOLDERS = ["<UNKNOWN>", "N/A", "não informado", "desconhecido", "[nome]", "null", "—", "???"];

  for (const p of PLACEHOLDERS) {
    it(`"${p}" NÃO vira o nome da pessoa — o campo some, e desconhecido é a verdade`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => respostaBruta({
        needsClarification: false,
        scope: { prospectName: p, segment: "Restaurante" },
        reply: "Legal! Me conta mais sobre o seu negócio.",
      })));
      const corpo = await chamar({ messages: [], currentMessage: "somos um restaurante", sessionId: "s1" });
      expect(corpo.scope?.prospectName, `"${p}" foi gravado como nome do cliente`).toBeUndefined();
    });
  }

  it("vale igual para o NOME DO NEGÓCIO — ele vai para a fila, a proposta e a peça", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta({
      needsClarification: false,
      scope: { businessName: "<UNKNOWN>" },
      reply: "Certo!",
    })));
    const corpo = await chamar({ messages: [], currentMessage: "oi", sessionId: "s2" });
    expect(corpo.scope?.businessName).toBeUndefined();
  });

  it("nome de VERDADE continua passando — a trava não come gente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta({
      needsClarification: false,
      scope: { prospectName: "Marina", businessName: "Cantina Oculta" },
      reply: "Prazer, Marina!",
    })));
    const corpo = await chamar({ messages: [], currentMessage: "sou a Marina, da Cantina Oculta", sessionId: "s3" });
    expect(corpo.scope?.prospectName).toBe("Marina");
    expect(corpo.scope?.businessName).toBe("Cantina Oculta");
  });
});

describe("2. o fecho da desistência não sai duas vezes", () => {
  const ASSINATURA = "Anotei isso do seu jeito e vou seguir sem esse dado";
  // A pergunta que o modelo insiste em repetir. `identificarPergunta` a
  // reconhece pelo texto, e é a repetição dela que arma o guarda.
  const PERGUNTA = "Qual é o objetivo principal do negócio agora?";

  /** As falas anteriores do SDR no fio, como o corpo da requisição as manda. */
  const historico = (falas: string[]) =>
    falas.map((text) => ({ role: "assistant", text }));

  async function turno(falasAnteriores: string[], escopo: Record<string, unknown> = {}) {
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta({
      needsClarification: false, scope: escopo, reply: PERGUNTA,
    })));
    return chamar({
      messages: historico(falasAnteriores),
      currentMessage: "abrimos de terça a domingo das 18h às 23h",
      scope: escopo,
      sessionId: "s-fecho",
    });
  }

  it("na 3ª insistência o guarda SUBSTITUI a fala — o comportamento certo, e ele fica", async () => {
    const r = await turno([PERGUNTA, PERGUNTA]);
    expect(r.reply, "o guarda tem de agir na terceira").toContain(ASSINATURA);
  });

  it("🔴 mas na VEZ SEGUINTE ele NÃO repete o mesmo fecho — foi assim nove vezes em produção", async () => {
    // O fecho já está no histórico do fio. Repetir é a casa dizendo pela
    // segunda vez que desistiu, para alguém que está respondendo.
    const jaDisse = `Entendi — e tudo bem. ${ASSINATURA} por enquanto; a equipe confirma com você depois. Já tenho o essencial aqui.`;
    const r = await turno([PERGUNTA, PERGUNTA, jaDisse]);
    expect(
      r.reply,
      "o remédio da repetição virou a repetição: a mesma frase de despedida, de novo",
    ).not.toContain(ASSINATURA);
    // ⚠️ E NÃO é a fala do modelo que passa: essa foi a primeira tentativa, e
    // ela derrubou a trava irmã (a MESMA pergunta chegando 3x ao cliente). O
    // fecho novo ECOA o que ele acabou de dizer — nunca a mesma frase duas
    // vezes, e nunca mais "sigo sem esse dado" para quem está falando.
    expect(r.reply, "a pergunta repetida do modelo NÃO pode chegar ao cliente").not.toBe(PERGUNTA);
    expect(r.reply, "o fecho novo carrega as palavras dele").toContain("18h");
    expect(r.reply).toMatch(/Anotei:/);
  });

  it("a LACUNA continua sendo registrada — calar o fecho não pode virar descartar a fala", async () => {
    const jaDisse = `Entendi — e tudo bem. ${ASSINATURA} por enquanto; a equipe confirma.`;
    const r = await turno([PERGUNTA, PERGUNTA, jaDisse]);
    const lacunas = r.scope?.lacunasDeEscopo as Array<{ oQueOClienteDisse: string }> | undefined;
    expect(lacunas, "a resposta do cliente nunca é descartada em silêncio").toBeTruthy();
    expect(lacunas!.some((l) => l.oQueOClienteDisse.includes("18h"))).toBe(true);
  });
});

describe("3. o ECO não pode se disfarçar de pergunta da casa", () => {
  // Achado ao consertar o item 2, e ele quase entrou junto com o conserto.
  //
  // `identificarPergunta` testava a fala INTEIRA. Quando o fecho passou a
  // ecoar o cliente, a frase *"Anotei: «Ainda não sei quanto posso investir».
  // Qual é o objetivo do negócio?"* passou a ser classificada como a PERGUNTA
  // DA FAIXA — porque a palavra "investir", dita pelo CLIENTE, casava a regra.
  //
  // Não é cosmético: `vezesJaPerguntada` contaria o eco como mais uma
  // insistência da casa, e o freio da repetição passaria a se disparar sozinho
  // contra a própria fala. O remédio virando a doença, outra vez, dois blocos
  // depois de ela ter sido consertada.
  //
  // A regra é a que o nome da função sempre disse: só as frases que SÃO
  // pergunta descrevem o que a casa perguntou. Citação não é pergunta.
  it("🔴 a citação do cliente não vira a pergunta da casa", () => {
    const comEco = 'Anotei: "Ainda não sei quanto posso investir". Qual é o objetivo principal do negócio agora?';
    expect(
      identificarPergunta(comEco),
      "a palavra do CLIENTE ('investir') classificou a fala da CASA como pergunta da faixa",
    ).not.toBe("budget_range");
  });

  it("e a pergunta de verdade continua sendo reconhecida", () => {
    expect(identificarPergunta("Qual faixa de investimento você tem em mente?")).toBe("budget_range");
  });

  it("fala sem nenhuma pergunta continua não sendo pergunta", () => {
    expect(identificarPergunta('Anotei: "não sei quanto investir".')).toBeNull();
  });
});
