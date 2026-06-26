// POST /api/sdr/chat
//
// Public endpoint (no auth — called from the public /briefing page).
// This is the brain of the SDR agent: the FIRST contact with a prospect, and a
// senior-level commercial negotiator.
//
// It generates the conversational reply with Claude Sonnet AND a structured
// scope patch in the same call. Beyond extraction, it runs a real negotiation:
// deep discovery (probes every detail that affects the quote), engagement-type
// classification (monthly / one-off / umbrella), and discount authority bounded
// by an internal margin floor.
//
// MARGIN DISCIPLINE: the cost basis, margins, and floor price are INTERNAL
// (lib/agency/pricing-margins.ts). The model is told the maximum discount it may
// grant and the levers that justify it — but the hard floor is enforced on the
// SERVER here, after the model responds, so a hallucinated discount can never
// breach profitability. The prospect only ever sees the final price.
//
// Lei 2: the rule-based engine remains the authoritative fallback. If this route
// fails (no key, timeout, bad JSON), the client falls back to it.

import { NextRequest, NextResponse } from "next/server";
import { resolveProviderKey } from "@/lib/ai/resolve-key";
import { computeEstimate, detectPackage, getPackageDef } from "@/lib/agency/live-calculator";
import { computeDealFloor, resolveDiscount, DISCOUNT_LEVERS, type DiscountLeverId } from "@/lib/agency/pricing-margins";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";

const CLAUDE_URL  = "https://api.anthropic.com/v1/messages";
const MODEL       = "claude-sonnet-4-6";
const TIMEOUT_MS  = 30_000;
const MAX_HISTORY = 18; // conversation turns sent to the model

interface ConvMsg { role: string; text: string }

interface ChatRequest {
  messages: ConvMsg[];
  currentMessage: string;
  scope?: Record<string, unknown>;
}

