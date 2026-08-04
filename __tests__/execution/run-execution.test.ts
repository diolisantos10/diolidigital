import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks das dependências do núcleo.
const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  client: { findFirst: vi.fn() },
  brainArtifact: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  portalMessage: { create: vi.fn() },
  task: { updateMany: vi.fn() },
  materialRequest: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  activityEvent: { create: vi.fn() },
  cycle: { findFirst: vi.fn() },
}));
const generate = vi.hoisted(() => vi.fn());
const createApprovalRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/generate", () => ({ generate }));
vi.mock("@/lib/agency/persistence/approval-service", () => ({ createApprovalRequest }));
// O maestro (PM) é testado à parte — aqui devolve um plano fixo pra isolar o motor.
vi.mock("@/lib/agency/execution/pm-conductor", () => ({
  planProduction: vi.fn(async () => ({ orderedDepartments: ["social-media"], goal: "g", warnings: [], pmMode: "rule_based" })),
}));
// Qualidade é testada à parte; aqui devolve parecer "pass" (sombra, não bloqueia).
vi.mock("@/lib/agency/execution/quality-auditor", () => ({
  auditDeliverable: vi.fn(async () => ({ verdict: "pass", issues: [], note: "ok" })),
}));
// Biblioteca do Radar é testada à parte; aqui não injeta nada.
// A apresentação automática é testada aqui pelo CONTRATO (foi chamada? foi
// barrada?); o conteúdo da apresentação é testado em marcos/jornada-real.
vi.mock("@/lib/agency/esteira/marcos", () => ({
  apresentar: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/agency/esteira/mes", () => ({
  apresentarCiclo: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/agency/radar/library", () => ({
  getActiveInsights: vi.fn(async () => []),
  buildInsightBlock: vi.fn(() => ""),
}));
// A leitura do feed real é testada à parte (leitura-do-cliente.test.ts). Aqui o
// contrato: o motor pede a síntese UMA vez e o texto dela entra no contexto de
// todo especialista — inclusive a degradação declarada.
const sinteseDoFeedDoCliente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ sinteseDoFeedDoCliente }));

import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { auditDeliverable } from "@/lib/agency/execution/quality-auditor";
import * as marcos from "@/lib/agency/esteira/marcos";
import * as mes from "@/lib/agency/esteira/mes";

const baseProject = {
  id: "p1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  agents: JSON.stringify(["a3"]), executionStatus: "idle", executionStartedAt: null, executionRequestedAt: null,
  // O portão de direção: a produção só roda com o aval do cliente. Um projeto
  // em produção necessariamente já passou por ele.
  directionApprovedAt: new Date("2026-08-01"),
};

// O que o cliente ainda deve — cada teste ajusta se precisar.
let materiaisPendentes: Array<Record<string, unknown>> = [];

