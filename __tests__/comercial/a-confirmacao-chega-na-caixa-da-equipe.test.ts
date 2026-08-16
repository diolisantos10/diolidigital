// A CONFIRMAÇÃO DO BRIEFING APARECE PARA ALGUÉM? — a pergunta que faltava.
//
// ── Por que este arquivo existe (16/08/2026, cobrado por `qualidade`) ───────
//
// Em 16/08 a casa passou a gravar uma `PortalMessage` de confirmação toda vez
// que um briefing chega (`registrarConfirmacaoNoPortal`). O argumento era: ela
// não depende de e-mail, então o cliente para de ficar sem sinal.
//
// **Só que o prospect não lê essa mensagem.** Ele acabou de sair do briefing
// público e não tem portal, não tem login e não tem link. Quem lê é a EQUIPE, na
// caixa de entrada — e ninguém tinha verificado se ela chega lá. Se não chegar,
// a confirmação é uma linha no banco e nada mais: o BLOCO 2 inteiro seria
// decoração.
//
// A dúvida concreta era o filtro `escopo` de `GET /api/messages`: ele monta as
// chaves a partir das solicitações do workspace, e a mensagem da confirmação tem
// `clientId` NULO — a âncora é `clientRequestId`, porque no instante do briefing
// ainda não existe ficha de cliente.
//
// Este arquivo responde com a rota de verdade, não com leitura de código.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  clientRequestDb: { findMany: vi.fn() },
  portalMessage: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  contentRequest: { count: vi.fn(), groupBy: vi.fn() },
}));
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { GET } from "@/app/api/messages/route";

const AGORA = new Date("2026-08-16T01:30:00Z");
const CONFIRMACAO = "Recebemos seu briefing. Está tudo aqui com a gente. ✅";

