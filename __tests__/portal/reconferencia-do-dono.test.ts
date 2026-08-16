// ── O MESMO SEGREDO, TODAS AS PORTAS ────────────────────────────────────────
//
// Proposta do `seguranca`, aprovada pelo Diretor. O diagnóstico que a produziu:
// **o que faltava nos meus testes não era carimbo, era PORTA.** Eles batiam só
// em `/api/portal/messages` — e foi por isso que, rodada após rodada, um
// conserto "completo" deixava portas para trás:
//
//   rodada 2 — 5 rotas convertidas, 4 esquecidas;
//   rodada 3 — `escopoDoToken` criado, `media/[id]` regredido;
//   rodada 4 — `messages` fechada, `portal-data` e `social-posts` servindo.
//
// Este arquivo não conhece interno nenhum: ele planta UM segredo do cliente
// BETA e bate em TODAS as portas com o token do ALFA, pela rota. Se qualquer
// porta nova aparecer e não for coberta, o teste de arquitetura
// (`resolvedor-unico-do-portal`) é quem acusa.
//
// As duas metades, sempre: o ALFA não alcança NADA do BETA, e o BETA continua
// alcançando o que é dele.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/reconferencia-do-dono.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});
const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { prisma } from "@/lib/db/client";

const SEGREDO = "SEGREDO-DO-BETA contrato de R$ 48.000";

let ws = "";
let alfa = "";
let beta = "";
let reqCompartilhada = "";

/** Toda porta do portal que responde a `?token=`. */
async function portas() {
  const [messages, vista, portalData, esteira, socialPosts, marca, projetos, pedidos, materiais, metricas] =
    await Promise.all([
      import("@/app/api/portal/messages/route"),
      import("@/app/api/portal/vista/route"),
      import("@/app/api/brain/portal-data/route"),
      import("@/app/api/portal/esteira/route"),
      import("@/app/api/social-posts/route"),
      import("@/app/api/portal/marca/route"),
      import("@/app/api/portal/projetos/route"),
      import("@/app/api/portal/pedidos/route"),
      import("@/app/api/portal/materiais/route"),
      import("@/app/api/portal/metricas/route"),
    ]);
  return [
    ["messages", messages.GET, "/api/portal/messages"],
    ["vista", vista.GET, "/api/portal/vista"],
    ["portal-data", portalData.GET, "/api/brain/portal-data"],
    ["esteira", esteira.GET, "/api/portal/esteira"],
    ["social-posts", socialPosts.GET, "/api/social-posts"],
    ["marca", marca.GET, "/api/portal/marca"],
    ["projetos", projetos.GET, "/api/portal/projetos"],
    ["pedidos", pedidos.GET, "/api/portal/pedidos"],
    ["materiais", materiais.GET, "/api/portal/materiais"],
    ["metricas", metricas.GET, "/api/portal/metricas"],
  ] as [string, (r: NextRequest) => Promise<Response>, string][];
}

function get(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`);
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `rec-${Date.now()}` } })).id;
  alfa = (await prisma.client.create({ data: { workspaceId: ws, name: "Agência ALFA" } })).id;
  beta = (await prisma.client.create({ data: { workspaceId: ws, name: "Loja BETA" } })).id;
  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: ws, role: "master" }, error: null });
});

beforeEach(async () => {
  await prisma.portalMessage.deleteMany({});
  await prisma.approvalRequest.deleteMany({});
  await prisma.socialPost.deleteMany({});
  await prisma.portalAccess.deleteMany({});
  await prisma.clientRequestDb.deleteMany({});

  // A solicitação R nasceu do ALFA e HOJE pertence ao BETA — o ponteiro andou,
  // que é o incidente. Nenhum carimbo é semeado no acervo.
  reqCompartilhada = (await prisma.clientRequestDb.create({
    data: {
      workspaceId: ws, clientId: beta, businessName: "Loja BETA", segment: "loja",
      services: "[]", objectives: "[]", status: "in_progress", rawContext: "x",
    },
  })).id;

  // O segredo do BETA, nas formas que cada porta lê.
  await prisma.portalMessage.create({
    data: { clientRequestId: reqCompartilhada, clientId: beta, authorRole: "team", authorName: "Equipe", body: SEGREDO },
  });
  await prisma.approvalRequest.create({
    data: {
      clientRequestId: reqCompartilhada, clientId: beta, department: "social-media",
      status: "pending", clientVisible: true, requestedBy: "agencia", reviewNote: SEGREDO,
      sourcePostIdsJson: "[]",
    },
  });
  await prisma.socialPost.create({
    data: {
      workspaceId: ws, clientId: beta, clientRequestId: reqCompartilhada, caption: SEGREDO,
      status: "approved", visibility: "compartilhado", format: "feed", networks: "[]",
    },
  });
});

describe("o token do ALFA não alcança NADA do BETA — porta por porta", () => {
  it("⛔ token LEGADO do ALFA (sem dono escrito) presa à solicitação re-apontada", async () => {
    // a forma do token LEGADO: só `clientRequestId`. Quantos existem em
    // produção é LACUNA DECLARADA — não é zero e não é 100%: `clientId` é
    // anulável no schema, todos os emissores de hoje preenchem, e ninguém
    // tem leitura de produção para contar.
    await prisma.portalAccess.create({
      data: { token: "tk-legado", clientRequestId: reqCompartilhada },
    });

    for (const [nome, rota, caminho] of await portas()) {
      const res = await rota(get(`${caminho}?token=tk-legado`));
      const bruto = await res.text().catch(() => "");
      expect(bruto, `${nome} VAZOU o segredo`).not.toContain("48.000");
      expect(bruto, `${nome} vazou o nome do BETA`).not.toContain("Loja BETA");
    }
  });

  it("⛔ token do ALFA com dono escrito, e a solicitação agora é do BETA", async () => {
    await prisma.portalAccess.create({
      data: { token: "tk-alfa", clientId: alfa, clientRequestId: reqCompartilhada },
    });

    for (const [nome, rota, caminho] of await portas()) {
      const res = await rota(get(`${caminho}?token=tk-alfa`));
      const bruto = await res.text().catch(() => "");
      expect(bruto, `${nome} VAZOU o segredo`).not.toContain("48.000");
      expect(bruto, `${nome} vazou o nome do BETA`).not.toContain("Loja BETA");
    }
  });

  it("⛔ e o ENVIO pelo link do ALFA não fabrica prova em nome do BETA", async () => {
    // Este é o pior caminho: o POST gravava a mensagem carimbada `clientId:
    // beta`, e a leitura seguinte a servia como "provada própria". O desenho
    // elege o carimbo como única prova — e este caminho fabricava a prova.
    await prisma.portalAccess.create({
      data: { token: "tk-legado", clientRequestId: reqCompartilhada },
    });
    const { POST } = await import("@/app/api/portal/messages/route");
    const antes = await prisma.portalMessage.count();

    const res = await POST(new NextRequest("http://localhost/api/portal/messages", {
      method: "POST",
      body: JSON.stringify({ token: "tk-legado", body: "isto não pode ser gravado" }),
    }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.portalMessage.count()).toBe(antes);
  });
});

