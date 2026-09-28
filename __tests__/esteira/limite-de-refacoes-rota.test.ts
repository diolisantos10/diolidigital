// limite-de-refacoes-rota.test.ts — a porta de
// `/api/agency/clients/[id]/refacoes` (C6, 27/09/2026).
//
// Guarda igual a `pacote/route.ts`: sessão obrigatória, portal nunca entra,
// posse por workspace via `clienteOuNulo` (404, nunca 403), PUT só "master",
// e o teto validado 0..50 | null.
//
// `@/lib/agency/esteira/semana-editorial` é mockado só com `civilBrasilia`
// reproduzido — a MESMA razão de `limite-de-refacoes.test.ts`: importar o
// módulo de verdade puxaria `calendario-editorial.ts` e toda a árvore pesada.
// O restante de `limite-de-refacoes.ts` (mesReferenciaBrasilia, refacoesNoMes)
// roda de verdade, contra o `prisma` mockado — é isso que prova que a rota
// soma o mês CERTO, e não um número combinado à mão no teste.
//
// Mocks TIPADOS (regra do CLAUDE.md).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

interface ClienteFixture { limiteRefacoesMes: number | null }
interface RefacaoFixture {
  clientId: string; mesReferencia: string; contaNoLimite: boolean;
  socialPostId: string; motivo: string; origem: string; criadoEm: Date;
}

let clientes: Record<string, ClienteFixture> = {};
let refacoes: RefacaoFixture[] = [];

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn(), update: vi.fn() },
  refacaoDaPeca: { count: vi.fn(), findMany: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());
const clienteOuNulo = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());
const deveBloquearMutacaoCrossSite = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/esteira/posse-do-cliente", () => ({ clienteOuNulo }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/security/navegacao-cross-site", () => ({ deveBloquearMutacaoCrossSite }));
vi.mock("@/lib/agency/esteira/semana-editorial", () => ({
  civilBrasilia: (agora: Date): { ano: number; mesIndex: number; dia: number; diaDaSemana: number; hora: number } => {
    const OFFSET_BRASILIA_MS = 3 * 60 * 60_000;
    const brt = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
    return {
      ano: brt.getUTCFullYear(), mesIndex: brt.getUTCMonth(), dia: brt.getUTCDate(),
      diaDaSemana: brt.getUTCDay(), hora: brt.getUTCHours(),
    };
  },
}));

import { GET, PUT } from "@/app/api/agency/clients/[id]/refacoes/route";
import { LIMITE_PADRAO_MENSAL_DA_CASA } from "@/lib/agency/esteira/limite-de-refacoes";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function sessaoDe(opts: { role?: string; workspaceId?: string; clientId?: string } = {}) {
  return {
    userId: "u1", email: "quem@dioli.studio", name: "Quem",
    role: opts.role ?? "master", workspaceId: opts.workspaceId ?? "ws1", clientId: opts.clientId,
  };
}

function getReq(): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/agency/clients/cli1/refacoes");
}
function putReq(body: unknown): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/agency/clients/cli1/refacoes", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  clientes = {};
  refacoes = [];
  vi.clearAllMocks();

  requireSession.mockResolvedValue({ session: sessaoDe(), error: null });
  clienteOuNulo.mockResolvedValue({ id: "cli1" });
  rateLimit.mockReturnValue({ allowed: true, retryAfter: 0 });
  deveBloquearMutacaoCrossSite.mockReturnValue(false);

  db.client.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }): Promise<ClienteFixture | null> => clientes[where.id] ?? null,
  );
  db.client.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: ClienteFixture }): Promise<ClienteFixture> => {
      clientes[where.id] = data;
      return data;
    },
  );
  db.refacaoDaPeca.count.mockImplementation(
    async ({ where }: { where: { clientId: string; mesReferencia: string; contaNoLimite: boolean } }): Promise<number> =>
      refacoes.filter(
        (r) => r.clientId === where.clientId && r.mesReferencia === where.mesReferencia && r.contaNoLimite === where.contaNoLimite,
      ).length,
  );
  db.refacaoDaPeca.findMany.mockImplementation(
    async ({ where }: { where: { clientId: string } }): Promise<RefacaoFixture[]> =>
      refacoes
        .filter((r) => r.clientId === where.clientId)
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, 10),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sessão de portal nunca entra na tela administrativa de limite", () => {
  it("GET com session.clientId devolve 403 e não toca o banco", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe({ clientId: "cli1" }), error: null });
    const res = await GET(getReq(), ctx("cli1"));
    expect(res.status).toBe(403);
    expect(clienteOuNulo).not.toHaveBeenCalled();
  });

  it("PUT com session.clientId devolve 403 e não grava", async () => {
    requireSession.mockResolvedValue({ session: sessaoDe({ clientId: "cli1" }), error: null });
    const res = await PUT(putReq({ limiteRefacoesMes: 10 }), ctx("cli1"));
    expect(res.status).toBe(403);
    expect(db.client.update).not.toHaveBeenCalled();
  });
});

