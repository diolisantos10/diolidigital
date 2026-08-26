// "NÃO SALVOU" NÃO É A MESMA COISA QUE "NÃO HAVIA NADA A SALVAR".
//
// Medido em 16/08/2026, rodando cinco cenários contra esta rota com fetch
// mockado: `escopoFoiSalvo: temScopeUtil` (a versão de antes deste arquivo)
// grava a frase de PERDA (`FRASE_ESCOPO_PERDIDO`) sempre que o `scope`
// devolvido ao cliente fica vazio — inclusive quando o modelo nunca extraiu
// nada para começar. Três dos cinco cenários medidos eram falso positivo:
//
//   1. Primeiro turno ("oi"), nada a extrair, fala cortada  → gravava PERDIDO
//   2. price_leak com JSON LIMPO e scope vazio (nada cortado) → gravava PERDIDO
//   5. Turno posterior ("ok"), nada novo a extrair            → gravava PERDIDO
//
// O cenário 2 é o mais grave: o pacote chegou INTEIRO, e mesmo assim o
// diário registrava que algo se perdeu.
//
// O conserto usa o `scope` BRUTO (antes de `aplicarTravasDeEscopo`, já
// calculado na rota como `scopePatchBruto`) para separar "o modelo não
// extraiu nada" de "o modelo extraiu e as travas descartaram" — mesma
// distinção que a casa já aplica entre `sem_canal` e `falhou` no aviso de
// orçamento. Só o segundo caso é perda de verdade.
//
// Este arquivo cobre as três metades: falso positivo derrubado (a), caso
// verdadeiro preservado (b/c) e o gatilho original da suspeita (d). Não
// duplica `__tests__/esteira/escopo-sobrevive-ao-corte.test.ts` — mesmo
// padrão de mock, cobertura diferente.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

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
import { FRASE_ESCOPO_SALVO, FRASE_ESCOPO_PERDIDO } from "@/lib/agency/comercial/registro-da-conversa";

type LinhaGravada = {
  clientId?: string;
  clientRequestId?: string;
  authorRole: string;
  authorName: string;
  body: string;
};
const gravadas = (): LinhaGravada[] =>
  (db.portalMessage.create.mock.calls as unknown as Array<[{ data: LinhaGravada }]>).map((c) => c[0].data);

/** Simula a resposta bruta da Anthropic: `text` é exatamente o que o modelo
 *  escreveu (pode vir cortado); `stopReason` é o motivo que a API diz para
 *  ter parado. */
function respostaBruta(text: string, stopReason?: string) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: "text", text }], stop_reason: stopReason }),
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
  db.clientRequestDb.findUnique.mockResolvedValue(null);
});

// ── (a) OS TRÊS FALSOS POSITIVOS DERRUBADOS ─────────────────────────────────

