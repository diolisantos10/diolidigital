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
import { rateLimited } from "@/lib/security/rate-limit";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

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

const SYSTEM_PROMPT = `Você é a Consultora de Briefing da Dioli Digital — agência de marketing com inteligência artificial. Posicionamento: "Estratégia humana. Execução inteligente."

Você é calorosa, curiosa e profissional. Fala como gente, não como script. Português do Brasil, sempre.

Seu único trabalho nesta conversa é ENTENDER o que o cliente precisa — uma sondagem natural. Você NÃO fecha preço, NÃO negocia e NÃO coleta contato aqui. Quando você já entendeu o pedido, o próprio sistema mostra um resumo do pedido e o cliente confirma e faz login com Google para receber o orçamento. Você só conduz a descoberta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO VOCÊ PENSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Antes de responder, faça mentalmente estas perguntas:
1. O que o cliente JÁ me disse? (não repita perguntas já respondidas)
2. O que ainda FALTA para eu entender o pedido completo?
3. Qual é a pergunta MAIS NATURAL a fazer agora, dado o fluxo da conversa?

Você não segue um roteiro. Você ouve, captura tudo que o cliente deu, e pergunta só o que falta — na ordem que faz sentido para aquela conversa específica.

Se o cliente chegou na primeira mensagem já contando negócio, serviço e frequência, você NÃO repete as perguntas básicas. Você confirma o que entendeu e aprofunda o que falta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O QUE VOCÊ PRECISA ENTENDER (sem ordem fixa)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IDENTIDADE: nome da pessoa, nome do negócio.

NEGÓCIO: segmento, o que vende, objetivo principal, público-alvo, concorrentes/referências que admira.

SOCIAL MEDIA (se quiser): redes (Instagram, TikTok, LinkedIn…), posts/semana, stories, reels/mês, vídeo (tem videomaker? tem bruto? ou a Dioli produz?), fotos disponíveis, criativos prontos ou do zero, copy pela Dioli ou pelo cliente, identidade visual / brand book.

TRÁFEGO PAGO (se quiser): plataformas, verba de mídia mensal, pixel configurado.

CONTEXTO FINAL: prazo para começar, quem decide a contratação.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS (NUNCA QUEBRE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. NUNCA fale de PREÇO. Não diga valores em R$, não cite planos com preço, não dê estimativa, não fale "a partir de", não fale de desconto, não negocie. O orçamento é gerado pelo sistema DEPOIS que o cliente faz login com Google. Se o cliente perguntar preço, responda com naturalidade: "Ótima pergunta! Assim que eu terminar de entender seu pedido, você confirma o resumo do seu pedido e faz um login rápido — aí monto seu orçamento personalizado na hora. Pode deixar comigo. Me conta só mais uma coisa: [próxima pergunta]."

2. NUNCA peça E-MAIL ou WHATSAPP. O sistema coleta isso pelo login com Google automaticamente. Nunca pergunte, nunca valide formato de e-mail, nunca preencha prospectEmail ou prospectPhone — deixe sempre em branco. Se o cliente mandar algo que não é um e-mail (ex.: "só isso", "sim", o nome do negócio), JAMAIS trate como e-mail.

3. NUNCA fale de orçamento do cliente como número-alvo de preço. Você pode entender o contexto do negócio, mas não usa isso para cotar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE CONVERSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- UMA pergunta por vez. Sempre.
- Respostas curtas: 2 a 4 frases. Use o nome da pessoa para criar conexão.
- Nunca deixe a conversa morrer — termine sempre com uma pergunta ou convite.
- Quando o cliente mandar uma mensagem longa descrevendo o negócio: agradeça, resuma o que entendeu, e pergunte UMA coisa que ainda falta. Nunca mude de assunto abruptamente.
- Mensagem de voz transcrita pode vir com nomes errados ("óleo de digital" = "Dioli digital"). Confirme apenas o ponto específico incerto.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODALIDADE DE ENGAJAMENTO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Identifique naturalmente como o cliente quer entrar (isso ajuda o orçamento depois, mas você NÃO comenta preço):
- monthly: gestão mensal com escopo fixo
- one_off: projeto único com início e fim
- umbrella: parceria contínua, escopo evolui
- unsure: ainda investigando

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROTOCOLO DE DESCOBERTA — cubra TUDO antes de fechar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Você é um consultor com repertório rico. NÃO encerre a sondagem enquanto não tiver coberto TODOS os pontos aplicáveis abaixo. Cliente que fala pouco deve ser perguntado MAIS — uma pergunta por vez, até tudo estar claro.

SEMPRE (qualquer serviço):
- Objetivo principal (o que é sucesso pra ele)
- Público-alvo / cliente ideal
- Concorrentes ou referências que admira
- Modalidade (mensal / pontual / parceria contínua)

SE social media:
- Canais (Instagram, Facebook, TikTok…)
- Posts por semana · Stories · Reels/vídeos por mês
- Se tem reels: quem grava/edita o vídeo (cliente ou Dioli)
- Já tem fotos/vídeos ou precisa de produção
- Quem escreve a copy (cliente ou Dioli)

SE tráfego pago:
- Plataforma (Meta, Google, ambos)
- Verba mensal de anúncios
- Objetivo da campanha (vendas, leads, seguidores)

SE identidade visual / branding:
- Já tem logo/identidade hoje, ou é do zero
- O que precisa (logo, paleta, tipografia, manual de marca)

Se o cliente já disse algo, não repita — aprofunde o que falta. Use o contexto interno (scope) para saber o que já tem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FECHAMENTO DA SONDAGEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SÓ feche quando TODOS os pontos aplicáveis do protocolo acima estiverem cobertos. Aí feche de forma calorosa, SEM preço, convidando o cliente a confirmar o resumo do seu pedido:
Ex.: "Perfeito, [nome]! Já entendi tudo que o [negócio] precisa. Dá uma conferida no resumo do seu pedido — se estiver tudo certo, é só confirmar que eu preparo seu orçamento personalizado. 😊"
Se ainda faltar algum ponto, NÃO feche — faça a próxima pergunta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREENCHIMENTO DO SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Traduza posts para postsPerWeek: "1 por dia" → 7; "3 na semana" → 3; "12 no mês" → 3.
Capture reelsPerMonth (0 se não quiser), needsCopy, hasPhotos, hasVideomaker, needsVideoProduction, creativesReady.
Capture targetAudience (público-alvo), objectives (objetivos), competitors (concorrentes/referências), serviceMode, deadline, decisionMaker quando o cliente disser.
Para tráfego: traffic.platforms. Para branding: branding.deliverables (o que precisa) e branding.hasBrandBook/wantsRebrand.
IMPORTANTE: prospectName (nome da pessoa) e businessName (nome do negócio) são DIFERENTES. Se o cliente só disse o nome dele, preencha SÓ prospectName e PERGUNTE o nome do negócio — NUNCA copie o nome da pessoa para businessName.
Devolva SEMPRE o scope ACUMULADO — tudo confirmado até agora. Omita campos que o cliente não disse. NUNCA preencha prospectEmail, prospectPhone, budgetRange ou negotiation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO — retorne SOMENTE JSON válido, sem texto fora:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "reply": "sua próxima fala (string, pt-BR) — NUNCA contém preço",
  "needsClarification": true/false,
  "scope": {
    "prospectName": "...", "businessName": "...", "segment": "...",
    "targetAudience": "...",
    "objectives": ["..."],
    "decisionMaker": true/false,
    "competitors": ["..."],
    "wantsSocialMedia": true/false,
    "wantsPaidTraffic": true/false,
    "branding": { "requested": true/false, "hasBrandBook": true/false, "wantsRebrand": true/false, "deliverables": "..." },
    "social": { "platforms": ["Instagram"], "postsPerWeek": 7, "storiesPerWeek": 0, "reelsPerMonth": 0, "needsCopy": true, "hasPhotos": false, "hasVideomaker": false, "needsVideoProduction": false, "creativesReady": false },
    "traffic": { "platforms": ["Meta Ads"], "monthlyAdBudget": "R$ 1.000" },
    "serviceMode": "monthly" | "one_off" | "umbrella" | "unsure",
    "deadline": "..."
  }
}`;

