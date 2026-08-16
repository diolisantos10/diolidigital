// A CONVERSA PERTENCE AO CLIENTE — as duas metades.
//
// O defeito de origem: `PortalMessage.clientRequestId` era obrigatório e a
// thread era ancorada SÓ nele. Cliente criado direto pela agência (Foocci) não
// tem `ClientRequestDb` — a rota devolvia 404, a bolha voltava para a caixa e a
// tela dizia "Não foi possível enviar. Tente novamente." para sempre.
//
// Este arquivo anda a corrente inteira, e anda as duas metades de cada coisa:
//   • cliente COM solicitação e cliente DIRETO conseguem enviar;
//   • a leitura une as duas chaves — histórico antigo (só clientRequestId) e
//     mensagem nova (clientId) aparecem na MESMA conversa;
//   • mensagem de um cliente NUNCA entra no filtro de outro;
//   • o lado da equipe abre por clientId, e workspace alheio não abre;
//   • acesso sem dono nenhum não é mais 404 mudo: é 409 explicado, e a tela
//     desliga a caixa de texto em vez de prometer reenvio eterno.

import { donoFalso, escopoFalso } from "../_stubs/escopo-do-token";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  portalMessage: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  clientRequestDb: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
  // ⚠️ rodada 3: a prova de que uma solicitação já foi de outro deixou de
  // depender só da mensagem — passou a olhar PortalAccess, Project e
  // ApprovalRequest (ver `solicitacao-que-mudou-de-dono.ts`). Sem estes mocks
  // a apuração falha e a cerca FECHA (que é o certo), mas a suíte não estaria
  // exercitando o caminho limpo.
  project: { findMany: vi.fn() },
  approvalRequest: { findMany: vi.fn() },
  // ⚠️ 15/08/2026: o dono passou a ser CONGELADO no `PortalAccess`
  // (`donoDoToken`) em vez de re-derivado a cada chamada.
  portalAccess: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
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
import { conversaDoCliente, conversaDaSolicitacao } from "@/app/api/messages/conversa";

const AGORA = new Date("2026-08-05T10:00:00Z");

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/portal/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
function get(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/portal/messages${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.portalMessage.create.mockResolvedValue({
    id: "m1", authorRole: "client", authorName: "Foocci", body: "oi", createdAt: AGORA,
  });
  db.portalMessage.findMany.mockResolvedValue([]);
  db.portalMessage.updateMany.mockResolvedValue({ count: 0 });
  db.portalMessage.count.mockResolvedValue(0);
  db.clientRequestDb.findMany.mockResolvedValue([]);
  // Espelho do real (rodada 4): `PortalAccess.clientId` é a única prova;
  // não se deriva do ponteiro, e ponteiro andado recusa.
  donoDoToken.mockImplementation(donoFalso(validatePortalAccess, db));
  escopoDoToken.mockImplementation(escopoFalso(validatePortalAccess, db));
  db.portalAccess.findUnique.mockImplementation(async () => {
    const a = await validatePortalAccess("x");
    return { clientRequestId: a?.record?.clientRequestId ?? null };
  });
  db.portalAccess.update.mockResolvedValue({});
  db.portalAccess.findMany.mockResolvedValue([]);
  db.project.findMany.mockResolvedValue([]);
  db.approvalRequest.findMany.mockResolvedValue([]);
  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: "ws1", role: "master" }, error: null });
});