const SYSTEM_PROMPT = `Você é a Consultora Comercial Sênior da Dioli Digital — agência de marketing com inteligência artificial. Posicionamento: "Estratégia humana. Execução inteligente."

Você é calorosa, curiosa e profissional. Fala como gente, não como script. Português do Brasil, sempre.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO VOCÊ PENSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Antes de responder, faça mentalmente estas perguntas:
1. O que o cliente JÁ me disse? (não repita perguntas já respondidas)
2. O que ainda FALTA para eu entender o escopo completo?
3. Qual é a pergunta MAIS NATURAL a fazer agora, dado o fluxo da conversa?

Você não segue um roteiro. Você ouve, captura tudo que o cliente deu, e pergunta só o que falta — na ordem que faz sentido para aquela conversa específica.

Se o cliente chegou na primeira mensagem já contando negócio, serviço, frequência e orçamento, você NÃO repete as perguntas básicas. Você confirma o que entendeu e aprofunda o que falta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O QUE VOCÊ PRECISA COLETAR (sem ordem fixa)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDENTIDADE: nome da pessoa, nome do negócio.

NEGÓCIO: segmento, o que vende, objetivo principal, público-alvo, concorrentes/referências que admira.

SOCIAL MEDIA (se quiser): redes (Instagram, TikTok, LinkedIn…), posts/semana, stories, reels/mês, vídeo (tem videomaker? tem bruto? ou a Dioli produz?), fotos disponíveis, criativos prontos ou do zero, copy pela Dioli ou pelo cliente, identidade visual / brand book.

TRÁFEGO PAGO (se quiser): plataformas, verba de mídia mensal, pixel configurado.

FECHAMENTO: orçamento mensal de marketing, prazo para começar, quem decide a contratação.

CONTATO (e-mail + WhatsApp): peça quando a conversa chegar num ponto natural de encaminhar a proposta — não antes, não depois. Se o cliente chegou perto do fechamento e você ainda não tem o contato, encaixe naturalmente: "Para eu te enviar a proposta — qual o melhor e-mail e WhatsApp?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE CONVERSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- UMA pergunta por vez. Sempre.
- Respostas curtas: 2 a 4 frases. Use o nome da pessoa para criar conexão.
- Nunca deixe a conversa morrer — termine sempre com uma pergunta ou convite.
- Quando o cliente mandar uma mensagem longa descrevendo o negócio: agradeça, resuma o que entendeu, e pergunte UMA coisa que ainda falta. Nunca mude de assunto abruptamente.
- Mensagem de voz transcrita pode vir com nomes errados ("óleo de digital" = "Dioli digital"). Confirme apenas o ponto específico incerto.

SOBRE E-MAIL: só existe se a mensagem contiver "@". Texto sem "@" NUNCA é tentativa de e-mail — é nome, negócio ou descrição. Nunca valide e-mail para mensagem sem "@".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODALIDADE DE ENGAJAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Identifique naturalmente como o cliente quer entrar:
- monthly: gestão mensal com escopo fixo
- one_off: projeto único com início e fim
- umbrella: parceria contínua, escopo evolui — o mais valioso. Quando perceber potencial de longo prazo: "Pelo que você descreveu, faz mais sentido entrar como parceiro fixo do que um projeto avulso. A marca cresce com mais consistência assim. Faz sentido?"
- unsure: ainda investigando

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEGOCIAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Apresente sempre valor antes de preço. O cliente compra resultado, não posts.

Tenha sempre duas opções na cabeça: COMPLETA (ideal) e LIGHT (cabe no orçamento menor). Se o orçamento for apertado, ofereça a light — não perca o cliente.

Desconto SÓ com contrapartida real: anual (12%), multi-serviço (10%), trimestral antecipado (7%), autorização de case (6%), indicação (5%). Ofereça como troca: "Consigo melhorar o valor se você fechar os 12 meses. Faz sentido?"

Objeções: "Tá caro" → reforce ROI + versão light. "Vou pensar" → encontre a objeção real. "Faço com freelancer" → diferencie: consistência, estratégia, IA-nativo, um time vs. uma pessoa.

Quando conceder desconto, devolva em "negotiation": { discountPct, discountReason, appliedLevers }.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREENCHIMENTO DO SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Traduza posts para postsPerWeek: "1 por dia" → 7; "3 na semana" → 3; "12 no mês" → 3.
Capture reelsPerMonth (0 se não quiser), needsCopy, hasPhotos, hasVideomaker, needsVideoProduction, creativesReady.
Capture budgetRange no primeiro valor mencionado, serviceMode, deadline, decisionMaker.
Devolva SEMPRE o scope ACUMULADO — tudo confirmado até agora. Omita campos que o cliente não disse.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO — retorne SOMENTE JSON válido, sem texto fora:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "reply": "sua próxima fala (string, pt-BR)",
  "needsClarification": true/false,
  "scope": {
    "prospectName": "...", "businessName": "...", "segment": "...",
    "prospectEmail": "...", "prospectPhone": "...",
    "objectives": ["..."],
    "decisionMaker": true/false,
    "competitors": ["..."],
    "wantsSocialMedia": true/false,
    "wantsPaidTraffic": true/false,
    "branding": { "requested": true/false, "hasBrandBook": true/false, "wantsRebrand": true/false },
    "social": { "platforms": ["Instagram"], "postsPerWeek": 7, "storiesPerWeek": 0, "reelsPerMonth": 0, "needsCopy": true, "hasPhotos": false, "hasVideomaker": false, "needsVideoProduction": false, "creativesReady": false },
    "traffic": { "platforms": ["Meta Ads"], "monthlyAdBudget": "R$ 1.000" },
    "serviceMode": "monthly" | "one_off" | "umbrella" | "unsure",
    "budgetRange": "...", "deadline": "...",
    "negotiation": { "discountPct": 10, "discountReason": "compromisso anual de 12 meses", "appliedLevers": ["annual_commitment"] }
  }
}`;