beforeEach(() => {
  vi.clearAllMocks();
  materiaisPendentes = [];
  db.project.update.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", businessName: "Loja X", services: JSON.stringify(["social"]), objectives: "[]", briefingJson: "{}" });
  db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
  db.brainArtifact.findMany.mockResolvedValue([]);
  db.deliverable.findMany.mockResolvedValue([]);
  db.cycle.findFirst.mockResolvedValue(null);
  db.deliverable.create.mockResolvedValue({ id: "d1" });
  db.deliverable.count.mockResolvedValue(0);
  db.deliverable.update.mockResolvedValue({});
  db.portalMessage.create.mockResolvedValue({});
  db.task.updateMany.mockResolvedValue({ count: 1 });
  db.materialRequest.findFirst.mockResolvedValue(null);
  db.materialRequest.create.mockResolvedValue({ id: "mr1" });
  // Duas perguntas diferentes usam este mesmo findMany: "o que o cliente já
  // entregou?" (status != pending) e "o que está pendente para eu cobrar?".
  // Responder a mesma lista para as duas faria o teste mentir.
  db.materialRequest.findMany.mockImplementation(async (args?: { where?: { status?: unknown } }) => {
    const status = args?.where?.status;
    const perguntaOQueJaVeio = typeof status === "object" && status !== null && "not" in status;
    return perguntaOQueJaVeio ? [] : materiaisPendentes;
  });
  db.materialRequest.updateMany.mockResolvedValue({ count: 0 });
  createApprovalRequest.mockResolvedValue({});
  db.activityEvent.create.mockResolvedValue({});
  sinteseDoFeedDoCliente.mockResolvedValue({
    lida: false,
    texto: "FEED REAL DO CLIENTE (Instagram): feed não lido: o cliente ainda não conectou o Instagram. PROIBIDO descrever o estilo atual do perfil.",
    estiloVisual: "",
  });
  (marcos.apresentar as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe("runProjectExecution — produção durável e confiável", () => {
  it("produz a entrega e marca o projeto como 'done'", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "Pacote Social", summary: "resumo", items: [{ format: "feed", headline: "Oi", caption: "legenda bem completa aqui", visual: "foto" }] } });

    const r = await runProjectExecution("p1");
    expect(r.ok).toBe(true);
    // O rótulo agora diz a casa E o especialista — é isso que o CEO lê no relatório.
    expect(r.produced).toContain("Social Media \u00b7 Pauta do m\u00eas");
    expect(r.produced).toContain("Social Media \u00b7 Roteiro de v\u00eddeo");
    expect(db.deliverable.create).toHaveBeenCalled();
    // marcou running no começo e done no fim
    const statuses = db.project.update.mock.calls.map((c) => c[0].data.executionStatus);
    expect(statuses).toContain("running");
    expect(statuses).toContain("done");
  });

  it("Qualidade reprovou → agente REVISA e reentrega a MELHOR versão (loop de correção)", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    const auditMock = auditDeliverable as unknown as ReturnType<typeof vi.fn>;
    auditMock.mockResolvedValueOnce({ verdict: "flag", issues: ["clichê vazio"], note: "revisar" })
             .mockResolvedValueOnce({ verdict: "pass", issues: [], note: "melhorou" });
    generate.mockResolvedValue({ ok: true, data: { title: "Pacote", summary: "s", items: [{ format: "feed", headline: "Oi", caption: "legenda bem completa aqui", visual: "foto" }] } });

    const r = await runProjectExecution("p1");
    // Social Media tem 3 especialistas: 3 gerações + 1 revisão do que foi reprovado.
    expect(generate).toHaveBeenCalledTimes(4);
    // Cada especialista publica UMA peça — a melhor versão dele, nunca as duas.
    expect(db.deliverable.create).toHaveBeenCalledTimes(3);
    expect(r.produced).toHaveLength(3);
  });

  it("IA indisponível → NÃO perde: marca 'failed' pra o cron re-tentar", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: false });
    const r = await runProjectExecution("p1");
    expect(r.status).toBe("failed");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    const last = db.project.update.mock.calls.at(-1)?.[0].data;
    expect(last.executionStatus).toBe("failed");
  });

  it("gate de saída: resposta curta/vazia é barrada (não chega ao cliente)", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "X", summary: "", items: [] } });
    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.skipped.join(" ")).toMatch(/insuficiente/);
  });

  it("idempotente POR ESPECIALISTA: quem já entregou é pulado, os colegas continuam", async () => {
    // Esta é a diferença que a estrutura departamento-equipe trouxe. Se a
    // idempotência continuasse por departamento, o primeiro especialista a
    // entregar calaria os outros dois — e o cliente receberia um terço do
    // trabalho achando que recebeu tudo.
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    db.deliverable.findMany.mockResolvedValue([{ ownerAgentId: "a3" }]); // só a Pauta já foi feita
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });

    const r = await runProjectExecution("p1");
    expect(r.produced).not.toContain("Social Media \u00b7 Pauta do m\u00eas");
    expect(r.produced).toContain("Social Media \u00b7 Copy dos posts");
    expect(r.produced).toContain("Social Media \u00b7 Roteiro de v\u00eddeo");
  });

  it("idempotente: departamento inteiro já entregue → ninguém reproduz", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    db.deliverable.findMany.mockResolvedValue([
      { ownerAgentId: "a3" }, { ownerAgentId: "social-copy" }, { ownerAgentId: "social-roteiro-video" },
    ]);
    const r = await runProjectExecution("p1");
    expect(generate).not.toHaveBeenCalled();
    expect(r.produced).toHaveLength(0);
  });

  it("anti-concorrência: já rodando há pouco → não roda de novo", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, executionStatus: "running", executionStartedAt: new Date() });
    const r = await runProjectExecution("p1");
    expect(r.status).toBe("skipped_running");
    expect(generate).not.toHaveBeenCalled();
  });

  it("projeto sem solicitação vinculada → falha limpa", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, clientRequestId: null });
    const r = await runProjectExecution("p1");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/solicita/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  A ESTEIRA: o portão de direção, a tarefa que anda, e uma voz para o cliente
