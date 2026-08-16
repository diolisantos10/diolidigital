// ─── SDR Agent V1 ─────────────────────────────────────────────────────────────
// Commercial intelligence layer for the public /briefing flow.
// All functions are pure — no side effects, no UI dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import type { BriefingScope, ConvState, LiveEstimate } from "./briefing-conversation";
import { remainingRequiredQuestions } from "./question-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ObjectionType =
  | "price_too_high"
  | "unsure_budget"
  | "wants_cheaper"
  | "wants_more_value"
  | "wants_remove_item"
  | "wants_add_item"
  | "deadline_pressure"
  | "needs_internal_approval";

export type NegotiationStage =
  | "discovery"
  | "qualification"
  | "pricing"
  | "objection_handling"
  | "scope_adjustment"
  | "proposal_ready";

export interface BudgetSignal {
  raw?: string;
  amount?: number;
  fitStatus: "unknown" | "fits" | "above_budget" | "below_recommended";
  acknowledgedAt?: string;
}

export interface ObjectionState {
  active: boolean;
  types: ObjectionType[];
  lastText?: string;
  resolvedAt?: string;
}

// ── Brain Reasoning Output ─────────────────────────────────────────────────────

export interface BrainReasoningOutput {
  intentionDetected: string;
  confidenceLevel: "low" | "medium" | "high";
  knownFacts: string[];
  unknownFacts: string[];
  risks: string[];
  opportunities: string[];
  recommendedDepartment: string;
  recommendedServices: string[];
  approvalRequired: boolean;
  qualityGateStatus: "PASS" | "WARNING" | "FAIL";
  nextAction: string;
}

// ── Cognitive Flow Step Result ─────────────────────────────────────────────────

export interface CognitiveFlowStepResult {
  stepId: string;
  order: number;
  label: string;
  completed: boolean;
  confidence: "low" | "medium" | "high" | null;
  summary: string;
}

export interface CognitiveFlowSummary {
  stepsCompleted: number;
  totalSteps: number;
  completionRate: number;
  steps: CognitiveFlowStepResult[];
  overallConfidence: "low" | "medium" | "high";
}

// ── SDR Quality Gate ───────────────────────────────────────────────────────────

export interface SDRQualityGateItem {
  id: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL";
  detail: string;
}

export interface SDRQualityGateResult {
  overall: "PASS" | "WARNING" | "FAIL";
  items: SDRQualityGateItem[];
  passCount: number;
  warningCount: number;
  failCount: number;
  blocksSubmission: boolean;
}

export interface SDRHandoff {
  diagnosis: string;
  finalScopeDescription: string;
  budgetFit: string;
  objectionsHandled: string[];
  tradeoffsAccepted: string[];
  unresolvedRisks: string[];
  recommendedPMAction: string;
  brainReasoningOutput?: BrainReasoningOutput;
  cognitiveFlowSummary?: CognitiveFlowSummary;
  qualityGateResult?: SDRQualityGateResult;
}

export interface SDRAgentState {
  negotiationStage: NegotiationStage;
  budgetSignal: BudgetSignal;
  objection: ObjectionState;
  qualificationScore: number;
  isRestaurant: boolean;
  handoff?: SDRHandoff;
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function emptySdrState(): SDRAgentState {
  return {
    negotiationStage: "discovery",
    budgetSignal: { fitStatus: "unknown" },
    objection: { active: false, types: [] },
    qualificationScore: 0,
    isRestaurant: false,
  };
}

// ── Engagement-mode label ──────────────────────────────────────────────────────
// Human label for the engagement type, including the "umbrella" (guarda-chuva)
// continuous-partnership mode.
export function engagementLabel(mode: BriefingScope["serviceMode"]): string {
  switch (mode) {
    case "monthly":  return "Gestão mensal";
    case "one_off":  return "Projeto pontual";
    case "umbrella": return "Parceria contínua (guarda-chuva)";
    default:         return "Modalidade não definida";
  }
}

// ── Restaurant detection ──────────────────────────────────────────────────────

export function isRestaurantSegment(scope: BriefingScope): boolean {
  const text = (scope.segment ?? "") + " " + (scope.businessName ?? "");
  return /restaurante|sushi|pizza|hamburgue|fast\s*food|caf[eé]\b|bar\b|lanchon|padaria|pastelaria|a[çc]a[íi]|churrascaria/i.test(text);
}

// ── Budget parser ─────────────────────────────────────────────────────────────

export function parseBudgetAmount(text: string): number | undefined {
  const t = text.toLowerCase();

  // "1.5k", "2k"
  const kMatch = t.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(",", ".")) * 1000);

  // "2 mil", "2,5 mil"
  const milMatch = t.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (milMatch) return Math.round(parseFloat(milMatch[1].replace(",", ".")) * 1000);

  // R$ 1.200 or plain number in budget context
  if (/r\$|reais|or[çc]amento|budget/i.test(t)) {
    const brlMatch = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{3,6})/);
    if (brlMatch) {
      const raw = brlMatch[1].replace(/\./g, "").replace(",", ".");
      const n = parseFloat(raw);
      if (!isNaN(n) && n >= 100 && n <= 50000) return Math.round(n);
    }
  }

  return undefined;
}

