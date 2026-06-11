// Dioli Brain — Design Canvas
// Primary output of the Design Department.
// Receives SocialCanvas as input; produces creative briefs, image prompt specs,
// and visual asset requirements. Pure types + quality gate. No store access.

// ── Asset types & statuses ────────────────────────────────────────────────────

export type DesignAssetType =
  | "post_feed"
  | "story"
  | "carrossel_slide"
  | "reel_thumbnail"
  | "reel_overlay"
  | "cover"
  | "highlight_cover"
  | "banner"
  | "avatar";

export type DesignAssetStatus = "pending" | "in_progress" | "review" | "approved" | "published";

export type DesignCanvasStatus = "draft" | "approved" | "rejected";

// ── Creative Brief ────────────────────────────────────────────────────────────

export interface CreativeBrief {
  id: string;
  themeId: string;          // ContentTheme id from SocialCanvas
  themeTitle: string;       // "Por trás do prato assinatura"
  pillar: string;           // editorial pillar name
  format: string;           // "post" | "carrossel" | etc.
  channel: string;          // "Instagram" | "TikTok" | etc.
  objective: string;        // what this piece accomplishes
  visualConcept: string;    // "Composição minimalista com prato em destaque"
  keyMessage: string;       // the core message to communicate visually
  toneOfVoice: string;      // visual tone — "Elegante, sóbrio, desejável"
  doList: string[];         // visual must-haves
  dontList: string[];       // visual prohibitions
  referenceStyle: string;   // "Fotografia editorial de alta gastronomia"
}

// ── Image Prompt Spec ─────────────────────────────────────────────────────────

export interface ImagePromptSpec {
  id: string;
  briefId: string;          // linked CreativeBrief id
  promptPrimary: string;    // AI image generation prompt
  promptNegative: string;   // negative prompt (what to avoid)
  aspectRatio: "1:1" | "9:16" | "4:5" | "16:9";
  styleModifiers: string[]; // ["photorealistic", "soft lighting", ...]
  colorPalette: string[];   // ["#3B2F2F", "#F5E6D3", ...] or descriptive
  subject: string;          // primary visual subject
  mood: string;             // "acolhedor e apetitoso"
}

// ── Visual Asset Requirement ──────────────────────────────────────────────────

export interface VisualAssetRequirement {
  id: string;
  assetType: DesignAssetType;
  format: string;           // content format driving this requirement
  channel: string;
  dimensions: string;       // "1080×1080" | "1080×1920"
  themeId: string;
  status: DesignAssetStatus;
  priority: "alta" | "media" | "baixa";
}

// ── Design Quality Gate ───────────────────────────────────────────────────────

export interface DesignQualityGateItem {
  id: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export interface DesignQualityGateResult {
  overall: "PASS" | "WARNING" | "FAIL";
  items: DesignQualityGateItem[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

export interface DesignFlowStep {
  stepId: string;
  order: number;
  label: string;
  completed: boolean;
  summary: string;
}

// ── Design Canvas ─────────────────────────────────────────────────────────────

export interface DesignCanvas {
  id: string;
  socialCanvasId: string;         // required — Design never runs without Social
  strategyCanvasId?: string;      // inherited from SocialCanvas
  requestId?: string;
  clientName: string;
  segment: string;
  source: "request" | "simulation";
  status: DesignCanvasStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;

  // ── Visual Direction ──
  visualConcept: string;          // master creative concept for the period
  visualTone: string;             // overall visual feeling
  colorDirection: string;         // palette guidance
  typographyDirection: string;    // font and text style guidance
  imageryDirection: string;       // photo/video/illustration direction
  brandConsistencyRules: string[];

  // ── Creative Production ──
  creativeBriefs: CreativeBrief[];
  imagePromptSpecs: ImagePromptSpec[];
  assetRequirements: VisualAssetRequirement[];

  // ── Production Summary ──
  totalAssetsRequired: number;
  priorityAssetIds: string[];     // VisualAssetRequirement ids
  productionNotes: string[];

  // ── Brain artifacts ──
  qualityGateResult: DesignQualityGateResult;
  cognitiveFlowTrace: DesignFlowStep[];
}

// ── Quality Gate (10-item checklist) ─────────────────────────────────────────

export function runDesignQualityGate(
  canvas: Omit<DesignCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source">,
): DesignQualityGateResult {
  const items: DesignQualityGateItem[] = [
    {
      id: "visual_concept",
      label: "Conceito visual definido",
      status: canvas.visualConcept.trim().length >= 15 ? "PASS" : "FAIL",
      detail: canvas.visualConcept || "Conceito visual não definido.",
    },
    {
      id: "color_direction",
      label: "Direção de cor definida",
      status: canvas.colorDirection.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.colorDirection || "Direção de cor não definida.",
    },
    {
      id: "typography_direction",
      label: "Direção tipográfica definida",
      status: canvas.typographyDirection.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.typographyDirection || "Direção tipográfica não definida.",
    },
    {
      id: "imagery_direction",
      label: "Direção de imagem definida",
      status: canvas.imageryDirection.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.imageryDirection || "Direção de imagem não definida.",
    },
    {
      id: "brand_rules",
      label: "Regras de marca definidas",
      status: canvas.brandConsistencyRules.length >= 2 ? "PASS"
        : canvas.brandConsistencyRules.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.brandConsistencyRules.length > 0
        ? canvas.brandConsistencyRules.join("; ")
        : "Nenhuma regra de marca definida.",
    },
    {
      id: "creative_briefs",
      label: "Briefs criativos gerados",
      status: canvas.creativeBriefs.length >= 3 ? "PASS"
        : canvas.creativeBriefs.length >= 1 ? "WARNING" : "FAIL",
      detail: canvas.creativeBriefs.length > 0
        ? `${canvas.creativeBriefs.length} brief(s) gerado(s)`
        : "Nenhum brief criativo gerado.",
    },
    {
      id: "image_prompts",
      label: "Prompts de imagem gerados",
      status: canvas.imagePromptSpecs.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.imagePromptSpecs.length > 0
        ? `${canvas.imagePromptSpecs.length} prompt(s) gerado(s)`
        : "Nenhum prompt de imagem gerado.",
    },
    {
      id: "asset_requirements",
      label: "Requisitos de assets definidos",
      status: canvas.assetRequirements.length >= 3 ? "PASS"
        : canvas.assetRequirements.length >= 1 ? "WARNING" : "FAIL",
      detail: canvas.assetRequirements.length > 0
        ? `${canvas.assetRequirements.length} asset(s) requerido(s)`
        : "Nenhum asset requerido definido.",
    },
    {
      id: "priority_assets",
      label: "Assets prioritários identificados",
      status: canvas.priorityAssetIds.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.priorityAssetIds.length > 0
        ? `${canvas.priorityAssetIds.length} asset(s) prioritário(s)`
        : "Nenhum asset prioritário identificado.",
    },
    {
      id: "social_canvas_linked",
      label: "Social Canvas vinculado",
      status: canvas.socialCanvasId.length > 0 ? "PASS" : "FAIL",
      detail: canvas.socialCanvasId || "Design sem Social Canvas vinculado — violação do Dioli Standard.",
    },
  ];

  const failCount    = items.filter((i) => i.status === "FAIL").length;
  const warningCount = items.filter((i) => i.status === "WARNING").length;
  const passCount    = items.filter((i) => i.status === "PASS").length;
  const overall: "PASS" | "WARNING" | "FAIL" =
    failCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS";

  return { overall, items, passCount, warningCount, failCount };
}
