// A CHAVE QUE UMA ROTA ABERTA PODE GASTAR — achados 13 e 14 da 8ª auditoria.
//
// O SDR e o briefing são públicos DE PROPÓSITO: quem preenche não tem login,
// não tem token e não sabe o workspace. Mas a conversa custa dinheiro, e
// `resolveProviderKey(provider)` SEM workspace cai num `findFirst` global — "a
// primeira chave que existir no banco". Numa base com duas agências, uma pessoa
// qualquer com um laço de requisições gasta a chave de uma delas, escolhida por
// ordem de inserção. Não há credencial nenhuma para barrar isso: só o teto de
// ritmo por IP, que limita a velocidade, não o dono da fatura.
//
// O precedente da casa é `app/api/portal/transcricao/route.ts` (o token diz de
// quem é a conta) e `client-request-service.resolverWorkspacePublico` (um
// workspace, é aquele; dois, ninguém adivinha). Seguimos o segundo, com a mesma
// função — para que briefing e chave nunca respondam coisas diferentes sobre o
// mesmo prospect.
//
// E o 14: `/portal/access` gravava um cookie httpOnly de 180 DIAS com qualquer
// string vinda da query, sem conferir o token. A rota irmã já dizia por que:
// "cookie de token podre é um bug que se esconde por 180 dias".

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  agencyWorkspace: { findMany: vi.fn() },
  dbIntegrationConfig: { findUnique: vi.fn(), findFirst: vi.fn() },
  clientRequestDb: { create: vi.fn(), findFirst: vi.fn() },
  // O teto de ritmo das rotas públicas MORA NO BANCO desde 06/08/2026
  // (`lib/security/limite-no-banco.ts`). Sem esta tabela no mock, o contador
  // "não responde" e a rota recusa com 503 — que é o fail-closed funcionando,
  // não um defeito. Aqui ele libera, para que o assunto do arquivo (de quem é a
  // chave que a rota gasta) fique isolado.
  rateLimitBucket: {
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const decryptSecret = vi.hoisted(() => vi.fn((s: string) => `aberta:${s}`));
vi.mock("@/lib/security/crypto", () => ({ decryptSecret, encryptSecret: vi.fn() }));

// ⚠️ rodada 5: a porta de entrada passou a exigir DONO, não só validade —
// `conferirTokenDoPortal` nunca conferiu dono, e por isso token legado entrava
// e gravava cookie de 180 dias. Agora ela usa o resolvedor único.
const escopoDoToken = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({
  escopoDoToken,
  validatePortalAccess: vi.fn(),
  createPortalAccess: vi.fn(),
  resolvePortalClient: vi.fn(),
}));

import { chaveDeRotaPublica } from "@/lib/ai/chave-publica";
import { GET as entrarNoPortal } from "@/app/portal/access/route";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

/** O cofre: a agência A tem chave de Claude; a B também. O `findUnique` só
 *  responde quando o `where` traz o workspace certo — o mock HONRA o where. */