// ── Objection detection ───────────────────────────────────────────────────────

export function detectObjectionTypes(text: string): ObjectionType[] {
  const t = text.toLowerCase();
  const types: ObjectionType[] = [];

  if (/tá caro|ta caro|muito caro|caro demais|ficou caro|achei caro|tô achando caro|está caro|acima do.{0,10}or[çc]amento|acima do.{0,10}budget/.test(t))
    types.push("price_too_high");

  if (/não sei.{0,15}or[çc]amento|nao sei.{0,15}or[çc]amento|sem or[çc]amento definido|não tenho.{0,15}valor|nao tenho.{0,15}valor/.test(t))
    types.push("unsure_budget");

  if (/mais barato|plano mais.{0,10}simples|algo mais.{0,10}barato|plano menor|mais acess[íi]vel|começar menor|comecar menor/.test(t))
    types.push("wants_cheaper");

  if (/mais valor|mais retorno|mais resultado|o que eu.{0,15}ganho/.test(t))
    types.push("wants_more_value");

  if (/sem reels?|tira reels?|sem tráfego|sem trafego|tira tráfego|tira trafego|menos posts?|sem stories/.test(t))
    types.push("wants_remove_item");

  if (/adicionar reels?|incluir reels?|com tráfego|com trafego|mais posts?|incluir stories/.test(t))
    types.push("wants_add_item");

  if (/urgente|para ontem|prazo apertado|preciso.{0,15}logo|asap/.test(t))
    types.push("deadline_pressure");

  if (/preciso.{0,20}aprovar|falar.{0,15}s[oó]cio|falar.{0,15}diretor|aprovar.{0,15}internamente|alinhar.{0,15}equipe/.test(t))
    types.push("needs_internal_approval");

  return types;
}

// ── Negotiation stage ─────────────────────────────────────────────────────────

export function detectNegotiationStage(
  scope: BriefingScope,
  sdr: SDRAgentState,
  estimate: LiveEstimate,
): NegotiationStage {
  if (sdr.objection.active) return "objection_handling";
  const identityDone = !!scope.prospectEmail && !!scope.prospectPhone;
  const hasService = scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding?.requested;
  if (!identityDone) return "discovery";
  if (!hasService) return "qualification";
  if (estimate.confidence === "none") return "pricing";
  if (sdr.budgetSignal.fitStatus === "above_budget" || sdr.budgetSignal.fitStatus === "below_recommended")
    return "scope_adjustment";
  return "proposal_ready";
}

// ── Budget fit evaluator ──────────────────────────────────────────────────────

export function evaluateBudgetFit(
  budgetAmount: number,
  estimate: LiveEstimate,
): BudgetSignal["fitStatus"] {
  if (estimate.totalMin === 0) return "unknown";
  if (budgetAmount >= estimate.totalMin) return "fits";
  if (budgetAmount >= estimate.totalMin * 0.6) return "above_budget";
  return "below_recommended";
}

// ── Reply builders ─────────────────────────────────────────────────────────────

