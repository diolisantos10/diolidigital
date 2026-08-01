import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";


// A JORNADA CONTRA UM BANCO DE VERDADE.
//
// Os outros testes provam cada peça em isolamento, com o banco simulado. Este
// prova a coisa que realmente importa e que nenhum teste de unidade alcança:
// que um cliente entra de um lado da esteira e sai do outro, com escrita real
// em SQLite, tabelas reais, chaves estrangeiras reais.
//
// É o teste que responde "a linha anda?" — a pergunta que originou este
// trabalho inteiro. Se ele passa, o projeto sai do briefing e chega ao ciclo
// mensal sem intervenção manual em nenhum ponto.
//
// A ÚNICA coisa simulada aqui é a chamada de IA. Não porque seja conveniente,
// mas porque a esteira não pode depender de rede para ser verificada — e
// porque o que está sendo testado é o TRANSPORTE, não o texto que a IA escreve.

// O caminho do banco precisa estar no ambiente ANTES de qualquer import ser
// avaliado — o cliente Prisma lê DATABASE_URL na criação. Em ESM os imports
// rodam antes do corpo do módulo, então uma atribuição comum aqui chegaria
// tarde demais e o teste falaria com o banco de desenvolvimento.
const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/esteira-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

// A IA responde sempre a mesma peça — o conteúdo não é o objeto do teste.
vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async () => ({
    ok: true,
    data: {
      title: "Pacote de conteúdo — Padaria do João",
      summary: "Quatro peças sobre o pão de fermentação natural.",
      items: [
        { headline: "O pão que leva 18 horas", format: "reel", caption: "A massa descansa desde ontem à noite. É por isso que ela tem esse sabor.", visual: "close na massa" },
        { headline: "Quem faz o seu pão", format: "feed", caption: "O João acorda às 3h. Todo dia, há 22 anos.", visual: "retrato do padeiro" },
      ],
    },
  })),
  anyProviderConfigured: vi.fn(async () => true),
}));

// A Qualidade aprova de primeira — o loop de correção tem teste próprio.
vi.mock("@/lib/agency/execution/quality-auditor", () => ({
  auditDeliverable: vi.fn(async () => ({ verdict: "pass", issues: [], note: "ok" })),
}));

// O Radar não injeta tendência aqui — é insumo, não parte da esteira.
vi.mock("@/lib/agency/radar/library", () => ({
  getActiveInsights: vi.fn(async () => []),
  buildInsightBlock: vi.fn(() => ""),
}));

import { prisma } from "@/lib/db/client";
import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { pedirDirecao, aprovarDirecao, apresentar, aprovarPacote } from "@/lib/agency/esteira/marcos";
import { statusDoProjeto } from "@/lib/agency/esteira/retrato";

