import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// Mocks das dependências do núcleo.
const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  clientRequestDb: { findUnique: vi.fn() },
  client: { findFirst: vi.fn(), findUnique: vi.fn() },
  // `findFirst` é a gaveta das PROIBIÇÕES do cliente (`esteira/proibicoes.ts`).
  // Ausente, a leitura falha e o piso REPROVA toda peça por fail-closed — certo,
  // mas não é o que esta suíte mede. Nulo = "este cliente não proibiu nada".
  brainArtifact: { findMany: vi.fn(), findFirst: vi.fn(() => Promise.resolve(null)) },
  deliverable: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
  portalMessage: { create: vi.fn() },
  task: { updateMany: vi.fn() },
  materialRequest: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  activityEvent: { create: vi.fn() },
  cycle: { findFirst: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
  // A escada de exposição: o motor ALIMENTA o contador dela a cada peça —
  // inclusive as barradas, que nunca viram `Deliverable`.
  departmentLadder: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  departmentLadderRecord: { create: vi.fn(), findMany: vi.fn() },
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
// Qualidade: só o JUIZ é dublê. A tradução veredito → `revisionStatus` vem do
// módulo real de propósito — é a regra que impede "não auditado" de virar
// "aprovado", e dublá-la faria o teste passar mesmo com o bug de volta.
vi.mock("@/lib/agency/execution/quality-auditor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agency/execution/quality-auditor")>()),
  auditDeliverable: vi.fn(async () => ({ verdict: "aprovado", issues: [], note: "ok" })),
}));
// Biblioteca do Radar é testada à parte; aqui não injeta nada.
// A apresentação automática é testada aqui pelo CONTRATO (foi chamada? foi
// barrada?); o conteúdo da apresentação é testado em marcos/jornada-real.
vi.mock("@/lib/agency/esteira/marcos", () => ({
  apresentar: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/agency/esteira/mes", () => ({
  apresentarCiclo: vi.fn(async () => ({ ok: true })),
  // A versão da base de medição é REGRA, não mock: o motor precisa dela para
  // decidir se o número do mês passado ainda quer dizer a mesma coisa.
  VERSAO_DA_MEDICAO: 2,
  versaoDaMedicao: (m: { schemaVersao?: number } | null | undefined) =>
    (typeof m?.schemaVersao === "number" && Number.isFinite(m.schemaVersao) ? m.schemaVersao : 1),
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
// O kit de marca: a produção do logo tem testes próprios (logo.test.ts). Aqui o
// que se testa é a FIAÇÃO — o arquivo produzido vira ENTREGA que o cliente
// encontra, e a falha dessa entrega não pode sumir no silêncio.
const colherIdentidadeDaEntrega = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/execution/colher-identidade", () => ({ colherIdentidadeDaEntrega }));
const produzirKitDeMarca = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/execution/logo", () => ({
  produzirKitDeMarca,
  montarManual: () => "manual da marca",
  corValida: (c?: string | null) => c ?? null,
}));

import { runProjectExecution } from "@/lib/agency/execution/run-execution";
import { auditDeliverable } from "@/lib/agency/execution/quality-auditor";
import * as marcos from "@/lib/agency/esteira/marcos";
import * as mes from "@/lib/agency/esteira/mes";
import { planProduction } from "@/lib/agency/execution/pm-conductor";

/**
 * A entrega COMPLETA — a que cumpre o contrato de saída do especialista.
 *
 * Existe desde 05/08/2026, quando as instruções de contagem e formato que
 * viviam só no prompt ("6 a 8 peças", "1-2 carrossel, 2-3 story, 2-3 feed",
 * "cenas: 3 a 6 telas") passaram a ser conferidas em código
 * (`especialistas.ts: conferirContrato`). Uma peça só no `items` era exatamente
 * o cliente que contratou 8 posts e recebeu 1 — e nenhum teste enxergava isso.
 *
 * O teste declara SÓ o que ele quer provar; o resto é preenchido até o contrato.
 */
