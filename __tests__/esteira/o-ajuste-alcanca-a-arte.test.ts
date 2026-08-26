// O AJUSTE DO CLIENTE TEM DE ALCANÇAR A ARTE — e, quando não alcança, gritar.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE FOI MEDIDO EM PRODUÇÃO (cliente oculto, 6ª rodada)
// ═══════════════════════════════════════════════════════════════════════════
//
// O cliente pediu ajuste. A rota devolveu **200**. E **0 de 2 arquivos
// mudaram** — sha256 reconferido seis minutos depois, byte por byte idêntico.
//
// A rodada anterior tinha fechado DOIS caminhos (o do título e o do card de
// `pedido:<id>`). Este é o terceiro, e é o do card genérico:
//
//   • sem `deliverableId` no card e sem entrada em
//     `entregaMostradaPorDepartamento`, a mira caía no fallback "o
//     departamento" e `alvos` ficava com VÁRIAS entregas;
//   • o laço de arte exige `alvos.length === 1` (a correspondência
//     peça↔texto só é decidível sobre UMA entrega), então ele **não roda**;
//   • e — a metade que dói — `saida.arte` ficava `null`, `arteDevia` se
//     calculava como `saida.arte != null && …` ou seja **false**, e o card
//     REABRIA em `pending`. A falha se autoabsolvia. O cliente era chamado a
//     decidir de novo sobre exatamente a imagem que acabara de recusar, com a
//     tela dizendo que tinha sido refeita.
//
// ── OS DOIS CONSERTOS QUE ESTE ARQUIVO PRENDE ──────────────────────────────
//
//  1. **A MIRA POR PROVA.** `SocialPost.deliverableId` é a chave de quem gerou
//     a peça. As peças que o card mostrou APONTAM, por FK, para a entrega que
//     as fez. Isso não é inferência — é o banco dizendo. Com ela a mira fecha
//     em UMA entrega e o laço de arte roda.
//  2. **A TRAVA GÊMEA.** Quando o laço de arte não roda e o card mostrava
//     peça, o card NÃO reabre: a equipe é escalada com dono e próxima ação, e
//     a peça recebe na tela do cliente o aviso honesto de que a imagem ainda é
//     a anterior.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  contentRequest: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
  pagamentoConfirmado: {
    findUnique: vi.fn(async () => ({
      valorCentavos: 7900, origem: "mercadopago", confirmadoEm: new Date("2026-08-25T00:00:00.000Z"),
    })),
  },
  project: { findFirst: vi.fn() },
  client: { findUnique: vi.fn(async () => ({ name: "Cantina da Prova", workspaceId: "ws1" })) },
  clientRequestDb: { findUnique: vi.fn() },
  cycle: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  deliverableVersion: { create: vi.fn(async () => ({ id: "ver-nova" })), findFirst: vi.fn(async () => null) },
  approvalRequest: { updateMany: vi.fn() },
  portalMessage: { create: vi.fn() },
  socialPost: {
    findMany: vi.fn<() => Promise<Array<{ deliverableId: string | null }>>>(async () => []),
    update: vi.fn(), updateMany: vi.fn(),
  },
  brainArtifact: {
    findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), create: vi.fn(async () => ({})),
  },
  activityEvent: { create: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const refazerArteDoAjuste = vi.hoisted(() => vi.fn());
// O card GENÉRICO de produção: o departamento não tem entrada aqui, então a
// mira nº 2 (a peça que o card mostrou) não resolve. É exatamente o estado em
// que `alvos` ficava com VÁRIAS entregas e o laço de arte nunca rodava.
const entregaMostradaPorDepartamento = vi.hoisted(() => vi.fn(async () => new Map()));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/esteira/pacote", async (orig) => {
  const real = await orig<typeof import("@/lib/agency/esteira/pacote")>();
  return { ...real, entregaMostradaPorDepartamento };
});
vi.mock("@/lib/agency/esteira/refazer-a-arte-do-ajuste", async (orig) => {
  const real = await orig<typeof import("@/lib/agency/esteira/refazer-a-arte-do-ajuste")>();
  return { ...real, refazerArteDoAjuste };
});

import { refazerPorPedidoDoCliente } from "@/lib/agency/esteira/refacao";
import { AVISO_DA_ARTE_QUE_NAO_SAIU } from "@/lib/agency/esteira/refazer-a-arte-do-ajuste";

// DUAS peças no card, e DUAS entregas no departamento — o cenário exato: sem
// `deliverableId`, a mira antiga varria as duas e o laço de arte nunca rodava.
const PAUTA = {
  id: "pauta-do-mes", name: "Pauta do Mês", ownerAgentId: "a3", version: 1,
  content: "**1. Semana 1**\n- Headline: título antigo",
  clientFeedback: null as string | null, revisionStatus: null as string | null, type: "social",
};
const COPY = { ...PAUTA, id: "copy-dos-posts", name: "Copy dos posts", ownerAgentId: "social-copy" };

