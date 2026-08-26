// O CARIMBO `compartilhado` NÃO BASTA — TEM DE HAVER PEÇA.
//
// ── O que foi medido em produção (26/08/2026) ──────────────────────────────
//
// Três `SocialPost` em `status: "draft"`, `visibility: "compartilhado"`, com
// `mediaUrl: null` — a arte tinha sido reprovada três vezes pelo portão do
// fundo ("o fundo tem 370 cores distintas"). O carimbo é aplicado no
// NASCIMENTO do post, em cinco lugares da esteira, antes de a arte existir. O
// cliente abria o portal e via cartão de peça sem peça, sem nada dizer que
// aquilo era produção em curso.
//
// Peça sem arquivo não é entrega. Ela volta a aparecer sozinha quando a arte
// sair — e a arte só sai depois da `regua-da-peca-final.ts`.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn() },
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());
const validatePortalAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));

import { GET } from "@/app/api/social-posts/route";

beforeEach(() => {
  vi.clearAllMocks();
  db.socialPost.findMany.mockResolvedValue([]);
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: null } });
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", workspaceId: "ws1" });
});

const pedirComToken = () =>
  GET(new NextRequest("http://localhost/api/social-posts?token=tok-do-cliente"));

describe("o portal do cliente só lista peça que TEM arquivo", () => {
  it("a consulta filtra mediaUrl não nulo — e o filtro é POSITIVO", async () => {
    await pedirComToken();
    const where = db.socialPost.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.visibility).toBe("compartilhado");
    // `not: null` e não uma lista de estados aceitáveis: estado de mídia novo
    // não pode passar a vazar por omissão.
    expect(where.mediaUrl).toEqual({ not: null });
  });

  it("o inquilino continua sendo parte do filtro — não se trocou uma trava por outra", async () => {
    await pedirComToken();
    const where = db.socialPost.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.workspaceId).toBe("ws1");
    expect(where.clientRequestId).toBe("cr1");
  });
});
