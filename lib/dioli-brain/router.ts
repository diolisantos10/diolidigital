// Dioli Brain — AI Engine Router
// Provider-agnostic routing configuration.
// The model can change. The Brain cannot.
// Current state: all depts use rule_based or openai (single provider).
// This config defines the target state — used for documentation and future routing.

import type { EngineRouteConfig } from "./types";

export const ENGINE_ROUTES: EngineRouteConfig[] = [
  {
    departmentId: "client-service-sdr",
    preferredProvider: "openai",
    fallbackProvider: "rule_based",
    capabilityRequired: "fast_commercial",
    costTier: "medium",
    latencyTier: "realtime",
    qualityTier: "professional",
    notes: "SDR needs fast, conversational responses. Latency is critical for briefing flow.",
  },
  {
    departmentId: "strategy",
    preferredProvider: "openai",
    fallbackProvider: "rule_based",
    capabilityRequired: "reasoning",
    costTier: "high",
    latencyTier: "moderate",
    qualityTier: "premium",
    notes: "Strategy Room requires deep reasoning across 6 specialist perspectives.",
  },
  {
    departmentId: "social-media",
    preferredProvider: "openai",
    fallbackProvider: "rule_based",
    capabilityRequired: "creative_copy",
    costTier: "medium",
    latencyTier: "fast",
    qualityTier: "professional",
    notes: "Social content requires brand-voice-aware copy generation.",
  },
  {
    departmentId: "design",
    preferredProvider: "openai",
    fallbackProvider: "rule_based",
    capabilityRequired: "multimodal",
    costTier: "high",
    latencyTier: "slow",
    qualityTier: "premium",
    notes: "Design needs multimodal capability for image gen and visual briefs.",
  },
  {
    departmentId: "paid-traffic",
    preferredProvider: "openai",
    fallbackProvider: "rule_based",
    capabilityRequired: "analytical",
    costTier: "medium",
    latencyTier: "fast",
    qualityTier: "professional",
    notes: "Paid traffic needs data-driven, performance-focused output.",
  },
  {
    departmentId: "project-management",
    preferredProvider: "rule_based",
    fallbackProvider: "rule_based",
    capabilityRequired: "operational",
    costTier: "low",
    latencyTier: "realtime",
    qualityTier: "standard",
    notes: "PM tasks are largely deterministic and rule-based. Low cost, always available.",
  },
  {
    departmentId: "analytics",
    preferredProvider: "openai",
    fallbackProvider: "rule_based",
    capabilityRequired: "data_reasoning",
    costTier: "high",
    latencyTier: "moderate",
    qualityTier: "premium",
    notes: "Analytics requires statistical reasoning and actionable insight generation.",
  },
  {
    departmentId: "quality",
    preferredProvider: "openai",
    fallbackProvider: "rule_based",
    capabilityRequired: "multi_model_audit",
    costTier: "high",
    latencyTier: "slow",
    qualityTier: "premium",
    notes: "Quality audit should use a different model from the one that produced the output.",
  },
];

export function getEngineRoute(departmentId: string): EngineRouteConfig | undefined {
  return ENGINE_ROUTES.find((r) => r.departmentId === departmentId);
}

export function getRoutesByCapability(capability: EngineRouteConfig["capabilityRequired"]): EngineRouteConfig[] {
  return ENGINE_ROUTES.filter((r) => r.capabilityRequired === capability);
}