// ─────────────────────────────────────────────────────────────────────────────

describe("o portão de direção", () => {
  it("sem o aval do cliente, a produção NÃO começa", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, directionApprovedAt: null });
    const r = await runProjectExecution("p1");
    expect(generate).not.toHaveBeenCalled();
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.error).toMatch(/direção/i);
  });

  it("não deixa o projeto marcado como falho — ele está esperando, não quebrado", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, directionApprovedAt: null });
    await runProjectExecution("p1");
    const ultimo = db.project.update.mock.calls.at(-1)?.[0].data;
    expect(ultimo.executionStatus).toBe("idle");
    expect(ultimo.executionError).toBeNull();
  });

  it("com o aval, a produção roda normalmente", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    const r = await runProjectExecution("p1");
    expect(r.produced).toContain("Social Media \u00b7 Pauta do m\u00eas");
  });
});

describe("a tarefa segue a produção", () => {
  it("produzindo → em revisão → entregue, ligada ao entregável", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    await runProjectExecution("p1");

    const estados = db.task.updateMany.mock.calls.map((c) => c[0].data.status);
    // Cada especialista percorre o mesmo caminho, um depois do outro. Três
    // especialistas em Social Media = a sequência repetida três vezes.
    expect(estados).toEqual([
      "in_progress", "review", "done",
      "in_progress", "review", "done",
      "in_progress", "review", "done",
    ]);

    const fechamento = db.task.updateMany.mock.calls.at(-1)?.[0].data;
    expect(fechamento.deliverableId).toBe("d1");
  });

  it("IA fora do ar devolve a tarefa para a fila — não fica presa em produzindo", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: false });
    await runProjectExecution("p1");
    expect(db.task.updateMany.mock.calls.at(-1)?.[0].data.status).toBe("pending");
  });

  it("falta de material bloqueia a tarefa em vez de deixá-la parecendo ativa", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null }); // sem assets de marca
    await runProjectExecution("p1");
    const estados = db.task.updateMany.mock.calls.map((c) => c[0].data.status);
    expect(estados).toContain("blocked");
  });
});

describe("uma voz para o cliente", () => {
  it("o agente ABRE pedido — não manda mensagem por conta própria", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
    materiaisPendentes = [
      { id: "mr1", type: "design", description: "precisamos do logo e das cores", requestedByLabel: "Design", askedClientAt: null },
    ];

    const r = await runProjectExecution("p1");
    expect(db.materialRequest.create).toHaveBeenCalled();
    expect(r.askedClient).toContain("Design \u00b7 Identidade visual");
  });

  it("quem fala com o cliente é o gerente de projeto, uma vez só", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
    materiaisPendentes = [
      { id: "mr1", type: "design", description: "precisamos do logo e das cores", requestedByLabel: "Design", askedClientAt: null },
    ];

    await runProjectExecution("p1");
    const mensagens = db.portalMessage.create.mock.calls.map((c) => c[0].data);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0].authorName).toBe("Gerente de projeto");
  });

  it("a entrega pronta NÃO pinga sozinha no portal do cliente", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    await runProjectExecution("p1");
    expect(db.portalMessage.create).not.toHaveBeenCalled();
    expect(createApprovalRequest.mock.calls[0][0].clientVisible).toBe(false);
  });
});