function noContrato(data: { title?: string; summary?: string; items?: Array<Record<string, unknown>> }) {
  const declaradas = (data.items ?? []).map((i) => ({ format: "feed", ...i }));
  const conta = (f: string) => declaradas.filter((i) => String(i.format).includes(f)).length;
  const enchimento: Array<Record<string, unknown>> = [];
  for (let i = conta("carrossel"); i < 1; i++) {
    enchimento.push({ format: "carrossel", headline: `C${i}`, caption: "legenda de carrossel bem completa aqui", cenas: "1) primeira tela · 2) segunda tela · 3) terceira tela" });
  }
  for (let i = conta("story"); i < 2; i++) enchimento.push({ format: "story", headline: `S${i}`, caption: "legenda de story bem completa aqui" });
  for (let i = conta("feed"); i < 3; i++) enchimento.push({ format: "feed", headline: `F${i}`, caption: "legenda de feed bem completa aqui" });
  return { ok: true, data: { title: data.title ?? "T", summary: data.summary ?? "s", items: [...declaradas, ...enchimento] } };
}

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
  // ── DUBLÊ FIEL DA TRAVA ATÔMICA ──────────────────────────────────────────
  // A trava passou a ser um `updateMany` com o estado esperado no WHERE: quem
  // roda é quem viu `count: 1`. Um dublê que sempre devolve 1 testaria o freio
  // contra nada, então este reproduz a condição real do WHERE contra o projeto
  // que o teste declarou.
  db.project.updateMany.mockImplementation(async (args: { where?: { OR?: Array<Record<string, unknown>> } }) => {
    const p = await Promise.resolve(db.project.findUnique.mock.results.at(-1)?.value) as
      | { executionStatus?: string; executionStartedAt?: Date | null } | undefined;
    if (!p) return { count: 1 };
    const limite = (args?.where?.OR?.[2] as { executionStartedAt?: { lt?: Date } } | undefined)?.executionStartedAt?.lt;
    const rodandoAgora =
      p.executionStatus === "running" && !!p.executionStartedAt && !!limite && p.executionStartedAt >= limite;
    return { count: rodandoAgora ? 0 : 1 };
  });
  db.deliverable.findFirst.mockResolvedValue(null);
  db.mediaAsset.findMany.mockResolvedValue([]);
  db.departmentLadder.findUnique.mockResolvedValue({ degrau: "sombra" });
  db.departmentLadder.findMany.mockResolvedValue([]);
  db.departmentLadderRecord.create.mockResolvedValue({});
  db.clientRequestDb.findUnique.mockResolvedValue({ id: "cr1", businessName: "Loja X", services: JSON.stringify(["social"]), objectives: "[]", briefingJson: "{}" });
  db.client.findFirst.mockResolvedValue({ id: "c1", name: "Loja X", brandBrain: null });
  db.client.findUnique.mockResolvedValue({ brandBrain: null, industry: "varejo" });
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
  colherIdentidadeDaEntrega.mockResolvedValue({ encontrouEntrega: false });
  produzirKitDeMarca.mockResolvedValue({ arquivos: [] });
  (marcos.apresentar as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe("runProjectExecution — produção durável e confiável", () => {
  it("produz a entrega e marca o projeto como 'done'", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({ title: "Pacote Social", summary: "resumo", items: [{ format: "feed", headline: "Oi", caption: "legenda bem completa aqui", visual: "foto" }] }));

    const r = await runProjectExecution("p1");
    expect(r.ok).toBe(true);
    // O rótulo agora diz a casa E o especialista — é isso que o CEO lê no relatório.
    expect(r.produced).toContain("Social Media \u00b7 Pauta do m\u00eas");
    expect(r.produced).toContain("Social Media \u00b7 Roteiro de v\u00eddeo");
    expect(db.deliverable.create).toHaveBeenCalled();
    // marcou running no começo (pelo `updateMany` da trava atômica) e done no fim
    const travas = db.project.updateMany.mock.calls.map((c) => c[0].data.executionStatus);
    expect(travas).toContain("running");
    const statuses = db.project.update.mock.calls.map((c) => c[0].data.executionStatus);
    expect(statuses).toContain("done");
  });

  it("Qualidade reprovou → agente REVISA e reentrega a MELHOR versão (loop de correção)", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    const auditMock = auditDeliverable as unknown as ReturnType<typeof vi.fn>;
    auditMock.mockResolvedValueOnce({ verdict: "reprovado", issues: ["clichê vazio"], note: "revisar" })
             .mockResolvedValueOnce({ verdict: "aprovado", issues: [], note: "melhorou" });
    generate.mockResolvedValue(noContrato({ title: "Pacote", summary: "s", items: [{ format: "feed", headline: "Oi", caption: "legenda bem completa aqui", visual: "foto" }] }));

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
    // `items: []` não passa nem pelo contrato de saída nem pelo tamanho mínimo.
    // Quem barra primeiro é o contrato — e o que o teste garante é o efeito:
    // resposta oca NÃO vira entrega.
    generate.mockResolvedValue({ ok: true, data: { title: "X", summary: "", items: [] } });
    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.skipped.join(" ")).toMatch(/insuficiente|contrato/);
  });

  it("idempotente POR ESPECIALISTA: quem já entregou é pulado, os colegas continuam", async () => {
    // Esta é a diferença que a estrutura departamento-equipe trouxe. Se a
    // idempotência continuasse por departamento, o primeiro especialista a
    // entregar calaria os outros dois — e o cliente receberia um terço do
    // trabalho achando que recebeu tudo.
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    db.deliverable.findMany.mockResolvedValue([{ ownerAgentId: "a3" }]); // só a Pauta já foi feita
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));

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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
    const r = await runProjectExecution("p1");
    expect(r.produced).toContain("Social Media \u00b7 Pauta do m\u00eas");
  });
});

