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
import { ehAvisoDeAnexo } from "./anexo-nao-e-resposta";
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

function parseProspectNameBiz(text: string): { prospectName?: string; businessName?: string } {
  let prospectName: string | undefined;
  let businessName: string | undefined;

  // ── Business name (ordered; first match wins) ─────────────────────────────
  // All capture groups require an uppercase-first letter — never match lowercase common words.
  // Post-match check `/^[A-ZÀ-ÿ]/` guards patterns that use /i for keyword matching.

  // 1. "chamado X" / "chamada X"
  const bizMatch = text.match(/chamad[ao]\s+([A-ZÀ-ÿ][^.!?,]{1,30}?)(?:\s*[.!?,]|\s+que\s|\s+e\s|\s+para\s|$)/i);
  if (bizMatch && /^[A-ZÀ-ÿ]/.test(bizMatch[1])) businessName = bizMatch[1].trim();

  // 2. "é o/a X" — "meu negócio é o Restaurante Sabor"
  if (!businessName) {
    const m = text.match(/[eé]\s+(?:o|a)\s+([A-ZÀ-ÿ][^.!?,\s]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})/i);
    if (m && /^[A-ZÀ-ÿ]/.test(m[1])) businessName = m[1].trim();
  }

  // 3. "negócio/empresa/restaurante… é/se chama X" — without article
  if (!businessName) {
    const m = text.match(/\b(?:neg[óo]cio|empresa|restaurante|loja|marca|bar|sushi\s*bar|caf[eé]|cantina)\s+(?:é|se\s+chama)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})/i);
    if (m && /^[A-ZÀ-ÿ]/.test(m[1])) businessName = m[1].trim();
  }

  // 4. "sou/trabalho/venho da/do/de [Name]" — no /i so capture requires uppercase
  if (!businessName) {
    const m = text.match(/\b(?:sou|estou|trabalho|venho|falo)\s+(?:da|do|de|na|no|pelo|pela)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})(?:\s*[,.!?]|\s+e\s|$)/);
    if (m) businessName = m[1].trim();
  }

  // 5. "para o/a [Name]" — no /i so capture requires uppercase
  if (!businessName) {
    const m = text.match(/\bpara\s+(?:o|a)\s+([A-ZÀ-ÿ][A-Za-zÀ-ÿ]{1,}(?:\s+[A-Za-zÀ-ÿ]{2,}){0,3})(?:\s*[,.!?]|\s+e\s|$)/);
    if (m) businessName = m[1].trim();
  }

  // 6. Multi-word TitleCase at sentence start — "Marca Exemplo, quero…" or standalone "Marca Exemplo"
  if (!businessName) {
    const m = text.match(/^([A-ZÀ-ÿ][a-zÀ-ÿ]{1,}(?:\s+[A-ZÀ-ÿ][a-zÀ-ÿ]{1,})+)(?:\s*[,.]|\s+[a-z]|$)/);
    if (m) businessName = m[1].trim();
  }

  // ── Person name (skip greetings and words identical to business name) ──────
  const GREETINGS = /^(oi|olá|ola|hey|hi|hello|bom|boa|caro|cara|prezado|prezada)$/i;
  const namePatterns = [
    /\b(?:sou (?:a |o )?|me chamo |meu nome [eé] |chamo-me )([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
    /^([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)\s*[,–-]/,
  ];
  for (const p of namePatterns) {
    const m = text.match(p);
    if (m) {
      const candidate = m[1].trim();
      if (!GREETINGS.test(candidate) && candidate.toLowerCase() !== businessName?.toLowerCase()) {
        prospectName = candidate;
      }
      break;
    }
  }

  // ── Fallback: bare answer to "qual é o seu nome?" ─────────────────────────
  // When neither a business nor a person name matched a pattern, but the user
  // typed a short proper-noun-like answer (e.g. just "Pedro"), treat it as the
  // person's name. The welcome explicitly asks for the name first, so a short
  // standalone answer is far more likely a name than a service request. This
  // stops the "I didn't understand, repeating the question" loop.
  if (!businessName && !prospectName) {
    const trimmed = text.trim();
    const words = trimmed.split(/\s+/);
    const SERVICE_OR_INTENT =
      /\b(redes?|social|m[ií]dia|tr[áa]fego|ads?|an[úu]ncio|marca|logo|identidade|posts?|stories|reels?|quero|preciso|gostaria|busco|procuro)\b/i;
    if (
      words.length >= 1 && words.length <= 2 &&
      /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*( [A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*)?$/.test(trimmed) &&
      !SERVICE_OR_INTENT.test(trimmed) &&
      !GREETINGS.test(words[0])
    ) {
      prospectName = trimmed;
    }
  }

  return { prospectName, businessName };
}

// Extract a business name hint from uploaded file names (weak signal — used only when
// text-based detection finds nothing). Takes words from the START of the filename
// until hitting a descriptor/filler word so that:
//   "Marca_Exemplo_Brand_Book_v2.pdf" → "Marca Exemplo"
//   "marca_exemplo_brand_book.pdf" → "Marca Exemplo"
//   "apresentacao_institucional.pdf" → (ignored — "apresentacao" is a filler-like word)
function extractBizFromFileNames(fileNames: string[]): string | undefined {
  const FILLER = /^(brand|book|guide|logo|identidade|visual|manual|marca|proposta|briefing|documento|arquivo|file|doc|presentation|slide|deck|kit|pack|template|mockup|reference|ref|final|v\d+|original|compressed|revised?|revisao|fiel|draft|version|copy|master|update|new|old|complete|full|apresent\w*|institucional|completo|oficial|\d+)$/i;
  for (const name of fileNames) {
    const base = name.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ").trim();
    const words = base.split(/\s+/);
    // Take words from the START until hitting a filler/descriptor keyword
    const nameWords: string[] = [];
    for (const w of words) {
      if (w.length < 2 || FILLER.test(w)) break;
      nameWords.push(w);
    }
    if (nameWords.length >= 1) {
      const candidate = nameWords
        .slice(0, 4)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      if (candidate.length >= 3) return candidate;
    }
  }
  return undefined;
}

// ── Identity question IDs ─────────────────────────────────────────────────────

function inferProspectAnsweredQIds(scope: BriefingScope): string[] {
  const base = inferAnsweredQIds(scope);
  if (scope.prospectName && scope.businessName) base.push("prospect_name_biz");
  return [...new Set(base)];
}

// ── Identity question definitions ─────────────────────────────────────────────

// NOTE: e-mail and WhatsApp are NEVER collected in the conversation. They are
// captured automatically when the prospect signs in with Google after confirming
// their request (see PublicBriefingRoom → GoogleSignInButton). Asking for them in
// the chat caused the model to confuse business descriptions with email inputs —
// the bug is eliminated by removing the questions entirely, not by patching them.
const IDENTITY_QUESTIONS: QuestionDef[] = [
  {
    id: "prospect_name_biz",
    when: (s) => !s.scope.prospectName || !s.scope.businessName,
    text: (s) => {
      const biz  = s.scope.businessName;
      const name = s.scope.prospectName;
      if (biz && !name) {
        return `Entendi que estamos falando do **${biz}**! E qual é o seu nome?`;
      }
      if (name && !biz) {
        const first = name.split(" ")[0];
        return `Prazer, ${first}! E qual é o nome do seu negócio?`;
      }
      return "Para começar, qual é o seu nome e o nome do seu negócio?";
    },
    parse: (answer, s) => {
      let { prospectName, businessName } = parseProspectNameBiz(answer);
      // "Negócio = Nome" fix: a bare multi-word proper name given while we still
      // need the person's name (welcome asks the NAME first) is the person, not
      // the business — the old TitleCase rule wrongly captured it as businessName.
      const hasBizSignal = /chamad[ao]|neg[óo]cio|empresa|loja\b|marca\b|restaurante|bar\b|caf[eé]|est[úu]dio|studio|ag[êe]ncia|cl[íi]nica|é\s+(o|a)\s|sou\s+d[aeo]/i.test(answer);
      if (businessName && !prospectName && !s.scope.prospectName && !hasBizSignal && businessName.trim().split(/\s+/).length >= 3) {
        prospectName = businessName;
        businessName = undefined;
      }
      return {
        ...(prospectName ? { prospectName } : {}),
        ...(businessName
          ? { businessName }
          // If we already know the businessName and only asked for a person name,
          // treat the raw answer as the prospect name rather than the business name.
          : s.scope.businessName
          ? { prospectName: prospectName ?? answer.trim() }
          : !prospectName
          ? { businessName: answer.trim() }
          : {}),
      };
    },
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

export function processProspectMessage(
  text: string,
  state: ProspectConvState,
  attachmentFileNames?: string[],
): ProspectConvState {
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

  // ── Anexar arquivo não responde pergunta nenhuma ──────────────────────────
  // 16/08/2026: o recado automático de anexo entrava aqui como se fosse frase
  // digitada e virava a resposta da pergunta aberta — o nome de um PDF ocupou o
  // campo Orçamento inteiro na tela do CEO. Ver `anexo-nao-e-resposta.ts`.
  // O escopo fica intacto e a pergunta continua na fila: o conteúdo do
  // documento entra pelo caminho do SDR, que é quem sabe ler documento.
  const avisoDeAnexo = ehAvisoDeAnexo(text);

  if (avisoDeAnexo) {
    newScope    = conv.scope;
    newAnswered = conv.answeredQIds;
  } else if (conv.isFirstMessage) {
    const serviceDelta = parseInitialMessage(text);
    let { prospectName, businessName: bizFromText } = parseProspectNameBiz(text);
    // Negócio ≠ Nome: a bare person name (no business keyword) must not be
    // captured as the business — both parsers guess it from a TitleCase string.
    const hasBizSignal = /chamad[ao]|neg[óo]cio|empresa|loja\b|marca\b|restaurante|bar\b|caf[eé]|est[úu]dio|studio|ag[êe]ncia|cl[íi]nica|é\s+(o|a)\s|sou\s+d[aeo]/i.test(text);
    const guessedBiz = bizFromText ?? serviceDelta.businessName;
    // 3+ words with no business keyword reads as a full person name (first +
    // middle + last), not a brand — treat it as the person, ask the business next.
    if (guessedBiz && !prospectName && !hasBizSignal && guessedBiz.trim().split(/\s+/).length >= 3) {
      prospectName = guessedBiz;
      bizFromText = undefined;
      delete serviceDelta.businessName;
    }
    // Use file-name hint as a weak signal only when text detection finds nothing
    const bizFromFiles = !bizFromText && attachmentFileNames?.length
      ? extractBizFromFileNames(attachmentFileNames)
      : undefined;
    const businessName = bizFromText ?? bizFromFiles;
    newScope = mergeScopeDelta(emptyScope(), {
      ...serviceDelta,
      ...(prospectName ? { prospectName } : {}),
      ...(businessName ? { businessName } : {}),
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
        const delta    = currentQ.parse(text, conv);
        newScope       = mergeScopeDelta(conv.scope, delta);
        const inferred = inferProspectAnsweredQIds(newScope);
        const isIdentity = IDENTITY_QUESTIONS.some((q) => q.id === currentQ.id);
        // Identity questions are only marked answered once actually satisfied.
        // This prevents (a) losing the person's name when only the business was
        // parsed, and (b) storing an invalid e-mail/phone as if it were valid.
        // Non-identity questions keep the original "asked = answered" behavior.
        const stillPending = isIdentity && currentQ.when({ ...conv, scope: newScope });
        if (stillPending) {
          newAnswered = [...new Set([...conv.answeredQIds, ...inferred])];
        } else {
          newAnswered = [...new Set([...conv.answeredQIds, currentQ.id, ...inferred])];
        }
      } else {
        newScope    = conv.scope;
        newAnswered = conv.answeredQIds;
      }
    }
  }

  // ── SDR intelligence layer ─────────────────────────────────────────────────
  // O recado de anexo também não é objeção nem sinal de verba: "…_v1.pdf" tem
  // número dentro, e ler número de nome de arquivo como orçamento do cliente é
  // o mesmo defeito de 16/08 entrando por outra porta.
  const ignoraLeitura  = conv.isFirstMessage || avisoDeAnexo;
  const objectionTypes = ignoraLeitura ? [] : detectObjectionTypes(text);
  const parsedBudget   = ignoraLeitura ? undefined : parseBudgetAmount(text);
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
    } else {
      // Also resolve when the prospect answers the objection by stating a budget
      // that FITS the current estimate — no scope change or acceptance word
      // needed. Without this, the confirm CTA stayed wedged behind the objection.
      const bAmt = newSdr.budgetSignal.amount;
      const fits = bAmt !== undefined && evaluateBudgetFit(bAmt, newEstimate) === "fits";
      if (clientAccepts || fits) {
        newSdr.objection = { ...newSdr.objection, active: false, resolvedAt: new Date().toISOString() };
        if (fits) newSdr.budgetSignal = { ...newSdr.budgetSignal, fitStatus: "fits" };
      }
    }
  }

  // ── Build mid ConvState ───────────────────────────────────────────────────
  const mid: ConvState = {
    ...withClient,
    scope: newScope,
    answeredQIds: newAnswered,
    // Anexo não consome a primeira fala. Se o visitante começa a conversa
    // subindo o briefing, quem se apresenta ainda é a mensagem que ele vai
    // digitar — senão a apresentação (nome, negócio, serviço) se perde no
    // recado do arquivo e nunca mais é lida.
    isFirstMessage: avisoDeAnexo ? conv.isFirstMessage : false,
    estimate: newEstimate,
    canSubmit: false,
  };

  const nextQ   = getNextProspectQuestion(mid);
  const allDone = nextQ === null;

  // ── Reply text ────────────────────────────────────────────────────────────
  let replyText: string;

  if (conv.isFirstMessage) {
    const hasService = newScope.wantsSocialMedia || !!newScope.wantsPaidTraffic || !!newScope.branding?.requested;
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
      : `${prefix}Tenho as informações principais! Confira o resumo do seu pedido e confirme para eu preparar seu orçamento.`;

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
    replyText = "Perfeito! Tenho todas as informações que preciso. Confira o resumo do seu pedido e confirme para eu preparar seu orçamento personalizado.";
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
