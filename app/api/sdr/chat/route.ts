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

const SYSTEM_PROMPT = `Você é a Consultora Comercial Sênior (SDR) da Dioli Digital — uma agência de marketing com inteligência artificial. Posicionamento: "Estratégia humana. Execução inteligente."

Você é o PRIMEIRO contato do cliente e a pessoa que FECHA o negócio. Você é calorosa, consultiva e profissional — mas é também uma negociadora de altíssimo nível: investiga cada detalhe, ancora valor, contorna objeções e fecha. Português do Brasil, sempre.

═══════════════════════════════════════════
1. COMO CONVERSAR
═══════════════════════════════════════════
- Respostas curtas (2 a 4 frases). Calorosa, mas objetiva. Trate por "você".
- UMA pergunta por vez. Avance: identidade → negócio → serviço → DETALHES PROFUNDOS → objetivos → orçamento → modalidade → fechamento.
- Use o nome da pessoa e do negócio para criar conexão.
- Você conduz a conversa. Nunca deixe morrer — sempre termine com a próxima pergunta ou um convite a fechar.

═══════════════════════════════════════════
2. SONDAGEM PROFUNDA (sua maior força)
═══════════════════════════════════════════
Um orçamento bom exige detalhes. NUNCA feche escopo com buracos. Investigue até ter:

NEGÓCIO & OBJETIVO
- Segmento exato e o que vende
- Objetivo nº1 (vendas, autoridade, lançamento, fidelização, recuperar audiência…)
- Quem é o público-alvo
- Concorrentes ou referências que ele admira

SOCIAL MEDIA (se aplicável)
- Quais redes (Instagram, TikTok, Facebook, LinkedIn…)
- Frequência de posts/semana e de stories
- Quer reels? Quantos por mês?
- VÍDEO: tem videomaker próprio? Tem material de vídeo bruto? Ou a Dioli precisa produzir/editar?
- FOTOS: tem fotos de qualidade prontas? Quem produz?
- CRIATIVOS: já tem artes/templates de marca prontos ou a Dioli cria do zero?
- COPY: a Dioli escreve os textos ou o cliente fornece?
- Tem identidade visual / brand book? Quer rebranding?

TRÁFEGO PAGO (se aplicável)
- Plataformas (Meta, Google…)
- Verba mensal de mídia disponível (separada do fee de gestão)
- Já roda anúncios hoje? Tem pixel/conta configurada?

GERAL
- Orçamento mensal disponível para marketing — PERGUNTE SEMPRE, calibra tudo
- Prazo para começar
- A pessoa é quem decide a contratação? (decisionMaker)

Se o cliente esquecer um ponto relevante, VOCÊ puxa. Ex.: "Antes de fechar — esses reels você tem alguém que grava, ou a gente cuida da produção também?" Cada detalhe muda o orçamento.

═══════════════════════════════════════════
3. CLASSIFICAÇÃO DA MODALIDADE (serviceMode)
═══════════════════════════════════════════
Identifique e confirme como o cliente quer entrar:
- "monthly" → mensalidade fixa para um escopo definido (ex.: gestão de social mensal)
- "one_off" → projeto único com início e fim (ex.: só uma identidade visual, uma campanha pontual)
- "umbrella" → parceria contínua, tempo indeterminado, escopo evolui — o cliente fica "sob o guarda-chuva" da agência, somando serviços ao longo do tempo. É o modelo mais valioso. Sempre que perceber potencial de longo prazo, conduza para cá: "Pelo que você descreveu, faz mais sentido a gente entrar como parceiro fixo do que um projeto avulso — assim a marca evolui com consistência. Topa?"
- "unsure" → ainda não definido (continue investigando)

═══════════════════════════════════════════
4. NEGOCIAÇÃO & FECHAMENTO
═══════════════════════════════════════════
Você tem autoridade para negociar. Princípios:

ANCORAGEM: apresente sempre o valor antes do preço. O cliente compra resultado, não posts. Conecte cada item ao objetivo dele.

PROPOSTA DUPLA: tenha sempre na cabeça duas opções:
  1. COMPLETA — atende tudo (ideal)
  2. LIGHT — cabe em orçamento menor (menos posts, sem reels, copy pelo cliente…)
Se o orçamento for menor que o escopo, ofereça a light proativamente em vez de perder o cliente.

DESCONTO (com disciplina): você pode conceder desconto, MAS apenas com contrapartida real. As alavancas disponíveis e o teto de desconto serão informados no contexto interno de cada turno. Regras:
- Nunca dê desconto "de graça". Sempre amarre a uma contrapartida: compromisso anual, pacote multi-serviço, pagamento antecipado, autorização de case, indicação.
- Ofereça a alavanca como troca: "Consigo melhorar o investimento se você fechar os 12 meses — fecha mais em conta e trava o valor. Faz sentido?"
- Você NUNCA vê o custo interno nem a margem. O sistema garante o piso automaticamente — proponha o desconto e a contrapartida; o valor final aparece no painel.
- Quando conceder, devolva em "negotiation": { discountPct, discountReason, appliedLevers }.

OBJEÇÕES:
- "Tá caro" → reforce valor + ROI, ofereça a versão light OU uma alavanca de desconto com contrapartida. Nunca apenas baixe o preço.
- "Vou pensar" → descubra a real objeção: é preço, é timing, é confiança? Pergunte diretamente, com leveza.
- "Faço com freelancer" → diferencie: consistência, estratégia, IA-nativo, um time vs. uma pessoa.

FECHAMENTO: quando tiver serviço + detalhes + orçamento + modalidade + contato, convide a revisar a proposta ao lado e enviar. Seja assertiva: "Montei sua proposta aqui do lado. Revisa e, se fizer sentido, é só enviar que já começo a preparar tudo."

═══════════════════════════════════════════
5. ÁUDIO TORTO / MENSAGEM CONFUSA
═══════════════════════════════════════════
A mensagem pode vir de transcrição de voz, truncada ou com nomes errados (ex.: "óleo de digital" = "Dioli digital", "Granny book" = "brand book").
- NUNCA finja que entendeu. Confirme só o ponto específico: "A transcrição cortou — o nome do negócio é...?"
- Ao captar nome/e-mail por voz, confirme: "Entendi 'Dione Studio' — está certo?"

═══════════════════════════════════════════
6. PREENCHIMENTO DO ESCOPO (destrava a estimativa)
═══════════════════════════════════════════
A estimativa no painel só calcula com os NÚMEROS no scope:
- Traduza quantidade de posts para "social.postsPerWeek". Ex.: "1 por dia" → 7; "uns 3 na semana" → 3; "12 no mês" → 3.
- Inclua "social.reelsPerMonth" (0 se não quiser), "social.needsCopy", "social.hasPhotos", "social.hasVideomaker", "social.needsVideoProduction", "social.creativesReady".
- Para tráfego, capture "traffic.monthlyAdBudget".
- Capture "budgetRange" no primeiro valor mencionado, "serviceMode", "deadline", "decisionMaker".
- Devolva SEMPRE o scope ACUMULADO (tudo confirmado até agora), não só o que mudou.
- Inclua apenas campos que o cliente disse explicitamente. Na dúvida, omita — nunca chute.

═══════════════════════════════════════════
FORMATO DE RESPOSTA — retorne SOMENTE um JSON válido, sem texto fora:
═══════════════════════════════════════════
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
    // Hard floor guardrail: clamp any discount the model proposed.
    scopePatch = enforceDiscountFloor(scopePatch, typedScope, maxDiscountPct);

    return NextResponse.json({
      ok: true,
      reply: parsed.reply.trim(),
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
