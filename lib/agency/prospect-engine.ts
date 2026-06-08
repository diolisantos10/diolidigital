// ─── Prospect SDR Engine ─────────────────────────────────────────────────────
// Extends the conversational briefing engine with identity capture
// (name / business / e-mail / WhatsApp) before the service scope questions.
// IMPORTANT: Does NOT expose pricing tables before minimum data exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConvState, ConvMessage, BriefingScope } from "./briefing-conversation";
import { emptyScope, emptyEstimate } from "./briefing-conversation";
import { computeEstimate } from "./live-calculator";
import {
  isYes, isNo, detectPlatforms, parseInitialMessage,
  inferAnsweredQIds, mergeScopeDelta, buildAcknowledgment,
  detectNegotiation, getNextQuestion,
  type QuestionDef,
} from "./question-engine";

// Suppress unused import warnings for helpers used indirectly
void isYes;
void isNo;
void detectPlatforms;

// ── Identity helpers ──────────────────────────────────────────────────────────

function extractEmail(t: string): string | undefined {
  const m = t.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : undefined;
}

function cleanPhone(t: string): string {
  return t.replace(/[^0-9+\s()-]/g, "").trim();
}

// Parse name + businessName from identity answer
// Handles: "Sou Maria, tenho uma clínica chamada Bella", "João da Pizzaria X"
function parseProspectNameBiz(text: string): { prospectName?: string; businessName?: string } {
  let prospectName: string | undefined;
  let businessName: string | undefined;

  // Extract personal name
  const namePatterns = [
    /\b(?:sou (?:a |o )?|me chamo |meu nome [eé] |chamo-me )([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
    /^([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)\s*[,–-]/,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) { prospectName = m[1].trim(); break; }
  }

  // Extract business name (reuse same patterns as question-engine parseInitialMessage)
  const bizMatch = text.match(/chamad[ao]\s+([A-ZÀ-ÿ][^.!?,]{1,30}?)(?:\s*[.!?,]|\s+que\s|\s+e\s|\s+para\s|$)/i);
  if (bizMatch) { businessName = bizMatch[1].trim(); }
  if (!businessName) {
    const m2 = text.match(/[eé]\s+(?:o|a)\s+([A-ZÀ-ÿ][^.!?,\s]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})/i);
    if (m2) businessName = m2[1].trim();
  }

  return { prospectName, businessName };
}

// ── Identity question IDs bookkeeping ─────────────────────────────────────────

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
      // If only one was detected, fall back to treating whole answer as business name
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

// ── Prospect question order ───────────────────────────────────────────────────

// Full question list: identity first, then service scope.
// getNextQuestion from question-engine handles the service questions.
// We handle identity questions ourselves before delegating.
function getNextProspectQuestion(state: ConvState): QuestionDef | null {
  // Identity phase first
  for (const q of IDENTITY_QUESTIONS) {
    if (!state.answeredQIds.includes(q.id) && q.when(state)) return q;
  }
  // Then service scope questions
  return getNextQuestion(state);
}

// ── initProspectConvState ─────────────────────────────────────────────────────

export function initProspectConvState(): ConvState {
  const welcome: ConvMessage = {
    id: "welcome",
    role: "assistant",
    text: "Olá! Seja bem-vindo(a) à Dioli Studio.\n\nSou sua consultora de orçamento. Vou te ajudar a montar uma proposta personalizada para o seu negócio — com estimativa de investimento atualizada em tempo real.\n\n**Para começar, qual é o seu nome e o nome do seu negócio?**",
    createdAt: new Date().toISOString(),
  };
  return {
    messages: [welcome],
    scope: emptyScope(),
    answeredQIds: [],
    isFirstMessage: true,
    estimate: emptyEstimate(),
    canSubmit: false,
  };
}

// ── processProspectMessage ────────────────────────────────────────────────────
// Mirrors processClientMessage from question-engine.ts but:
// 1. On first message: parses BOTH identity (name/biz) AND service intent simultaneously
// 2. After identity: checks negotiation then moves through questions
// 3. canSubmit requires identity complete (email + phone captured)

export function processProspectMessage(text: string, state: ConvState): ConvState {
  const clientMsg: ConvMessage = {
    id: `c${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "client",
    text,
    createdAt: new Date().toISOString(),
  };
  const withClient = { ...state, messages: [...state.messages, clientMsg] };

  let newScope: BriefingScope;
  let newAnswered: string[];
  let negotiationReply: string | null = null;

  if (state.isFirstMessage) {
    // Parse identity + service intent simultaneously from first message
    const serviceDelta = parseInitialMessage(text);
    const { prospectName, businessName } = parseProspectNameBiz(text);
    newScope = mergeScopeDelta(emptyScope(), {
      ...serviceDelta,
      ...(prospectName ? { prospectName } : {}),
      // businessName from identity parse takes precedence only if serviceDelta has no businessName
      ...(businessName ? { businessName: businessName ?? serviceDelta.businessName } : {}),
    });
    newAnswered = inferProspectAnsweredQIds(newScope);
  } else {
    // Check negotiation first
    const negotiation = detectNegotiation(text, state);
    if (negotiation) {
      newScope = mergeScopeDelta(state.scope, negotiation.scopeDelta);
      newAnswered = [...new Set([...state.answeredQIds, ...inferProspectAnsweredQIds(newScope)])];
      negotiationReply = negotiation.replyText;
    } else {
      // Answer current question (identity or service)
      const currentQ = getNextProspectQuestion(state);
      if (currentQ) {
        const delta = currentQ.parse(text, state);
        newScope = mergeScopeDelta(state.scope, delta);
        newAnswered = [...new Set([...state.answeredQIds, currentQ.id, ...inferProspectAnsweredQIds(newScope)])];
      } else {
        newScope = state.scope;
        newAnswered = state.answeredQIds;
      }
    }
  }

  const mid: ConvState = {
    ...withClient,
    scope: newScope,
    answeredQIds: newAnswered,
    isFirstMessage: false,
    estimate: state.estimate,
    canSubmit: false,
  };

  const estimate = computeEstimate(newScope);
  const nextQ = getNextProspectQuestion(mid);
  const allDone = nextQ === null;

  // Identity completion check
  const identityDone = !!newScope.prospectEmail && !!newScope.prospectPhone;
  const serviceAnswered = newAnswered.filter((id) => !id.startsWith("prospect_")).length;

  let replyText: string;
  if (state.isFirstMessage) {
    // Build acknowledgment if any service intent was detected
    const hasService = newScope.wantsSocialMedia || !!newScope.wantsPaidTraffic || newScope.branding.requested;
    const ack = hasService ? buildAcknowledgment(newScope) + "\n\n" : "";
    replyText = nextQ ? `${ack}${nextQ.text(mid)}` : `${ack}Tenho as informações principais! Revise a proposta ao lado e envie quando estiver pronto.`;
  } else if (negotiationReply) {
    replyText = nextQ && !allDone ? `${negotiationReply}\n\n${nextQ.text(mid)}` : negotiationReply;
  } else if (nextQ) {
    // Transition message when leaving identity phase
    const lastAnswered = newAnswered[newAnswered.length - 1];
    const wasInIdentity = IDENTITY_QUESTIONS.some((q) => q.id === lastAnswered);
    const nextIsService = !IDENTITY_QUESTIONS.some((q) => q.id === nextQ.id);
    if (wasInIdentity && nextIsService && newScope.businessName) {
      replyText = `Ótimo! Agora me conta: o que você está precisando para o **${newScope.businessName}**?\n\n${nextQ.text(mid)}`;
    } else {
      replyText = nextQ.text(mid);
    }
  } else {
    replyText = "Perfeito! Tenho todas as informações. Revise a proposta ao lado e clique em **\"Enviar para análise\"** quando estiver pronto.";
  }

  const assistantMsg: ConvMessage = {
    id: `a${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    role: "assistant",
    text: replyText,
    createdAt: new Date().toISOString(),
  };

  return {
    ...mid,
    messages: [...mid.messages, assistantMsg],
    estimate,
    canSubmit: identityDone && (allDone || serviceAnswered >= 5),
  };
}
