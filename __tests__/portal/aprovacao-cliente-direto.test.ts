// A correção do 360° do portal (04/08/2026): cliente criado DIRETO — sem
// ClientRequestDb, o caso Foocci — passa a ter aprovação de verdade.
//
// O que estes testes travam:
//   1. A rota de EQUIPE (/api/social-posts/aprovacao) cria UM card clientVisible
//      por clientId, com os posts referenciados — e só a equipe abre.
//   2. A decisão do cliente PROPAGA aos posts: aprovar → "approved";
//      ajuste → "revision_requested" (com o comentário obrigatório intacto).
//   3. Posse por OR sem vazamento: card por clientId aparece no portal do DONO
//      e nunca no de outro cliente.
//   4. A4 fechado até o DOM: em modo cookie a URL de mídia sai SEM ?token=,
//      e a rota de mídia autentica pelo cookie httpOnly.

import { escopoFalso } from "../_stubs/escopo-do-token";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  approvalRequest: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  clientRequestDb: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  socialPost: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  client: { findUnique: vi.fn() },
  brainArtifact: { findMany: vi.fn() },
  project: { findFirst: vi.fn() },
  deliverable: { findMany: vi.fn() },
  materialRequest: { create: vi.fn() },
  portalMessage: { create: vi.fn() },
  mediaAsset: { findUnique: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());
const createApprovalRequest = vi.hoisted(() => vi.fn());
const updateApprovalStatus = vi.hoisted(() => vi.fn());
const addApprovalComment = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const assinaturaValida = vi.hoisted(() => vi.fn());
// `escopoDoToken` (rodada 3): a trava do ponteiro andado mudou de casa.
const escopoDoToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess, escopoDoToken }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ lerArquivo, assinaturaValida }));
vi.mock("@/lib/agency/persistence/approval-service", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agency/persistence/approval-service")>();
  return { ...real, createApprovalRequest, updateApprovalStatus, addApprovalComment };
});
vi.mock("@/lib/agency/execution/create-project-from-request", () => ({ createProjectFromRequest: vi.fn() }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution: vi.fn() }));
vi.mock("@/lib/agency/execution/negotiate-proposal", () => ({ negotiateProposal: vi.fn() }));
vi.mock("@/lib/agency/execution/assess-resources", () => ({ assessResources: vi.fn() }));
vi.mock("@/lib/agency/esteira/refacao", () => ({ refazerPorPedidoDoCliente: vi.fn() }));

import { POST as abrirAprovacao } from "@/app/api/social-posts/aprovacao/route";
import { POST as decidir } from "@/app/api/portal/approvals/route";
import { GET as portalData } from "@/app/api/brain/portal-data/route";
import { GET as servirMidia } from "@/app/api/media/[id]/route";
import { urlDeMidiaDoPortal } from "@/lib/agency/portal/midia";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

// ── Fixtures ────────────────────────────────────────────────────────────────

const SESSAO_MASTER = {
  session: { userId: "u1", email: "master@dioli.studio", name: "Master", role: "master", workspaceId: "ws1" },
  error: null,
};

function postFoocci(i: number, over: Record<string, unknown> = {}) {
  return {
    id: `sp${i}`, clientId: "cli-foocci", caption: `Carrossel ${i} — como o Foocci resolve o dia do dono de restaurante.`,
    format: "carousel", pillar: "lançamento", status: "draft", visibility: "compartilhado",
    scenesJson: JSON.stringify([`capa da peça ${i}`, `dor do dono ${i}`, `CTA ${i}`]),
    scheduledFor: new Date(2026, 7, 10 + i),
    ...over,
  };
}
const SEIS_POSTS = [1, 2, 3, 4, 5, 6].map((i) => postFoocci(i));
const SEIS_IDS = SEIS_POSTS.map((p) => p.id);

const CARD_FOOCCI = {
  id: "ap-cal", clientRequestId: null, clientId: "cli-foocci",
  department: "social-media", clientVisible: true, status: "pending",
  questionOpenedAt: null, clientRequest: null,
  sourcePostIdsJson: JSON.stringify(SEIS_IDS),
  reviewNote: "Carrosséis de lançamento — 6 peças\n\n…",
};