function req(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/messages${query}`);
}

/** O estado real depois de um briefing público: solicitação do workspace, sem
 *  ficha de cliente, com UMA mensagem da equipe (a confirmação). */
function briefingRecemChegado(solicitacoes: object[]) {
  db.client.findMany.mockResolvedValue([]);
  db.clientRequestDb.findMany.mockResolvedValue(solicitacoes);
  db.portalMessage.groupBy
    .mockResolvedValueOnce([
      { clientId: null, clientRequestId: "cr-lead", _count: { _all: 1 }, _max: { createdAt: AGORA } },
    ])
    .mockResolvedValueOnce([]); // não-lidas: nenhuma (a confirmação é da equipe)
  db.portalMessage.findMany.mockResolvedValue([
    { clientId: null, clientRequestId: "cr-lead", authorRole: "team", body: CONFIRMACAO, createdAt: AGORA },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: "ws1", role: "master" }, error: null });
  db.portalMessage.groupBy.mockResolvedValue([]);
  db.portalMessage.findMany.mockResolvedValue([]);
  db.portalMessage.count.mockResolvedValue(0);
  db.contentRequest.count.mockResolvedValue(0);
  db.contentRequest.groupBy.mockResolvedValue([]);
});

describe("a confirmação do briefing na caixa de entrada da equipe", () => {
  // ── METADE 1: ELA CHEGA ───────────────────────────────────────────────────
  it("vira LINHA VISÍVEL, com o nome do negócio e a prévia da confirmação", async () => {
    briefingRecemChegado([{ id: "cr-lead", clientId: null, businessName: "Padaria do Zé" }]);

    const { conversas } = await (await GET(req())).json();
    expect(conversas, "a confirmação não produziu linha nenhuma na caixa da equipe").toHaveLength(1);
    expect(conversas[0].chave).toBe("req:cr-lead");
    expect(conversas[0].nome).toBe("Padaria do Zé");
    expect(conversas[0].previa).toContain("Recebemos seu briefing");
    expect(conversas[0].ultimaPor).toBe("team");
  });

  it("a chave `clientRequestId` entra no filtro de escopo — é o que a torna visível", async () => {
    briefingRecemChegado([{ id: "cr-lead", clientId: null, businessName: "Padaria do Zé" }]);
    await GET(req());
    const escopo = db.portalMessage.groupBy.mock.calls[0]![0].where;
    expect(escopo).toEqual({ clientRequestId: { in: ["cr-lead"] } });
  });

  // ── METADE 2: O QUE ELA NÃO FAZ, E PRECISA ESTAR ESCRITO ──────────────────
  it("🔴 NÃO acende o badge do menu — quem só olha o número não sabe que chegou briefing", async () => {
    // `readByTeam: true` é deliberado (a equipe não "lê" a própria mensagem), e o
    // badge conta só mensagem do CLIENTE não lida. Consequência medida: um
    // briefing novo entra na LISTA e deixa o contador em zero. Quem depende do
    // badge continua sem sinal — isto é buraco declarado, não conserto.
    briefingRecemChegado([{ id: "cr-lead", clientId: null, businessName: "Padaria do Zé" }]);
    const resumo = await (await GET(req("?resumo=1"))).json();
    expect(resumo.naoLidas).toBe(0);
    expect(resumo.total).toBe(0);
  });

  it("🔴 solicitação ÓRFÃ (sem workspace e sem cliente) fica invisível — o defeito de 01/08 pela porta de trás", async () => {
    // `createClientRequest` resolve o dono por `resolverWorkspacePublico()`.
    // Com UM workspace ele acerta sempre — é o caso desta casa hoje. Com o banco
    // oscilando no instante do POST, ou com mais de um workspace, a solicitação
    // nasce SEM dono; a busca de solicitações desta rota (workspace da sessão OU
    // cliente da sessão) não a alcança, e a confirmação some junto.
    briefingRecemChegado([]); // a órfã não volta na busca por workspace
    const { conversas } = await (await GET(req())).json();
    expect(conversas).toHaveLength(0);
  });

  it("a mensagem da equipe não é contada como não-lida (o badge não infla com eco do sistema)", async () => {
    briefingRecemChegado([{ id: "cr-lead", clientId: null, businessName: "Padaria do Zé" }]);
    const { conversas } = await (await GET(req())).json();
    expect(conversas[0].naoLidas).toBe(0);
    expect(conversas[0].total).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ O LADO QUE FALTAVA: O GRAVADOR (16/08/2026, terceira passada)
// ═══════════════════════════════════════════════════════════════════════════
//
// `qualidade` desmontou o portão acima em uma frase: **ele mocka o prisma
// inteiro.** Toda a prova é sobre o LEITOR (`GET /api/messages` consulta por
// `clientRequestId`) — e o leitor consulta o que o teste mandou o mock devolver.
//
// Consequência medida: **trocar o gravador de `clientRequestId` para `clientId`
// deixa o teste verde e a mensagem some da caixa.** A âncora é justamente o que
// torna a confirmação visível, porque no instante do briefing ainda não existe
// ficha de cliente — `clientId` é NULO.
//
// A prova abaixo é sobre o PAYLOAD QUE VAI PARA O BANCO, e ela fecha a volta:
// o campo que o gravador escreve é o mesmo campo pelo qual o leitor pergunta.

describe("o GRAVADOR ancora a confirmação em `clientRequestId` — e é isso que a torna visível", () => {
  it("🔴 grava com `clientRequestId`, `clientId` ausente, e como mensagem da EQUIPE", async () => {
    const create = vi.fn().mockResolvedValue({ id: "pm1" });
    vi.doMock("@/lib/db/client", () => ({ prisma: { portalMessage: { create } } }));
    vi.resetModules();

    // O gravador mora em `lib/` (e não dentro do `route.ts`) justamente para
    // este portão poder importá-lo: arquivo de rota do App Router não pode
    // exportar função que não seja verbo HTTP.
    const { registrarConfirmacaoNoPortal } = await import("@/lib/agency/comercial/confirmacao-no-portal");
    await registrarConfirmacaoNoPortal({
      clientRequestId: "cr-lead",
      services: ["Social Media"],
      anexos: 0,
      temComoFalar: true,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const dados = create.mock.calls[0]![0].data as Record<string, unknown>;

    // A ÂNCORA. Se isto virar `clientId`, a mensagem some da caixa da equipe.
    expect(dados.clientRequestId, "a confirmação deixou de ser ancorada na solicitação").toBe("cr-lead");
    expect(dados.clientId, "gravar `clientId` no briefing público é inventar ficha que não existe").toBeUndefined();
    expect(dados.authorRole).toBe("team");
    expect(String(dados.body)).toContain("Recebemos seu briefing");

    vi.doUnmock("@/lib/db/client");
    vi.resetModules();
  });

  it("gravador e leitor perguntam pelo MESMO campo — a volta fecha", async () => {
    // O leitor: já provado acima (`groupBy` com `{ clientRequestId: { in: [...] } }`).
    // Aqui a prova é textual e barata, e existe para nomear o par: se um dos dois
    // mudar de campo sem o outro, a confirmação vira linha invisível no banco.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const gravador = readFileSync(
      path.join(process.cwd(), "app/api/brain/client-requests/route.ts"),
      "utf8",
    );
    const leitor = readFileSync(path.join(process.cwd(), "app/api/messages/route.ts"), "utf8");
    const modulo = readFileSync(
      path.join(process.cwd(), "lib/agency/comercial/confirmacao-no-portal.ts"),
      "utf8",
    );
    expect(modulo).toContain("clientRequestId: input.clientRequestId");
    expect(gravador).toContain("registrarConfirmacaoNoPortal({");
    expect(leitor).toContain("clientRequestId");
  });
});
