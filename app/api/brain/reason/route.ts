// POST /api/brain/reason — Central reasoning gateway (server-side).
//
// Runs the rule-based engine for the requested department, then optionally
// enhances key canvas fields via OpenAI when:
//   OPENAI_API_KEY is set  AND
//   BRAIN_AI_DEPARTMENTS env var includes the dept name (or "all")
//
// Returns: { mode: "openai"|"rule_based", canvas, model, warnings[] }
//
// Phase 1: AI enhancement is active for "strategy" only.
// Phase 4 will add prompt builders for design/traffic/analytics/quality.

import { NextRequest, NextResponse } from "next/server";
import { getSession, isAgencyRole } from "@/lib/auth/session";
import { generate, anyProviderConfigured } from "@/lib/ai/generate";
import {
  buildBrainMessages,
  validateStrategyOutput,
  validateSocialOutput,
  validateDesignOutput,
  validateTrafficOutput,
  validateAnalyticsOutput,
  validateQualityOutput,
  type AIRunContext,
  type BrainAiDept,
} from "@/lib/agency/intelligence/openai-schemas";
import type { StrategyIntelligenceOutput } from "@/lib/agency/intelligence/strategy";
import type { QualityCanvas } from "@/lib/dioli-brain/quality-canvas";
import { getDepartmentDef } from "@/lib/agency/departments";
import { buildClientSnapshot, snapshotBrandBrain, type ClientKnowledgeSnapshot } from "@/lib/dioli-brain/client-snapshot";
import { generateStrategyCanvas } from "@/lib/dioli-brain/strategy-engine";
import { generateSocialCanvas } from "@/lib/dioli-brain/social-engine";
import { generateDesignCanvas } from "@/lib/dioli-brain/design-engine";
import { generateTrafficCanvas } from "@/lib/dioli-brain/traffic-engine";
import { generateAnalyticsCanvas } from "@/lib/dioli-brain/analytics-engine";
import { generateQualityCanvas } from "@/lib/dioli-brain/quality-engine";
import type { StrategyCanvas } from "@/lib/dioli-brain/strategy-canvas";
import type { SocialCanvas } from "@/lib/dioli-brain/social-canvas";
import type { DesignCanvas } from "@/lib/dioli-brain/design-canvas";
import type { TrafficCanvas } from "@/lib/dioli-brain/traffic-canvas";
import type { AnalyticsCanvas } from "@/lib/dioli-brain/analytics-canvas";

const VALID_DEPTS = ["strategy", "social", "design", "traffic", "analytics", "quality"] as const;
type ReasoningDept = (typeof VALID_DEPTS)[number];

function isDeptAiEnabled(dept: string): boolean {
  // Default: AI reasoning is ON for every department whenever a provider key is
  // connected (UI or env). An operator may still restrict it with an explicit
  // BRAIN_AI_DEPARTMENTS allowlist (e.g. "strategy,social"), but it is no longer
  // required to turn AI on — connecting a key in the UI is enough.
  const flag = (process.env.BRAIN_AI_DEPARTMENTS ?? "").trim();
  if (!flag) return true;
  const depts = flag.split(",").map((s) => s.trim().toLowerCase());
  return depts.includes("all") || depts.includes(dept);
}

// ── Coherence guard (Phase A1) ────────────────────────────────────────────────
// AI output is already shape-valid (validateStrategyOutput). The coherence guard
// is a second, semantic filter: AI may return shape-valid but empty/placeholder
// content ("N/A", whitespace, single-char strings). Such output must NOT overlay
// the rule-based canvas — Law 2: AI never degrades the truth. When incoherent,
// the rule-based canvas is preserved untouched and a warning is recorded.

function isMeaningfulString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 10 && v.trim().toUpperCase() !== "N/A";
}

function hasNonEmptyItem(arr: unknown): boolean {
  return Array.isArray(arr) && arr.some((x) => typeof x === "string" && x.trim().length > 0);
}

