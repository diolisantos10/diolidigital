// O LAÇO DA PERGUNTA REPETIDA, MEDIDO NO COMPONENTE QUE ATENDE.
//
// ─── POR QUE ESTE ARQUIVO EXISTE, E É A PARTE MAIS IMPORTANTE ───────────────
//
// Em 24/08/2026 a casa consertou o laço da pergunta repetida e a régua ficou
// verde — sobre `lib/agency/prospect-engine.ts`, o motor de REGRAS. O motor de
// regras é o plano B: ele quase nunca atende, porque as cinco chaves de IA
// estão ligadas e quem responde ao prospect é `app/api/sdr/chat/route.ts`.
// Aquele arquivo não mudou um byte no conserto:
//
//     git diff 37701249 d91cc474 -- app/api/sdr/chat/route.ts
//     (vazio)
//
// Régua verde sobre o plano B enquanto o caminho que atende seguia doente. É
// exatamente o modo de falha que este arquivo existe para não repetir: **ele
// chama a ROTA**, a mesma função `POST` que a internet chama, com o provedor
// mockado no lugar da chave paga. O que ele mede é o que o cliente recebe.
//
// ⚠️ O QUE ELE NÃO PROVA, com todas as letras: ele não prova que o MODELO
// deixou de repetir. O modelo pode repetir à vontade — e neste teste ele
// repete, de propósito, cinco turnos seguidos. O que está provado é que a
// repetição **não chega ao cliente**: o servidor conta, e a partir da terceira
// vez a fala que sai é outra. Essa é a diferença entre trava e sorte. A queda
// de 15 para 6 repetições entre as rodadas de 24/08 não foi conserto: foi o
// modelo variando.

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
}));

import { POST } from "@/app/api/sdr/chat/route";
import { LIMITE_DE_INSISTENCIA } from "@/lib/agency/comercial/pergunta-sem-encaixe";
import { identificarPergunta } from "@/lib/agency/comercial/pergunta-repetida";

// A pergunta da faixa, escrita como o modelo a escreve — com a régua INTEIRA,
// que é o que a faz passar pelo guarda de preço (`ehPerguntaDeFaixa`). É a
// pergunta que mais se repetiu na medição de produção.
const PERGUNTA_DA_FAIXA =
  "Perfeito! Pra eu montar a proposta certa: você tá pensando em investir até R$ 150 por mês, " +
  "entre R$ 150 e R$ 500, entre R$ 500 e R$ 1.500, entre R$ 1.500 e R$ 5.000, ou acima de R$ 5.000?";

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

/**
 * Roda uma conversa de verdade contra a rota: o cliente acumula o histórico e
 * reenvia, exatamente como `PublicBriefingRoom.fetchSdrReply` faz.
 *
 * O modelo é teimoso de propósito — devolve SEMPRE a mesma pergunta.
 */
async function conversaComModeloTeimoso(turnos: number, falaDoCliente: (i: number) => string) {
  vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo(PERGUNTA_DA_FAIXA)));
  const messages: { role: string; text: string }[] = [];
  const falas: string[] = [];
  const escopos: Record<string, unknown>[] = [];

  for (let i = 0; i < turnos; i++) {
    const minha = falaDoCliente(i);
    const res = await chamar({ messages, currentMessage: minha, scope: {}, sessionId: "s-laco" });
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    messages.push({ role: "user", text: minha });
    messages.push({ role: "assistant", text: corpo.reply });
    falas.push(corpo.reply);
    escopos.push(corpo.scope ?? {});
  }
  return { falas, escopos };
}