export function buildPriceObjectionReply(
  scope: BriefingScope,
  estimate: LiveEstimate,
  parsedBudget?: number,
): string {
  // ── 16/08/2026 — O PLANO FANTASMA SAIU DAQUI ────────────────────────────────
  //
  // Estas falas chegam ao PROSPECT: `prospect-engine.ts:418` as usa como resposta
  // do briefing público sempre que o motor de regras assume — inclusive quando
  // quem entrega o microfone a ele é a trava de preço de `/api/sdr/chat`.
  //
  // Elas cotavam **"Plano Starter (R$ 1.200–1.800/mês)"**. Esse plano não existe:
  // o catálogo desta casa é `lib/agency/planos.ts`, casado com `docs/precos.md`
  // pelo teste `preco-uma-fonte-so`, e nele há Pulso 49, Ritmo 297, Presença 790,
  // Conteúdo 1390 e Crescimento 2590. **Não há Starter e não há 1.200.**
  //
  // Ou seja: a trava calava o modelo — certíssimo — e passava a palavra para um
  // script que cotava um preço sem lastro nenhum. Preço inventado é pior que
  // preço nenhum: o cliente ancora nele, e quem tem de desdizer é o CEO.
  //
  // A regra que ficou: **este arquivo não cita valor.** Quem trata escopo trata
  // ESCOPO; número sai do orçamento, depois do login, pela tabela de verdade. O
  // portão que prova isso é `precosForaDoCatalogo` — ver
  // `lib/agency/comercial/resposta-de-preco.ts`.
  const biz = scope.businessName ?? "seu negócio";
  const isResto = isRestaurantSegment(scope);
  const restoTip = isResto
    ? "\n\nPara restaurantes, o que costuma render mais é focar no Instagram — fotos de pratos, stories de cardápio e promoções semanais."
    : "";

  if (parsedBudget !== undefined) {
    if (estimate.totalMin > 0 && parsedBudget < estimate.totalMin) {
      return `Entendi o que você tem em mente para o **${biz}** — anotado, e isso guia a proposta.\n\nO escopo que desenhamos até aqui é maior do que isso, então dá para ajustar: menos peças por mês, ou deixar o tráfego pago para uma segunda etapa.${restoTip}\n\nQuer que eu enxugue o escopo por esse caminho?`;
    }
    return `Anotado — isso cabe no que desenhamos para o **${biz}**. Podemos seguir com o escopo atual, e o valor exato sai no orçamento.`;
  }

  // Generic price objection
  const postsPerMonth = (scope.social?.postsPerWeek ?? 0) * 4;
  if (postsPerMonth > 8) {
    return `Entendo a preocupação com o investimento. O escopo atual inclui **${postsPerMonth} posts/mês** — um volume que entrega resultados consistentes para o **${biz}**.\n\nSe preferir começar menor, dá para reduzir a cadência e deixar reels e tráfego para depois. Qual faixa de investimento você tem em mente?`;
  }
  return `Entendo. Qual é a faixa de investimento que você tem em mente para o **${biz}**? Com esse número, ajusto o escopo para encaixar.`;
}

export function buildScopeAdjustmentConfirmation(
  scope: BriefingScope,
  estimate: LiveEstimate,
  budgetSignal: BudgetSignal,
): string {
  const biz = scope.businessName ?? "seu projeto";
  const totalStr = estimate.totalMin > 0
    ? ` **R$ ${estimate.totalMin.toLocaleString("pt-BR")}–${estimate.totalMax.toLocaleString("pt-BR")}/mês**`
    : "";
  if (budgetSignal.fitStatus === "fits") {
    return `Ótimo! O escopo ajustado fica em${totalStr} — dentro do orçamento para o **${biz}**. Está tudo certo para enviar?`;
  }
  return `Ajustei o escopo para${totalStr}. Isso está mais próximo do que você tem em mente para o **${biz}**?`;
}

export function buildConsultativeGoalQuestion(scope: BriefingScope): string {
  const biz = scope.businessName;
  const isResto = isRestaurantSegment(scope);
  if (isResto) {
    return biz
      ? `Que resultado você quer alcançar com o **${biz}** nas redes sociais? Mais clientes no restaurante, cardápio mais visível, delivery — ou outra coisa?`
      : "O que você quer conseguir com as redes sociais? Mais clientes, pedidos de delivery, visibilidade de cardápio?";
  }
  return biz
    ? `Qual é o principal resultado que você quer alcançar para o **${biz}** com marketing digital?`
    : "Qual é o principal objetivo — mais clientes, mais visibilidade ou vendas online?";
}

export function buildConsultativeFrequencyQuestion(scope: BriefingScope): string {
  if (isRestaurantSegment(scope)) {
    return "Para restaurantes, um bom ritmo é **3 a 5 posts por semana** com presença forte em stories. Quantas vezes por semana você imagina publicar no feed?";
  }
  return "Quantas postagens por semana você imagina para o feed? **3 por semana** é um bom ritmo para começar — mas posso ajustar para o seu negócio.";
}

// NOTE: never quotes a price. The estimate is shown only after Google sign-in.
// This question just nudges toward closing the discovery.
export function buildBudgetQuestion(scope: BriefingScope, _estimate: LiveEstimate): string {
  const biz = scope.businessName ?? "seu negócio";
  return `Acho que já tenho o essencial do **${biz}**! Tem mais algum detalhe que você queira incluir, ou posso preparar seu orçamento?`;
}

// ── Submission gate ───────────────────────────────────────────────────────────

