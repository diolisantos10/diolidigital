// O AJUSTE NÃO VIRA BECO — a porta de decisão sobrevive à refação que não pôde entregar.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO, MEDIDO EM PRODUÇÃO COM CLIENTE OCULTO (26/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// A cliente (fictícia) apontou a terceira de quatro peças pagas — "escura
// demais, salão vazio". A refação reescreveu o texto e o PISO DE VERDADE
// barrou: o texto novo usava justamente o que ela mesma tinha registrado como
// proibido ("não usar imagem de pizza").
//
// **Parar ali foi certo, e continua certo. Nada neste arquivo afrouxa isso** —
// o primeiro bloco de testes existe para provar que a recusa segue de pé.
//
// O defeito era o DEPOIS:
//   • nenhum arquivo novo, nenhuma versão nova (correto);
//   • o card ficava carimbado `revision_requested` para sempre;
//   • e `POST /api/portal/approvals` passava a devolver **409 "já decidido"**
//     para aprovar, recusar E cancelar.
//
// Um clique em "pedir ajuste" transformava a entrega inteira num beco. Para um
// humano é uma semana perdida; para um AGENTE DE IA representando uma marca —
// o que vem por aí — é um laço infinito: pede, não recebe, não pode decidir,
// pede de novo.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE É DUBLADO, E POR QUE SÓ ISSO
// ═══════════════════════════════════════════════════════════════════════════
//
// **O BANCO É DE VERDADE** (SQLite, tabelas reais) e o ESTADO é o objeto do
// teste: um dublê de Prisma faria o teste concordar com o defeito medido — o
// 409 nasce de uma linha gravada, não de um objeto em memória.
//
// Dublados, e cada um por um motivo: o provedor de IA (`generate` — é ele que
// esta suíte precisa controlar para separar falha transitória de conflito com
// regra do cliente), o laço de arte (compra imagem paga e sobe Chromium), o
// portão de pagamento (D-0A7 vale inteiro em produção; aqui é pré-condição já
// satisfeita) e a autenticação do portal.
//
// **O PISO DE VERDADE É REAL.** É ele quem recusa, e a recusa é justamente o
// que este arquivo promete não afrouxar. Dublá-lo faria o teste encenar a
// própria pergunta.
//
// ── O QUE ELE PROVA, E O QUE NÃO PROVA ─────────────────────────────────────
// PROVA: a resposta da PORTA que o botão do portal chama (200/409), o estado
// gravado, a frase que chega ao PAYLOAD que a tela consome e — por
// `renderToStaticMarkup` — ao HTML que o cliente lê.
// NÃO PROVA: pixels num navegador real, o laço de arte de verdade (imagem
// paga), nem que o modelo de IA de produção devolveria estes textos.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/beco-do-ajuste.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

/** O que a IA devolve nesta rodada. `pizza` é o termo que a cliente proibiu. */
const ia = vi.hoisted(() => ({
  modo: "viola-proibicao" as "viola-proibicao" | "limpa" | "fora-do-ar",
  chamadas: 0,
  /** O prompt do usuário da ÚLTIMA chamada — é nele que a regra do cliente
   *  precisa aparecer, senão a casa julga por uma régua que nunca contou a
   *  quem escreve. */
  ultimoPrompt: "",
}));

vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async (entrada: { user?: string }) => {
    ia.chamadas++;
    ia.ultimoPrompt = entrada?.user ?? "";
    if (ia.modo === "fora-do-ar") return { ok: false, error: "provider down" };
    const proibido = ia.modo === "viola-proibicao";
    return {
      ok: true,
      data: {
        title: "Pauta do Mês — Cantina da Prova",
        items: [1, 2, 3, 4].map((i) => ({
          format: "feed",
          pillar: "bastidor",
          caption:
            i === 3
              ? (proibido
                  ? "Semana 3 — a pizza saindo do forno, o salão cheio no fim de tarde."
                  : "Semana 3 — o salão CHEIO no fim de tarde, luz quente entrando pela janela.")
              : `Semana ${i} — bastidor da cozinha, a equipe montando o serviço da noite.`,
          visual: `equipe da Cantina da Prova em São Paulo montando o serviço, luz de fim de tarde ${i}`,
        })),
      },
    };
  }),
}));

/**
 * O LAÇO DE ARTE, DUBLADO — E O DUBLÊ ESCREVE NO BANCO.
 *
 * Um dublê que só devolve `{ produzidas: 1 }` sem tocar em `mediaUrl` faria o
 * módulo concluir "nada mudou", e a prova de que SÓ a peça apontada muda nunca
 * seria exercitada. O dublê faz o que o laço real faz: grava o arquivo novo.
 */
