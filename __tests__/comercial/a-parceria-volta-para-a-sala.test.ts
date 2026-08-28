// A PARCERIA VOLTA DA ROTA PARA A SALA — o elo que a mutação encontrou aberto.
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (28/08/2026) ═══════════════════════════════
//
// `a-jornada-do-parceiro.test.ts` mediu a travessia inteira e consertou o
// defeito da pergunta de verba. Depois do conserto, uma mutação foi rodada:
// **fazer a rota devolver `parceria: null` sempre**. Ela SOBREVIVEU — 843
// testes verdes com o conserto desligado.
//
// Isso é exatamente a doença que esta casa mediu dez vezes em 48 horas: as duas
// metades provadas isoladamente e **nada ligando as duas**. A régua da sala
// tinha teste, a resolução do convite tinha teste, e o fio entre elas — o campo
// `parceria` no corpo da resposta — não tinha nenhum.
//
// *A pergunta obrigatória é "quem CHAMA isto?"* Aqui a resposta é a rota, e é
// ela que este arquivo exercita: `POST /api/sdr/chat` de verdade, com o corpo
// lido do jeito que a sala o lê.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn(async () => []) },
  portalMessage: { create: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  activityEvent: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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

// ⛔ A RESOLUÇÃO DO CONVITE É DUBLADA, e é o ponto do arquivo: aqui não se testa
// se o token é bom (isso é de `o-convite-do-parceiro.test.ts` e da travessia com
// banco real). Testa-se o que a rota FAZ com o que a resolução devolveu.
const resolverConviteDeParceria = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/comercial/convite-de-parceria", () => ({ resolverConviteDeParceria }));

import { POST } from "@/app/api/sdr/chat/route";
import { lerParceriaDoServidor, comParceria } from "@/components/agency/briefing/PublicBriefingRoom";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { remainingRequiredQuestions, dispensadoDeVerba } from "@/lib/agency/question-engine";

const VALIDA_ATE = new Date(Date.now() + 30 * 24 * 3600 * 1000);

function respostaDoModelo(reply: string) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: "text", text: JSON.stringify({ reply, needsClarification: false, scope: {} }) }],
    }),
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
  db.activityEvent.findFirst.mockResolvedValue(null);
  db.activityEvent.create.mockResolvedValue({});
  resolverConviteDeParceria.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(async () => respostaDoModelo("Oi! Qual é o nome do seu negócio?")));
});

