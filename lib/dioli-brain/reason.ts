"use client";

// Central reasoning gateway — the single entry point for all department reasoning
// in the DB pipeline. Calls POST /api/brain/reason; the server applies AI reasoning
// when OPENAI_API_KEY + BRAIN_AI_DEPARTMENTS are configured, and falls back to the
// rule-based engine transparently. The caller receives the same canvas type regardless
// of which provider ran.
//
// Phase 2 will add ClientKnowledgeSnapshot so the server auto-reads BrandBrain
// from the DB instead of relying solely on the client-assembled context.

export type ReasoningDept = "strategy" | "social" | "design" | "traffic" | "analytics" | "quality";

// Thin context the client assembles before calling. Prior canvases for
// downstream departments are passed as-is (opaque); the server re-types them.
export interface ReasoningContext {
  businessName: string;
  segment?: string;
  services?: string[];
  objectives?: string[];
  rawContext?: string;
  requestId?: string;
  strategyCanvas?: unknown;
  socialCanvas?: unknown;
  designCanvas?: unknown;
  trafficCanvas?: unknown;
  analyticsCanvas?: unknown;
}

export interface ReasoningResult {
  mode: "openai" | "rule_based";
  canvas: unknown;
  model: string;
  warnings?: string[];
}

// Throws on HTTP error so the caller's existing try/catch handles it —
// identical error surface to the previous direct engine calls.
export async function reasonAsDepartment(
  dept: ReasoningDept,
  context: ReasoningContext,
): Promise<ReasoningResult> {
  const res = await fetch("/api/brain/reason", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dept, context }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as Record<string, unknown>) as Record<string, unknown>;
    throw new Error((err.error as string | undefined) ?? `reasonAsDepartment: HTTP ${res.status}`);
  }
  return res.json() as Promise<ReasoningResult>;
}
