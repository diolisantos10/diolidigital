// A camada de dados dos carrosséis no portal (pedido do CEO, 04/08/2026):
// (1) o card de aprovação deixa de ser só texto — sai `pecas` estruturado
//     (imagem + legenda), lendo a ponte sourcePostIdsJson que só era usada
//     na escrita;
// (2) o post do calendário sai com `telas` (mediaUrlsJson) — o cliente vê o
//     carrossel inteiro, não só a miniatura da capa.
//
// O que estes testes travam:
//   • parse defensivo: mediaUrlsJson quebrado vira [], nunca 500;
//   • fronteira: scriptJson/scenesJson continuam sem atravessar; post
//     não-"compartilhado" NUNCA vira peça nem entra no calendário;
//   • posse: post de OUTRO dono referenciado num card não abre porta;
//   • fallback: card sem posts mas com DeliverableVersion.mediaAssetIds
//     (nunca lido até hoje) vira peça com URLs /api/media/<id>;
//   • PATCH aceita mediaUrlsJson como array de strings, normalizado.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  clientRequestDb: { findUnique: vi.fn(), findFirst: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
  client: { findUnique: vi.fn() },
  brainArtifact: { findMany: vi.fn() },
  project: { findMany: vi.fn(), findFirst: vi.fn() },
  deliverable: { findMany: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const resolvePortalClient = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess, resolvePortalClient }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET as listarPosts } from "@/app/api/social-posts/route";
import { GET as projetosPortal } from "@/app/api/portal/projetos/route";
import { GET as portalData } from "@/app/api/brain/portal-data/route";
import { PATCH as editarPost } from "@/app/api/social-posts/[id]/route";

const TELAS = ["/api/media/m1", "/api/media/m2", "/api/media/m3"];

function postCarrossel(over: Record<string, unknown> = {}) {
  return {
    id: "sp1", clientId: "cli-foocci", clientRequestId: null,
    caption: "Carrossel 1 — como o Foocci resolve o dia do dono de restaurante.",
    networks: '["instagram"]', format: "carousel", pillar: "lançamento",
    mediaUrl: "/api/media/m1", mediaUrlsJson: JSON.stringify(TELAS),
    scenesJson: '["capa","dor","cta"]', scriptJson: null,
    visibility: "compartilhado", scheduledFor: new Date("2026-08-10T12:00:00Z"),
    status: "scheduled", createdAt: new Date(), updatedAt: new Date(),
    ...over,
  };
}

const SESSAO = { session: { userId: "u1", email: "m@d", name: "M", role: "master", workspaceId: "ws1" }, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(SESSAO);
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: "cli-foocci" } });
  resolvePortalClient.mockResolvedValue({ clientId: "cli-foocci", workspaceId: "ws1" });
  db.socialPost.findMany.mockResolvedValue([postCarrossel()]);
  db.project.findMany.mockResolvedValue([]);
  db.approvalRequest.findMany.mockResolvedValue([]);
});

// ── 1. GET /api/social-posts — telas no DTO ─────────────────────────────────

describe("GET /api/social-posts — as telas do carrossel saem no DTO", () => {
  it("ramo de sessão: telas parseadas de mediaUrlsJson, na ordem gravada", async () => {
    const res = await listarPosts(new NextRequest("http://localhost/api/social-posts"));
    const json = await res.json();
    expect(json.posts[0].telas).toEqual(TELAS);
  });

  it("ramo de token (portal): telas presentes, script continua AUSENTE", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
    const res = await listarPosts(new NextRequest("http://localhost/api/social-posts?token=tok-1"));
    const json = await res.json();
    expect(json.posts[0].telas).toEqual(TELAS);
    expect(Object.keys(json.posts[0])).not.toContain("script");
    // A descrição interna das cenas também não atravessa.
    expect(JSON.stringify(json)).not.toContain("scenesJson");
  });

  it("mediaUrlsJson QUEBRADO vira [] — parse defensivo, nunca 500", async () => {
    db.socialPost.findMany.mockResolvedValue([postCarrossel({ mediaUrlsJson: "{corrompido" })]);
    const res = await listarPosts(new NextRequest("http://localhost/api/social-posts"));
    expect(res.status).toBe(200);
    expect((await res.json()).posts[0].telas).toEqual([]);
  });

  it("lixo dentro da lista (números, objetos) é filtrado — só strings sobrevivem", async () => {
    db.socialPost.findMany.mockResolvedValue([postCarrossel({ mediaUrlsJson: '["/api/media/m1", 42, {"x":1}, "/api/media/m2"]' })]);
    const res = await listarPosts(new NextRequest("http://localhost/api/social-posts"));
    expect((await res.json()).posts[0].telas).toEqual(["/api/media/m1", "/api/media/m2"]);
  });
});

