// SEGREDO NÃO SE COMPARA COM `===`.
//
// Seis pontos da casa comparavam um segredo de cabeçalho com `!==`:
// `cron/radar`, `cron/radar/digest`, `cron/training/sdr`, `meta/dispatch`,
// `admin/reset-request` e o verify token do `meta/webhooks`. `===` em
// JavaScript sai no primeiro byte diferente — o tempo de resposta conta ao
// atacante quanto do segredo ele já acertou, e o segredo cai byte a byte.
//
// O padrão certo JÁ EXISTIA na casa (`lib/integrations/meta/webhooks.ts` e
// `signed-request.ts` usam `timingSafeEqual`). Faltava num lugar só, e o pior
// deles é o `ADMIN_TASK_SECRET`: com ele, `reset-request` roda SEM escopo de
// workspace e apaga projeto de qualquer inquilino.
//
// AS DUAS METADES: segredo errado (e segredo ausente) não passam; segredo certo
// passa.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  agencyWorkspace: { findMany: vi.fn().mockResolvedValue([]) },
  marketInsight: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
}));
const getSession = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const runRadarScan = vi.hoisted(() => vi.fn().mockResolvedValue({ proposed: 0, perDomain: {} }));
const dispatchWhatsAppNotifications = vi.hoisted(() => vi.fn().mockResolvedValue({ sent: 0 }));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, getSession };
});
vi.mock("@/lib/agency/radar/radar-agent", () => ({ runRadarScan }));
vi.mock("@/lib/integrations/meta/notifications", () => ({ dispatchWhatsAppNotifications }));

import { segredoConfere } from "@/lib/security/crypto";
import { POST as radar } from "@/app/api/cron/radar/route";
import { GET as digest } from "@/app/api/cron/radar/digest/route";
import { POST as dispatch } from "@/app/api/meta/dispatch/route";
import { webhookVerifyToken } from "@/lib/integrations/meta/config";
import { GET as webhookGet } from "@/app/api/meta/webhooks/route";

const SEGREDO = "um-segredo-de-cron-bem-comprido-123";

function comBearer(url: string, token: string | null, metodo = "POST"): NextRequest {
  return new NextRequest(url, {
    method: metodo,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.agencyWorkspace.findMany.mockResolvedValue([]);
  db.marketInsight.groupBy.mockResolvedValue([]);
  db.marketInsight.findMany.mockResolvedValue([]);
  runRadarScan.mockResolvedValue({ proposed: 0, perDomain: {} });
  dispatchWhatsAppNotifications.mockResolvedValue({ sent: 0 });
  getSession.mockResolvedValue(null);
  process.env.CRON_SECRET = SEGREDO;
});

describe("segredoConfere — o helper", () => {
  it("iguais conferem", () => {
    expect(segredoConfere(SEGREDO, SEGREDO)).toBe(true);
  });

  it("diferentes não conferem — inclusive quando só o último byte muda", () => {
    expect(segredoConfere(SEGREDO + "x", SEGREDO)).toBe(false);
    expect(segredoConfere(SEGREDO.slice(0, -1) + "9", SEGREDO)).toBe(false);
  });

  it("prefixo correto NÃO passa — é justamente o que a medição de tempo explorava", () => {
    expect(segredoConfere(SEGREDO.slice(0, 10), SEGREDO)).toBe(false);
  });

  it("lado vazio, nulo ou indefinido NUNCA confere — configuração faltando é porta fechada", () => {
    expect(segredoConfere("", SEGREDO)).toBe(false);
    expect(segredoConfere(SEGREDO, "")).toBe(false);
    expect(segredoConfere(null, null)).toBe(false);
    expect(segredoConfere(undefined, undefined)).toBe(false);
    // Dois vazios não podem "bater" — senão instância sem segredo abriria tudo.
    expect(segredoConfere("", "")).toBe(false);
  });
});

describe("as rotas de cron", () => {
  it("radar: token errado → 401 e nenhuma varredura", async () => {
    const res = await radar(comBearer("http://localhost/api/cron/radar", "quase-o-segredo"));
    expect(res.status).toBe(401);
    expect(runRadarScan).not.toHaveBeenCalled();
  });

  it("radar: sem token → 401", async () => {
    const res = await radar(comBearer("http://localhost/api/cron/radar", null));
    expect(res.status).toBe(401);
  });

  it("radar: CRON_SECRET não configurado → 503, e nem com o valor certo se entra", async () => {
    delete process.env.CRON_SECRET;
    const res = await radar(comBearer("http://localhost/api/cron/radar", SEGREDO));
    expect(res.status).toBe(503);
    expect(runRadarScan).not.toHaveBeenCalled();
  });

  it("radar: token certo → roda", async () => {
    const res = await radar(comBearer("http://localhost/api/cron/radar", SEGREDO));
    expect(res.status).toBe(200);
  });

  it("digest: token errado → 401; certo → 200", async () => {
    expect((await digest(comBearer("http://localhost/api/cron/radar/digest", "nao", "GET"))).status).toBe(401);
    expect((await digest(comBearer("http://localhost/api/cron/radar/digest", SEGREDO, "GET"))).status).toBe(200);
  });

  it("dispatch: token errado cai para a exigência de sessão master — não passa como cron", async () => {
    getSession.mockResolvedValue(null);
    const res = await dispatch(comBearer("http://localhost/api/meta/dispatch", "nao-e-o-segredo"));
    expect(res.status).toBe(401);
    expect(dispatchWhatsAppNotifications).not.toHaveBeenCalled();
  });

  it("dispatch: token certo dispara para TODOS os workspaces (o modo cron)", async () => {
    const res = await dispatch(comBearer("http://localhost/api/meta/dispatch", SEGREDO));
    expect(res.status).toBe(200);
    expect(dispatchWhatsAppNotifications).toHaveBeenCalledWith(undefined);
  });

  it("dispatch: sem CRON_SECRET, um bearer vazio não vira chave mestra", async () => {
    delete process.env.CRON_SECRET;
    getSession.mockResolvedValue(null);
    const res = await dispatch(comBearer("http://localhost/api/meta/dispatch", ""));
    expect(res.status).toBe(401);
    expect(dispatchWhatsAppNotifications).not.toHaveBeenCalled();
  });
});

describe("o verify token do webhook da Meta não tem mais default público", () => {
  const anterior = process.env.META_WEBHOOK_VERIFY_TOKEN;
  afterEach(() => {
    if (anterior === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    else process.env.META_WEBHOOK_VERIFY_TOKEN = anterior;
  });

  it("sem a env, NÃO existe token — e o valor antigo do código não vale mais", () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    expect(webhookVerifyToken()).toBeNull();
  });

  it("sem a env, o desafio de assinatura é RECUSADO — inclusive com o default antigo", async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const url = "http://localhost/api/meta/webhooks?hub.mode=subscribe&hub.verify_token=dioli-meta-webhook&hub.challenge=42";
    const res = await webhookGet(new NextRequest(url));
    expect(res.status).toBe(403);
  });

  it("com a env, o desafio certo é devolvido cru — e o errado é recusado", async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "token-de-verdade";

    const bom = await webhookGet(
      new NextRequest("http://localhost/api/meta/webhooks?hub.mode=subscribe&hub.verify_token=token-de-verdade&hub.challenge=42"),
    );
    expect(bom.status).toBe(200);
    expect(await bom.text()).toBe("42");

    const ruim = await webhookGet(
      new NextRequest("http://localhost/api/meta/webhooks?hub.mode=subscribe&hub.verify_token=token-de-mentira&hub.challenge=42"),
    );
    expect(ruim.status).toBe(403);
  });
});