describe("a tarefa segue a produção", () => {
  it("produzindo → em revisão → entregue, ligada ao entregável", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "resumo", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));

    const r = await runProjectExecution("p1");
    expect(r.apresentado?.ok).toBe(true);
    expect(marcos.apresentar).toHaveBeenCalledWith("p1");
  });

  it("a Qualidade barrou → NÃO apresenta, e o bloqueio fica registrado", async () => {
    // O freio que faltava. Peça que a própria casa sabe que está torta não
    // chega ao cliente só porque não havia ninguém olhando.
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));

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

// ── AS DUAS METADES DO FREIO (04/08/2026) ───────────────────────────────────
// Reprovação BLOQUEIA · indisponibilidade NÃO bloqueia, mas fica declarada.
// Antes, as duas eram o mesmo `pass`: o árbitro dizia "sim" na dúvida e o "não"
// dele não parava nada.
describe("reprovação bloqueia, indisponibilidade não", () => {
  const PECA_BOA = noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] });
  const auditMock = () => auditDeliverable as unknown as ReturnType<typeof vi.fn>;

  /** Dublê fiel de `marcos.apresentar`: recusa enquanto existir `quality_flag`
   *  gravado — que é literalmente a regra de `marcos.ts:175`. Um dublê que
   *  sempre diz "ok" testaria o freio contra nada. */
  function apresentarComOGateReal() {
    (marcos.apresentar as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      const flags = db.deliverable.create.mock.calls.filter((c) => c[0]?.data?.revisionStatus === "quality_flag");
      return flags.length > 0
        ? { ok: false, erro: `${flags.length} entrega(s) com ressalva da Qualidade. Resolva antes de mostrar ao cliente.` }
        : { ok: true };
    });
  }

  it("REPROVADA depois de esgotar as revisões → grava quality_flag, NÃO apresenta e registra o bloqueio", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(PECA_BOA);
    // Reprova sempre: a revisão acontece e o juiz continua reprovando.
    auditMock().mockResolvedValue({ verdict: "reprovado", issues: ["promete resultado garantido"], note: "revisar" });
    apresentarComOGateReal();

    const r = await runProjectExecution("p1");

    // A peça CONTINUA sendo gravada — é o registro em quality_flag que faz
    // `pacote-travado.ts` achá-la, refazer e escalar. O que trava é a vitrine.
    const criadas = db.deliverable.create.mock.calls.map((c) => c[0].data);
    expect(criadas.length).toBeGreaterThan(0);
    expect(criadas.every((d) => d.revisionStatus === "quality_flag")).toBe(true);

    // O bloqueio é REAL: o cliente não vê.
    expect(r.apresentado?.ok).toBe(false);
    expect(r.reprovadosPelaQualidade?.length).toBe(criadas.length);

    // E é VISÍVEL: dois registros no banco, não um campo que ninguém abre.
    const tipos = db.activityEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(tipos).toContain("qualidade_reprovou");
    expect(tipos).toContain("apresentacao_bloqueada");
    // Nenhuma peça reprovada pode aparecer como aprovada em contagem nenhuma.
    expect(r.qualityAudit?.some((q) => q.verdict === "aprovado")).toBe(false);
  });

  it("APROVADA → apresenta normalmente (a trava não pode matar o fluxo bom)", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(PECA_BOA);
    auditMock().mockResolvedValue({ verdict: "aprovado", issues: [], note: "ok" });
    apresentarComOGateReal();

    const r = await runProjectExecution("p1");
    const criadas = db.deliverable.create.mock.calls.map((c) => c[0].data);
    expect(criadas.every((d) => d.revisionStatus === "quality_ok")).toBe(true);
    expect(r.apresentado?.ok).toBe(true);
    expect(r.reprovadosPelaQualidade).toEqual([]);
    expect(r.naoAuditados).toEqual([]);
    const tipos = db.activityEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(tipos).not.toContain("qualidade_reprovou");
    expect(tipos).not.toContain("qualidade_nao_auditou");
  });

  it.each([["ia_indisponivel"], ["timeout"], ["erro"], ["resposta_invalida"]])(
    "IA da Qualidade %s → nao_auditado: a peça SEGUE, o estado fica declarado e NADA conta como aprovado",
    async (motivo) => {
      db.project.findUnique.mockResolvedValue({ ...baseProject });
      generate.mockResolvedValue(PECA_BOA);
      auditMock().mockResolvedValue({ verdict: "nao_auditado", issues: [], note: "NÃO AUDITADA", motivo });
      apresentarComOGateReal();

      const r = await runProjectExecution("p1");
      const criadas = db.deliverable.create.mock.calls.map((c) => c[0].data);

      // A operação não para porque um provedor caiu.
      expect(criadas.length).toBeGreaterThan(0);
      expect(r.apresentado?.ok).toBe(true);

      // Mas "não auditado" NUNCA é "aprovado" — nem no banco, nem no retorno.
      expect(criadas.some((d) => d.revisionStatus === "quality_ok")).toBe(false);
      expect(criadas.every((d) => d.revisionStatus === "quality_nao_auditado")).toBe(true);
      expect(r.qualityAudit?.some((q) => q.verdict === "aprovado")).toBe(false);
      expect(r.naoAuditados?.length).toBe(criadas.length);
      expect(r.naoAuditados?.every((n) => n.motivo === motivo)).toBe(true);

      // Declarado no banco: é assim que se responde depois "quantas peças
      // foram ao cliente sem árbitro?".
      const eventos = db.activityEvent.create.mock.calls.map((c) => c[0].data);
      expect(eventos.filter((e) => e.type === "qualidade_nao_auditou").length).toBe(criadas.length);
      expect(eventos.find((e) => e.type === "qualidade_nao_auditou")?.message).toMatch(/NÃO é uma aprovação/);
    },
  );

  it("não auditado NÃO manda o especialista refazer — não há parecer para corrigir", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(PECA_BOA);
    auditMock().mockResolvedValue({ verdict: "nao_auditado", issues: [], note: "n/a", motivo: "erro" });

    await runProjectExecution("p1");
    // 3 especialistas de Social Media = 3 gerações. Nenhuma revisão extra.
    expect(generate).toHaveBeenCalledTimes(3);
    expect(auditDeliverable).toHaveBeenCalledTimes(3);
  });
});

