// A4 (auditoria do Hub): o token de portal saía em query string em toda
// chamada — log de servidor, proxy e histórico do navegador. Estes testes
// travam a correção:
//   1. a porta de entrada troca o token por cookie httpOnly e redireciona
//      para URL limpa (sem token no caminho nem na query);
//   2. /api/portal/session só grava cookie de token VÁLIDO;
//   3. as rotas de dados aceitam o cookie ALÉM do parâmetro (compatibilidade).

import { escopoFalso } from "../_stubs/escopo-do-token";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  approvalRequest: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  project: { findFirst: vi.fn() },
  materialRequest: { create: vi.fn() },
  portalMessage: { create: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
// A porta de entrada passou a CONFERIR o token antes de gravar o cookie de 180
// dias (achado 14 da 8ª auditoria) — antes ela gravava qualquer string da
// query. A conferência é sem efeito colateral: não conta visita.
const conferirTokenDoPortal = vi.hoisted(() => vi.fn());
const updateApprovalStatus = vi.hoisted(() => vi.fn());
const addApprovalComment = vi.hoisted(() => vi.fn());
// `escopoDoToken` (rodada 3): a trava do ponteiro andado mudou de casa.
const escopoDoToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess, conferirTokenDoPortal, escopoDoToken }));
vi.mock("@/lib/agency/persistence/approval-service", () => ({ updateApprovalStatus, addApprovalComment }));
vi.mock("@/lib/agency/execution/create-project-from-request", () => ({ createProjectFromRequest: vi.fn() }));
vi.mock("@/lib/agency/execution/run-execution", () => ({ runProjectExecution: vi.fn() }));
vi.mock("@/lib/agency/execution/negotiate-proposal", () => ({ negotiateProposal: vi.fn() }));
vi.mock("@/lib/agency/execution/assess-resources", () => ({ assessResources: vi.fn() }));
vi.mock("@/lib/agency/esteira/refacao", () => ({ refazerPorPedidoDoCliente: vi.fn() }));

import { GET as entradaGET } from "@/app/portal/access/route";
import { POST as sessionPOST } from "@/app/api/portal/session/route";
import { POST as approvalsPOST } from "@/app/api/portal/approvals/route";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

beforeEach(() => {
  vi.clearAllMocks();
  escopoDoToken.mockImplementation(escopoFalso(validatePortalAccess, db));
  // ⚠️ 15/08/2026 (rodada 4) — O TOKEN PASSOU A EXIGIR `clientId` NO REGISTRO.
  // `PortalAccess.clientId` virou a ÚNICA prova de pertencimento de um token:
  // sem ela não se DERIVA dono do ponteiro `ClientRequestDb.clientId`, porque
  // derivar de ponteiro mutável foi o que produziu o incidente (um link legado
  // do cliente A abria o portal do cliente B). Por isso os fixtures abaixo
  // carregam o dono, que é a forma que os links emitidos passam a ter.
  // Token legado (sem `clientId`) é RECUSADO — ver a pendência de reemissão.
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: "cli1" } });
  conferirTokenDoPortal.mockResolvedValue(true);
});

describe("porta de entrada — /portal/access?token=", () => {
  it("grava cookie httpOnly e redireciona para a URL limpa (sem token)", async () => {
    const res = await entradaGET(new NextRequest("http://localhost/portal/access?token=tok-abc"));

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const destino = res.headers.get("location") ?? "";
    expect(destino).toContain("/portal/access/me");
    expect(destino).not.toContain("tok-abc");

    const cookie = res.cookies.get(PORTAL_COOKIE);
    expect(cookie?.value).toBe("tok-abc");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });

  it("sem token, manda para /portal/invalid e não grava cookie", async () => {
    const res = await entradaGET(new NextRequest("http://localhost/portal/access"));
    expect(res.headers.get("location")).toContain("/portal/invalid");
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });
});

describe("/api/portal/session — token do caminho vira cookie", () => {
  it("token válido → cookie httpOnly gravado", async () => {
    const req = new NextRequest("http://localhost/api/portal/session", {
      method: "POST", body: JSON.stringify({ token: "tok-abc" }),
    });
    const res = await sessionPOST(req);
    expect(res.status).toBe(200);
    expect(res.cookies.get(PORTAL_COOKIE)?.value).toBe("tok-abc");
    expect(res.cookies.get(PORTAL_COOKIE)?.httpOnly).toBe(true);
  });

  it("token inválido → 403 e NENHUM cookie (cookie podre se esconde por 180 dias)", async () => {
    validatePortalAccess.mockResolvedValue({ valid: false, reason: "revoked" });
    const req = new NextRequest("http://localhost/api/portal/session", {
      method: "POST", body: JSON.stringify({ token: "tok-ruim" }),
    });
    const res = await sessionPOST(req);
    expect(res.status).toBe(403);
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });
});

describe("rota de dados aceita o cookie além do parâmetro", () => {
  it("aprovação decidida SÓ com o cookie — sem token no corpo", async () => {
    db.approvalRequest.findUnique.mockResolvedValue({
      id: "ap1", clientRequestId: "cr1", department: "social-media",
      clientVisible: true, status: "pending", questionOpenedAt: null,
      clientRequest: { id: "cr1", clientId: "c1" },
    });
    db.approvalRequest.count.mockResolvedValue(1);
    updateApprovalStatus.mockResolvedValue({ id: "ap1", status: "approved", reviewedAt: new Date() });

    const req = new NextRequest("http://localhost/api/portal/approvals", {
      method: "POST",
      body: JSON.stringify({ approvalRequestId: "ap1", action: "approve" }),
      headers: { cookie: `${PORTAL_COOKIE}=tok-cookie` },
    });
    const res = await approvalsPOST(req);

    expect(res.status).toBe(200);
    // A credencial usada foi a do cookie — derivação do dono intacta.
    expect(validatePortalAccess).toHaveBeenCalledWith("tok-cookie");
  });

  it("sem cookie e sem token → 400, nada acontece", async () => {
    const req = new NextRequest("http://localhost/api/portal/approvals", {
      method: "POST",
      body: JSON.stringify({ approvalRequestId: "ap1", action: "approve" }),
    });
    const res = await approvalsPOST(req);
    expect(res.status).toBe(400);
    expect(updateApprovalStatus).not.toHaveBeenCalled();
  });
});