// ── 2. GET /api/portal/projetos — telas no calendário ───────────────────────

describe("GET /api/portal/projetos — o calendário sai com as telas", () => {
  it("cada item do calendário traz telas + caption completa", async () => {
    const res = await projetosPortal(new NextRequest("http://localhost/api/portal/projetos?token=tok-a"));
    const json = await res.json();
    expect(json.calendario[0].telas).toEqual(TELAS);
    expect(json.calendario[0].caption).toContain("dono de restaurante");
  });

  it("mediaUrlsJson quebrado vira [] sem derrubar a rota", async () => {
    db.socialPost.findMany.mockResolvedValue([postCarrossel({ mediaUrlsJson: "não é json" })]);
    const res = await projetosPortal(new NextRequest("http://localhost/api/portal/projetos?token=tok-a"));
    expect(res.status).toBe(200);
    expect((await res.json()).calendario[0].telas).toEqual([]);
  });

  it("a consulta continua exigindo visibility 'compartilhado' — interno não entra no calendário", async () => {
    await projetosPortal(new NextRequest("http://localhost/api/portal/projetos?token=tok-a"));
    expect(db.socialPost.findMany.mock.calls[0]![0].where).toEqual({
      clientId: "cli-foocci", visibility: "compartilhado",
    });
  });

  it("scriptJson e scenesJson NÃO existem no payload do portal", async () => {
    const res = await projetosPortal(new NextRequest("http://localhost/api/portal/projetos?token=tok-a"));
    const texto = JSON.stringify(await res.json());
    expect(texto).not.toContain("scriptJson");
    expect(texto).not.toContain("scenesJson");
  });
});

// ── 3. portal-data — o card de aprovação estruturado (pecas) ────────────────

function cardFoocci(over: Record<string, unknown> = {}) {
  return {
    id: "ap-cal", clientRequestId: null, clientId: "cli-foocci",
    department: "social-media", status: "pending", reviewedAt: null, expiresAt: null,
    questionOpenedAt: null, reviewNote: "Carrosséis de lançamento — 6 peças\n\n…",
    sourcePostIdsJson: JSON.stringify(["sp1", "sp2"]),
    deliverableVersion: null, comments: [],
    ...over,
  };
}