// Submission gate. E-mail and WhatsApp are intentionally NOT required here —
// they are captured via Google sign-in AFTER the prospect confirms the request.
// The gate fires once we know WHO they are (name) and WHAT they need (a service
// plus enough scope detail). The "Sim, quero meu orçamento" CTA then appears,
// and identity is collected on the next step.
// The interview does NOT close until the full question protocol is exhausted.
// A quieter client simply gets asked more — the engine keeps surfacing the next
// applicable question until every area they need is covered. The gate opens only
// when: identity is known, a service is chosen, there is no open price objection,
// AND getNextQuestion returns null (no applicable question left to ask).
export function canSubmitProposal(conv: ConvState, sdr: SDRAgentState): boolean {
  const scope = conv.scope;
  if (!scope.prospectName || !scope.businessName) return false;
  const hasService = scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding?.requested;
  if (!hasService || sdr.objection.active) return false;
  // Full protocol must be complete — no substantive question left to ask.
  if (remainingRequiredQuestions(conv).length > 0) return false;
  return true;
}

export function getSubmissionBlockReason(conv: ConvState, sdr: SDRAgentState): string | null {
  const scope = conv.scope;
  if (!scope.prospectName || !scope.businessName)
    return "Me diga seu nome e o nome do seu negócio para começar.";
  if (!scope.wantsSocialMedia && !scope.wantsPaidTraffic && !scope.branding?.requested)
    return "Conte o que você precisa para montarmos seu pedido.";
  if (sdr.objection.active)
    return "Resolva o ponto em aberto antes de continuar.";
  if (remainingRequiredQuestions(conv).length > 0)
    return "Ainda tenho algumas perguntas para entender tudo que você precisa.";
  return null;
}

// ── Qualification score ───────────────────────────────────────────────────────

export function computeQualificationScore(scope: BriefingScope, sdr: SDRAgentState): number {
  let score = 0;
  if (scope.prospectName)    score += 1;
  if (scope.businessName)    score += 1;
  if (scope.prospectEmail)   score += 2;
  if (scope.prospectPhone)   score += 2;
  if (scope.wantsSocialMedia || scope.wantsPaidTraffic || scope.branding?.requested) score += 1;
  if (scope.serviceMode)     score += 1;
  if (sdr.budgetSignal.fitStatus !== "unknown") score += 1;
  if (scope.objectives.length > 0) score += 1;
  return Math.min(score, 10);
}

// ── SDR Quality Gate (12-item checklist) ──────────────────────────────────────

export function runSDRQualityGate(conv: ConvState, sdr: SDRAgentState): SDRQualityGateResult {
  const s = conv.scope;
  const e = conv.estimate;

  const items: SDRQualityGateItem[] = [
    {
      id: "identity",
      label: "Identidade completa (e-mail + telefone)",
      status: (s.prospectEmail && s.prospectPhone) ? "PASS" : "FAIL",
      detail: (s.prospectEmail && s.prospectPhone)
        ? `${s.prospectEmail} · ${s.prospectPhone}`
        : "E-mail e/ou telefone não capturados.",
    },
    {
      id: "business_name",
      label: "Nome do negócio identificado",
      status: s.businessName ? "PASS" : "WARNING",
      detail: s.businessName ?? "Nome do negócio não informado.",
    },
    {
      id: "segment",
      label: "Segmento de mercado identificado",
      status: s.segment ? "PASS" : "WARNING",
      detail: s.segment ?? "Segmento não identificado.",
    },
    {
      id: "service",
      label: "Pelo menos 1 serviço selecionado",
      status: (s.wantsSocialMedia || s.wantsPaidTraffic || s.branding?.requested) ? "PASS" : "FAIL",
      detail: (s.wantsSocialMedia || s.wantsPaidTraffic || s.branding?.requested)
        ? [s.wantsSocialMedia && "Social Media", s.wantsPaidTraffic && "Tráfego Pago", s.branding?.requested && "Identidade Visual"].filter(Boolean).join(", ")
        : "Nenhum serviço definido.",
    },
    {
      id: "service_mode",
      label: "Modalidade de serviço definida",
      status: s.serviceMode ? "PASS" : "WARNING",
      detail: s.serviceMode ? engagementLabel(s.serviceMode) : "Modalidade não definida.",
    },
    {
      id: "objectives",
      label: "Objetivos de negócio capturados",
      status: s.objectives.length > 0 ? "PASS" : "WARNING",
      detail: s.objectives.length > 0 ? s.objectives.join(", ") : "Nenhum objetivo capturado.",
    },
    {
      id: "budget_informed",
      label: "Budget informado pelo prospect",
      status: sdr.budgetSignal.amount !== undefined ? "PASS" : "WARNING",
      detail: sdr.budgetSignal.amount !== undefined
        ? `R$ ${sdr.budgetSignal.amount.toLocaleString("pt-BR")}`
        : "Budget não informado.",
    },
    {
      id: "budget_fit",
      label: "Budget fit avaliado",
      status: sdr.budgetSignal.fitStatus !== "unknown" ? "PASS" : "WARNING",
      detail: ({
        fits:              "Budget adequado ao escopo.",
        above_budget:      "Budget abaixo da estimativa — escopo ajustado.",
        below_recommended: "Budget abaixo do piso do escopo desenhado.",
        unknown:           "Status de budget não avaliado.",
      } as const)[sdr.budgetSignal.fitStatus],
    },
    {
      id: "objections",
      label: "Objeções ativas resolvidas",
      status: sdr.objection.active ? "FAIL" : "PASS",
      detail: sdr.objection.active
        ? `Objeção ativa: ${sdr.objection.types.join(", ") || "tipo desconhecido"}.`
        : sdr.objection.types.length > 0 ? `${sdr.objection.types.length} objeção(ões) resolvida(s).` : "Sem objeções registradas.",
    },
    {
      id: "social_scope",
      label: "Escopo de Social Media completo",
      status: !s.wantsSocialMedia ? "PASS"
        : s.social?.postsPerWeek !== undefined ? "PASS" : "WARNING",
      detail: !s.wantsSocialMedia ? "Social Media não selecionado."
        : s.social?.postsPerWeek !== undefined
          ? `${s.social.postsPerWeek * 4} posts/mês definidos.`
          : "Frequência de posts não definida.",
    },
    {
      id: "estimate_confidence",
      label: "Estimativa com nível de confiança",
      status: e.confidence === "none" ? "WARNING" : "PASS",
      detail: ({
        none:   "Estimativa ainda não gerada.",
        low:    "Estimativa inicial (confiança baixa).",
        medium: "Estimativa aproximada (confiança média).",
        high:   "Estimativa confiável (confiança alta).",
      } as const)[e.confidence],
    },
    {
      id: "qualification_score",
      label: "Score de qualificação ≥ 6/10",
      status: computeQualificationScore(s, sdr) >= 6 ? "PASS" : "WARNING",
      detail: `Score: ${computeQualificationScore(s, sdr)}/10`,
    },
  ];

  const failCount    = items.filter((i) => i.status === "FAIL").length;
  const warningCount = items.filter((i) => i.status === "WARNING").length;
  const passCount    = items.filter((i) => i.status === "PASS").length;
  const overall: "PASS" | "WARNING" | "FAIL" =
    failCount > 0 ? "FAIL" : warningCount > 0 ? "WARNING" : "PASS";

  return { overall, items, passCount, warningCount, failCount, blocksSubmission: failCount > 0 };
}