function reqEquipe(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/social-posts/aprovacao", {
    method: "POST", body: JSON.stringify(body),
  });
}
function reqDecisao(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/portal/approvals", {
    method: "POST", body: JSON.stringify({ token: "tok-foocci", approvalRequestId: "ap-cal", ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // rodada 4: as solicitações do escopo saem do CLIENTE, não do token.
  db.clientRequestDb.findMany?.mockResolvedValue?.([{ id: "cr1" }]);
  escopoDoToken.mockImplementation(escopoFalso(validatePortalAccess, db));
  requireSession.mockResolvedValue(SESSAO_MASTER);
  db.socialPost.findMany.mockResolvedValue(SEIS_POSTS);
  db.socialPost.updateMany.mockResolvedValue({ count: 6 });
  db.socialPost.update.mockResolvedValue({});
  db.socialPost.findFirst.mockResolvedValue(null);
  db.approvalRequest.findMany.mockResolvedValue([]);
  db.approvalRequest.findUnique.mockResolvedValue({ ...CARD_FOOCCI });
  db.approvalRequest.update.mockResolvedValue({});
  db.approvalRequest.count.mockResolvedValue(0);
  createApprovalRequest.mockResolvedValue({ id: "ap-cal" });
  updateApprovalStatus.mockResolvedValue({ id: "ap-cal", status: "approved", reviewedAt: new Date() });
  addApprovalComment.mockResolvedValue({ id: "cm1" });
  // ⚠️ 15/08/2026 (rodada 4) — O TOKEN PASSOU A EXIGIR `clientId` NO REGISTRO.
  // `PortalAccess.clientId` virou a ÚNICA prova de pertencimento de um token:
  // sem ela não se DERIVA dono do ponteiro `ClientRequestDb.clientId`, porque
  // derivar de ponteiro mutável foi o que produziu o incidente (um link legado
  // do cliente A abria o portal do cliente B). Por isso os fixtures abaixo
  // carregam o dono, que é a forma que os links emitidos passam a ter.
  // Token legado (sem `clientId`) é RECUSADO — ver a pendência de reemissão.
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: "cli-foocci" } });
});

// ── 1. A rota de equipe abre o card ─────────────────────────────────────────