describe("portal-data — pecas estruturadas a partir de sourcePostIdsJson", () => {
  beforeEach(() => {
    // Cliente direto (o caso Foocci): sem ClientRequestDb.
    db.clientRequestDb.findFirst.mockResolvedValue(null);
    db.client.findUnique.mockResolvedValue({ id: "cli-foocci", name: "Foocci" });
    db.approvalRequest.findMany.mockResolvedValue([cardFoocci()]);
    db.socialPost.findMany.mockResolvedValue([
      postCarrossel({ id: "sp1" }),
      postCarrossel({ id: "sp2", mediaUrlsJson: "[]", mediaUrl: "/api/media/capa2", caption: "Peça 2" }),
    ]);
  });

  function req() {
    return new NextRequest("http://localhost/api/brain/portal-data?token=tok-foocci");
  }

  it("o card sai com pecas: id, caption, capa e telas de CADA post, na ordem do card", async () => {
    const json = await (await portalData(req())).json();
    const pecas = json.approvals[0].pecas;
    expect(pecas).toHaveLength(2);
    expect(pecas[0]).toMatchObject({
      id: "sp1", format: "carousel", pillar: "lançamento",
      capa: "/api/media/m1", telas: TELAS,
    });
    expect(pecas[0].caption).toContain("dono de restaurante");
    // Peça sem telas ainda (mediaUrlsJson vazio) vem com telas: [] e a capa.
    expect(pecas[1]).toMatchObject({ id: "sp2", capa: "/api/media/capa2", telas: [] });
    // O reviewNote textual continua — resumo/fallback para cards antigos.
    expect(json.approvals[0].reviewNote).toContain("Carrosséis de lançamento");
  });

  it("a consulta das peças exige visibility 'compartilhado' — post interno NUNCA vira peça", async () => {
    await portalData(req());
    const chamada = db.socialPost.findMany.mock.calls.find(
      (c) => c[0]?.where?.id?.in,
    );
    expect(chamada![0].where).toMatchObject({ visibility: "compartilhado" });
  });

  it("post de OUTRO cliente referenciado no card é descartado — id não abre porta", async () => {
    db.socialPost.findMany.mockResolvedValue([
      postCarrossel({ id: "sp1" }),
      postCarrossel({ id: "sp2", clientId: "cli-outro", caption: "segredo do outro cliente" }),
    ]);
    const json = await (await portalData(req())).json();
    expect(json.approvals[0].pecas).toHaveLength(1);
    expect(JSON.stringify(json)).not.toContain("segredo do outro cliente");
  });

  it("sourcePostIdsJson quebrado ou vazio → pecas [] sem derrubar a rota", async () => {
    db.approvalRequest.findMany.mockResolvedValue([cardFoocci({ sourcePostIdsJson: "{ruim" })]);
    const res = await portalData(req());
    expect(res.status).toBe(200);
    expect((await res.json()).approvals[0].pecas).toEqual([]);
  });

  it("fallback: card SEM posts mas com DeliverableVersion.mediaAssetIds vira UMA peça /api/media/<id>", async () => {
    db.approvalRequest.findMany.mockResolvedValue([cardFoocci({
      sourcePostIdsJson: "[]",
      deliverableVersion: {
        number: 2, content: "corpo da v2", mediaAssetIds: JSON.stringify(["ma1", "ma2"]),
        deliverable: { name: "Carrossel" },
      },
    })]);
    const json = await (await portalData(req())).json();
    const pecas = json.approvals[0].pecas;
    expect(pecas).toHaveLength(1);
    expect(pecas[0].telas).toEqual(["/api/media/ma1", "/api/media/ma2"]);
    expect(pecas[0].capa).toBe("/api/media/ma1");
    expect(pecas[0].caption).toBe("corpo da v2");
  });

  it("no ramo COM solicitação (buildPortalData) as pecas saem igual — as duas portas falam a mesma língua", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
    db.clientRequestDb.findUnique.mockResolvedValue({
      id: "cr1", clientId: "cli-foocci", businessName: "Foocci", status: "in_production",
      services: "[]", objectives: "[]", briefingJson: "{}", segment: "", createdAt: new Date(),
    });
    db.brainArtifact.findMany.mockResolvedValue([]);
    db.project.findFirst.mockResolvedValue(null);
    const json = await (await portalData(req())).json();
    expect(json.approvals[0].pecas).toHaveLength(2);
    expect(json.approvals[0].pecas[0].telas).toEqual(TELAS);
  });
});

// ── 4. PATCH /api/social-posts/[id] — mediaUrlsJson pela API ────────────────

describe("PATCH /api/social-posts/[id] — aceita mediaUrlsJson (equipe)", () => {
  function reqPatch(body: Record<string, unknown>) {
    return new NextRequest("http://localhost/api/social-posts/sp1", {
      method: "PATCH", body: JSON.stringify(body),
    });
  }
  const ctx = { params: Promise.resolve({ id: "sp1" }) };

  beforeEach(() => {
    db.socialPost.findFirst.mockResolvedValue(postCarrossel());
    db.socialPost.update.mockResolvedValue({ id: "sp1" });
  });

  it("array de strings é validado e normalizado para JSON", async () => {
    const res = await editarPost(reqPatch({ mediaUrlsJson: ["/api/media/a", "/api/media/b"] }), ctx);
    expect(res.status).toBe(200);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrlsJson)
      .toBe(JSON.stringify(["/api/media/a", "/api/media/b"]));
  });

  it("lixo dentro do array é filtrado; strings vazias caem fora", async () => {
    await editarPost(reqPatch({ mediaUrlsJson: ["/api/media/a", 42, null, "  ", "/api/media/b"] }), ctx);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrlsJson)
      .toBe(JSON.stringify(["/api/media/a", "/api/media/b"]));
  });

  it("valor que NÃO é array é ignorado — não zera as telas existentes por engano", async () => {
    await editarPost(reqPatch({ mediaUrlsJson: "não-é-array", caption: "nova" }), ctx);
    expect(db.socialPost.update.mock.calls[0]![0].data).not.toHaveProperty("mediaUrlsJson");
  });

  it("array vazio LIMPA de propósito", async () => {
    await editarPost(reqPatch({ mediaUrlsJson: [] }), ctx);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrlsJson).toBe("[]");
  });

  it("sem sessão de equipe → 401; o guard não mudou", async () => {
    requireSession.mockResolvedValue({ session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    const res = await editarPost(reqPatch({ mediaUrlsJson: ["/x"] }), ctx);
    expect(res.status).toBe(401);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });
});