// O P0 da casa: até aqui, "nada impedia uma peça errada de sair". O piso de
// verdade é o primeiro freio que roda em código, não depende de IA e BLOQUEIA.
describe("o piso de verdade barra dado inventado antes do cliente", () => {
  it("telefone inventado → o especialista refaz, e a versão limpa é publicada", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate
      .mockResolvedValueOnce(noContrato({ title: "T", summary: "s", items: [{ headline: "Reserve", caption: "Ligue (11) 91234-5678 e reserve sua mesa hoje mesmo." }] }))
      .mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "Reserve", caption: "Reserve sua mesa pelo canal oficial da casa, sem complicação." }] }));

    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).toHaveBeenCalled();
    const publicado = db.deliverable.create.mock.calls[0]![0].data.content as string;
    expect(publicado, "o telefone inventado não pode sobreviver").not.toMatch(/91234-5678/);
    expect(r.barradosNoPiso ?? []).toHaveLength(0);
  });

  it("insistiu na invenção → NÃO publica, e o bloqueio fica registrado", async () => {
    // Este é o ponto exato em que a casa deixa de ser "sai de qualquer jeito".
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "Reserve", caption: "Garantimos 80% mais vendas já no primeiro mês, sem esforço nenhum." }] }));

    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.barradosNoPiso!.length).toBeGreaterThan(0);
    expect(r.barradosNoPiso![0]!.violacoes).toContain("promessa_de_resultado");

    const ev = db.activityEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(ev, "bloqueio precisa existir no banco, não só no retorno").toContain("piso_de_verdade_barrou");
  });

  it("peça barrada não conta como pronta — o pacote não é apresentado", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "X", caption: "Nosso CNPJ é 12.345.678/0001-90, fale com a gente quando quiser." }] }));

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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "Fale", caption: "Chame no WhatsApp (11) 98940-0692 e a gente responde rapidinho." }] }));

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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
    await runProjectExecution("p1");
    for (const call of generate.mock.calls) {
      expect(call[0].user as string).toContain("FEED REAL DO CLIENTE");
    }
  });

  it("sem conexão, a DEGRADAÇÃO declarada também vai — proibindo inferir estilo", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
    await runProjectExecution("p1");
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toContain("feed não lido");
    expect(user).toMatch(/PROIBIDO/);
  });

  it("a falta de feed NUNCA trava a produção", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
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
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
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

// ─────────────────────────────────────────────────────────────────────────────
// O RESÍDUO DE OUTRA BASE DE MEDIÇÃO (re-auditoria de 04/08/2026).
//
// `alcance` e `engajamento` mudaram de SIGNIFICADO em 04/08/2026 (mes.ts,
// VERSAO_DA_MEDICAO): na v1, `alcance` era o reach de UM DIA. O prompt de
// otimização recebia o número cru sob o rótulo "números reais, medidos — use
// SOMENTE estes" e mandava CITAR o número. No mês 2, a peça diria ao cliente
// "no mês passado alcançamos 340 pessoas" para um mês em que 340 era um dia —
// subestimado ~30x — e TODAS as recomendações ficariam ancoradas nisso.
// ─────────────────────────────────────────────────────────────────────────────

describe("número de ciclo medido noutra base não entra no prompt de otimização", () => {
  const promptDeOtimizacao = () =>
    (generate.mock.calls.map((c) => c[0].user as string).find((u) => u.includes("CICLO ANTERIOR")) ?? "");

  // O plano fixo do arquivo é ["social-media"]; aqui ele é trocado por
  // ["analytics"]. `clearAllMocks` NÃO desfaz implementação — devolver o padrão
  // no fim é o que impede este bloco de contaminar quem vier depois dele.
  afterAll(() => {
    (planProduction as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderedDepartments: ["social-media"], goal: "g", warnings: [], pmMode: "rule_based",
    });
  });

  /** O ciclo aberto de hoje e o ciclo fechado do mês passado vêm do MESMO
   *  findFirst — o que muda é o `where.status`. */
  function comCicloAnterior(results: Record<string, unknown>) {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    (planProduction as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderedDepartments: ["analytics"], goal: "g", warnings: [], pmMode: "rule_based",
    });
    generate.mockResolvedValue(noContrato({ title: "Otimização", summary: "resumo", items: [{ format: "feed", headline: "Oi", caption: "legenda bem completa aqui", visual: "foto" }] }));
    db.cycle.findFirst.mockImplementation(async (args?: { where?: { status?: string } }) =>
      args?.where?.status === "fechado"
        ? { reference: "2026-07", resultsJson: JSON.stringify(results) }
        : { id: "cy2", reference: "2026-08", status: "aberto", startsOn: "2026-08-01", endsOn: "2026-08-31", planJson: "[]", summary: null },
    );
  }

  it("ciclo anterior na base ANTIGA (v1) → alcance e engajamento OMITIDOS, com a lacuna declarada", async () => {
    comCicloAnterior({ postsPublicados: 8, alcance: 340, engajamento: 51, seguidores: 1200 });
    await runProjectExecution("p1");
    const p = promptDeOtimizacao();
    expect(p).toBeTruthy();
    // O número de outra base NÃO chega ao especialista.
    expect(p).not.toMatch(/Alcance: 340/);
    expect(p).not.toMatch(/Engajamento: 51/);
    // O que não depende da base continua — o piso não é uma tesoura cega.
    expect(p).toMatch(/Posts publicados: 8/);
    expect(p).toMatch(/Seguidores: 1200/);
    // E a ausência é DECLARADA: vazio é vazio, silêncio outro agente preenche.
    expect(p).toMatch(/OMITIDOS porque foram medidos noutra base \(v1, hoje v2\)/);
    expect(p).toMatch(/NÃO cite, NÃO compare e NÃO estime alcance ou engajamento/);
  });

  it("ciclo anterior na base ATUAL (v2) → os números entram normalmente", async () => {
    comCicloAnterior({ schemaVersao: 2, postsPublicados: 8, alcance: 9500, engajamento: 780, seguidores: 1200 });
    await runProjectExecution("p1");
    const p = promptDeOtimizacao();
    expect(p).toMatch(/Alcance: 9500/);
    expect(p).toMatch(/Engajamento: 780/);
    expect(p).not.toMatch(/OMITIDOS/);
  });

  it("ciclo v1 que nem tinha esses números → nenhuma linha de ATENÇÃO inventada", async () => {
    comCicloAnterior({ postsPublicados: 8, seguidores: 1200 });
    await runProjectExecution("p1");
    expect(promptDeOtimizacao()).not.toMatch(/OMITIDOS/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A MADRUGADA DE 05/08/2026 — os furos que o raio-x do Brain encontrou.
// Cada teste abaixo é a metade que trava um deles.
// ═══════════════════════════════════════════════════════════════════════════

describe("o TÍTULO da entrega passa pelo piso de verdade", () => {
  it("título com telefone que a agência não tem → NÃO publica", async () => {
    // O título vira o `name` do Deliverable — o PRIMEIRO campo que o cliente lê
    // no portal. O piso conferia só o corpo, e `deliverableMarkdown` não inclui
    // o título: preço, prazo e telefone inventados passavam inteiros, com o
    // piso dizendo aprovado.
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({
      title: "Fale agora no (11) 98940-0692",
      summary: "s",
      items: [{ headline: "A", caption: "uma legenda bem completa e sem nenhum dado inventado" }],
    }));

    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.barradosNoPiso!.length).toBeGreaterThan(0);
  });

  it("título limpo com corpo limpo continua passando — o piso não atrapalha o trabalho", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({
      title: "Pauta do mês — Loja X",
      summary: "s",
      items: [{ headline: "A", caption: "uma legenda bem completa e sem nenhum dado inventado" }],
    }));
    const r = await runProjectExecution("p1");
    expect(r.barradosNoPiso).toHaveLength(0);
    expect(db.deliverable.create).toHaveBeenCalled();
  });
});

