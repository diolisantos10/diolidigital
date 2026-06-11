// Dioli Brain — Social Canvas
// Primary output of the Social Media Department (first execution department).
// Receives StrategyCanvas as input; produces editorial direction, content plan
// and editorial calendar. Pure types + quality gate. No store access, no side effects.

// ── Formats & statuses ────────────────────────────────────────────────────────

export type SocialContentFormat =
  | "post"
  | "carrossel"
  | "story"
  | "reel"
  | "live"
  | "destaque";

export type ContentStatus = "draft" | "planned" | "approved" | "published";

// ── Content architecture ──────────────────────────────────────────────────────

export interface ContentTerritory {
  id: string;
  name: string;             // "Bastidores da cozinha"
  description: string;
  importance: "alta" | "media" | "baixa";
  examples: string[];
}

export interface EditorialPillar {
  id: string;
  name: string;             // "Autoridade"
  objective: string;        // what this pillar accomplishes
  frequency: string;        // "2x por semana"
  priority: number;         // 1 = highest
}

export interface ContentTheme {
  id: string;
  title: string;            // "Por trás do prato assinatura"
  pillar: string;           // EditorialPillar name
  objective: string;
  format: SocialContentFormat;
  channel: string;
}

// ── Content Plan ──────────────────────────────────────────────────────────────

export interface ContentPlanWeek {
  week: 1 | 2 | 3 | 4;
  focus: string;
  themeIds: string[];       // ContentTheme ids planned for this week
}

export interface ContentPlan {
  monthLabel: string;       // "Mês 1"
  monthlyFocus: string;
  weeks: ContentPlanWeek[];
  themes: ContentTheme[];
  formatRecommendations: string[];
  publishingSuggestions: string[];
  totalPosts: number;
}

// ── Editorial Calendar ────────────────────────────────────────────────────────

export interface EditorialCalendarEntry {
  id: string;
  week: 1 | 2 | 3 | 4;
  day: string;              // "Segunda", "Quarta", "Sexta"
  date: string;             // "Semana 1 — Segunda"
  theme: string;
  pillar: string;
  format: SocialContentFormat;
  channel: string;
  status: ContentStatus;
}

export interface EditorialCalendar {
  monthLabel: string;
  entries: EditorialCalendarEntry[];
}

// ── Social Quality Gate ───────────────────────────────────────────────────────

