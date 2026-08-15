// ── OS FUROS QUE O `seguranca` PLANTOU CONTRA A RODADA 1 (15/08/2026) ───────
//
// A rodada 1 cercou a CONVERSA. O `seguranca` passou por cima da cerca com
// ataques reais e barrou o merge. Este arquivo é um teste por furo, com banco
// de verdade e rotas de verdade — cada um falha sem o conserto.
//
// A causa reescrita: quem move o ponteiro `ClientRequestDb.clientId` NÃO é o
// `/api/admin/reset` (ele apaga `portalMessage` e `portalAccess` em TODOS os
// modos — `route.ts:177-178` — então não sobra mensagem para vazar). Quem move
// é `lib/agency/balcao/producao.ts`: acha `Client` por e-mail NÃO VERIFICADO
// vindo do formulário de compra e re-aponta a solicitação incondicionalmente.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/furos-rodada-2.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { prisma } from "@/lib/db/client";
import { GET as lerConversa } from "@/app/api/portal/messages/route";
import { GET as lerVista } from "@/app/api/portal/vista/route";
import { donoDoToken, resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { conversaDaSolicitacao, conversaDoCliente } from "@/app/api/messages/conversa";
import { gravarMensagemDoPortal } from "@/lib/agency/portal/mensagem-do-portal";
import { censoDeHistoricoAmbiguo } from "@/lib/agency/portal/solicitacao-que-mudou-de-dono";
import { donoConfere } from "@/lib/agency/portal/dono-da-tela";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

const SEGREDO_LEGADO = "SEGREDO-LEGADO proposta de R$ 12.000";

let ws = "";
let alfa = "";
let beta = "";
let reqAlfa = "";

function get(url: string, cookie?: string): NextRequest {
  const r = new NextRequest(`http://localhost${url}`);
  if (cookie) r.cookies.set(PORTAL_COOKIE, cookie);
  return r;
}
async function corpos(res: Response): Promise<string[]> {
  const j = (await res.json()) as { messages?: { body: string }[] };
  return (j.messages ?? []).map((m) => m.body);
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `furo-${Date.now()}` } })).id;
  alfa = (await prisma.client.create({ data: { workspaceId: ws, name: "Agência ALFA", email: "dono@alfa.com" } })).id;
  beta = (await prisma.client.create({ data: { workspaceId: ws, name: "Loja BETA" } })).id;
  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: ws, role: "master" }, error: null });
});

beforeEach(async () => {
  await prisma.portalMessage.deleteMany({});
  await prisma.portalAccess.deleteMany({});
  await prisma.clientRequestDb.deleteMany({});
  reqAlfa = (await prisma.clientRequestDb.create({
    data: {
      workspaceId: ws, clientId: alfa, businessName: "Agência ALFA", segment: "agência",
      services: "[]", objectives: "[]", status: "in_progress", rawContext: "x",
    },
  })).id;
});

