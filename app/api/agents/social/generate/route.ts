// POST /api/agents/social/generate
// Calls Claude to generate a full social media package (strategy + posts + stories + calendar).
// Uses a dedicated fetch with higher token limit than the shared adapter (4096 vs 1500).
// Returns SocialOutput shape expected by the social-media-agent page.

import { NextRequest, NextResponse } from "next/server";
import { claudeModel } from "@/lib/ai/claude-provider";
import { getSession } from "@/lib/auth/session";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 4096;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const resolved = await resolveProviderKey("claude", session?.workspaceId);
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma chave Claude configurada. Adicione em Integrações → IAs dos Agentes." },
      { status: 503 },
    );
  }

  const body = await req.json() as {
    brandName: string;
    brandSummary?: string;
    toneOfVoice: string;
    visualStyle: string;
    objective: string;
    frequency: string;
    channels: string[];
    notes?: string;
    brandBrain?: Record<string, string>;
  };

  const { brandName, brandSummary, toneOfVoice, visualStyle, objective, frequency, channels, notes, brandBrain } = body;

  const brandBrainSection = brandBrain
    ? `
BRAND BRAIN DO CLIENTE (dados coletados):
- Resumo do negócio: ${brandBrain.businessSummary || "não informado"}
- Tom de voz: ${brandBrain.toneOfVoice || toneOfVoice}
- Estilo visual: ${brandBrain.visualStyle || visualStyle}
- Público-alvo: ${brandBrain.targetAudience || "não informado"}
- Posicionamento: ${brandBrain.positioning || "não informado"}
- Produtos/serviços em destaque: ${brandBrain.productsToHighlight || "não informado"}
- Regras da marca: ${brandBrain.brandRules || "não informado"}
- O que evitar: ${brandBrain.thingsToAvoid || "não informado"}
- Canais preferidos: ${brandBrain.preferredChannels || channels.join(", ")}`
    : "";

  // Determine active days based on frequency
  const activeDaysMap: Record<string, string[]> = {
    "1x por semana":  ["Quarta"],
    "2x por semana":  ["Terça", "Quinta"],
    "3x por semana":  ["Segunda", "Quarta", "Sexta"],
    "5x por semana":  ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    "Diário":         ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
  };
  const activeDays = activeDaysMap[frequency] ?? ["Segunda", "Quarta", "Sexta"];

  const systemPrompt = `Você é o Social Media Agent da Dioli Agência Digital, uma agência de marketing digital premium no Brasil.
Você gera pacotes completos de social media com conteúdo real, específico e de alta qualidade.
Você SEMPRE responde com um JSON válido e completo. Nunca adiciona texto fora do JSON.
Todo conteúdo em PORTUGUÊS BRASILEIRO, adaptado profundamente ao segmento/nicho da marca.`;

  const userPrompt = `Gere um pacote completo de social media para o seguinte cliente:

MARCA: ${brandName}
RESUMO: ${brandSummary || "não informado"}
OBJETIVO: ${objective}
TOM DE VOZ: ${toneOfVoice}
ESTILO VISUAL: ${visualStyle}
FREQUÊNCIA: ${frequency} (dias ativos: ${activeDays.join(", ")})
CANAIS: ${channels.join(", ")}
OBSERVAÇÕES: ${notes || "nenhuma"}
${brandBrainSection}

Responda com este JSON exato (sem texto antes ou depois):

{
  "strategy": {
    "socialObjective": "objetivo específico e mensurável de social media para esta marca",
    "contentPositioning": "como esta marca se diferencia e se posiciona nas redes sociais",
    "contentPillars": [
      { "name": "Nome do Pilar", "description": "descrição detalhada", "percentage": 25, "example": "exemplo concreto de post para este pilar" },
      { "name": "Nome do Pilar 2", "description": "descrição detalhada", "percentage": 30, "example": "exemplo concreto" },
      { "name": "Nome do Pilar 3", "description": "descrição detalhada", "percentage": 20, "example": "exemplo concreto" },
      { "name": "Nome do Pilar 4", "description": "descrição detalhada", "percentage": 25, "example": "exemplo concreto" }
    ],
    "channelRecommendations": [
      { "channel": "${channels[0]}", "priority": "primary", "rationale": "motivo específico para esta marca", "formats": ["formato1", "formato2", "formato3"] }
    ],
    "postingFrequency": "${frequency}",
    "strategicRationale": "justificativa estratégica completa para as escolhas feitas"
  },
  "brandInterpretation": {
    "practicalUnderstanding": "entendimento prático do negócio e do momento da marca",
    "communicationStyle": "como a marca deve se comunicar especificamente",
    "toReinforce": ["elemento 1 a reforçar", "elemento 2", "elemento 3", "elemento 4"],
    "toAvoid": ["coisa 1 a evitar", "coisa 2", "coisa 3", "coisa 4"]
  },
  "contentIdeas": [
    { "title": "título da ideia 1", "pillar": "nome do pilar", "format": "Reels" },
    { "title": "título da ideia 2", "pillar": "nome do pilar", "format": "Carrossel" },
    { "title": "título da ideia 3", "pillar": "nome do pilar", "format": "Feed único" },
    { "title": "título da ideia 4", "pillar": "nome do pilar", "format": "Carrossel" },
    { "title": "título da ideia 5", "pillar": "nome do pilar", "format": "Reels" },
    { "title": "título da ideia 6", "pillar": "nome do pilar", "format": "Stories" }
  ],
  "calendar": [
    { "day": "Segunda", "active": ${activeDays.includes("Segunda")}, "format": "${activeDays.includes("Segunda") ? "Carrossel" : ""}", "theme": "${activeDays.includes("Segunda") ? "tema do conteúdo de segunda" : ""}", "objective": "${activeDays.includes("Segunda") ? "objetivo do post" : ""}", "channel": "${activeDays.includes("Segunda") ? channels[0] : ""}", "pillar": "${activeDays.includes("Segunda") ? "nome do pilar" : ""}" },
    { "day": "Terça", "active": ${activeDays.includes("Terça")}, "format": "${activeDays.includes("Terça") ? "Reels" : ""}", "theme": "${activeDays.includes("Terça") ? "tema do conteúdo de terça" : ""}", "objective": "${activeDays.includes("Terça") ? "objetivo do post" : ""}", "channel": "${activeDays.includes("Terça") ? channels[0] : ""}", "pillar": "${activeDays.includes("Terça") ? "nome do pilar" : ""}" },
    { "day": "Quarta", "active": ${activeDays.includes("Quarta")}, "format": "${activeDays.includes("Quarta") ? "Feed único" : ""}", "theme": "${activeDays.includes("Quarta") ? "tema do conteúdo de quarta" : ""}", "objective": "${activeDays.includes("Quarta") ? "objetivo do post" : ""}", "channel": "${activeDays.includes("Quarta") ? channels[0] : ""}", "pillar": "${activeDays.includes("Quarta") ? "nome do pilar" : ""}" },
    { "day": "Quinta", "active": ${activeDays.includes("Quinta")}, "format": "${activeDays.includes("Quinta") ? "Carrossel" : ""}", "theme": "${activeDays.includes("Quinta") ? "tema do conteúdo de quinta" : ""}", "objective": "${activeDays.includes("Quinta") ? "objetivo do post" : ""}", "channel": "${activeDays.includes("Quinta") ? channels[0] : ""}", "pillar": "${activeDays.includes("Quinta") ? "nome do pilar" : ""}" },
    { "day": "Sexta", "active": ${activeDays.includes("Sexta")}, "format": "${activeDays.includes("Sexta") ? "Reels" : ""}", "theme": "${activeDays.includes("Sexta") ? "tema do conteúdo de sexta" : ""}", "objective": "${activeDays.includes("Sexta") ? "objetivo do post" : ""}", "channel": "${activeDays.includes("Sexta") ? channels[0] : ""}", "pillar": "${activeDays.includes("Sexta") ? "nome do pilar" : ""}" },
    { "day": "Sábado", "active": ${activeDays.includes("Sábado")}, "format": "${activeDays.includes("Sábado") ? "Feed único" : ""}", "theme": "${activeDays.includes("Sábado") ? "tema do conteúdo de sábado" : ""}", "objective": "${activeDays.includes("Sábado") ? "objetivo do post" : ""}", "channel": "${activeDays.includes("Sábado") ? channels[0] : ""}", "pillar": "${activeDays.includes("Sábado") ? "nome do pilar" : ""}" },
    { "day": "Domingo", "active": ${activeDays.includes("Domingo")}, "format": "", "theme": "", "objective": "", "channel": "", "pillar": "" }
  ],
  "posts": [
    {
      "id": 1,
      "title": "título descritivo do post 1",
      "pillar": "nome do pilar",
      "objective": "objetivo específico deste post",
      "format": "Carrossel",
      "caption": "legenda COMPLETA e pronta para publicar no Instagram, com emojis, quebras de linha e hashtags relevantes no final. Mínimo 150 palavras.",
      "cta": "chamada para ação clara e específica",
      "creativeDirection": "direção criativa detalhada para o designer: cores, composição, elementos visuais, mood",
      "imagePrompt": "prompt técnico em inglês para geração de imagem IA (DALL-E / Midjourney), muito detalhado",
      "designNotes": "notas técnicas: proporção, tipografia, overlays de texto, paleta sugerida"
    },
    {
      "id": 2,
      "title": "título descritivo do post 2",
      "pillar": "nome do pilar",
      "objective": "objetivo específico deste post",
      "format": "Reels",
      "caption": "legenda COMPLETA e pronta para publicar no Instagram, com emojis, quebras de linha e hashtags relevantes no final. Mínimo 150 palavras.",
      "cta": "chamada para ação clara e específica",
      "creativeDirection": "direção criativa detalhada",
      "imagePrompt": "prompt técnico em inglês para geração de imagem/vídeo IA",
      "designNotes": "notas técnicas para o designer"
    },
    {
      "id": 3,
      "title": "título descritivo do post 3",
      "pillar": "nome do pilar",
      "objective": "objetivo específico deste post",
      "format": "Feed único",
      "caption": "legenda COMPLETA e pronta para publicar no Instagram. Mínimo 150 palavras.",
      "cta": "chamada para ação",
      "creativeDirection": "direção criativa detalhada",
      "imagePrompt": "prompt técnico em inglês para geração de imagem IA",
      "designNotes": "notas técnicas para o designer"
    },
    {
      "id": 4,
      "title": "título descritivo do post 4",
      "pillar": "nome do pilar",
      "objective": "objetivo específico deste post",
      "format": "Carrossel",
      "caption": "legenda COMPLETA e pronta para publicar no Instagram. Mínimo 150 palavras.",
      "cta": "chamada para ação",
      "creativeDirection": "direção criativa detalhada",
      "imagePrompt": "prompt técnico em inglês para geração de imagem IA",
      "designNotes": "notas técnicas para o designer"
    }
  ],
  "stories": [
    {
      "id": 1,
      "title": "título do stories 1",
      "pillar": "nome do pilar",
      "objective": "objetivo",
      "slideCount": 3,
      "caption": "texto para os slides dos stories, separados por | (pipe)",
      "cta": "chamada para ação (ex: 'Arraste para cima', 'Responda aqui')",
      "designNotes": "notas de design: sticker sugerido, enquete, countdown, cores"
    },
    {
      "id": 2,
      "title": "título do stories 2",
      "pillar": "nome do pilar",
      "objective": "objetivo",
      "slideCount": 2,
      "caption": "texto para os slides",
      "cta": "chamada para ação",
      "designNotes": "notas de design"
    },
    {
      "id": 3,
      "title": "título do stories 3",
      "pillar": "nome do pilar",
      "objective": "objetivo",
      "slideCount": 4,
      "caption": "texto para os slides",
      "cta": "chamada para ação",
      "designNotes": "notas de design"
    }
  ],
  "handoff": [
    { "postId": 1, "title": "título post 1", "format": "Carrossel", "visualDirection": "direção visual resumida", "prompt": "prompt de imagem", "keyCopy": "copy principal do post", "designNotes": "notas para o designer" },
    { "postId": 2, "title": "título post 2", "format": "Reels", "visualDirection": "direção visual resumida", "prompt": "prompt de imagem/vídeo", "keyCopy": "copy principal", "designNotes": "notas" },
    { "postId": 3, "title": "título post 3", "format": "Feed único", "visualDirection": "direção visual resumida", "prompt": "prompt de imagem", "keyCopy": "copy principal", "designNotes": "notas" },
    { "postId": 4, "title": "título post 4", "format": "Carrossel", "visualDirection": "direção visual resumida", "prompt": "prompt de imagem", "keyCopy": "copy principal", "designNotes": "notas" }
  ],
  "contracts": [
    { "postId": 1, "title": "título post 1", "format": "Carrossel", "contentObjective": "objetivo", "keyCopy": "copy principal", "cta": "cta", "creativeDirection": "direção criativa", "imagePrompt": "prompt", "designNotes": "notas" },
    { "postId": 2, "title": "título post 2", "format": "Reels", "contentObjective": "objetivo", "keyCopy": "copy principal", "cta": "cta", "creativeDirection": "direção criativa", "imagePrompt": "prompt", "designNotes": "notas" },
    { "postId": 3, "title": "título post 3", "format": "Feed único", "contentObjective": "objetivo", "keyCopy": "copy principal", "cta": "cta", "creativeDirection": "direção criativa", "imagePrompt": "prompt", "designNotes": "notas" },
    { "postId": 4, "title": "título post 4", "format": "Carrossel", "contentObjective": "objetivo", "keyCopy": "copy principal", "cta": "cta", "creativeDirection": "direção criativa", "imagePrompt": "prompt", "designNotes": "notas" }
  ]
}

IMPORTANTE: Substitua todos os textos de exemplo pelo conteúdo REAL da marca ${brandName}. Legendas devem ser completas e prontas para publicar.`;

  const apiKey = resolved.apiKey;
  const model = resolved.model ?? claudeModel();

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
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ ok: false, error: `Claude HTTP ${res.status}: ${errText}` }, { status: 500 });
    }

    const json = (await res.json()) as { content?: { type: string; text: string }[] };
    const text = json.content?.[0]?.text;
    if (!text) return NextResponse.json({ ok: false, error: "Resposta Claude vazia" }, { status: 500 });

    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const start = stripped.indexOf("{");
    const end   = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({ ok: false, error: "JSON não encontrado na resposta" }, { status: 500 });
    }

    try {
      const output = JSON.parse(stripped.slice(start, end + 1));
      return NextResponse.json({ ok: true, output, model });
    } catch {
      return NextResponse.json({ ok: false, error: "JSON inválido na resposta Claude" }, { status: 500 });
    }
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout (60s)" : String(err);
    return NextResponse.json({ ok: false, error: `Falha ao chamar Claude: ${reason}` }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}

