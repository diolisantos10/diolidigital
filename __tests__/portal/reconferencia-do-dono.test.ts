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
