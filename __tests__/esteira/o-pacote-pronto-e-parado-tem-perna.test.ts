// O PACOTE PRONTO E PARADO TEM PERNA — e ela não é um contorno.
//
// ⚠️ MEDIDO EM PRODUÇÃO (cliente oculto, 7ª volta, 26/08/2026). Projeto
// `cmt9l4eu0005e0xmngtcm4w3o`: direção aprovada, pagamento registrado, pedidos
// de material resolvidos, **6 entregas `quality_ok`**, `presentedAt: null`,
// `executionStatus: pending`. O relógio bateu, pegou o projeto, o motor rodou —
// e NADA aconteceu, sem um evento sequer. Foi o único empurrão manual por
// defeito da casa naquela volta.
//
// A causa era uma AUSÊNCIA: a única consulta que procurava projeto não
// apresentado (`pacotesTravados`) exigia uma entrega TRAVADA. Pacote sem nada
// travado não estava em lista nenhuma.
//
// Este arquivo cobra as duas metades:
//   1. a consulta ENXERGA o pacote pronto e parado — e continua cega ao que
//      está com ressalva, que tem outra perna;
//   2. a perna apresenta **sem `mesmoComRessalva`**. Se ela um dia passar essa
//      opção, o único freio da casa vira automático e sem testemunha.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
}));
const apresentar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/esteira/marcos", () => ({ apresentar }));

import {
  pacotesProntosNaoApresentados,
  apresentarPacotesProntos,
  QUIETO_HA_MINUTOS,
} from "@/lib/agency/esteira/pacote-travado";

const PARADO_DESDE = new Date(Date.now() - 6 * 3_600_000);

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findMany.mockResolvedValue([
    { id: "p-pronto", name: "Cantina Oculta NOME TESTE", clientId: "c1", updatedAt: PARADO_DESDE, _count: { deliverables: 6 } },
  ]);
  apresentar.mockResolvedValue({ ok: true });
});

/** O `where` que a consulta realmente mandou ao banco. A consulta ERA o defeito. */
function whereDaConsulta(): Record<string, unknown> {
  return db.project.findMany.mock.calls[0]![0].where as Record<string, unknown>;
}

describe("a consulta do pacote pronto e parado", () => {
  it("devolve o pacote com o tempo parado — é esse número que vira notícia", async () => {
    const r = await pacotesProntosNaoApresentados();
    expect(r).toHaveLength(1);
    expect(r[0]!.projectId).toBe("p-pronto");
    expect(r[0]!.entregas).toBe(6);
    expect(r[0]!.paradoDesde).toEqual(PARADO_DESDE);
  });

  it("só procura o NÃO APRESENTADO com direção aprovada", async () => {
    await pacotesProntosNaoApresentados();
    const w = whereDaConsulta();
    // Estas três são o estado exato do projeto medido em produção.
    expect(w.presentedAt).toBeNull();
    expect(w.directionApprovedAt).toEqual({ not: null });
    expect(w.deliverables).toEqual({ some: {} });
  });

  it("EXCLUI o pacote com ressalva e o não auditado — esses têm OUTRA perna", async () => {
    await pacotesProntosNaoApresentados();
    const w = whereDaConsulta() as { NOT: { deliverables: { some: { revisionStatus: { in: string[] } } } } };
    const barrados = w.NOT.deliverables.some.revisionStatus.in;
    // É aqui que esta perna deixaria de ser rede e viraria contorno. Se um dia
    // alguém tirar um destes dois nomes, a casa passa a apresentar sozinha o
    // que a própria Qualidade barrou — `mesmoComRessalva` por outro nome.
    expect(barrados).toContain("quality_flag");
    expect(barrados).toContain("quality_nao_auditado");
  });

  it("não encosta em produção em andamento: fora `running`, e quieto há um tempo", async () => {
    const antes = Date.now();
    await pacotesProntosNaoApresentados();
    const w = whereDaConsulta() as { executionStatus: unknown; updatedAt: { lt: Date } };
    expect(w.executionStatus).toEqual({ not: "running" });
    // O corte é para trás, e por pelo menos a janela declarada. Pacote em
    // produção tem entregas verdes enquanto as outras nascem; apresentar no
    // meio disso mostraria meio pacote ao cliente.
    const corte = w.updatedAt.lt.getTime();
    expect(corte).toBeLessThanOrEqual(antes - QUIETO_HA_MINUTOS * 60_000);
  });

  it("escopo por workspace quando ele é declarado, e sem inventar quando não é", async () => {
    await pacotesProntosNaoApresentados("ws-1");
    expect(whereDaConsulta().workspaceId).toBe("ws-1");
    db.project.findMany.mockClear();
    await pacotesProntosNaoApresentados();
    expect(whereDaConsulta()).not.toHaveProperty("workspaceId");
  });
});

describe("a perna que apresenta", () => {
  it("apresenta o pacote parado — e o cliente passa a ver", async () => {
    const n = await apresentarPacotesProntos();
    expect(n).toBe(1);
    expect(apresentar).toHaveBeenCalledWith("p-pronto");
  });

  it("🔴 NUNCA passa `mesmoComRessalva` — é o único freio da casa", async () => {
    await apresentarPacotesProntos();
    const opts = apresentar.mock.calls[0]![1];
    // Chamada com UM argumento só, ou com opções que não ligam a ressalva.
    expect(opts === undefined || opts.mesmoComRessalva !== true).toBe(true);
  });

  it("RETIDO pela Qualidade não conta como apresentado", async () => {
    // A dívida de 26/08 foi exatamente esta mentira de estado: o instrumento
    // dizia "destravei 8" e o cliente continuava sem ver a entrega.
    apresentar.mockResolvedValue({ ok: false, erro: "2 entrega(s) com ressalva da Qualidade." });
    expect(await apresentarPacotesProntos()).toBe(0);
  });

  it("'já apresentado' também não conta — nada mudou para o cliente", async () => {
    apresentar.mockResolvedValue({ ok: true, erro: "já apresentado — nada mudou" });
    expect(await apresentarPacotesProntos()).toBe(0);
  });

  it("um projeto que estoura não derruba os outros da rodada", async () => {
    db.project.findMany.mockResolvedValue([
      { id: "p-quebra", name: "A", clientId: "c1", updatedAt: PARADO_DESDE, _count: { deliverables: 3 } },
      { id: "p-pronto", name: "B", clientId: "c2", updatedAt: PARADO_DESDE, _count: { deliverables: 6 } },
    ]);
    apresentar.mockImplementation(async (id: string) => {
      if (id === "p-quebra") throw new Error("banco fora");
      return { ok: true };
    });
    expect(await apresentarPacotesProntos()).toBe(1);
  });

  it("respeita o teto por rodada — apresentar é caro e não é urgência de segundos", async () => {
    db.project.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({
        id: `p${i}`, name: `P${i}`, clientId: "c", updatedAt: PARADO_DESDE, _count: { deliverables: 1 },
      })),
    );
    expect(await apresentarPacotesProntos(3)).toBe(3);
    expect(apresentar).toHaveBeenCalledTimes(3);
  });
});
