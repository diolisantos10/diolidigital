// O ALARME DE SEM SALDO NUNCA PÔDE DISPARAR — e é por isso que a volta
// anterior não teve arte e ninguém soube por quê.
//
// ⚠️ MEDIDO EM PRODUÇÃO (26/08/2026, `GET /api/pulso`). Com a conta da OpenAI
// E a da Anthropic as duas zeradas, o pulso dizia:
//
//     {"perna":"provedor-de-ia","texto":"openai:  (21x na última hora)"}
//     {"perna":"provedor-de-ia","texto":"claude:  (21x na última hora)"}
//
// O provedor nomeado e **o motivo VAZIO** — e como ESTADO, não como falha. O
// canal que grita (`quebrou`) é alimentado por `precisamDeGente`, que só deixa
// passar `sem_saldo` e `sem_chave`. Nenhuma linha chegava lá.
//
// A causa: `registrarChamadaDeIa` grava a mensagem do provedor na coluna
// **`erro`**, e `provedoresCaidos` lia `fallbackReason ?? outputSummary`.
// `fallbackReason` só existe quando houve reserva; `outputSummary` é nulo numa
// chamada que falhou. Logo o texto era `""` em TODA linha de erro, a
// classificação devolvia `null`, e o alarme escrito em 24/08 — o único que
// existe para acordar quem põe crédito na conta — **nunca pôde disparar, para
// provedor nenhum**.
//
// O dado estava lá o tempo todo, uma coluna ao lado.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({ aIRunLog: { findMany: vi.fn() } }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { provedoresCaidos, precisamDeGente } from "@/lib/ai/falha-de-provedor";

/** As linhas REAIS do livro-caixa de produção, com a forma que elas têm lá. */
const LINHAS_REAIS = [
  {
    provider: "openai",
    erro: "You have no credits remaining. Add credits to continue using the API at "
      + "https://platform.openai.com/settings/organization/billing/.",
    fallbackReason: null,
    outputSummary: null,
    createdAt: new Date("2026-08-26T06:52:50.442Z"),
  },
  {
    provider: "claude",
    erro: 'Claude HTTP 400: {"type":"error","error":{"type":"invalid_request_error",'
      + '"message":"Your credit balance is too low to access the Anthropic API."}}',
    fallbackReason: null,
    outputSummary: null,
    createdAt: new Date("2026-08-26T07:47:34.313Z"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.aIRunLog.findMany.mockResolvedValue(LINHAS_REAIS);
});

describe("o alarme, contra as linhas reais de produção", () => {
  it("🔴 as DUAS contas zeradas acordam gente — antes, nenhuma acordava", () => {
    // Esta é a asserção que a produção reprovou. Antes do conserto,
    // `precisamDeGente` devolvia lista VAZIA para exatamente estas linhas.
    return provedoresCaidos(60).then((caidos) => {
      const gritam = precisamDeGente(caidos);
      expect(gritam.map((c) => c.provider).sort()).toEqual(["claude", "openai"]);
      expect(gritam.every((c) => c.motivo === "sem_saldo")).toBe(true);
    });
  });

  it("🔴 o motivo deixa de sair VAZIO — era literalmente 'openai:  (21x)'", async () => {
    const [primeiro] = await provedoresCaidos(60);
    expect(primeiro!.exemplo.trim().length).toBeGreaterThan(0);
  });

  it("a consulta PEDE a coluna `erro` ao banco", async () => {
    // Sem esta asserção, alguém pode reescrever o `select` e a cegueira volta
    // sem que nenhum outro teste caia — foi exatamente assim que ela durou.
    await provedoresCaidos(60);
    expect(db.aIRunLog.findMany.mock.calls[0]![0].select).toHaveProperty("erro", true);
  });
});

describe("MUTAÇÕES — o alarme continua sabendo ficar calado", () => {
  it("teto de ritmo NÃO acorda ninguém: passa sozinho", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { provider: "openai", erro: "OpenAI HTTP 429", fallbackReason: null, outputSummary: null, createdAt: new Date() },
    ]);
    const caidos = await provedoresCaidos(60);
    expect(caidos[0]!.motivo).toBe("teto_de_ritmo");
    expect(precisamDeGente(caidos)).toEqual([]);
  });

  it("falha que a casa não reconhece não vira sem_saldo — 'não sei' é honesto", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { provider: "deepseek", erro: "Resposta DeepSeek vazia", fallbackReason: null, outputSummary: null, createdAt: new Date() },
    ]);
    const caidos = await provedoresCaidos(60);
    expect(caidos[0]!.motivo).toBeNull();
    expect(precisamDeGente(caidos)).toEqual([]);
  });

  it("o mesmo provedor com DOIS motivos na mesma hora não some — nem o mais grave", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { provider: "openai", erro: "OpenAI HTTP 429", fallbackReason: null, outputSummary: null, createdAt: new Date() },
      { provider: "openai", erro: "OpenAI HTTP 429", fallbackReason: null, outputSummary: null, createdAt: new Date() },
      { provider: "openai", erro: "You have no credits remaining.", fallbackReason: null, outputSummary: null, createdAt: new Date() },
    ]);
    const caidos = await provedoresCaidos(60);
    // O 429 é mais frequente e vem primeiro na ordenação — o sem_saldo não pode
    // ser engolido por isso.
    expect(precisamDeGente(caidos).map((c) => c.motivo)).toEqual(["sem_saldo"]);
  });

  it("banco fora do ar devolve lista vazia sem estourar — e ausência nunca é 'tudo bem'", async () => {
    db.aIRunLog.findMany.mockRejectedValue(new Error("db down"));
    expect(await provedoresCaidos(60)).toEqual([]);
  });
});