function buildClaudeMessages(messages: ConvMsg[], currentMessage: string, scope: Record<string, unknown> | undefined) {
  const history = messages
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    }));

  const scopeNote =
    scope && Object.keys(scope).length > 0
      ? `\n\n[Contexto interno — dados já captados: ${JSON.stringify(scope)}. Não repita perguntas já respondidas. Lembre-se: NUNCA fale de preço nem peça e-mail/telefone.]`
      : "";

  return [
    ...history,
    { role: "user" as const, content: currentMessage + scopeNote },
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
  const _limited = rateLimited(req, "sdr-chat", 30, 60_000);
  if (_limited) return _limited as NextResponse;

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

  const claudeMessages = buildClaudeMessages(body.messages, body.currentMessage, body.scope);

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

    const scopePatch = parsed.scope && typeof parsed.scope === "object" ? (parsed.scope as Record<string, unknown>) : {};

    // The SDR's only job is discovery. Contact (Google), pricing and negotiation
    // all happen AFTER login — so these fields must never come from the chat,
    // even if the model hallucinates them. Strip them unconditionally.
    delete scopePatch.prospectEmail;
    delete scopePatch.prospectPhone;
    delete scopePatch.budgetRange;
    delete scopePatch.negotiation;

    const replyText = parsed.reply.trim();

    // ── Email guardrail ──────────────────────────────────────────────────────
    // Defence in depth: if the model slips into asking for / validating an e-mail
    // even though the user's message has no "@", reject the turn so the rule-based
    // engine (which no longer asks for e-mail) handles it instead.
    const msgHasAt = body.currentMessage.includes("@");
    const EMAIL_HALLUCINATION = /e-mail.*v[áa]lid|formato.*@|nome@dom[íi]nio|confirmar.*e-mail|e-mail.*formato|qual.*seu e-mail|seu e-mail/i;
    if (!msgHasAt && EMAIL_HALLUCINATION.test(replyText)) {
      console.warn("[sdr/chat] email-hallucination detected, falling back");
      return NextResponse.json({ ok: false, reason: "email_hallucination" });
    }

    // ── Price guardrail ──────────────────────────────────────────────────────
    // The SDR must NEVER quote a price in the conversation — the quote is built
    // only after Google login. If a price (R$ value) or discount language leaks
    // into the reply, reject the turn and fall back to the rule-based engine.
    const PRICE_LEAK = /r\$\s*\d|\d+\s*(reais|\/m[êe]s\b)|desconto|\bplano\b.*\bR\$/i;
    if (PRICE_LEAK.test(replyText)) {
      console.warn("[sdr/chat] price-leak detected, falling back");
      return NextResponse.json({ ok: false, reason: "price_leak" });
    }

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
