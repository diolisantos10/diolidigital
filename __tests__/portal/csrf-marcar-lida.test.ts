// GET /api/portal/messages muda estado (marca a conversa como lida para o
// espectador) — e `SameSite=Lax` libera cookie em navegação de TOPO por GET.
// Ver `lib/security/navegacao-cross-site.ts` para o porquê.
//
// As duas metades da trava, e é preciso as duas para valer:
//   • barra o caso PLANTADO — GET cruzado (Sec-Fetch-Site: cross-site) não
//     marca nada como lido, mesmo com o cookie/token válido anexado;
//   • NÃO barra o caso LIMPO — o mesmo GET, sem o cabeçalho de navegação
//     cruzada (a app da própria casa, ou navegador sem Fetch Metadata),
//     continua marcando como lido exatamente como antes.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  client: { findFirst: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET } from "@/app/api/portal/messages/route";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

const MSG_DA_EQUIPE = {
  id: "m1", authorRole: "team", authorName: "Equipe Dioli",
  body: "Enviamos a arte.", createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", clientId: "cli1" });
  db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr1" }]);
  db.portalMessage.findMany.mockResolvedValue([MSG_DA_EQUIPE]);
  db.portalMessage.updateMany.mockResolvedValue({ count: 1 });
});

function getComCookie(secFetchSite?: string): NextRequest {
  const headers: Record<string, string> = { cookie: `${PORTAL_COOKIE}=tok-cookie` };
  if (secFetchSite) headers["sec-fetch-site"] = secFetchSite;
  return new NextRequest("http://localhost/api/portal/messages", { headers });
}

describe("CSRF via GET — marcar como lida", () => {
  it("BARRA o caso plantado: navegação de topo cruzada (Sec-Fetch-Site: cross-site) não marca como lida", async () => {
    const res = await GET(getComCookie("cross-site"));

    expect(res.status).toBe(200);
    // A leitura continua funcionando — a trava não derruba o produto.
    const corpo = await res.json();
    expect(corpo.messages).toHaveLength(1);
    // Só a MUTAÇÃO foi pulada.
    expect(db.portalMessage.updateMany).not.toHaveBeenCalled();
  });

  it("NÃO barra o caso limpo: sem Sec-Fetch-Site (app da casa / navegador sem Fetch Metadata) marca como lida normalmente", async () => {
    const res = await GET(getComCookie(undefined));

    expect(res.status).toBe(200);
    expect(db.portalMessage.updateMany).toHaveBeenCalledTimes(1);
    expect(db.portalMessage.updateMany.mock.calls[0]![0].where.authorRole).toBe("team");
  });

  it("NÃO barra o caso limpo: same-origin explícito marca como lida normalmente", async () => {
    const res = await GET(getComCookie("same-origin"));

    expect(res.status).toBe(200);
    expect(db.portalMessage.updateMany).toHaveBeenCalledTimes(1);
  });
});
