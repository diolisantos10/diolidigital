// Phase C tests — PM Orchestrator reasoning + apply route.
// orchestratePMReasoning never mutates; only /apply creates Project + Tasks.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { ClientKnowledgeSnapshot } from "@/lib/dioli-brain/client-snapshot";

// ── Mock do gerador unificado ───────────────────────────────────────────────────
// O PM passou a raciocinar por generate(), que resolve a chave pela tela de
// Integrações ANTES do ambiente. Antes ele lia só variável de ambiente, e quem
// colava a chave na tela recebia plano de regras fixas sem nenhum aviso.
const generate = vi.fn();
vi.mock("@/lib/ai/generate", () => ({
  generate: (...a: unknown[]) => generate(...a),
}));

const SEM_CHAVE = { ok: false, error: "Nenhuma IA conectada. Conecte uma chave em Integrações." };

// ── Prisma mock (for the apply route) ───────────────────────────────────────────
const findUniqueRequest = vi.fn();
// A rota /apply passou a conferir a POSSE antes de adotar a solicitação
// (achado 10/11 da 8ª auditoria): sem isso, o id de uma solicitação de outra
// agência criava Cliente + Projeto aqui e reescrevia o `workspaceId` dela.
// A conferência lê por `findFirst`; este mock HONRA o `workspaceId` do where.
const findFirstRequest = vi.fn();
const createClient = vi.fn();
const updateRequest = vi.fn();
const createProject = vi.fn();
const createManyTasks = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    clientRequestDb: {
      findUnique: (...a: unknown[]) => findUniqueRequest(...a),
      findFirst: (...a: unknown[]) => findFirstRequest(...a),
      update: (...a: unknown[]) => updateRequest(...a),
    },
    client: { create: (...a: unknown[]) => createClient(...a) },
    project: { create: (...a: unknown[]) => createProject(...a) },
    task: { createMany: (...a: unknown[]) => createManyTasks(...a) },
  },
}));

// ── Session mock (agency master) ────────────────────────────────────────────────
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({
    userId: "u1", email: "a@dioli.test", name: "Agency", role: "master", workspaceId: "ws1",
  })),
  isAgencyRole: (r: string) => ["master", "project_manager"].includes(r),
}));

import { orchestratePMReasoning, proposeProjectRuleBased } from "@/lib/dioli-brain/pm-orchestrator";
import { POST as applyPost } from "@/app/api/brain/orchestrate/apply/route";

const snapshot: ClientKnowledgeSnapshot = {
  clientRequestId: "req1",
  businessName: "Padaria Aurora",
  segment: "Alimentação",
  services: ["Social Media", "Tráfego Pago"],
  objectives: ["Aumentar vendas locais"],
  rawContext: "Padaria de bairro.",
  brandBrainComplete: false,
  missingFields: ["visualStyle", "preferredChannels"],
};

function applyReq(body: unknown): NextRequest {
  // "sec-fetch-site: same-origin" — a FAIXA 1 do CSRF (navegacao-cross-site.ts)
  // bloqueia por padrão sem este sinal; aqui simulamos o navegador legítimo.
  return new NextRequest("http://localhost/api/brain/orchestrate/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  generate.mockReset();
  generate.mockResolvedValue(SEM_CHAVE);
  findUniqueRequest.mockReset();
  findFirstRequest.mockReset();
  // Por padrão, a solicitação é DESTE workspace (ws1, o da sessão mockada).
  findFirstRequest.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const ramos = (where.OR as { workspaceId: string | null }[] | undefined);
    if (ramos && !ramos.some((r) => r.workspaceId === "ws1" || r.workspaceId === null)) return null;
    return { id: where.id as string, workspaceId: "ws1", clientId: null };
  });
  createClient.mockReset();
  updateRequest.mockReset();
  createProject.mockReset();
  createManyTasks.mockReset();
  delete process.env.BRAIN_AI_DEPARTMENTS;
});

