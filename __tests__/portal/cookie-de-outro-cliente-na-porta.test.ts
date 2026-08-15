// ── O COOKIE DO PORTAL É UM SÓ POR NAVEGADOR ────────────────────────────────
//
// `dioli_portal` tem `path:"/"` e 180 dias, e guarda UM cliente. Quem abre o
// portal de dois clientes no mesmo navegador — o CEO abre todos — fica com a
// credencial de um preso ao domínio inteiro.
//
// ⚠️ ONDE ESTA TRAVA MORA MUDOU NA RODADA 2, E A MUDANÇA É UM CONSERTO.
// A rodada 1 higienizava o cookie no `proxy.ts`, ANTES de validar o token do
// caminho. O `seguranca` mostrou que aquilo era **negação de serviço**: bastava
// mandar à vítima um link para `/portal/access/qualquer-lixo` para derrubar a
// sessão dela. Agora:
//
//   • a regravação acontece em `/api/portal/vista`, DEPOIS de o token ser
//     validado — token bom regrava, lixo não faz nada;
//   • o `proxy.ts` não toca em cookie de portal nenhum;
//   • e a porta de entrada (`/portal/access?token=`) nunca leva um token ruim
//     para uma sessão que não é dele (F5).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn(), findFirst: vi.fn() },
  project: { findMany: vi.fn() },
  adCampaign: { findMany: vi.fn() },
  socialPost: { findMany: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  deliverable: { findMany: vi.fn() },
}));
const resolvePortalClient = vi.hoisted(() => vi.fn());
const conferirTokenDoPortal = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  resolvePortalClient, conferirTokenDoPortal, validatePortalAccess: vi.fn(), donoDoToken: vi.fn(),
}));
vi.mock("@/lib/agency/esteira/ficha-de-marca", () => ({
  lerFichaDeMarca: vi.fn().mockResolvedValue(null), proximasPerguntas: vi.fn(() => []),
}));

import { proxy } from "@/proxy";
import { GET as vistaGET } from "@/app/api/portal/vista/route";
import { GET as portaGET } from "@/app/portal/access/route";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

function req(url: string, cookie?: string): NextRequest {
  const r = new NextRequest(`http://localhost${url}`);
  if (cookie) r.cookies.set(PORTAL_COOKIE, cookie);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePortalClient.mockResolvedValue({ clientId: "cli-beta", workspaceId: "ws1" });
  conferirTokenDoPortal.mockResolvedValue(true);
  db.client.findUnique.mockResolvedValue({ name: "Loja BETA", industry: null, email: null, phone: null, website: null, createdAt: new Date() });
  db.project.findMany.mockResolvedValue([]);
  db.adCampaign.findMany.mockResolvedValue([]);
  db.socialPost.findMany.mockResolvedValue([]);
  db.clientRequestDb.findFirst.mockResolvedValue(null);
  db.deliverable.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// A regravação, DEPOIS de validar
// ═══════════════════════════════════════════════════════════════════════════
describe("/api/portal/vista regrava o cookie quando o token do link é de outro", () => {
  it("⛔ cookie do ALFA + link do BETA → o cookie vira o do BETA na mesma resposta", async () => {
    const res = await vistaGET(req("/api/portal/vista?token=TOKENBETA", "TOKENALFA"));
    expect(res.status).toBe(200);
    expect(res.cookies.get(PORTAL_COOKIE)?.value).toBe("TOKENBETA");
    expect(res.cookies.get(PORTAL_COOKIE)?.httpOnly).toBe(true);
  });

  // ⚠️ RÓTULO HONESTO (rodada 3): este passa TAMBÉM no código não consertado —
  // a rota nunca gravou cookie nenhum antes. É CONTROLE de que a regravação
  // nova não passou a gravar lixo, não uma barreira que já existia.
  it("✅ (controle) só regrava com token que VALIDOU — lixo não vira cookie de 180 dias", async () => {
    resolvePortalClient.mockResolvedValue(null);
    const res = await vistaGET(req("/api/portal/vista?token=LIXO", "TOKENALFA"));
    expect(res.status).toBe(403);
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("✅ cookie já igual ao token → não reescreve nada", async () => {
    const res = await vistaGET(req("/api/portal/vista?token=TOKENBETA", "TOKENBETA"));
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("✅ modo cookie puro (/me) → não mexe no cookie", async () => {
    const res = await vistaGET(req("/api/portal/vista", "TOKENALFA"));
    expect(res.status).toBe(200);
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 F5 — a porta de entrada com token RUIM
// ═══════════════════════════════════════════════════════════════════════════
describe("porta de entrada — /portal/access?token=", () => {
  it("⛔ token INVÁLIDO não cai no portal de quem está no cookie", async () => {
    // O cenário do incidente, pelo caminho mais banal que existe: o cliente
    // clica no link DELE, que expirou, num navegador que tem o cookie de
    // OUTRO cliente. Antes: redirecionava para `/portal/access/me`, onde o
    // cookie manda — e ele entrava no portal alheio, marca e tudo.
    conferirTokenDoPortal.mockResolvedValue(false);

    const res = await portaGET(req("/portal/access?token=EXPIRADO", "TOKENALFA"));

    const destino = res.headers.get("location") ?? "";
    expect(destino).toContain("/portal/invalid");
    expect(destino).not.toContain("/portal/access/me");
  });

    // Idem: controle. O que MUDOU nesta rodada é o destino (acima), não isto.
  it("✅ (controle) não grava cookie nenhum com token ruim", async () => {
    conferirTokenDoPortal.mockResolvedValue(false);
    const res = await portaGET(req("/portal/access?token=EXPIRADO", "TOKENALFA"));
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("✅ mas NÃO derruba a sessão legítima do navegador — nada de negação de serviço", async () => {
    // Foi por isso que a higiene saiu do `proxy.ts`: um link com lixo mandado
    // à vítima não pode expulsá-la da sessão que ela já tinha.
    conferirTokenDoPortal.mockResolvedValue(false);
    const res = await portaGET(req("/portal/access?token=lixo-de-atacante", "TOKENALFA"));
    const c = res.cookies.get(PORTAL_COOKIE);
    expect(c === undefined || c.maxAge !== 0).toBe(true);
  });

  it("✅ token VÁLIDO continua entrando e gravando o cookie", async () => {
    const res = await portaGET(req("/portal/access?token=TOKENBETA", "TOKENALFA"));
    expect(res.headers.get("location") ?? "").toContain("/portal/access/me");
    expect(res.cookies.get(PORTAL_COOKIE)?.value).toBe("TOKENBETA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O proxy não é mais lugar de trava de cookie
// ═══════════════════════════════════════════════════════════════════════════
describe("proxy.ts", () => {
  // ⚠️ CONTROLE, não barreira: o `proxy.ts` da BASE também não tocava em cookie
  // de portal. Ele existe para travar a REMOÇÃO feita nesta rodada — que a
  // higiene com DoS não volte por distração.
  it("✅ (controle) NÃO apaga cookie de portal — a higiene ali era negação de serviço", async () => {
    for (const caminho of ["/portal/access/qualquer-lixo", "/portal/access/me", "/portal/access/TOKENBETA"]) {
      const res = await proxy(req(caminho, "TOKENALFA"));
      expect(res.cookies.get(PORTAL_COOKIE), caminho).toBeUndefined();
    }
  });
});