describe("a correção enxerga o TEXTO ANTERIOR — não é re-roll cego", () => {
  it("o pedido de refação carrega a versão anterior junto do parecer", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    const auditMock = auditDeliverable as unknown as ReturnType<typeof vi.fn>;
    auditMock.mockResolvedValueOnce({ verdict: "reprovado", issues: ["clichê vazio"], note: "revisar" })
             .mockResolvedValue({ verdict: "aprovado", issues: [], note: "ok" });
    generate.mockResolvedValue(noContrato({
      title: "T", summary: "s",
      items: [{ headline: "MARCA DAGUA DA VERSAO ANTERIOR", caption: "uma legenda bem completa para passar do piso" }],
    }));

    await runProjectExecution("p1");
    // A 2ª chamada é a revisão pedida pela Qualidade.
    const revisao = generate.mock.calls[1]![0].user as string;
    expect(revisao).toContain("MARCA DAGUA DA VERSAO ANTERIOR");
    expect(revisao).toContain("clichê vazio");
  });
});

describe("o contrato de saída é conferido no JSON, não confiado ao prompt", () => {
  it("entregou 2 peças onde o cliente comprou 6 a 8 → tenta corrigir e, insistindo, NÃO publica", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    (planProduction as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderedDepartments: ["social-media"], goal: "g", warnings: [], pmMode: "rule_based",
    });
    generate.mockResolvedValue({
      ok: true,
      data: { title: "Legendas", summary: "s", items: [
        { format: "feed", headline: "A", caption: "uma legenda bem completa para passar do piso" },
        { format: "feed", headline: "B", caption: "outra legenda bem completa para passar do piso" },
      ] },
    });

    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    expect(r.skipped.join(" ")).toMatch(/contrato de sa[íi]da/i);
    // Tentou corrigir uma vez por especialista antes de barrar: 3 especialistas × 2.
    expect(generate).toHaveBeenCalledTimes(6);
    // E o pedido de correção diz o número que falta, não "melhore".
    expect(generate.mock.calls[1]![0].user as string).toMatch(/entregou 2/);
  });

  it("a correção que cumpre o contrato é publicada", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate
      .mockResolvedValueOnce({ ok: true, data: { title: "T", summary: "s", items: [{ format: "feed", headline: "A", caption: "uma legenda bem completa para passar do piso" }] } })
      .mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));

    const r = await runProjectExecution("p1");
    expect(r.produced.length).toBeGreaterThan(0);
  });

  it("carrossel com telas fora de 3–6 é barrado — cada tela é uma imagem PAGA", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({
      title: "T", summary: "s",
      items: [{ format: "carrossel", headline: "C", caption: "legenda de carrossel bem completa", cenas: "1) única tela" }],
    }));
    const r = await runProjectExecution("p1");
    expect(r.skipped.join(" ")).toMatch(/tela/i);
  });
});