describe("a outra metade — o BETA continua alcançando o que é dele", () => {
  it("✅ com o token DELE, o segredo dele aparece", async () => {
    await prisma.portalAccess.create({
      data: { token: "tk-beta", clientId: beta, clientRequestId: reqCompartilhada },
    });

    const achou: string[] = [];
    for (const [nome, rota, caminho] of await portas()) {
      const res = await rota(get(`${caminho}?token=tk-beta`));
      const bruto = await res.text().catch(() => "");
      // Nenhuma porta pode recusar o dono legítimo.
      expect(res.status, `${nome} recusou o DONO`).toBeLessThan(400);
      if (bruto.includes("48.000")) achou.push(nome);
    }
    // E o segredo dele tem de sair em pelo menos uma porta — senão este teste
    // estaria verde por não haver dado nenhum, que é o pior falso positivo.
    expect(achou.length, "nenhuma porta serviu o dono legítimo").toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS GUARDAS QUE SOBREVIVIAM À MUTAÇÃO — M9 e M1
//
// O `seguranca` mediu: mutar cada uma delas deixava a suíte INTEIRA verde
// (M9: 131 arquivos / 1.892 testes; M1: 57 arquivos / 718). O Diretor foi
// direto: *"copiar a guarda sem teste só multiplica uma guarda não provada —
// meia trava é pior, parece inteira."* Estes são os gates que faltavam.
// ═══════════════════════════════════════════════════════════════════════════
describe("M9 — o ramo do prospect EXIGE solicitação sem dono", () => {
  it("⛔ solicitação COM dono não vira prospect (a mutação `if (!solicitacao)` morre aqui)", async () => {
    // `reqCompartilhada` pertence ao BETA. Um token preso a ela, sem dono
    // escrito, NÃO pode virar "prospect daquela solicitação" — se virasse,
    // leria a conversa do BETA pelo ramo prospect, que é a volta do furo.
    await prisma.portalAccess.create({ data: { token: "tk-m9", clientRequestId: reqCompartilhada } });

    const { escopoDoToken } = await import("@/lib/agency/persistence/portal-access-service");
    const escopo = await escopoDoToken("tk-m9");

    expect(escopo.ok).toBe(false);
    if (!escopo.ok) expect(escopo.motivo).toBe("sem_dono");
  });

  it("✅ e a solicitação SEM dono continua virando prospect — a porta comercial não fecha", async () => {
    const prospect = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, businessName: "Quem chegou agora", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalAccess.create({ data: { token: "tk-m9b", clientRequestId: prospect.id } });

    const { escopoDoToken } = await import("@/lib/agency/persistence/portal-access-service");
    const escopo = await escopoDoToken("tk-m9b");

    expect(escopo.ok).toBe(true);
    if (escopo.ok) expect(escopo.tipo).toBe("prospect");
  });

  it("⛔ e a MESMA regra vale na conversa — um caminho, não dois", async () => {
    // Era aqui que as duas portas discordavam: `escopoDoToken` recusava e
    // `conversaDoToken` concedia, para o MESMO token.
    await prisma.portalAccess.create({ data: { token: "tk-m9c", clientRequestId: reqCompartilhada } });

    const { conversaDoToken } = await import("@/app/api/messages/conversa");
    const { escopoDoToken } = await import("@/lib/agency/persistence/portal-access-service");

    const r = await conversaDoToken("tk-m9c");
    const e = await escopoDoToken("tk-m9c");
    // O mesmo veredito das duas portas. Se divergirem, o teste cai.
    expect(r.ok).toBe(e.ok);
    expect(r.ok).toBe(false);
  });
});

describe("M1 — `donoConfere` fecha por padrão", () => {
  it("⛔ sem selo declarado e com exigência, RECUSA (a mutação `=> false` morre aqui)", async () => {
    const { donoConfere, donoDaTela } = await import("@/lib/agency/portal/dono-da-tela");
    // Ausência de selo + exigência = recusa. Se alguém trocar o corpo por
    // `return false` a primeira asserção continua verde — por isso a segunda
    // e a terceira existem: a função tem de DISTINGUIR os casos.
    expect(donoConfere(beta, undefined, true)).toBe(false);
    expect(donoConfere(beta, donoDaTela(beta), true)).toBe(true);
    expect(donoConfere(beta, donoDaTela(alfa), true)).toBe(false);
  });

  it("⛔ o DEFAULT fecha — chamador que esquecer a flag ganha a versão estrita", async () => {
    const { donoConfere } = await import("@/lib/agency/portal/dono-da-tela");
    expect(donoConfere(beta, undefined)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A QUEBRA PERMANENTE QUE EU NÃO TINHA DECLARADO — prospect que vira cliente
//
// O ramo do prospect grava `clientId: null` por construção. Com a inversão,
// todo prospect que virasse cliente DEPOIS do deploy perderia a conversa
// inteira do briefing — para sempre. Base **lê**, PR **não lia**. E o briefing
// é a porta comercial desta casa.
// ═══════════════════════════════════════════════════════════════════════════
describe("prospect que vira cliente leva o histórico junto", () => {
  it("⛔ a conversa do briefing NÃO some quando a solicitação ganha dono", async () => {
    const { carimbarHistoricoDoProspect } = await import("@/lib/agency/portal/carimbar-historico-do-prospect");

    const prospect = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, businessName: "Vai virar cliente", services: "[]", objectives: "[]", rawContext: "x" },
    });
    // Como o prospect escreve: sem dono, porque dono ainda não existe.
    await prisma.portalMessage.create({
      data: { clientRequestId: prospect.id, authorRole: "client", authorName: "prospect", body: "quero um site" },
    });

    // A conversão: a casa DECIDE o dono — não se está inferindo nada.
    const novo = await prisma.client.create({ data: { workspaceId: ws, name: "Vai virar cliente" } });
    await prisma.clientRequestDb.update({ where: { id: prospect.id }, data: { clientId: novo.id } });
    await carimbarHistoricoDoProspect(prospect.id, novo.id);

    await prisma.portalAccess.create({ data: { token: "tk-convertido", clientId: novo.id } });
    const { GET } = await import("@/app/api/portal/messages/route");
    const res = await GET(get("/api/portal/messages?token=tk-convertido"));

    expect(await res.text()).toContain("quero um site");
  });

  it("⛔ e o carimbo NUNCA sobrescreve linha que já tem dono", async () => {
    // Se sobrescrevesse, isto viraria o re-apontador que a frente inteira
    // existiu para fechar.
    const { carimbarHistoricoDoProspect } = await import("@/lib/agency/portal/carimbar-historico-do-prospect");
    const msg = await prisma.portalMessage.create({
      data: { clientRequestId: reqCompartilhada, clientId: beta, authorRole: "team", authorName: "x", body: "do beta" },
    });

    await carimbarHistoricoDoProspect(reqCompartilhada, alfa);

    expect((await prisma.portalMessage.findUnique({ where: { id: msg.id } }))?.clientId).toBe(beta);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 O BOTÃO "APROVAR" — AS DUAS METADES NA MESMA LINHA
//
// Eu exigi carimbo e só carimbo na rodada 5. Mas `ApprovalRequest.clientId`
// NASCE NULO no fluxo Brain: o carimbo vale para card criado DEPOIS do deploy,
// e **todo card pendente que já existe tem `clientId` nulo**. Medido em
// navegador: o dono legítimo via "1 DECISÃO PENDENTE — Pacote mensal
// R$ 12.000", clicava em Aprovar e recebia `Approval not accessible with this
// token`, em inglês. Aprovar dispara `createProjectFromRequest` →
// `runProjectExecution`: **era a esteira comercial parada, com o botão à
// vista.**
//
// É a mesma linha que decide os dois lados do trade-off, e ela não tinha gate
// em lado nenhum. Agora tem os dois.
// ═══════════════════════════════════════════════════════════════════════════
describe("aprovar a própria proposta — e só a própria", () => {
  async function cardOrfaoEm(clientRequestId: string) {
    return prisma.approvalRequest.create({
      data: {
        clientRequestId, clientId: null, department: "proposal",
        status: "pending", clientVisible: true, requestedBy: "agencia",
        reviewNote: "Pacote mensal R$ 12.000", sourcePostIdsJson: "[]",
      },
    });
  }
  async function decidir(token: string, approvalRequestId: string) {
    const { POST } = await import("@/app/api/portal/approvals/route");
    return POST(new NextRequest("http://localhost/api/portal/approvals", {
      method: "POST",
      body: JSON.stringify({ token, approvalRequestId, action: "approve" }),
    }));
  }

  // ⚠️ RODADA 9 — A METADE 1 MUDOU DE LUGAR, e é o fim do vaivém.
  //
  // Ela era uma EXCEÇÃO no caminho quente ("órfão de solicitação sem
  // evidência de ter sido de outro, então passa"). Era ela que abria o
  // bloqueante A: a evidência é cega na população de produção, porque
  // `PortalAccess` legado tem `clientId` nulo e o filtro de carimbo alheio não
  // o enxerga. O token legítimo de B aprovava o card órfão de A.
  //
  // Agora o card órfão é destravado pelo BACKFILL — offline, com curadoria —
  // e a leitura volta a exigir carimbo, ponto. Não sabido fecha.
  it("✅ METADE 1: depois do BACKFILL, o dono legítimo aprova o próprio card", async () => {
    // Solicitação que sempre foi do BETA, com o card no formato de todo card
    // pendente anterior ao deploy: `clientId` NULO.
    const propria = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    const card = await cardOrfaoEm(propria.id);
    await prisma.portalAccess.create({ data: { token: "tk-ok", clientId: beta, clientRequestId: propria.id } });

    // Sem o backfill, o card órfão não abre para ninguém — inclusive o dono.
    const antes = await decidir("tk-ok", card.id);
    expect(antes.status, "card órfão não pode abrir ANTES do backfill").toBe(403);

    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    await backfillDeCarimbo(true);

    const res = await decidir("tk-ok", card.id);

    // Se este teste cair, a esteira comercial parou no dia 1.
    expect(res.status, await res.text()).toBeLessThan(400);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card.id } }))?.status).not.toBe("pending");
  });

  it("⛔ METADE 2: o dono NOVO não aprova o card órfão de solicitação que já foi de outro — nem depois do backfill", async () => {
    // `reqCompartilhada` é do BETA hoje e foi do ALFA — e o ALFA deixou
    // pegada (o `PortalAccess` do teste anterior a este bloco não conta; aqui
    // a evidência é criada explicitamente).
    await prisma.portalAccess.create({
      data: { token: "tk-pegada-alfa", clientId: alfa, clientRequestId: reqCompartilhada },
    });
    const card = await cardOrfaoEm(reqCompartilhada);
    await prisma.portalAccess.create({ data: { token: "tk-beta-2", clientId: beta } });

    // O backfill DEIXA ESTA DE FORA — a solicitação tem carimbo alheio.
    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    const rel = await backfillDeCarimbo(true);
    expect(rel.linhas.find((l) => l.clientRequestId === reqCompartilhada)?.deixadaDeFora).toBeTruthy();

    const res = await decidir("tk-beta-2", card.id);

    expect(res.status).toBe(403);
    // E aprovação PUBLICA: o banco não pode ter andado.
    expect((await prisma.approvalRequest.findUnique({ where: { id: card.id } }))?.status).toBe("pending");
  });

  it("⛔ METADE 3: card CARIMBADO para outro não abre, nem com solicitação em comum", async () => {
    const card = await prisma.approvalRequest.create({
      data: {
        clientRequestId: reqCompartilhada, clientId: alfa, department: "proposal",
        status: "pending", clientVisible: true, requestedBy: "agencia",
        reviewNote: "Pacote do ALFA", sourcePostIdsJson: "[]",
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-beta-3", clientId: beta, clientRequestId: reqCompartilhada } });

    const res = await decidir("tk-beta-3", card.id);

    expect(res.status).toBe(403);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card.id } }))?.status).toBe("pending");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 BLOQUEANTE 3 — O FILHO LEGADO, NAS PORTAS QUE ELE VAZAVA
//
// O enquadramento do Diretor: *"a identidade foi consertada e a chave dos
// filhos não."* Cinco rodadas atacando QUEM É O DONO, enquanto `portal-data` e
// `social-posts` continuavam perguntando DE QUAL SOLICITAÇÃO é a linha.
//
// ⚠️ O fixture do topo deste arquivo semeia o acervo do BETA todo CARIMBADO —
// o caso fácil. O que vaza é o filho **SEM** carimbo, e é ele que este bloco
// planta. Foi por isso que as dez portas passavam verdes com o furo aberto.
// ═══════════════════════════════════════════════════════════════════════════
describe("filho SEM carimbo de solicitação re-apontada", () => {
  const SEGREDO_FILHO = "FILHO-LEGADO orçamento de R$ 91.000";

  beforeEach(async () => {
    // Sem `clientId`: o formato de todo filho anterior ao carimbo.
    await prisma.approvalRequest.create({
      data: {
        clientRequestId: reqCompartilhada, clientId: null, department: "proposal",
        status: "pending", clientVisible: true, requestedBy: "agencia",
        reviewNote: SEGREDO_FILHO, sourcePostIdsJson: "[]",
      },
    });
    await prisma.brainArtifact.create({
      data: {
        clientRequestId: reqCompartilhada, clientId: null, department: "strategy",
        canvasId: "c1", canvasJson: JSON.stringify({ summary: SEGREDO_FILHO }),
        version: 1, status: "approved", approvedAt: new Date(),
      },
    });
    await prisma.socialPost.create({
      data: {
        workspaceId: ws, clientId: null, clientRequestId: reqCompartilhada,
        caption: SEGREDO_FILHO, status: "approved", visibility: "compartilhado",
        format: "feed", networks: "[]",
      },
    });
    // O ALFA deixou pegada na solicitação: é a evidência de que ela mudou de mãos.
    await prisma.portalAccess.create({
      data: { token: "tk-pegada", clientId: alfa, clientRequestId: reqCompartilhada },
    });
  });

  it("⛔ `portal-data` não serve card nem canvas sem carimbo ao dono novo", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-novo", clientId: beta, clientRequestId: reqCompartilhada } });
    const { GET } = await import("@/app/api/brain/portal-data/route");

    const bruto = await (await GET(get("/api/brain/portal-data?token=tk-novo"))).text();

    expect(bruto, "card(reviewNote) vazou").not.toContain("91.000");
  });

  it("⛔ `social-posts` não serve peça sem carimbo ao dono novo", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-novo2", clientId: beta, clientRequestId: reqCompartilhada } });
    const { GET } = await import("@/app/api/social-posts/route");

    const bruto = await (await GET(get("/api/social-posts?token=tk-novo2"))).text();

    expect(bruto, "peca(caption) vazou").not.toContain("91.000");
  });

  it("✅ e o filho CARIMBADO do dono continua saindo — a metade que importa", async () => {
    await prisma.socialPost.create({
      data: {
        workspaceId: ws, clientId: beta, clientRequestId: reqCompartilhada,
        caption: "PECA-DO-BETA legítima", status: "approved", visibility: "compartilhado",
        format: "feed", networks: "[]",
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-novo3", clientId: beta, clientRequestId: reqCompartilhada } });
    const { GET } = await import("@/app/api/social-posts/route");

    const bruto = await (await GET(get("/api/social-posts?token=tk-novo3"))).text();

    expect(bruto).toContain("PECA-DO-BETA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AS GUARDAS QUE NASCERAM SEM TESTE — a regra nova da casa:
// **guarda nova nasce com o teste, ou nasce enfeite.**
// A/B prova que está certo HOJE; mutação prova que continua certo AMANHÃ.
// ═══════════════════════════════════════════════════════════════════════════
describe("M13 — a aprovação nasce CARIMBADA", () => {
  it("⛔ criar card pelo fluxo Brain grava o dono derivado da solicitação", async () => {
    const { createApprovalRequest } = await import("@/lib/agency/persistence/approval-service");
    const card = await createApprovalRequest({
      clientRequestId: reqCompartilhada, department: "proposal",
      requestedBy: "agencia", clientVisible: true,
    });
    // Sem isto, todo card novo nasce órfão e a posse volta a depender do
    // ponteiro lido na decisão — que é o furo do `approvals`.
    expect((await prisma.approvalRequest.findUnique({ where: { id: card.id } }))?.clientId).toBe(beta);
  });
});

describe("M16 — trocar o dono de uma solicitação é PROIBIDO", () => {
  it("⛔ `updateClientRequest` recusa mover A→B", async () => {
    const { updateClientRequest } = await import("@/lib/agency/persistence/client-request-service");
    await expect(updateClientRequest(reqCompartilhada, { clientId: alfa }))
      .rejects.toThrow(/já tem cliente/i);
    expect((await prisma.clientRequestDb.findUnique({ where: { id: reqCompartilhada } }))?.clientId).toBe(beta);
  });

  it("✅ mas carimbar dono NULO continua permitido — é o primeiro vínculo", async () => {
    const { updateClientRequest } = await import("@/lib/agency/persistence/client-request-service");
    const orfa = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, businessName: "sem dono", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await updateClientRequest(orfa.id, { clientId: alfa });
    expect((await prisma.clientRequestDb.findUnique({ where: { id: orfa.id } }))?.clientId).toBe(alfa);
  });
});

describe("M2 — apuração que falha FECHA", () => {
  it("⛔ sem conseguir apurar, nenhuma solicitação é considerada limpa", async () => {
    const { solicitacoesQueMudaramDeDono } = await import("@/lib/agency/portal/solicitacao-que-mudou-de-dono");
    const espiao = vi.spyOn(prisma.portalMessage, "findMany").mockRejectedValueOnce(new Error("banco caiu"));

    const sujas = await solicitacoesQueMudaramDeDono(beta, [reqCompartilhada]);

    // TODAS suspeitas: "não sei quais mudaram de dono" e "nenhuma mudou" são
    // fatos opostos, e o segundo é o que vaza.
    expect(sujas.has(reqCompartilhada)).toBe(true);
    espiao.mockRestore();
  });
});

describe("M18 — o prospect só decide card SEM dono", () => {
  it("⛔ token de prospect não decide card CARIMBADO preso à mesma solicitação", async () => {
    // A mutação que passava: o ramo do prospect deixar de exigir que o card
    // esteja sem dono. Aí um card já carimbado para um cliente de verdade
    // ficaria decidível por quem entrou pela porta do briefing.
    const prospect = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, businessName: "prospect", services: "[]", objectives: "[]", rawContext: "x" },
    });
    const card = await prisma.approvalRequest.create({
      data: {
        clientRequestId: prospect.id, clientId: beta, department: "proposal",
        status: "pending", clientVisible: true, requestedBy: "agencia",
        reviewNote: "Card do BETA", sourcePostIdsJson: "[]",
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-m18", clientRequestId: prospect.id } });

    const { POST } = await import("@/app/api/portal/approvals/route");
    const res = await POST(new NextRequest("http://localhost/api/portal/approvals", {
      method: "POST",
      body: JSON.stringify({ token: "tk-m18", approvalRequestId: card.id, action: "approve" }),
    }));

    expect(res.status).toBe(403);
    expect((await prisma.approvalRequest.findUnique({ where: { id: card.id } }))?.status).toBe("pending");
  });

  // ⚠️ RODADA 9 — INVERTIDO. Este teste travava o re-carimbo no caminho
  // quente, e o re-carimbo FABRICAVA PROVA FALSA: card órfão de A, solicitação
  // re-apontada, e o reuso gravava `clientId = B` com autoridade — o rastro
  // forense sumia. Carimbo retroativo só no backfill, sob curadoria.
  it("⛔ o reuso NÃO carimba — carimbo retroativo no caminho quente é prova falsa", async () => {
    const { createApprovalRequest } = await import("@/lib/agency/persistence/approval-service");
    // Card antigo, genérico e SEM dono: o formato do acervo pré-carimbo.
    const antigo = await prisma.approvalRequest.create({
      data: {
        clientRequestId: reqCompartilhada, clientId: null, department: "analytics",
        status: "pending", clientVisible: true, requestedBy: "agencia", sourcePostIdsJson: "[]",
      },
    });

    // O reuso devolve o card existente — e o `create` nem roda, que era por
    // onde o carimbo escapava.
    const devolvido = await createApprovalRequest({
      clientRequestId: reqCompartilhada, department: "analytics",
      requestedBy: "agencia", clientVisible: true,
    });

    expect(devolvido.id).toBe(antigo.id);
    // Continua órfão: quem o destrava é o backfill, com curadoria — e nesta
    // solicitação (que tem carimbo alheio) ele nem vai destravar.
    expect((await prisma.approvalRequest.findUnique({ where: { id: antigo.id } }))?.clientId).toBeNull();
  });
});

// ── AS PORTAS QUE FALTAVAM ─────────────────────────────────────────────────
// O bloco do topo cobre dez. `seguranca` listou as que ficaram de fora — e
// entre elas está a ESCRITA (`approvals` POST) por token nu, que é a pior.
describe("as outras portas com token nu (sem dono escrito)", () => {
  async function chamar(mod: string, verbo: "GET" | "POST", caminho: string, corpo?: unknown) {
    const m = (await import(/* @vite-ignore */ mod)) as Record<string, unknown>;
    const fn = m[verbo] as ((r: NextRequest, ctx?: unknown) => Promise<Response>) | undefined;
    if (!fn) return null;
    const req = corpo
      ? new NextRequest(`http://localhost${caminho}`, { method: "POST", body: JSON.stringify(corpo) })
      : new NextRequest(`http://localhost${caminho}`);
    return fn(req, { params: Promise.resolve({ id: "qualquer" }) });
  }

  // ⚠️ AS TRÊS QUE ERAM CONTROLE POSITIVO (rodada 8). Com `approvalRequestId:
  // "x"` e `pedidoId: "x"`, um token TOTALMENTE LEGÍTIMO também levava 404/400
  // — a rota morria na busca ou na validação ANTES de olhar posse. Apagar a
  // trava de token inteira deixava o teste verde. Agora os ids EXISTEM e a
  // asserção é de MOTIVO, não de status.
  it("⛔ nenhuma delas abre com token nu — e nenhuma vaza o nome do BETA", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-nu", clientRequestId: reqCompartilhada } });
    // Ids REAIS: sem isto, o 403 podia estar vindo de "não achei", não de posse.
    const pedidoReal = await prisma.contentRequest.create({
      data: {
        clientId: beta, title: "Pedido da Loja BETA",
        description: "descrição", objective: "objetivo", quoteStatus: "pendente",
      },
    });
    const cardReal = await prisma.approvalRequest.create({
      data: {
        clientRequestId: reqCompartilhada, clientId: beta, department: "proposal",
        status: "pending", clientVisible: true, requestedBy: "agencia",
        reviewNote: "Loja BETA — pacote", sourcePostIdsJson: "[]",
      },
    });

    const portas: [string, "GET" | "POST", string, unknown?][] = [
      ["@/app/api/portal/conexoes/route", "GET", "/api/portal/conexoes?token=tk-nu"],
      ["@/app/api/portal/meta-ativos/route", "GET", "/api/portal/meta-ativos?token=tk-nu"],
      ["@/app/api/portal/drive/route", "GET", "/api/portal/drive?token=tk-nu"],
      ["@/app/api/portal/drive/conectar/route", "GET", "/api/portal/drive/conectar?token=tk-nu"],
      ["@/app/api/portal/drive/token-do-seletor/route", "GET", "/api/portal/drive/token-do-seletor?token=tk-nu"],
      ["@/app/api/media/[id]/route", "GET", "/api/media/qualquer?token=tk-nu"],
      ["@/app/api/social-posts/[id]/download/route", "GET", "/api/social-posts/x/download?token=tk-nu"],
      ["@/app/api/portal/transcricao/route", "GET", "/api/portal/transcricao?token=tk-nu"],
      // A ESCRITA — a pior delas.
      ["@/app/api/portal/approvals/route", "POST", "/api/portal/approvals",
        { token: "tk-nu", approvalRequestId: cardReal.id, action: "approve" }],
      ["@/app/api/portal/pedidos/orcamento/route", "POST", "/api/portal/pedidos/orcamento",
        { token: "tk-nu", pedidoId: pedidoReal.id, decisao: "aprovar", apontamento: "ok" }],
      ["@/app/api/portal/session/route", "POST", "/api/portal/session", { token: "tk-nu" }],
    ];

    for (const [mod, verbo, caminho, corpo] of portas) {
      const res = await chamar(mod, verbo, caminho, corpo);
      // ⚠️ SEM `continue` SILENCIOSO: porta que deixe de exportar o verbo some
      // da varredura sem ninguém notar — é literalmente o defeito que esta
      // operação repetiu cinco vezes.
      expect(res, `${mod} não exporta ${verbo} — a varredura perderia esta porta`).not.toBeNull();
      if (!res) continue;
      expect(res.status, `${mod} ABRIU com token nu`).toBeGreaterThanOrEqual(400);
      const bruto = await res.text().catch(() => "");
      expect(bruto, `${mod} vazou o nome do BETA`).not.toContain("Loja BETA");
    }

    // E a prova de que o 403 veio da POSSE, não de "não achei": o card e o
    // pedido continuam intactos.
    expect((await prisma.approvalRequest.findUnique({ where: { id: cardReal.id } }))?.status).toBe("pending");
  });

  it("⛔ e `session` não grava cookie de 180 dias com token nu", async () => {
    await prisma.portalAccess.create({ data: { token: "tk-nu2", clientRequestId: reqCompartilhada } });
    const { POST } = await import("@/app/api/portal/session/route");
    const res = await POST(new NextRequest("http://localhost/api/portal/session", {
      method: "POST", body: JSON.stringify({ token: "tk-nu2" }),
    }));
    expect(res.status).toBe(403);
    expect(res.cookies.get("dioli_portal")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 A LISTA E A POSSE TÊM DE RESPONDER A MESMA COISA
//
// A rodada 7 passou porque o teste chamava o POST direto. Medido depois:
//
//   POST /api/portal/approvals · token do ALFA · card órfão DELE → 200 approved
//   GET  /api/brain/portal-data?token=tok-alfa                   → "approvals":[]
//
// **O POST aceitava o que o GET nunca mostrava.** Na tela: "0 DECISÕES
// PENDENTES · Nada esperando sua decisão", com R$ 12.000 pendentes no banco.
// Erro vermelho gera chamado; "nada depende de você" não gera nada.
// ═══════════════════════════════════════════════════════════════════════════
describe("o card órfão do dono APARECE na lista, não só aceita o clique", () => {
  it("⛔ `portal-data` LISTA o card órfão da solicitação do próprio dono", async () => {
    const propria = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    const card = await prisma.approvalRequest.create({
      data: {
        clientRequestId: propria.id, clientId: null, department: "proposal",
        status: "pending", clientVisible: true, requestedBy: "agencia",
        reviewNote: "Pacote mensal R$ 12.000", sourcePostIdsJson: "[]",
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-lista", clientId: beta, clientRequestId: propria.id } });
    // O backfill é o que devolve o card órfão ao dono — offline, com curadoria.
    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    await backfillDeCarimbo(true);

    const { GET } = await import("@/app/api/brain/portal-data/route");
    const json = await (await GET(get("/api/brain/portal-data?token=tk-lista"))).json();

    // Se isto cair, a tela diz "nada depende de você" com dinheiro na mesa.
    expect(json.approvals.map((a: { id: string }) => a.id)).toContain(card.id);
  });

  it("⛔ e o ARTEFATO órfão também — `pipeline` e `departments` não podem vir vazios", async () => {
    const propria = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    // `clientId: null` é o que o escritor REAL da casa gravava — sempre.
    await prisma.brainArtifact.create({
      data: {
        clientRequestId: propria.id, clientId: null, department: "strategy",
        canvasId: "c1", canvasJson: JSON.stringify({ summary: "Direção aprovada do BETA" }),
        version: 1, status: "approved", approvedAt: new Date(),
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-art", clientId: beta, clientRequestId: propria.id } });
    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    await backfillDeCarimbo(true);

    const { GET } = await import("@/app/api/brain/portal-data/route");
    const json = await (await GET(get("/api/brain/portal-data?token=tk-art"))).json();

    expect(json.pipeline.length, "pipeline vazio = portal apagado").toBeGreaterThan(0);
    expect(Object.keys(json.departments).length, "departments vazio").toBeGreaterThan(0);
  });

  it("⛔ o escritor REAL de artefato passa a carimbar o dono", async () => {
    // Sem isto, a cerca do filho apagava a tela PARA SEMPRE — não era dívida
    // de acervo que a reemissão de links resolve.
    const { createBrainArtifact } = await import("@/lib/agency/persistence/brain-artifact-service");
    const propria = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    const art = await createBrainArtifact({
      clientRequestId: propria.id, department: "strategy", canvasId: "c1",
      canvas: { summary: "x" }, approvedBy: "teste",
    });
    expect((await prisma.brainArtifact.findUnique({ where: { id: art.id } }))?.clientId).toBe(beta);
  });

  it("⛔ mas o card órfão de solicitação RE-APONTADA continua fora da lista", async () => {
    // A outra metade, na MESMA porta: a lista não pode virar porta dos fundos.
    await prisma.portalAccess.create({
      data: { token: "tk-pegada-a", clientId: alfa, clientRequestId: reqCompartilhada },
    });
    const card = await prisma.approvalRequest.create({
      data: {
        clientRequestId: reqCompartilhada, clientId: null, department: "proposal",
        status: "pending", clientVisible: true, requestedBy: "agencia",
        reviewNote: "SEGREDO orçamento de R$ 91.000", sourcePostIdsJson: "[]",
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-lista-b", clientId: beta, clientRequestId: reqCompartilhada } });

    const { GET } = await import("@/app/api/brain/portal-data/route");
    const bruto = await (await GET(get("/api/brain/portal-data?token=tk-lista-b"))).text();

    expect(bruto).not.toContain("91.000");
    expect(bruto).not.toContain(card.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 A REEMISSÃO EM LOTE — sem ela a opção A não existe
//
// Eu escrevi ao Diretor que reemitir os links "é um comando só", ele levou ao
// CEO, e era FALSO: sem lista, `levantarLinksDoPortal` processava três nomes
// fixos, e nome que casa com mais de um cliente era recusado.
// ═══════════════════════════════════════════════════════════════════════════
describe("reemissão da carteira inteira", () => {
  it("⛔ alcança TODOS os clientes por id — sem nome, sem ambiguidade", async () => {
    const { levantarLinksDoPortal } = await import("@/lib/agency/esteira/links-do-portal");
    // Dois clientes com o MESMO nome: pelo caminho por nome isto era
    // `nome_ambiguo` e ninguém recebia link.
    await prisma.client.create({ data: { workspaceId: ws, name: "Agência ALFA" } });

    const r = await levantarLinksDoPortal({ todaACarteira: true, emitir: true });

    const noBanco = await prisma.client.count();
    expect(r.linhas).toHaveLength(noBanco);
    expect(r.linhas.every((l) => l.link), "algum cliente ficou sem link").toBe(true);
    expect(r.linhas.some((l) => l.situacao === "nome_ambiguo")).toBe(false);
  });

  it("⛔ o token emitido TEM dono escrito — senão a reemissão não conserta nada", async () => {
    const { levantarLinksDoPortal } = await import("@/lib/agency/esteira/links-do-portal");
    await levantarLinksDoPortal({ todaACarteira: true, emitir: true });
    expect(await prisma.portalAccess.count({ where: { clientId: null } })).toBe(0);
  });

  it("⛔ token LEGADO (sem dono) não é reaproveitado — ele não abre mais nada", async () => {
    const { levantarLinksDoPortal } = await import("@/lib/agency/esteira/links-do-portal");
    const so = await prisma.client.create({ data: { workspaceId: ws, name: "So Legado" } });
    await prisma.portalAccess.create({ data: { token: "tk-legado-reuso", clientRequestId: reqCompartilhada } });

    const r = await levantarLinksDoPortal({ todaACarteira: true, emitir: true });
    const linha = r.linhas.find((l) => l.clientId === so.id)!;

    expect(linha.situacao).toBe("link_novo");
    expect(linha.link).not.toContain("tk-legado-reuso");
  });

  it("✅ e é IDEMPOTENTE: rodar duas vezes não cria token novo", async () => {
    const { levantarLinksDoPortal } = await import("@/lib/agency/esteira/links-do-portal");
    await levantarLinksDoPortal({ todaACarteira: true, emitir: true });
    const depoisDaPrimeira = await prisma.portalAccess.count();
    const r = await levantarLinksDoPortal({ todaACarteira: true, emitir: true });
    expect(await prisma.portalAccess.count()).toBe(depoisDaPrimeira);
    expect(r.linhas.every((l) => l.situacao === "link_existente")).toBe(true);
  });
});

describe("a linha-mãe também é cercada", () => {
  it("⛔ o briefing da solicitação de outro não trafega no JSON", async () => {
    // A tela mascarava com `vista.marca.nome` — mas `curl` lê o JSON.
    const doAlfa = await prisma.clientRequestDb.create({
      data: {
        workspaceId: ws, clientId: alfa, businessName: "Padaria ALFA",
        segment: "padaria", services: '["social"]', objectives: '["vender"]',
        status: "in_progress", rawContext: "x",
      },
    });
    // O ponteiro anda para o BETA, que abre com o token dele.
    await prisma.clientRequestDb.update({ where: { id: doAlfa.id }, data: { clientId: beta } });
    await prisma.portalAccess.create({ data: { token: "tk-mae", clientId: alfa, clientRequestId: doAlfa.id } });
    await prisma.portalAccess.create({ data: { token: "tk-mae-b", clientId: beta, clientRequestId: doAlfa.id } });

    const { GET } = await import("@/app/api/brain/portal-data/route");
    const bruto = await (await GET(get("/api/brain/portal-data?token=tk-mae-b"))).text();

    expect(bruto).not.toContain("Padaria ALFA");
  });

  it("✅ e o próprio briefing do dono continua saindo", async () => {
    const propria = await prisma.clientRequestDb.create({
      data: {
        workspaceId: ws, clientId: beta, businessName: "Loja BETA legítima",
        segment: "loja", services: "[]", objectives: "[]", status: "in_progress", rawContext: "x",
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-mae-ok", clientId: beta, clientRequestId: propria.id } });
    const { GET } = await import("@/app/api/brain/portal-data/route");
    const bruto = await (await GET(get("/api/brain/portal-data?token=tk-mae-ok"))).text();
    expect(bruto).toContain("Loja BETA legítima");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 O BACKFILL — o conserto, e ele tem de ter as duas metades
// ═══════════════════════════════════════════════════════════════════════════
describe("backfill curado", () => {
  it("✅ carimba a solicitação LIMPA, e o dono volta a ver o que é dele", async () => {
    const propria = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalMessage.create({
      data: { clientRequestId: propria.id, authorRole: "team", authorName: "x", body: "conversa antiga do beta" },
    });

    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    const rel = await backfillDeCarimbo(true);

    const linha = rel.linhas.find((l) => l.clientRequestId === propria.id)!;
    expect(linha.deixadaDeFora).toBeUndefined();
    expect(linha.carimbadas.mensagens).toBeGreaterThan(0);
  });

  it("⛔ DEIXA DE FORA a solicitação com carimbo alheio — e diz por quê", async () => {
    await prisma.portalMessage.create({
      data: { clientRequestId: reqCompartilhada, clientId: alfa, authorRole: "team", authorName: "x", body: "do alfa" },
    });
    await prisma.portalMessage.create({
      data: { clientRequestId: reqCompartilhada, authorRole: "team", authorName: "x", body: "orfa ambigua" },
    });

    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    const rel = await backfillDeCarimbo(true);

    const linha = rel.linhas.find((l) => l.clientRequestId === reqCompartilhada)!;
    expect(linha.deixadaDeFora).toMatch(/OUTRO cliente/);
    // E a linha ambígua continua órfã — não sabido fecha.
    const orfa = await prisma.portalMessage.findFirst({ where: { body: "orfa ambigua" } });
    expect(orfa?.clientId).toBeNull();
  });

  it("⛔ DEIXA DE FORA linha mais velha que o cliente — ela não pode ter nascido dele", async () => {
    const novo = await prisma.client.create({ data: { workspaceId: ws, name: "Cliente recente" } });
    const r = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: novo.id, businessName: "x", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.portalMessage.create({
      data: {
        clientRequestId: r.id, authorRole: "team", authorName: "x", body: "anterior ao cliente",
        createdAt: new Date("2020-01-01"),
      },
    });

    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    const rel = await backfillDeCarimbo(true);

    expect(rel.linhas.find((l) => l.clientRequestId === r.id)?.deixadaDeFora).toMatch(/MAIS VELHA/);
  });

  it("✅ ENSAIO não grava nada — relatório antes de escrita", async () => {
    const propria = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    const msg = await prisma.portalMessage.create({
      data: { clientRequestId: propria.id, authorRole: "team", authorName: "x", body: "ensaio" },
    });

    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    const rel = await backfillDeCarimbo(false);

    expect(rel.aplicou).toBe(false);
    expect((await prisma.portalMessage.findUnique({ where: { id: msg.id } }))?.clientId).toBeNull();
  });

  it("✅ é IDEMPOTENTE — a segunda passada não carimba nada", async () => {
    await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    const { backfillDeCarimbo } = await import("@/lib/agency/portal/backfill-de-carimbo");
    await backfillDeCarimbo(true);
    const segunda = await backfillDeCarimbo(true);
    expect(segunda.totalDeLinhasCarimbadas).toBe(0);
  });
});

// ── ME: a cerca do CANVAS, com segredo SEM cifrão ──────────────────────────
// O gate anterior era vácuo: o segredo tinha "R$", e `noPrice` remove valor
// **independentemente de posse** — a cerca podia estar revertida e o teste
// passava igual. Segredo sem cifrão isola a posse do filtro de preço.
describe("ME — a cerca do canvas, isolada do filtro de preço", () => {
  const SEM_CIFRAO = "DIRECAO-SECRETA-DO-BETA reposicionamento de marca";

  it("⛔ canvas ÓRFÃO não sai — e a cerca do FILHO é quem barra, isolada", async () => {
    // ⚠️ O gate anterior não isolava nada: usava uma solicitação com carimbo
    // alheio, e aí quem barrava era a cerca da LINHA-MÃE. Reverter a cerca do
    // filho deixava o teste verde. Aqui a solicitação é LIMPA — a mãe passa —
    // e só a cerca do filho pode barrar o canvas órfão. Sem cifrão, para que
    // `noPrice` (que remove valor independentemente de posse) não faça o
    // trabalho no lugar dela.
    const limpa = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.brainArtifact.create({
      data: {
        clientRequestId: limpa.id, clientId: null, department: "strategy",
        canvasId: "c1", canvasJson: JSON.stringify({ summary: SEM_CIFRAO }),
        version: 1, status: "approved", approvedAt: new Date(),
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-me-b", clientId: beta, clientRequestId: limpa.id } });

    const { GET } = await import("@/app/api/brain/portal-data/route");
    const bruto = await (await GET(get("/api/brain/portal-data?token=tk-me-b"))).text();

    // Órfão não sai — nem para o dono. Quem o devolve é o BACKFILL.
    expect(bruto).not.toContain("DIRECAO-SECRETA-DO-BETA");
  });

  it("✅ e o canvas CARIMBADO do dono sai — sem cifrão para provar que é posse", async () => {
    const propria = await prisma.clientRequestDb.create({
      data: { workspaceId: ws, clientId: beta, businessName: "Loja BETA", services: "[]", objectives: "[]", rawContext: "x" },
    });
    await prisma.brainArtifact.create({
      data: {
        clientRequestId: propria.id, clientId: beta, department: "strategy",
        canvasId: "c1", canvasJson: JSON.stringify({ summary: "DIRECAO-LEGITIMA reposicionamento" }),
        version: 1, status: "approved", approvedAt: new Date(),
      },
    });
    await prisma.portalAccess.create({ data: { token: "tk-me-ok", clientId: beta, clientRequestId: propria.id } });

    const { GET } = await import("@/app/api/brain/portal-data/route");
    const bruto = await (await GET(get("/api/brain/portal-data?token=tk-me-ok"))).text();

    expect(bruto).toContain("DIRECAO-LEGITIMA");
  });
});