// ═══════════════════════════════════════════════════════════════════════════
// FURO B — o pior: era o PORTAL INTEIRO, não a conversa
// ═══════════════════════════════════════════════════════════════════════════
describe("FURO B — o token seguia o ponteiro e virava outro cliente", () => {
  it("⛔ `/api/portal/vista` NÃO devolve a marca de outro cliente quando o ponteiro anda", async () => {
    // Token do ALFA, congelado no primeiro uso.
    await prisma.portalAccess.create({ data: { token: "tk-b", clientId: alfa, clientRequestId: reqAlfa } });
    expect((await (await lerVista(get("/api/portal/vista?token=tk-b"))).json()).marca.nome).toBe("Agência ALFA");

    // O ponteiro anda por baixo (era o que o balcão fazia).
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });

    const res = await lerVista(get("/api/portal/vista?token=tk-b"));
    // O probe do `seguranca` recebia aqui `marca.nome = "Loja BETA"`.
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("Loja BETA");
  });

  it("⛔ e a conversa fecha pelo MESMO motivo, com razão nomeada", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-b2", clientId: alfa, clientRequestId: reqAlfa } });
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    const res = await lerConversa(get("/api/portal/messages?token=tk-b2"));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).toContain("ponteiro_andou");
  });

  it("⛔ a recusa é REGISTRADA NO BANCO, não só no log do contêiner", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-b3", clientId: alfa, clientRequestId: reqAlfa } });
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    await donoDoToken("tk-b3");
    const evento = await prisma.activityEvent.findFirst({ where: { type: "portal_ponteiro_andou" } });
    expect(evento).not.toBeNull();
    expect(evento?.clientId).toBe(alfa);
  });

  it("✅ token SEM dono congela no primeiro uso — e não muda depois", async () => {
    const semDono = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalAccess.create({ data: { token: "tk-b4", clientRequestId: semDono.id } });

    expect(await resolvePortalClient("tk-b4")).toMatchObject({ clientId: beta });
    // Congelou no registro — deixou de depender do ponteiro.
    expect((await prisma.portalAccess.findUnique({ where: { token: "tk-b4" } }))?.clientId).toBe(beta);

    await prisma.clientRequestDb.update({ where: { id: semDono.id }, data: { clientId: alfa } });
    expect(await resolvePortalClient("tk-b4")).toBeNull();
  });

  it("✅ caso limpo: ponteiro parado, token funciona sempre", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-b5", clientId: alfa, clientRequestId: reqAlfa } });
    for (let i = 0; i < 3; i++) {
      expect((await (await lerVista(get("/api/portal/vista?token=tk-b5"))).json()).marca.nome).toBe("Agência ALFA");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FURO A — a cerca era probabilística: conversa 100% legada atravessava
// ═══════════════════════════════════════════════════════════════════════════
describe("FURO A — os sete escritores carimbam o dono", () => {
  it("⛔ mensagem gravada pelo caminho da esteira NASCE com clientId", async () => {
    // Sem isto, a linha nasce `clientId: null` — e conversa 100% legada não
    // tem carimbo alheio nenhum para a "prova de contaminação" achar.
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "SDR Dioli", body: SEGREDO_LEGADO,
    });
    const linha = await prisma.portalMessage.findFirst({ where: { body: SEGREDO_LEGADO } });
    expect(linha?.clientId).toBe(alfa);
  });

  it("⛔ e por isso ela NÃO atravessa para o portal de outro cliente", async () => {
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "SDR Dioli", body: SEGREDO_LEGADO,
    });
    // O ponteiro anda e o BETA abre com token PRÓPRIO (congelado nele).
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    await prisma.portalAccess.create({ data: { token: "tk-a", clientId: beta } });

    const lidas = await corpos(await lerConversa(get("/api/portal/messages?token=tk-a")));
    expect(lidas).not.toContain(SEGREDO_LEGADO);
  });

  it("✅ o dono legítimo continua lendo a própria mensagem", async () => {
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "SDR Dioli", body: SEGREDO_LEGADO,
    });
    await prisma.portalAccess.create({ data: { token: "tk-a2", clientId: alfa, clientRequestId: reqAlfa } });
    expect(await corpos(await lerConversa(get("/api/portal/messages?token=tk-a2")))).toContain(SEGREDO_LEGADO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RAMO DO PROSPECT — o que PRODUZ as linhas nulas, e estava sem cerca
// ═══════════════════════════════════════════════════════════════════════════
describe("ramo do prospect", () => {
  it("⛔ conversa de prospect só enxerga linha SEM dono", async () => {
    const prospect = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, businessName: "Quem chegou agora", services: "[]", objectives: "[]", rawContext: "x" },
    });
    // Uma linha carimbada para um cliente de verdade, presa à mesma
    // solicitação — é o caminho de volta do vazamento, quando a solicitação é
    // desvinculada e volta a parecer prospect.
    await prisma.portalMessage.create({
      data: { clientRequestId: prospect.id, clientId: alfa, authorRole: "team", authorName: "x", body: SEGREDO_LEGADO },
    });
    await prisma.portalMessage.create({
      data: { clientRequestId: prospect.id, authorRole: "team", authorName: "x", body: "oi-prospect" },
    });

    const c = await conversaDaSolicitacao(prospect.id);
    const linhas = await prisma.portalMessage.findMany({ where: c.filtro! });
    expect(linhas.map((l) => l.body)).toEqual(["oi-prospect"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FURO C — selo opcional não é trava
// ═══════════════════════════════════════════════════════════════════════════
describe("FURO C — em modo cookie o selo é OBRIGATÓRIO", () => {
  it("⛔ sem `dono`, a conversa por cookie RECUSA", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-c", clientId: alfa, clientRequestId: reqAlfa } });
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "x", body: SEGREDO_LEGADO,
    });
    // Um `curl` com o cookie — ou um bundle em cache do deploy anterior, que
    // não sabe mandar o selo.
    const res = await lerConversa(get("/api/portal/messages", "tk-c"));
    const bruto = JSON.stringify(await res.json());
    expect(bruto).not.toContain("SEGREDO-LEGADO");
    expect(bruto).toContain("dono-divergente");
  });

  it("✅ com TOKEN explícito o selo não é exigido — link legítimo não quebra", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-c2", clientId: alfa, clientRequestId: reqAlfa } });
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "x", body: SEGREDO_LEGADO,
    });
    expect(await corpos(await lerConversa(get("/api/portal/messages?token=tk-c2")))).toContain(SEGREDO_LEGADO);
  });

  // ── O CENÁRIO DE DUAS ABAS — a divergência REAL (rodada 2) ───────────────
  //
  // A rodada 1 afirmou que "tela e chat nunca divergem". A frase estava escopada
  // em *uma mesma visita*, e o `qualidade` mostrou onde ela não vale:
  //
  //   aba 1 fica aberta em `/portal/access/me` (cookie = ALFA);
  //   aba 2 abre o portal do BETA → o cookie do DOMÍNIO vira BETA;
  //   a aba 1 continua polindo o chat de 8 em 8 segundos SEM token
  //   (`PortalChat.tsx`, `setInterval(load, 8000)`) → passa a resolver BETA.
  //   E `carregarVista` NÃO é repolido, então o selo da aba 1 continua ALFA.
  //
  // É o selo velho que salva: ele discorda do cookie novo e a conversa fecha.
  it("⛔ aba 1 (selo ALFA) com o cookie já trocado para BETA → RECUSA", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-aba-a", clientId: alfa, clientRequestId: reqAlfa } });
    await prisma.portalAccess.create({ data: { token: "tk-aba-b", clientId: beta } });
    await gravarMensagemDoPortal({
      clientRequestId: reqAlfa, authorRole: "team", authorName: "x", body: SEGREDO_LEGADO,
    });

    // O selo que a aba 1 carrega é o do ALFA, tirado da vista dela.
    const seloDaAba1 = (await (await lerVista(get("/api/portal/vista?token=tk-aba-a"))).json()).dono;

    // A aba 2 trocou o cookie do navegador para o BETA. A aba 1 poliu de novo.
    const res = await lerConversa(get(`/api/portal/messages?dono=${seloDaAba1}`, "tk-aba-b"));

    const bruto = JSON.stringify(await res.json());
    expect(bruto).toContain("dono-divergente");
    // E nada do BETA vaza para a tela do ALFA, nem o contrário.
    expect(bruto).not.toContain("SEGREDO-LEGADO");
  });

  it("a regra, isolada: exigir=true recusa ausência; exigir=false tolera", () => {
    expect(donoConfere(alfa, undefined, true)).toBe(false);
    expect(donoConfere(alfa, undefined, false)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 RODADA 3 — AS DUAS METADES QUE NÃO TINHAM GATE NENHUM
//
// O `seguranca` mutou duas guardas e a suíte INTEIRA passou (4488 verdes, zero
// falhas). "Sem gate = reprovado" é doutrina desta casa. Estes testes são o
// gate — e o comentário mais importante do arquivo ("falha de leitura FECHA,
// não abre") passa a ter prova.
// ═══════════════════════════════════════════════════════════════════════════
describe("fail-closed da cerca: falha de leitura FECHA, não abre", () => {
  it("⛔ se a sonda de contaminação FALHA, lê-se só por clientId — nunca pela união", async () => {
    const espiao = vi.spyOn(prisma.portalMessage, "findMany");
    // A sonda é a PRIMEIRA chamada de `findMany` da leitura.
    espiao.mockRejectedValueOnce(new Error("banco tropeçou"));

    const c = await conversaDoCliente(alfa);

    // Sem saber quais solicitações estão limpas, a união NÃO pode ser montada:
    // o filtro fica preso ao dono. Se este teste cair, o `catch` virou
    // fail-OPEN e um tropeço de banco vira vazamento entre clientes.
    expect(JSON.stringify(c.filtro)).not.toContain("clientRequestId");
    expect(c.filtro).toEqual({
      AND: [{ clientId: alfa }, { OR: [{ clientId: alfa }, { clientId: null }] }],
    });
    espiao.mockRestore();
  });

  it("✅ e com a sonda respondendo, a união volta (a cerca não é sempre-fechada)", async () => {
    const c = await conversaDoCliente(alfa);
    expect(JSON.stringify(c.filtro)).toContain("clientRequestId");
  });
});

describe("o corte deixou de ser mudo — e não conta o acervo do vizinho", () => {
  it("⛔ com corte, a rota manda MOTIVO e NENHUM número", async () => {
    // 1 carimbada do BETA + 2 legadas, na solicitação que trocou de dono:
    // é o cenário exato do probe do `seguranca`.
    const r = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: alfa, businessName: "x", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalMessage.create({
      data: { clientRequestId: r.id, clientId: beta, authorRole: "team", authorName: "x", body: "do-beta" },
    });
    for (const b of ["legada-1", "legada-2"]) {
      await prisma.portalMessage.create({
        data: { clientRequestId: r.id, authorRole: "team", authorName: "x", body: b },
      });
    }
    await prisma.portalAccess.create({ data: { token: "tk-corte", clientId: alfa, clientRequestId: reqAlfa } });

    const j = await (await lerConversa(get("/api/portal/messages?token=tk-corte"))).json();

    expect(j.motivo).toBe("historico-parcial");
    expect(typeof j.detalhe).toBe("string");
    // 🔴 O NÚMERO NÃO PODE SAIR: `ocultadas: 2` seria a contagem do acervo do
    // outro cliente. Volume é metadado, e metadado vaza.
    expect(j.ocultadas).toBeUndefined();
    expect(JSON.stringify(j)).not.toMatch(/"ocultadas"/);
    // E nada do BETA atravessa junto.
    expect(JSON.stringify(j)).not.toContain("do-beta");
  });

  it("✅ sem corte, NÃO inventa aviso — conversa limpa sai limpa", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-limpo", clientId: beta } });
    const j = await (await lerConversa(get("/api/portal/messages?token=tk-limpo"))).json();
    expect(j.motivo).toBeUndefined();
    expect(j.podeEnviar).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 RODADA 3 — FURO B FECHOU EM 5 ROTAS E FICOU ABERTO EM 4
//
// A lição, nas palavras do `seguranca`: **"a trava vai onde o id é USADO —
// converter a função central não converte quem não a chama."**
//
// A rodada 2 converteu `donoDoToken` e 5 rotas. Quatro continuaram lendo
// `access.record.clientRequestId` — o ponteiro cru — e nelas o furo seguiu
// aberto. A pior não era leitura: `/api/portal/approvals` **APROVOU uma
// entrega de outro cliente** com token alheio (`200 {"status":"approved"}`), e
// nesta casa entrega aprovada publica.
//
// Este bloco cobre TODAS as portas que a varredura achou (8), não só as 4
// nomeadas — o mesmo erro de "converter só o que apontaram" não se repete.
// ═══════════════════════════════════════════════════════════════════════════
describe("ponteiro andado: TODAS as portas do token fecham", () => {
  it("⛔ nenhuma rota de portal serve o cliente novo com o token antigo", async () => {
    const { GET: portalData } = await import("@/app/api/brain/portal-data/route");
    const { POST: decidirAprovacao } = await import("@/app/api/portal/approvals/route");
    const { GET: esteiraGET } = await import("@/app/api/portal/esteira/route");
    const { GET: socialPosts } = await import("@/app/api/social-posts/route");
    const { GET: marcaGET } = await import("@/app/api/portal/marca/route");

    // O token do ALFA, congelado. Depois o ponteiro anda para o BETA.
    await prisma.portalAccess.create({ data: { token: "tk-r3", clientId: alfa, clientRequestId: reqAlfa } });
    await lerVista(get("/api/portal/vista?token=tk-r3")); // congela
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });

    const portas: [string, Response][] = [
      ["portal-data", await portalData(get("/api/brain/portal-data?token=tk-r3"))],
      ["esteira", await esteiraGET(get("/api/portal/esteira?token=tk-r3"))],
      ["social-posts", await socialPosts(get("/api/social-posts?token=tk-r3"))],
      ["marca", await marcaGET(get("/api/portal/marca?token=tk-r3"))],
      ["vista", await lerVista(get("/api/portal/vista?token=tk-r3"))],
      ["messages", await lerConversa(get("/api/portal/messages?token=tk-r3"))],
    ];

    for (const [nome, res] of portas) {
      const bruto = JSON.stringify(await res.json().catch(() => ({})));
      // Nem 200 com dado do BETA, nem o nome dele em lugar nenhum.
      expect(res.status, `${nome} devolveu ${res.status}`).toBeGreaterThanOrEqual(400);
      expect(bruto, `${nome} vazou o nome do BETA`).not.toContain("Loja BETA");
    }

    // A pior de todas: ESCRITA. Ela não pode nem chegar a decidir.
    const escrita = await decidirAprovacao(
      new NextRequest("http://localhost/api/portal/approvals", {
        method: "POST",
        body: JSON.stringify({ token: "tk-r3", approvalRequestId: "qualquer", action: "approve" }),
      }),
    );
    expect(escrita.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 ADENDO 1 DO `qualidade` — O FURO A NÃO ESTAVA FECHADO PARA O DADO EXISTENTE
//
// O carimbo de `clientId` vale a partir de agora; **nenhuma linha já gravada em
// produção o tem**. E a cerca só excluía uma solicitação quando havia, presa a
// ela, uma linha carimbada com OUTRO dono. Logo: conversa **100% legada** não
// tinha carimbo nenhum, não havia o que provar, e ela atravessava inteira.
//
// Este é o probe dele, com o `SEGREDO-LEGADO` no valor original.
// ═══════════════════════════════════════════════════════════════════════════
describe("histórico 100% LEGADO numa solicitação re-apontada", () => {
  it("⛔ não atravessa — mesmo sem UMA linha carimbada para provar nada", async () => {
    const r = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: alfa, businessName: "ALFA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    // O ALFA tinha portal — é ele a prova documental de que R foi dele.
    await prisma.portalAccess.create({ data: { token: "tk-leg-a", clientId: alfa, clientRequestId: r.id } });
    // Conversa inteira SEM carimbo: o formato de tudo que já está em produção.
    for (const b of [SEGREDO_LEGADO, "legada-b"]) {
      await prisma.portalMessage.create({
        data: { clientRequestId: r.id, authorRole: "team", authorName: "x", body: b },
      });
    }
    expect(await prisma.portalMessage.count({ where: { clientRequestId: r.id, clientId: { not: null } } })).toBe(0);

    // O ponteiro anda: R passa a ser do BETA, que abre com o token DELE.
    await prisma.clientRequestDb.update({ where: { id: r.id }, data: { clientId: beta } });
    await prisma.portalAccess.create({ data: { token: "tk-leg-b", clientId: beta } });

    const lidas = await corpos(await lerConversa(get("/api/portal/messages?token=tk-leg-b")));

    expect(lidas).not.toContain(SEGREDO_LEGADO);
    expect(lidas).not.toContain("legada-b");
  });

  it("✅ e o dono legítimo de uma solicitação que NUNCA mudou lê o legado inteiro", async () => {
    const r = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalMessage.create({
      data: { clientRequestId: r.id, authorRole: "team", authorName: "x", body: "legado-limpo-do-beta" },
    });
    await prisma.portalAccess.create({ data: { token: "tk-leg-ok", clientId: beta, clientRequestId: r.id } });

    const lidas = await corpos(await lerConversa(get("/api/portal/messages?token=tk-leg-ok")));
    expect(lidas).toContain("legado-limpo-do-beta");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 ADENDO 2 — O CENSO TRANQUILIZAVA. Os dois cenários que o `qualidade` mediu.
// ═══════════════════════════════════════════════════════════════════════════
describe("censo de histórico ambíguo", () => {
  it("⛔ enxerga a solicitação re-apontada com histórico 100% LEGADO (achava 0)", async () => {
    const r = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: alfa, businessName: "ALFA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalAccess.create({ data: { token: "tk-censo-a", clientId: alfa, clientRequestId: r.id } });
    for (const b of ["ambigua-1", "ambigua-2"]) {
      await prisma.portalMessage.create({
        data: { clientRequestId: r.id, authorRole: "team", authorName: "x", body: b },
      });
    }
    await prisma.clientRequestDb.update({ where: { id: r.id }, data: { clientId: beta } });

    const censo = await censoDeHistoricoAmbiguo();

    expect(censo.solicitacoesAfetadas).toContain(r.id);
    expect(censo.mensagensOcultadasPelaCerca).toBeGreaterThanOrEqual(2);
  });

  it("⛔ publica `semDonoEscrito` — o universo de RISCO, não o custo da cerca", async () => {
    // `beforeEach` limpa as mensagens; o universo de risco precisa existir
    // para ser medido.
    const r = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: alfa, businessName: "ALFA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalMessage.create({
      data: { clientRequestId: r.id, authorRole: "team", authorName: "x", body: "sem-dono-escrito" },
    });
    const censo = await censoDeHistoricoAmbiguo();
    // O número principal existe e conta TODA linha sem dono, tenha ou não
    // evidência de troca. Era ele que faltava no relatório: sem ele, um
    // `mensagensOcultadasPelaCerca: 0` é lido como "não há contaminação".
    expect(censo.semDonoEscrito).toBeGreaterThan(0);
    expect(censo.semDonoEscrito).toBeGreaterThanOrEqual(censo.mensagensOcultadasPelaCerca);
  });

  it("⛔ conta a solicitação de PROSPECT — o ponto cego do `atual &&`", async () => {
    await prisma.clientRequestDb.create({
      data: { workspaceId: ws, businessName: "prospect", services: "[]", objectives: "[]", rawContext: "x" },
    });
    const censo = await censoDeHistoricoAmbiguo();
    expect(censo.solicitacoesSemDono).toBeGreaterThan(0);
  });
});