// O elo que fechou a agência 24h: a produção acabou, quem apresenta é o próprio
// PM. Antes disso o pacote ficava pronto DENTRO da agência esperando um clique.
describe("o PM apresenta sozinho quando o pacote fecha", () => {
  it("pacote inteiro e sem ressalva → apresenta sem ninguém clicar", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });

    const r = await runProjectExecution("p1");
    expect(r.apresentado?.ok).toBe(true);
    expect(marcos.apresentar).toHaveBeenCalledWith("p1");
  });

  it("a Qualidade barrou → NÃO apresenta, e o bloqueio fica registrado", async () => {
    // O freio que faltava. Peça que a própria casa sabe que está torta não
    // chega ao cliente só porque não havia ninguém olhando.
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    (marcos.apresentar as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, erro: "2 entrega(s) com ressalva da Qualidade" });

    const r = await runProjectExecution("p1");
    expect(r.apresentado?.ok).toBe(false);
    // Retorno de função ninguém lê. O bloqueio precisa existir no banco.
    expect(db.activityEvent.create).toHaveBeenCalled();
    const ev = db.activityEvent.create.mock.calls.at(-1)?.[0].data;
    expect(ev.type).toBe("apresentacao_bloqueada");
    expect(ev.message).toMatch(/ressalva/i);
  });

  it("faltando material do cliente → NÃO apresenta metade do pacote", async () => {
    // "Eu te mostro tudo de uma vez" é promessa. Apresentar o que ficou pronto
    // enquanto o resto espera material quebra a promessa e confunde o cliente.
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });

    const r = await runProjectExecution("p1");
    expect(r.askedClient.length).toBeGreaterThan(0);
    expect(r.apresentado).toBeUndefined();
    expect(marcos.apresentar).not.toHaveBeenCalled();
  });

  it("IA fora do ar → não apresenta pacote furado", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: false });
    const r = await runProjectExecution("p1");
    expect(r.apresentado).toBeUndefined();
    expect(marcos.apresentar).not.toHaveBeenCalled();
  });
});

// O P0 da casa: até aqui, "nada impedia uma peça errada de sair". O piso de
// verdade é o primeiro freio que roda em código, não depende de IA e BLOQUEIA.
describe("o piso de verdade barra dado inventado antes do cliente", () => {
  it("telefone inventado → o especialista refaz, e a versão limpa é publicada", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate
      .mockResolvedValueOnce({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "Reserve", caption: "Ligue (11) 91234-5678 e reserve sua mesa hoje mesmo." }] } })
      .mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "Reserve", caption: "Reserve sua mesa pelo canal oficial da casa, sem complicação." }] } });

    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).toHaveBeenCalled();
    const publicado = db.deliverable.create.mock.calls[0]![0].data.content as string;
    expect(publicado, "o telefone inventado não pode sobreviver").not.toMatch(/91234-5678/);
    expect(r.barradosNoPiso ?? []).toHaveLength(0);
  });

  it("insistiu na invenção → NÃO publica, e o bloqueio fica registrado", async () => {
    // Este é o ponto exato em que a casa deixa de ser "sai de qualquer jeito".
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "Reserve", caption: "Garantimos 80% mais vendas já no primeiro mês, sem esforço nenhum." }] } });

    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.barradosNoPiso!.length).toBeGreaterThan(0);
    expect(r.barradosNoPiso![0]!.violacoes).toContain("promessa_de_resultado");

    const ev = db.activityEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(ev, "bloqueio precisa existir no banco, não só no retorno").toContain("piso_de_verdade_barrou");
  });

  it("peça barrada não conta como pronta — o pacote não é apresentado", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "X", caption: "Nosso CNPJ é 12.345.678/0001-90, fale com a gente quando quiser." }] } });

    const r = await runProjectExecution("p1");
    expect(r.status).toBe("failed");
    expect(marcos.apresentar).not.toHaveBeenCalled();
  });

  it("o dado REAL do cliente passa sem revisão — o piso não atrapalha o trabalho", async () => {
    db.clientRequestDb.findUnique.mockResolvedValue({
      id: "cr1", businessName: "Loja X", services: JSON.stringify(["social"]), objectives: "[]",
      briefingJson: JSON.stringify({ scope: { prospectPhone: "(11) 98940-0692" } }),
    });
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "Fale", caption: "Chame no WhatsApp (11) 98940-0692 e a gente responde rapidinho." }] } });

    const r = await runProjectExecution("p1");
    expect(r.barradosNoPiso ?? []).toHaveLength(0);
    // Uma chamada de IA por especialista e MAIS NENHUMA: nenhuma correção foi
    // pedida, porque o telefone era o de verdade. É isto que separa um freio
    // útil de um que reprova tudo e acaba desligado.
    expect(generate).toHaveBeenCalledTimes(r.produced.length);
  });
});

