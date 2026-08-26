// O PLANO COMPLETO CABE — 32 peças no ciclo, com banco de verdade.
//
// ═══ O QUE ESTE ARQUIVO PROVA, E POR QUE ELE EXISTE ═════════════════════════
//
// A pendência P-01 dizia que nenhum plano da casa cabia na capacidade: 12
// peças/mês contra 34 no mais barato e 160 no Premium. A tabela nova (aprovada
// pelo CEO em 25/08/2026) vende 32 peças no plano Completo, e este teste é o
// que prova que as 32 saem — pela esteira de verdade, contra SQLite de verdade,
// com as migrations de verdade.
//
// ── A PERGUNTA OBRIGATÓRIA DESTA CASA ───────────────────────────────────────
//
// *O teste alcança o caminho que atende o cliente, ou um irmão pouco usado?*
//
// O caminho é `runProjectExecution` — o funil por onde passam os nove chamadores
// de produção, com o portão de pagamento, o portão de direção, a trava
// anti-concorrência e o contrato de saída dentro dele. É ele que roda aqui, três
// vezes, uma por leva, com o relógio do ciclo andando entre elas.
//
// ── O QUE É DUBLÊ, E POR QUÊ ────────────────────────────────────────────────
//
// Só a chamada de IA e o juiz de qualidade. Não por conveniência: o que está
// sendo provado é a CAPACIDADE (quantas peças o contrato aceita e quantas a
// esteira entrega), não o texto que o modelo escreve. Tudo que decide quantidade
// — `escopo-do-cliente`, `contrato-de-quantidade`, `especialistas` — é o módulo
// real, e a resposta do dublê é conferida pelo contrato real: entrega fora do
// tamanho da leva é reprovada aqui como seria em produção.

import { PLANOS } from "@/lib/agency/planos";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/completo-e2e-${process.pid}.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

/** O dublê responde o lote do TAMANHO PEDIDO, lendo o número do próprio prompt.
 *  É assim que ele deixa de ser um fixture fixo e passa a ser um especialista
 *  obediente: se a casa pedir 11 peças e o contrato exigir 11, ele entrega 11 —
 *  e se a casa pedir o número errado, o contrato real reprova aqui. */
vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async ({ user }: { user: string }) => {
    const receita = [...user.matchAll(/- (CARROSSEL|STORY|FEED): exatamente (\d+) peça\(s\)/g)]
      .map((m) => [m[1]!.toLowerCase(), Number(m[2])] as const);
    const total = Number(/EXATAMENTE (\d+) peças/.exec(user)?.[1] ?? 6);
    const cenas = "1) [gancho] a vitrine cheia às 8h · 2) [tensao] a prateleira vazia às 11h · 3) [mecanismo] o pão saindo do forno na bancada · 4) [acao] o cliente escolhendo o pão no balcão";
    const peca = (format: string) => ({
      format,
      pillar: "bastidor da padaria",
      headline: "O pão das 18 horas",
      caption: "A massa descansa desde ontem à noite, e é por isso que ela tem esse sabor.",
      visual: "padeiro abrindo o forno na padaria do bairro, luz baixa das 5h da manhã",
      ...(format === "carrossel" ? { cenas } : {}),
    });
    const items = receita.length > 0
      ? receita.flatMap(([f, n]) => Array.from({ length: n }, () => peca(f)))
      : Array.from({ length: total }, () => peca("feed"));
    return { ok: true, data: { title: "Legendas Prontas — Padaria do João", summary: "s", items } };
  }),
  anyProviderConfigured: vi.fn(async () => true),
}));

vi.mock("@/lib/agency/execution/quality-auditor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agency/execution/quality-auditor")>()),
  auditDeliverable: vi.fn(async () => ({ verdict: "aprovado", issues: [], note: "ok" })),
}));
vi.mock("@/lib/agency/radar/library", () => ({
  getActiveInsights: vi.fn(async () => []),
  buildInsightBlock: vi.fn(() => ""),
}));

import { prisma } from "@/lib/db/client";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { SOCIAL_PACKAGES, detectPackage } from "@/lib/agency/live-calculator";
import {
  lerEscopoDeConteudo, exigenciaDeConteudo, planoDeLevas,
  DIAS_ENTRE_LEVAS, LEVAS_POR_CICLO, TETO_DE_PECAS_POR_ENTREGA,
} from "@/lib/agency/execution/escopo-do-cliente";
import { MAX_IMAGENS_POR_CLIENTE_POR_DIA } from "@/lib/agency/execution/artes";
import { PRECO_DE_TABELA_USD, estimarCusto } from "@/lib/ai/precos";