describe("POST /api/social-posts/aprovacao — a equipe abre a aprovação do calendário", () => {
  it("cria UM card clientVisible por clientId, com os 6 posts referenciados", async () => {
    const res = await abrirAprovacao(reqEquipe({ postIds: SEIS_IDS }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.approvalRequestId).toBe("ap-cal");
    expect(json.titulo).toBe("Carrosséis de lançamento — 6 peças");

    expect(createApprovalRequest).toHaveBeenCalledTimes(1);
    const arg = createApprovalRequest.mock.calls[0]![0];
    expect(arg.clientId).toBe("cli-foocci");
    expect(arg.clientVisible).toBe(true);
    expect(arg.department).toBe("social-media");
    expect(arg.sourcePostIds).toEqual(SEIS_IDS);
    // Origem marcada: quem abriu foi a equipe, não o fluxo Brain.
    expect(arg.requestedBy).toContain("equipe:");
    // O corpo é o formato que o portal já renderiza: título na 1ª linha,
    // peças com legenda e TELAS (scenesJson) no resto.
    expect(arg.reviewNote.split("\n")[0]).toBe("Carrosséis de lançamento — 6 peças");
    expect(arg.reviewNote).toContain("- Telas: 1) capa da peça 1");
    expect(arg.reviewNote).toContain("- Legenda: Carrossel 3");
  });

  it("sem sessão de equipe → 401; cliente não abre aprovação para si", async () => {
    requireSession.mockResolvedValue({ session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    const res = await abrirAprovacao(reqEquipe({ postIds: SEIS_IDS }));
    expect(res.status).toBe(401);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("posts de clientes MISTURADOS não viram um card — um cliente não decide pelo outro", async () => {
    db.socialPost.findMany.mockResolvedValue([postFoocci(1), postFoocci(2, { clientId: "cli-outro" })]);
    const res = await abrirAprovacao(reqEquipe({ postIds: ["sp1", "sp2"] }));
    expect(res.status).toBe(400);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("post 'interno' não entra em card clientVisible — fail-closed", async () => {
    db.socialPost.findMany.mockResolvedValue([postFoocci(1, { visibility: "interno" })]);
    const res = await abrirAprovacao(reqEquipe({ postIds: ["sp1"] }));
    expect(res.status).toBe(400);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("post já num card pendente → 409; a mesma peça não se decide duas vezes", async () => {
    db.approvalRequest.findMany.mockResolvedValue([
      { id: "ap-antigo", sourcePostIdsJson: JSON.stringify(["sp3"]) },
    ]);
    const res = await abrirAprovacao(reqEquipe({ postIds: SEIS_IDS }));
    expect(res.status).toBe(409);
    expect(createApprovalRequest).not.toHaveBeenCalled();
  });

  it("id de post que não existe (ou de outro workspace) → 404", async () => {
    db.socialPost.findMany.mockResolvedValue([postFoocci(1)]);
    const res = await abrirAprovacao(reqEquipe({ postIds: ["sp1", "sp-fantasma"] }));
    expect(res.status).toBe(404);
  });
});

// ── 2. A decisão propaga aos posts ──────────────────────────────────────────

describe("decisão do cliente propaga status aos posts do card", () => {
  // 05/08/2026 — o beco sem saída. Aprovar gravava "approved", e NADA no
  // repositório movia `approved → scheduled`: `publicarAgendados` só busca
  // "scheduled". O cliente aprovava os 6 carrosséis, a tela dizia "Aprovado por
  // você", e nenhum post ia ao ar — nunca. A decisão agora PROMOVE a peça.
  it("aprovar → as 6 peças viram 'scheduled', que é o único estado que o relógio publica", async () => {
    const res = await decidir(reqDecisao({ action: "approve" }));
    expect(res.status).toBe(200);
    // Nenhuma peça fica em "approved": um segundo nome para o mesmo estado é
    // como nasce a próxima divergência.
    expect(db.socialPost.updateMany).not.toHaveBeenCalled();
    expect(db.socialPost.update).toHaveBeenCalledTimes(6);
    for (const call of db.socialPost.update.mock.calls) {
      expect(call[0].data.status).toBe("scheduled");
    }
    // A busca das peças é filtrada pelo dono do CARD — id de post de outro
    // cliente dentro do JSON continua intocável.
    expect(db.socialPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: SEIS_IDS }, clientId: "cli-foocci" },
    }));
  });

  // A prova de que a corrente fecha: o estado gravado pela decisão é exatamente
  // o que `publicarAgendados` procura, e a data nunca é passado.
  it("a peça aprovada é ENCONTRADA por publicarAgendados — e nunca com data vencida", async () => {
    await decidir(reqDecisao({ action: "approve" }));
    const gravados = db.socialPost.update.mock.calls.map((c) => c[0].data as { status: string; scheduledFor: Date });

    // O filtro do relógio, escrito aqui como contrato: status + hora chegada.
    const relogio = (p: { status: string; scheduledFor: Date }, agora: Date) =>
      p.status === "scheduled" && p.scheduledFor <= agora;

    // Hoje nenhuma vai ao ar (todas no futuro): o cliente aprovou, não mandou
    // publicar agora. Amanhã de madrugada, o relógio encontra todas.
    expect(gravados.some((p) => relogio(p, new Date()))).toBe(false);
    const daquiUmMes = new Date(Date.now() + 31 * 24 * 60 * 60_000);
    expect(gravados.filter((p) => relogio(p, daquiUmMes))).toHaveLength(6);
  });

  it("pedir ajuste COM comentário → posts viram 'revision_requested' e o comentário vai ao registro", async () => {
    updateApprovalStatus.mockResolvedValue({ id: "ap-cal", status: "revision_requested", reviewedAt: new Date() });
    const res = await decidir(reqDecisao({ action: "request_revision", comment: "troca a capa da peça 2" }));
    expect(res.status).toBe(200);
    expect(db.socialPost.updateMany).toHaveBeenCalledWith({
      where: { id: { in: SEIS_IDS }, clientId: "cli-foocci" },
      data: { status: "revision_requested" },
    });
    expect(addApprovalComment).toHaveBeenCalledWith(expect.objectContaining({
      approvalRequestId: "ap-cal", authorRole: "client", isClientVisible: true,
      body: "troca a capa da peça 2",
    }));
  });

  it("ajuste SEM comentário continua 400 — nada propaga (não regride o Lote 1)", async () => {
    const res = await decidir(reqDecisao({ action: "request_revision" }));
    expect(res.status).toBe(400);
    expect(db.socialPost.updateMany).not.toHaveBeenCalled();
    expect(updateApprovalStatus).not.toHaveBeenCalled();
  });

  it("o corpo do card (reviewNote) NÃO é reescrito pela decisão — a nota vai só ao ApprovalComment", async () => {
    updateApprovalStatus.mockResolvedValue({ id: "ap-cal", status: "revision_requested", reviewedAt: new Date() });
    await decidir(reqDecisao({ action: "request_revision", comment: "ajusta o tom" }));
    // 4º argumento (reviewNote) undefined = preserva o corpo que o cliente leu.
    expect(updateApprovalStatus).toHaveBeenCalledWith("ap-cal", "revision_requested", expect.any(String), undefined);
  });
});

// ── 3. Posse: o card aparece para o dono e NUNCA para outro ─────────────────

describe("posse por clientId — dono derivado do token, sem vazamento", () => {
  it("token de OUTRO cliente não decide o card da Foocci → 403", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: "cli-outro" } });
    const res = await decidir(reqDecisao({ action: "approve" }));
    expect(res.status).toBe(403);
    expect(updateApprovalStatus).not.toHaveBeenCalled();
    expect(db.socialPost.updateMany).not.toHaveBeenCalled();
  });

  it("portal-data do cliente direto busca aprovações PELO clientId do token", async () => {
    db.clientRequestDb.findFirst.mockResolvedValue(null); // sem solicitação Brain
    db.client.findUnique.mockResolvedValue({ id: "cli-foocci", name: "Foocci" });
    db.approvalRequest.findMany.mockResolvedValue([{
      ...CARD_FOOCCI, reviewedAt: null, expiresAt: null, deliverableVersion: null, comments: [],
    }]);

    const res = await portalData(new NextRequest("http://localhost/api/brain/portal-data?token=tok-foocci"));
    const json = await res.json();

    // A consulta deriva o dono do TOKEN — nunca de query/corpo.
    expect(db.approvalRequest.findMany.mock.calls[0]![0].where).toMatchObject({
      clientId: "cli-foocci", clientVisible: true,
    });
    // O Início e a aba de Aprovações passam a ter a MESMA fonte: este payload.
    expect(json.approvals).toHaveLength(1);
    expect(json.approvals[0].status).toBe("pending");
    expect(json.approvals[0].reviewNote).toContain("Carrosséis de lançamento");
  });

  it("portal-data por solicitação inclui o OR por clientId — as duas chaves do mesmo dono", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: "cli1" } });
    db.clientRequestDb.findUnique.mockResolvedValue({
      id: "cr1", clientId: "cli-foocci", businessName: "Foocci", status: "in_production",
      services: "[]", objectives: "[]", briefingJson: "{}", segment: "", createdAt: new Date(),
    });
    db.brainArtifact.findMany.mockResolvedValue([]);
    db.project.findFirst.mockResolvedValue(null);

    await portalData(new NextRequest("http://localhost/api/brain/portal-data?token=tok-foocci"));
    expect(db.approvalRequest.findMany.mock.calls[0]![0].where).toMatchObject({
      clientVisible: true,
      OR: [{ clientRequestId: "cr1" }, { clientId: "cli-foocci" }],
    });
  });
});