export interface SocialQualityGateItem {
  id: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export interface SocialQualityGateResult {
  overall: "PASS" | "WARNING" | "FAIL";
  items: SocialQualityGateItem[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

// ── Cognitive Flow trace (social execution) ───────────────────────────────────

export interface SocialFlowStep {
  stepId: string;
  order: number;
  label: string;
  completed: boolean;
  summary: string;
}

// ── Social Canvas ─────────────────────────────────────────────────────────────

export type SocialCanvasStatus = "draft" | "approved" | "rejected";

export interface SocialCanvas {
  id: string;
  requestId?: string;            // linked ClientRequest (real pipeline)
  strategyCanvasId?: string;     // linked StrategyCanvas — Social never runs without Strategy
  clientName: string;
  segment: string;
  source: "request" | "simulation";
  status: SocialCanvasStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;

  // ── Canvas content (Part 2 structure) ──
  contentObjective: string;
  contentRole: string;                       // role of content in the strategy
  targetAudience: string;
  communicationDirection: string;
  contentTerritories: ContentTerritory[];
  editorialPillars: EditorialPillar[];
  recommendedFrequency: string;              // "5x por semana"
  recommendedFormats: SocialContentFormat[];
  priorityChannels: string[];
  campaignSupport: string[];                 // how content supports campaigns
  contentOpportunities: string[];
  contentRisks: string[];
  monthlyDirection: string;
  weeklyDirection: string[];                 // 4 weekly focus lines
  contentThemes: ContentTheme[];
  publishingRecommendations: string[];
  successIndicators: string[];

  // ── Operational artifacts ──
  contentPlan: ContentPlan;
  editorialCalendar: EditorialCalendar;

  // ── Brain artifacts ──
  qualityGateResult: SocialQualityGateResult;
  cognitiveFlowTrace: SocialFlowStep[];
}

// ── Quality Gate (12-item checklist — FAIL blocks approval) ──────────────────

export function runSocialQualityGate(
  canvas: Omit<SocialCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source">,
): SocialQualityGateResult {
  const items: SocialQualityGateItem[] = [
    {
      id: "objective_clear",
      label: "Objetivo de conteúdo claro",
      status: canvas.contentObjective.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.contentObjective || "Objetivo de conteúdo não definido.",
    },
    {
      id: "territories_defined",
      label: "Territórios de conteúdo definidos",
      status: canvas.contentTerritories.length >= 3 ? "PASS"
        : canvas.contentTerritories.length >= 1 ? "WARNING" : "FAIL",
      detail: canvas.contentTerritories.length > 0
        ? canvas.contentTerritories.map((t) => t.name).join("; ")
        : "Nenhum território definido.",
    },
    {
      id: "pillars_defined",
      label: "Pilares editoriais definidos",
      status: canvas.editorialPillars.length >= 2 ? "PASS"
        : canvas.editorialPillars.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.editorialPillars.length > 0
        ? canvas.editorialPillars.map((p) => p.name).join("; ")
        : "Nenhum pilar editorial definido.",
    },
    {
      id: "audience_clear",
      label: "Público-alvo claro",
      status: canvas.targetAudience.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.targetAudience || "Público-alvo não definido.",
    },
    {
      id: "communication_direction",
      label: "Direção de comunicação clara",
      status: canvas.communicationDirection.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.communicationDirection || "Direção de comunicação não definida.",
    },
    {
      id: "frequency_defined",
      label: "Frequência definida",
      status: canvas.recommendedFrequency.trim().length > 0 ? "PASS" : "FAIL",
      detail: canvas.recommendedFrequency || "Frequência de postagem não definida.",
    },
    {
      id: "formats_defined",
      label: "Formatos definidos",
      status: canvas.recommendedFormats.length >= 2 ? "PASS"
        : canvas.recommendedFormats.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.recommendedFormats.length > 0
        ? canvas.recommendedFormats.join(", ")
        : "Nenhum formato recomendado.",
    },
    {
      id: "channels_defined",
      label: "Canais definidos",
      status: canvas.priorityChannels.length >= 1 ? "PASS" : "FAIL",
      detail: canvas.priorityChannels.length > 0
        ? canvas.priorityChannels.join(", ")
        : "Nenhum canal prioritário definido.",
    },
    {
      id: "monthly_direction",
      label: "Direção mensal definida",
      status: canvas.monthlyDirection.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.monthlyDirection || "Direção mensal não definida.",
    },
    {
      id: "weekly_direction",
      label: "Direção semanal definida",
      status: canvas.weeklyDirection.length >= 4 ? "PASS"
        : canvas.weeklyDirection.length >= 1 ? "WARNING" : "FAIL",
      detail: canvas.weeklyDirection.length > 0
        ? `${canvas.weeklyDirection.length} semanas direcionadas`
        : "Nenhuma direção semanal definida.",
    },
    {
      id: "themes_defined",
      label: "Temas de conteúdo definidos",
      status: canvas.contentThemes.length >= 4 ? "PASS"
        : canvas.contentThemes.length >= 1 ? "WARNING" : "FAIL",
      detail: canvas.contentThemes.length > 0
        ? `${canvas.contentThemes.length} temas planejados`
        : "Nenhum tema de conteúdo definido.",
    },
    {
      id: "success_indicators",
      label: "Indicadores de sucesso definidos",
      status: canvas.successIndicators.length >= 2 ? "PASS"
        : canvas.successIndicators.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.successIndicators.length > 0
        ? canvas.successIndicators.join("; ")
        : "Nenhum indicador de sucesso definido.",
    },
  ];

  const failCount    = items.filter((i) => i.status === "FAIL").length;
  const warningCount = items.filter((i) => i.status === "WARNING").length;
  const passCount    = items.filter((i) => i.status === "PASS").length;
  const overall: "PASS" | "WARNING" | "FAIL" =
    failCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS";

  return { overall, items, passCount, warningCount, failCount };
}