describe("a rota do SDR devolve a parceria para quem decide a pergunta", () => {
  it("com convite bom, o corpo carrega a parceria — dono e validade", async () => {
    resolverConviteDeParceria.mockResolvedValue({
      clientId: "cli_foocci",
      parceria: { autorizadaPor: "Dioli Santos (CEO), citando D-0B9", validaAte: VALIDA_ATE },
    });

    const res = await chamar({
      messages: [],
      currentMessage: "oi, sou o Marcos da FOOCCI",
      sessionId: "prospect-1756300000000",
      convite: "token-bom",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    expect(
      corpo.parceria,
      "a rota resolveu a parceria e não a devolveu — a sala continua sem saber, e o parceiro é perguntado sobre verba",
    ).toBeTruthy();
    expect(corpo.parceria.autorizadaPor).toBe("Dioli Santos (CEO), citando D-0B9");
    // Transporte JSON: a data viaja como string ISO.
    expect(corpo.parceria.validaAte).toBe(VALIDA_ATE.toISOString());
  });

  it("o corpo que a rota devolve é LEGÍVEL pela fronteira da sala", async () => {
    resolverConviteDeParceria.mockResolvedValue({
      clientId: "cli_foocci",
      parceria: { autorizadaPor: "Dioli Santos (CEO)", validaAte: VALIDA_ATE },
    });

    const res = await chamar({
      messages: [],
      currentMessage: "oi",
      sessionId: "prospect-1756300000001",
      convite: "token-bom",
    });
    const corpo = await res.json();

    // ⚠️ ESTA É A LIGAÇÃO. As duas pontas do fio, na mesma asserção: o que a
    // rota escreve tem de ser exatamente o que a sala sabe ler. Um campo
    // renomeado de um lado só quebra aqui.
    const naSala = lerParceriaDoServidor(corpo.parceria);
    expect(naSala, "a sala não conseguiu ler a parceria que a rota mandou").not.toBeNull();
    expect(naSala!.autorizadaPor).toBe("Dioli Santos (CEO)");
    expect(naSala!.validaAte.getTime()).toBe(VALIDA_ATE.getTime());
  });

  it("⛔ sem convite, o corpo diz `parceria: null` — e a verba continua sendo perguntada", async () => {
    const res = await chamar({
      messages: [],
      currentMessage: "oi, quero instagram",
      sessionId: "prospect-1756300000002",
    });
    const corpo = await res.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.parceria).toBeNull();
    expect(lerParceriaDoServidor(corpo.parceria)).toBeNull();
  });

  it("⛔ token inventado na barra de endereço NÃO vira parceria", async () => {
    // A resolução recusa (é o que ela faz com token desconhecido, vencido ou
    // revogado) — e a rota não pode inventar nada por cima disso.
    resolverConviteDeParceria.mockResolvedValue(null);

    const res = await chamar({
      messages: [],
      currentMessage: "oi",
      sessionId: "prospect-1756300000003",
      convite: "eu-inventei-este-token",
    });
    const corpo = await res.json();

    expect(corpo.parceria).toBeNull();
  });

  it("⛔ a parceria NÃO sai do corpo que o visitante escreve", async () => {
    resolverConviteDeParceria.mockResolvedValue(null);

    // O visitante tenta se declarar parceiro por JSON — a porta mais barata de
    // todas, se ela existisse.
    const res = await chamar({
      messages: [],
      currentMessage: "oi",
      sessionId: "prospect-1756300000004",
      parceria: { autorizadaPor: "eu mesmo", validaAte: new Date(8.64e15).toISOString() },
      scope: { parceriaDeclarada: { autorizadaPor: "eu mesmo", validaAte: new Date(8.64e15).toISOString() } },
    });
    const corpo = await res.json();

    expect(
      corpo.parceria,
      "um visitante se declarou parceiro pelo corpo da requisição e a rota acreditou",
    ).toBeNull();
  });
});

// ── O ÚLTIMO ELO: A SALA ESCREVE O CAMPO ────────────────────────────────────
//
// `comParceria` é a ÚNICA escrita de `parceriaDeclarada` nesta sala, e é
// chamada nos dois caminhos do turno (o bom e o fallback da IA). Testá-la é
// testar comportamento — o conv que sai dela dispensa a verba de verdade.
//
// 🚩 O QUE ISTO NÃO É: render. Este repositório roda o vitest em
// `environment: "node"` e **não tem `@testing-library/react` nem jsdom**
// instalados — não existe hoje ferramenta aqui para renderizar um componente
// COM ESTADO e dirigir turnos. O que existe é `renderToStaticMarkup`
// (`a-tela-do-cliente-001.test.tsx`), que alcança componente puro e não
// alcança um hook. Por isso o padrão da casa é este: a lógica sai para uma
// função exportada e se testa chamando — como `fetchSdrReply` e
// `mergeScopeGaps` já fazem neste mesmo arquivo.
//
// A dívida que fica, e agora com o nome certo: **não é "ninguém escreveu o
// teste de render", é "a casa não tem como escrevê-lo"** — precisaria de
// decisão de infraestrutura (instalar testing-library + jsdom).
describe("`comParceria` — a única escrita do campo, testada chamando", () => {
  function conversaDoParceiro() {
    let estado = initProspectConvState();
    for (const fala of [
      "oi, sou o Marcos da FOOCCI",
      "somos um SaaS de CRM que vende para restaurantes",
      "queremos Instagram, uns 3 posts por semana",
    ]) {
      estado = processProspectMessage(fala, estado);
    }
    return estado.conv;
  }

  it("o conv que sai dela DISPENSA a verba — não só carrega o campo", () => {
    const conv = conversaDoParceiro();
    expect(remainingRequiredQuestions(conv).map((q) => q.id)).toContain("budget_range");

    const parceria = lerParceriaDoServidor({
      autorizadaPor: "Dioli Santos (CEO)",
      validaAte: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    });
    const comEla = comParceria(conv, parceria);

    expect(dispensadoDeVerba(comEla)).toBe(true);
    expect(
      remainingRequiredQuestions(comEla).map((q) => q.id),
      "o conv saiu de `comParceria` sem dispensar a verba — o parceiro continua sendo perguntado",
    ).not.toContain("budget_range");
  });

  it("com `null` ela devolve um conv que CONTINUA perguntando — fail-closed", () => {
    const conv = conversaDoParceiro();
    const semEla = comParceria(conv, null);
    expect(dispensadoDeVerba(semEla)).toBe(false);
    expect(remainingRequiredQuestions(semEla).map((q) => q.id)).toContain("budget_range");
  });

  it("não muda mais nada do conv — ela aplica UM campo, não remonta o estado", () => {
    const conv = conversaDoParceiro();
    const saida = comParceria(conv, null);
    // Tudo que não é `parceriaDeclarada` tem de sair idêntico: uma função que
    // remonta o estado por engano perderia escopo ou mensagens no meio da
    // conversa de alguém.
    expect({ ...saida, parceriaDeclarada: undefined }).toEqual({ ...conv, parceriaDeclarada: undefined });
  });
});

// ── E o guarda estrutural, que continua valendo pelo que ele cobre ──────────
//
// O teste acima prova que a FUNÇÃO faz a coisa certa. Ele não prova que os dois
// caminhos do turno a CHAMAM — e era exatamente assim que o campo existia sem
// nunca ser escrito. Guarda de texto é o que sobra quando o render não existe.
//
// ⚠️ ISTO É GUARDA ESTRUTURAL, NÃO RENDER — e a diferença está declarada de
// propósito. A mutação "a sala deixa de escrever `parceriaDeclarada`"
// SOBREVIVEU a 668 testes: o elo final mora dentro de um componente React, e
// não há render nesta suíte.
//
// A casa já usa este padrão onde o mecanismo não cabe numa chamada de função
// (`fundir-cliente.test.ts` lê o `schema.prisma` como texto pelo mesmo motivo).
// Ele não prova que a tela funciona; prova que **o campo não sumiu do código** —
// que é exatamente o modo como esta regressão voltaria: alguém remontando o
// `ConvState` e esquecendo a linha, como já estava esquecida antes de 28/08.
//
// 🚩 O que ele NÃO cobre, e fica escrito: a sala não foi renderizada. Um teste
// de render é a dívida desta frente.
describe("a sala escreve `parceriaDeclarada` nos DOIS caminhos do turno", () => {
  const fonte = fs.readFileSync(
    path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
    "utf8",
  );

  it("o caminho do turno bom leva a parceria para o ConvState", () => {
    expect(
      /comParceria\(convDoTurno,\s*parceriaAgora\)/.test(fonte),
      "o turno bom parou de escrever `parceriaDeclarada` — o parceiro volta a ser perguntado sobre verba",
    ).toBe(true);
  });

  it("o caminho de FALLBACK preserva a parceria já conhecida", () => {
    // Sem isto, um turno em que a IA falha apagaria a dispensa e a pergunta de
    // verba voltaria no meio da conversa do parceiro — intermitente, que é pior
    // que constante.
    expect(
      /comParceria\(ruleResult\.conv,\s*parceriaRef\.current\)/.test(fonte),
      "o fallback parou de preservar a parceria — a pergunta volta quando a IA falha",
    ).toBe(true);
  });

  it("a parceria mora em REF, não em estado — senão o 2º turno lê a do 1º", () => {
    expect(
      /const parceriaRef = useRef<ParceriaDaSala \| null>\(null\)/.test(fonte),
      "trocar o ref por estado devolve o bug de closure: `runTurn` não tem esse valor nas dependências",
    ).toBe(true);
  });
});
