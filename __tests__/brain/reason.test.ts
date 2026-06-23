// Phase A tests — central reasoning gateway (server route) + coherence guard.
//
// reasonAsDepartment() is a thin client fetch wrapper around POST /api/brain/reason;
// the meaningful logic lives in the route handler. These tests exercise the route's
// POST directly with the OpenAI provider and session mocked, then assert the gateway
// contract: rule-based always runs, AI overlays only when coherent, downstream depts
// require their prior canvas.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Auth: always an agency session (no clientId).
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({
    userId: "u1",
    email: "a@dioli.test",
    name: "Agency",
    role: "master",
    workspaceId: "ws1",
  })),
  isAgencyRole: (role: string) => ["master", "project_manager", "social_staff", "design_staff", "ads_staff"].includes(role),
}));

// Unified AI caller: controllable per-test via the exported mocks. The route now
// calls generate() / anyProviderConfigured() (lib/ai/generate.ts), which resolve
// the key from the Integrations UI first and env second.
const generateAi = vi.fn();
const anyProviderConfigured = vi.fn(async () => false);
vi.mock("@/lib/ai/generate", () => ({
  generate: (...args: unknown[]) => generateAi(...args),
  anyProviderConfigured: (...args: unknown[]) => anyProviderConfigured(...args),
}));

import { POST } from "@/app/api/brain/reason/route";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/brain/reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseContext = {
  businessName: "Padaria Aurora",
  segment: "Alimentação",
  services: ["Social Media"],
  objectives: ["Aumentar vendas locais"],
  rawContext: "Padaria artesanal de bairro buscando presença digital.",
};

beforeEach(() => {
  generateAi.mockReset();
  anyProviderConfigured.mockReset();
  anyProviderConfigured.mockResolvedValue(false);
  delete process.env.BRAIN_AI_DEPARTMENTS;
});

describe("POST /api/brain/reason — gateway contract", () => {
  it("strategy with AI off → mode rule_based with a valid canvas", async () => {
    const res = await POST(makeRequest({ dept: "strategy", context: baseContext }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe("rule_based");
    expect(json.model).toBe("rule_based");
    const c = json.canvas;
    expect(c.clientName).toBe("Padaria Aurora");
    expect(c.qualityGateResult).toBeDefined();
    expect(c.mainObjective.length).toBeGreaterThan(0);
    expect(generateAi).not.toHaveBeenCalled();
  });

  it("strategy with AI returning bad JSON shape → falls back to rule_based + warning", async () => {
    anyProviderConfigured.mockResolvedValue(true);
    process.env.BRAIN_AI_DEPARTMENTS = "strategy";
    // Shape-invalid: missing required fields.
    generateAi.mockResolvedValue({ ok: true, data: { foo: "bar" }, model: "gpt-4o-mini", provider: "openai" });

    const res = await POST(makeRequest({ dept: "strategy", context: baseContext }));
    const json = await res.json();
    expect(json.mode).toBe("rule_based");
    expect(json.warnings.length).toBeGreaterThan(0);
    expect(generateAi).toHaveBeenCalledOnce();
  });

  it("strategy with incoherent AI (empty/placeholder) → rule_based preserved + coherence warning", async () => {
    anyProviderConfigured.mockResolvedValue(true);
    process.env.BRAIN_AI_DEPARTMENTS = "strategy";
    // Shape-valid but semantically empty — coherence guard must reject.
    generateAi.mockResolvedValue({
      ok: true,
      model: "gpt-4o-mini",
      provider: "openai",
      data: {
        diagnosis: "N/A",
        opportunity: "   ",
        risk: "x",
        positioning: "ok",
        channels: [],
        suggestedDeliverables: [],
        executiveSummary: "  ",
      },
    });

    const res = await POST(makeRequest({ dept: "strategy", context: baseContext }));
    const json = await res.json();
    expect(json.mode).toBe("rule_based");
    expect(json.warnings.some((w: string) => w.toLowerCase().includes("incoerente"))).toBe(true);
  });

  it("strategy with coherent AI → mode openai, narrative overlaid", async () => {
    anyProviderConfigured.mockResolvedValue(true);
    process.env.BRAIN_AI_DEPARTMENTS = "strategy";
    generateAi.mockResolvedValue({
      ok: true,
      model: "gpt-4o-mini",
      provider: "openai",
      data: {
        diagnosis: "Diagnóstico estratégico detalhado e acionável para a padaria.",
        opportunity: "Oportunidade clara de capturar o público de bairro via Instagram.",
        risk: "Risco de inconsistência de marca sem calendário definido.",
        positioning: "Padaria artesanal premium acessível ao bairro.",
        channels: ["Instagram", "WhatsApp"],
        suggestedDeliverables: ["Calendário editorial", "Identidade de feed"],
        executiveSummary: "Resumo executivo com foco em presença local consistente.",
      },
    });

    const res = await POST(makeRequest({ dept: "strategy", context: baseContext }));
    const json = await res.json();
    expect(json.mode).toBe("openai");
    expect(json.canvas.businessSummary).toContain("Diagnóstico estratégico");
    expect(json.canvas.priorityChannels).toContain("Instagram");
  });

  it("social without strategyCanvas → 400 with clear message", async () => {
    const res = await POST(makeRequest({ dept: "social", context: baseContext }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/strategyCanvas/i);
  });

  it("social with strategyCanvas → valid social canvas returned", async () => {
    const strategyCanvas = generateStrategyCanvas({
      businessName: "Padaria Aurora",
      segment: "Alimentação",
      objectives: ["Aumentar vendas locais"],
      services: ["Social Media"],
      rawContext: baseContext.rawContext,
      source: "request",
    });
    const res = await POST(makeRequest({ dept: "social", context: { ...baseContext, strategyCanvas } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe("rule_based");
    expect(json.canvas.contentObjective.length).toBeGreaterThan(0);
    expect(json.canvas.qualityGateResult).toBeDefined();
  });

  it("quality with all canvases → valid quality canvas returned", async () => {
    const strategyCanvas = generateStrategyCanvas({
      businessName: "Padaria Aurora",
      segment: "Alimentação",
      objectives: ["Aumentar vendas locais"],
      services: ["Social Media"],
      rawContext: baseContext.rawContext,
      source: "request",
    });
    const res = await POST(
      makeRequest({ dept: "quality", context: { ...baseContext, strategyCanvas } }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.canvas.overallVerdict).toBeDefined();
    expect(json.canvas.gateResult).toBeDefined();
  });

  it("rejects an unknown department", async () => {
    const res = await POST(makeRequest({ dept: "marketing", context: baseContext }));
    expect(res.status).toBe(400);
  });
});
