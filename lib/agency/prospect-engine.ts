// ─── Prospect SDR Engine V2 ───────────────────────────────────────────────────
// Extends the conversational briefing engine with:
// 1. Identity capture (name / business / e-mail / WhatsApp) before scope questions
// 2. SDR commercial intelligence: objection detection, budget parsing, negotiation
// 3. Restaurant-aware consultative questions
// 4. Submission gate: identity + service complete, no unresolved price objection
// ─────────────────────────────────────────────────────────────────────────────

import type { ConvState, ConvMessage, BriefingScope } from "./briefing-conversation";
import { emptyScope, emptyEstimate } from "./briefing-conversation";
import { computeEstimate } from "./live-calculator";
import {
  isYes, parseInitialMessage, inferAnsweredQIds, mergeScopeDelta,
  buildAcknowledgment, detectNegotiation, getNextQuestion,
  type QuestionDef,
} from "./question-engine";
import {
  emptySdrState, parseBudgetAmount, detectObjectionTypes,
  isRestaurantSegment, evaluateBudgetFit, detectNegotiationStage,
  buildPriceObjectionReply, buildConsultativeFrequencyQuestion,
  buildBudgetQuestion, canSubmitProposal, computeQualificationScore,
  type SDRAgentState, type BudgetSignal,
} from "./sdr-agent";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProspectConvState {
  conv: ConvState;
  sdr: SDRAgentState;
}

// ── Identity helpers ──────────────────────────────────────────────────────────

function extractEmail(t: string): string | undefined {
  const m = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : undefined;
}

function cleanPhone(t: string): string {
  return t.replace(/[^0-9+\s()-]/g, "").trim();
}

