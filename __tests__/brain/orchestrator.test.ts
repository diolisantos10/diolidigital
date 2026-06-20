// Phase C tests — PM Orchestrator reasoning + apply route.
// orchestratePMReasoning never mutates; only /apply creates Project + Tasks.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { ClientKnowledgeSnapshot } from "@/lib/dioli-brain/client-snapshot";

// ── Active provider mock (pluggable registry, Phase 4) ─────────────────────────
const callOpenAI = vi.fn();
const isOpenAIConfigured = vi.fn(() => false);
vi.mock("@/lib/ai/provider-registry", () => ({
  getActiveProvider: () => ({
    isConfigured: () => isOpenAIConfigured(),
    call: (...a: unknown[]) => callOpenAI(...a),
    modelId: () => "gpt-4o-mini",
  }),
}));

// ── Prisma mock (for the apply route) ───────────────────────────────────────────
const findUniqueRequest = vi.fn();
const createClient = vi.fn();
const updateRequest = vi.fn();
const createProject = vi.fn();
const createManyTasks = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    clientRequestDb: {
      findUnique: (...a: unknown[]) => findUniqueRequest(...a),
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
  return new NextRequest("http://localhost/api/brain/orchestrate/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  callOpenAI.mockReset();
  isOpenAIConfigured.mockReset();
  isOpenAIConfigured.mockReturnValue(false);
  findUniqueRequest.mockReset();
  createClient.mockReset();
  updateRequest.mockReset();
  createProject.mockReset();
  createManyTasks.mockReset();
  delete process.env.BRAIN_AI_DEPARTMENTS;
});

describe("orchestratePMReasoning", () => {
  it("AI off → valid rule-based proposal with department-distributed tasks", async () => {
    const p = await orchestratePMReasoning(snapshot);
    expect(p.reasoningMode).toBe("rule_based");
    expect(p.tasks.length).toBeGreaterThanOrEqual(2);
    const depts = p.tasks.map((t) => t.department);
    expect(depts).toContain("strategy");
    expect(depts).toContain("paid-traffic"); // wantsTraffic
    // Missing brand fields → alignment task, not invented data.
    expect(p.tasks.some((t) => t.department === "project-management")).toBe(true);
    expect(callOpenAI).not.toHaveBeenCalled();
  });

  it("rule-based proposal always references the real business name", () => {
    const p = proposeProjectRuleBased(snapshot);
    expect(p.name).toContain("Padaria Aurora");
    expect(p.goal).toContain("Aumentar vendas locais");
  });

  it("AI on + valid mock → AI proposal used", async () => {
    isOpenAIConfigured.mockReturnValue(true);
    process.env.BRAIN_AI_DEPARTMENTS = "project-management";
    callOpenAI.mockResolvedValue({
      ok: true,
      model: "gpt-4o-mini",
      data: {
        name: "Lançamento Digital Aurora",
        goal: "Estabelecer presença digital e vendas locais.",
        stage: "briefing",
        tasks: [
          { title: "Strategy Room", description: "Definir posicionamento.", department: "strategy", priority: "critical", estimatedDays: 3 },
          { title: "Calendário editorial", description: "Plano de conteúdo.", department: "social-media", priority: "high", estimatedDays: 4 },
        ],
      },
    });
    const p = await orchestratePMReasoning(snapshot);
    expect(p.reasoningMode).toBe("openai");
    expect(p.name).toBe("Lançamento Digital Aurora");
    expect(p.tasks).toHaveLength(2);
  });

  it("AI on but bad output → falls back to rule-based", async () => {
    isOpenAIConfigured.mockReturnValue(true);
    process.env.BRAIN_AI_DEPARTMENTS = "project-management";
    callOpenAI.mockResolvedValue({ ok: true, model: "gpt-4o-mini", data: { nope: true } });
    const p = await orchestratePMReasoning(snapshot);
    expect(p.reasoningMode).toBe("rule_based");
    expect(p.warnings.some((w) => w.includes("inválido"))).toBe(true);
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