describe("ciclo ilegível é BLOQUEIO, nunca ciclo nulo", () => {
  it("falha ao ler o ciclo → 'failed', e o mês NÃO é marcado como concluído", async () => {
    // Com `null`, o motor comparava o mês 5 contra as entregas do mês 1, via
    // todos os especialistas produzidos, montava fila vazia e gravava "done".
    // O mês inteiro era pulado e carimbado como entregue — e o cron não
    // recupera "done".
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    db.cycle.findFirst.mockRejectedValue(new Error("banco fora do ar"));

    const r = await runProjectExecution("p1");
    expect(r.status).toBe("failed");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    const statuses = db.project.update.mock.calls.map((c) => c[0].data.executionStatus);
    expect(statuses).not.toContain("done");
    expect(db.project.update.mock.calls.at(-1)?.[0].data.executionError).toMatch(/ciclo/i);
  });
});

describe("executionAttempts conta falhas SEGUIDAS, não a vida inteira", () => {
  it("passada que fecha o pacote ZERA o contador — o mês 3 continua recuperável", async () => {
    // O cliente vitalício gastava as 5 tentativas nos dois primeiros meses e,
    // do mês 3 em diante, qualquer falha ficava sem recuperação para sempre.
    db.project.findUnique.mockResolvedValue({ ...baseProject, executionAttempts: 4 });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));

    const r = await runProjectExecution("p1");
    expect(r.status).toBe("done");
    expect(db.project.update.mock.calls.at(-1)?.[0].data.executionAttempts).toBe(0);
  });

  it("passada que NÃO fecha não zera — senão o teto de retomada nunca chegaria", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue({ ok: false, error: "IA fora" });
    await runProjectExecution("p1");
    expect(db.project.update.mock.calls.at(-1)?.[0].data.executionAttempts).toBeUndefined();
  });
});