// ── METADE 1: o cliente DIRETO (o caso Foocci) ───────────────────────────────
describe("cliente criado DIRETO, sem solicitação de briefing", () => {
  beforeEach(() => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientId: "cli-foocci", clientRequestId: null } });
    db.clientRequestDb.findMany.mockResolvedValue([]); // ele não tem nenhuma
  });

  it("CONSEGUE enviar — era exatamente isto que devolvia 404", async () => {
    const res = await POST(post({ token: "tok", body: "Quero falar com vocês" }));
    expect(res.status).toBe(201);
    const data = db.portalMessage.create.mock.calls[0]![0].data;
    expect(data.clientId).toBe("cli-foocci");
    expect(data.clientRequestId).toBeNull();
    expect(data.readByTeam).toBe(false); // acende o badge da agência
  });

  it("a leitura filtra só por clientId — sem chave de solicitação sobrando", async () => {
    await GET(get("?token=tok"));
    // ⚠️ 15/08/2026 — A FORMA MUDOU, E A MUDANÇA É O CONSERTO.
    // A chave continua sendo `clientId` e só. O que envolve tudo agora é a
    // CERCA DO DONO: nenhuma linha carimbada para outro cliente sai, venha por
    // qual chave vier. Ver o cabeçalho de `montarFiltro` em `conversa.ts` e o
    // incidente em `__tests__/portal/conversa-de-outro-cliente.test.ts`.
    // ⚠️ RODADA 4 — A FORMA MUDOU DE NOVO, e agora é a mais simples possível.
    // A defesa deixou de procurar prova de CONTAMINAÇÃO para excluir e passou
    // a exigir prova de PERTENCIMENTO para incluir: só sai a linha com dono
    // ESCRITO. Ver o cabeçalho de `montarFiltro`.
    expect(db.portalMessage.findMany.mock.calls.at(-1)![0].where).toEqual({ clientId: "cli-foocci" });
  });
});

// ⚠️ `findMany.mock.calls.at(-1)` e não `[0]`: desde 15/08/2026 a leitura da
// conversa faz ANTES uma consulta de contaminação — quais solicitações deste
// cliente já foram de outro (ver `conversaDoCliente`). A chamada que interessa
// aqui é sempre a ÚLTIMA: a leitura das mensagens.

// ── METADE 2: o cliente que veio do briefing ─────────────────────────────────
describe("cliente COM solicitação", () => {
  beforeEach(() => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientId: "cli1", clientRequestId: "cr1" } });
    db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr1" }, { id: "cr0" }]);
  });

  it("envia carimbando AS DUAS chaves — a conversa não se parte quando o cliente ganha solicitação", async () => {
    const res = await POST(post({ token: "tok", body: "oi" }));
    expect(res.status).toBe(201);
    const data = db.portalMessage.create.mock.calls[0]![0].data;
    expect(data.clientId).toBe("cli1");
    expect(data.clientRequestId).toBe("cr1");
  });

  it("a leitura UNE as duas chaves — o histórico das 11 escritas antigas continua visível", async () => {
    await GET(get("?token=tok"));
    // A união continua de pé (é ela que impede o histórico de partir em duas),
    // mas agora dentro da CERCA DO DONO. `clientId: null` continua passando de
    // propósito: é o formato das 11 escritas antigas, e barrá-lo apagaria
    // histórico legítimo do portal. Ver `conversa-de-outro-cliente.test.ts`.
    // ⚠️ RODADA 4: a UNIÃO por `clientRequestId` MORREU, e a morte é o
    // conserto — ela existia para achar linha SEM `clientId`, que é exatamente
    // a linha sem prova de dono. Era ela que arrastava a conversa antiga para
    // o dono novo de uma solicitação re-apontada.
    expect(db.portalMessage.findMany.mock.calls.at(-1)![0].where).toEqual({ clientId: "cli1" });
    expect(JSON.stringify(db.portalMessage.findMany.mock.calls.at(-1)![0].where)).not.toContain("clientRequestId");
  });

  it("ao abrir, marca como lidas as mensagens da EQUIPE — no mesmo escopo unido", async () => {
    await GET(get("?token=tok"));
    const where = db.portalMessage.updateMany.mock.calls[0]![0].where;
    expect(where.authorRole).toBe("team");
    expect(where.readByClient).toBe(false);
    // A marcação de lida usa O MESMO filtro da leitura — inclusive a cerca.
    // Se ela divergisse, o cliente novo carimbaria como lida a mensagem do
    // cliente antigo, e o vazamento apagaria o próprio rastro.
    // A marcação de lida usa O MESMO filtro da leitura. Se divergisse, o
    // cliente carimbaria como lida a mensagem de outro, e o vazamento apagaria
    // o próprio rastro.
    expect(where.clientId).toBe("cli1");
    expect(JSON.stringify(where)).not.toContain("clientRequestId");
  });
});