// Achado em produção: depois do destravamento, a passada seguinte não produz
// nada (tudo já existe) e o pacote PRONTO não era apresentado. Exigir produção
// nova fazia a apresentação depender de coincidência.
describe("o pacote pronto é apresentado mesmo sem produção nova", () => {
  it("tudo já produzido antes → apresenta assim mesmo", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    // Todos os especialistas de Social já entregaram numa passada anterior.
    db.deliverable.findMany.mockResolvedValue([
      { ownerAgentId: "a3" }, { ownerAgentId: "social-copy" }, { ownerAgentId: "social-roteiro-video" },
    ]);
    db.deliverable.count.mockResolvedValue(3);

    const r = await runProjectExecution("p1");
    expect(r.produced).toHaveLength(0);
    expect(marcos.apresentar, "o pacote está pronto — tem que ir").toHaveBeenCalledWith("p1");
    expect(r.apresentado?.ok).toBe(true);
  });

  it("projeto sem entrega nenhuma → não apresenta pacote vazio", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["zzz"]) });
    db.deliverable.findMany.mockResolvedValue([
      { ownerAgentId: "a3" }, { ownerAgentId: "social-copy" }, { ownerAgentId: "social-roteiro-video" },
    ]);
    db.deliverable.count.mockResolvedValue(0);

    const r = await runProjectExecution("p1");
    expect(r.apresentado).toBeUndefined();
    expect(marcos.apresentar).not.toHaveBeenCalled();
  });
});

// O pedido literal do CEO (04/08/2026): "você precisa ler a rede social, ver os
// posts que estão lá, antes de fazer os carrosséis". A leitura acontece UMA vez
// por execução e o resultado — síntese ou degradação — vai a TODOS.
describe("a leitura minuciosa do cliente entra na produção", () => {
  it("o motor pede a síntese UMA vez, com o trio workspace/cliente/solicitação", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    await runProjectExecution("p1");
    expect(sinteseDoFeedDoCliente).toHaveBeenCalledTimes(1);
    expect(sinteseDoFeedDoCliente).toHaveBeenCalledWith("ws1", "c1", "cr1");
  });

  it("com o feed lido, a síntese entra no prompt de TODOS os especialistas", async () => {
    sinteseDoFeedDoCliente.mockResolvedValue({
      lida: true,
      texto: "FEED REAL DO CLIENTE (Instagram, 24 posts lidos em 2026-08-04):\n- Formatos publicados: 50% carrossel\n- Tom das legendas: próximo e direto",
      estiloVisual: "close de produto com luz quente",
    });
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    await runProjectExecution("p1");
    for (const call of generate.mock.calls) {
      expect(call[0].user as string).toContain("FEED REAL DO CLIENTE");
    }
  });

  it("sem conexão, a DEGRADAÇÃO declarada também vai — proibindo inferir estilo", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    await runProjectExecution("p1");
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toContain("feed não lido");
    expect(user).toMatch(/PROIBIDO/);
  });

  it("a falta de feed NUNCA trava a produção", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
    const r = await runProjectExecution("p1");
    expect(r.ok).toBe(true);
    expect(r.produced.length).toBeGreaterThan(0);
  });
});

