// mes-editorial.test.ts — a rotina mensal: fuso do dia 25, a janela do mês e
// os três atos (calendário, finalização, card único).
//
// Mocks TIPADOS (regra do CLAUDE.md: `vi.hoisted(() => vi.fn())` sem
// assinatura quebra `tsc --noEmit` mesmo com o teste verde — todo
// `.mockResolvedValue`/retorno abaixo é anotado).
//
// `@/lib/agency/esteira/calendario-editorial` e
// `@/lib/agency/esteira/semana-editorial` são mockados por INTEIRO, com
// reproduções PRÓPRIAS e FIÉIS das funções puras de fuso (`meiaNoiteBrasilia`,
// `diaCivilBrasilia`, `civilBrasilia`) e da régua de dois módulos
// (`modoEmVigor`) — a MESMA estratégia (e o mesmo motivo) do cabeçalho de
// `semana-editorial.test.ts`: este arquivo prova `mes-editorial.ts` sem
// depender da árvore de imports pesada daqueles dois módulos (que puxam
// `pacote-da-marca.ts`, `cardapio.ts`, `dna-da-marca.ts`, `publicacao.ts`
// etc.). Quem quiser provar AQUELES arquivos tem teste próprio
// (`calendario-editorial.test.ts`, `semana-editorial.test.ts`,
// `modo-de-aprovacao.test.ts`).

import { describe, it, expect, vi, beforeEach } from "vitest";

interface ClienteFixture {
  id: string;
  workspaceId: string;
  modoAprovacao: string;
  modoPendente: string | null;
  modoPendenteVigenteEm: Date | null;
}

let clientes: ClienteFixture[] = [];

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
}));
const gerarCalendarioEditorial = vi.hoisted(() => vi.fn());
const finalizarPecasNaJanela = vi.hoisted(() => vi.fn());
const abrirCardDoPeriodo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));

vi.mock("@/lib/agency/esteira/modo-de-aprovacao", () => ({
  // A MESMA régua de 2 linhas de `modo-de-aprovacao.ts` — reprodução fiel,
  // não a fonte (a mesma estratégia de `semana-editorial.test.ts`).
  modoEmVigor: (
    c: { modoAprovacao: string; modoPendente: string | null; modoPendenteVigenteEm: Date | null },
    em: Date,
  ): string => {
    if (c.modoPendente && c.modoPendenteVigenteEm && em.getTime() >= c.modoPendenteVigenteEm.getTime()) {
      return c.modoPendente;
    }
    return c.modoAprovacao;
  },
}));

vi.mock("@/lib/agency/esteira/calendario-editorial", () => ({
  gerarCalendarioEditorial,
  // Reprodução fiel de `calendario-editorial.ts` — Brasília é UTC-3 fixo.
  meiaNoiteBrasilia: (ano: number, mesIndex: number, dia: number): Date =>
    new Date(Date.UTC(ano, mesIndex, dia, 3, 0, 0, 0)),
  diaCivilBrasilia: (instante: Date): { ano: number; mesIndex: number; dia: number } => {
    const brt = new Date(instante.getTime() - 3 * 60 * 60_000);
    return { ano: brt.getUTCFullYear(), mesIndex: brt.getUTCMonth(), dia: brt.getUTCDate() };
  },
}));

vi.mock("@/lib/agency/esteira/semana-editorial", () => ({
  // Reprodução fiel de `civilBrasilia` (`semana-editorial.ts`) — a mesma conta
  // de `diaCivilBrasilia`, com a hora a mais que `ehDia25As10hBrasilia` precisa.
  civilBrasilia: (
    agora: Date,
  ): { ano: number; mesIndex: number; dia: number; diaDaSemana: number; hora: number } => {
    const brt = new Date(agora.getTime() - 3 * 60 * 60_000);
    return {
      ano: brt.getUTCFullYear(), mesIndex: brt.getUTCMonth(), dia: brt.getUTCDate(),
      diaDaSemana: brt.getUTCDay(), hora: brt.getUTCHours(),
    };
  },
  finalizarPecasNaJanela,
  abrirCardDoPeriodo,
}));

