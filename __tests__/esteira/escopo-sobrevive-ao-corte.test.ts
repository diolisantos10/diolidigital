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
// Este arquivo guarda o que fecha esse buraco:
//
//   1. `stop_reason: "max_tokens"` (a própria API dizendo que cortou) é
//      distinguido de um JSON que terminou de ser escrito e ainda assim não
//      é JSON válido — motivos diferentes, ações diferentes ("truncado" vs
//      "malformado").
//   2. `extractJson` falhando não é mais o fim da linha: o servidor tenta
//      fechar à força o que ficou aberto antes de desistir
//      (`repararJsonTruncado`).
//   3. Quando isso recupera um `scope` mas não uma `reply` confiável, o
//      escopo viaja mesmo com `ok: false` — o número que o cliente falou uma
//      vez, ninguém recupera; a fala, o motor de regras refaz.
//   4. O escopo recuperado passa pelas MESMAS travas de sempre — nada entra
//      por atalho só por ter vindo de um pacote remendado.
//
// O guarda NÃO afrouxa: pacote genuinamente ilegível continua sem soltar
// nada, e pacote limpo continua passando inteiro, sem o reparo inventar
// problema onde não há.
//
// ── RECONCILIAÇÃO DE 16/08 ──────────────────────────────────────────────────
// Três sessões consertaram este mesmo defeito em paralelo. Este arquivo, no
// merge do `pm`, ganhou mais dois achados que a base acima não tinha:
//
//   5. TETO_DO_REPARO — parecer do `seguranca`: teto de tamanho fixo DENTRO
//      de `repararJsonTruncado`, que não depende do `max_tokens` do
//      chamador (rota pública, sem sessão, com dois `.replace()` O(n²)).
//   6. Valor BARE truncado (número, true/false/null) — parecer do
//      `qualidade`: um dígito cortado não tem marca de truncamento nenhuma e
//      sobrevivia como um número plausível-e-errado (`1` no lugar de `14`).
//
// Este arquivo NÃO repete a cobertura de
// `__tests__/comercial/pacote-cortado-nao-leva-o-escopo.test.ts` (que continua
// a fonte da verdade para "pacote cortado não leva o escopo junto").

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

import { POST, repararJsonTruncado } from "@/app/api/sdr/chat/route";

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
    // ── A FAIXA: o rótulo do modelo morre, o NÚMERO DO CLIENTE decide ──────
    //
    // Esta linha exigia `undefined`, e exigia por um motivo certo: "R$ 999" não
    // é rótulo da allowlist, e rótulo inventado tem de sumir. Isso continua
    // valendo — e a asserção ficou mais afiada em 26/08/2026.
    //
    // A fala do cliente aqui é *"quanto custa? quero 2 posts por dia, uns
    // **R$ 500** por mês"*. Ele DISSE um número. Desde a 6ª rodada a faixa é
    // derivada dele (`faixaDoTexto`), porque a allowlist responde "este rótulo
    // existe?" e a pergunta que importa é "este rótulo é o do número que ele
    // disse?" — medido em produção com um cliente que declarou R$ 900 e teve
    // R$ 500 gravado como teto.
    //
    // Então o que se afirma agora é mais forte que "o campo some": o palpite do
    // modelo é descartado E o que ele mesmo declarou é guardado.
    expect(corpo.scope.budgetRange).not.toBe("R$ 999");
    expect(corpo.scope.budgetRange).toBe("entre R$ 150 e R$ 500");

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

// ── ENXERTO 1 — TETO_DO_REPARO ───────────────────────────────────────────────

describe("TETO_DO_REPARO — parecer do `seguranca`", () => {
  it("entrada absurdamente grande é descartada pelo teto de tamanho, sem varrer nada", () => {
    const enorme = '{"scope":{"x":"' + "a".repeat(25_000);
    expect(repararJsonTruncado(enorme)).toBeNull();
  });

  it("entrada dentro do teto continua sendo reparada normalmente", () => {
    const dentroDoTeto = '{"scope":{"businessName":"Ana Doces"';
    const reparado = repararJsonTruncado(dentroDoTeto);
    expect(reparado).not.toBeNull();
    expect((reparado!.scope as Record<string, unknown>).businessName).toBe("Ana Doces");
  });

  it("o teto não depende do max_tokens do chamador — vale mesmo se a rota subir de novo", () => {
    // O teto mora na função (20_000), bem acima do max_tokens atual (3000)
    // mas fixo por si só: não é um múltiplo nem uma fração de max_tokens.
    const textoDe19999Chars = '{"scope":{"x":"' + "a".repeat(19_960);
    expect(textoDe19999Chars.length).toBeLessThan(20_000);
    // Não é bem formado (string nunca fecha em chave real), mas passa do teto
    // e chega a tentar o reparo — não é descartado ANTES de olhar o conteúdo.
    const resultado = repararJsonTruncado(textoDe19999Chars);
    expect(resultado).not.toBeNull();
  });
});

// ── ENXERTO 2 — valor BARE truncado ──────────────────────────────────────────

