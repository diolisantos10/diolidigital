// patch-trava-da-semana.test.ts — achado 3, Q4-qualidade (27/09/2026): a trava
// da semana + limite mensal (`app/api/social-posts/[id]/route.ts`) era
// contornável em DOIS PATCHs na MESMA rota:
//
//   (1) `PATCH { scheduledFor: <futuro> }` — sem checagem nenhuma, porque
//       `mudouLegendaOuArte` de propósito não olha `scheduledFor`;
//   (2) `PATCH { caption: "..." }` — a essa altura `existing.scheduledFor` já
//       era o futuro gravado pelo PATCH (1), `semanaTravada` calculava
//       `false`, e a edição passava sem contar no limite e sem checar o teto.
//
// Este arquivo prova as DUAS metades do conserto:
//   ⛔ mudar `scheduledFor` de uma peça de calendário cuja data ATUAL já está
//      travada é RECUSADO (409) — fecha o passo (1) do bypass;
//   ⛔ a checagem de legenda/arte passa a considerar travada também quando é
//      a data NOVA (não só a antiga) que cai numa semana já travada;
//   ✅ nada disto regride o caminho normal: reagendar uma peça ainda NÃO
//      travada continua livre, e peça de PROJETO (`deliverableId`) nunca
//      entra nesta trava — ela tem o próprio teto, em `refacao.ts`.
//
// Mocks só de `@/lib/db/client` e `@/lib/auth/api-guard` — o resto
// (`semana-editorial.ts`, `limite-de-refacoes.ts`) roda de verdade, a mesma
// régua de `planner/registro-de-publicacao.test.ts`.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

