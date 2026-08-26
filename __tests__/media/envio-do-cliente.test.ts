// POST /api/media pelo TOKEN DO PORTAL — as duas coisas que estavam erradas.
//
//  1. WORKSPACE ARBITRÁRIO (item 12 do raio-x). A rota fazia
//     `workspaceId = req?.workspaceId ?? (await agencyWorkspace.findFirst()).id`.
//     Token de cliente criado DIRETO não tem `clientRequestId` (o caso Foocci):
//     o arquivo dele ia parar no PRIMEIRO workspace do banco — a casa errada.
//     `resolvePortalClient` já devolvia cliente E workspace derivados do token,
//     e não era usado.
//
//  2. BECO DO MATERIAL. O upload criava um `MediaAsset` e parava ali: não tocava
//     `MaterialRequest`, não retomava produção, não avisava ninguém — enquanto a
//     tela dizia "A equipe já foi avisada".

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  clientRequestDb: { findUnique: vi.fn(), findFirst: vi.fn() },
  client: { findUnique: vi.fn(), findFirst: vi.fn() },
  agencyWorkspace: { findFirst: vi.fn() },
  mediaAsset: { update: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const resolvePortalClient = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const materialEnviadoPeloCliente = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess, resolvePortalClient,
  // 6ª rodada: as rotas de leitura passaram a usar `donoDoPortal`, que separa
  // "token inválido" de "ainda não há ficha de cliente". O dublê DERIVA do
  // mesmo `resolvePortalClient` deste arquivo — nenhuma expectativa mudou.
  donoDoPortal: async (t: string) => (await resolvePortalClient(t)) ?? "invalido",
}));
vi.mock("@/lib/agency/media/armazenamento", () => ({
  guardarArquivo, MAX_BYTES_POR_ARQUIVO: 25 * 1024 * 1024,
}));
vi.mock("@/lib/agency/esteira/materiais", () => ({ materialEnviadoPeloCliente }));

import { POST as enviarMidia } from "@/app/api/media/route";

function envio(token: string, nome = "logo.png", tipo = "image/png"): NextRequest {
  const fd = new FormData();
  fd.append("file", new Blob(["bytes do arquivo"], { type: tipo }), nome);
  fd.append("token", token);
  return new NextRequest("http://localhost/api/media", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(null);
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "logo.png", sizeBytes: 16, mimeType: "image/png", url: "/api/media/m1" } });
  db.mediaAsset.update.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue(null);
  // A armadilha: existe um workspace no banco, e ele NÃO é o do cliente.
  db.agencyWorkspace.findFirst.mockResolvedValue({ id: "ws-qualquer" });
  materialEnviadoPeloCliente.mockResolvedValue({
    projectId: "p1", materialRequestId: "mr-logo", criterio: "nome",
    aindaFaltam: 0, producaoRetomada: true, equipeAvisada: true,
  });
});

// ── 1. A CASA CERTA ────────────────────────────────────────────────────────