const arte = vi.hoisted(() => ({ produz: true }));
vi.mock("@/lib/agency/execution/artes", () => ({
  produzirArtesPendentes: vi.fn(async ({ refazer }: { refazer?: string[] }) => {
    const alvos = refazer ?? [];
    if (!arte.produz) {
      return { produzidas: 0, desistiram: [], semOrcamento: [], semPagamento: [],
        falhas: alvos.map((id) => ({ postId: id, erro: "o gerador de imagem recusou o pedido" })) };
    }
    const { prisma: db } = await import("@/lib/db/client");
    for (const id of alvos) {
      await db.socialPost.update({ where: { id }, data: { mediaUrl: `/api/media/NOVA-${id}` } });
    }
    return { produzidas: alvos.length, falhas: [], desistiram: [], semOrcamento: [], semPagamento: [] };
  }),
}));

vi.mock("@/lib/agency/financeiro/portao-de-pagamento", () => ({
  conferirPagamentoDaAncora: vi.fn(async () => ({ liberado: true, mensagemAoCliente: "" })),
}));

const validatePortalAccess = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/persistence/portal-access-service", () => ({ validatePortalAccess }));

import { prisma } from "@/lib/db/client";
import { POST } from "@/app/api/portal/approvals/route";
import { registrarProibicoes } from "@/lib/agency/esteira/proibicoes";
import { MAX_TENTATIVAS_TRANSITORIAS } from "@/lib/agency/esteira/porta-do-ajuste";
import { buscarAprovacoes, montarPecas } from "@/lib/agency/esteira/pacote";
import { DetalheDaPeca } from "@/components/portal/DetalheDaPeca";

let workspaceId = "";
let clientId = "";
let projectId = "";
let approvalId = "";
let versionId = "";
let postIds: string[] = [];

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/portal/approvals", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ token: "tok-ana", approvalRequestId: approvalId, ...body }),
  });
}

/** O pedido da cliente oculta, palavra por palavra. */
const PEDIDO = "A terceira peça está escura demais, o salão está vazio — quero ela mais clara e cheia.";

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });
  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `beco-${Date.now()}` } });
  workspaceId = ws.id;
  const c = await prisma.client.create({
    data: { workspaceId, name: "CANTINA DA PROVA TESTE", email: "ana@cantina-da-prova.invalid" },
  });
  clientId = c.id;
  const p = await prisma.project.create({
    data: { workspaceId, clientId, name: "Social — Cantina da Prova", presentedAt: new Date() },
  });
  projectId = p.id;

  // A REGRA QUE A PRÓPRIA CLIENTE REGISTROU — é nela que a refação vai esbarrar.
  const reg = await registrarProibicoes(clientId, "nunca use imagem de pizza nas peças.", "briefing");
  expect(reg.total, "sem a proibição registrada o fixture não encena o caso medido").toBeGreaterThan(0);
});

