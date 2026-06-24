// POST /api/sdr/chat
//
// Public endpoint (no auth — called from the public /briefing page).
// This is the brain of the SDR agent: the FIRST contact with a prospect.
//
// Unlike /api/brain/briefing-extract (which only extracts fields), this route
// generates the actual conversational reply with Claude Sonnet — the most
// capable model — so the agent talks naturally, handles garbled speech-to-text
// input, and asks for clarification when it doesn't understand instead of
// guessing. It also returns a structured scope patch in the same call.
//
// Lei 2: the rule-based engine remains the authoritative fallback. If this
// route fails (no key, timeout, bad JSON), the client falls back to it.
//
// Security: the Claude key stays server-side (resolved from the Integrations UI
// key or ANTHROPIC_API_KEY env). PII is used only within the request cycle and
// never logged.

import { NextRequest, NextResponse } from "next/server";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

const CLAUDE_URL  = "https://api.anthropic.com/v1/messages";
const MODEL       = "claude-sonnet-4-6";
const TIMEOUT_MS  = 30_000;
const MAX_HISTORY = 16; // conversation turns sent to the model

interface ConvMsg { role: string; text: string }

interface ChatRequest {
  messages: ConvMsg[];
  currentMessage: string;
  scope?: Record<string, unknown>;
}