import {
  ehDia25As10hBrasilia,
  mesSeguinte,
  janelaDoMesTexto,
  finalizarMes,
} from "@/lib/agency/esteira/mes-editorial";
import type { ResultadoDoCalendarioEditorial } from "@/lib/agency/esteira/calendario-editorial";
import type { FinalizarPecasNaJanelaSaida } from "@/lib/agency/esteira/semana-editorial";

function calendarioOk(criados: number): ResultadoDoCalendarioEditorial {
  return { ok: true, criados, jaExistiam: 0, posts: [], barradas: [], pendentes: [] };
}

beforeEach(() => {
  clientes = [];
  vi.clearAllMocks();

  db.client.findMany.mockImplementation(
    async ({ where }: { where?: { workspaceId?: string; id?: string } }): Promise<ClienteFixture[]> => {
      return clientes.filter((c) => {
        if (where?.workspaceId && c.workspaceId !== where.workspaceId) return false;
        if (where?.id && c.id !== where.id) return false;
        return true;
      });
    },
  );
  gerarCalendarioEditorial.mockResolvedValue(calendarioOk(0));
  const finalizarPecasNaJanelaVazio: FinalizarPecasNaJanelaSaida = {
    clientesProcessados: 0, postsFinalizados: 0, falhas: [], finalizadosPorCliente: new Map(),
  };
  finalizarPecasNaJanela.mockResolvedValue(finalizarPecasNaJanelaVazio);
  abrirCardDoPeriodo.mockResolvedValue("card aberto (ar1): \"Peças do mês\", 5 peça(s)");
});

