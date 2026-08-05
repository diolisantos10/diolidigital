// Dioli Brain — Traffic Canvas
// Primary output of the Paid Traffic Department.
// Receives StrategyCanvas + SocialCanvas + DesignCanvas inputs; produces
// campaign structure, audience model, budget allocation, channel allocation,
// creative requirements, and offer mapping.
// Pure types + quality gate. No store access, no side effects.

// ── Channel & Budget types ────────────────────────────────────────────────────

export type TrafficChannel =
  | "meta_ads"
  | "google_ads"
  | "youtube_ads"
  | "tiktok_ads"
  | "linkedin_ads";

export type BudgetScenario = "low" | "medium" | "high" | "premium";

/**
 * A ORIGEM DO NÚMERO — o campo que faltava para o plano parar de mentir.
 *
 * `verba_informada`: o total mensal saiu da verba que o CLIENTE informou
 * (briefing/contexto, lida pelo servidor). Os projetados derivam dele.
 *
 * `faixa_de_referencia`: o cliente não informou verba. Os números NÃO são
 * estimativa dele — são a faixa do segmento, e todos os campos projetados
 * carregam `MARCA_FAIXA_DE_REFERENCIA` no texto para que a marca não se perca
 * quando o valor for copiado para um slide, um e-mail ou um card do portal.
 */
export type BudgetBasis = "verba_informada" | "faixa_de_referencia";

/**
 * A marca viaja GRUDADA no valor, e isso é de propósito.
 *
 * O filtro de preço do portal segura o "R$", mas nunca segurou "6x–12x" nem
 * "30K–80K": o ROAS e o alcance projetados chegavam limpos ao time da agência,
 * que trabalhava em cima deles como se fossem deste cliente. Um flag booleano
 * no canvas não resolve — quem copia o número não copia o flag. A ressalva
 * precisa estar dentro da string.
 */
export const MARCA_FAIXA_DE_REFERENCIA =
  "faixa de referência do segmento, não estimativa deste cliente";

export type CampaignObjective =
  | "awareness"
  | "traffic"
  | "leads"
  | "sales"
  | "app_installs"
  | "store_visits"
  | "retargeting";

export type AudienceType =
  | "cold_top"
  | "warm_middle"
  | "hot_bottom"
  | "lookalike"
  | "retargeting"
  | "custom";

export type TrafficCanvasStatus = "draft" | "approved" | "rejected";

// ── Campaign Structure ────────────────────────────────────────────────────────

export interface TrafficCampaign {
  id: string;
  name: string;
  channel: TrafficChannel;
  objective: CampaignObjective;
  budgetAllocation: number;        // percentage of total budget
  budgetBRL: number;               // calculated from total
  audienceType: AudienceType;
  expectedCPA: string;             // "R$ 15–25"
  expectedROAS: string;            // "3x–5x"
  priority: "alta" | "media" | "baixa";
}

// ── Audience Model ────────────────────────────────────────────────────────────

export interface AudienceSegment {
  id: string;
  name: string;
  type: AudienceType;
  channel: TrafficChannel;
  description: string;
  interests: string[];
  behaviors: string[];
  estimatedReach: string;          // "50K–200K"
  funnelStage: "top" | "middle" | "bottom";
}

// ── Creative Requirements ─────────────────────────────────────────────────────

export interface CreativeRequirement {
  id: string;
  campaignId: string;
  format: string;                  // "1080×1080 static", "9:16 video 15s"
  channel: TrafficChannel;
  copyDirection: string;           // headline/body direction
  ctaText: string;
  quantity: number;
  designCanvasId?: string;         // linked DesignCanvas if available
}

// ── Budget Allocation ─────────────────────────────────────────────────────────

export interface BudgetAllocation {
  scenario: BudgetScenario;
  basis: BudgetBasis;
  /** A ressalva em uma frase, para quem lê só a tabela de budget. */
  basisNote: string;
  totalMonthlyBRL: number;
  managementFeePercent: number;    // agency fee — always separate from media budget
  managementFeeBRL: number;
  mediaBudgetBRL: number;
  channelBreakdown: { channel: TrafficChannel; percent: number; brl: number }[];
  funnelBreakdown: { stage: "top" | "middle" | "bottom"; percent: number; brl: number }[];
}

// ── Offer Mapping ─────────────────────────────────────────────────────────────

