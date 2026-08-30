// UM ACEITE, UM PROJETO — a reserva é do banco, não da leitura.
//
// ═══════════════════════════════════════════════════════════════════════════
// MEDIDO EM PRODUÇÃO (cliente oculto, 6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// **Dois projetos para a MESMA solicitação**, criados com 9 segundos de
// diferença — `cmt9l4803004s0xmnk0907s0m` e `cmt9l4eu0005e0xmngtcm4w3o`, ambos
// de `cmt9jxkhn003e0xmnpfqq3qbx`. O cliente abriu o portal e viu o projeto
// dele duas vezes, com dois nomes diferentes.
//
// A idempotência EXISTIA (`findFirst` por `clientRequestId`) e não bastou:
// ela é check-then-act, e a janela entre o check e o act é enorme —
// `createProjectFromRequest` chama IA para desenhar o plano e demora segundos.
// Dois chamadores (a rota do aceite, no clique do cliente, e o relógio, que
// varre `accepted`) passaram os dois pelo `findFirst`, os dois acharam vazio,
// e os dois criaram.
//
// **Ler para decidir não trava nada.** Entre a leitura e a escrita cabe outro
// processo inteiro. Quem decide tem de ser o BANCO, numa escrita só — e é o
// que `updateMany` com o status no `where` faz: devolve `count: 1` para
// exatamente um chamador.
//
// ── A MUTAÇÃO QUE ESTE ARQUIVO PEGA ────────────────────────────────────────
// Tire a reserva (o `updateMany` antes de `createProjectFromRequest`) e o
// primeiro teste cria dois projetos, como produção criou.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientRequestDb: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  project: { findFirst: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const createProjectFromRequest = vi.hoisted(() => vi.fn());
const pedirDirecao = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/execution/create-project-from-request", () => ({ createProjectFromRequest }));
vi.mock("@/lib/agency/esteira/marcos", () => ({ pedirDirecao }));

import { nascerDoAceite, STATUS_ACEITO } from "@/lib/agency/esteira/caminho-automatico";

/** Uma solicitação aceita, "caso normal" — a que de fato vira projeto sozinha. */
const PEDIDO = {
  id: "cr1", status: STATUS_ACEITO, businessName: "Cantina Oculta NOME TESTE",
  services: JSON.stringify(["social_media"]), segment: "Restaurante",
  // `chaveDoProspect` é a 1ª condição de "caso normal": sem canal, o projeto
  // nasceria sem para quem falar.
  chaveDoProspect: "email:marina.oculta@cantina-oculta.invalid",
  rawContext: "3 posts por semana no Instagram.",
  // A estimativa gravada é o preço que ele ACEITOU — é ela que faz este pedido
  // ser "caso normal" e virar projeto sozinho (`avaliarCasoNormal`).
  briefingJson: JSON.stringify({
    scope: { wantsSocialMedia: true, social: { postsPerWeek: 3 } },
    estimate: { totalMin: 590, totalMax: 590 },
  }),
  proposalPricing: null, clientId: "c1", createdAt: new Date("2026-08-26T03:46:00Z"),
};

/** O BANCO DE VERDADE em uma coisa só: a reserva é atômica, então apenas o
 *  PRIMEIRO `updateMany` que casar o status encontra a linha. */
function bancoComReserva() {
  let status = STATUS_ACEITO;
  db.clientRequestDb.findUnique.mockImplementation(async () => ({ ...PEDIDO, status }));
  db.clientRequestDb.updateMany.mockImplementation(async ({ where, data }: never) => {
    const w = where as { status?: string };
    const d = data as { status: string };
    if (w.status && w.status !== status) return { count: 0 };
    status = d.status;
    return { count: 1 };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  bancoComReserva();
  db.project.findFirst.mockResolvedValue(null);
  db.activityEvent.create.mockResolvedValue({});
  db.clientRequestDb.update.mockResolvedValue({});
  // A criação é LENTA de propósito — é a janela em que a corrida acontece.
  createProjectFromRequest.mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 30));
    return { ok: true, projectId: `p${createProjectFromRequest.mock.calls.length}` };
  });
});

describe("dois chamadores, um projeto", () => {
  it("🔴 o clique do cliente e o relógio ao mesmo tempo criam UM projeto, não dois", async () => {
    const [a, b] = await Promise.all([
      nascerDoAceite("cr1", "cliente (portal)"),
      nascerDoAceite("cr1", "caminho automático"),
    ]);

    expect(
      createProjectFromRequest,
      "os dois passaram pela idempotência de leitura e os dois criaram — foi isso que produção fez",
    ).toHaveBeenCalledTimes(1);
    // Um cria. O outro NÃO cria — e sai dizendo por quê, nunca em silêncio nem
    // com um projeto inventado. (Quando o vencedor já gravou, ele devolve o
    // projeto DELE; o teste seguinte cobre esse ramo.)
    const criados = [a, b].filter((r) => r.ok && !r.jaExistia);
    expect(criados).toHaveLength(1);
    const perdedor = [a, b].find((r) => !(r.ok && !r.jaExistia))!;
    expect(perdedor.ok ? perdedor.projectId : perdedor.motivo).toMatch(/p1|já está criando/);
  });

  it("quem perde a corrida devolve o projeto do vencedor, não uma falha", async () => {
    // Reserva já tomada por outro processo.
    db.clientRequestDb.updateMany.mockResolvedValue({ count: 0 });
    db.project.findFirst
      .mockResolvedValueOnce(null)          // a idempotência inicial
      .mockResolvedValueOnce({ id: "p-do-vencedor" }); // a leitura depois da reserva perdida
    const r = await nascerDoAceite("cr1");
    expect(r).toEqual({ ok: true, projectId: "p-do-vencedor", jaExistia: true });
    expect(createProjectFromRequest).not.toHaveBeenCalled();
  });

  it("criação que FALHA devolve a reserva — pedido preso é pior que projeto duplicado", async () => {
    createProjectFromRequest.mockResolvedValue({ ok: false, error: "a IA caiu" });
    const r = await nascerDoAceite("cr1");
    expect(r.ok).toBe(false);
    // O status volta para `accepted` para o relógio poder tentar de novo.
    const devolveu = db.clientRequestDb.updateMany.mock.calls.some((c) => {
      const arg = c[0] as { where: { status?: string }; data: { status: string } };
      return arg.where.status === "in_progress" && arg.data.status === STATUS_ACEITO;
    });
    expect(devolveu, "reserva que não se devolve é um pedido que nunca mais nasce").toBe(true);
  });

  it("a idempotência de leitura continua valendo — projeto que JÁ existe não gasta IA", async () => {
    db.project.findFirst.mockResolvedValue({ id: "p-antigo" });
    const r = await nascerDoAceite("cr1");
    expect(r).toEqual({ ok: true, projectId: "p-antigo", jaExistia: true });
    expect(db.clientRequestDb.updateMany, "nem chega a reservar").not.toHaveBeenCalled();
    expect(createProjectFromRequest).not.toHaveBeenCalled();
  });
});