describe("recusa não é falha transitória — o cron para de re-rolar o dado", () => {
  const invencao = () => noContrato({
    title: "T", summary: "s",
    items: [{ headline: "Fale", caption: "Chame no WhatsApp (11) 98940-0692 e a gente responde rapidinho." }],
  });

  it("primeira passada só com recusas → 'failed' marcado como recusa", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, executionError: null });
    generate.mockResolvedValue(invencao());
    await runProjectExecution("p1");
    const last = db.project.update.mock.calls.at(-1)?.[0].data;
    expect(last.executionStatus).toBe("failed");
    expect(last.executionError).toMatch(/^\[recusa\]/);
  });

  it("segunda passada seguida só com recusas → 'blocked': o cron não pega mais", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, executionError: "[recusa] pendências: ..." });
    generate.mockResolvedValue(invencao());
    await runProjectExecution("p1");
    expect(db.project.update.mock.calls.at(-1)?.[0].data.executionStatus).toBe("blocked");
  });

  it("falha de IA continua sendo 'failed' — o mundo muda, vale retentar", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, executionError: "[recusa] pendências: ..." });
    generate.mockResolvedValue({ ok: false, error: "IA fora" });
    await runProjectExecution("p1");
    expect(db.project.update.mock.calls.at(-1)?.[0].data.executionStatus).toBe("failed");
  });
});

describe("os fail-opens que sobraram", () => {
  it("a trava de concorrência é ATÔMICA: quem perdeu o updateMany não roda", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    db.project.updateMany.mockResolvedValue({ count: 0 }); // outro chamador ganhou
    const r = await runProjectExecution("p1");
    expect(r.status).toBe("skipped_running");
    expect(generate).not.toHaveBeenCalled();
    expect(db.deliverable.create).not.toHaveBeenCalled();
  });

  it("a trava põe o estado esperado no WHERE — não decide em memória", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
    await runProjectExecution("p1");
    const where = db.project.updateMany.mock.calls[0]![0].where;
    expect(where.id).toBe("p1");
    expect(Array.isArray(where.OR)).toBe(true);
  });

  it("aprovação do departamento que falha vira PENDÊNCIA, não silêncio", async () => {
    // Estava solto depois do `create`: se lançasse, o Deliverable já existia, a
    // retentativa pulava o especialista e a aprovação nunca era criada.
    db.project.findUnique.mockResolvedValue({ ...baseProject });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
    createApprovalRequest.mockRejectedValue(new Error("banco fora"));

    const r = await runProjectExecution("p1");
    expect(db.deliverable.create).toHaveBeenCalled();
    expect(r.skipped.join(" ")).toMatch(/aprova[çc][ãa]o/i);
    expect(r.status).toBe("failed");
    const tipos = db.activityEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(tipos).toContain("aprovacao_nao_criada");
  });
});