const DIA = 86_400_000;
/** 8 posts/semana, zero story, zero reel — o plano Completo, escrito como o SDR
 *  grava o briefing. */
const ESCOPO = { social: { postsPerWeek: 8, storiesPerWeek: 0, reelsPerMonth: 0 } };

let clientId = "";
let clientRequestId = "";
let projectId = "";
let cycleId = "";

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` }, stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({ data: { name: "[TESTE] Dioli", slug: `teste-completo-${process.pid}` } });
  const cliente = await prisma.client.create({
    // Cliente FICTÍCIO, marcado, com contato `.invalid`: nenhuma mensagem sai
    // daqui, e se alguém tentar mandar, o domínio não existe por definição.
    data: { workspaceId: ws.id, name: "[TESTE] Padaria do João", industry: "Alimentação", email: "teste@exemplo.invalid" },
  });
  clientId = cliente.id;
  const req = await prisma.clientRequestDb.create({
    data: {
      workspaceId: ws.id, clientId,
      businessName: "[TESTE] Padaria do João", segment: "Alimentação",
      services: JSON.stringify(["social media"]),
      objectives: JSON.stringify(["vender mais no fim de semana"]),
      briefingJson: JSON.stringify({ scope: ESCOPO }),
      status: "accepted",
    },
  });
  clientRequestId = req.id;
  const projeto = await prisma.project.create({
    data: {
      workspaceId: ws.id, clientId, clientRequestId,
      name: "[TESTE] Social — Padaria do João", stage: "execution",
      agents: JSON.stringify(["a3", "social-copy"]),
      directionApprovedAt: new Date(), executionStatus: "pending",
    },
  });
  projectId = projeto.id;
  const ciclo = await prisma.cycle.create({
    data: { projectId, reference: "2026-09", status: "aberto", startsOn: "2026-09-01", endsOn: "2026-09-30" },
  });
  cycleId = ciclo.id;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

/** Quantas peças o cliente já recebeu no ciclo, contadas no markdown entregue —
 *  que é o texto que ele LÊ, não um contador paralelo. */
async function pecasEntregues(): Promise<number> {
  const ds = await prisma.deliverable.findMany({
    where: { projectId, cycleId, ownerAgentId: "social-copy" },
    select: { content: true, leva: true },
  });
  // Cada peça abre com `**N. <headline>**` em `renderizar-entrega.ts` — a
  // mesma linha que o cliente vê no portal.
  return ds.reduce((s, d) => s + (d.content?.match(/^\*\*\d+\. /gm)?.length ?? 0), 0);
}

/** Move o relógio do ciclo: para a casa, "passaram-se N dias" é o ciclo ter
 *  começado N dias atrás. Sem relógio falso — a data é dado, não ambiente. */
async function avancarPara(diaDoCiclo: number) {
  const inicio = new Date(Date.now() - diaDoCiclo * DIA);
  await prisma.cycle.update({
    where: { id: cycleId },
    data: { startsOn: inicio.toISOString().slice(0, 10) },
  });
  await prisma.project.update({ where: { id: projectId }, data: { executionStatus: "pending" } });
}

describe("o CONTRATO aceita 32 peças", () => {
  it("o briefing de 8 posts/semana escolhe o Completo, e o Completo são 32/mês", () => {
    // O maior degrau passou a se chamar Conteúdo (tabela única, 26/08/2026) e
    // entrega 36 — a capacidade INTEIRA da casa, não 32. 32 continua caindo
    // nele, porque ele é o maior que a casa faz.
    expect(detectPackage(8 * 4)).toBe("conteudo");
    const maior = SOCIAL_PACKAGES.find((p) => p.id === "conteudo")!;
    expect(maior.postsPerMonth).toBe(36);
    expect(maior.minPrice).toBe(PLANOS.find((p) => p.id === "conteudo")!.preco);
  });

  it("a casa LÊ 32 peças do briefing e as reparte em três levas", () => {
    const escopo = lerEscopoDeConteudo({ servicos: ["social media"], escopo: JSON.stringify(ESCOPO), contextoBruto: "" });
    expect(escopo.pecasPorMes).toBe(32);
    expect(planoDeLevas(32)).toEqual([11, 11, 10]);
    // E nenhuma leva passa do teto por passada — o teto NÃO foi afrouxado.
    for (let i = 1; i <= LEVAS_POR_CICLO; i++) {
      expect(exigenciaDeConteudo(escopo, i).max).toBeLessThanOrEqual(TETO_DE_PECAS_POR_ENTREGA);
    }
    // O contrato do mês fecha: nada sobra e nada falta.
    expect(exigenciaDeConteudo(escopo, 1).cobreDoMes).toEqual({ entrega: 32, contratado: 32, leva: 1, levas: 3 });
  });
});

describe("A PRODUÇÃO entrega as 32 ao longo do ciclo — banco real, esteira real", () => {
  it("o portão de pagamento vem ANTES de tudo: sem dinheiro, zero peça", async () => {
    const r = await runProjectExecution(projectId);
    expect(r.status).toBe("skipped_running");
    expect(r.error).toMatch(/pagamento/i);
    expect(await pecasEntregues()).toBe(0);
    // E o projeto volta a esperar, sem gastar tentativa.
    expect((await prisma.project.findUnique({ where: { id: projectId } }))!.executionStatus).toBe("idle");
  });

  it("pago, a leva 1 traz 11 peças — não as 32 de uma vez", async () => {
    await prisma.pagamentoConfirmado.create({
      data: { clientRequestId, origem: "mercadopago", provedorId: "pay-teste-1", valorCentavos: 179000, confirmadoEm: new Date() },
    });
    await avancarPara(0);
    await runProjectExecution(projectId);
    expect(await pecasEntregues()).toBe(11);
  });

  it("rodar de novo no MESMO dia não traz nada — a leva não se repete", async () => {
    await prisma.project.update({ where: { id: projectId }, data: { executionStatus: "pending" } });
    await runProjectExecution(projectId);
    expect(await pecasEntregues()).toBe(11);
  });

  it(`${DIAS_ENTRE_LEVAS} dias depois vem a leva 2, e só ela`, async () => {
    await avancarPara(DIAS_ENTRE_LEVAS);
    await runProjectExecution(projectId);
    expect(await pecasEntregues()).toBe(22);
  });

  it("e a leva 3 fecha o mês comprado: 32 peças", async () => {
    await avancarPara(DIAS_ENTRE_LEVAS * 2);
    await runProjectExecution(projectId);
    expect(await pecasEntregues()).toBe(32);

    // Três entregas de conteúdo, uma por leva — e nenhuma quarta.
    const levas = await prisma.deliverable.findMany({
      where: { projectId, cycleId, ownerAgentId: "social-copy" },
      select: { leva: true }, orderBy: { leva: "asc" },
    });
    expect(levas.map((d) => d.leva)).toEqual([1, 2, 3]);
  });

  it("o mês fechado NÃO refaz o que é um por ciclo — a pauta continua uma só", async () => {
    const pautas = await prisma.deliverable.count({ where: { projectId, cycleId, ownerAgentId: "a3" } });
    // Repetir a pauta a cada leva triplicaria a conta de IA para entregar três
    // vezes o mesmo documento.
    expect(pautas).toBe(1);
  });

  it("depois das três levas, o ciclo para sozinho — leva 4 não existe", async () => {
    await avancarPara(DIAS_ENTRE_LEVAS * 3);
    await runProjectExecution(projectId);
    expect(await pecasEntregues()).toBe(32);
  });
});

describe("os tetos por baixo continuam de pé — e as levas os ALIVIAM", () => {
  it("nenhum dia do ciclo chega perto do teto diário de imagens por cliente", () => {
    const maiorLeva = Math.max(...planoDeLevas(32));
    // 11 peças no pior dia, contra um teto de 40 imagens/cliente/dia. As 32 num
    // dia só (que é o que a capacidade sem ritmo produziria) já encostariam no
    // teto assim que um carrossel multiplicasse por tela.
    expect(maiorLeva).toBeLessThan(MAX_IMAGENS_POR_CLIENTE_POR_DIA);
    expect(maiorLeva * 6).toBeGreaterThan(MAX_IMAGENS_POR_CLIENTE_POR_DIA); // o carrossel multiplica: o teto continua fazendo trabalho
  });

  it("o custo de um ciclo de 32 peças é uma fração do preço do plano", () => {
    // ⚠️ ESTIMATIVA DE TABELA, não a fatura — é o que a casa sabe medir hoje
    // (`lib/ai/precos.ts`), e está declarado como estimativa em toda tela.
    const imagem = PRECO_DE_TABELA_USD.quadrada;                 // US$ 0,167
    const texto = estimarCusto("claude-haiku-4-5", 1400, 500).usd ?? 0;
    const porPecaUsd = imagem + texto;
    const cicloUsd = porPecaUsd * 32;
    const cicloBrl = cicloUsd * 5.4;                             // câmbio declarado, não medido

    expect(porPecaUsd).toBeLessThan(0.30);
    // O número que dissolveu o dilema: o ciclo inteiro custa menos de 5% do
    // plano. O limite de 12 peças/mês nunca foi de dinheiro.
    expect(cicloBrl).toBeLessThan(1790 * 0.05);
  });
});
