// ─── Conversational question engine ──────────────────────────────────────────
// Defines questions for the Briefing Room V2 SDR flow.
// Asks one question at a time, in order, skipping already-answered questions.
// IMPORTANT: Brand Book upload/mention sets hasBrandBook — NOT requestedBranding.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConvState, ConvMessage, BriefingScope, SocialScope } from "./briefing-conversation";
import { emptyBrandingScope, emptyScope, emptyEstimate } from "./briefing-conversation";
import { computeEstimate } from "./live-calculator";

// ── Text helpers ──────────────────────────────────────────────────────────────

export function isYes(t: string): boolean {
  return /\b(sim|yes|quero|gostaria|preciso|ok|claro|com certeza|tá|pode|pode ser|seria bom|acho que sim|têm|tenho|temos|já|certo)\b/i.test(t);
}

export function isNo(t: string): boolean {
  return /\b(não|nao|no\b|nunca|ainda não|por ora não|dispenso|sem\b|nenhum|zero)\b/i.test(t);
}

function extractNumber(t: string): number | undefined {
  const m = t.match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : undefined;
}

export function detectPlatforms(t: string): string[] {
  const p: string[] = [];
  if (/instagram/i.test(t)) p.push("Instagram");
  if (/facebook/i.test(t)) p.push("Facebook");
  if (/tiktok|tik\s*tok/i.test(t)) p.push("TikTok");
  if (/linkedin/i.test(t)) p.push("LinkedIn");
  if (/youtube/i.test(t)) p.push("YouTube");
  if (/google/i.test(t)) p.push("Google Ads");
  if (/meta\s*ads/i.test(t) && !p.includes("Facebook")) p.push("Meta Ads");
  return p;
}

function detectObjectives(t: string): string[] {
  const o: string[] = [];
  if (/vend|convert|compra/i.test(t))                     o.push("Aumentar vendas");
  if (/autoridade|visibilidade|posicion/i.test(t))         o.push("Autoridade / visibilidade");
  if (/novo.{0,6}client|captar|lead/i.test(t))             o.push("Novos clientes");
  if (/lançamento|lançar/i.test(t))                        o.push("Lançamento");
  if (/engajamento|engajar|seguidores/i.test(t))           o.push("Engajamento");
  return o;
}

// Branding is only requested when user explicitly says these words.
// Having a Brand Book does NOT count as requesting branding.
function detectBrandingRequest(t: string): boolean {
  return /\b(rebrand|reposicion|identidade\s*visual|criar.{0,10}logo|logo\s*(nova|do\s*zero)|marca\s*(do\s*zero|nova|redesign|completa)|criar\s*marca|criar\s*identidade|design\s*de\s*marca|identidade\s*de\s*marca)\b/i.test(t);
}

function detectHasBrandBook(t: string): boolean {
  return /\b(tenho\s*(um\s*)?brand\s*(book|guide)|tenho\s*(um\s*)?manual\s*de\s*marca|tenho\s*(uma\s*)?identidade\s*visual|já\s*tem?\s*(um\s*)?brand|temos\s*(um\s*)?brand)\b/i.test(t);
}

// ── Initial message parser ────────────────────────────────────────────────────