const PLANO_DA_IA = {
  ok: true,
  model: "deepseek-v4-flash",
  provider: "deepseek",
  data: {
    name: "Lançamento Digital Aurora",
    goal: "Estabelecer presença digital e vendas locais.",
    stage: "briefing",
    tasks: [
      { title: "Strategy Room", description: "Definir posicionamento.", department: "strategy", priority: "critical", estimatedDays: 3 },
      { title: "Calendário editorial", description: "Plano de conteúdo.", department: "social-media", priority: "high", estimatedDays: 4 },
    ],
  },
};

describe("orchestratePMReasoning", () => {
  it("sem nenhuma IA conectada → proposta por regras, com tarefas distribuídas por departamento", async () => {
    const p = await orchestratePMReasoning(snapshot);
    expect(p.reasoningMode).toBe("rule_based");
    expect(p.tasks.length).toBeGreaterThanOrEqual(2);
    const depts = p.tasks.map((t) => t.department);
    expect(depts).toContain("strategy");
    expect(depts).toContain("paid-traffic"); // wantsTraffic
    // ── O ALINHAMENTO DEIXOU DE SER TAREFA (8ª volta, 26/08/2026) ──────────
    //
    // Esta asserção mudou de lado, e o motivo precisa ficar escrito. A tarefa
    // de alinhamento nascia em `project-management` — cujo gerente, no
    // manifesto, é o PRÓPRIO Gerente Geral. Medido em produção:
    // `gerente_geral_recusou_demanda`, "não despacha para si mesmo". O plano
    // continha, por construção, uma tarefa que a casa recusaria.
    //
    // Coletar dado que falta não é entrega de departamento nenhum. O campo
    // ausente continua sendo dito — como AVISO, que tem leitor de verdade
    // (a tela do pedido) e agora carrega dono e próxima ação.
    expect(p.tasks.some((t) => t.department === "project-management")).toBe(false);
    expect(p.warnings.some((w) => w.includes("Brand Brain incompleto"))).toBe(true);
  });

  it("cair para regras nunca é silencioso — o motivo vai num aviso", async () => {
    const p = await orchestratePMReasoning(snapshot);
    expect(p.warnings.some((w) => w.toLowerCase().includes("indisponível"))).toBe(true);
  });

  it("rule-based proposal always references the real business name", () => {
    const p = proposeProjectRuleBased(snapshot);
    expect(p.name).toContain("Padaria Aurora");
    expect(p.goal).toContain("Aumentar vendas locais");
  });

  it("IA responde um plano válido → o plano da IA é usado, com o modelo que produziu", async () => {
    generate.mockResolvedValue(PLANO_DA_IA);
    const p = await orchestratePMReasoning(snapshot);
    expect(p.reasoningMode).toBe("ai");
    expect(p.model).toBe("deepseek-v4-flash");
    expect(p.name).toBe("Lançamento Digital Aurora");
    expect(p.tasks).toHaveLength(2);
  });

  // O bug que este teste guarda: sem BRAIN_AI_DEPARTMENTS o PM ficava rule-based
  // para sempre, mesmo com chave salva. A chave conectada é o consentimento.
  it("sem BRAIN_AI_DEPARTMENTS o PM AINDA tenta a IA — a chave é que decide", async () => {
    delete process.env.BRAIN_AI_DEPARTMENTS;
    generate.mockResolvedValue(PLANO_DA_IA);
    const p = await orchestratePMReasoning(snapshot);
    expect(generate).toHaveBeenCalled();
    expect(p.reasoningMode).toBe("ai");
  });

  it("o workspace é repassado, senão a chave da tela de Integrações não é encontrada", async () => {
    generate.mockResolvedValue(PLANO_DA_IA);
    await orchestratePMReasoning(snapshot, "ws-da-dioli");
    expect(generate.mock.calls[0][0]).toMatchObject({ workspaceId: "ws-da-dioli" });
  });

  it("BRAIN_AI_DEPARTMENTS=none desliga de propósito, e a tela fica sabendo", async () => {
    process.env.BRAIN_AI_DEPARTMENTS = "none";
    const p = await orchestratePMReasoning(snapshot);
    expect(generate).not.toHaveBeenCalled();
    expect(p.reasoningMode).toBe("rule_based");
    expect(p.warnings.some((w) => w.includes("desligada"))).toBe(true);
  });

  it("IA responde algo fora do formato → volta para regras, avisando", async () => {
    generate.mockResolvedValue({ ok: true, model: "deepseek-v4-flash", provider: "deepseek", data: { nope: true } });
    const p = await orchestratePMReasoning(snapshot);
    expect(p.reasoningMode).toBe("rule_based");
    expect(p.warnings.some((w) => w.includes("inválida"))).toBe(true);
  });
});