interface PostFixture {
  id: string;
  workspaceId: string;
  clientId: string | null;
  deliverableId: string | null;
  caption: string;
  networks: string;
  format: string;
  pillar: string | null;
  mediaUrl: string | null;
  mediaUrlsJson: string;
  scenesJson: string;
  scriptJson: string | null;
  visibility: string;
  scheduledFor: Date | null;
  status: string;
  externalPostId: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  publishedBy: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface RefacaoFixture {
  workspaceId: string; clientId: string; socialPostId: string; motivo: string;
  origem: string; contaNoLimite: boolean; mesReferencia: string;
}

let refacoes: RefacaoFixture[] = [];

const db = vi.hoisted(() => ({
  socialPost: { findFirst: vi.fn(), update: vi.fn() },
  client: { findUnique: vi.fn(async (): Promise<{ limiteRefacoesMes: number | null }> => ({ limiteRefacoesMes: null })) },
  activityEvent: { create: vi.fn(async () => ({})) },
  refacaoDaPeca: { count: vi.fn(), create: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { PATCH } from "@/app/api/social-posts/[id]/route";

const SESSAO = { userId: "u1", email: "social@dioli.studio", name: "Equipe", role: "social_staff", workspaceId: "ws1" };
const ctx = { params: Promise.resolve({ id: "sp1" }) };

function patch(body: unknown): NextRequest {
  return new NextRequest("https://app.dioli.studio/api/social-posts/sp1", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
function gravado(): Record<string, unknown> {
  return db.socialPost.update.mock.calls[0]![0].data;
}

/** Peça do calendário editorial (sem `deliverableId`) — a mesma identidade
 *  que `refacao.ts` usa para "card de semana". */
function pecaDoCalendario(overrides: Partial<PostFixture> = {}): PostFixture {
  return {
    id: "sp1", workspaceId: "ws1", clientId: "cli1", deliverableId: null,
    caption: "Pão fresquinho toda manhã.", networks: '["instagram"]', format: "feed",
    pillar: "bastidores", mediaUrl: "/api/media/m1.png", mediaUrlsJson: "[]", scenesJson: "[]",
    scriptJson: null, visibility: "compartilhado", scheduledFor: new Date("2026-10-06T13:00:00.000Z"),
    status: "draft", externalPostId: null, permalink: null, publishedAt: null,
    publishedBy: null, lastError: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  refacoes = [];
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: SESSAO, error: null });
  db.socialPost.update.mockImplementation(
    async ({ data }: { where: { id: string }; data: Partial<PostFixture> }): Promise<Partial<PostFixture> & { id: string }> =>
      ({ id: "sp1", ...data }),
  );
  db.client.findUnique.mockResolvedValue({ limiteRefacoesMes: null });
  db.activityEvent.create.mockResolvedValue({});
  db.refacaoDaPeca.count.mockImplementation(
    async ({ where }: { where: { clientId: string; mesReferencia: string; contaNoLimite: boolean } }): Promise<number> =>
      refacoes.filter(
        (r) => r.clientId === where.clientId && r.mesReferencia === where.mesReferencia && r.contaNoLimite === where.contaNoLimite,
      ).length,
  );
  db.refacaoDaPeca.create.mockImplementation(async ({ data }: { data: RefacaoFixture }): Promise<RefacaoFixture> => {
    refacoes.push(data);
    return data;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Semana de 06 a 12/10/2026, gerada na quinta 01/10 10h BRT (13:00Z) — a
// MESMA janela usada em `refacao-card-de-semana.test.ts`. `AGORA` é bem
// depois disso: já travada.
const AGORA = new Date("2026-10-02T12:00:00.000Z");
// Semana bem à frente — geração ainda não chegou, NÃO travada.
const FUTURO_NAO_TRAVADO = new Date("2026-12-08T13:00:00.000Z");

describe("PATCH 1 do bypass — mudar scheduledFor de uma peça JÁ travada", () => {
  it("data ATUAL travada + pedido de nova data: RECUSADO (409), banco não é tocado", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    db.socialPost.findFirst.mockResolvedValue(pecaDoCalendario()); // scheduledFor = 06/10, travada

    const res = await PATCH(patch({ scheduledFor: FUTURO_NAO_TRAVADO.toISOString() }), ctx);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("semana travada");
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(db.refacaoDaPeca.create).not.toHaveBeenCalled();
  });

  it("data ATUAL ainda NÃO travada: reagendar continua livre (sem regressão)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    db.socialPost.findFirst.mockResolvedValue(pecaDoCalendario({ scheduledFor: FUTURO_NAO_TRAVADO }));

    const res = await PATCH(patch({ scheduledFor: "2026-12-10T13:00:00.000Z" }), ctx);

    expect(res.status).toBe(200);
    expect(gravado().scheduledFor).toEqual(new Date("2026-12-10T13:00:00.000Z"));
    // Só moveu a data, não mexeu em legenda/arte: nada de refação registrada.
    expect(db.refacaoDaPeca.create).not.toHaveBeenCalled();
  });

  it("peça de PROJETO (`deliverableId`) nunca entra nesta trava — o teto dela é outro", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    db.socialPost.findFirst.mockResolvedValue(
      pecaDoCalendario({ deliverableId: "del1" }), // scheduledFor = 06/10, travada — mas TEM deliverableId
    );

    const res = await PATCH(patch({ scheduledFor: FUTURO_NAO_TRAVADO.toISOString() }), ctx);

    expect(res.status).toBe(200);
    expect(gravado().scheduledFor).toEqual(FUTURO_NAO_TRAVADO);
  });

  it("mudar SÓ o `status` (sem tocar scheduledFor) com data travada continua livre — a trava é sobre MUDAR a data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    db.socialPost.findFirst.mockResolvedValue(pecaDoCalendario());

    const res = await PATCH(patch({ status: "scheduled" }), ctx);

    expect(res.status).toBe(200);
    expect(gravado().status).toBe("scheduled");
  });
});

describe("PATCH 2 do bypass, fechado — mesmo com o passo 1 bloqueado, editar legenda de peça travada conta no limite", () => {
  it("legenda muda com a data (ANTIGA, nunca movida) travada: registra RefacaoDaPeca com contaNoLimite:true", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    db.socialPost.findFirst.mockResolvedValue(pecaDoCalendario()); // scheduledFor = 06/10, travada

    const res = await PATCH(patch({ caption: "Pão quentinho, saindo do forno." }), ctx);

    expect(res.status).toBe(200);
    expect(gravado().caption).toBe("Pão quentinho, saindo do forno.");
    expect(db.refacaoDaPeca.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "cli1", contaNoLimite: true }) }),
    );
  });

  it("limite mensal já estourado: NÃO regenera, 409 com a frase exata, escala para a equipe", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    db.socialPost.findFirst.mockResolvedValue(pecaDoCalendario());
    db.client.findUnique.mockResolvedValue({ limiteRefacoesMes: 1 });
    refacoes.push({
      workspaceId: "ws1", clientId: "cli1", socialPostId: "sp-outra", motivo: "x",
      origem: "equipe", contaNoLimite: true, mesReferencia: "2026-10",
    });

    const res = await PATCH(patch({ caption: "NUNCA deveria sair — limite estourado." }), ctx);

    expect(res.status).toBe(409);
    const corpo = await res.json();
    expect(corpo.error).toContain("limite de refações deste mês acabou");
    expect(db.socialPost.update).not.toHaveBeenCalled();
    expect(db.activityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "limite_de_refacoes_estourado" }) }),
    );
  });
});

describe("achado 3, metade 2 — a checagem também olha a data NOVA, não só a antiga", () => {
  it("data ANTIGA livre + data NOVA cai numa semana JÁ travada + legenda muda no MESMO PATCH: conta no limite", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    // A peça está hoje numa semana NÃO travada (dezembro)...
    db.socialPost.findFirst.mockResolvedValue(
      pecaDoCalendario({ scheduledFor: FUTURO_NAO_TRAVADO, caption: "Bolo de fubá do fim de semana." }),
    );

    // ...e o mesmo PATCH move para dentro da semana de 06/10 (já travada) E
    // muda a legenda — antes deste conserto, `travada` só olhava a data
    // ANTIGA (não travada) e deixava passar sem contar no limite.
    const res = await PATCH(patch({
      scheduledFor: "2026-10-07T13:00:00.000Z",
      caption: "Bolo de fubá quentinho, saindo agora do forno.",
    }), ctx);

    expect(res.status).toBe(200);
    expect(gravado().caption).toBe("Bolo de fubá quentinho, saindo agora do forno.");
    expect(db.refacaoDaPeca.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contaNoLimite: true }) }),
    );
  });
});