export function parseInitialMessage(text: string): Partial<BriefingScope> {
  const wantsSocialMedia = /\b(social\s*media|redes\s*sociais|instagram|facebook|tiktok|linkedin|posts?|stories|feed)\b/i.test(text);
  const wantsPaidTraffic = /\b(tráfego\s*pago|trafego\s*pago|anúncio|anuncio|ads\b|meta\s*ads|google\s*ads|campanha\s*paga|impulsionar)\b/i.test(text);
  const requestedBranding = detectBrandingRequest(text);
  const hasBrandBook      = detectHasBrandBook(text);

  let serviceMode: BriefingScope["serviceMode"] | undefined;
  if (/\b(mensal|mensalment|por\s*m[eê]s|m[eê]s\s*a\s*m[eê]s)\b/i.test(text)) serviceMode = "monthly";
  else if (/\b(pontual|avulso|uma\s*vez|projeto\s*[úu]nico)\b/i.test(text)) serviceMode = "one_off";

  let segment: string | undefined;
  if (/restaurante|sushi|pizz|hamburgue|fast\s*food|caf[eé]\b|bar\b/i.test(text)) segment = "Restaurante / Alimentação";
  else if (/e-?commerce|loja\s*online|loja\s*virtual/i.test(text)) segment = "E-commerce";
  else if (/cl[íi]nica|m[eé]dico|sa[úu]de|odonto/i.test(text)) segment = "Saúde";
  else if (/advocaci|advogado|jur[íi]dico/i.test(text)) segment = "Jurídico";
  else if (/moda|roupa|vestu[áa]rio/i.test(text)) segment = "Moda";
  else if (/academia|fitness|crossfit/i.test(text)) segment = "Fitness";

  let businessName: string | undefined;
  const nameMatch = text.match(/chamad[ao]\s+([A-ZÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜ][^.!?,]{1,30}?)(?:\s*[.!?,]|\s+que\s|\s+e\s|\s+para\s|$)/i);
  if (nameMatch) businessName = nameMatch[1].trim();

  const platforms = wantsSocialMedia ? detectPlatforms(text) : [];

  return {
    businessName,
    segment,
    objectives: detectObjectives(text),
    serviceMode,
    wantsSocialMedia,
    ...(wantsSocialMedia ? { social: { platforms } } : {}),
    ...(wantsPaidTraffic ? { wantsPaidTraffic: true } : {}),
    branding: {
      requested: requestedBranding,
      hasBrandBook,
      wantsRebrand: /rebrand|reposicion/i.test(text),
    },
  };
}

// Which question IDs can be skipped because the scope already has that data?
export function inferAnsweredQIds(scope: BriefingScope): string[] {
  const a: string[] = [];
  if (scope.wantsSocialMedia || scope.wantsPaidTraffic !== undefined || scope.branding.requested)
    a.push("detect_service");
  if (scope.serviceMode !== undefined)              a.push("service_mode");
  if (scope.social?.platforms.length)               a.push("social_platforms");
  if (scope.social?.postsPerWeek !== undefined)     a.push("posts_per_week");
  if (scope.social?.storiesPerWeek !== undefined)   a.push("stories");
  if (scope.social?.reelsPerMonth !== undefined)    a.push("reels");
  if (scope.social?.hasPhotos !== undefined)        a.push("has_photos");
  if (scope.social?.needsCopy !== undefined)        a.push("needs_copy");
  if (scope.wantsPaidTraffic !== undefined)         a.push("wants_traffic");
  if (scope.traffic?.monthlyAdBudget)               a.push("ad_budget");
  if (scope.budgetRange)                            a.push("budget_range");
  if (scope.deadline)                               a.push("deadline");
  return a;
}

// ── Question definitions ──────────────────────────────────────────────────────

export interface QuestionDef {
  id: string;
  when: (s: ConvState) => boolean;
  text: (s: ConvState) => string;
  parse: (answer: string, s: ConvState) => Partial<BriefingScope>;
}

const social = (s: ConvState): SocialScope => s.scope.social ?? { platforms: [] };