describe("repararJsonTruncado — valor bare truncado não sobrevive como número plausível-e-errado", () => {
  it("número cortado no MEIO (1 de 14, sem delimitador depois) descarta o campo inteiro", () => {
    // Corte exatamente como o incidente real: depois do PRIMEIRO dígito de 14.
    const cortado = '{"scope":{"social":{"postsPerWeek":1';
    const reparado = repararJsonTruncado(cortado);

    expect(reparado).not.toBeNull();
    const social = (reparado!.scope as Record<string, unknown>).social as Record<string, unknown>;
    // O campo some inteiro — nunca vira 1, nunca vira 14 adivinhado.
    expect(Object.hasOwn(social, "postsPerWeek")).toBe(false);
  });

  it("número COMPLETO, seguido de delimitador que o próprio modelo escreveu (}), sobrevive intacto", () => {
    // O "}" que fecha `social` já veio na resposta: prova que o 14 terminou
    // ali. Esta é a metade que NÃO pode virar baixa.
    const completo = '{"scope":{"social":{"postsPerWeek":14}';
    const reparado = repararJsonTruncado(completo);

    expect(reparado).not.toBeNull();
    const social = (reparado!.scope as Record<string, unknown>).social as Record<string, unknown>;
    expect(social.postsPerWeek).toBe(14);
  });

  it("true/false/null cortados no fim, sem delimitador depois, também descartam o campo", () => {
    const cortadoTrue = '{"scope":{"decisionMaker":tru';
    const cortadoFalse = '{"scope":{"branding":{"requested":fals';
    const cortadoNull = '{"scope":{"deadline":nul';

    const rTrue = repararJsonTruncado(cortadoTrue);
    expect(rTrue).not.toBeNull();
    expect(Object.hasOwn(rTrue!.scope as Record<string, unknown>, "decisionMaker")).toBe(false);

    const rFalse = repararJsonTruncado(cortadoFalse);
    expect(rFalse).not.toBeNull();
    const branding = (rFalse!.scope as Record<string, unknown>).branding as Record<string, unknown>;
    expect(Object.hasOwn(branding, "requested")).toBe(false);

    const rNull = repararJsonTruncado(cortadoNull);
    expect(rNull).not.toBeNull();
    expect(Object.hasOwn(rNull!.scope as Record<string, unknown>, "deadline")).toBe(false);
  });

  it("true/false/null COMPLETOS, seguidos de delimitador do próprio modelo, sobrevivem intactos", () => {
    const completoTrue = '{"scope":{"decisionMaker":true}';
    const completoFalse = '{"scope":{"branding":{"requested":false}}';
    const completoNull = '{"scope":{"deadline":null}';

    expect((repararJsonTruncado(completoTrue)!.scope as Record<string, unknown>).decisionMaker).toBe(true);
    const branding = (repararJsonTruncado(completoFalse)!.scope as Record<string, unknown>).branding as Record<
      string,
      unknown
    >;
    expect(branding.requested).toBe(false);
    expect((repararJsonTruncado(completoNull)!.scope as Record<string, unknown>).deadline).toBeNull();
  });

  it("via POST: o corte real do incidente (1 de 14) some do scope devolvido, não vira 1 chutado", async () => {
    const textoCortado = '{"scope":{"prospectName":"Ana","social":{"postsPerWeek":1';
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(textoCortado, "max_tokens")));

    const res = await chamar({ messages: [], currentMessage: "2 posts por dia", sessionId: "s-bare-1" });
    const corpo = await res.json();

    expect(corpo.ok).toBe(false);
    expect(corpo.scope.prospectName).toBe("Ana");
    expect((corpo.scope.social as Record<string, unknown> | undefined)?.postsPerWeek).toBeUndefined();
  });
});

// ── ENXERTO 3 — o desfecho do escopo aparece no diário ───────────────────────
//
// REGRA DERRUBADA NA RECONCILIAÇÃO DE 16/08: a base original destes testes
// media o desfecho por um SUFIXO no `motivoDaRecusa` gravado
// (`parse_error_truncado_escopo_salvo` / `_escopo_perdido`), produzido por uma
// função `comDesfechoDoEscopo` que só era chamada nos dois returns de
// `parse_error`. O `pm`, na reconciliação, escolheu manter o campo
// ESTRUTURADO que já existia no lado vencedor — `escopoFoiSalvo?: boolean` em
// `TurnoDoSdr` — e removeu `comDesfechoDoEscopo` por ser, a partir daí, código
// sem chamador (D-003). Os testes abaixo foram reescritos para medir o que o
// código faz de verdade: a frase em português que `registro-da-conversa.ts`
// acrescenta ao corpo gravado quando `escopoFoiSalvo` é `true`, e o `reason`
// devolvido ao cliente nos rótulos canônicos (`truncado`/`malformado`, sem
// prefixo `parse_error_`). Também corrigido: o campo é aplicado pelo MESMO
// mecanismo em QUALQUER guarda que tenha escopo à mão (`truncado`,
// `malformado`, `email_hallucination`, `price_leak`) — não só nos dois
// motivos de parse, que era a suposição do teste original.

