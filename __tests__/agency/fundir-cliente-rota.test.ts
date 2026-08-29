// A ROTA de fusão não pode devolver 500 cru quando o $transaction rejeita.
//
// O DEFEITO REAL (28/08/2026): dois cadastros da FOOCCI tinham a mesma
// `ParceriaDoCliente` / `BrandBrain` (ambos `clientId @unique` sem
// `unicoPorCliente`). `moverVinculos` tentava mover as duas linhas para o
// mesmo `clientId`, o Prisma jogava P2002, `$transaction` abortava, e a rota
// — sem `try/catch` — devolvia 500 sem corpo legível.
//
// Este teste prova as DUAS pernas: (1) a rota de verdade
// (`app/api/clients/[id]/fundir/route.ts:83-97`) chama `traduzirConflitoDeFusao`
// quando o `$transaction` rejeita — mockamos só `moverVinculos` (a peça que
// pode lançar o P2002 de verdade) e a sessão/prisma.client, e deixamos a
// tradução REAL rodar; (2) erro que NÃO é P2002 continua 500, com mensagem,
// nunca mudo.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: {
    // Assinatura anotada com `where.id` já no mock inicial — não só no
    // `mockImplementation` do `beforeEach` — porque uma função com MAIS
    // parâmetros obrigatórios do que a assinatura original não é atribuível
    // a ela; `tsc` barra isso (e barrou três PRs desta casa antes, por causa
    // igual em `vi.hoisted`).
    findFirst: vi.fn(
      async (_args: { where: { id: string } }): Promise<{ id: string; name: string } | null> => null,
    ),
  },
  // O `$transaction` real do Prisma chama a callback com um `tx`; este mock
  // faz o mesmo, com um `tx.client` mínimo — o bastante para o caminho feliz
  // (`update`/`delete` no fim da transação) não quebrar por `undefined`.
  $transaction: vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
      fn({
        client: {
          update: vi.fn(async () => ({})),
          delete: vi.fn(async () => ({})),
        },
      }),
  ),
}));
const getSession = vi.hoisted(() =>
  vi.fn(async (): Promise<{ role: string; workspaceId: string } | null> => null),
);
const moverVinculos = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{ movidos: unknown[]; descartados: unknown[] }> => ({
      movidos: [],
      descartados: [],
    }),
  ),
);

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
// `completarCampos` e `traduzirConflitoDeFusao` continuam REAIS — só
// `moverVinculos` é mockado, porque é ele quem, dentro da transação real,
// dispararia o P2002 vindo do banco. Testar a rota inteira contra um P2002 de
// verdade custaria montar duas linhas colidentes num banco real; mockar o
// ponto exato onde o erro nasce prova a mesma coisa, mais barato.
vi.mock("@/lib/agency/persistence/cliente-vinculos", async () => {
  const real = await vi.importActual<typeof import("@/lib/agency/persistence/cliente-vinculos")>(
    "@/lib/agency/persistence/cliente-vinculos",
  );
  return { ...real, moverVinculos };
});

import { POST as fundir } from "@/app/api/clients/[id]/fundir/route";

const SESSAO = { role: "master", workspaceId: "ws-1" };
const ABSORVIDO = { id: "abs-1", name: "CityJobs" };
const SOBREVIVENTE = { id: "sob-1", name: "CityJobs" };

function req(sobreviventeId: string | undefined): NextRequest {
  return new NextRequest("http://localhost/api/clients/abs-1/fundir", {
    method: "POST",
    body: JSON.stringify({ sobreviventeId }),
    headers: { "content-type": "application/json" },
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "abs-1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(SESSAO);
  db.client.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === ABSORVIDO.id ? ABSORVIDO : where.id === SOBREVIVENTE.id ? SOBREVIVENTE : null,
  );
  moverVinculos.mockResolvedValue({ movidos: [], descartados: [] });
});

describe("P2002 vindo do $transaction vira 409 legível, citando o vínculo", () => {
  it("com meta.modelName, a resposta cita o rótulo em português — não 500 cru", async () => {
    moverVinculos.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { modelName: "ParceriaDoCliente" },
      }),
    );

    const res = await fundir(req(SOBREVIVENTE.id), ctx());
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toContain("parcerias do cliente");
  });

  it("com meta.modelName de BrandBrain, cita 'cérebro de marca'", async () => {
    moverVinculos.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { modelName: "BrandBrain" },
      }),
    );

    const res = await fundir(req(SOBREVIVENTE.id), ctx());
    expect(res.status).toBe(409);
    const j = await res.json();
    expect(j.error).toContain("cérebro de marca");
  });
});

describe("erro que NÃO é P2002 continua erro — nunca vira sucesso, nunca fica mudo", () => {
  it("erro genérico do banco → 500 COM mensagem (não mudo, não 200)", async () => {
    moverVinculos.mockRejectedValue(new Error("conexão perdida com o banco"));

    const res = await fundir(req(SOBREVIVENTE.id), ctx());
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(typeof j.error).toBe("string");
    expect(j.error.length).toBeGreaterThan(0);
  });

  it("a mensagem de erro genérico não vaza PII (nome do cliente)", async () => {
    moverVinculos.mockRejectedValue(new Error("conexão perdida com o banco"));

    const res = await fundir(req(SOBREVIVENTE.id), ctx());
    const j = await res.json();
    expect(j.error).not.toContain("CityJobs");
  });
});

describe("caminho feliz continua 200 quando nada colide", () => {
  it("sem erro, a fusão conclui normalmente", async () => {
    const res = await fundir(req(SOBREVIVENTE.id), ctx());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
  });
});