let workspaceId = "";
let clientId = "";
let clientRequestId = "";
let projectId = "";

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({ data: { name: "Dioli Agência", slug: `e2e-${Date.now()}` } });
  workspaceId = ws.id;

  const cliente = await prisma.client.create({
    data: { workspaceId, name: "Padaria do João", industry: "Alimentação" },
  });
  clientId = cliente.id;

  const req = await prisma.clientRequestDb.create({
    data: {
      workspaceId, clientId,
      businessName: "Padaria do João",
      segment: "Alimentação",
      services: JSON.stringify(["social media"]),
      objectives: JSON.stringify(["vender mais no fim de semana"]),
      briefingJson: JSON.stringify({ scope: { targetAudience: "moradores do bairro" } }),
      status: "accepted",
    },
  });
  clientRequestId = req.id;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("a esteira, de ponta a ponta, com banco real", () => {
  it("1. o projeto nasce vinculado à solicitação — sem isso o motor recusa produzir", async () => {
    const projeto = await prisma.project.create({
      data: {
        workspaceId, clientId, clientRequestId,
        name: "Social — Padaria do João",
        goal: "vender mais no fim de semana",
        stage: "planning",
        agents: JSON.stringify(["a3"]),
      },
    });
    projectId = projeto.id;

    await prisma.task.create({
      data: { projectId, title: "Pacote de conteúdo do mês", agentId: "a3", status: "pending" },
    });

    expect(projeto.clientRequestId).toBe(clientRequestId);
  });

  it("2. o cliente recebe a direção assim que o projeto nasce", async () => {
    const r = await pedirDirecao(projectId);
    expect(r.ok).toBe(true);

    const msgs = await prisma.portalMessage.findMany({ where: { clientRequestId } });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.body).toContain("Pacote de conteúdo do mês");

    const status = await statusDoProjeto(projectId);
    expect(status?.leitura.fase).toBe("direcao");
    expect(status?.leitura.responsavel).toBe("cliente");
  });

  it("3. sem o aval, a produção NÃO acontece", async () => {
    const r = await runProjectExecution(projectId);
    expect(r.error).toMatch(/direção/i);

    const entregas = await prisma.deliverable.count({ where: { projectId } });
    expect(entregas).toBe(0);

    const tarefa = await prisma.task.findFirst({ where: { projectId } });
    expect(tarefa?.status).toBe("pending");
  });

  it("4. o aval dispara a produção, e a tarefa anda junto", async () => {
    const r = await aprovarDirecao(projectId);
    expect(r.ok).toBe(true);
    expect(r.execucao?.produced).toContain("Social Media \u00b7 Pauta do m\u00eas");

    // O PM decide QUANTOS departamentos entram — aqui ele pode ter puxado mais
    // de um. O que importa é que TODA entrega produzida carregue conteúdo.
    const entregas = await prisma.deliverable.findMany({ where: { projectId } });
    expect(entregas.length).toBeGreaterThan(0);
    for (const e of entregas) {
      expect(e.content, `entrega "${e.name}" veio sem conteúdo`).toBeTruthy();
      expect(e.content!.length).toBeGreaterThan(40);
    }

    // O CONTEÚDO fica gravado — era isto que se perdia antes.
    const social = entregas.find((e) => e.ownerAgentId === "a3");
    expect(social?.content).toContain("O pão que leva 18 horas");

    // A tarefa do social fechou, ligada ao entregável que a cumpriu.
    const tarefa = await prisma.task.findFirst({ where: { projectId, agentId: "a3" } });
    expect(tarefa?.status).toBe("done");
    expect(tarefa?.deliverableId).toBe(social!.id);
  });

  it("5. a entrega pronta NÃO pinga sozinha no portal", async () => {
    const aprovacoes = await prisma.approvalRequest.findMany({ where: { clientRequestId } });
    expect(aprovacoes.length).toBeGreaterThan(0);
    expect(aprovacoes.every((a) => a.clientVisible === false)).toBe(true);

    // Só a mensagem de direção existe até aqui — nada de entrega solta.
    const msgs = await prisma.portalMessage.findMany({ where: { clientRequestId } });
    expect(msgs.filter((m) => m.body.includes("está pronta"))).toHaveLength(0);
  });

  it("6. com tudo pronto, a esteira aponta para o PM apresentar", async () => {
    const status = await statusDoProjeto(projectId);
    expect(status?.leitura.fase).toBe("revisao_interna");
    expect(status?.leitura.responsavel).toBe("pm");
  });

  it("7. o PM apresenta de uma vez, e aí o cliente enxerga", async () => {
    const r = await apresentar(projectId);
    expect(r.ok).toBe(true);

    const aprovacoes = await prisma.approvalRequest.findMany({ where: { clientRequestId } });
    expect(aprovacoes.every((a) => a.clientVisible === true)).toBe(true);

    const msgs = await prisma.portalMessage.findMany({ where: { clientRequestId }, orderBy: { createdAt: "asc" } });
    const apresentacao = msgs.at(-1)!;
    expect(apresentacao.authorName).toBe("Gerente de projeto");
    expect(apresentacao.body).toContain("Pacote de conteúdo");

    const status = await statusDoProjeto(projectId);
    expect(status?.leitura.fase).toBe("aprovacao_cliente");
    expect(status?.leitura.paraCliente.oQueEsperamosDeVoce.length).toBeGreaterThan(10);
  });

  it("8. o aval do cliente abre o ciclo mensal — a rotina começa sozinha", async () => {
    const r = await aprovarPacote(projectId);
    expect(r.ok).toBe(true);

    const ciclos = await prisma.cycle.findMany({ where: { projectId } });
    expect(ciclos).toHaveLength(1);
    expect(ciclos[0]!.status).toBe("aberto");
    // O plano do mês ficou congelado na abertura.
    expect(JSON.parse(ciclos[0]!.planJson)).toHaveLength(1);

    const status = await statusDoProjeto(projectId);
    expect(status?.leitura.fase).toBe("ciclo");
  });

  it("9. a leitura final é compreensível pelas duas plateias", async () => {
    const status = await statusDoProjeto(projectId);
    expect(status?.leitura.paraEquipe.agora.length).toBeGreaterThan(15);
    expect(status?.leitura.paraCliente.agora.length).toBeGreaterThan(15);
    expect(status?.leitura.paraCliente.agora).not.toMatch(/entregável|canvas|executionStatus|agentId/i);
    expect(status?.leitura.progresso).toBe(100);
  });

  it("10. rodar o motor de novo não duplica nada — a esteira é idempotente", async () => {
    const antes = await prisma.deliverable.count({ where: { projectId } });
    await runProjectExecution(projectId);
    const depois = await prisma.deliverable.count({ where: { projectId } });
    expect(depois).toBe(antes);
  });
});