describe("cliente de outro workspace — 404, nunca 403", () => {
  it("GET de cliente que não é da sessão devolve 404", async () => {
    clienteOuNulo.mockResolvedValue(null);
    const res = await GET(getReq(), ctx("cli-de-outro-workspace"));
    expect(res.status).toBe(404);
  });

  it("PUT de cliente que não é da sessão devolve 404 e não grava", async () => {
    clienteOuNulo.mockResolvedValue(null);
    const res = await PUT(putReq({ limiteRefacoesMes: 10 }), ctx("cli-de-outro-workspace"));
    expect(res.status).toBe(404);
    expect(db.client.update).not.toHaveBeenCalled();
  });
});

describe("PUT — só master grava", () => {
  it("não-master devolve 403 e não grava", async () => {
    requireSession.mockResolvedValue({
      session: null,
      error: NextResponse.json({ error: "Forbidden — requires role: master" }, { status: 403 }),
    });
    const res = await PUT(putReq({ limiteRefacoesMes: 10 }), ctx("cli1"));
    expect(res.status).toBe(403);
    expect(db.client.update).not.toHaveBeenCalled();
  });
});

describe("PUT — o teto validado", () => {
  it("acima de 50 é 400 e não grava", async () => {
    const res = await PUT(putReq({ limiteRefacoesMes: 51 }), ctx("cli1"));
    expect(res.status).toBe(400);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("negativo é 400 e não grava", async () => {
    const res = await PUT(putReq({ limiteRefacoesMes: -1 }), ctx("cli1"));
    expect(res.status).toBe(400);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("fracionário é 400 e não grava", async () => {
    const res = await PUT(putReq({ limiteRefacoesMes: 3.5 }), ctx("cli1"));
    expect(res.status).toBe(400);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("JSON inválido é 400", async () => {
    const req = new NextRequest("https://app.dioli.studio/api/agency/clients/cli1/refacoes", {
      method: "PUT", headers: { "content-type": "application/json" }, body: "{ isto não é json",
    });
    const res = await PUT(req, ctx("cli1"));
    expect(res.status).toBe(400);
  });

  it("null é aceito — volta ao padrão da casa", async () => {
    const res = await PUT(putReq({ limiteRefacoesMes: null }), ctx("cli1"));
    expect(res.status).toBe(200);
    expect((await res.json()).limiteRefacoesMes).toBeNull();
    expect(db.client.update).toHaveBeenCalledWith({ where: { id: "cli1" }, data: { limiteRefacoesMes: null } });
  });

  it("0 a 50 grava normalmente", async () => {
    const res = await PUT(putReq({ limiteRefacoesMes: 12 }), ctx("cli1"));
    expect(res.status).toBe(200);
    expect((await res.json()).limiteRefacoesMes).toBe(12);
  });
});

describe("GET — soma o mês de Brasília", () => {
  it("21h30 de Brasília do último dia do mês conta em setembro, não em outubro", async () => {
    // 30/09/2026 21:30 BRT = 01/10/2026 00:30 UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:30:00.000Z"));

    clientes["cli1"] = { limiteRefacoesMes: null };
    refacoes.push({
      clientId: "cli1", mesReferencia: "2026-09", contaNoLimite: true,
      socialPostId: "sp1", motivo: "ajuste", origem: "cliente_portal", criadoEm: new Date("2026-09-20T12:00:00Z"),
    });
    // Um registro de OUTRO mês não pode entrar na soma de setembro.
    refacoes.push({
      clientId: "cli1", mesReferencia: "2026-08", contaNoLimite: true,
      socialPostId: "sp0", motivo: "ajuste antigo", origem: "equipe", criadoEm: new Date("2026-08-01T12:00:00Z"),
    });

    const res = await GET(getReq(), ctx("cli1"));
    const body = await res.json();
    expect(body.mes).toBe("2026-09");
    expect(body.usadasNoMes).toBe(1);
    expect(body.padrao).toBe(LIMITE_PADRAO_MENSAL_DA_CASA);
    expect(body.restantes).toBe(LIMITE_PADRAO_MENSAL_DA_CASA - 1);
    expect(body.limiteRefacoesMes).toBeNull();
    expect(body.ultimas).toHaveLength(2);
    expect(body.ultimas[0].socialPostId).toBe("sp1");
  });

  it("já virou o mês em Brasília (00:30 BRT = 03:30 UTC do dia 1) — soma outubro", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T03:30:00.000Z"));
    clientes["cli1"] = { limiteRefacoesMes: 5 };

    const res = await GET(getReq(), ctx("cli1"));
    const body = await res.json();
    expect(body.mes).toBe("2026-10");
    expect(body.usadasNoMes).toBe(0);
    expect(body.limiteRefacoesMes).toBe(5);
    expect(body.restantes).toBe(5);
  });

  it("até 10 últimas, mesmo com mais registros no banco", async () => {
    clientes["cli1"] = { limiteRefacoesMes: null };
    for (let i = 0; i < 15; i++) {
      refacoes.push({
        clientId: "cli1", mesReferencia: "2026-09", contaNoLimite: i % 2 === 0,
        socialPostId: `sp${i}`, motivo: "ajuste", origem: "equipe", criadoEm: new Date(2026, 8, i + 1),
      });
    }
    const res = await GET(getReq(), ctx("cli1"));
    const body = await res.json();
    expect(body.ultimas).toHaveLength(10);
  });
});