// ── 4. A4 até o DOM: mídia sem token em modo cookie ─────────────────────────

describe("mídia sem credencial no DOM (modo cookie)", () => {
  it("urlDeMidiaDoPortal: token vazio → URL limpa; token presente → compatibilidade", () => {
    expect(urlDeMidiaDoPortal("/api/media/m1", "")).toBe("/api/media/m1");
    expect(urlDeMidiaDoPortal("/api/media/m1", "tok")).toBe("/api/media/m1?token=tok");
    expect(urlDeMidiaDoPortal("/api/media/m1?x=1", "tok")).toBe("/api/media/m1?x=1&token=tok");
    expect(urlDeMidiaDoPortal(null, "tok")).toBeNull();
  });

  it("a rota de mídia serve a capa SÓ com o cookie httpOnly — sem ?token= na URL", async () => {
    db.mediaAsset.findUnique.mockResolvedValue({
      id: "m1", clientId: "cli-foocci", clientRequestId: null, workspaceId: "ws1",
      mimeType: "image/png", sizeBytes: 4, fileName: "capa.png", storagePath: "/x/capa.png",
    });
    assinaturaValida.mockReturnValue(false);
    lerArquivo.mockResolvedValue(Buffer.from("png!"));

    const req = new NextRequest("http://localhost/api/media/m1", {
      headers: { cookie: `${PORTAL_COOKIE}=tok-foocci` },
    });
    const res = await servirMidia(req, { params: Promise.resolve({ id: "m1" }) });

    expect(res.status).toBe(200);
    // A credencial usada foi a do cookie — derivação do dono intacta.
    expect(validatePortalAccess).toHaveBeenCalledWith("tok-foocci");
  });

  it("cookie de OUTRO cliente não abre a mídia — 404, nunca 403", async () => {
    db.mediaAsset.findUnique.mockResolvedValue({
      id: "m1", clientId: "cli-foocci", clientRequestId: null, workspaceId: "ws1",
      mimeType: "image/png", sizeBytes: 4, fileName: "capa.png", storagePath: "/x/capa.png",
    });
    assinaturaValida.mockReturnValue(false);
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: "cli-outro" } });

    const req = new NextRequest("http://localhost/api/media/m1", {
      headers: { cookie: `${PORTAL_COOKIE}=tok-outro` },
    });
    const res = await servirMidia(req, { params: Promise.resolve({ id: "m1" }) });
    expect(res.status).toBe(404);
  });
});