const SYSTEM_PROMPT = `Você é a consultora comercial (SDR) da Dioli Digital — uma agência de marketing com inteligência artificial. Posicionamento: "Estratégia humana. Execução inteligente."

Você é o PRIMEIRO contato do cliente com a agência. Sua missão: acolher o prospect, investigar profundamente o que ele precisa e montar o escopo para UMA PROPOSTA PRINCIPAL e UMA PROPOSTA LIGHT — de forma calorosa, consultiva e profissional, em português do Brasil.

COMO CONVERSAR:
- Seja breve (2 a 4 frases por resposta). Calorosa, mas objetiva. Trate por "você".
- Faça UMA pergunta por vez. Avance naturalmente: identidade → serviço → detalhes → objetivos → orçamento → contato.
- Use o nome da pessoa e do negócio quando souber, para criar conexão.

INVESTIGAÇÃO (MUITO IMPORTANTE — faça perguntas para qualificar bem):
Antes de fechar o escopo, certifique-se de ter respondido:
1. Qual o objetivo principal? (vendas, visibilidade, fidelização, lançamento…)
2. Quais redes sociais quer trabalhar? (Instagram, TikTok, Facebook, LinkedIn…)
3. Com que frequência quer publicar? (posts/semana)
4. Vai precisar de reels? Tem material de vídeo ou precisa produção?
5. A Dioli faz a copy dos textos ou o cliente fornece?
6. O cliente tem fotos/imagens disponíveis?
7. Já tem identidade visual / brand book? Quer rebranding?
8. Qual o orçamento mensal disponível para marketing? (pergunte sempre — é a informação mais importante para calibrar a proposta)
9. Tem algum prazo específico para começar?

ESTRATÉGIA DE PROPOSTA DUPLA:
- Sempre que tiver informações suficientes, monte mentalmente DUAS opções:
  1. PROPOSTA COMPLETA: atende tudo que o cliente pediu (ideal)
  2. PROPOSTA LIGHT: versão reduzida que cabe em orçamento menor (menos posts, sem reels, etc.)
- Quando for convidar a revisar a proposta ao lado, mencione que pode ajustar o escopo caso o investimento esteja fora do orçamento.
- Se o cliente mencionar um orçamento menor do que o escopo pedido, proativamente sugira a versão light.

ÁUDIO TORTO / MENSAGEM CONFUSA (MUITO IMPORTANTE):
- A mensagem do cliente pode vir de transcrição de voz e estar truncada, com palavras sem nexo ou nomes errados (ex: "óleo de digital" quando quis dizer "Dioli digital", "Granny book" quando quis dizer "brand book").
- NUNCA finja que entendeu. Se algo estiver confuso ou incompleto, peça gentilmente para a pessoa repetir ou confirmar APENAS o ponto específico que não ficou claro. Ex: "Desculpa, a transcrição cortou um pedaço — só pra confirmar, o nome do seu negócio é...?"
- Quando captar um nome importante (pessoa, negócio, e-mail) por voz, confirme antes de seguir: "Entendi como 'Dione Studio' — está correto ou é outro nome?"

O QUE CAPTURAR (ao longo da conversa, sem soar como formulário):
- Identidade: nome da pessoa, nome do negócio, segmento, e-mail, WhatsApp.
- Serviço: redes sociais (social media), tráfego pago (anúncios) e/ou identidade visual/branding.
- Detalhes de social: plataformas, frequência de posts/semana, stories, reels, se tem fotos, se a Dioli faz a copy.
- Objetivos de marketing (ex: aumentar vendas, captar clientes, lançar produto).
- Orçamento mensal disponível para marketing — PERGUNTE SEMPRE, é a base da proposta.
- Se já tem brand book / identidade visual.
- Prazo desejado para início.

REGRAS:
- NUNCA invente preços ou valores. A estimativa aparece automaticamente em outro painel. Se perguntarem preço, diga que a proposta está sendo montada ao lado conforme a conversa e que sempre haverá uma opção que cabe no orçamento deles.
- Não invente dados que o cliente não disse.
- Quando tiver as informações principais (serviço + identidade + orçamento + contato), convide a pessoa a revisar a proposta ao lado e enviar. Mencione que há flexibilidade de escopo caso queira ajustar.

PREENCHIMENTO DO ESCOPO (essencial para a estimativa aparecer no painel):
- A estimativa só aparece quando você devolve os NÚMEROS no scope. Sempre que o cliente indicar quantidade de posts, traduza para "social.postsPerWeek" (posts por semana). Ex.: "12 posts por mês" → postsPerWeek: 3; "uns 3 por semana" → postsPerWeek: 3.
- Se o cliente menciona redes sociais mas ainda não disse a frequência, faça a pergunta da frequência de posts logo — é o que destrava a estimativa.
- Inclua "social.reelsPerMonth" (0 se não quiser reels), "social.needsCopy" e "social.hasPhotos" assim que souber.
- Para tráfego pago, capture "traffic.monthlyAdBudget" (verba mensal de mídia).
- Capture "budgetRange" assim que o cliente mencionar qualquer valor de orçamento.
- Devolva no scope TODOS os campos já confirmados na conversa até aqui (acumulado), não apenas o que mudou nesta última mensagem.

FORMATO DE RESPOSTA — retorne SOMENTE um JSON válido, sem texto fora dele:
{
  "reply": "sua próxima fala para o cliente (string, em pt-BR)",
  "needsClarification": true/false,
  "scope": {
    "prospectName": "string ou omita",
    "businessName": "string ou omita",
    "segment": "string ou omita",
    "prospectEmail": "email válido ou omita",
    "prospectPhone": "telefone ou omita",
    "objectives": ["..."] ou omita,
    "wantsSocialMedia": true/false ou omita,
    "wantsPaidTraffic": true/false ou omita,
    "branding": { "requested": true/false, "hasBrandBook": true/false, "wantsRebrand": true/false } ou omita,
    "social": { "platforms": ["Instagram"], "postsPerWeek": 3, "storiesPerWeek": 0, "reelsPerMonth": 0, "needsCopy": true, "hasPhotos": false } ou omita,
    "traffic": { "platforms": ["Meta Ads"], "monthlyAdBudget": "R$ 1.000" } ou omita,
    "serviceMode": "monthly" | "one_off" | "unsure" ou omita,
    "budgetRange": "string ou omita",
    "deadline": "string ou omita"
  }
}

Em "scope", inclua APENAS campos que o cliente mencionou explicitamente nesta conversa. Se não tem certeza de um campo, omita-o (não chute).`;

function buildClaudeMessages(messages: ConvMsg[], currentMessage: string, scope?: Record<string, unknown>) {
  const history = messages
    .filter((m) => m.role !== "system")
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    }));

  const scopeNote =
    scope && Object.keys(scope).length > 0
      ? `\n\n[Contexto interno — dados já captados até agora: ${JSON.stringify(scope)}. Não repita perguntas já respondidas.]`
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
  const resolved = await resolveProviderKey("claude");
  if (!resolved) {
    // Not configured — tell client to rely on rule-based engine (not an error).
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
        max_tokens: 1024,
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

    return NextResponse.json({
      ok: true,
      reply: parsed.reply.trim(),
      needsClarification: parsed.needsClarification === true,
      scope: parsed.scope && typeof parsed.scope === "object" ? parsed.scope : {},
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    console.error(`[sdr/chat] ${reason}`);
    return NextResponse.json({ ok: false, reason });
  } finally {
    clearTimeout(timeout);
  }
}
