// FAIXA 1 do CSRF — Origin/Referer nas rotas de efeito externo irreversível.
//
// `__tests__/security/navegacao-cross-site.test.ts` prova a função isolada.
// Este arquivo prova a trava LIGADA em rotas de verdade — uma de cada
// categoria da faixa 1 (ver a ficha de despacho):
//
//   • DINHEIRO/PUBLICAÇÃO — /api/meta/publish, /api/campanhas
//   • PORTAL (cookie httpOnly, não sessão)  — /api/portal/approvals
//   • GASTO DE IA — /api/ai/run
//   • DUAL: segredo OU sessão — /api/meta/dispatch
//
// AS DUAS METADES, em cada categoria: requisição cross-site forjada NÃO
// executa a mutação; o caminho legítimo (mesma origem, ou segredo de
// operação) continua funcionando.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks compartilhados ─────────────────────────────────────────────────────
const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, getSession, isAgencyRole: (role: string) => ["master", "project_manager", "social_staff", "design_staff", "ads_staff"].includes(role) };
});

const publishPost = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/client", () => ({ publishPost }));

const ligarCampanha = vi.hoisted(() => vi.fn());
const desligarCampanha = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/esteira/trafego", () => ({ ligarCampanha, desligarCampanha }));

const validatePortalAccess = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));

const generateAi = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/generate", () => ({ generate: (...args: unknown[]) => generateAi(...args) }));

const dispatchWhatsAppNotifications = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));

const db = vi.hoisted(() => ({
  adCampaign: { findUnique: vi.fn() },
  approvalRequest: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { POST as publicarMeta } from "@/app/api/meta/publish/route";
import { POST as campanhasPost } from "@/app/api/campanhas/route";
import { POST as aprovacaoPortal } from "@/app/api/portal/approvals/route";
import { POST as aiRun } from "@/app/api/ai/run/route";
import { POST as metaDispatch } from "@/app/api/meta/dispatch/route";

const SESSAO_STAFF = {
  session: { userId: "u1", email: "staff@dioli.test", name: "Staff", role: "social_staff", workspaceId: "ws1", clientId: null },
  error: null,
};

function forjada(url: string, body: unknown): NextRequest {
  // A marca do forjado: Sec-Fetch-Site cross-site — o navegador ANEXA sozinho
  // ao entrar num site alheio, e a página que navega não consegue mascarar.
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
    body: JSON.stringify(body),
  });
}

function legitima(url: string, body: unknown, extraHeaders: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FAIXA 1 — /api/meta/publish (publica de verdade no perfil do cliente)", () => {
  beforeEach(() => {
    requireSession.mockResolvedValue(SESSAO_STAFF);
    publishPost.mockResolvedValue({ ok: true, externalId: "ig_1" });
  });

  it("⛔ cross-site forjado → 403, NENHUMA chamada à Graph", async () => {
    const res = await publicarMeta(forjada("http://localhost/api/meta/publish", { connectionId: "c1", platform: "instagram" }));
    expect(res.status).toBe(403);
    expect(publishPost).not.toHaveBeenCalled();
  });

  it("✅ mesma origem (quem tem direito) → publica normalmente", async () => {
    const res = await publicarMeta(legitima("http://localhost/api/meta/publish", { connectionId: "c1", platform: "instagram" }));
    expect(res.status).toBe(200);
    expect(publishPost).toHaveBeenCalledOnce();
  });
});

describe("FAIXA 1 — /api/campanhas (\"ligar\" move dinheiro do cliente)", () => {
  beforeEach(() => {
    requireSession.mockResolvedValue(SESSAO_STAFF);
    db.adCampaign.findUnique.mockResolvedValue({ workspaceId: "ws1" });
    ligarCampanha.mockResolvedValue({ ok: true });
  });

  it("⛔ cross-site forjado → 403, campanha NÃO liga", async () => {
    const res = await campanhasPost(forjada("http://localhost/api/campanhas", { campanhaId: "camp1", acao: "ligar" }));
    expect(res.status).toBe(403);
    expect(ligarCampanha).not.toHaveBeenCalled();
  });

  it("✅ mesma origem → liga normalmente", async () => {
    const res = await campanhasPost(legitima("http://localhost/api/campanhas", { campanhaId: "camp1", acao: "ligar" }));
    expect(res.status).toBe(200);
    expect(ligarCampanha).toHaveBeenCalledOnce();
  });
});

