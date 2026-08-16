// A CONVERSA DO SDR DEIXAVA DE EXISTIR AO FECHAR A ABA (16/08/2026).
//
// `app/api/sdr/chat/route.ts` não tinha UMA chamada a `prisma.`. O primeiro
// agente da esteira — o único que fala com o prospect antes de qualquer
// cadastro — conversava, errava, e ninguém conseguia abrir o que foi dito. O
// diário do piloto (`/api/piloto/diario`) exibia `mensagens: 0` ENQUANTO a
// conversa acontecia, e o Diretor Geral levantou teorias sobre briefings que não
// andavam sem poder confirmar nenhuma: ele via o rastro, não via a história.
//
// Este arquivo guarda as quatro coisas que fazem o registro valer alguma coisa:
//
//   1. a conversa é gravada, dos DOIS lados, no fio da sessão;
//   2. erro ao gravar NÃO derruba a resposta ao cliente — registro é nosso, a
//      conversa é dele;
//   3. segredo colado no chat não vira linha de banco;
//   4. o registro não vira fila para o PM responder de novo.
//
// A 4 parece detalhe de campo booleano e é a que quebra o cliente: `pm-responde`
// varre `authorRole: "client", readByTeam: false` a cada passada do despertador.
// Registrar a conversa "não lida" faria o prospect receber DUAS respostas para a
// mesma frase — a do SDR, na hora, e a do PM, minutos depois.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  // O teto de ritmo das rotas públicas mora no banco. Aqui ele LIBERA, para que
  // o assunto deste arquivo (o que fica gravado) fique isolado do assunto de lá.
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
import { semSegredo, fioDaConversa, registrarTurnoDoSdr } from "@/lib/agency/comercial/registro-da-conversa";

type LinhaGravada = { clientId?: string; clientRequestId?: string; authorRole: string; authorName: string; body: string; readByTeam: boolean; readByClient: boolean };
const gravadas = (): LinhaGravada[] =>
  (db.portalMessage.create.mock.calls as unknown as Array<[{ data: LinhaGravada }]>).map((c) => c[0].data);

/** A resposta do modelo, no formato que a rota espera (JSON puro, sem cerca). */
function respostaDoModelo(reply: string) {
  return {
    ok: true,
    json: async () => ({ content: [{ type: "text", text: JSON.stringify({ reply, needsClarification: false, scope: {} }) }] }),
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

// ── 1. a conversa é gravada ──────────────────────────────────────────────────

describe("cada turno do SDR vira linha no banco", () => {
  it("grava a fala do visitante e a resposta do SDR, amarradas pelo mesmo fio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo("Oi, Ana! Qual é o nome do seu negócio?")));

    const res = await chamar({
      messages: [],
      currentMessage: "oi, sou a Ana",
      sessionId: "prospect-1755300000000",
    });

    expect((await res.json()).ok).toBe(true);

    const linhas = gravadas();
    expect(linhas).toHaveLength(2);

    // O visitante entra como "client" — é assim que o diário o rotula na linha
    // do tempo ("CLIENTE escreveu"). O SDR entra como "team" com nome próprio,
    // para que se saiba QUAL agente falou, e não só "a agência".
    expect(linhas[0]).toMatchObject({ authorRole: "client", body: "oi, sou a Ana" });
    expect(linhas[1]).toMatchObject({ authorRole: "team", authorName: "SDR", body: "Oi, Ana! Qual é o nome do seu negócio?" });

    // Os dois no MESMO fio: conversa partida em dois fios não é conversa, é
    // duas frases soltas que ninguém consegue ler em ordem.
    expect(linhas[0].clientId).toBe(linhas[1].clientId);
    expect(linhas[0].clientId).toBe("sdr:prospect-1755300000000");
  });

  it("turno BARRADO por um guarda também é gravado — é o erro que mais interessa ver", async () => {
    // Vazamento de preço: o SDR nunca cota. A rota recusa o turno e o motor de
    // regras responde ao cliente. Sem registro, o erro do agente era invisível
    // justamente no turno em que ele errou.
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo("Fica R$ 2.500 por mês, com desconto.")));

    const res = await chamar({ messages: [], currentMessage: "quanto custa?", sessionId: "s1" });
    expect((await res.json()).reason).toBe("price_leak");

    const linhas = gravadas();
    expect(linhas[0]).toMatchObject({ authorRole: "client", body: "quanto custa?" });
    // O MOTIVO fica; a fala proibida não. Gravar o texto barrado seria guardar
    // exatamente aquilo que o guarda impediu de sair.
    expect(linhas[1].body).toContain("price_leak");
    expect(linhas[1].body).not.toContain("2.500");
  });

  it("id de sessão vindo do navegador NUNCA vira id de cliente real", async () => {
    // A rota é pública e sem autenticação: quem chama escolhe o que manda. Se o
    // valor caísse cru em `clientId`, bastaria mandar o cuid de um cliente de
    // verdade para escrever no portal dele. O prefixo do servidor é a trava —
    // cuid não contém `:`.
    expect(fioDaConversa("clh3k9v2x0000abcdefghijkl")).toBe("sdr:clh3k9v2x0000abcdefghijkl");
    expect(fioDaConversa("../../../etc/passwd")).not.toContain("/");
    // Sem id utilizável a conversa ainda é gravada: fio ruim é pior de ler,
    // conversa não gravada é o buraco que este trabalho veio fechar.
    expect(fioDaConversa(undefined)).toBe("sdr:sem-sessao");
    expect(fioDaConversa({ id: "x" })).toBe("sdr:sem-sessao");
  });

  it("o registro nasce LIDO dos dois lados — senão o PM responde de novo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo("Legal! Me conta mais.")));
    await chamar({ messages: [], currentMessage: "quero social media", sessionId: "s2" });

    // `pm-responde.ts` procura `authorRole: "client", readByTeam: false` e
    // responde. Uma conversa já atendida em tempo real entrando nessa fila faz
    // o prospect receber duas respostas para a mesma frase.
    for (const linha of gravadas()) {
      expect(linha.readByTeam).toBe(true);
      expect(linha.readByClient).toBe(true);
    }
  });

  it("o vínculo com o briefing é recusado quando a conversa é de OUTRA sessão", async () => {
    // Chave estrangeira vinda de rota pública é convite: bastaria adivinhar o id
    // de um briefing para escrever no fio de conversa de outra pessoa. Se a
    // linha do tempo daquele pedido já tem mensagem de outro fio, não é esta
    // conversa — grava sem vínculo em vez de gravar no lugar errado.
    db.clientRequestDb.findUnique.mockResolvedValue({ id: "req-de-outro" });
    db.portalMessage.findFirst.mockResolvedValue({ id: "msg-de-outro" });

    await registrarTurnoDoSdr({ sessionId: "s3", clientRequestId: "req-de-outro", doVisitante: "oi", doSdr: "olá" });

    for (const linha of gravadas()) {
      expect(linha.clientRequestId).toBeUndefined();
      expect(linha.clientId).toBe("sdr:s3");
    }
  });

  it("quando o briefing é DESTA conversa, o vínculo é feito", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ id: "req-1" });
    db.portalMessage.findFirst.mockResolvedValue(null); // ninguém mais escreveu ali

    await registrarTurnoDoSdr({ sessionId: "s4", clientRequestId: "req-1", doVisitante: "oi", doSdr: "olá" });

    for (const linha of gravadas()) expect(linha.clientRequestId).toBe("req-1");
  });
});