// ── Cognitive Flow Summary ─────────────────────────────────────────────────────

export function buildCognitiveFlowSummary(conv: ConvState, sdr: SDRAgentState): CognitiveFlowSummary {
  const s = conv.scope;
  const e = conv.estimate;
  const confScore = { none: 0, low: 1, medium: 2, high: 3 } as const;

  const steps: CognitiveFlowStepResult[] = [
    {
      stepId: "01_intention", order: 1, label: "Intenção Detectada",
      completed: s.wantsSocialMedia || !!s.wantsPaidTraffic || !!s.branding?.requested,
      confidence: (s.wantsSocialMedia || !!s.wantsPaidTraffic || s.branding?.requested) ? "high" : null,
      summary: (s.wantsSocialMedia || !!s.wantsPaidTraffic || s.branding?.requested)
        ? `Serviços: ${[s.wantsSocialMedia && "Social Media", s.wantsPaidTraffic && "Tráfego Pago", s.branding?.requested && "ID Visual"].filter(Boolean).join(", ")}`
        : "Nenhum serviço detectado.",
    },
    {
      stepId: "02_context", order: 2, label: "Contexto do Negócio",
      completed: !!(s.businessName || s.segment),
      confidence: (s.businessName && s.segment) ? "high" : (s.businessName || s.segment) ? "medium" : null,
      summary: [s.businessName, s.segment].filter(Boolean).join(" — ") || "Contexto não capturado.",
    },
    {
      stepId: "03_certainty", order: 3, label: "Certeza / Confiança",
      completed: e.confidence !== "none",
      confidence: e.confidence === "none" ? null : (e.confidence as "low" | "medium" | "high"),
      summary: e.confidence !== "none"
        ? `Estimativa ${e.confidence} — R$ ${e.totalMin.toLocaleString("pt-BR")}–${e.totalMax.toLocaleString("pt-BR")}/mês`
        : "Estimativa não disponível.",
    },
    {
      stepId: "04_unknowns", order: 4, label: "Incógnitas Identificadas",
      completed: true,
      confidence: e.missingForEstimate.length === 0 ? "high" : "medium",
      summary: e.missingForEstimate.length > 0
        ? `${e.missingForEstimate.length} informação(ões) faltando: ${e.missingForEstimate.slice(0, 2).join(", ")}`
        : "Sem informações faltando.",
    },
    {
      stepId: "05_routing", order: 5, label: "Roteamento de Departamento",
      completed: s.wantsSocialMedia || !!s.wantsPaidTraffic || !!s.branding?.requested,
      confidence: "high",
      summary: (() => {
        const depts: string[] = [];
        if (s.wantsSocialMedia) depts.push("Social Media", "Design");
        if (s.wantsPaidTraffic) depts.push("Tráfego Pago");
        if (s.branding?.requested) depts.push("Identidade Visual");
        return depts.length > 0 ? depts.join(", ") : "Departamento não determinado.";
      })(),
    },
    {
      stepId: "06_permission", order: 6, label: "Permissão / Identidade",
      completed: !!(s.prospectEmail && s.prospectPhone),
      confidence: (s.prospectEmail && s.prospectPhone) ? "high" : null,
      summary: (s.prospectEmail && s.prospectPhone)
        ? `${s.prospectEmail} · ${s.prospectPhone}`
        : "Identidade não completa.",
    },
    {
      stepId: "07_brand", order: 7, label: "Contexto de Marca",
      completed: s.branding?.hasBrandBook || s.branding?.requested || !!s.segment,
      confidence: s.branding?.hasBrandBook ? "high" : (s.branding?.requested || !!s.segment) ? "medium" : null,
      summary: s.branding?.hasBrandBook ? "Brand Book disponível."
        : s.branding?.requested ? "Identidade Visual solicitada."
        : s.segment ? `Segmento: ${s.segment}.`
        : "Contexto de marca não capturado.",
    },
    {
      stepId: "08_objective", order: 8, label: "Objetivo Estratégico",
      completed: s.objectives.length > 0,
      confidence: s.objectives.length >= 2 ? "high" : s.objectives.length === 1 ? "medium" : null,
      summary: s.objectives.length > 0 ? s.objectives.join(", ") : "Nenhum objetivo capturado.",
    },
    {
      stepId: "09_risk", order: 9, label: "Riscos e Objeções",
      completed: !sdr.objection.active,
      confidence: sdr.objection.active ? null : sdr.objection.types.length > 0 ? "medium" : "high",
      summary: sdr.objection.active
        ? `Objeção ativa: ${sdr.objection.types.join(", ")}.`
        : sdr.objection.types.length > 0
          ? `${sdr.objection.types.length} objeção(ões) resolvida(s).`
          : "Sem objeções registradas.",
    },
    {
      stepId: "10_approval", order: 10, label: "Aprovação / Budget",
      completed: sdr.budgetSignal.fitStatus !== "unknown",
      confidence: sdr.budgetSignal.fitStatus === "fits" ? "high"
        : sdr.budgetSignal.fitStatus !== "unknown" ? "medium" : null,
      summary: sdr.budgetSignal.amount !== undefined
        ? `R$ ${sdr.budgetSignal.amount.toLocaleString("pt-BR")} — ${({
            fits: "adequado", above_budget: "ajustado", below_recommended: "abaixo do mínimo", unknown: "não avaliado",
          } as const)[sdr.budgetSignal.fitStatus]}`
        : "Budget não informado.",
    },
    {
      stepId: "11_training", order: 11, label: "Sinal para Treinamento",
      completed: computeQualificationScore(s, sdr) >= 7,
      confidence: computeQualificationScore(s, sdr) >= 8 ? "high"
        : computeQualificationScore(s, sdr) >= 6 ? "medium" : "low",
      summary: `Score de qualificação: ${computeQualificationScore(s, sdr)}/10`,
    },
    {
      stepId: "12_measurement", order: 12, label: "Métricas e Evidência",
      completed: e.confidence === "medium" || e.confidence === "high",
      confidence: e.confidence === "high" ? "high" : e.confidence === "medium" ? "medium" : null,
      summary: e.totalMin > 0
        ? `Estimativa ${e.confidence}: R$ ${e.totalMin.toLocaleString("pt-BR")}–${e.totalMax.toLocaleString("pt-BR")}/mês`
        : "Estimativa não disponível para medição.",
    },
  ];

  const stepsCompleted = steps.filter((s) => s.completed).length;
  const totalSteps = steps.length;
  const completionRate = Math.round((stepsCompleted / totalSteps) * 100);

  const confValues = steps.filter((s) => s.confidence).map((s) => confScore[s.confidence!]);
  const avgConf = confValues.length > 0 ? confValues.reduce((a, b) => a + b, 0) / confValues.length : 0;
  const overallConfidence: "low" | "medium" | "high" = avgConf >= 2.5 ? "high" : avgConf >= 1.5 ? "medium" : "low";

  return { stepsCompleted, totalSteps, completionRate, steps, overallConfidence };
}