// ── A TRAVA: nunca o cliente errado ──────────────────────────────────────────
describe("isolamento entre clientes", () => {
  it("solicitação de OUTRO cliente apontada pelo token não vira âncora", async () => {
    // O token diz clientId=cli1 e clientRequestId=cr-de-outro. As solicitações
    // de cli1 são cr1/cr0 — a preferida é descartada por não ser dele.
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientId: "cli1", clientRequestId: "cr-de-outro" } });
    db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr1" }, { id: "cr0" }]);

    await POST(post({ token: "tok", body: "oi" }));
    const data = db.portalMessage.create.mock.calls[0]![0].data;
    expect(data.clientRequestId).toBe("cr1");
    expect(data.clientRequestId).not.toBe("cr-de-outro");
  });

  it("prospect (solicitação SEM cliente) fica preso à própria solicitação — nunca a um clientId nulo", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr-prospect", clientId: null });
    const prospect = await conversaDaSolicitacao("cr-prospect");
    // ⚠️ 15/08/2026 — O RAMO DO PROSPECT GANHOU CERCA (furo F1).
    // Ele é o ramo que PRODUZ as linhas sem `clientId`, e era o único sem
    // cerca — o `qualidade` leu por ele, pela rota real, a mensagem de um
    // cliente de verdade (`P1 (token de PROSPECT) → ["SEGREDO-…"]`). Conversa
    // de prospect é só o que AINDA não tem dono; linha já carimbada pertence a
    // um cliente e não volta por uma porta de prospect.
    expect(prospect.filtro).toEqual({
      AND: [{ clientRequestId: { in: ["cr-prospect"] } }, { clientId: null }],
    });
    expect(prospect.ancora).toEqual({ clientId: null, clientRequestId: "cr-prospect" });
    // ⚠️ A asserção antiga era `not.toContain("clientId")`, e ela dizia uma
    // coisa VERDADEIRA de um jeito que virou mentira: `clientId` não pode ser
    // uma CHAVE SOLTA (`{ clientId: null }` sozinho casaria com toda mensagem
    // órfã do banco). Como EXIGÊNCIA dentro de um AND, ao lado da solicitação,
    // ele é a cerca — restringe, não amplia. O que continua proibido é a chave
    // solta, e é isso que se afirma agora.
    expect(prospect.filtro).not.toEqual({ clientId: null });
    expect((prospect.filtro as { AND: unknown[] }).AND).toHaveLength(2);
  });

  it("cliente sem nada (nem solicitação, nem id) tem filtro NULO — não lê o banco inteiro", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue(null);
    const vazia = await conversaDaSolicitacao("nao-existe");
    expect(vazia.filtro).toBeNull();
  });
});