describe("FAIXA 1 — /api/portal/approvals (aprova proposta, cria projeto, dispara produção)", () => {
  const CORPO = { token: "tok-1", approvalRequestId: "ap1", action: "approve" };

  it("⛔ cross-site forjado (mesmo com cookie/token válido) → 403, NENHUMA leitura da aprovação", async () => {
    const res = await aprovacaoPortal(forjada("http://localhost/api/portal/approvals", CORPO));
    expect(res.status).toBe(403);
    expect(validatePortalAccess).not.toHaveBeenCalled();
  });

  it("✅ mesma origem → segue para a validação do token normalmente", async () => {
    validatePortalAccess.mockResolvedValue({ valid: false, reason: "revoked" }); // não importa o resultado; importa TER CHAMADO
    const res = await aprovacaoPortal(legitima("http://localhost/api/portal/approvals", CORPO));
    expect(res.status).toBe(403); // barrado pela validação do token, não pela CSRF guard
    expect(validatePortalAccess).toHaveBeenCalledWith("tok-1");
  });
});

describe("FAIXA 1 — /api/ai/run (gasta a chave de IA da agência)", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ userId: "u1", email: "a@b.c", name: "A", role: "master", workspaceId: "ws1", clientId: null });
  });

  it("⛔ cross-site forjado → 403, NENHUMA chamada de IA", async () => {
    const res = await aiRun(forjada("http://localhost/api/ai/run", {
      departmentId: "strategy", provider: "claude", context: { prompt: "x" },
    }));
    expect(res.status).toBe(403);
    expect(generateAi).not.toHaveBeenCalled();
  });

  it("✅ mesma origem → chama a IA normalmente", async () => {
    generateAi.mockResolvedValue({ ok: false, error: "sem chave" }); // resultado não importa; importa TER CHAMADO
    const res = await aiRun(legitima("http://localhost/api/ai/run", {
      departmentId: "strategy", provider: "claude", context: { prompt: "x" },
    }));
    expect(res.status).toBe(200); // rota devolve 200 com mode:"fallback" quando a IA falha — nunca 403
    expect(generateAi).toHaveBeenCalledOnce();
  });
});

describe("FAIXA 1 — /api/meta/dispatch (dual: segredo de cron OU sessão de master)", () => {
  const SEGREDO = "segredo-de-teste-bem-comprido";
  const antesCronSecret = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SEGREDO;
    dispatchWhatsAppNotifications.mockResolvedValue({ sent: 0 });
  });
  afterEach(() => {
    if (antesCronSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = antesCronSecret;
  });

  it("✅ o caminho por SEGREDO passa mesmo cross-site — sem cookie não há CSRF a barrar", async () => {
    const req = new NextRequest("http://localhost/api/meta/dispatch", {
      method: "POST",
      headers: { authorization: `Bearer ${SEGREDO}`, "sec-fetch-site": "cross-site" },
    });
    getSession.mockResolvedValue(null);
    const res = await metaDispatch(req);
    expect(res.status).toBe(200);
    expect(dispatchWhatsAppNotifications).toHaveBeenCalledOnce();
  });

  it("⛔ o caminho por SESSÃO, cross-site forjado → 403, nada é disparado", async () => {
    getSession.mockResolvedValue({ userId: "u1", email: "m@b.c", name: "M", role: "master", workspaceId: "ws1" });
    const res = await metaDispatch(forjada("http://localhost/api/meta/dispatch", {}));
    expect(res.status).toBe(403);
    expect(dispatchWhatsAppNotifications).not.toHaveBeenCalled();
  });

  it("✅ o caminho por SESSÃO, mesma origem → dispara normalmente", async () => {
    getSession.mockResolvedValue({ userId: "u1", email: "m@b.c", name: "M", role: "master", workspaceId: "ws1" });
    const res = await metaDispatch(legitima("http://localhost/api/meta/dispatch", {}));
    expect(res.status).toBe(200);
    expect(dispatchWhatsAppNotifications).toHaveBeenCalledOnce();
  });
});
