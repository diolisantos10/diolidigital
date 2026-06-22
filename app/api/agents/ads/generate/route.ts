// POST /api/agents/ads/generate
// Calls Claude to generate a full paid media plan (strategy + funnel + audiences + copy + creatives).
// Returns AdsPlan shape expected by the ads-agent page.

import { NextRequest, NextResponse } from "next/server";
import { isClaudeConfigured, claudeModel } from "@/lib/ai/claude-provider";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";

export async function POST(req: NextRequest) {
  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY não configurada." },
      { status: 503 },
    );
  }

  const body = await req.json() as {
    projectId: string;
    clientId: string;
    projectName: string;
    clientName: string;
    projectObjective: string;
    services: string[];
    budget?: string;
    brandBrain?: {
      visualStyle?: string;
      toneOfVoice?: string;
      targetAudience?: string;
      positioning?: string;
      productsToHighlight?: string;
      preferredChannels?: string;
      businessSummary?: string;
    };
    strategyRoomSynthesis?: string;
    brandBrainReadiness: number;
  };

  const {
    projectId, clientId, projectName, clientName, projectObjective,
    services, brandBrain, strategyRoomSynthesis, brandBrainReadiness, budget,
  } = body;

  const brandCtx = brandBrain ? `
- Resumo do negócio: ${brandBrain.businessSummary || "não informado"}
- Público-alvo: ${brandBrain.targetAudience || "não informado"}
- Posicionamento: ${brandBrain.positioning || "não informado"}
- Produtos/serviços a destacar: ${brandBrain.productsToHighlight || "não informado"}
- Tom de voz: ${brandBrain.toneOfVoice || "não informado"}
- Canais preferidos: ${brandBrain.preferredChannels || "não informado"}` : "";

  const strategyCtx = strategyRoomSynthesis
    ? `\nSYNTESE DO STRATEGY ROOM:\n${strategyRoomSynthesis.slice(0, 600)}`
    : "";

  const systemPrompt = `Você é o Ads Agent da Dioli Agência Digital, especialista em tráfego pago no Brasil.
Você cria planos de mídia paga completos, específicos e estratégicos.
Você responde APENAS com JSON válido. Nenhum texto fora do JSON.
Todo conteúdo em PORTUGUÊS BRASILEIRO.`;

  const userPrompt = `Crie um plano de mídia paga completo para o seguinte cliente:

PROJETO: ${projectName}
CLIENTE: ${clientName}
OBJETIVO: ${projectObjective}
SERVIÇOS CONTRATADOS: ${services.join(", ")}
BUDGET DISPONÍVEL: ${budget || "a definir com o cliente"}
BRAND BRAIN COMPLETENESS: ${brandBrainReadiness}/10
${brandCtx}
${strategyCtx}

Responda com JSON exato no seguinte formato:

{
  "projectId": "${projectId}",
  "clientId": "${clientId}",
  "generatedAt": "${new Date().toISOString()}",
  "usedStrategyRoom": ${!!strategyRoomSynthesis},
  "brandBrainReadiness": ${brandBrainReadiness},

  "campaignObjective": "objetivo SMART da campanha, específico para ${clientName}",
  "platform": "Meta Ads" | "Google Ads" | "Meta Ads + Google Ads",
  "platformRationale": "justificativa de 2-3 frases para a escolha de plataforma baseada no negócio e objetivo",
  "offerAngle": "ângulo de oferta principal — o que será promovido e como será posicionado",
  "budgetSuggestion": "sugestão de budget mensal com breakdown (ex: R$ 3.000 — R$ 2.000 em mídia + R$ 1.000 fee de gestão)",
  "budgetRationale": "justificativa do budget sugerido com projeções de resultado esperado",

  "funnel": [
    {
      "stage": "Topo (Awareness)",
      "goal": "objetivo específico desta etapa",
      "platforms": "plataformas usadas nesta etapa",
      "formats": ["formato1", "formato2"]
    },
    {
      "stage": "Meio (Consideração)",
      "goal": "objetivo específico desta etapa",
      "platforms": "plataformas usadas",
      "formats": ["formato1", "formato2"]
    },
    {
      "stage": "Fundo (Conversão)",
      "goal": "objetivo específico desta etapa",
      "platforms": "plataformas usadas",
      "formats": ["formato1", "formato2"]
    }
  ],

  "audienceStrategy": "estratégia geral de audiências em 2-3 parágrafos, explicando a lógica de segmentação para ${clientName}",
  "audienceSegments": [
    {
      "name": "nome do segmento (ex: Audiência Fria — Interesse)",
      "type": "fria",
      "description": "descrição detalhada deste segmento e por que é relevante para ${clientName}",
      "targeting": "especificação técnica de targeting: interesses, comportamentos, dados demográficos, lookalike, remarketing etc."
    },
    {
      "name": "nome do segmento 2",
      "type": "morna",
      "description": "descrição detalhada",
      "targeting": "especificação técnica"
    },
    {
      "name": "nome do segmento 3",
      "type": "quente",
      "description": "descrição detalhada",
      "targeting": "especificação técnica de remarketing/retargeting"
    }
  ],

  "adCopyIdeas": [
    {
      "angle": "nome do ângulo de copy (ex: Prova Social, Urgência, Benefício Direto)",
      "headline": "headline do anúncio — máximo 40 caracteres, impactante",
      "primaryText": "texto principal do anúncio — completo, conversacional, com CTA. Pronto para usar no Meta/Google.",
      "cta": "chamada para ação (ex: Saiba Mais, Compre Agora, Fale Conosco)"
    },
    {
      "angle": "segundo ângulo",
      "headline": "headline 2",
      "primaryText": "texto principal 2 — variação do ângulo, pronto para usar",
      "cta": "cta"
    },
    {
      "angle": "terceiro ângulo",
      "headline": "headline 3",
      "primaryText": "texto principal 3",
      "cta": "cta"
    }
  ],

  "creativeRequirements": [
    {
      "asset": "nome do criativo (ex: Vídeo Depoimento, Banner Feed, Story Animado)",
      "format": "especificação de formato e proporção (ex: 1:1 feed, 9:16 story, 16:9 video)",
      "spec": "especificações técnicas completas: resolução, duração, tamanho máximo, codec se video",
      "direction": "direção criativa: o que mostrar, tom visual, copy on-screen, música/narração"
    },
    {
      "asset": "criativo 2",
      "format": "formato",
      "spec": "specs técnicas",
      "direction": "direção criativa"
    },
    {
      "asset": "criativo 3",
      "format": "formato",
      "spec": "specs técnicas",
      "direction": "direção criativa"
    }
  ],

  "campaignRisks": [
    "risco 1 específico para este cliente/campanha e como mitigar",
    "risco 2",
    "risco 3"
  ],
  "optimizationSuggestions": [
    "sugestão de otimização 1 — específica para este caso",
    "sugestão 2",
    "sugestão 3",
    "sugestão 4"
  ]
}

IMPORTANTE: Todo conteúdo deve ser específico para ${clientName} e seu objetivo real. Sem textos genéricos ou placeholders.`;

  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = claudeModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Claude HTTP ${res.status}` }, { status: 500 });
    }

    const json = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = json.content?.[0]?.text;
    if (!text) return NextResponse.json({ ok: false, error: "Resposta Claude vazia" }, { status: 500 });

    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = stripped.indexOf("{");
    const end   = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({ ok: false, error: "JSON não encontrado" }, { status: 500 });
    }

    const plan = JSON.parse(stripped.slice(start, end + 1));
    return NextResponse.json({ ok: true, plan, model });
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : String(err);
    return NextResponse.json({ ok: false, error: `Falha ao chamar Claude: ${reason}` }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