const QUESTIONS: QuestionDef[] = [
  // Q0 — detect service (if nothing was understood from initial message)
  {
    id: "detect_service",
    when: (s) => !s.scope.wantsSocialMedia && s.scope.wantsPaidTraffic === undefined && !s.scope.branding.requested,
    text: () => "Pode me contar mais? Você está buscando gestão de redes sociais, tráfego pago, criação de identidade visual — ou uma combinação?",
    parse: (answer) => {
      const wantsSocialMedia  = /social|instagram|facebook|redes|posts/i.test(answer);
      const wantsPaidTraffic  = /tráfego|anúncio|ads|pago|impulsion/i.test(answer);
      const requestedBranding = detectBrandingRequest(answer);
      return {
        wantsSocialMedia,
        ...(wantsPaidTraffic ? { wantsPaidTraffic: true } : {}),
        branding: { requested: requestedBranding, hasBrandBook: false, wantsRebrand: false },
        ...(wantsSocialMedia ? { social: { platforms: detectPlatforms(answer) } } : {}),
      };
    },
  },

  // Q1 — monthly vs one-off
  {
    id: "service_mode",
    when: (s) => (s.scope.wantsSocialMedia || !!s.scope.wantsPaidTraffic) && !s.scope.serviceMode,
    text: () => "Você imagina esse trabalho como um **contrato mensal** (gestão contínua) ou uma **campanha pontual** (projeto com prazo definido)?",
    parse: (answer) => {
      if (/mensal|recorrent|contínuo|m[eê]s\s*a\s*m[eê]s/i.test(answer)) return { serviceMode: "monthly" };
      if (/pontual|avulso|[úu]nica|uma\s*vez|projeto\s*[úu]nico/i.test(answer))  return { serviceMode: "one_off" };
      return { serviceMode: "unsure" };
    },
  },

  // Q2 — social platforms
  {
    id: "social_platforms",
    when: (s) => s.scope.wantsSocialMedia && !s.scope.social?.platforms.length,
    text: () => "Quais canais você quer trabalhar? Instagram, Facebook, TikTok, LinkedIn — ou alguma combinação?",
    parse: (answer, s) => {
      const plat = detectPlatforms(answer);
      return { social: { ...social(s), platforms: plat.length ? plat : ["Instagram"] } };
    },
  },

  // Q3 — posts per week
  {
    id: "posts_per_week",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.postsPerWeek === undefined,
    text: () => "Quantas postagens por semana você imagina para o feed? (3 por semana é um ritmo consistente para começar)",
    parse: (answer, s) => ({ social: { ...social(s), postsPerWeek: extractNumber(answer) ?? 3 } }),
  },

  // Q4 — stories
  {
    id: "stories",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.storiesPerWeek === undefined,
    text: () => "Vai querer stories também? Se sim, quantas publicações por semana?",
    parse: (answer, s) => ({ social: { ...social(s), storiesPerWeek: isNo(answer) ? 0 : (extractNumber(answer) ?? 3) } }),
  },

  // Q5 — reels
  {
    id: "reels",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.reelsPerMonth === undefined,
    text: () => "Vai precisar de reels ou vídeos? Se sim, quantos por mês? (Roteiro e edição inclusos — filmagem não é incluída por padrão)",
    parse: (answer, s) => ({ social: { ...social(s), reelsPerMonth: isNo(answer) ? 0 : (extractNumber(answer) ?? 4) } }),
  },

  // Q6 — has photos
  {
    id: "has_photos",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.hasPhotos === undefined,
    text: (s) => {
      const seg = s.scope.segment?.split("/")[0]?.trim().toLowerCase() ?? "negócio";
      return `Vocês já têm fotos e vídeos do ${seg} disponíveis, ou vai precisar de produção fotográfica?`;
    },
    parse: (answer, s) => ({ social: { ...social(s), hasPhotos: isYes(answer) || /tem|tenho|temos|dispon[íi]v|própri/i.test(answer) } }),
  },

  // Q7 — needs copy
  {
    id: "needs_copy",
    when: (s) => s.scope.wantsSocialMedia && s.scope.social?.needsCopy === undefined,
    text: () => "A Dioli vai criar os textos (copy) das postagens, ou você vai fornecer o conteúdo?",
    parse: (answer, s) => {
      const dioli = /dioli|voc[êe]s?\s*(criam|fazem)|precisamos|criar|copyw/i.test(answer) || isYes(answer);
      return { social: { ...social(s), needsCopy: dioli } };
    },
  },

  // Q8 — paid traffic
  {
    id: "wants_traffic",
    when: (s) => s.scope.wantsPaidTraffic === undefined,
    text: () => "Quer incluir **tráfego pago** (anúncios no Instagram, Facebook ou Google) neste projeto?",
    parse: (answer) => ({ wantsPaidTraffic: isYes(answer) || /tráfego|anúncio|ads|impulsion/i.test(answer) }),
  },

  // Q9 — ad budget (only if traffic wanted)
  {
    id: "ad_budget",
    when: (s) => !!s.scope.wantsPaidTraffic && !s.scope.traffic?.monthlyAdBudget,
    text: () => "Qual é a verba mensal disponível para os anúncios? (Esse valor vai direto para o Google/Meta — é separado da gestão)",
    parse: (answer, s) => ({ traffic: { ...(s.scope.traffic ?? { platforms: [] }), monthlyAdBudget: answer.trim() } }),
  },

  // Q10 — budget range
  {
    id: "budget_range",
    when: (s) => !s.scope.budgetRange,
    text: () => "Para fecharmos o escopo: qual faixa de orçamento mensal você tem em mente para a gestão? (sem contar a verba de anúncios)",
    parse: (answer) => ({ budgetRange: answer.trim() }),
  },

  // Q11 — deadline
  {
    id: "deadline",
    when: (s) => !s.scope.deadline,
    text: () => "E para quando você quer começar?",
    parse: (answer) => ({ deadline: answer.trim() }),
  },
];