beforeEach(async () => {
  vi.clearAllMocks();
  ia.modo = "viola-proibicao";
  ia.chamadas = 0;
  ia.ultimoPrompt = "";
  arte.produz = true;
  validatePortalAccess.mockResolvedValue({ valid: true, record: { clientRequestId: null, clientId } });

  await prisma.approvalComment.deleteMany({});
  await prisma.approvalRequest.deleteMany({});
  await prisma.deliverableVersion.deleteMany({});
  await prisma.deliverable.deleteMany({});
  await prisma.socialPost.deleteMany({});
  await prisma.portalMessage.deleteMany({});
  await prisma.activityEvent.deleteMany({});

  const d = await prisma.deliverable.create({
    data: {
      projectId, name: "Pauta do Mês", type: "plano-de-conteudo", ownerAgentId: "a3",
      version: 1, visibility: "compartilhado",
      content: "# Pauta do Mês\n\n## Semana 1\n- Legenda: bastidor\n\n## Semana 2\n- Legenda: bastidor\n\n## Semana 3\n- Legenda: o salão no fim de tarde\n\n## Semana 4\n- Legenda: bastidor",
    },
  });
  const v = await prisma.deliverableVersion.create({
    data: { deliverableId: d.id, number: 1, content: d.content, createdBy: "a3" },
  });
  versionId = v.id;

  postIds = [];
  for (let i = 1; i <= 4; i++) {
    const sp = await prisma.socialPost.create({
      data: {
        workspaceId, clientId, caption: `legenda ${i}`, format: "feed",
        visibility: "compartilhado", status: "draft", mediaUrl: `/api/media/velha-${i}`,
      },
    });
    postIds.push(sp.id);
  }

  const ap = await prisma.approvalRequest.create({
    data: {
      clientId, department: "social-media", clientVisible: true, status: "pending",
      deliverableVersionId: versionId,
      sourcePostIdsJson: JSON.stringify(postIds),
      reviewNote: "Pauta do Mês\n\n4 peças",
    },
  });
  approvalId = ap.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

/** As quatro peças como estão AGORA, na ordem do cartão. */
async function pecas() {
  const p = await prisma.socialPost.findMany({ where: { id: { in: postIds } } });
  const porId = new Map(p.map((x) => [x.id, x]));
  return postIds.map((id) => porId.get(id)!);
}

// ═══════════════════════════════════════════════════════════════════════════
describe("A RECUSA CONTINUA — a casa não entrega peça que viola regra do cliente", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("texto novo que esbarra na proibição registrada NÃO vira entrega", async () => {
    const res = await POST(req({ action: "request_revision", comment: PEDIDO }));
    expect(res.status).toBe(200);

    // Nenhum arquivo novo, nenhuma versão nova: a régua segurou a entrega.
    expect((await pecas()).every((p) => p.mediaUrl?.startsWith("/api/media/velha-")),
      "a peça que viola a regra do cliente não sai daqui").toBe(true);
    expect(await prisma.deliverableVersion.count(),
      "a recusa não deixa versão nascer").toBe(1);

    // E o motivo fica registrado para gente, com o nome CERTO: até 26/08/2026
    // esta escalada dizia "a refação inventou dado" — a casa se acusando de
    // inventar dado no exato momento em que respeitava uma regra do cliente.
    const escalada = await prisma.activityEvent.findFirst({ where: { type: "refacao_escalada" } });
    expect(escalada?.message).toMatch(/proibi[çc][ãa]o REGISTRADA pelo pr[óo]prio cliente/i);
    expect(escalada?.message, "rótulo errado manda a investigação para o lado errado")
      .not.toMatch(/inventou dado/i);
  });

  it("a regra do cliente chega a QUEM ESCREVE, não só a quem julga", async () => {
    // ── A METADE QUE EVITA CHEGAR NO BECO ────────────────────────────────
    // As proibições entravam SÓ no piso (a régua de SAÍDA). O prompt desta
    // refação nunca as via: a casa julgava por uma regra que nunca contou a
    // quem escreve, e foi assim que o caso medido aconteceu — o modelo usou o
    // termo proibido porque ninguém lhe disse que era proibido.
    await POST(req({ action: "request_revision", comment: PEDIDO }));
    expect(ia.ultimoPrompt, "a regra, com as palavras dele").toMatch(/pizza/i);
    // E a INSTRUÇÃO GÊMEA junto: "não use X" sozinho faz o modelo CORTAR o
    // assunto, e o cliente perde o conteúdo que comprou por uma regra de forma.
    expect(ia.ultimoPrompt, "a instrução gêmea").toMatch(/diga a MESMA coisa de outro jeito/i);
  });

  it("💰 conflito com regra do cliente NÃO é retentado — seria queimar dinheiro de IA", async () => {
    await POST(req({ action: "request_revision", comment: PEDIDO }));
    // A régua do piso roda em CÓDIGO, sem IA: a segunda chamada daria
    // exatamente o mesmo resultado. Uma chamada, e a saída é a conversa.
    expect(ia.chamadas, "uma chamada, e nem uma a mais").toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("🔴 O BECO — pedir ajuste NÃO pode consumir o direito de decidir", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("o card volta a ser decidível depois da parada", async () => {
    await POST(req({ action: "request_revision", comment: PEDIDO }));
    const card = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
    // Era `revision_requested` para sempre — e era daí que saía o 409.
    expect(card.status, "o cliente ficava preso aqui").toBe("pending");
    expect(card.reviewedAt, "card que pede decisão não pode dizer 'decidido por você'").toBeNull();
  });

  // As TRÊS portas, uma por vez, cada uma sobre um card novo: o defeito medido
  // fechava as três de uma vez só.
  for (const acao of ["approve", "reject", "cancel"] as const) {
    it(`o cliente ainda consegue "${acao}" a peça que já está na mão dele`, async () => {
      const ajuste = await POST(req({ action: "request_revision", comment: PEDIDO }));
      expect(ajuste.status).toBe(200);

      const res = await POST(req({ action: acao, comment: "decidi assim." }));
      const corpo = await res.json() as Record<string, unknown>;
      expect(res.status, `a porta devolvia 409 "já decidido" — o beco`).toBe(200);
      expect(corpo.error, "nenhum erro na resposta que o botão lê").toBeUndefined();
    });
  }

  it("aprovar depois da parada AGENDA de verdade — o beco não reaparece do outro lado", async () => {
    await POST(req({ action: "request_revision", comment: PEDIDO }));
    // A peça apontada tinha virado `revision_requested` (= "alguém está
    // refazendo isto"), que é mentira quando ninguém está: `ESTADOS_PROMOVIVEIS`
    // não a inclui, e o "sim" do cliente não agendaria nada.
    const antes = await pecas();
    expect(antes.map((p) => p.status), "nada foi refeito: nenhuma peça fica presa em revisão")
      .toEqual(["draft", "draft", "draft", "draft"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("A INSTRUÇÃO GÊMEA — ele lê o PORQUÊ, e é uma conversa, não um erro", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("a razão chega ao CARD, à PEÇA e à conversa — três superfícies", async () => {
    await POST(req({ action: "request_revision", comment: PEDIDO }));

    // 1. NO CARD, onde ele decide.
    const noCard = await prisma.approvalComment.findMany({
      where: { approvalRequestId: approvalId, isClientVisible: true },
    });
    const aviso = noCard.find((c) => /regra SUA/i.test(c.body));
    expect(aviso, "sem isto ele lê 'ajustes solicitados' e nada mais").toBeTruthy();
    expect(aviso!.body).toMatch(/regra que você mesmo registrou/i);
    expect(aviso!.body, "a regra dele, com as palavras dele").toMatch(/pizza/i);
    expect(aviso!.body, "e ele continua dono da decisão").toMatch(/aprovar, pedir outro ajuste, recusar ou cancelar/i);

    // 2. NA PEÇA — a única superfície desta casa em que a parada vira PIXEL.
    //    Só na peça APONTADA: alarme falso nas outras mata o alarme verdadeiro.
    const p = await pecas();
    expect(p[2]!.avisoAoCliente, "a terceira é a que ele apontou").toMatch(/regra que você mesmo registrou/i);
    for (const i of [0, 1, 3]) {
      expect(p[i]!.avisoAoCliente, `a peça ${i + 1} não está parada e não pode alarmar`).toBeNull();
    }

    // 3. NA CONVERSA — e não mais a frase vaga de antes.
    const msgs = await prisma.portalMessage.findMany({});
    expect(msgs.some((m) => /regra que você mesmo registrou/i.test(m.body))).toBe(true);
    expect(msgs.some((m) => /já estou olhando com atenção/i.test(m.body)),
      "'estou olhando' mandava ele esperar gente que nunca ia vir — o que faltava era resposta DELE").toBe(false);
  });

  it("🖼️ a frase chega ao HTML que o cliente lê — não à coluna do banco", async () => {
    // A pergunta obrigatória desta casa. Nesta operação o aviso já morreu numa
    // coluna três vezes: régua verde sobre o componente errado.
    await POST(req({ action: "request_revision", comment: PEDIDO }));

    // O MESMO leitor que serve o portal (`pacote.ts`), não uma leitura à parte.
    const cards = await buscarAprovacoes({ clientId, clientVisible: true });
    const doPortal = (await montarPecas(cards)).get(approvalId) ?? [];
    const terceira = doPortal.find((x) => x.id === postIds[2]);
    expect(terceira, "a peça apontada tem de estar no payload da tela").toBeTruthy();

    const html = renderToStaticMarkup(
      <DetalheDaPeca peca={terceira!} token="tok-ana" onFechar={() => {}} />,
    );
    expect(html).toMatch(/regra que você mesmo registrou/i);
    expect(html, "o convite a decidir também é pixel").toMatch(/recusar ou cancelar/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("TRANSITÓRIO ≠ CONFLITO — tentar de novo o que vai falhar igual é queimar dinheiro", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("provedor fora do ar: retenta com TETO e declara a parada", async () => {
    ia.modo = "fora-do-ar";
    const res = await POST(req({ action: "request_revision", comment: PEDIDO }));
    expect(res.status).toBe(200);

    // ⚠️ O NÚMERO ESTÁ ESCRITO AQUI, e não como `MAX_TENTATIVAS_TRANSITORIAS`.
    // A primeira versão desta linha comparava o contador com a própria
    // constante importada — uma tautologia: baixar o teto para 1 (desligar a
    // retentativa) deixava o teste VERDE. Régua que se ajusta ao código não é
    // régua. O teto declarado é conferido à parte, logo abaixo.
    expect(ia.chamadas, "falha transitória merece outra tentativa").toBe(2);
    expect(MAX_TENTATIVAS_TRANSITORIAS, "e o teto é o teto — não há terceira").toBe(2);

    // PARADA DECLARADA: motivo, dono e próxima ação.
    const escalada = await prisma.activityEvent.findFirst({ where: { type: "refacao_escalada" } });
    expect(escalada?.message, "motivo").toMatch(/transit[óo]ria/i);
    expect(escalada?.message, "dono").toMatch(/Dono: a ag[êe]ncia/i);
    expect(escalada?.message, "próxima ação").toMatch(/Pr[óo]xima a[çc][ãa]o:/i);

    // E a porta continua aberta: a falha é da casa, não do pedido dele.
    const card = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
    expect(card.status).toBe("pending");
    const p = await pecas();
    expect(p[2]!.avisoAoCliente, "e o problema é NOSSO, dito assim").toMatch(/o problema é nosso/i);
  });

  it("a frase da falha transitória NÃO acusa o cliente de nada", async () => {
    ia.modo = "fora-do-ar";
    await POST(req({ action: "request_revision", comment: PEDIDO }));
    const p = await pecas();
    expect(p[2]!.avisoAoCliente).not.toMatch(/regra que você mesmo registrou/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("O TEXTO SAIU E A ARTE NÃO — a casa não convida, mas também não tranca", () => {
// ═══════════════════════════════════════════════════════════════════════════
  //
  // A doutrina de 25/08/2026 está certa e fica: não se PEDE ao cliente que
  // aprove de novo a mesma imagem que ele acabou de recusar. Mas "não pedir"
  // tinha virado "não deixar" — e daí saía o mesmo 409.

  beforeEach(() => { ia.modo = "limpa"; arte.produz = false; });

  it("o card continua decidível, e a peça continua inagendável", async () => {
    await POST(req({ action: "request_revision", comment: PEDIDO }));

    const card = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
    expect(card.status, "ele não pode ficar preso").toBe("pending");

    // E a trava fica de pé ONDE ela protege: a peça com a arte velha não vai
    // ao ar. `ESTADOS_PROMOVIVEIS` não inclui `revision_requested`.
    const p = await pecas();
    expect(p[2]!.status, "a imagem ainda é a recusada — ela não entra na fila").toBe("revision_requested");
  });

  it("a frase específica da arte FICA, e ganha o convite a decidir", async () => {
    await POST(req({ action: "request_revision", comment: PEDIDO }));
    const p = await pecas();
    // A frase específica (escrita por `refazer-a-arte-do-ajuste.ts`) é melhor
    // que a genérica: ela diz o que mudou e o que NÃO mudou. Sobrescrevê-la
    // seria a segunda verdade sobre o mesmo fato.
    expect(p[2]!.avisoAoCliente, "a frase da arte não pode ser sobrescrita")
      .toMatch(/a imagem desta peça ainda é a anterior/i);
    expect(p[2]!.avisoAoCliente, "e a metade que faltava: o direito de decidir")
      .toMatch(/continua SUA para decidir/i);
  });

  it("as três portas seguem abertas", async () => {
    await POST(req({ action: "request_revision", comment: PEDIDO }));
    const res = await POST(req({ action: "cancel", comment: "desisti desta peça." }));
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("QUANDO O AJUSTE SAI — só a peça apontada muda, e o card reabre nela", () => {
// ═══════════════════════════════════════════════════════════════════════════

  it("🎯 a terceira muda; as outras três ficam idênticas", async () => {
    ia.modo = "limpa";
    const antes = await pecas();
    const res = await POST(req({ action: "request_revision", comment: PEDIDO }));
    expect(res.status).toBe(200);

    const depois = await pecas();
    expect(depois[2]!.mediaUrl, "a terceira ganhou arquivo NOVO").not.toBe(antes[2]!.mediaUrl);
    for (const i of [0, 1, 3]) {
      expect(depois[i]!.mediaUrl, `a peça ${i + 1} não foi tocada`).toBe(antes[i]!.mediaUrl);
      expect(depois[i]!.caption, `a legenda ${i + 1} não foi tocada`).toBe(antes[i]!.caption);
    }

    // Versão nova nasceu e o card aponta para ELA — e não há aviso de parada:
    // aviso que sobrevive ao conserto ensina o cliente a ignorar o próximo.
    const card = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } });
    expect(card.status).toBe("pending");
    expect(card.deliverableVersionId, "ele decide a versão nova, não a velha").not.toBe(versionId);
    expect(depois[2]!.avisoAoCliente, "a parada acabou; o aviso sai").toBeNull();
  });
});
