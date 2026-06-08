// ─── SDR Agent V1 ─────────────────────────────────────────────────────────────
// Commercial intelligence layer for the public /briefing flow.
// All functions are pure — no side effects, no UI dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import type { BriefingScope, ConvState, LiveEstimate } from "./briefing-conversation";

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

export interface SDRHandoff {
  diagnosis: string;
  finalScopeDescription: string;
  budgetFit: string;
  objectionsHandled: string[];
  tradeoffsAccepted: string[];
  unresolvedRisks: string[];
  recommendedPMAction: string;
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
  const hasService = scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding.requested;
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
  const biz = scope.businessName ?? "seu negócio";
  const isResto = isRestaurantSegment(scope);
  const restoTip = isResto
    ? "\n\nPara restaurantes, o **Plano Starter** com foco em Instagram já gera bons resultados — fotos de pratos, stories de cardápio e promoções semanais."
    : "";

  if (parsedBudget !== undefined) {
    const budgetStr = `R$ ${parsedBudget.toLocaleString("pt-BR")}`;
    if (parsedBudget < 1200) {
      return `Entendo — ${budgetStr} é o limite que você tem em mente.\n\nNosso plano de entrada começa em **R$ 1.200/mês** (Plano Starter: 8 posts + 8 stories/mês). Com ${budgetStr}, ficamos fora do nosso padrão mínimo, mas posso apresentar o que é possível dentro dessa faixa.${restoTip}\n\nQuer explorar o **Plano Starter** como ponto de partida para o **${biz}**, ou prefere me contar qual é a prioridade máxima?`;
    }
    if (estimate.totalMin > 0 && parsedBudget < estimate.totalMin) {
      const gap = estimate.totalMin - parsedBudget;
      return `Entendo — ${budgetStr} é o orçamento que você tem em mente para o **${biz}**.\n\nO escopo atual está em **R$ ${estimate.totalMin.toLocaleString("pt-BR")}–${estimate.totalMax.toLocaleString("pt-BR")}/mês** — uma diferença de R$ ${gap.toLocaleString("pt-BR")}. Posso ajustar para o **Plano Starter (R$ 1.200–1.800/mês)** — 8 posts + 8 stories/mês — que fica mais próximo.${restoTip}\n\nQuer que eu faça esse ajuste?`;
    }
    return `Entendido — ${budgetStr}/mês está dentro do que planejamos para o **${biz}**. Podemos seguir com o escopo atual.`;
  }

  // Generic price objection
  const postsPerMonth = (scope.social?.postsPerWeek ?? 0) * 4;
  if (postsPerMonth > 8) {
    return `Entendo a preocupação com o investimento. O plano atual inclui **${postsPerMonth} posts/mês** — um volume que entrega resultados consistentes para o **${biz}**.\n\nSe preferir começar menor, posso ajustar para o **Plano Starter (R$ 1.200–1.800/mês)** — 8 posts + 8 stories/mês. Qual faixa de orçamento você tem em mente?`;
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

export function buildBudgetQuestion(scope: BriefingScope, estimate: LiveEstimate): string {
  const biz = scope.businessName ?? "seu negócio";
  if (estimate.totalMin > 0) {
    return `Para fechar o escopo do **${biz}**: a estimativa atual está em **R$ ${estimate.totalMin.toLocaleString("pt-BR")}–${estimate.totalMax.toLocaleString("pt-BR")}/mês**. Isso está dentro do que você planejou, ou precisa ajustar?`;
  }
  return `Qual faixa de orçamento mensal você tem em mente para o **${biz}**? Isso me ajuda a montar o escopo certo.`;
}

// ── Submission gate ───────────────────────────────────────────────────────────

export function canSubmitProposal(conv: ConvState, sdr: SDRAgentState): boolean {
  const scope = conv.scope;
  const identityDone = !!scope.prospectEmail && !!scope.prospectPhone;
  const hasService = scope.wantsSocialMedia || !!scope.wantsPaidTraffic || scope.branding.requested;
  const serviceAnswered = conv.answeredQIds.filter((id) => !id.startsWith("prospect_")).length;
  return identityDone && hasService && !sdr.objection.active && serviceAnswered >= 3;
}

export function getSubmissionBlockReason(conv: ConvState, sdr: SDRAgentState): string | null {
  const scope = conv.scope;
  if (!scope.prospectEmail || !scope.prospectPhone)
    return "Precisamos do seu e-mail e WhatsApp para enviar a proposta.";
  if (!scope.wantsSocialMedia && !scope.wantsPaidTraffic && !scope.branding.requested)
    return "Conte o que você precisa para montarmos a proposta.";
  if (sdr.objection.active)
    return "Resolva o ponto em aberto antes de enviar.";
  return null;
}

// ── Qualification score ───────────────────────────────────────────────────────

export function computeQualificationScore(scope: BriefingScope, sdr: SDRAgentState): number {
  let score = 0;
  if (scope.prospectName)    score += 1;
  if (scope.businessName)    score += 1;
  if (scope.prospectEmail)   score += 2;
  if (scope.prospectPhone)   score += 2;
  if (scope.wantsSocialMedia || scope.wantsPaidTraffic || scope.branding.requested) score += 1;
  if (scope.serviceMode)     score += 1;
  if (sdr.budgetSignal.fitStatus !== "unknown") score += 1;
  if (scope.objectives.length > 0) score += 1;
  return Math.min(score, 10);
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
  if (scope.branding.requested) serviceList.push("Identidade Visual");

  const modeStr = scope.serviceMode === "monthly" ? " Gestão mensal."
    : scope.serviceMode === "one_off" ? " Projeto pontual." : "";
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
      below_recommended: "Budget abaixo do Plano Starter (R$ 1.200 mínimo).",
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
    tradeoffsAccepted.push("Plano Starter aceito (8 posts/mês)");

  const unresolvedRisks: string[] = [];
  if (sdr.objection.active) unresolvedRisks.push("Objeção de preço não resolvida na conversa");
  if (sdr.budgetSignal.fitStatus === "below_recommended")
    unresolvedRisks.push("Budget abaixo do Plano Starter mínimo");
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

  return {
    diagnosis,
    finalScopeDescription,
    budgetFit,
    objectionsHandled,
    tradeoffsAccepted,
    unresolvedRisks,
    recommendedPMAction,
  };
}
