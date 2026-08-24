// O FREIO POR `sessionId`, SOMADO AO DE IP — despacho `seguranca/freio-por-
// sessao-no-sdr`, 16/08/2026.
//
// `/api/sdr/chat` é rota PÚBLICA, sem sessão de verdade, e gasta chave de IA
// PAGA a cada mensagem. Até este despacho o único freio contava por IP
// (`limiteExcedido(req, "sdr-chat", 30, 60_000)`, sem `identificador`) — e o
// parecer do `seguranca` mediu o furo: um pool de IPs atrás do MESMO
// `sessionId` abre uma cota de IP NOVA a cada IP, e escapa inteiro do freio.
//
// Este arquivo mede o SEGUNDO freio, por `sessionId`, e as duas coisas que a
// definição de pronto exige que ele prove:
//   1. conversa normal de 8-12 turnos passa INTEIRA (não barra visitante
//      legítimo);
//   2. laço acima do teto, no MESMO `sessionId`, é barrado — com motivo
//      legível, não silêncio;
//   3. o freio de IP CONTINUA funcionando — não foi substituído, foi somado.
//
// `limiteExcedido` já é medido em `__tests__/plataforma/teto-de-ritmo-no-
// banco.test.ts` (atomicidade, janela, fail-closed) — não repetido aqui. Este
// arquivo mede a FIAÇÃO: que a rota chama os dois freios, na ordem certa
// (antes do gasto), com os identificadores certos, e reage certo a cada um.
// Por isso `limiteExcedido` é mockado com uma implementação simples e
// determinística (contador em memória por `balde:identificador`), em vez de
// bater no Prisma de verdade.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const contagens = vi.hoisted(() => new Map<string, number>());

/** Contador determinístico por `balde:identificador` — sem janela (os testes
 *  aqui não precisam de expiração, isso já é coberto em
 *  `teto-de-ritmo-no-banco.test.ts`). Réplica fiel o bastante do contrato:
 *  dentro do limite libera (`null`); acima, devolve a MESMA forma de recusa
 *  que `respostaDeRecusa` produz — corpo em português, status 429. */
// A chamada de IP (a primeira, sem `identificador`) precisa de um "IP" para
// simular. Lido de `x-forwarded-for` quando o teste manda um (para poder
// variar o IP entre chamadas e isolar o teste do freio de SESSÃO do freio de
// IP — exatamente o cenário do parecer do `seguranca`: mesma sessão, IPs
// diferentes); sem header, cai num IP fixo, simulando o visitante comum.
const limiteExcedido = vi.hoisted(() =>
  vi.fn(
    async (
      req: Request,
      balde: string,
      limite: number,
      _janelaMs: number,
      identificador?: string,
    ): Promise<Response | null> => {
      const ipFalso = req.headers.get("x-forwarded-for") ?? "ip-fixo-do-teste";
      const chave = `${balde}:${identificador ?? ipFalso}`;
      const atual = (contagens.get(chave) ?? 0) + 1;
      contagens.set(chave, atual);
      if (atual > limite) {
        return new Response(
          JSON.stringify({ error: "Muitas requisições em pouco tempo. Aguarde um instante e tente de novo." }),
          { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
        );
      }
      return null;
    },
  ),
);
vi.mock("@/lib/security/limite-no-banco", () => ({ limiteExcedido }));

const db = vi.hoisted(() => ({
  // O teto de gasto soma `AIRunLog` da janela — dublê vazio = gasto zero.
  aIRunLog: { findMany: vi.fn(async () => []) },
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
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
}));

import { POST } from "@/app/api/sdr/chat/route";
import { fioDaConversa } from "@/lib/agency/comercial/registro-da-conversa";

function respostaBruta(text: string, stopReason = "end_turn") {
  return { ok: true, json: async () => ({ content: [{ type: "text", text }], stop_reason: stopReason }) };
}

const PACOTE_OK = JSON.stringify({
  needsClarification: false,
  scope: { prospectName: "Ana" },
  reply: "Perfeito! Me conta mais um pouco sobre o seu negócio.",
});

function chamar(sessionId: string, currentMessage = "oi", ip?: string) {
  return POST(
    new NextRequest("http://localhost/api/sdr/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(ip ? { "x-forwarded-for": ip } : {}),
      },
      body: JSON.stringify({ messages: [], currentMessage, sessionId }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  contagens.clear();
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(PACOTE_OK)));
});

