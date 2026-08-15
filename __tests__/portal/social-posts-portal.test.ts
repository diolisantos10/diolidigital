// A fronteira do portal no calendário (achados A3 e visibilidade, Hub).
//
// A3: o `scriptJson` é material de trabalho interno da IA (hook, cenas, áudio,
// observações do agente) e saía INTEIRO no ramo token. Se um roteiro contiver
// instrução interna ou observação sobre o cliente, chegava nele.
// Visibilidade: post "interno" nunca sai por rota de portal — fail-closed.

import { escopoFalso } from "../_stubs/escopo-do-token";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn() },
  // O ramo de portal resolve o WORKSPACE do token e leva ele no filtro
  // (auditoria 7, B2): `clientRequestId` sozinho é id global.
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());
// `escopoDoToken` (rodada 3): a trava do ponteiro andado mudou de casa.
const escopoDoToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess, escopoDoToken }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET } from "@/app/api/social-posts/route";

const POST_NO_BANCO = {
  id: "sp1", clientId: "c1", clientRequestId: "cr1",
  caption: "Pão quentinho saindo!", networks: '["instagram"]', format: "reel", pillar: "produto",
  mediaUrl: null, mediaUrlsJson: "[]", scenesJson: "[]",
  scriptJson: '{"hook":"abre no forno","obs":"cliente é difícil, evitar close no rosto"}',
  visibility: "compartilhado",
  scheduledFor: new Date("2026-08-10T12:00:00Z"), status: "scheduled",
  createdAt: new Date(), updatedAt: new Date(),
};

function req(url: string): NextRequest {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  // rodada 4: as solicitações do escopo saem do CLIENTE, não do token.
  db.clientRequestDb.findMany?.mockResolvedValue?.([{ id: "cr1" }]);
  escopoDoToken.mockImplementation(escopoFalso(validatePortalAccess, db));
  // ⚠️ 15/08/2026 (rodada 4) — O TOKEN PASSOU A EXIGIR `clientId` NO REGISTRO.
  // `PortalAccess.clientId` virou a ÚNICA prova de pertencimento de um token:
  // sem ela não se DERIVA dono do ponteiro `ClientRequestDb.clientId`, porque
  // derivar de ponteiro mutável foi o que produziu o incidente (um link legado
  // do cliente A abria o portal do cliente B). Por isso os fixtures abaixo
  // carregam o dono, que é a forma que os links emitidos passam a ter.
  // Token legado (sem `clientId`) é RECUSADO — ver a pendência de reemissão.
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: "c1" } });
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", workspaceId: "ws1" });
  db.client.findUnique.mockResolvedValue({ workspaceId: "ws1" });
  db.socialPost.findMany.mockResolvedValue([POST_NO_BANCO]);
});

describe("GET /api/social-posts com token — o que o cliente recebe", () => {
  it("A3: o roteiro interno da IA NÃO sai no payload do portal", async () => {
    const res = await GET(req("http://localhost/api/social-posts?token=tok-1"));
    const json = await res.json();
    expect(json.posts).toHaveLength(1);
    // Nem a chave existe — ausência, não null: null ainda confirma que o campo existe.
    expect(Object.keys(json.posts[0])).not.toContain("script");
    expect(JSON.stringify(json)).not.toContain("evitar close no rosto");
  });

  it("o ramo de SESSÃO da agência continua vendo o script — a trava é só na fronteira do cliente", async () => {
    requireSession.mockResolvedValue({ session: { workspaceId: "ws1" }, error: null });
    const res = await GET(req("http://localhost/api/social-posts"));
    const json = await res.json();
    expect(json.posts[0].script).toMatchObject({ hook: "abre no forno" });
  });

  it("a consulta do token filtra por visibilidade 'compartilhado' — interno não sai nem por engano", async () => {
    await GET(req("http://localhost/api/social-posts?token=tok-1"));
    const where = db.socialPost.findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ clientRequestId: "cr1", visibility: "compartilhado" });
  });

  it("token inválido continua barrado antes de qualquer consulta", async () => {
    validatePortalAccess.mockResolvedValue({ valid: false });
    const res = await GET(req("http://localhost/api/social-posts?token=tok-roubado"));
    expect(res.status).toBe(403);
    expect(db.socialPost.findMany).not.toHaveBeenCalled();
  });
});