describe("o kit de marca — o serviço mais caro da casa — sai do fail-open", () => {
  const PROJETO_DE_IDENTIDADE = () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a2"]) });
    db.clientRequestDb.findUnique.mockResolvedValue({
      id: "cr1", businessName: "Loja X",
      services: JSON.stringify(["identidade visual"]), objectives: "[]", briefingJson: "{}",
    });
    (planProduction as ReturnType<typeof vi.fn>).mockResolvedValue({
      orderedDepartments: ["design"], goal: "g", warnings: [], pmMode: "rule_based",
    });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "A", caption: "uma legenda bem completa para passar do piso" }] }));
  };

  it("logo produzido mas entrega não gravada → PENDÊNCIA visível, não silêncio", async () => {
    // O cliente pagava, o logo ia para o armazenamento, e o Deliverable que o
    // torna visível falhava dentro de um `.catch(() => {})`. Ele nunca
    // encontrava o que comprou.
    PROJETO_DE_IDENTIDADE();
    colherIdentidadeDaEntrega.mockResolvedValue({ encontrouEntrega: true });
    produzirKitDeMarca.mockResolvedValue({ arquivos: [{ id: "m1", nome: "logo-claro-loja.svg", para: "fundo claro" }] });
    db.deliverable.create.mockImplementation(async (args: { data: { type?: string } }) => {
      if (args.data.type === "brand-kit") throw new Error("banco recusou");
      return { id: "d1" };
    });

    const r = await runProjectExecution("p1");
    expect(r.skipped.join(" ")).toMatch(/Kit de marca/i);
    const tipos = db.activityEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(tipos).toContain("kit_de_marca_invisivel");
  });

  it("logo JÁ no armazenamento e sem entrega → a entrega é retentada, não abandonada", async () => {
    // `produzirKitDeMarca` é idempotente e devolve lista vazia quando o logo já
    // existe. Isso fazia a retentativa não reentregar NADA — o arquivo existia
    // e o cliente continuava sem encontrá-lo, para sempre.
    PROJETO_DE_IDENTIDADE();
    colherIdentidadeDaEntrega.mockResolvedValue({ encontrouEntrega: true });
    produzirKitDeMarca.mockResolvedValue({ arquivos: [] });
    db.mediaAsset.findMany.mockResolvedValue([{ id: "m9", fileName: "logo-simbolo-loja.png" }]);

    await runProjectExecution("p1");
    const kits = db.deliverable.create.mock.calls.filter((c) => c[0].data.type === "brand-kit");
    expect(kits).toHaveLength(1);
    expect(kits[0]![0].data.content).toMatch(/api\/media\/m9/);
  });

  it("kit JÁ entregue → não duplica no portal", async () => {
    PROJETO_DE_IDENTIDADE();
    colherIdentidadeDaEntrega.mockResolvedValue({ encontrouEntrega: true });
    produzirKitDeMarca.mockResolvedValue({ arquivos: [{ id: "m1", nome: "logo-claro-loja.svg", para: "fundo claro" }] });
    db.deliverable.findFirst.mockResolvedValue({ id: "kit-antigo" });

    await runProjectExecution("p1");
    const kits = db.deliverable.create.mock.calls.filter((c) => c[0].data.type === "brand-kit");
    expect(kits).toHaveLength(0);
  });
});


// ── A ESCADA É ALIMENTADA PELO MOTOR ─────────────────────────────────────────
//
// Sem esta fiação a escada seria estado gravado que ninguém alimenta — e
// nenhum departamento sairia da sombra nunca, o que na prática é a agência
// desligada com cara de portão funcionando.

describe("cada peça produzida vira evidência na escada — inclusive a barrada", () => {
  it("peça aprovada entra como 'aprovada', com o departamento e o degrau da época", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a3"]) });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "Pauta", caption: "legenda de feed bem completa para o mes inteiro" }] }));

    await runProjectExecution("p1");
    const regs = db.departmentLadderRecord.create.mock.calls.map((c) => c[0].data);
    const social = regs.find((r) => r.departmentId === "social-media");
    expect(social, "o motor precisa anotar a peça na escada").toBeTruthy();
    expect(social!.resultado).toBe("aprovada");
    expect(social!.degrauNaEpoca).toBe("sombra");
  });

  it("peça barrada no piso NÃO vira Deliverable, mas VIRA registro — senão o histórico mente a favor", async () => {
    db.project.findUnique.mockResolvedValue({ ...baseProject, agents: JSON.stringify(["a5"]) });
    generate.mockResolvedValue(noContrato({ title: "T", summary: "s", items: [{ headline: "Reserve", caption: "Garantimos 80% mais vendas já no primeiro mês, sem esforço nenhum." }] }));

    await runProjectExecution("p1");
    expect(db.deliverable.create).not.toHaveBeenCalled();
    const regs = db.departmentLadderRecord.create.mock.calls.map((c) => c[0].data);
    expect(regs.map((r) => r.resultado)).toContain("barrada_piso");
  });
});