describe("o laço da pergunta repetida morre na rota que atende", () => {
  it("o modelo repete a MESMA pergunta cinco turnos — o cliente nunca a recebe três vezes", async () => {
    const { falas } = await conversaComModeloTeimoso(5, () => "Ainda não sei quanto posso investir.");

    // 1ª vez: a pergunta sai como o modelo escreveu. O freio não censura a
    // primeira pergunta — perguntar é o trabalho.
    expect(falas[0]).toBe(PERGUNTA_DA_FAIXA);

    // A partir daí, NUNCA MAIS a mesma frase. Este é o número que importa:
    // o modelo mandou a mesma pergunta 5 vezes; o cliente recebeu 1.
    const quantasVezesSaiuIgual = falas.filter((f) => f === PERGUNTA_DA_FAIXA).length;
    expect(quantasVezesSaiuIgual).toBe(1);

    // E a pergunta (não a frase — a PERGUNTA) sai no máximo duas vezes,
    // que é a régua importada de `pergunta-sem-encaixe.ts`.
    const vezesQuePerguntouAFaixa = falas.filter((f) => identificarPergunta(f) === "budget_range").length;
    expect(vezesQuePerguntouAFaixa).toBeLessThanOrEqual(LIMITE_DE_INSISTENCIA);
  });

  it("a 2ª vez ADMITE que a casa não entendeu e oferece uma saída — não é a mesma frase com sinônimos", async () => {
    const { falas } = await conversaComModeloTeimoso(2, () => "Não sei o valor.");

    expect(falas[1]).not.toBe(falas[0]);
    // As duas metades da reformulação: admitir e abrir a porta de saída.
    expect(falas[1]).toMatch(/desculpa|acho que não fui claro|culpa é minha/i);
    expect(falas[1]).toMatch(/não sei|preferir não dizer/i);
  });

  it("a 3ª vez NÃO EXISTE — e a instrução gêmea é que a conversa AVANÇA, não que ela cala", async () => {
    const CRU = "Prefiro não falar de dinheiro agora, quero entender o serviço primeiro.";
    const { falas, escopos } = await conversaComModeloTeimoso(3, (i) => (i === 2 ? CRU : "Não sei."));

    const terceira = falas[2];

    // A PROIBIÇÃO: nem a frase original, nem a reformulação, nem a pergunta.
    expect(terceira).not.toBe(PERGUNTA_DA_FAIXA);
    expect(terceira).not.toBe(falas[1]);
    expect(identificarPergunta(terceira)).not.toBe("budget_range");

    // A INSTRUÇÃO GÊMEA, metade 1 — a conversa ANDA. Fala não-vazia, e ela
    // pergunta outra coisa ou fecha a sondagem. Silêncio seria pior que a
    // repetição: o cliente ficaria olhando uma tela muda.
    expect(terceira.trim().length).toBeGreaterThan(40);
    expect(/\?|resumo do seu pedido/i.test(terceira)).toBe(true);

    // A INSTRUÇÃO GÊMEA, metade 2 — o que o cliente disse NÃO é descartado em
    // silêncio: vira lacuna, com as palavras DELE, cruas.
    const lacunas = escopos[2].lacunasDeEscopo as { id: string; oQueOClienteDisse: string }[] | undefined;
    expect(lacunas).toBeDefined();
    const minha = lacunas?.find((l) => l.id === "sem_encaixe:budget_range");
    expect(minha).toBeDefined();
    expect(minha?.oQueOClienteDisse).toContain("Prefiro não falar de dinheiro");
  });

  it("HISTÓRICO ENCURTADO NÃO ZERA O CONTADOR — a casa também conta pela memória dela", async () => {
    // O ataque óbvio contra um contador que só olha o corpo da requisição:
    // o cliente reenvia a conversa SEM as falas anteriores do SDR. Aqui o
    // banco lembra o que a casa já disse, e o maior dos dois números manda.
    db.portalMessage.findMany.mockResolvedValue([
      { body: PERGUNTA_DA_FAIXA },
      { body: PERGUNTA_DA_FAIXA },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo(PERGUNTA_DA_FAIXA)));

    // `messages: []` — o cliente jurou que a conversa está começando agora.
    const res = await chamar({ messages: [], currentMessage: "não sei", scope: {}, sessionId: "s-laco" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.reply).not.toBe(PERGUNTA_DA_FAIXA);
    expect(identificarPergunta(corpo.reply)).not.toBe("budget_range");
  });
});

// ── O GUARDA DE PREÇO BARRA A FALA, NÃO A CONVERSA ──────────────────────────
//
// Medido em produção: `price_leak ×1` por rodada, e a conversa PARAVA ali —
// `{ok:false}`, turno perdido. O guarda está certo e não afrouxou; o que mudou
// é o desfecho.

describe("o guarda de preço dá segunda chance à fala, e continua estrito", () => {
  it("fala com preço é refeita SEM preço e o turno é entregue", async () => {
    const COTACAO = "Pelo que você me contou, fica R$ 1.200 por mês. Fechado?";
    const LIMPA = "Perfeito! Anotei sua faixa de investimento. Qual é o objetivo principal do negócio agora?";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respostaDoModelo(COTACAO, { businessName: "Farol 27" }))
      .mockResolvedValueOnce(respostaDoModelo(LIMPA, { businessName: "Farol 27" }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await chamar({ messages: [], currentMessage: "quanto fica?", scope: {}, sessionId: "s-preco" });
    const corpo = await res.json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(corpo.ok).toBe(true);
    expect(corpo.reply).toBe(LIMPA);
    // A fala barrada continua no diário — é erro do agente e é o que mais
    // interessa auditar. O que não acontece mais é a conversa morrer com ela.
    const linhas = (db.portalMessage.create.mock.calls as unknown as Array<[{ data: { body: string } }]>).map((c) => c[0].data.body);
    expect(linhas.some((b) => b.includes("price_leak_refeito"))).toBe(true);
    // E o texto barrado NUNCA é gravado: gravar o que o guarda impediu de sair
    // seria contrabando.
    expect(linhas.some((b) => b.includes("1.200"))).toBe(false);
  });

  it("vazou preço NA SEGUNDA TAMBÉM: o turno é barrado como sempre foi — chance, não perdão", async () => {
    const COTACAO = "Fica R$ 1.200 por mês.";
    const OUTRA_COTACAO = "Na verdade fica R$ 900 por mês, com desconto.";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(respostaDoModelo(COTACAO, { businessName: "Farol 27" }))
      .mockResolvedValueOnce(respostaDoModelo(OUTRA_COTACAO, { businessName: "Farol 27" })));

    const res = await chamar({ messages: [], currentMessage: "quanto fica?", scope: {}, sessionId: "s-preco-2" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("price_leak");
    // O escopo do cliente sobrevive: o preço vazou na FALA, e o dado que ele
    // deu não tem culpa nenhuma no erro do agente.
    expect(corpo.scope?.businessName).toBe("Farol 27");
  });
});

// ── AS FRASES QUE A PRODUÇÃO DE FATO ESCREVEU ───────────────────────────────
//
// ⚠️ ESTE BLOCO É O QUE IMPEDE O DEFEITO DE VOLTAR PELA PORTA DOS FUNDOS, e ele
// nasceu de um furo real: o padrão de `publico_alvo` aceitava só o plural
// (`(os\s+)?clientes`), e a frase que a produção escreve é *"Quem é o cliente
// típico de vocês?"* — singular. `identificarPergunta` devolvia `null`, a
// pergunta não era contada, e ela apareceu TRÊS vezes na mesma conversa DEPOIS
// do freio estar no ar. O freio funcionava; o reconhecedor é que não
// reconhecia.
//
// A lição, e por isso as strings abaixo são cópias LITERAIS do que saiu em
// produção em 24/08/2026, não paráfrases: um classificador escrito de memória
// mede a frase que o autor imaginou, não a que o modelo escreve. Ao acrescentar
// uma pergunta nova a `PERGUNTAS`, cole aqui uma fala REAL dela.

describe("o reconhecedor mede a frase que a produção escreve, não a que imaginamos", () => {
  const REAIS: [string, string][] = [
    ["publico_alvo", "Quem é o cliente típico de vocês? Me descreve em uma frase."],
    ["publico_alvo", "Mas me diz uma coisa pra eu montar a proposta certa: quem é o cliente que vocês querem atingir com esse clube?"],
    ["publico_alvo", "Pra eu montar a estratégia certa pro seu clube: qual é o público que você quer atingir?"],
    ["canais_sociais", "Você já tem Instagram ou outras redes onde posta sobre o negócio?"],
    ["canais_sociais", "A Farol 27 tem Instagram hoje, ou vocês querem começar lá?"],
    ["prospect_name_biz", "Me conta — qual é o seu nome e o nome do seu negócio?"],
    ["budget_range", "Você tem uma ideia de quanto está confortável investir mensalmente?"],
    ["material_pronto", "Vocês já têm fotos da cafeteria prontas, ou a gente tira tudo do zero?"],
    ["prazo", "Quando você pensa em lançar esse clube — próximas semanas, este mês?"],
  ];

  for (const [id, fala] of REAIS) {
    it(`"${fala.slice(0, 48)}…" é ${id}`, () => {
      expect(identificarPergunta(fala)).toBe(id);
    });
  }

  it("uma fala que NÃO pergunta nada não é pergunta nenhuma — o freio não barra no escuro", () => {
    expect(identificarPergunta("Anotei seu WhatsApp, Ana. 😊")).toBeNull();
    expect(identificarPergunta("Que legal, uma cafeteria de bairro em Salvador é bacana demais.")).toBeNull();
  });
});