describe("POST /api/brain/orchestrate/apply", () => {
  const validProposal = {
    name: "Projeto Aurora",
    goal: "Crescer vendas.",
    stage: "briefing",
    tasks: [
      { title: "Strategy Room", description: "x", department: "strategy", priority: "critical", estimatedDays: 3 },
    ],
  };

  it("valid proposal → creates project + tasks, returns projectId", async () => {
    findUniqueRequest.mockResolvedValue({ id: "req1", clientId: "cli1", businessName: "Padaria Aurora", segment: "Alimentação" });
    createProject.mockResolvedValue({ id: "proj1" });
    createManyTasks.mockResolvedValue({ count: 1 });
    updateRequest.mockResolvedValue({});

    const res = await applyPost(applyReq({ clientRequestId: "req1", proposal: validProposal }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.projectId).toBe("proj1");
    expect(createProject).toHaveBeenCalledOnce();
    const projectArg = createProject.mock.calls[0][0].data;
    expect(projectArg.clientId).toBe("cli1");
    expect(projectArg.name).toBe("Projeto Aurora");
    expect(createManyTasks).toHaveBeenCalledOnce();
  });

  it("request without client → creates a Client first", async () => {
    findUniqueRequest.mockResolvedValue({ id: "req2", clientId: null, businessName: "Studio X", segment: "Design" });
    createClient.mockResolvedValue({ id: "newcli" });
    createProject.mockResolvedValue({ id: "proj2" });
    createManyTasks.mockResolvedValue({ count: 1 });
    updateRequest.mockResolvedValue({});

    const res = await applyPost(applyReq({ clientRequestId: "req2", proposal: validProposal }));
    expect(res.status).toBe(201);
    expect(createClient).toHaveBeenCalledOnce();
    expect(createProject.mock.calls[0][0].data.clientId).toBe("newcli");
  });

  it("solicitação de OUTRA agência → 404, e NADA criado (nem cliente, nem projeto, nem adoção)", async () => {
    // A solicitação existe, mas é do ws2: o `findFirst` com o workspace da
    // sessão não a encontra, e a rota para antes de qualquer escrita.
    findFirstRequest.mockResolvedValue(null);
    findUniqueRequest.mockResolvedValue({ id: "req-do-vizinho", clientId: null, businessName: "Vizinha", segment: "X" });

    const res = await applyPost(applyReq({ clientRequestId: "req-do-vizinho", proposal: validProposal }));
    expect(res.status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    expect(updateRequest).not.toHaveBeenCalled();
  });

  it("invalid proposal (missing fields) → 400, nothing created", async () => {
    const res = await applyPost(applyReq({ clientRequestId: "req1", proposal: { name: "X" } }));
    expect(res.status).toBe(400);
    expect(createProject).not.toHaveBeenCalled();
  });

  it("missing clientRequestId → 400", async () => {
    const res = await applyPost(applyReq({ proposal: validProposal }));
    expect(res.status).toBe(400);
    expect(createProject).not.toHaveBeenCalled();
  });
});