// ── Brain Reasoning Output ─────────────────────────────────────────────────────

export function buildBrainReasoningOutput(
  conv: ConvState,
  sdr: SDRAgentState,
  qualityGateResult: SDRQualityGateResult,
): BrainReasoningOutput {
  const s = conv.scope;
  const e = conv.estimate;

  const services: string[] = [];
  if (s.wantsSocialMedia) services.push("Social Media");
  if (s.wantsPaidTraffic) services.push("Tráfego Pago");
  if (s.branding?.requested) services.push("Identidade Visual");

  const depts: string[] = [];
  if (s.wantsSocialMedia) { depts.push("social-media"); depts.push("design"); }
  if (s.wantsPaidTraffic) depts.push("paid-traffic");
  if (s.branding?.requested) depts.push("brand-hub");

  const knownFacts: string[] = [];
  if (s.prospectName) knownFacts.push(`Prospect: ${s.prospectName}`);
  if (s.businessName) knownFacts.push(`Negócio: ${s.businessName}`);
  if (s.segment) knownFacts.push(`Segmento: ${s.segment}`);
  if (services.length > 0) knownFacts.push(`Serviços: ${services.join(", ")}`);
  if (s.objectives.length > 0) knownFacts.push(`Objetivos: ${s.objectives.join(", ")}`);
  if (sdr.budgetSignal.amount !== undefined) knownFacts.push(`Budget: R$ ${sdr.budgetSignal.amount.toLocaleString("pt-BR")}`);
  if (s.social?.postsPerWeek !== undefined) knownFacts.push(`${s.social.postsPerWeek * 4} posts/mês`);
  if (s.serviceMode) knownFacts.push(`Modalidade: ${engagementLabel(s.serviceMode)}`);

  const unknownFacts = [...e.missingForEstimate];
  if (!s.businessName) unknownFacts.push("Nome do negócio não informado");
  if (!s.segment) unknownFacts.push("Segmento não identificado");
  if (!s.serviceMode) unknownFacts.push("Modalidade não definida");
  if (sdr.budgetSignal.amount === undefined) unknownFacts.push("Budget não informado");

  const risks: string[] = [];
  if (sdr.objection.active) risks.push(`Objeção ativa: ${sdr.objection.types.join(", ")}`);
  if (sdr.budgetSignal.fitStatus === "below_recommended") risks.push("Budget abaixo do piso do escopo desenhado");
  if (sdr.objection.types.includes("needs_internal_approval")) risks.push("Aprovação interna pendente");
  if (e.confidence === "none" || e.confidence === "low") risks.push("Estimativa com baixa confiança");

  const opportunities: string[] = [];
  if (sdr.budgetSignal.fitStatus === "fits") opportunities.push("Budget alinhado — proposta viável imediatamente");
  if (s.objectives.length >= 2) opportunities.push("Múltiplos objetivos capturados — escopo claro");
  if (sdr.objection.types.length > 0 && !sdr.objection.active) opportunities.push("Objeções resolvidas — prospect comprometido");
  if (e.confidence === "high") opportunities.push("Estimativa confiável disponível");

  const intentionDetected = services.length > 0
    ? `${s.businessName ?? "Prospect"} solicita: ${services.join(", ")}.${s.serviceMode && s.serviceMode !== "unsure" ? ` ${engagementLabel(s.serviceMode)}.` : ""}`
    : "Intenção não detectada.";

  const confidenceLevel: "low" | "medium" | "high" =
    e.confidence === "high" ? "high" : e.confidence === "medium" ? "medium" : "low";

  const recommendedDepartment = depts.length > 0 ? depts[0] : "project-management";

  const approvalRequired = sdr.objection.types.includes("needs_internal_approval") ||
    sdr.budgetSignal.fitStatus === "below_recommended";

  let nextAction = "Enviar proposta formal e agendar call de kickoff.";
  if (sdr.budgetSignal.fitStatus === "above_budget" || sdr.budgetSignal.fitStatus === "below_recommended") {
    nextAction = "Negociar escopo antes da proposta formal. Apresentar opções de plano ajustado.";
  } else if (sdr.objection.types.includes("needs_internal_approval")) {
    nextAction = "Enviar proposta por e-mail para facilitar aprovação interna. Agendar follow-up em 48h.";
  } else if (unknownFacts.length > 2) {
    nextAction = "Complementar informações faltando antes de gerar proposta formal.";
  }

  return {
    intentionDetected,
    confidenceLevel,
    knownFacts,
    unknownFacts,
    risks,
    opportunities,
    recommendedDepartment,
    recommendedServices: services,
    approvalRequired,
    qualityGateStatus: qualityGateResult.overall,
    nextAction,
  };
}