function isCoherent(output: StrategyIntelligenceOutput): boolean {
  // Each narrative string must be substantive (> 10 chars, not "N/A"/whitespace).
  const strings = [output.diagnosis, output.opportunity, output.risk, output.positioning, output.executiveSummary];
  if (!strings.every(isMeaningfulString)) return false;
  // Array fields must each carry at least one non-empty item.
  if (!hasNonEmptyItem(output.channels)) return false;
  if (!hasNonEmptyItem(output.suggestedDeliverables)) return false;
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.clientId || !isAgencyRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { dept?: unknown; context?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { dept, context } = body;
  if (!dept || typeof dept !== "string" || !(VALID_DEPTS as readonly string[]).includes(dept)) {
    return NextResponse.json(
      { error: `dept must be one of: ${VALID_DEPTS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!context || typeof context !== "object") {
    return NextResponse.json({ error: "context is required" }, { status: 400 });
  }

  const deptId = dept as ReasoningDept;

  const businessName = typeof context.businessName === "string" ? context.businessName : "Cliente";
  const segment      = typeof context.segment === "string" ? context.segment : "";
  const services     = Array.isArray(context.services)   ? (context.services as string[])   : [];
  const objectives   = Array.isArray(context.objectives) ? (context.objectives as string[]) : [];
  const rawContext   = typeof context.rawContext === "string" ? context.rawContext : "";
  const requestId    = typeof context.requestId === "string" ? context.requestId : undefined;

  // Prior canvases — provided by authenticated internal user, trusted as-is.
  const strategyCanvas  = context.strategyCanvas  as StrategyCanvas  | undefined;
  const socialCanvas    = context.socialCanvas    as SocialCanvas    | undefined;
  const designCanvas    = context.designCanvas    as DesignCanvas    | undefined;
  const trafficCanvas   = context.trafficCanvas   as TrafficCanvas   | undefined;
  const analyticsCanvas = context.analyticsCanvas as AnalyticsCanvas | undefined;

  const warnings: string[] = [];
  let mode: "openai" | "rule_based" = "rule_based";
  let model = "rule_based";
  let canvas: unknown;

  // ── 0. ClientKnowledgeSnapshot (Phase 2) ──────────────────────────────────────
  // When a requestId is present, the server reads DB truth (request + BrandBrain)
  // instead of trusting only what the UI passed. Null snapshot → backwards compat:
  // fall back to the client-supplied context. Snapshot fields take precedence only
  // where they carry real data (never invented).
  let snapshot: ClientKnowledgeSnapshot | null = null;
  if (requestId) {
    try {
      snapshot = await buildClientSnapshot(requestId);
    } catch (e) {
      console.error("[brain/reason] snapshot read failed", e);
      warnings.push("Snapshot do cliente indisponível — usando contexto enviado pela UI.");
    }
  }
  // Engine inputs — enriched from snapshot when available, else UI context.
  const effBusinessName = snapshot?.businessName || businessName;
  const effSegment      = snapshot?.segment || segment;
  const effServices     = snapshot && snapshot.services.length > 0 ? snapshot.services : services;
  const effObjectives   = snapshot && snapshot.objectives.length > 0 ? snapshot.objectives : objectives;
  const effRawContext   = snapshot?.rawContext || rawContext;

  // ── 1. Rule-based engine (always runs — provides full canvas structure) ───────

  if (deptId === "strategy") {
    canvas = generateStrategyCanvas({
      businessName: effBusinessName, segment: effSegment, objectives: effObjectives,
      services: effServices, rawContext: effRawContext, requestId, source: "request",
    });
  } else if (deptId === "social") {
    if (!strategyCanvas) {
      return NextResponse.json({ error: "strategyCanvas required for social dept" }, { status: 400 });
    }
    canvas = generateSocialCanvas({ strategyCanvas, requestId, source: "request" });
  } else if (deptId === "design") {
    if (!socialCanvas) {
      return NextResponse.json({ error: "socialCanvas required for design dept" }, { status: 400 });
    }
    canvas = generateDesignCanvas({ socialCanvas, requestId, source: "request" });
  } else if (deptId === "traffic") {
    if (!strategyCanvas) {
      return NextResponse.json({ error: "strategyCanvas required for traffic dept" }, { status: 400 });
    }
    canvas = generateTrafficCanvas({
      strategyCanvas, socialCanvas, designCanvas, requestId, source: "request",
    });
  } else if (deptId === "analytics") {
    if (!strategyCanvas) {
      return NextResponse.json({ error: "strategyCanvas required for analytics dept" }, { status: 400 });
    }
    canvas = generateAnalyticsCanvas({
      strategyCanvas, socialCanvas, designCanvas, trafficCanvas, requestId, source: "request",
    });
  } else {
    // quality
    canvas = generateQualityCanvas({
      strategyCanvas, socialCanvas, designCanvas, trafficCanvas, analyticsCanvas,
      requestId, source: "request",
    });
  }

  // ── 2. AI enhancement (all 6 depts) ───────────────────────────────────────────
  // Provider-agnostic via the unified caller (lib/ai/generate.ts), which resolves
  // the key from the Integrations UI first and env second, then calls whichever
  // provider is connected (Claude / OpenAI / Gemini). The rule-based canvas is
  // never overwritten structurally — AI only overlays narrative fields, and only
  // when validated + coherent. AI off/fail → rule-based, no crash.

  if (isDeptAiEnabled(deptId) && (await anyProviderConfigured(session.workspaceId))) {
    const ctx: AIRunContext = {
      projectName:      effBusinessName,
      clientName:       effBusinessName,
      clientIndustry:   effSegment,
      projectGoal:      effObjectives.join("; ") || effRawContext.slice(0, 300),
      briefingAudience: snapshot?.targetAudience,
      brandBrain:       snapshot ? snapshotBrandBrain(snapshot) : undefined,
      prompt:           DEPT_PROMPT[deptId],
    };
    const messages = buildBrainMessages(deptId as BrainAiDept, ctx);
    const result = await generate({
      system:      messages.system,
      user:        messages.user,
      maxTokens:   2048,
      workspaceId: session.workspaceId,
    });

    if (!result.ok) {
      warnings.push(`IA indisponível (${result.error}) — motor rule-based preservado.`);
    } else {
      const applied = applyAiOverlay(deptId, canvas, result.data, warnings);
      if (applied) {
        mode  = "openai"; // "AI overlay applied" (provider-agnostic label)
        model = `${result.provider}:${result.model}`;
      }
    }
  }

  return NextResponse.json({ mode, canvas, model, warnings });
}

// Operator-editable system instruction per reasoning dept. (DepartmentDef ids
// differ from reasoning-dept ids, so this map bridges them.)
const DEPT_PROMPT: Record<ReasoningDept, string> = {
  strategy:  getDepartmentDef("strategy")?.defaultPrompt  ?? "Você é o Strategy Agent da Dioli Agência.",
  social:    getDepartmentDef("social-media")?.defaultPrompt ?? "Você é o Social Media Agent da Dioli Agência.",
  design:    getDepartmentDef("design")?.defaultPrompt   ?? "Você é o Design Agent da Dioli Agência.",
  traffic:   getDepartmentDef("paid-traffic")?.defaultPrompt ?? "Você é o Ads Agent da Dioli Agência.",
  analytics: "Você é o Analytics Agent da Dioli Agência.",
  quality:   "Você é o Quality Agent da Dioli Agência.",
};

// Overlays validated + coherent AI narrative onto the rule-based canvas. Returns
// true if AI content was applied; false if rejected (a warning is pushed). Never
// overwrites structural fields the quality gate depends on.
function applyAiOverlay(
  dept: ReasoningDept,
  canvas: unknown,
  data: unknown,
  warnings: string[],
): boolean {
  if (dept === "strategy") {
    const aiOut = validateStrategyOutput(data);
    if (!aiOut) { warnings.push("AI output shape inválido — motor rule-based preservado."); return false; }
    if (!isCoherent(aiOut)) { warnings.push("AI output incoerente — motor rule-based preservado."); return false; }
    const c = canvas as StrategyCanvas;
    c.businessSummary      = aiOut.diagnosis;
    c.positioningStatement = aiOut.positioning;
    if (aiOut.channels.length > 0) c.priorityChannels = aiOut.channels;
    if (aiOut.suggestedDeliverables.length > 0) c.recommendedServices = aiOut.suggestedDeliverables;
    if (aiOut.opportunity) c.opportunities = [aiOut.opportunity, ...c.opportunities.slice(0, 2)];
    if (aiOut.risk) c.risks = [aiOut.risk, ...c.risks.slice(0, 2)];
    return true;
  }
  if (dept === "social") {
    const aiOut = validateSocialOutput(data);
    if (!aiOut) { warnings.push("AI output shape inválido — motor rule-based preservado."); return false; }
    const c = canvas as SocialCanvas;
    if (aiOut.executiveSummary.trim().length > 10) c.communicationDirection = aiOut.executiveSummary;
    if (aiOut.copyTone.trim().length > 0) c.monthlyDirection = `${c.monthlyDirection} ${aiOut.copyTone}`.trim();
    if (aiOut.contentThemes.length > 0) c.publishingRecommendations = [...aiOut.contentThemes, ...c.publishingRecommendations].slice(0, 8);
    return true;
  }
  if (dept === "design") {
    const aiOut = validateDesignOutput(data);
    if (!aiOut) { warnings.push("AI output shape inválido — motor rule-based preservado."); return false; }
    const c = canvas as DesignCanvas;
    if (aiOut.visualDirection.trim().length > 15) c.visualConcept = aiOut.visualDirection;
    if (aiOut.creativeDiagnosis.trim().length > 10) c.imageryDirection = aiOut.creativeDiagnosis;
    if (aiOut.designRisks.length > 0) c.productionNotes = [...aiOut.designRisks, ...c.productionNotes].slice(0, 8);
    return true;
  }
  if (dept === "traffic") {
    const aiOut = validateTrafficOutput(data);
    if (!aiOut) { warnings.push("AI output shape inválido — motor rule-based preservado."); return false; }
    const c = canvas as TrafficCanvas;
    // Lei 2: AI writes interpretive strings only. budgetAllocation/channelBreakdown/funnelBreakdown
    // (all numeric) remain rule-based — never overwritten here. gateway-safety.test.ts asserts this.
    if (aiOut.campaignDiagnosis.trim().length > 10) c.channelRationale = aiOut.campaignDiagnosis;
    if (aiOut.budgetDirection.trim().length > 10) c.offerContext = `${c.offerContext} ${aiOut.budgetDirection}`.trim();
    if (aiOut.optimizationRisks.length > 0) c.keyRisks = [...aiOut.optimizationRisks, ...c.keyRisks].slice(0, 8);
    return true;
  }
  if (dept === "analytics") {
    const aiOut = validateAnalyticsOutput(data);
    if (!aiOut) { warnings.push("AI output shape inválido — motor rule-based preservado."); return false; }
    const c = canvas as AnalyticsCanvas;
    // Lei 2: AI writes interpretive strings only. passCount/warningCount/failCount/estimatedContribution
    // (all numeric) remain rule-based — never overwritten here. gateway-safety.test.ts asserts this.
    if (aiOut.keyInsights.length > 0) c.keyInsights = [...aiOut.keyInsights, ...c.keyInsights].slice(0, 8);
    if (aiOut.recommendations.length > 0) c.alertThresholds = [...c.alertThresholds, ...aiOut.recommendations].slice(0, 8);
    if (aiOut.primaryKPIs.length > 0 && c.primaryKPI.trim().length === 0) c.primaryKPI = aiOut.primaryKPIs[0];
    return true;
  }
  // quality — overlay verdict only when AI and rule-based agree (conservative).
  const aiOut = validateQualityOutput(data);
  if (!aiOut) { warnings.push("AI output shape inválido — motor rule-based preservado."); return false; }
  const c = canvas as QualityCanvas;
  if (aiOut.overallVerdict === c.overallVerdict) {
    if (aiOut.criticalFindings.length > 0) c.keyFindings = [...aiOut.criticalFindings, ...c.keyFindings].slice(0, 8);
    if (aiOut.executiveSummary.trim().length > 10) c.verdictRationale = aiOut.executiveSummary;
    return true;
  }
  warnings.push(`Veredito de qualidade AI (${aiOut.overallVerdict}) diverge do rule-based (${c.overallVerdict}) — rule-based mantido.`);
  return false;
}