// ── 2. gravar não pode derrubar a conversa ───────────────────────────────────

describe("o registro é nosso; a conversa é do cliente", () => {
  it("banco fora do ar: o cliente RECEBE a resposta do SDR do mesmo jeito", async () => {
    // A hierarquia é essa e não é negociável: perder o registro é ficar cego num
    // turno; devolver erro ao prospect por causa do diário é perder o cliente.
    db.portalMessage.create.mockRejectedValue(new Error("SQLITE_BUSY: database is locked"));
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo("Perfeito! E qual é o público?")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s5" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.reply).toBe("Perfeito! E qual é o público?");
    expect(db.portalMessage.create).toHaveBeenCalled(); // tentou, falhou, seguiu
  });

  it("a leitura do vínculo falhando também não derruba nada", async () => {
    db.clientRequestDb.findUnique.mockRejectedValue(new Error("sem conexão"));
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo("Boa! Me conta o objetivo.")));

    const res = await chamar({ messages: [], currentMessage: "oi", sessionId: "s6", clientRequestId: "req-x" });
    expect((await res.json()).ok).toBe(true);
  });
});

// ── 3. segredo não vira linha de banco ───────────────────────────────────────

describe("o que o prospect cola no chat não pode virar credencial persistida", () => {
  // Não é paranoia de auditor: o cliente cola o que tem à mão para "facilitar" —
  // já chegou senha de painel e link com token dentro de briefing. Isso ia parar
  // numa tabela que o diário lê e a equipe abre. Chave que atravessa isso está
  // vazada, e vazada de forma persistente.
  it("mascara os formatos conhecidos de chave, token e senha", () => {
    expect(semSegredo("minha chave é sk-ant-api03-AbCdEfGhIjKlMnOpQrSt")).not.toContain("sk-ant-api03");
    expect(semSegredo("token do face: EAAG1234567890abcdefghijklmnop")).not.toContain("EAAG1234567890");
    expect(semSegredo("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc")).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(semSegredo("AKIAIOSFODNN7EXAMPLE")).toBe("[segredo removido]");
    expect(semSegredo("google: AIzaSyD-1234567890abcdefg")).not.toContain("AIzaSyD-1234567890");
    expect(semSegredo("senha: batata123")).not.toContain("batata123");
    expect(semSegredo("api_key=abcdef123456")).not.toContain("abcdef123456");
  });

  it("a fala do cliente sobrevive — mascarar demais apaga o que se queria auditar", () => {
    const fala = "quero 3 posts por semana no Instagram e R$ 1.000 de verba";
    expect(semSegredo(fala)).toBe(fala);
  });

  it("na rota: a chave colada não chega ao banco, mas o resto da frase chega", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo("Anotado! Não precisa mandar senha por aqui. 🙂")));

    await chamar({
      messages: [],
      currentMessage: "o acesso do meta é sk-ant-api03-AbCdEfGhIjKlMnOpQrSt, pode usar",
      sessionId: "s7",
    });

    const doVisitante = gravadas()[0]!.body;
    expect(doVisitante).not.toContain("sk-ant-api03-AbCdEfGhIjKlMnOpQrSt");
    expect(doVisitante).toContain("o acesso do meta é");
  });
});
