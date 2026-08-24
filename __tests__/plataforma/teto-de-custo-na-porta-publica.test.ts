// O TETO DE GASTO NA PORTA DA RUA — e a armadilha do "teto 0".
//
// ─── O ACHADO (medido em produção, 24/08/2026) ──────────────────────────────
//
// Toda chamada de `/api/sdr/chat` logava `[custo-de-ia] chamada SEM workspace,
// fora da conta`. A rota é PÚBLICA — sem login, sem token — e os dois freios
// que ela tinha (`limite-no-banco.ts`) são de RITMO: quantas chamadas por
// janela. **Ritmo não é dinheiro.** Trinta chamadas por minuto de um prompt de
// ~10.700 tokens custam o que custam, e o teto de ritmo fica verde a fatura
// inteira. Qualquer pessoa na internet queimava a chave paga da casa devagar,
// dentro das regras, e sem aparecer em relatório nenhum.
//
// ─── O ACHADO IRMÃO, DE OUTRO PRODUTO ───────────────────────────────────────
//
// Nesta casa um "teto 0" já foi lido como "sem limite" — porque `if (!teto)`
// trata `0` e `undefined` como a mesma coisa, e eles são fatos opostos: `0` é
// uma ordem ("não gaste nada"), `undefined` é uma ausência. É o cenário que
// mais aparece aqui embaixo, e o `>=` que o resolve está comentado no módulo.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn(async (): Promise<{ custoEstimadoUsd: number | null }[]> => []) },
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
const workspaceDaRotaPublica = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/chave-publica", () => ({
  chaveDeRotaPublica,
  workspaceDaRotaPublica,
  primeiraChaveDeRotaPublica: async () => {
    const chave = await chaveDeRotaPublica("claude");
    return chave ? { provider: "claude", chave } : null;
  },
}));

import { POST } from "@/app/api/sdr/chat/route";
import {
  podeGastarNaPortaPublica,
  tetoConfiguradoUsd,
  gastoNaJanelaUsd,
  TETO_DIARIO_PADRAO_USD,
  CUSTO_DE_CHAMADA_SEM_PRECO_USD,
} from "@/lib/ai/teto-de-custo";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TETO_DIARIO_SDR_USD;
  chaveDeRotaPublica.mockResolvedValue({ apiKey: "chave", source: "db", model: null });
  workspaceDaRotaPublica.mockResolvedValue("ws-1");
  db.portalMessage.create.mockResolvedValue({});
  db.portalMessage.findFirst.mockResolvedValue(null);
  db.portalMessage.findMany.mockResolvedValue([]);
  db.clientRequestDb.findUnique.mockResolvedValue(null);
  db.aIRunLog.findMany.mockResolvedValue([]);
});

describe("zero significa zero", () => {
  it("TETO 0 com gasto 0 NÃO GASTA — o `>` que abriria a porta é o defeito irmão", async () => {
    process.env.TETO_DIARIO_SDR_USD = "0";
    expect(tetoConfiguradoUsd()).toBe(0);

    const v = await podeGastarNaPortaPublica("ws-1");
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("teto_estourado");
  });

  it("teto 0 e teto ausente NÃO são a mesma coisa — um barra tudo, o outro vale o padrão da casa", () => {
    process.env.TETO_DIARIO_SDR_USD = "0";
    expect(tetoConfiguradoUsd()).toBe(0);
    delete process.env.TETO_DIARIO_SDR_USD;
    expect(tetoConfiguradoUsd()).toBe(TETO_DIARIO_PADRAO_USD);
    expect(TETO_DIARIO_PADRAO_USD).toBeGreaterThan(0);
  });
});

describe("falha fechada em todos os caminhos", () => {
  it("sem workspace resolvido — não gasta chave paga sem dono", async () => {
    const v = await podeGastarNaPortaPublica(null);
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("sem_workspace");
  });

  it("teto ILEGÍVEL não cai no padrão em silêncio — não gasta", async () => {
    process.env.TETO_DIARIO_SDR_USD = "cinco dólares";
    expect(tetoConfiguradoUsd()).toBeNull();
    const v = await podeGastarNaPortaPublica("ws-1");
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("sem_teto");
  });

  it("contador fora do ar RECUSA, não libera — teto que o banco desliga é teto que o atacante desliga", async () => {
    db.aIRunLog.findMany.mockRejectedValue(new Error("banco fora"));
    expect(await gastoNaJanelaUsd("ws-1")).toBeNull();
    const v = await podeGastarNaPortaPublica("ws-1");
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toBe("contador_fora_do_ar");
  });

  it("chamada SEM PREÇO NA TABELA não conta como zero — modelo novo não é economia", async () => {
    db.aIRunLog.findMany.mockResolvedValue([
      { custoEstimadoUsd: null },
      { custoEstimadoUsd: null },
    ]);
    const gasto = await gastoNaJanelaUsd("ws-1");
    expect(gasto).toBe(CUSTO_DE_CHAMADA_SEM_PRECO_USD * 2);
    expect(gasto).toBeGreaterThan(0);
  });
});

describe("a porta pública, de ponta a ponta", () => {
  function chamar() {
    return POST(
      new NextRequest("http://localhost/api/sdr/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [], currentMessage: "oi", scope: {}, sessionId: "s-teto" }),
      }),
    );
  }

  it("teto estourado: NENHUMA chamada ao provedor sai — o freio é ANTES do gasto, não depois", async () => {
    db.aIRunLog.findMany.mockResolvedValue([{ custoEstimadoUsd: 999 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const corpo = await (await chamar()).json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("teto_de_custo");
    // O ponto inteiro: a chave paga não foi encostada.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem workspace resolvido: NENHUMA chamada ao provedor sai", async () => {
    workspaceDaRotaPublica.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const corpo = await (await chamar()).json();

    expect(corpo.ok).toBe(false);
    expect(corpo.reason).toBe("teto_de_custo");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abaixo do teto: a conversa acontece — o freio não é uma porta fechada", async () => {
    db.aIRunLog.findMany.mockResolvedValue([{ custoEstimadoUsd: 0.01 }]);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify({ scope: {}, reply: "Oi! Qual é o nome do seu negócio?" }) }],
        stop_reason: "end_turn",
      }),
    })));

    const corpo = await (await chamar()).json();
    expect(corpo.ok).toBe(true);
  });
});