// Maps the raw scope from the request into a typed BriefingScope for the
// floor/estimate math. Tolerant of partial / unknown shapes.
function asScope(raw: Record<string, unknown> | undefined): BriefingScope {
  const s = (raw ?? {}) as Record<string, unknown>;
  const social = s.social as Record<string, unknown> | undefined;
  const traffic = s.traffic as Record<string, unknown> | undefined;
  const branding = s.branding as Record<string, unknown> | undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    objectives: Array.isArray(s.objectives) ? (s.objectives as string[]) : [],
    wantsSocialMedia: s.wantsSocialMedia === true,
    wantsPaidTraffic: s.wantsPaidTraffic === true,
    branding: {
      requested: branding?.requested === true,
      hasBrandBook: branding?.hasBrandBook === true,
      wantsRebrand: branding?.wantsRebrand === true,
    },
    social: social
      ? {
          platforms: Array.isArray(social.platforms) ? (social.platforms as string[]) : [],
          postsPerWeek: num(social.postsPerWeek),
          reelsPerMonth: num(social.reelsPerMonth),
        }
      : undefined,
    traffic: traffic
      ? { platforms: [], monthlyAdBudget: typeof traffic.monthlyAdBudget === "string" ? traffic.monthlyAdBudget : undefined }
      : undefined,
  };
}

// Computes the internal negotiation envelope for the current scope: the maximum
// discount the SDR may grant before breaching the deal floor, plus the lever
// menu. This is injected into the model's context as guidance.
function buildNegotiationContext(scope: BriefingScope): { maxDiscountPct: number; floorNote: string } {
  let socialPackage;
  let extraReels = 0;
  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    socialPackage = detectPackage(scope.social.postsPerWeek * 4);
    const pkg = getPackageDef(socialPackage);
    if (scope.social.reelsPerMonth !== undefined && scope.social.reelsPerMonth > pkg.reelsPerMonth) {
      extraReels = scope.social.reelsPerMonth - pkg.reelsPerMonth;
    }
  }
  const floor = computeDealFloor({
    socialPackage,
    extraReels,
    wantsTraffic: scope.wantsPaidTraffic,
    wantsBranding: scope.branding.requested,
    wantsRebrand: scope.branding.wantsRebrand,
  });
  const est = computeEstimate(scope);

  // Max discount = how far the LOWER client-facing bound can fall before it hits
  // the internal floor. Clamped to a sane 25% ceiling.
  let maxDiscountPct = 0;
  if (est.totalMin > 0 && floor.totalFloor > 0 && est.totalMin > floor.totalFloor) {
    maxDiscountPct = Math.min(25, Math.floor(((est.totalMin - floor.totalFloor) / est.totalMin) * 100));
  }

  const leverMenu = DISCOUNT_LEVERS.map((l) => `${l.label} (até ${l.maxPct}%, requer: ${l.requires})`).join("; ");
  const floorNote =
    maxDiscountPct > 0
      ? `Você pode conceder ATÉ ${maxDiscountPct}% de desconto NESTE escopo, e SOMENTE com contrapartida. Alavancas: ${leverMenu}. O sistema corta automaticamente qualquer desconto que fure o piso — proponha com segurança.`
      : `Neste escopo NÃO há margem para desconto (o valor já está no piso saudável). Em vez de baixar preço, ofereça a versão light ou agregue valor.`;

  return { maxDiscountPct, floorNote };
}

// Enforces the floor server-side: clamps whatever discount the model returned to
// the maximum the deal floor allows. The model never overrides the guardrail.
function enforceDiscountFloor(
  scopePatch: Record<string, unknown>,
  scope: BriefingScope,
  maxDiscountPct: number,
): Record<string, unknown> {
  const neg = scopePatch.negotiation as Record<string, unknown> | undefined;
  if (!neg || typeof neg.discountPct !== "number" || neg.discountPct <= 0) return scopePatch;

  // Compute the true floor for this scope and clamp.
  let socialPackage;
  let extraReels = 0;
  if (scope.wantsSocialMedia && scope.social?.postsPerWeek !== undefined) {
    socialPackage = detectPackage(scope.social.postsPerWeek * 4);
    const pkg = getPackageDef(socialPackage);
    if (scope.social.reelsPerMonth !== undefined && scope.social.reelsPerMonth > pkg.reelsPerMonth) {
      extraReels = scope.social.reelsPerMonth - pkg.reelsPerMonth;
    }
  }
  const floor = computeDealFloor({
    socialPackage,
    extraReels,
    wantsTraffic: scope.wantsPaidTraffic,
    wantsBranding: scope.branding.requested,
    wantsRebrand: scope.branding.wantsRebrand,
  });
  const est = computeEstimate(scope);

  const levers = (Array.isArray(neg.appliedLevers) ? neg.appliedLevers : []).filter(
    (x): x is DiscountLeverId => typeof x === "string",
  );
  const decision = resolveDiscount({
    basePrice: est.totalMin,
    costBasis: floor.totalCost,
    floorPrice: floor.totalFloor,
    levers,
  });

  // The SDR's requested pct, clamped to both the lever-justified amount and the
  // hard floor ceiling.
  const requested = Math.min(neg.discountPct as number, maxDiscountPct, decision.appliedPct || maxDiscountPct);
  const finalPct = Math.max(0, Math.min(requested, maxDiscountPct));

  return {
    ...scopePatch,
    negotiation: {
      discountPct: finalPct,
      discountReason: typeof neg.discountReason === "string" ? neg.discountReason : undefined,
      appliedLevers: levers,
    },
  };
}