describe("as funções puras de fuso e de mês", () => {
  it("ehDia25As10hBrasilia: 25/10 13:00Z é 10h Brasília — true", () => {
    expect(ehDia25As10hBrasilia(new Date("2026-10-25T13:00:00.000Z"))).toBe(true);
  });

  it("ehDia25As10hBrasilia: 24 23h Brasília (25/10 02:00Z) — false, ainda é dia 24", () => {
    expect(ehDia25As10hBrasilia(new Date("2026-10-25T02:00:00.000Z"))).toBe(false);
  });

  it("ehDia25As10hBrasilia: dia 25 mas 7h Brasília (10:00Z) — false, hora errada", () => {
    expect(ehDia25As10hBrasilia(new Date("2026-10-25T10:00:00.000Z"))).toBe(false);
  });

  it("ehDia25As10hBrasilia: vale a HORA INTEIRA (10:00 a 10:59 Brasília)", () => {
    expect(ehDia25As10hBrasilia(new Date("2026-10-25T13:59:00.000Z"))).toBe(true);
    expect(ehDia25As10hBrasilia(new Date("2026-10-25T14:00:00.000Z"))).toBe(false);
  });

  it("mesSeguinte: dezembro → janeiro do ano SEGUINTE (virada de ano)", () => {
    const j = mesSeguinte(new Date("2026-12-15T13:00:00.000Z"));
    expect(j.mes).toBe("2027-01");
    expect(j.de.toISOString()).toBe("2027-01-01T03:00:00.000Z");
    // 31/01 23:59:59.999 Brasília = 01/02 02:59:59.999 UTC (Brasília é UTC-3)
    // — a MESMA régua de `semanaSeguinte` em `semana-editorial.test.ts`
    // ("11/10 23:59:59.999 BRT" vira "12/10 02:59:59.999Z").
    expect(j.ate.toISOString()).toBe("2027-02-01T02:59:59.999Z");
  });

  it("mesSeguinte: outubro → novembro, mesmo ano", () => {
    const j = mesSeguinte(new Date("2026-10-25T13:00:00.000Z"));
    expect(j.mes).toBe("2026-11");
    expect(j.de.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    // 30/11 23:59:59.999 Brasília = 01/12 02:59:59.999 UTC.
    expect(j.ate.toISOString()).toBe("2026-12-01T02:59:59.999Z");
  });

  it("janelaDoMesTexto: mês inválido devolve null", () => {
    expect(janelaDoMesTexto("2026-13")).toBeNull();
    expect(janelaDoMesTexto("não é mês")).toBeNull();
  });

  it("janelaDoMesTexto: mês válido devolve a janela Brasília certa", () => {
    const j = janelaDoMesTexto("2026-11");
    expect(j).not.toBeNull();
    expect(j!.de.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(j!.ate.toISOString()).toBe("2026-12-01T02:59:59.999Z");
  });
});

describe("finalizarMes", () => {
  const WS = "ws1";

  it("mês inválido: recusa sem tocar cliente nenhum", async () => {
    const r = await finalizarMes({ mes: "2026-99" });
    expect(r.recusas).toEqual([{ clientId: "-", motivo: expect.stringContaining("mês inválido"), codigo: "mes_invalido" }]);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });

  it("só marca em MENSAL: gera calendário e finaliza SÓ para quem está em MENSAL", async () => {
    clientes = [
      { id: "c-mensal", workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null },
      { id: "c-semanal", workspaceId: WS, modoAprovacao: "SEMANAL", modoPendente: null, modoPendenteVigenteEm: null },
      { id: "c-ceo", workspaceId: WS, modoAprovacao: "APROVACAO_CEO", modoPendente: null, modoPendenteVigenteEm: null },
      { id: "c-piloto", workspaceId: WS, modoAprovacao: "PILOTO_AUTOMATICO", modoPendente: null, modoPendenteVigenteEm: null },
    ];
    gerarCalendarioEditorial.mockResolvedValue(calendarioOk(5));
    finalizarPecasNaJanela.mockResolvedValue(
      {
        clientesProcessados: 1, postsFinalizados: 5, falhas: [],
        finalizadosPorCliente: new Map([["c-mensal", ["p1", "p2", "p3", "p4", "p5"]]]),
      } satisfies FinalizarPecasNaJanelaSaida,
    );

    const r = await finalizarMes({ mes: "2026-11" });

    expect(r.clientesElegiveis).toBe(1);
    expect(gerarCalendarioEditorial).toHaveBeenCalledTimes(1);
    expect(gerarCalendarioEditorial).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, clientId: "c-mensal", mes: "2026-11" }),
    );
    expect(finalizarPecasNaJanela).toHaveBeenCalledTimes(1);
    expect(finalizarPecasNaJanela).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, clientId: "c-mensal" }),
    );
  });

  it("card único com o mês: abre UM card com TODAS as peças finalizadas, requestedBy da rotina mensal", async () => {
    clientes = [{ id: "c1", workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null }];
    gerarCalendarioEditorial.mockResolvedValue(calendarioOk(5));
    finalizarPecasNaJanela.mockResolvedValue(
      {
        clientesProcessados: 1, postsFinalizados: 5, falhas: [],
        finalizadosPorCliente: new Map([["c1", ["p1", "p2", "p3", "p4", "p5"]]]),
      } satisfies FinalizarPecasNaJanelaSaida,
    );

    const r = await finalizarMes({ mes: "2026-11" });

    expect(r.calendariosGerados).toBe(1);
    expect(r.postsFinalizados).toBe(5);
    expect(abrirCardDoPeriodo).toHaveBeenCalledTimes(1);
    expect(abrirCardDoPeriodo).toHaveBeenCalledWith({
      clientId: "c1", postIds: ["p1", "p2", "p3", "p4", "p5"], requestedBy: "esteira:rotina-mensal",
    });
    expect(r.cards).toEqual([{ clientId: "c1", resultado: expect.stringContaining("card aberto") }]);
  });

  it("finalizarMes é IDEMPOTENTE: a segunda chamada não abre um segundo card", async () => {
    clientes = [{ id: "c1", workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null }];
    gerarCalendarioEditorial.mockResolvedValue(calendarioOk(5));
    finalizarPecasNaJanela.mockResolvedValue(
      {
        clientesProcessados: 1, postsFinalizados: 5, falhas: [],
        finalizadosPorCliente: new Map([["c1", ["p1", "p2", "p3", "p4", "p5"]]]),
      } satisfies FinalizarPecasNaJanelaSaida,
    );

    const r1 = await finalizarMes({ mes: "2026-11" });
    expect(r1.calendariosGerados).toBe(1);
    expect(abrirCardDoPeriodo).toHaveBeenCalledTimes(1);

    // O segundo tique: o calendário já existe (`criados: 0`) e não sobrou
    // peça em fase "pauta" para finalizar (`finalizadosPorCliente` vazio) —
    // exatamente o que as funções reais devolveriam na segunda passada.
    gerarCalendarioEditorial.mockResolvedValue(calendarioOk(0));
    const finalizarPecasNaJanelaSegundaPassada: FinalizarPecasNaJanelaSaida = {
      clientesProcessados: 1, postsFinalizados: 0, falhas: [], finalizadosPorCliente: new Map(),
    };
    finalizarPecasNaJanela.mockResolvedValue(finalizarPecasNaJanelaSegundaPassada);

    const r2 = await finalizarMes({ mes: "2026-11" });
    expect(r2.calendariosGerados).toBe(0);
    expect(r2.postsFinalizados).toBe(0);
    expect(r2.cards).toEqual([]);
    // continua 1, não 2: nenhum card novo foi aberto na segunda chamada.
    expect(abrirCardDoPeriodo).toHaveBeenCalledTimes(1);
  });

  it("calendário recusado (sem pacote): vira recusa nomeada, nunca exceção — e não finaliza nem abre card", async () => {
    clientes = [{ id: "c1", workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null }];
    gerarCalendarioEditorial.mockResolvedValue(
      { ok: false, motivo: "preciso do pacote da marca", codigo: "sem_pacote" } satisfies ResultadoDoCalendarioEditorial,
    );

    const r = await finalizarMes({ mes: "2026-11" });

    expect(r.recusas).toEqual([{ clientId: "c1", motivo: "preciso do pacote da marca", codigo: "sem_pacote" }]);
    expect(finalizarPecasNaJanela).not.toHaveBeenCalled();
    expect(abrirCardDoPeriodo).not.toHaveBeenCalled();
  });

  it("clientId explícito escopa a um cliente só", async () => {
    clientes = [
      { id: "c1", workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null },
      { id: "c2", workspaceId: WS, modoAprovacao: "MENSAL", modoPendente: null, modoPendenteVigenteEm: null },
    ];
    await finalizarMes({ mes: "2026-11", clientId: "c1" });
    expect(gerarCalendarioEditorial).toHaveBeenCalledTimes(1);
    expect(gerarCalendarioEditorial).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1" }));
  });

  it("modo PENDENTE que só passa a valer no mês seguinte já é lido nesta rodada", async () => {
    // A troca fica pendente para o dia 1 do mês da janela — `modoEmVigor`
    // aplica a troca porque `janela.de` já é >= `modoPendenteVigenteEm`.
    clientes = [{
      id: "c1", workspaceId: WS, modoAprovacao: "APROVACAO_CEO",
      modoPendente: "MENSAL", modoPendenteVigenteEm: new Date("2026-11-01T03:00:00.000Z"),
    }];
    await finalizarMes({ mes: "2026-11" });
    expect(gerarCalendarioEditorial).toHaveBeenCalledTimes(1);
    expect(gerarCalendarioEditorial).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1" }));
  });
});
