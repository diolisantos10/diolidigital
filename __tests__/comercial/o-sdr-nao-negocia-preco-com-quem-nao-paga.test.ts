// O SDR DA PÁGINA DO ORÇAMENTO NÃO NEGOCIA PREÇO COM QUEM NÃO PAGA.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ESTE TESTE VAI PELA ROTA, E NÃO PELA FUNÇÃO
// ═══════════════════════════════════════════════════════════════════════════
//
// `contextoDaNegociacao({ isento })` é fácil de provar sozinha — e provar só
// isso seria a oitava lição desta casa desperdiçada: o `?convite=` chegava ao
// navegador e morria ali, com as duas metades provadas em separado e o fio
// entre elas inexistente. *A pergunta obrigatória é "quem CHAMA isto?"*
//
// Então aqui a régua olha **o que sai para o modelo**: a rota de verdade
// (`POST /api/sdr/chat`, contexto `negociacao`) resolve o token, deriva o
// `clientId`, pergunta a parceria ao banco e monta o prompt. O `fetch` é
// dublado e o SYSTEM que ele receberia é capturado. Nenhuma chamada paga.
//
// O que está sendo protegido: um SDR que ofereça "um plano mais barato" a um
// parceiro isento está dizendo a ele que existe uma conta a pagar — e a casa
// acabou de prometer, na mesma tela, que não existe.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const AGORA = new Date("2026-08-27T12:00:00.000Z");
const DAQUI_A_UM_ANO = new Date("2027-08-27T00:00:00.000Z");
const VENCEU_ONTEM = new Date("2026-08-26T00:00:00.000Z");

const estado = vi.hoisted(() => ({ parceria: null as null | Record<string, unknown> }));

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn(async () => []) },
  portalMessage: { create: vi.fn(async () => ({})), findFirst: vi.fn(async () => null) },
  clientRequestDb: {
    findUnique: vi.fn(async () => ({
      id: "pedido-1",
      clientId: "cliente-parceiro",
      businessName: "Foocci",
      status: "proposal_pending",
      // R$ 790/mês é o Plano Conteúdo da tabela — é o que faz a rota achar o
      // serviço e, no caminho do pagante, montar o cardápio de degraus.
      briefingJson: JSON.stringify({
        estimate: { totalMin: 790, totalMax: 790, items: [{ label: "8 posts/mês" }] },
      }),
    })),
    findFirst: vi.fn(async () => null),
  },
  parceriaDoCliente: { findUnique: vi.fn(async () => estado.parceria) },
  rateLimitBucket: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async () => ({})),
    findUnique: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const chaveDeRotaPublica = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/chave-publica", () => ({
  chaveDeRotaPublica,
  workspaceDaRotaPublica: async () => "ws-de-teste",
  primeiraChaveDeRotaPublica: async () => ({ provider: "claude", chave: { apiKey: "k", source: "db", model: null } }),
  chavesDeRotaPublica: async () => [{ provider: "claude", chave: { apiKey: "k", source: "db", model: null } }],
}));

vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  validatePortalAccess: vi.fn(async () => ({
    valid: true,
    record: { clientRequestId: "pedido-1", clientId: "cliente-parceiro" },
  })),
}));

vi.mock("@/lib/agency/esteira/aviso-de-agendamento-manual", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  avisoDeAgendamentoManual: vi.fn(async () => null),
}));

const { POST } = await import("@/app/api/sdr/chat/route");

/** O QUE O MODELO RECEBERIA. É esta string que o teste mede. */
let sistemaEnviado = "";

function dublarModelo() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body ?? "{}")) as { system?: unknown };
      sistemaEnviado = typeof corpo.system === "string" ? corpo.system : JSON.stringify(corpo.system ?? "");
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: JSON.stringify({ reply: "Claro, me conta o que precisa mudar." }) }],
          stop_reason: "end_turn",
        }),
      };
    }),
  );
}

async function conversar() {
  sistemaEnviado = "";
  dublarModelo();
  await POST(
    new NextRequest("http://localhost/api/sdr/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [],
        currentMessage: "achei caro",
        sessionId: `sess-${Math.random()}`,
        contexto: "negociacao",
        propostaToken: "tok-1",
      }),
    }),
  );
  expect(sistemaEnviado, "o modelo nem chegou a ser chamado — o teste não mediu nada").not.toBe("");
  return sistemaEnviado;
}

function parceriaNoBanco(over: Record<string, unknown> = {}) {
  return {
    clientId: "cliente-parceiro",
    autorizadaPor: "Dioli (CEO)",
    validaAte: DAQUI_A_UM_ANO,
    escopo: "8 posts por mês para a Foocci",
    pecasContratadas: 8,
    tetoDeIaCentavosUsd: 2000,
    revogadaEm: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
  estado.parceria = null;
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "k", source: "db", model: null });
});

describe("⚠️ O FIO ENTRE A ROTA E O CONTEXTO DO SDR", () => {
  it("MATA A MUTAÇÃO: a rota para de perguntar a parceria e o SDR volta a vender degrau", async () => {
    estado.parceria = parceriaNoBanco();
    const sistema = await conversar();

    expect(sistema, "o prompt não diz ao SDR que este cliente não paga").toContain("NÃO PAGA NADA");
    expect(sistema).toContain("O ASSUNTO É O ESCOPO");
    // ⛔ O cardápio de degraus não pode estar na janela: com ele à vista, o SDR
    // oferece um plano mais barato a quem não paga nada.
    expect(sistema, "o cardápio de degraus continua na janela do modelo").not.toContain(
      "OFERECER O DEGRAU DE BAIXO",
    );
  });

  it("parceria VENCIDA: o SDR é o de sempre, com piso e degraus", async () => {
    estado.parceria = parceriaNoBanco({ validaAte: VENCEU_ONTEM });
    const sistema = await conversar();
    expect(sistema, "parceria vencida desligou a negociação de preço").not.toContain("NÃO PAGA NADA");
    expect(sistema).toContain("OFERECER O DEGRAU DE BAIXO");
  });

  it("cliente PAGANTE: nada mudou — degraus e proibição de desconto continuam de pé", async () => {
    estado.parceria = null;
    const sistema = await conversar();
    expect(sistema).toContain("OFERECER O DEGRAU DE BAIXO");
    expect(sistema).toContain("VOCÊ NÃO PODE DAR DESCONTO");
    expect(sistema).not.toContain("NÃO PAGA NADA");
  });
});