export interface OfferMapping {
  id: string;
  name: string;
  description: string;
  targetAudience: string;
  funnelStage: "top" | "middle" | "bottom";
  urgencyLevel: "none" | "low" | "medium" | "high";
  cta: string;
  landingPage: string;             // destination type: "site", "whatsapp", "landing"
}

// ── Traffic Quality Gate ──────────────────────────────────────────────────────

export interface TrafficQualityGateItem {
  id: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export interface TrafficQualityGateResult {
  overall: "PASS" | "WARNING" | "FAIL";
  items: TrafficQualityGateItem[];
  passCount: number;
  warningCount: number;
  failCount: number;
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

export interface TrafficFlowStep {
  stepId: string;
  order: number;
  label: string;
  completed: boolean;
  summary: string;
}

// ── Traffic Canvas ────────────────────────────────────────────────────────────

export interface TrafficCanvas {
  id: string;
  strategyCanvasId?: string;       // inherited from Strategy
  socialCanvasId?: string;         // inherited from Social
  designCanvasId?: string;         // inherited from Design (optional)
  requestId?: string;
  clientName: string;
  segment: string;
  source: "request" | "simulation";
  status: TrafficCanvasStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewNote?: string;

  // ── Strategic inputs ──
  mainObjective: string;           // from StrategyCanvas
  targetAudience: string;
  offerContext: string;

  // ── Campaign Plan ──
  campaigns: TrafficCampaign[];
  audiences: AudienceSegment[];
  creativeRequirements: CreativeRequirement[];

  // ── Financial ──
  budgetScenario: BudgetScenario;
  budgetAllocation: BudgetAllocation;
  /**
   * DE ONDE VEIO O DINHEIRO DESTE PLANO. O campo existe porque o canvas viajava
   * sem ele: `budgetScenario` caía no default `"medium"` (R$ 4.000) para todo
   * cliente, e o time trabalhava em cima de um número de tabela achando que era
   * do cliente. Ver `MARCA_FAIXA_DE_REFERENCIA`.
   */
  budgetBasis: BudgetBasis;

  // ── Offer ──
  offerMappings: OfferMapping[];

  // ── Channels ──
  recommendedChannels: TrafficChannel[];
  channelRationale: string;

  // ── Projections ──
  projectedMonthlyLeads: string;   // "50–120 leads/mês"
  projectedCAC: string;            // "R$ 30–80"
  projectedROAS: string;           // "3x–6x"
  keyRisks: string[];
  successIndicators: string[];

  // ── Brain artifacts ──
  qualityGateResult: TrafficQualityGateResult;
  cognitiveFlowTrace: TrafficFlowStep[];
}

// ── Quality Gate (11-item checklist) ─────────────────────────────────────────

/**
 * Todo número projetado ou vem da verba do cliente, ou traz a ressalva colada.
 * Determinístico e sem IA: é conferência de origem, não julgamento de valor.
 */
export function projecoesComOrigemDeclarada(
  canvas: Pick<TrafficCanvas, "budgetBasis" | "projectedROAS" | "projectedCAC" | "projectedMonthlyLeads" | "audiences">,
): boolean {
  if (canvas.budgetBasis === "verba_informada") return true;
  const marcados = [canvas.projectedROAS, canvas.projectedCAC, canvas.projectedMonthlyLeads]
    .every((v) => typeof v === "string" && v.includes(MARCA_FAIXA_DE_REFERENCIA));
  // O alcance estimado por público é o outro número que escapava do filtro de
  // preço do portal ("30K–80K") — entra na mesma conferência.
  const alcanceMarcado = canvas.audiences.every(
    (a) => a.estimatedReach === "N/D" || a.estimatedReach.includes(MARCA_FAIXA_DE_REFERENCIA),
  );
  return marcados && alcanceMarcado;
}

export function runTrafficQualityGate(
  canvas: Omit<TrafficCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source">,
): TrafficQualityGateResult {
  const items: TrafficQualityGateItem[] = [
    {
      id: "objective_clear",
      label: "Objetivo de campanha claro",
      status: canvas.mainObjective.trim().length >= 10 ? "PASS" : "FAIL",
      detail: canvas.mainObjective || "Objetivo de campanha não definido.",
    },
    {
      id: "audience_defined",
      label: "Público-alvo definido",
      status: canvas.audiences.length >= 1 ? "PASS" : "FAIL",
      detail: canvas.audiences.length > 0
        ? `${canvas.audiences.length} segmento(s) de público definido(s)`
        : "Nenhum segmento de público definido.",
    },
    {
      id: "budget_separated",
      label: "Management fee separado do budget de mídia",
      status: canvas.budgetAllocation.managementFeeBRL > 0 && canvas.budgetAllocation.mediaBudgetBRL > 0 ? "PASS" : "FAIL",
      detail: canvas.budgetAllocation.mediaBudgetBRL > 0
        ? `Mídia: R$ ${canvas.budgetAllocation.mediaBudgetBRL.toLocaleString("pt-BR")} | Fee: R$ ${canvas.budgetAllocation.managementFeeBRL.toLocaleString("pt-BR")}`
        : "Budget de mídia não definido.",
    },
    {
      id: "campaigns_defined",
      label: "Campanhas definidas",
      status: canvas.campaigns.length >= 2 ? "PASS"
        : canvas.campaigns.length === 1 ? "WARNING" : "FAIL",
      detail: canvas.campaigns.length > 0
        ? `${canvas.campaigns.length} campanha(s): ${canvas.campaigns.map((c) => c.name).join(", ")}`
        : "Nenhuma campanha definida.",
    },
    {
      id: "channels_defined",
      label: "Canais de mídia definidos",
      status: canvas.recommendedChannels.length >= 1 ? "PASS" : "FAIL",
      detail: canvas.recommendedChannels.length > 0
        ? canvas.recommendedChannels.join(", ")
        : "Nenhum canal definido.",
    },
    {
      id: "offer_mapped",
      label: "Oferta mapeada",
      status: canvas.offerMappings.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.offerMappings.length > 0
        ? `${canvas.offerMappings.length} oferta(s): ${canvas.offerMappings.map((o) => o.name).join(", ")}`
        : "Nenhuma oferta mapeada.",
    },
    {
      id: "creative_requirements",
      label: "Requisitos criativos definidos",
      status: canvas.creativeRequirements.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.creativeRequirements.length > 0
        ? `${canvas.creativeRequirements.length} criativo(s) requerido(s)`
        : "Nenhum requisito criativo definido.",
    },
    {
      id: "projections_defined",
      label: "Projeções de resultado definidas",
      status: canvas.projectedMonthlyLeads.length > 0 && canvas.projectedCAC.length > 0 ? "PASS" : "WARNING",
      detail: canvas.projectedMonthlyLeads.length > 0
        ? `Leads: ${canvas.projectedMonthlyLeads} | CAC: ${canvas.projectedCAC}`
        : "Projeções não definidas.",
    },
    {
      // Número projetado sem origem declarada é o furo que mandava R$ 4.000 de
      // tabela ao time como se fosse a verba do cliente. Aqui é FAIL, não aviso.
      id: "projections_anchored",
      label: "Origem dos números projetados declarada",
      status: projecoesComOrigemDeclarada(canvas) ? "PASS" : "FAIL",
      detail: canvas.budgetBasis === "verba_informada"
        ? `Total mensal R$ ${canvas.budgetAllocation.totalMonthlyBRL.toLocaleString("pt-BR")} derivado da verba informada pelo cliente.`
        : projecoesComOrigemDeclarada(canvas)
        ? `Cliente não informou verba — projetados marcados como ${MARCA_FAIXA_DE_REFERENCIA}.`
        : "Números projetados sem verba do cliente E sem a ressalva de faixa de referência — o time leria como estimativa deste cliente.",
    },
    {
      id: "risks_identified",
      label: "Riscos identificados",
      status: canvas.keyRisks.length >= 1 ? "PASS" : "WARNING",
      detail: canvas.keyRisks.length > 0
        ? canvas.keyRisks.slice(0, 2).join("; ")
        : "Nenhum risco identificado.",
    },
    {
      id: "strategy_linked",
      label: "Canvas de estratégia vinculado",
      status: canvas.strategyCanvasId && canvas.strategyCanvasId.length > 0 ? "PASS" : "WARNING",
      detail: canvas.strategyCanvasId
        ? `Estratégia: ${canvas.strategyCanvasId}`
        : "Traffic sem Strategy Canvas vinculado — recomenda-se vincular.",
    },
  ];

  const failCount    = items.filter((i) => i.status === "FAIL").length;
  const warningCount = items.filter((i) => i.status === "WARNING").length;
  const passCount    = items.filter((i) => i.status === "PASS").length;
  const overall: "PASS" | "WARNING" | "FAIL" =
    failCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS";

  return { overall, items, passCount, warningCount, failCount };
}