const FRASE_ESCOPO_SALVO = "O escopo (o que o cliente já tinha dito) foi salvo mesmo assim.";

describe("o desfecho do escopo aparece no diário como frase, não como sufixo de motivo", () => {
  it("scope recuperado com conteúdo mas reply vazia grava a frase de escopo salvo — nos dois motivos de parse", async () => {
    const textoReplyVazia = JSON.stringify({
      reply: "",
      needsClarification: false,
      scope: { prospectName: "Ana Paula", social: { postsPerWeek: 14 } },
    });

    // Variante truncado (stop_reason max_tokens).
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(textoReplyVazia, "max_tokens")));
    const resTruncado = await chamar({ messages: [], currentMessage: "2 posts por dia", sessionId: "s-salvo-truncado" });
    const corpoTruncado = await resTruncado.json();

    expect(corpoTruncado.ok).toBe(false);
    expect(corpoTruncado.reason).toBe("truncado"); // rótulo canônico, sem prefixo nem sufixo
    expect(corpoTruncado.scope.social).toMatchObject({ postsPerWeek: 14 });
    const linhaTruncado = gravadas().find((l) => l.body.includes("truncado"));
    expect(linhaTruncado?.body).toContain(FRASE_ESCOPO_SALVO);

    vi.clearAllMocks();
    chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
    db.portalMessage.create.mockResolvedValue({});
    db.portalMessage.findFirst.mockResolvedValue(null);
    db.clientRequestDb.findUnique.mockResolvedValue(null);

    // Mesmo pacote, variante formato (stop_reason que não é max_tokens) — cai
    // no rótulo "malformado", não "formato" (a casa só tem os dois rótulos).
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(textoReplyVazia, "end_turn")));
    const resFormato = await chamar({ messages: [], currentMessage: "2 posts por dia", sessionId: "s-salvo-formato" });
    const corpoFormato = await resFormato.json();

    expect(corpoFormato.reason).toBe("malformado");
    const linhaFormato = gravadas().find((l) => l.body.includes("malformado"));
    expect(linhaFormato?.body).toContain(FRASE_ESCOPO_SALVO);
  });

  it("corte dentro da FALA, antes de `scope` sequer existir, NÃO grava a frase — não há dado nenhum para salvar", async () => {
    // Aqui sim o corte é real: nada depois de `reply` chegou a abrir.
    const textoSemEscopo = '{"reply":"Perfeito! Me conta mais sobre o seu neg';
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(textoSemEscopo, "max_tokens")));
    const res = await chamar({ messages: [], currentMessage: "quero social media", sessionId: "s-desfecho-perdido" });
    const corpo = await res.json();

    expect(corpo.reason).toBe("truncado");
    expect(corpo.reply).toBeUndefined();
    const linha = gravadas().find((l) => l.body.includes("truncado"));
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
  });

  it("scope existe mas o guarda (prospectEmail) descarta por completo: sem a frase de escopo salvo", async () => {
    // Desfecho tem de refletir o que SOBROU do saneamento, não o que chegou
    // bruto no `scope` — por isso reply vazia + único campo é o que o guarda
    // sempre apaga.
    const textoSoFiltrado = JSON.stringify({
      reply: "",
      needsClarification: false,
      scope: { prospectEmail: "ana@exemplo.com" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(textoSoFiltrado, "end_turn")));
    await chamar({ messages: [], currentMessage: "meu email é ana@exemplo.com", sessionId: "s-desfecho-filtrado" });

    const linha = gravadas().find((l) => l.body.includes("malformado"));
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
  });

  it("nenhum objeto sequer se formou (parsed === null): sempre sem a frase de escopo salvo", async () => {
    const textoQuebrado = '{"reply" "sem dois pontos"}';
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(textoQuebrado, "end_turn")));
    await chamar({ messages: [], currentMessage: "oi", sessionId: "s-desfecho-sem-parse" });

    const linha = gravadas().find((l) => l.body.includes("malformado"));
    expect(linha?.body).not.toContain(FRASE_ESCOPO_SALVO);
  });

  it("motivos que NÃO são de parse (price_leak) também ganham a frase quando há escopo salvo — o mecanismo é o mesmo em qualquer guarda", async () => {
    // JSON válido, com fala vazando preço: cai no guarda de preço, não no de
    // parse. A suposição original era que só os dois returns de parse_error
    // ganhavam o sufixo; o campo estruturado não faz essa distinção — ele
    // reflete se sobrou escopo utilizável, ponto, e isso é uma correção
    // deliberada em relação ao comportamento antigo.
    const textoComPreco = JSON.stringify({
      reply: "Fechado! Fica R$ 500 por mês.",
      needsClarification: false,
      scope: { prospectName: "Ana" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => respostaBruta(textoComPreco, "end_turn")));
    await chamar({ messages: [], currentMessage: "quanto custa?", sessionId: "s-price-leak-desfecho" });

    const linha = gravadas().find((l) => l.body.includes("price_leak"));
    expect(linha?.body).toContain("price_leak");
    expect(linha?.body).toContain(FRASE_ESCOPO_SALVO);
  });
});