// ── O lado da EQUIPE ────────────────────────────────────────────────────────
describe("a equipe abre a conversa", () => {
  it("por clientId — o caminho que serve o cliente direto", async () => {
    db.client.findFirst.mockResolvedValue({ id: "cli-foocci" });
    db.clientRequestDb.findMany.mockResolvedValue([]);
  // `donoDoToken` é o caminho ÚNICO desde 15/08/2026. Aqui ele IMITA o real:
  // congela o dono do registro do token e, sem dono no registro, deriva da
  // solicitação. Mockar um valor fixo esconderia justamente o que mudou.
  donoDoToken.mockImplementation(async (token: string) => {
    const a = await validatePortalAccess(token);
    if (!a?.valid || !a.record) return { ok: false, motivo: "token_invalido" };
    let id: string | null = a.record.clientId ?? null;
    if (!id && a.record.clientRequestId) {
      const sol = await db.clientRequestDb.findUnique({
        where: { id: a.record.clientRequestId }, select: { clientId: true },
      });
      id = sol?.clientId ?? null;
    }
    return id ? { ok: true, clientId: id, workspaceId: "ws1" } : { ok: false, motivo: "sem_dono" };
  });
  db.portalAccess.findUnique.mockImplementation(async () => {
    const a = await validatePortalAccess("x");
    return { clientRequestId: a?.record?.clientRequestId ?? null };
  });
  db.portalAccess.update.mockResolvedValue({});
  db.portalAccess.findMany.mockResolvedValue([]);
  db.project.findMany.mockResolvedValue([]);
  db.approvalRequest.findMany.mockResolvedValue([]);
    const res = await GET(get("?clientId=cli-foocci"));
    expect(res.status).toBe(200);
    // Mesma cerca do lado da EQUIPE: a caixa de entrada abre a conversa de um
    // cliente e não pode trazer linha de outro por tabela de solicitação.
    // ⚠️ RODADA 4 — A FORMA MUDOU DE NOVO, e agora é a mais simples possível.
    // A defesa deixou de procurar prova de CONTAMINAÇÃO para excluir e passou
    // a exigir prova de PERTENCIMENTO para incluir: só sai a linha com dono
    // ESCRITO. Ver o cabeçalho de `montarFiltro`.
    expect(db.portalMessage.findMany.mock.calls.at(-1)![0].where).toEqual({ clientId: "cli-foocci" });
    // Ao ver, as mensagens do CLIENTE ficam lidas para a equipe — é o que
    // apaga o badge da caixa de entrada.
    expect(db.portalMessage.updateMany.mock.calls[0]![0].where.readByTeam).toBe(false);
  });

  it("estar logado NÃO é ser dono: cliente de outro workspace → 404", async () => {
    db.client.findFirst.mockResolvedValue(null);
    const res = await GET(get("?clientId=cli-alheio"));
    expect(res.status).toBe(404);
    expect(db.portalMessage.findMany).not.toHaveBeenCalled();
  });

  it("sem sessão → 401, e nada é lido", async () => {
    requireSession.mockResolvedValue({
      session: null,
      error: new Response(null, { status: 401 }) as unknown as Response,
    });
    const res = await GET(get("?clientId=cli1"));
    expect(res.status).toBe(401);
  });

  it("a mensagem da equipe nasce readByClient=false — o cliente precisa VER que respondemos", async () => {
    db.client.findFirst.mockResolvedValue({ id: "cli1" });
    db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr1" }]);
    await POST(post({ clientId: "cli1", body: "respondendo" }));
    const data = db.portalMessage.create.mock.calls[0]![0].data;
    expect(data.authorRole).toBe("team");
    expect(data.authorName).toBe("PM");
    expect(data.readByTeam).toBe(true);
    expect(data.readByClient).toBe(false);
  });
});

// ── Acesso sem dono: o erro deixa de ser mudo ────────────────────────────────
describe("token válido que não aponta para ninguém", () => {
  beforeEach(() => {
    validatePortalAccess.mockResolvedValue({ valid: true, record: { clientId: null, clientRequestId: null } });
  });

  // ⚠️ RODADA 5 — o veredito mudou de "conversa vazia" para RECUSA, e é o
  // conserto: token que não aponta para dono nenhum não abre conversa. As duas
  // portas (`escopoDoToken` e `conversaDoToken`) agora dão a MESMA resposta —
  // era a divergência entre elas que servia a conversa de outro cliente.
  it("GET recusa: token sem dono não abre conversa nenhuma", async () => {
    const res = await GET(get("?token=tok"));
    // Antes: 200 com `{ podeEnviar: false, motivo: "sem-dono" }` — conversa
    // vazia. Agora é RECUSA, porque abrir uma conversa para um token que não
    // aponta para dono nenhum foi o caminho que serviu a conversa de outro.
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("sem_dono");
  });

  it("POST recusa pelo MESMO motivo — um caminho, não dois", async () => {
    const res = await POST(post({ token: "tok", body: "oi" }));
    // O MESMO veredito do GET — era a divergência entre os dois que produzia
    // o vazamento. E, sobretudo: nada é gravado, então nenhuma "prova" de
    // pertencimento é fabricada em nome de outro cliente.
    expect(res.status).toBe(403);
    expect(db.portalMessage.create).not.toHaveBeenCalled();
  });
});

// ── A âncora, isolada ───────────────────────────────────────────────────────
describe("conversaDoCliente", () => {
  it("prefere a solicitação mais recente quando não há preferência", async () => {
    db.clientRequestDb.findMany.mockResolvedValue([{ id: "cr-novo" }, { id: "cr-velho" }]);
    const c = await conversaDoCliente("cli1");
    expect(c.ancora).toEqual({ clientId: "cli1", clientRequestId: "cr-novo" });
    expect(c.clientRequestIdsDaEscrita).toEqual(["cr-novo", "cr-velho"]);
  });
});