// ── Handoff builder ───────────────────────────────────────────────────────────

export function buildHandoffSummary(conv: ConvState, sdr: SDRAgentState): SDRHandoff {
  const scope = conv.scope;
  const estimate = conv.estimate;
  const biz = scope.businessName ?? scope.prospectName ?? "Prospect";

  const serviceList: string[] = [];
  if (scope.wantsSocialMedia) {
    const ppm = (scope.social?.postsPerWeek ?? 0) * 4;
    serviceList.push(`Social Media${ppm > 0 ? ` (${ppm} posts/mês)` : ""}`);
  }
  if (scope.wantsPaidTraffic) serviceList.push("Tráfego Pago");
  if (scope.branding?.requested) serviceList.push("Identidade Visual");

  const modeStr = scope.serviceMode && scope.serviceMode !== "unsure"
    ? ` ${engagementLabel(scope.serviceMode)}.` : "";
  const segmentStr = scope.segment ? ` (${scope.segment})` : "";
  const diagnosis = `${biz}${segmentStr} solicitou: ${serviceList.join(", ") || "escopo a definir"}.${modeStr}`;

  const finalScopeDescription = estimate.included.length > 0
    ? estimate.included.join("; ")
    : "Escopo não finalizado na conversa.";

  let budgetFit = "Budget não informado.";
  if (sdr.budgetSignal.amount !== undefined) {
    const fitLabels: Record<BudgetSignal["fitStatus"], string> = {
      fits:              "Budget adequado ao escopo.",
      above_budget:      "Budget abaixo da estimativa — escopo foi ajustado.",
      below_recommended: "Budget abaixo do piso do escopo desenhado — a proposta precisa enxugar ou o valor precisa subir.",
      unknown:           "Status de budget desconhecido.",
    };
    budgetFit = `Prospect mencionou: R$ ${sdr.budgetSignal.amount.toLocaleString("pt-BR")}. ${fitLabels[sdr.budgetSignal.fitStatus]}`;
  }

  const objectionLabels: Record<ObjectionType, string> = {
    price_too_high:          "Preço alto demais",
    unsure_budget:           "Orçamento indefinido",
    wants_cheaper:           "Pediu plano mais barato",
    wants_more_value:        "Questionou valor entregue",
    wants_remove_item:       "Pediu remoção de itens",
    wants_add_item:          "Pediu adição de itens",
    deadline_pressure:       "Pressão de prazo",
    needs_internal_approval: "Precisa aprovar internamente",
  };
  const objectionsHandled = sdr.objection.types.map((t) => objectionLabels[t]);

  const tradeoffsAccepted: string[] = [];
  const hasPriceOrCheaper = sdr.objection.types.some((t) =>
    ["price_too_high", "wants_cheaper", "wants_remove_item"].includes(t));
  if (scope.social?.reelsPerMonth === 0 && hasPriceOrCheaper)
    tradeoffsAccepted.push("Reels removidos do escopo");
  if (!scope.wantsPaidTraffic && sdr.objection.types.includes("price_too_high"))
    tradeoffsAccepted.push("Tráfego pago deixado de fora");
  const ppm = (scope.social?.postsPerWeek ?? 0) * 4;
  if (ppm <= 8 && sdr.objection.types.some((t) => ["price_too_high", "wants_cheaper"].includes(t)))
    tradeoffsAccepted.push("Cadência reduzida aceita (8 posts/mês)");

  const unresolvedRisks: string[] = [];
  if (sdr.objection.active) unresolvedRisks.push("Objeção de preço não resolvida na conversa");
  if (sdr.budgetSignal.fitStatus === "below_recommended")
    unresolvedRisks.push("Budget abaixo do piso do escopo desenhado");
  if (sdr.objection.types.includes("needs_internal_approval"))
    unresolvedRisks.push("Aprovação interna pendente");

  let recommendedPMAction = "Enviar proposta formal e agendar call de kickoff.";
  if (
    sdr.budgetSignal.fitStatus === "above_budget" ||
    sdr.budgetSignal.fitStatus === "below_recommended"
  ) {
    recommendedPMAction =
      "Negociar escopo antes da proposta formal. Apresentar opções de plano ajustado.";
  } else if (sdr.objection.types.includes("needs_internal_approval")) {
    recommendedPMAction =
      "Enviar proposta por e-mail para facilitar aprovação interna. Agendar follow-up em 48h.";
  }

  const qualityGateResult = runSDRQualityGate(conv, sdr);
  const cognitiveFlowSummary = buildCognitiveFlowSummary(conv, sdr);
  const brainReasoningOutput = buildBrainReasoningOutput(conv, sdr, qualityGateResult);

  return {
    diagnosis,
    finalScopeDescription,
    budgetFit,
    objectionsHandled,
    tradeoffsAccepted,
    unresolvedRisks,
    recommendedPMAction,
    brainReasoningOutput,
    cognitiveFlowSummary,
    qualityGateResult,
  };
}
