// A PRODUÇÃO DE ARTE NÃO PODE FECHAR A PORTA DA FRENTE — 25/08/2026.
//
// ─── O ACHADO, MEDIDO EM PRODUÇÃO E NÃO INFERIDO ────────────────────────────
//
// O cliente oculto bateu em `www.diolidigital.com.br/api/sdr/chat` e levou
// `{"ok":false,"reason":"teto_de_custo"}` em NOVE turnos seguidos. A porta da
// frente da agência — a única entrada de receita — estava fechada para toda a
// internet. `GET /api/agency/gasto-de-ia?dias=1`, na mesma hora:
//
//     total ....................... US$ 7,67   (teto da porta: US$ 5,00)
//     openai/gpt-image-1 .......... US$ 6,09   ← 79%, 28 chamadas
//     claude/claude-haiku-4-5 ..... US$ 1,49
//
// `gpt-image-1` é produção de ARTE: trabalho interno, autenticado, de clientes
// que já pagaram. O teto da porta pública somava o workspace inteiro, então a
// casa produzia de manhã e fechava a própria porta à tarde. Quanto melhor a
// agência trabalhasse, menos cliente novo ela conseguiria atender.
//
// Estes testes são a régua no lugar certo: a porta conta o que a PORTA gastou.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  aIRunLog: { findMany: vi.fn(async (): Promise<{ custoEstimadoUsd: number | null }[]> => []) },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const {
  podeGastarNaPortaPublica,
  gastoNaJanelaUsd,
  AGENTE_DA_PORTA_PUBLICA,
  TETO_DIARIO_PADRAO_USD,
  TETO_DIARIO_WORKSPACE_PADRAO_USD,
} = await import("@/lib/ai/teto-de-custo");

/** O retrato do dia 25/08/2026, em duas linhas: o que a porta gastou e o que a
 *  casa gastou. É o mesmo formato do relatório de produção. */
function contadorReal({ porta, casa }: { porta: number; casa: number }) {
  db.aIRunLog.findMany.mockImplementation(async (args: unknown) => {
    const where = (args as { where?: { agentId?: string } } | undefined)?.where ?? {};
    const total = where.agentId === AGENTE_DA_PORTA_PUBLICA ? porta : casa;
    return [{ custoEstimadoUsd: total }];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TETO_DIARIO_SDR_USD;
  delete process.env.TETO_DIARIO_WORKSPACE_USD;
});

describe("o teto da porta conta o que a PORTA gastou", () => {
  it("✅ o retrato exato de 25/08: US$ 7,67 na casa, US$ 1,49 na porta — a porta ABRE", () => {
    // Antes deste conserto, este é o caso que devolvia `teto_estourado` e
    // fechava a agência para a internet inteira.
    contadorReal({ porta: 1.492904, casa: 7.673557 });
    return podeGastarNaPortaPublica("ws").then((v) => {
      expect(v.pode, `a porta continuou fechada: ${JSON.stringify(v)}`).toBe(true);
    });
  });

  it("⛔ a porta gastando de verdade continua sendo barrada", async () => {
    contadorReal({ porta: 5.01, casa: 5.01 });
    const v = await podeGastarNaPortaPublica("ws");
    expect(v.pode).toBe(false);
    if (v.pode) throw new Error("impossível");
    expect(v.motivo).toBe("teto_estourado");
    expect(v.gastoUsd).toBeCloseTo(5.01);
  });

  it("⛔ a CASA sangrando sozinha também barra — e com outro motivo", async () => {
    // Estreitar o teto para a porta sem pôr um freio no total abriria um
    // buraco: gasto interno sem limite nenhum. Dois riscos, dois freios.
    contadorReal({ porta: 0.1, casa: TETO_DIARIO_WORKSPACE_PADRAO_USD + 1 });
    const v = await podeGastarNaPortaPublica("ws");
    expect(v.pode).toBe(false);
    if (v.pode) throw new Error("impossível");
    // Dois fatos, dois motivos: achatá-los foi o que fez a auditoria levar meia
    // hora para descobrir que ninguém estava atacando nada.
    expect(v.motivo).toBe("teto_do_workspace_estourado");
  });

  it("o freio da casa é FOLGADO em relação ao da porta — senão nada mudou", () => {
    expect(TETO_DIARIO_WORKSPACE_PADRAO_USD).toBeGreaterThan(TETO_DIARIO_PADRAO_USD);
    // E folgado acima do pico REAL medido num dia de produção (US$ 7,67);
    // senão o conserto duraria até a próxima terça-feira movimentada.
    expect(TETO_DIARIO_WORKSPACE_PADRAO_USD).toBeGreaterThan(7.673557);
  });

  it("a consulta do gasto da porta filtra pelo agente que atende a porta", async () => {
    contadorReal({ porta: 1, casa: 9 });
    await gastoNaJanelaUsd("ws", Date.now(), AGENTE_DA_PORTA_PUBLICA);
    const where = db.aIRunLog.findMany.mock.calls.at(-1)![0]!.where;
    expect(where.agentId).toBe(AGENTE_DA_PORTA_PUBLICA);
    expect(AGENTE_DA_PORTA_PUBLICA).toBe("comercial-sdr");
  });

  it("sem agente, a consulta conta TUDO — o freio da casa não pode ter filtro", async () => {
    contadorReal({ porta: 1, casa: 9 });
    await gastoNaJanelaUsd("ws");
    const where = db.aIRunLog.findMany.mock.calls.at(-1)![0]!.where;
    expect(where.agentId).toBeUndefined();
  });
});
