// Chat com o PM (adição do CEO, 03/08/2026): a gaveta do portal usa a infra
// PortalMessage existente. O que estes testes travam:
//   • mensagem do cliente nasce readByTeam=false — é ela que acende o badge
//     na caixa de entrada da agência; se nascesse lida, o PM nunca saberia que
//     o cliente falou;
//   • o cliente autentica por token OU pelo cookie httpOnly (A4);
//   • mensagem vazia não entra (400).
//
// ── Atualizado em 05/08/2026 ─────────────────────────────────────────────────
// A âncora da conversa mudou: a thread pertence ao CLIENTE, não à solicitação
// de briefing (ver `app/api/messages/conversa.ts`). Por isso a resolução passa
// por `clientRequestDb.findUnique` / `findMany` — e a mensagem sai carimbada
// com AS DUAS chaves quando as duas existem.

import { donoFalso, escopoFalso } from "../_stubs/escopo-do-token";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
  // ⚠️ 15/08/2026: a resolução do dono passou a CONGELAR o cliente no
  // `PortalAccess` (ver `donoDoToken`). Estes dois entraram por isso.
  portalAccess: { findUnique: vi.fn(), update: vi.fn() },
  activityEvent: { create: vi.fn() },
}));
const validatePortalAccess = vi.hoisted(() => vi.fn());
const donoDoToken = vi.hoisted(() => vi.fn());
// rodada 5: `conversaDoToken` deixou de ter caminho próprio e passou a usar o
// resolvedor único — por isso a suíte precisa dele mockado também.
const escopoDoToken = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess, donoDoToken, escopoDoToken }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { POST, GET } from "@/app/api/portal/messages/route";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";
import { donoDaTela } from "@/lib/agency/portal/dono-da-tela";

const MSG_CRIADA = {
  id: "m1", authorRole: "client", authorName: "Foocci",
  body: "Oi, PM!", createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Espelho do real (rodada 4): `PortalAccess.clientId` é a única prova;
  // não se deriva do ponteiro, e ponteiro andado recusa.
  donoDoToken.mockImplementation(donoFalso(validatePortalAccess, db));
  escopoDoToken.mockImplementation(escopoFalso(validatePortalAccess, db));
  db.portalAccess.findUnique.mockImplementation(async () => {
    const a = await validatePortalAccess("x");
    return { clientRequestId: a?.record?.clientRequestId ?? null };
  });
  db.portalAccess.update.mockResolvedValue({});
  // Token de uma solicitação que JÁ pertence a um cliente — o caso comum.
  // ⚠️ 15/08/2026 (rodada 4) — O TOKEN PASSOU A EXIGIR `clientId` NO REGISTRO.
  // `PortalAccess.clientId` virou a ÚNICA prova de pertencimento de um token:
  // sem ela não se DERIVA dono do ponteiro `ClientRequestDb.clientId`, porque
  // derivar de ponteiro mutável foi o que produziu o incidente (um link legado
  // do cliente A abria o portal do cliente B). Por isso os fixtures abaixo
  // carregam o dono, que é a forma que os links emitidos passam a ter.
  // Token legado (sem `clientId`) é RECUSADO — ver a pendência de reemissão.
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: "cr1", clientId: "cli1" } });
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", clientId: "cli1" });
  db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr1" }]);
  db.portalMessage.create.mockResolvedValue(MSG_CRIADA);
});

function post(body: Record<string, unknown>, cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/portal/messages", {
    method: "POST",
    body: JSON.stringify(body),
    ...(cookie ? { headers: { cookie } } : {}),
  });
}

describe("envio do cliente pela gaveta do PM", () => {
  it("via token: cria a mensagem com readByTeam=false (o PM precisa VER que chegou)", async () => {
    const res = await POST(post({ token: "tok-1", body: "Oi, PM!", authorName: "Foocci" }));
    expect(res.status).toBe(201);

    const data = db.portalMessage.create.mock.calls[0]![0].data;
    expect(data.authorRole).toBe("client");
    expect(data.readByTeam).toBe(false);
    expect(data.readByClient).toBe(true);
    // As DUAS chaves: a solicitação (compatibilidade) e o dono (a âncora nova).
    expect(data.clientRequestId).toBe("cr1");
    expect(data.clientId).toBe("cli1");
  });

  // ⚠️ 15/08/2026 — EM MODO COOKIE O SELO DA TELA PASSOU A SER OBRIGATÓRIO.
  // O cookie do portal é UM por navegador, para o domínio inteiro, e guarda UM
  // cliente: é o único caminho em que a tela e a conversa podem discordar. Selo
  // que se desliga ao ser omitido não é trava — é aviso. Ver `donoConfere`.
  it("via cookie httpOnly (A4): mesmo resultado, com o selo da tela", async () => {
    const res = await POST(post({ body: "Oi, PM!", dono: donoDaTela("cli1") }, `${PORTAL_COOKIE}=tok-cookie`));
    expect(res.status).toBe(201);
    // rodada 5: quem resolve QUAL CLIENTE é o resolvedor único.
    expect(escopoDoToken).toHaveBeenCalledWith("tok-cookie");
    expect(db.portalMessage.create.mock.calls[0]![0].data.readByTeam).toBe(false);
  });

  it("⛔ via cookie SEM o selo da tela: 409 e NADA gravado", async () => {
    const res = await POST(post({ body: "Oi, PM!" }, `${PORTAL_COOKIE}=tok-cookie`));
    expect(res.status).toBe(409);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("mensagem vazia → 400, nada gravado", async () => {
    const res = await POST(post({ token: "tok-1", body: "   " }));
    expect(res.status).toBe(400);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });

  it("token inválido → 403", async () => {
    validatePortalAccess.mockResolvedValue({ valid: false, reason: "revoked" });
    const res = await POST(post({ token: "tok-podre", body: "Oi" }));
    expect(res.status).toBe(403);
  });
});

describe("leitura da conversa pelo cookie", () => {
  it("GET com cookie E o selo da tela lista o thread do cliente", async () => {
    db.portalMessage.findMany.mockResolvedValue([{ ...MSG_CRIADA, authorRole: "team" }]);
    db.portalMessage.updateMany.mockResolvedValue({ count: 1 });

    const req = new NextRequest(`http://localhost/api/portal/messages?dono=${donoDaTela("cli1")}`, {
      headers: { cookie: `${PORTAL_COOKIE}=tok-cookie` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    // rodada 5: quem resolve QUAL CLIENTE é o resolvedor único.
    expect(escopoDoToken).toHaveBeenCalledWith("tok-cookie");
    // Ao ver a conversa, as mensagens da equipe ficam lidas PARA O CLIENTE.
    expect(db.portalMessage.updateMany.mock.calls[0]![0].where.authorRole).toBe("team");
  });

  it("⛔ GET com cookie e SEM selo devolve vazio com motivo — e não marca nada como lido", async () => {
    db.portalMessage.findMany.mockResolvedValue([{ ...MSG_CRIADA, authorRole: "team" }]);
    const req = new NextRequest("http://localhost/api/portal/messages", {
      headers: { cookie: `${PORTAL_COOKIE}=tok-cookie` },
    });
    const res = await GET(req);
    const j = await res.json();
    expect(j.messages).toEqual([]);
    expect(j.motivo).toBe("dono-divergente");
    expect(db.portalMessage.updateMany).not.toHaveBeenCalled();
  });
});
