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
import { callOpenAI, isOpenAIConfigured } from "@/lib/ai/openai-provider";
import {
  buildStrategyMessages,
  validateStrategyOutput,
  type AIRunContext,
} from "@/lib/agency/intelligence/openai-schemas";
import { getDepartmentDef } from "@/lib/agency/departments";
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
  const flag = process.env.BRAIN_AI_DEPARTMENTS ?? "";
  if (!flag) return false;
  const depts = flag.split(",").map((s) => s.trim().toLowerCase());
  return depts.includes("all") || depts.includes(dept);
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

  // ── 1. Rule-based engine (always runs — provides full canvas structure) ───────

  if (deptId === "strategy") {
    canvas = generateStrategyCanvas({
      businessName, segment, objectives, services, rawContext, requestId, source: "request",
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

  // ── 2. AI enhancement (strategy only in Phase 1) ──────────────────────────────
  // Phase 4 will add prompt builders for social/design/traffic/analytics/quality.

  if (isOpenAIConfigured() && isDeptAiEnabled(deptId) && deptId === "strategy") {
    const def = getDepartmentDef("strategy");
    const ctx: AIRunContext = {
      projectName:     businessName,
      clientName:      businessName,
      clientIndustry:  segment,
      projectGoal:     objectives.join("; ") || rawContext.slice(0, 300),
      prompt:          def?.defaultPrompt ?? "Você é o Strategy Agent da Dioli Agência.",
    };
    const messages = buildStrategyMessages(ctx);
    const result = await callOpenAI(messages);

    if (result.ok) {
      const aiOut = validateStrategyOutput(result.data);
      if (aiOut) {
        const c = canvas as StrategyCanvas;
        // Overlay AI narrative on top of rule-based structural canvas.
        c.businessSummary      = aiOut.diagnosis;
        c.positioningStatement = aiOut.positioning;
        if (aiOut.channels.length > 0)
          c.priorityChannels = aiOut.channels;
        if (aiOut.suggestedDeliverables.length > 0)
          c.recommendedServices = aiOut.suggestedDeliverables;
        if (aiOut.opportunity)
          c.opportunities = [aiOut.opportunity, ...c.opportunities.slice(0, 2)];
        if (aiOut.risk)
          c.risks = [aiOut.risk, ...c.risks.slice(0, 2)];
        mode  = "openai";
        model = result.model;
      } else {
        warnings.push("AI output shape inválido — motor rule-based preservado para campos estruturais.");
      }
    } else {
      warnings.push(`AI indisponível (${result.error}) — motor rule-based preservado.`);
    }
  }

  return NextResponse.json({ mode, canvas, model, warnings });
}