describe("conversa normal de 8 a 12 turnos passa inteira", () => {
  it("12 turnos no MESMO sessionId — nenhum é barrado", async () => {
    for (let turno = 1; turno <= 12; turno++) {
      const res = await chamar("s-conversa-normal", `turno ${turno}`);
      const corpo = await res.json();
      expect(corpo.ok, `turno ${turno} deveria passar`).toBe(true);
    }
  });
});

describe("laço acima do teto, no mesmo sessionId, é barrado", () => {
  it("a 61ª chamada (teto é 60) é barrada — as 60 primeiras passam", async () => {
    // IP diferente em cada chamada — de propósito: isola este teste do freio
    // de IP (30/min) para medir SÓ o freio de sessão (60), e é o retrato
    // exato do cenário do parecer do `seguranca`: pool de IPs atrás da MESMA
    // sessão, que hoje escapa do freio de IP sozinho.
    for (let turno = 1; turno <= 60; turno++) {
      const res = await chamar("s-laco", `msg ${turno}`, `10.0.0.${turno}`);
      const corpo = await res.json();
      expect(corpo.ok, `chamada ${turno} deveria passar (dentro do teto)`).toBe(true);
    }

    const barrada = await chamar("s-laco", "msg 61", "10.0.0.200");
    expect(barrada.status).toBe(429);
    // O barrado RECEBE motivo legível — não resposta vazia nem silêncio.
    const corpo = await barrada.json();
    expect(typeof corpo.error).toBe("string");
    expect(corpo.error.length).toBeGreaterThan(0);
  });

  it("o freio de sessão usa o identificador de `fioDaConversa`, não o sessionId cru", async () => {
    await chamar("id-com-espaço-e-@cento!", "oi");
    const chamadaDeSessao = limiteExcedido.mock.calls.find((c) => c[1] === "sdr-chat-sessao");
    expect(chamadaDeSessao).toBeDefined();
    expect(chamadaDeSessao![4]).toBe(fioDaConversa("id-com-espaço-e-@cento!"));
  });

  it("quem chega sem sessionId cai no balde global `sdr:sem-sessao`", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/sdr/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [], currentMessage: "oi" }), // sem sessionId
      }),
    );
    expect((await res.json()).ok).toBe(true);
    const chamadaDeSessao = limiteExcedido.mock.calls.find((c) => c[1] === "sdr-chat-sessao");
    expect(chamadaDeSessao![4]).toBe("sdr:sem-sessao");
  });

  it("uma sessão barrada não gasta a chave de IA: o Claude não é chamado", async () => {
    for (let turno = 1; turno <= 60; turno++) await chamar("s-sem-gasto", `msg ${turno}`, `10.1.0.${turno}`);
    const chamadasAntes = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await chamar("s-sem-gasto", "msg 61 — deveria ser barrada ANTES do fetch pago", "10.1.0.200");

    const chamadasDepois = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(chamadasDepois).toBe(chamadasAntes);
  });
});

describe("o freio de IP CONTINUA funcionando — não foi substituído, foi somado", () => {
  it("31 sessões DIFERENTES (nenhuma isolada estoura o teto de sessão) ainda barram no teto de IP (30)", async () => {
    // Cada sessionId é único: nenhuma delas, sozinha, se aproxima do teto de
    // sessão (60). Se o freio de IP tivesse sido REMOVIDO ou substituído pelo
    // de sessão, as 31 chamadas passariam todas. Não passam: o freio de IP
    // (sem identificador — todas caem no mesmo "ip-fixo-do-teste" do mock)
    // segue contando à parte, e estoura em 31.
    let barrouEm: number | null = null;
    for (let i = 1; i <= 31; i++) {
      const res = await chamar(`sessao-unica-${i}`, "oi");
      if (res.status === 429 && barrouEm === null) barrouEm = i;
    }
    expect(barrouEm).toBe(31);

    // E a primeira chamada de cada requisição continua sendo a de IP (balde
    // "sdr-chat"), antes de qualquer coisa de sessão.
    const primeiraChamada = limiteExcedido.mock.calls[0];
    expect(primeiraChamada[1]).toBe("sdr-chat");
  });
});