// ── Scope merge ───────────────────────────────────────────────────────────────

export function mergeScopeDelta(base: BriefingScope, delta: Partial<BriefingScope>): BriefingScope {
  return {
    ...base,
    ...delta,
    objectives: delta.objectives !== undefined
      ? [...new Set([...base.objectives, ...delta.objectives])]
      : base.objectives,
    branding: delta.branding
      ? { ...base.branding, ...delta.branding }
      : base.branding,
    social: delta.social !== undefined
      ? { ...(base.social ?? { platforms: [] }), ...delta.social }
      : base.social,
    traffic: delta.traffic !== undefined
      ? { ...(base.traffic ?? { platforms: [] }), ...delta.traffic }
      : base.traffic,
  };
}

// ── Acknowledgment builder ────────────────────────────────────────────────────

export function buildAcknowledgment(scope: BriefingScope): string {
  const parts: string[] = [];
  if (scope.businessName) parts.push(`Perfeito, ${scope.businessName}!`);
  else parts.push("Entendido!");

  const svcs: string[] = [];
  if (scope.wantsSocialMedia) {
    const plat = scope.social?.platforms ?? [];
    svcs.push(`social media${plat.length ? " para " + plat.join(" e ") : ""}`);
  }
  if (scope.wantsPaidTraffic) svcs.push("tráfego pago");
  if (scope.branding.requested) svcs.push("identidade visual");
  if (svcs.length) parts.push(`Vejo que você quer ${svcs.join(" e ")}.`);

  if (scope.objectives.length) {
    parts.push(`Objetivos: ${scope.objectives.join(", ").toLowerCase()}.`);
  }

  // Critical: brand book presence ≠ branding service request
  if (scope.branding.hasBrandBook && !scope.branding.requested) {
    parts.push("Vi que você já tem um Brand Book — ótimo! Vou usá-lo como referência para o projeto. Não vou incluir criação de identidade visual no escopo por padrão.");
  }

  return parts.join(" ");
}

// ── Negotiation detection ─────────────────────────────────────────────────────
// Recognises scope-modification intents so the SDR can adjust the cart live.
// Only fires on explicit signals — does not intercept normal question answers.

interface NegotiationResult {
  scopeDelta: Partial<BriefingScope>;
  replyText: string;
}