// O bug invisivel: o motor lia `scope.hasRawMaterial`, campo que NENHUM codigo
// escreve. O briefing guarda a mesma coisa dentro de `social`, com outro nome.
// Resultado: a dona do salao dizia que tinha os videos e a agencia mandava ela
// gravar os videos que ela ja tinha.
describe("o motor entende o que o briefing REALMENTE grava sobre material", () => {
  function comEscopo(social: Record<string, unknown>) {
    db.clientRequestDb.findUnique.mockResolvedValue({
      id: "cr1", businessName: "Salão da Bia", services: JSON.stringify(["social"]), objectives: "[]",
      briefingJson: JSON.stringify({ scope: { social } }),
    });
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: true, data: { title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] } });
  }
  const promptDoVideo = () =>
    (generate.mock.calls.map((c) => c[0].user as string).find((u) => u.includes("ROTEIRO DE VÍDEO")) ?? "");

  it("cliente disse que TEM fotos/vídeos → roteiro de EDIÇÃO do material dela", async () => {
    comEscopo({ hasPhotos: true });
    await runProjectExecution("p1");
    expect(promptDoVideo(), "ela mandou o material — não peça para ela gravar").toMatch(/EDIÇÃO/);
  });

  it("cliente TEM quem grave → também conta como material próprio", async () => {
    comEscopo({ hasVideomaker: true });
    await runProjectExecution("p1");
    expect(promptDoVideo()).toMatch(/EDIÇÃO/);
  });

  it("cliente pediu que a Dioli produza → roteiro para GRAVAR, e essa resposta ganha", async () => {
    // Resposta explícita do cliente vence qualquer outro sinal.
    comEscopo({ hasPhotos: true, needsVideoProduction: true });
    await runProjectExecution("p1");
    expect(promptDoVideo()).toMatch(/GRAVAR/);
  });

  it("briefing sem nada sobre material → assume que não tem, que é o seguro", async () => {
    comEscopo({});
    await runProjectExecution("p1");
    expect(promptDoVideo()).toMatch(/GRAVAR/);
  });
});

describe("o mês 2 existe — a idempotência é por CICLO, não pela vida inteira", () => {
  // O furo mais caro da casa: a chave era `ownerAgentId` por PROJETO e valia
  // para sempre. O cliente vitalício pagava todo mês e recebia uma entrega na
  // vida — no mês 2 o motor via "todos já produziram" e não fazia nada. Cada
  // peça passava no seu teste; a operação contínua é que não existia.
  it("procura entregas do ciclo ABERTO, não do projeto inteiro", async () => {
    db.cycle.findFirst.mockResolvedValue({
      id: "cy2", reference: "2026-09", status: "aberto",
      startsOn: "2026-09-01", endsOn: "2026-09-30", planJson: "[]", summary: null,
    });
    await runProjectExecution("p1");
    const consulta = db.deliverable.findMany.mock.calls.find((c) => c[0]?.select?.ownerAgentId);
    expect(consulta![0].where.cycleId).toBe("cy2");
  });

  it("entrega do mês 1 não impede a produção do mês 2", async () => {
    db.cycle.findFirst.mockResolvedValue({
      id: "cy2", reference: "2026-09", status: "aberto",
      startsOn: "2026-09-01", endsOn: "2026-09-30", planJson: "[]", summary: null,
    });
    // O ciclo novo está vazio — o mês 1 ficou carimbado em cy1.
    db.deliverable.findMany.mockResolvedValue([]);
    await runProjectExecution("p1");
    expect(db.deliverable.create).toHaveBeenCalled();
    expect(db.deliverable.create.mock.calls[0]![0].data.cycleId).toBe("cy2");
  });

  it("dentro de um ciclo, quem apresenta é o CICLO — o carimbo do projeto já foi usado", async () => {
    db.cycle.findFirst.mockResolvedValue({
      id: "cy2", reference: "2026-09", status: "aberto",
      startsOn: "2026-09-01", endsOn: "2026-09-30", planJson: "[]", summary: null,
    });
    await runProjectExecution("p1");
    expect(mes.apresentarCiclo).toHaveBeenCalledWith("p1", "cy2");
    expect(marcos.apresentar).not.toHaveBeenCalled();
  });

  it("no pacote inicial (sem ciclo) quem apresenta continua sendo o projeto", async () => {
    db.cycle.findFirst.mockResolvedValue(null);
    await runProjectExecution("p1");
    expect(marcos.apresentar).toHaveBeenCalledWith("p1");
    expect(mes.apresentarCiclo).not.toHaveBeenCalled();
  });
});