function parseProspectNameBiz(text: string): { prospectName?: string; businessName?: string } {
  let prospectName: string | undefined;
  let businessName: string | undefined;

  const namePatterns = [
    /\b(?:sou (?:a |o )?|me chamo |meu nome [eé] |chamo-me )([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
    /^([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)\s*[,–-]/,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) { prospectName = m[1].trim(); break; }
  }

  const bizMatch = text.match(/chamad[ao]\s+([A-ZÀ-ÿ][^.!?,]{1,30}?)(?:\s*[.!?,]|\s+que\s|\s+e\s|\s+para\s|$)/i);
  if (bizMatch) { businessName = bizMatch[1].trim(); }
  if (!businessName) {
    const m2 = text.match(/[eé]\s+(?:o|a)\s+([A-ZÀ-ÿ][^.!?,\s]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})/i);
    if (m2) businessName = m2[1].trim();
  }

  return { prospectName, businessName };
}

// ── Identity question IDs ─────────────────────────────────────────────────────

function inferProspectAnsweredQIds(scope: BriefingScope): string[] {
  const base = inferAnsweredQIds(scope);
  if (scope.prospectName && scope.businessName) base.push("prospect_name_biz");
  if (scope.prospectEmail) base.push("prospect_email");
  if (scope.prospectPhone) base.push("prospect_phone");
  return [...new Set(base)];
}

// ── Identity question definitions ─────────────────────────────────────────────

const IDENTITY_QUESTIONS: QuestionDef[] = [
  {
    id: "prospect_name_biz",
    when: (s) => !s.scope.prospectName || !s.scope.businessName,
    text: () => "Para começar, qual é o seu nome e o nome do seu negócio?",
    parse: (answer) => {
      const { prospectName, businessName } = parseProspectNameBiz(answer);
      return {
        ...(prospectName ? { prospectName } : {}),
        ...(businessName
          ? { businessName }
          : !prospectName ? { businessName: answer.trim() } : {}),
      };
    },
  },
  {
    id: "prospect_email",
    when: (s) => !s.scope.prospectEmail,
    text: (s) => {
      const first = s.scope.prospectName?.split(" ")[0];
      return first
        ? `Prazer, ${first}! Qual é o seu e-mail para contato?`
        : "Qual é o seu e-mail para contato?";
    },
    parse: (answer) => ({
      prospectEmail: extractEmail(answer) ?? answer.trim(),
    }),
  },
  {
    id: "prospect_phone",
    when: (s) => !s.scope.prospectPhone,
    text: () => "E o seu WhatsApp?",
    parse: (answer) => ({
      prospectPhone: cleanPhone(answer) || answer.trim(),
    }),
  },
];

// ── Question ordering ─────────────────────────────────────────────────────────

function getNextProspectQuestion(state: ConvState): QuestionDef | null {
  for (const q of IDENTITY_QUESTIONS) {
    if (!state.answeredQIds.includes(q.id) && q.when(state)) return q;
  }
  return getNextQuestion(state);
}

// ── SDR-aware question text override ─────────────────────────────────────────

function buildSDRQuestionText(q: QuestionDef, state: ConvState, sdr: SDRAgentState): string {
  switch (q.id) {
    case "posts_per_week":
      return buildConsultativeFrequencyQuestion(state.scope);
    case "budget_range":
      return buildBudgetQuestion(state.scope, state.estimate);
    default:
      return q.text(state);
  }
}

// ── initProspectConvState ─────────────────────────────────────────────────────

export function initProspectConvState(): ProspectConvState {
  const welcome: ConvMessage = {
    id: "welcome",
    role: "assistant",
    text: "Olá! Seja bem-vindo(a) à Dioli Studio.\n\nSou sua consultora de orçamento. Vou te ajudar a montar uma proposta personalizada para o seu negócio — com estimativa de investimento atualizada em tempo real.\n\n**Para começar, qual é o seu nome e o nome do seu negócio?**",
    createdAt: new Date().toISOString(),
  };
  const conv: ConvState = {
    messages: [welcome],
    scope: emptyScope(),
    answeredQIds: [],
    isFirstMessage: true,
    estimate: emptyEstimate(),
    canSubmit: false,
  };
  return { conv, sdr: emptySdrState() };
}

// ── processProspectMessage ────────────────────────────────────────────────────

export function processProspectMessage(text: string, state: ProspectConvState): ProspectConvState {
  const { conv, sdr } = state;

  const clientMsg: ConvMessage = {
    id: `c${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "client",
    text,
    createdAt: new Date().toISOString(),
  };
  const withClient: ConvState = { ...conv, messages: [...conv.messages, clientMsg] };

  // ── Scope parsing ─────────────────────────────────────────────────────────
  let newScope: BriefingScope;
  let newAnswered: string[];
  let negotiationReply: string | null = null;
  let negotiationHappened = false;

  if (conv.isFirstMessage) {
    const serviceDelta = parseInitialMessage(text);
    const { prospectName, businessName } = parseProspectNameBiz(text);
    newScope = mergeScopeDelta(emptyScope(), {
      ...serviceDelta,
      ...(prospectName ? { prospectName } : {}),
      ...(businessName ? { businessName: businessName ?? serviceDelta.businessName } : {}),
    });
    newAnswered = inferProspectAnsweredQIds(newScope);
  } else {
    const negotiation = detectNegotiation(text, conv);
    if (negotiation) {
      newScope         = mergeScopeDelta(conv.scope, negotiation.scopeDelta);
      newAnswered      = [...new Set([...conv.answeredQIds, ...inferProspectAnsweredQIds(newScope)])];
      negotiationReply = negotiation.replyText;
      negotiationHappened = true;
    } else {
      const currentQ = getNextProspectQuestion(conv);
      if (currentQ) {
        const delta = currentQ.parse(text, conv);
        newScope    = mergeScopeDelta(conv.scope, delta);
        newAnswered = [...new Set([...conv.answeredQIds, currentQ.id, ...inferProspectAnsweredQIds(newScope)])];
      } else {
        newScope    = conv.scope;
        newAnswered = conv.answeredQIds;
      }
    }
  }

  // ── SDR intelligence layer ─────────────────────────────────────────────────
  const objectionTypes = conv.isFirstMessage ? [] : detectObjectionTypes(text);
  const parsedBudget   = conv.isFirstMessage ? undefined : parseBudgetAmount(text);
  const newEstimate    = computeEstimate(newScope);

  let newSdr: SDRAgentState = { ...sdr };

  // Restaurant detection
  if (isRestaurantSegment(newScope)) newSdr.isRestaurant = true;

  // Budget signal update
  if (parsedBudget !== undefined) {
    const fitStatus = evaluateBudgetFit(parsedBudget, newEstimate);
    newSdr.budgetSignal = {
      raw: text.trim(),
      amount: parsedBudget,
      fitStatus,
      acknowledgedAt: new Date().toISOString(),
    };
  }

  // Objection state — only price-related objections block submission
  const isPriceObjection = objectionTypes.some((t) =>
    t === "price_too_high" || t === "unsure_budget" || t === "wants_cheaper"
  );
  if (isPriceObjection) {
    newSdr.objection = {
      active: true,
      types: [...new Set([...sdr.objection.types, ...objectionTypes])],
      lastText: text,
      resolvedAt: sdr.objection.resolvedAt,
    };
  }

  // Objection resolution
  if (sdr.objection.active) {
    const clientAccepts = isYes(text) ||
      /pode ser|tá bom|ta bom|aceito|vamos assim|combinado|ótimo|perfeito/i.test(text);
    if (negotiationHappened) {
      const bAmt = newSdr.budgetSignal.amount;
      const newFit: BudgetSignal["fitStatus"] = bAmt !== undefined
        ? evaluateBudgetFit(bAmt, newEstimate)
        : "unknown";
      if (newFit === "fits" || clientAccepts) {
        newSdr.objection = { ...newSdr.objection, active: false, resolvedAt: new Date().toISOString() };
        if (bAmt !== undefined) newSdr.budgetSignal = { ...newSdr.budgetSignal, fitStatus: newFit };
      }
    } else if (clientAccepts) {
      newSdr.objection = { ...newSdr.objection, active: false, resolvedAt: new Date().toISOString() };
    }
  }

  // ── Build mid ConvState ───────────────────────────────────────────────────
  const mid: ConvState = {
    ...withClient,
    scope: newScope,
    answeredQIds: newAnswered,
    isFirstMessage: false,
    estimate: newEstimate,
    canSubmit: false,
  };

  const nextQ   = getNextProspectQuestion(mid);
  const allDone = nextQ === null;

  // ── Reply text ────────────────────────────────────────────────────────────
  let replyText: string;

  if (conv.isFirstMessage) {
    const hasService = newScope.wantsSocialMedia || !!newScope.wantsPaidTraffic || newScope.branding.requested;
    let ack = hasService ? buildAcknowledgment(newScope) : "";
    if (ack && newSdr.isRestaurant) {
      ack = ack.replace(
        /Vejo que você quer social media/,
        "Ótimo! Para restaurantes, redes sociais bem feitas fazem uma diferença enorme. Vejo que você quer social media",
      );
    }
    const prefix = ack ? ack + "\n\n" : "";
    replyText = nextQ
      ? `${prefix}${buildSDRQuestionText(nextQ, mid, newSdr)}`
      : `${prefix}Tenho as informações principais! Revise a proposta ao lado e envie quando estiver pronto.`;

  } else if (newSdr.objection.active) {
    if (negotiationHappened) {
      // Scope adjusted but objection still active — ask for confirmation
      replyText = `${negotiationReply}\n\nIsso está mais próximo do que você tem em mente?`;
    } else {
      replyText = buildPriceObjectionReply(newScope, newEstimate, parsedBudget);
    }

  } else if (negotiationReply) {
    replyText = nextQ && !allDone
      ? `${negotiationReply}\n\n${buildSDRQuestionText(nextQ, mid, newSdr)}`
      : negotiationReply;

  } else if (nextQ) {
    const lastAnswered = newAnswered[newAnswered.length - 1];
    const wasInIdentity = IDENTITY_QUESTIONS.some((q) => q.id === lastAnswered);
    const nextIsService = !IDENTITY_QUESTIONS.some((q) => q.id === nextQ.id);
    if (wasInIdentity && nextIsService && newScope.businessName) {
      replyText = `Ótimo! Agora me conta: o que você está precisando para o **${newScope.businessName}**?\n\n${buildSDRQuestionText(nextQ, mid, newSdr)}`;
    } else {
      replyText = buildSDRQuestionText(nextQ, mid, newSdr);
    }

  } else {
    replyText = "Perfeito! Tenho todas as informações. Revise a proposta ao lado e clique em **\"Enviar para análise\"** quando estiver pronto.";
  }

  // ── Finalise SDR state ────────────────────────────────────────────────────
  newSdr.negotiationStage = newSdr.objection.active
    ? "objection_handling"
    : allDone
    ? "proposal_ready"
    : detectNegotiationStage(newScope, newSdr, newEstimate);
  newSdr.qualificationScore = computeQualificationScore(newScope, newSdr);

  const assistantMsg: ConvMessage = {
    id: `a${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "assistant",
    text: replyText,
    createdAt: new Date().toISOString(),
  };

  return {
    conv: {
      ...mid,
      messages: [...mid.messages, assistantMsg],
      estimate: newEstimate,
      canSubmit: canSubmitProposal(mid, newSdr),
    },
    sdr: newSdr,
  };
}