function detectNegotiation(text: string, state: ConvState): NegotiationResult | null {
  const s   = state.scope;
  const soc = s.social ?? { platforms: [] };
  const t   = text.toLowerCase();

  // ── Price objection ─────────────────────────────────────────────────────
  if (/tá caro|ta caro|muito caro|caro demais|ficou caro|tô achando caro|achei caro/.test(t)) {
    const posts = soc.postsPerWeek ? soc.postsPerWeek * 4 : null;
    if (s.wantsSocialMedia && posts && posts > 8) {
      return {
        scopeDelta: { social: { ...soc, postsPerWeek: 2, storiesPerWeek: 2, reelsPerMonth: 0 }, wantsPaidTraffic: false },
        replyText:
          "Entendido! Posso ajustar para o **Plano Starter** — 8 posts + 8 stories/mês, sem reels e sem tráfego, faixa de **R$ 1.200–1.800/mês**.\n\nIso serve como ponto de partida. Quando o negócio crescer, a gente escala.",
      };
    }
    return {
      scopeDelta: {},
      replyText: "Claro! Podemos ajustar. O que você prefere reduzir — posts, stories, reels — ou deixar o tráfego pago para depois?",
    };
  }

  // ── Request cheaper/smaller plan ────────────────────────────────────────
  if (/quero começar menor|comecar menor|plano mais barato|mais barato|o starter|plano starter\b|starter\b|plano menor|menor plano|mais simples|mais enxuto|começar pequeno/.test(t)) {
    return {
      scopeDelta: {
        social: { ...soc, postsPerWeek: 2, storiesPerWeek: 2, reelsPerMonth: 0 },
        wantsPaidTraffic: false,
      },
      replyText:
        "Feito! Ajustei para o **Plano Starter** — 8 posts + 8 stories/mês, sem reels e sem tráfego pago. Faixa de **R$ 1.200–1.800/mês**.\n\nQuando quiser escalar, é só dizer.",
    };
  }

  // ── Remove reels ─────────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia &&
    /sem reels?|tira reels?|não quero reels?|nao quero reels?|deixa reels? pra depois|reels? por enquanto não|reels? depois|sem os reels?|cancela reels?|tira os reels?/.test(t)
  ) {
    return {
      scopeDelta: { social: { ...soc, reelsPerMonth: 0 } },
      replyText: "Feito! Removi os reels do escopo. Você pode adicionar quando estiver pronto para produção de vídeo.",
    };
  }

  // ── Add reels ────────────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia &&
    /quero reels?|adicionar reels?|adiciona reels?|inclui reels?|coloca reels?|incluir reels?/.test(t)
  ) {
    const n = extractNumber(text) ?? 2;
    return {
      scopeDelta: { social: { ...soc, reelsPerMonth: n } },
      replyText: `Ótimo! Adicionei ${n} reel${n !== 1 ? "s" : ""}/mês — roteiro + edição a partir de material do cliente. Filmagem não está incluída por padrão.`,
    };
  }

  // ── Remove paid traffic ──────────────────────────────────────────────────
  if (
    /sem tráfego|sem trafego|tira tráfego|tira trafego|não quero tráfego|nao quero trafego|deixa tráfego|deixa trafego|tráfego depois|trafego depois|sem anúncio|sem anuncio/.test(t)
  ) {
    return {
      scopeDelta: { wantsPaidTraffic: false },
      replyText: "Entendido! Deixei o tráfego pago de fora por agora. É uma boa estratégia começar com orgânico e adicionar mídia paga quando tiver mais tração.",
    };
  }

  // ── Add paid traffic ─────────────────────────────────────────────────────
  if (
    /quero tráfego|quero trafego|inclui tráfego|inclui trafego|adicionar tráfego|adiciona tráfego|adiciona trafego|incluir tráfego|com tráfego|com trafego/.test(t)
  ) {
    return {
      scopeDelta: { wantsPaidTraffic: true },
      replyText: "Ótimo! Adicionei tráfego pago ao escopo. Qual é a verba mensal disponível para anúncios? (Esse valor vai direto ao Meta/Google — separado da taxa de gestão.)",
    };
  }

  // ── Increase posts ───────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia && soc.postsPerWeek !== undefined &&
    /mais posts?|aumentar posts?|aumenta posts?|sobe posts?|mais postagens?/.test(t)
  ) {
    const n = extractNumber(text) ?? soc.postsPerWeek + 1;
    return {
      scopeDelta: { social: { ...soc, postsPerWeek: n } },
      replyText: `Feito! Ajustei para ${n} posts por semana (${n * 4}/mês).`,
    };
  }

  // ── Reduce posts ─────────────────────────────────────────────────────────
  if (
    s.wantsSocialMedia && soc.postsPerWeek !== undefined &&
    /menos posts?|diminuir posts?|diminui posts?|reduzir posts?|reduz posts?/.test(t)
  ) {
    const n = extractNumber(text) ?? Math.max(2, soc.postsPerWeek - 1);
    return {
      scopeDelta: { social: { ...soc, postsPerWeek: n } },
      replyText: `Feito! Ajustei para ${n} posts por semana (${n * 4}/mês).`,
    };
  }

  return null;
}