function buildClaudeMessages(messages: ConvMsg[], currentMessage: string, scope: Record<string, unknown> | undefined, floorNote: string) {
  const history = messages
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    }));

  const scopeNote =
    scope && Object.keys(scope).length > 0
      ? `\n\n[Contexto interno — dados já captados: ${JSON.stringify(scope)}. Não repita perguntas já respondidas.]`
      : "";

  const negoNote = `\n\n[Negociação interna — NÃO mostre estes números ao cliente: ${floorNote}]`;

  return [
    ...history,
    { role: "user" as const, content: currentMessage + scopeNote + negoNote },
  ];
}

function extractJson(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const resolved = await resolveProviderKey("claude");
  if (!resolved) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || typeof body.currentMessage !== "string") {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const typedScope = asScope(body.scope);
  const { maxDiscountPct, floorNote } = buildNegotiationContext(typedScope);
  const claudeMessages = buildClaudeMessages(body.messages, body.currentMessage, body.scope, floorNote);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolved.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1280,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[sdr/chat] Claude HTTP ${res.status}`);
      return NextResponse.json({ ok: false, reason: "provider_error" });
    }

    const json = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = json.content?.[0]?.text ?? "";
    const parsed = extractJson(text);

    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      return NextResponse.json({ ok: false, reason: "parse_error" });
    }

    let scopePatch = parsed.scope && typeof parsed.scope === "object" ? (parsed.scope as Record<string, unknown>) : {};

    // ── Email guardrail ──────────────────────────────────────────────────────
    // The model sometimes hallucinates an email-validation reply even when the
    // client's message has nothing to do with email (e.g. "Sim, temos brand book").
    // Two defences:
    // 1. Strip prospectEmail from the scope patch if the message has no "@".
    // 2. Reject the entire reply if it reads as email-validation language — the
    //    rule-based fallback (Lei 2) handles this turn instead.
    const msgHasAt = body.currentMessage.includes("@");
    if (!msgHasAt && scopePatch.prospectEmail) {
      delete scopePatch.prospectEmail;
    }
    const replyText = parsed.reply.trim();
    const EMAIL_HALLUCINATION = /e-mail.*v[áa]lid|formato.*@|nome@dom[íi]nio|confirmar.*e-mail|e-mail.*formato/i;
    if (!msgHasAt && EMAIL_HALLUCINATION.test(replyText)) {
      // Model confused — let the rule-based engine handle this turn.
      console.warn("[sdr/chat] email-hallucination detected, falling back");
      return NextResponse.json({ ok: false, reason: "email_hallucination" });
    }

    // Hard floor guardrail: clamp any discount the model proposed.
    scopePatch = enforceDiscountFloor(scopePatch, typedScope, maxDiscountPct);

    return NextResponse.json({
      ok: true,
      reply: replyText,
      needsClarification: parsed.needsClarification === true,
      scope: scopePatch,
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    console.error(`[sdr/chat] ${reason}`);
    return NextResponse.json({ ok: false, reason });
  } finally {
    clearTimeout(timeout);
  }
}
