// Phase D tests — pluggable provider registry + new dept prompt builders/validators.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getActiveProvider, activeProviderId } from "@/lib/ai/provider-registry";
import {
  buildSocialMessages,
  buildDesignMessages,
  buildTrafficMessages,
  buildAnalyticsMessages,
  buildQualityMessages,
  validateDesignOutput,
  validateTrafficOutput,
  validateAnalyticsOutput,
  validateQualityOutput,
  type AIRunContext,
} from "@/lib/agency/intelligence/openai-schemas";

const ORIG = process.env.BRAIN_AI_PROVIDER;
afterEach(() => {
  if (ORIG === undefined) delete process.env.BRAIN_AI_PROVIDER;
  else process.env.BRAIN_AI_PROVIDER = ORIG;
});

const ctx: AIRunContext = {
  projectName: "Aurora",
  clientName: "Padaria Aurora",
  clientIndustry: "Alimentação",
  brandBrain: { brandVoice: "Acolhedor", positioning: "Artesanal premium" },
  prompt: "Você é um agente.",
};

describe("provider registry", () => {
  beforeEach(() => delete process.env.BRAIN_AI_PROVIDER);

  it("default → openai adapter", () => {
    expect(activeProviderId()).toBe("openai");
    const p = getActiveProvider();
    expect(typeof p.isConfigured).toBe("function");
    expect(typeof p.call).toBe("function");
    expect(typeof p.modelId).toBe("function");
  });

  it("BRAIN_AI_PROVIDER=claude → claude adapter (not configured)", () => {
    process.env.BRAIN_AI_PROVIDER = "claude";
    expect(activeProviderId()).toBe("claude");
    const p = getActiveProvider();
    expect(p.isConfigured()).toBe(false);
    expect(p.modelId()).toMatch(/claude/i);
  });

  it("BRAIN_AI_PROVIDER=gemini → gemini adapter (not configured)", () => {
    process.env.BRAIN_AI_PROVIDER = "gemini";
    expect(getActiveProvider().modelId()).toBe("gemini-placeholder");
  });

  it("unknown provider value → falls back to openai", () => {
    process.env.BRAIN_AI_PROVIDER = "bogus";
    expect(activeProviderId()).toBe("openai");
  });

  it("claude/gemini adapters return not-implemented errors when called", async () => {
    process.env.BRAIN_AI_PROVIDER = "claude";
    const r = await getActiveProvider().call({ system: "s", user: "u" });
    expect(r.ok).toBe(false);
  });
});

describe("prompt builders", () => {
  it("social messages include the brand brain", () => {
    const m = buildSocialMessages(ctx);
    expect(m.system).toContain("Social Media Agent");
    expect(m.user).toContain("Acolhedor");
  });

  it("design/traffic/analytics/quality builders produce JSON-constrained system prompts", () => {
    expect(buildDesignMessages(ctx).system).toContain("creativeDiagnosis");
    expect(buildTrafficMessages(ctx).system).toContain("funnelRecommendation");
    expect(buildAnalyticsMessages(ctx).system).toContain("primaryKPIs");
    expect(buildQualityMessages(ctx).system).toContain("overallVerdict");
  });
});

describe("validators", () => {
  it("design: valid passes, invalid fails", () => {
    expect(
      validateDesignOutput({
        creativeDiagnosis: "d", visualDirection: "v", designRisks: ["r"],
        assetRequirements: ["a"], promptIdeas: ["p"], creativeBriefRecommendations: ["c"],
        executiveSummary: "e",
      }),
    ).not.toBeNull();
    expect(validateDesignOutput({ creativeDiagnosis: "d" })).toBeNull();
    expect(validateDesignOutput(null)).toBeNull();
  });

  it("traffic: valid passes, invalid fails", () => {
    expect(
      validateTrafficOutput({
        campaignDiagnosis: "d", funnelRecommendation: ["f"], audienceStrategy: ["a"],
        budgetDirection: "b", adAngles: ["x"], optimizationRisks: ["o"], executiveSummary: "e",
      }),
    ).not.toBeNull();
    expect(validateTrafficOutput({ campaignDiagnosis: 5 })).toBeNull();
  });

  it("analytics: valid passes, invalid fails", () => {
    expect(
      validateAnalyticsOutput({
        primaryKPIs: ["k"], reportingCadence: "mensal", attributionModel: "last_click",
        keyInsights: ["i"], performanceGaps: ["g"], recommendations: ["r"], executiveSummary: "e",
      }),
    ).not.toBeNull();
    expect(validateAnalyticsOutput({ primaryKPIs: "not-array" })).toBeNull();
  });

  it("quality: valid verdict passes, invalid verdict fails", () => {
    expect(
      validateQualityOutput({
        overallVerdict: "PASS", criticalFindings: [], recommendations: ["r"],
        patternNotes: ["n"], executiveSummary: "e",
      }),
    ).not.toBeNull();
    expect(
      validateQualityOutput({
        overallVerdict: "MAYBE", criticalFindings: [], recommendations: [],
        patternNotes: [], executiveSummary: "e",
      }),
    ).toBeNull();
  });
});