export function getNextQuestion(state: ConvState): QuestionDef | null {
  for (const q of QUESTIONS) {
    if (!state.answeredQIds.includes(q.id) && q.when(state)) return q;
  }
  return null;
}

export function processClientMessage(text: string, state: ConvState): ConvState {
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
    const delta = parseInitialMessage(text);
    newScope    = mergeScopeDelta(emptyScope(), delta);
    newAnswered = inferAnsweredQIds(newScope);
  } else {
    // Check negotiation intent before answering the current question
    const negotiation = detectNegotiation(text, state);
    if (negotiation) {
      newScope        = mergeScopeDelta(state.scope, negotiation.scopeDelta);
      newAnswered     = [...new Set([...state.answeredQIds, ...inferAnsweredQIds(newScope)])];
      negotiationReply = negotiation.replyText;
    } else {
      const currentQ = getNextQuestion(state);
      if (currentQ) {
        const delta = currentQ.parse(text, state);
        newScope    = mergeScopeDelta(state.scope, delta);
        newAnswered = [...new Set([...state.answeredQIds, currentQ.id, ...inferAnsweredQIds(newScope)])];
      } else {
        newScope    = state.scope;
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
  const nextQ    = getNextQuestion(mid);
  const allDone  = nextQ === null;

  let replyText: string;
  if (state.isFirstMessage) {
    const ack = buildAcknowledgment(newScope);
    replyText = nextQ
      ? `${ack}\n\n${nextQ.text(mid)}`
      : `${ack}\n\nTenho as informações principais! Revise o escopo ao lado e envie quando estiver pronto.`;
  } else if (negotiationReply) {
    replyText = nextQ && !allDone
      ? `${negotiationReply}\n\n${nextQ.text(mid)}`
      : negotiationReply;
  } else if (nextQ) {
    replyText = nextQ.text(mid);
  } else {
    replyText = "Ótimo! Tenho tudo que preciso. Revise o escopo ao lado e clique em **\"Enviar solicitação\"** quando estiver pronto.";
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
    canSubmit: allDone || newAnswered.length >= 5,
  };
}

export function initConvState(): ConvState {
  const welcome: ConvMessage = {
    id: "welcome",
    role: "assistant",
    text: "Olá! Sou sua consultora de briefing na Dioli.\n\nVou te ajudar a montar o escopo do projeto passo a passo — com estimativa de preço e prazo atualizando em tempo real.\n\n**Pode começar: o que você está precisando?**",
    createdAt: new Date().toISOString(),
  };
  return { messages: [welcome], scope: emptyScope(), answeredQIds: [], isFirstMessage: true, estimate: emptyEstimate(), canSubmit: false };
}