describe("nada foi extraído: não é perda, é ausência de informação", () => {
  it("(d) PRIMEIRO TURNO — visitante diz só 'oi', fala corta no meio, scope nunca existiu: nenhuma frase de desfecho", async () => {
    // `scope` abre vazio (`{}`) porque não havia nada a captar em "oi" — é a
    // FALA que corta no meio da frase, sem chegar a fechar.
    const cortado =
      '{"needsClarification": false, "scope": {}, "reply": "Oi! Me conta um pouco sobre o seu neg';
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(cortado, "max_tokens")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s-primeiro-turno" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("truncado");
    expect(corpo.scope).toBeUndefined(); // nada sobrou — não havia nada a começar

    const linha = gravadas().find((l) => l.authorName === "SDR");
    expect(linha?.body).toContain("truncado");
    // O ponto central: nem SALVO nem PERDIDO. É "não sei", que é a verdade.
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
    expect(linha?.body).not.toContain(FRASE_ESCOPO_PERDIDO);
  });

  it("price_leak com JSON LIMPO e scope vazio — o pacote chegou INTEIRO, e mesmo assim não havia dado a salvar", async () => {
    // Nada foi cortado (`stop_reason: end_turn`, JSON fecha sozinho). O
    // modelo simplesmente não extraiu campo nenhum neste turno — e mesmo
    // assim errou ao cotar preço na fala.
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: {},
      reply: "Fica R$ 500 por mês, com desconto.",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({ messages: [], currentMessage: "quanto custa?", sessionId: "s-price-leak-vazio" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("price_leak");
    expect(corpo.scope).toBeUndefined();

    const linha = gravadas().find((l) => l.body.includes("price_leak"));
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
    // Este é o caso mais grave do defeito medido: pacote limpo, nada cortado,
    // e a versão antiga ainda assim afirmava que algo se perdeu.
    expect(linha?.body).not.toContain(FRASE_ESCOPO_PERDIDO);
  });

  it("turno posterior — visitante só diz 'ok', nada novo a extrair: sem frase de perda", async () => {
    // JSON fecha limpo, mas a `reply` veio vazia (motor caiu em "malformado")
    // e o `scope` não trouxe nenhum campo novo — não há o que ter perdido.
    const limpo = JSON.stringify({ needsClarification: false, scope: {}, reply: "" });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({ messages: [], currentMessage: "ok", sessionId: "s-turno-posterior" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("malformado");
    expect(corpo.scope).toBeUndefined();

    const linha = gravadas().find((l) => l.body.includes("malformado"));
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
    expect(linha?.body).not.toContain(FRASE_ESCOPO_PERDIDO);
  });
});

// ── (b) O QUE JÁ ERA VERDADE CONTINUA VERDADE ───────────────────────────────

describe("escopo sobrevive às travas: a frase de SALVO continua exatamente como antes", () => {
  it("price_leak com scope CHEIO — grava a frase de salvo", async () => {
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: { prospectName: "Ana", social: { postsPerWeek: 14 } },
      reply: "Fica R$ 2.500 por mês, com desconto.",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({ messages: [], currentMessage: "quanto custa?", sessionId: "s-price-leak-cheio" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("price_leak");
    expect(corpo.scope.prospectName).toBe("Ana");

    const linha = gravadas().find((l) => l.body.includes("price_leak"));
    expect(linha?.body).toContain(FRASE_ESCOPO_SALVO);
    expect(linha?.body).not.toContain(FRASE_ESCOPO_PERDIDO);
  });

  it("truncado com scope CHEIO — grava a frase de salvo", async () => {
    // Escopo já fechou completo (budgetRange e volume de posts); é a FALA
    // que corta no meio.
    const cortado =
      '{"needsClarification": false, "scope": {"budgetRange": "entre R$ 150 e R$ 500", ' +
      '"social": {"postsPerWeek": 14}}, "reply": "Perfeito! Deixa eu confirmar isso pra vo';
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(cortado, "max_tokens")));

    const res = await chamar({
      messages: [],
      currentMessage: "quero 2 posts por dia, uns R$ 500 por mês",
      sessionId: "s-truncado-cheio",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("truncado");
    expect(corpo.scope.budgetRange).toBe("entre R$ 150 e R$ 500");

    const linha = gravadas().find((l) => l.body.includes("truncado"));
    expect(linha?.body).toContain(FRASE_ESCOPO_SALVO);
    expect(linha?.body).not.toContain(FRASE_ESCOPO_PERDIDO);
  });
});

// ── (c) O CASO `false` DE VERDADE ───────────────────────────────────────────

describe("o modelo extrai escopo e as travas descartam tudo: aí sim é perda", () => {
  it("scope só com prospectEmail — a allowlist recusa o único campo que chegou, e a frase de perda grava", async () => {
    // `aplicarTravasDeEscopo` apaga `prospectEmail` incondicionalmente (o
    // e-mail só pode vir do login do Google, nunca do chat). Aqui é o ÚNICO
    // campo que o modelo extraiu: depois da trava, o `scope` fica vazio —
    // mas, ao contrário dos cenários (a), o modelo TEVE algo para extrair e
    // esse algo foi descartado. Esta é a diferença que separa "não sei" de
    // "perdeu".
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: { prospectEmail: "ana@exemplo.com" },
      reply: "Fica R$ 500 por mês.",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({
      messages: [],
      currentMessage: "meu e-mail é ana@exemplo.com, quanto custa?",
      sessionId: "s-perda-real-email",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("price_leak");
    expect(corpo.scope).toBeUndefined(); // nada sobrou depois da trava

    const linha = gravadas().find((l) => l.body.includes("price_leak"));
    expect(linha?.body).toContain(FRASE_ESCOPO_PERDIDO);
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
  });

  it("scope só com budgetRange fora da allowlist — mesmo caso, gatilho diferente", async () => {
    // Segunda via para o mesmo `false`: `normalizarFaixa` devolve `null` para
    // qualquer faixa que não esteja na lista fechada, e o campo é removido.
    // De novo, é o ÚNICO campo extraído — não sobra nada, e o que sobrou foi
    // genuinamente descartado, não ausente desde o início.
    const limpo = JSON.stringify({
      needsClarification: false,
      scope: { budgetRange: "R$ 999.999" },
      reply: "Fica R$ 500 por mês.",
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(limpo, "end_turn")));

    const res = await chamar({
      messages: [],
      currentMessage: "quanto custa?",
      sessionId: "s-perda-real-faixa",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("price_leak");
    expect(corpo.scope).toBeUndefined();

    const linha = gravadas().find((l) => l.body.includes("price_leak"));
    expect(linha?.body).toContain(FRASE_ESCOPO_PERDIDO);
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
  });
});