describe("o arquivo é arquivado no workspace DO CLIENTE, derivado do token", () => {
  it("cliente direto (token sem solicitação): workspace vem do dono, não do primeiro do banco", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: "cli-foocci" } });
    resolvePortalClient.mockResolvedValue({ clientId: "cli-foocci", workspaceId: "ws-foocci" });

    const res = await enviarMidia(envio("tok-foocci"));
    expect(res.status).toBe(201);
    expect(guardarArquivo.mock.calls[0]![0]).toMatchObject({
      workspaceId: "ws-foocci", clientId: "cli-foocci", clientRequestId: null,
    });
    // O workspace arbitrário não é sequer consultado.
    expect(db.agencyWorkspace.findFirst).not.toHaveBeenCalled();
  });

  it("token com solicitação continua vindo da solicitação — nada regrediu", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
    db.clientRequestDb.findUnique.mockResolvedValue({ workspaceId: "ws-padaria" });
    resolvePortalClient.mockResolvedValue({ clientId: "c1", workspaceId: "ws-padaria" });

    await enviarMidia(envio("tok-padaria"));
    expect(guardarArquivo.mock.calls[0]![0]).toMatchObject({ workspaceId: "ws-padaria", clientRequestId: "cr1" });
  });

  it("token válido mas sem dono nenhum: 409 e NADA guardado — melhor recusar que arquivar na casa errada", async () => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: null } });
    resolvePortalClient.mockResolvedValue(null);

    const res = await enviarMidia(envio("tok-orfao"));
    expect(res.status).toBe(409);
    expect(guardarArquivo).not.toHaveBeenCalled();
  });

  it("token inválido: 401 antes de qualquer efeito", async () => {
    validatePortalAccess.mockResolvedValue({ valid: false });
    const res = await enviarMidia(envio("tok-morto"));
    expect(res.status).toBe(401);
    expect(guardarArquivo).not.toHaveBeenCalled();
    expect(materialEnviadoPeloCliente).not.toHaveBeenCalled();
  });
});

// ── 2. O UPLOAD DESTRAVA A ESTEIRA ─────────────────────────────────────────

describe("o arquivo do cliente chega ao pedido de material", () => {
  beforeEach(() => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId: "cli-foocci" } });
    resolvePortalClient.mockResolvedValue({ clientId: "cli-foocci", workspaceId: "ws-foocci" });
  });

  it("a esteira é chamada com o dono derivado do token e o arquivo como ele chegou", async () => {
    await enviarMidia(envio("tok-foocci", "logo-foocci.png", "image/png"));
    expect(materialEnviadoPeloCliente).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "ws-foocci", clientId: "cli-foocci", clientRequestId: null,
      arquivo: { fileName: "logo-foocci.png", mimeType: "image/png" },
    }));
  });

  it("o arquivo passa a morar NO PROJETO que o pediu", async () => {
    await enviarMidia(envio("tok-foocci"));
    expect(db.mediaAsset.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { projectId: "p1" } });
  });

  it("a resposta conta a VERDADE do que aconteceu — a tela não precisa prometer", async () => {
    const res = await enviarMidia(envio("tok-foocci"));
    const json = await res.json();
    expect(json.material).toEqual({
      equipeAvisada: true, aindaFaltam: 0, producaoRetomada: true, atendeuPedido: true,
    });
  });

  it("quando nada destrava, a resposta diz isso — sem inventar 'avisamos e liberamos'", async () => {
    materialEnviadoPeloCliente.mockResolvedValue({
      projectId: "p1", materialRequestId: null, criterio: null,
      aindaFaltam: 2, producaoRetomada: false, equipeAvisada: true,
    });
    const json = await (await enviarMidia(envio("tok-foocci"))).json();
    expect(json.material).toMatchObject({ atendeuPedido: false, producaoRetomada: false, aindaFaltam: 2 });
  });

  it("a esteira falhando NÃO transforma um upload bem-sucedido em erro", async () => {
    // O arquivo do cliente já está salvo. Mandá-lo enviar de novo seria mentira.
    materialEnviadoPeloCliente.mockRejectedValue(new Error("banco fora"));
    const grito = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await enviarMidia(envio("tok-foocci"));
    expect(res.status).toBe(201);
    expect(grito).toHaveBeenCalled();
    grito.mockRestore();
  });

  it("upload da EQUIPE não passa pela esteira — ela tem a tela de materiais para decidir", async () => {
    validatePortalAccess.mockReset();
    getSession.mockResolvedValue({ workspaceId: "ws-foocci", email: "staff@dioli.studio" });
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "image/png" }), "arte.png");
    const res = await enviarMidia(new NextRequest("http://localhost/api/media", { method: "POST", body: fd }));
    expect(res.status).toBe(201);
    expect(materialEnviadoPeloCliente).not.toHaveBeenCalled();
  });
});