const TEXTO_NOVO = {
  ok: true,
  data: {
    title: "Pauta do Mês",
    summary: "Ajustado como o cliente pediu.",
    items: [
      { headline: "Pão quentinho", caption: "Saiu do forno agora, passa aqui que a gente te espera." },
      { headline: "A fornada das seis", caption: "Todo dia às seis sai a primeira fornada, e o cheiro toma a rua." },
      { headline: "Quem faz o seu pão", caption: "O time da casa chega às quatro para o pão estar pronto quando você acorda." },
      { headline: "O bolo do fim de semana", caption: "Sábado tem bolo de fubá saindo quente durante toda a manhã." },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.project.findFirst.mockResolvedValue({
    id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
    client: { name: "Cantina da Prova", phone: null, email: null },
  });
  db.clientRequestDb.findUnique.mockResolvedValue({
    businessName: "Cantina da Prova", clientId: "c1", createdAt: new Date("2026-08-01T00:00:00.000Z"),
  });
  db.cycle.findFirst.mockResolvedValue({ id: "cy1" });
  db.deliverable.findMany.mockResolvedValue([{ ...PAUTA }, { ...COPY }]);
  db.deliverable.update.mockResolvedValue({});
  db.approvalRequest.updateMany.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  db.socialPost.updateMany.mockResolvedValue({ count: 2 });
  generate.mockResolvedValue(TEXTO_NOVO);
  refazerArteDoAjuste.mockResolvedValue({
    refeitas: [{ postId: "post-1", de: "/api/media/velha", para: "/api/media/nova" }],
    preservadas: [], mira: null,
  });
});

const ajuste = (extra: Record<string, unknown> = {}) =>
  refazerPorPedidoDoCliente({
    clientRequestId: "cr1", department: "social-media",
    comentario: "essa peça ficou escura demais, quero mais clara",
    modo: "ajuste", postIds: ["post-1", "post-2"], ...extra,
  });

describe("1. a mira vem das PEÇAS, por chave estrangeira — prova, não palpite", () => {
  it("as peças do card apontam para UMA entrega: o laço de arte roda", async () => {
    // `SocialPost.deliverableId` — o banco dizendo quem gerou cada peça.
    db.socialPost.findMany.mockResolvedValue([
      { deliverableId: "pauta-do-mes" }, { deliverableId: "pauta-do-mes" },
    ]);
    db.deliverable.findFirst.mockResolvedValue({ ...PAUTA });

    const r = await ajuste();

    expect(refazerArteDoAjuste, "sem o laço de arte, nenhum arquivo muda — foi isso que foi medido")
      .toHaveBeenCalledOnce();
    expect(r.arte?.refeitas).toHaveLength(1);
    expect(r.escalado).toBeFalsy();

    // E a leitura carrega a POSSE: peça de outro cliente não entra por aqui.
    const where = (db.socialPost.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.id).toEqual({ in: ["post-1", "post-2"] });
  });

  it("a mira por FK só vale quando o card mostra peça — sem peça, nada muda", async () => {
    await refazerPorPedidoDoCliente({
      clientRequestId: "cr1", department: "social-media",
      comentario: "muda o texto", modo: "ajuste",
    });
    expect(db.socialPost.findMany, "entrega sem peça visual não abre leitura de peça").not.toHaveBeenCalled();
  });

  it("peças de DUAS entregas diferentes NÃO fecham a mira — fail-closed", async () => {
    // Escrever o texto de uma peça na imagem de outra é pior que não refazer.
    db.socialPost.findMany.mockResolvedValue([
      { deliverableId: "pauta-do-mes" }, { deliverableId: "copy-dos-posts" },
    ]);
    const r = await ajuste();
    expect(refazerArteDoAjuste).not.toHaveBeenCalled();
    expect(r.escalado, "não fechou a mira ⇒ tem de escalar, nunca seguir calado").toBe(true);
  });
});

describe("2. quando o laço de arte NÃO roda, o card não reabre calado", () => {
  beforeEach(() => {
    // Sem FK nas peças: a mira não fecha e o laço de arte não roda. É o estado
    // exato de produção — e o que ele fazia era devolver 200 em silêncio.
    db.socialPost.findMany.mockResolvedValue([{ deliverableId: null }, { deliverableId: null }]);
  });

  it("🔴 o card NÃO volta a pedir decisão sobre a imagem que ele acabou de recusar", async () => {
    const r = await ajuste();

    expect(r.escalado, "a equipe tem de ser acionada, com dono e próxima ação").toBe(true);
    expect(r.motivo, "o motivo tem de nomear a mira e dizer que as imagens NÃO foram tocadas")
      .toMatch(/mira da imagem não fechou/i);
    expect(r.motivo).toMatch(/Dono: a agência/);
    expect(r.motivo).toMatch(/Próxima ação:/);

    // O card reabrir em `pending` é a mentira de estado: "refizemos" sobre a
    // mesma imagem. `updateMany` de aprovação com status pendente não pode sair.
    const reabriu = db.approvalRequest.updateMany.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === "pending",
    );
    expect(reabriu, "o card reabriu em pending com a arte velha — é a mentira que este teste mata")
      .toBe(false);
  });

  it("e a frase honesta chega à TELA dele, não só ao log", async () => {
    await ajuste();
    const escreveuAviso = db.socialPost.updateMany.mock.calls.some((c) => {
      const arg = c[0] as { data?: { avisoAoCliente?: string } };
      return arg.data?.avisoAoCliente === AVISO_DA_ARTE_QUE_NAO_SAIU;
    });
    expect(escreveuAviso, "régua verde sobre o componente errado é pior que régua nenhuma").toBe(true);
  });

  it("o TEXTO ajustado FICA — foi a correção que ele pediu, e ela está certa", async () => {
    const r = await ajuste();
    expect(r.refeitas.length).toBeGreaterThan(0);
  });
});