function cofreDeDuasAgencias() {
  const chaves: Record<string, string> = {
    "ws-A:int-claude": "chave-da-agencia-A",
    "ws-B:int-claude": "chave-da-agencia-B",
  };
  db.dbIntegrationConfig.findUnique.mockImplementation(
    ({ where }: { where: { workspaceId_integrationId: { workspaceId: string; integrationId: string } } }) => {
      const k = `${where.workspaceId_integrationId.workspaceId}:${where.workspaceId_integrationId.integrationId}`;
      return Promise.resolve(chaves[k] ? { apiKeyEncrypted: chaves[k], selectedModel: null } : null);
    },
  );
  // O `findFirst` global é justamente o caminho que não pode mais ser tomado:
  // se alguém voltar a chamá-lo sem workspace, ele devolve a primeira chave.
  db.dbIntegrationConfig.findFirst.mockResolvedValue({ apiKeyEncrypted: "chave-da-agencia-A", selectedModel: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  cofreDeDuasAgencias();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

// ── 13. a chave da rota pública ──────────────────────────────────────────────

describe("chaveDeRotaPublica — quem paga a conversa do SDR", () => {
  it("uma agência só (o caso de hoje): usa a chave DELA, resolvida pelo servidor", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws-A" }]);
    const r = await chaveDeRotaPublica("claude");
    expect(r?.apiKey).toBe("aberta:chave-da-agencia-A");
    // E resolveu por workspace explícito, não pelo `findFirst` global.
    expect(db.dbIntegrationConfig.findFirst).not.toHaveBeenCalled();
    expect(db.dbIntegrationConfig.findUnique.mock.calls[0]![0].where.workspaceId_integrationId.workspaceId).toBe("ws-A");
  });

  it("DUAS agências: não gasta a chave de nenhuma — a rota responde 'não configurado'", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws-A" }, { id: "ws-B" }]);
    const r = await chaveDeRotaPublica("claude");
    expect(r).toBeNull();
    expect(db.dbIntegrationConfig.findFirst).not.toHaveBeenCalled();
    expect(db.dbIntegrationConfig.findUnique).not.toHaveBeenCalled();
  });

  it("nenhuma agência na base: cai na env — que é do deploy, não de um inquilino", async () => {
    db.agencyWorkspace.findMany.mockResolvedValue([]);
    process.env.ANTHROPIC_API_KEY = "chave-do-deploy";
    const r = await chaveDeRotaPublica("claude");
    expect(r).toEqual({ apiKey: "chave-do-deploy", source: "env", model: null });
  });
});

describe("as rotas públicas usam esse resolvedor, não o global", () => {
  // O contrato observável: com duas agências na base, nenhuma rota pública
  // chega a decifrar chave nenhuma. Se alguém reintroduzir
  // `resolveProviderKey(provider)` sem workspace, `decryptSecret` é chamado e
  // estes testes falham.
  beforeEach(() => {
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws-A" }, { id: "ws-B" }]);
  });

  it("POST /api/sdr/chat", async () => {
    const { POST } = await import("@/app/api/sdr/chat/route");
    const res = await POST(new NextRequest("http://localhost/api/sdr/chat", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [], currentMessage: "oi" }),
    }));
    expect((await res.json()).reason).toBe("not_configured");
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it("POST /api/sdr/transcribe", async () => {
    const { POST } = await import("@/app/api/sdr/transcribe/route");
    const fd = new FormData();
    fd.append("file", new Blob(["audio"], { type: "audio/webm" }), "a.webm");
    const res = await POST(new NextRequest("http://localhost/api/sdr/transcribe", { method: "POST", body: fd }));
    expect((await res.json()).reason).toBe("not_configured");
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it("POST /api/brain/briefing-extract — a quarta porta, que o raio-x não listou", async () => {
    const { POST } = await import("@/app/api/brain/briefing-extract/route");
    const res = await POST(new NextRequest("http://localhost/api/brain/briefing-extract", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [], currentMessage: "oi" }),
    }));
    await res.json();
    expect(decryptSecret).not.toHaveBeenCalled();
  });
});

// ── 14. o cookie de 180 dias ─────────────────────────────────────────────────

describe("GET /portal/access — só se grava cookie de token VÁLIDO", () => {
  const chamar = (url: string) => entrarNoPortal(new NextRequest(url));

  it("token podre: redireciona, mas NÃO grava o cookie de 180 dias", async () => {
    escopoDoToken.mockResolvedValue({ ok: false, motivo: "sem_dono" });
    const res = await chamar("http://localhost/portal/access?token=lixo");
    expect(res.status).toBe(307);
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("token expirado ou revogado: mesma coisa — o cookie não nasce", async () => {
    escopoDoToken.mockResolvedValue({ ok: false, motivo: "sem_dono" });
    const res = await chamar("http://localhost/portal/access?token=tok-vencido");
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });

  it("token válido: grava o cookie httpOnly e limpa a URL", async () => {
    escopoDoToken.mockResolvedValue({ ok: true, tipo: "cliente", clientId: "c1", workspaceId: "ws1", clientRequestIds: [] });
    const res = await chamar("http://localhost/portal/access?token=tok-bom");
    const cookie = res.cookies.get(PORTAL_COOKIE);
    expect(cookie?.value).toBe("tok-bom");
    expect(cookie?.httpOnly).toBe(true);
    expect(res.headers.get("location")).toContain("/portal/access/me");
  });

  it("sem token nenhum: não confere nada e não grava nada", async () => {
    const res = await chamar("http://localhost/portal/access");
    expect(escopoDoToken).not.toHaveBeenCalled();
    expect(res.cookies.get(PORTAL_COOKIE)).toBeUndefined();
  });
});
