// Esta rota passou a falar com o MOTOR (`lib/ai/generate`), não com a Anthropic.
//
// Antes ela montava o `fetch` para `api.anthropic.com` na mão, com o provedor
// "claude" escrito no código. Três coisas se perdiam nisso, e nenhuma é
// cosmética:
//
//   1. A CONTA. Toda chamada daqui saía de graça no relatório: sem `AIRunLog`,
//      sem tokens, sem dono. "Quanto custou este cliente" respondia menos do que
//      a verdade, e a diferença crescia sozinha.
//   2. A ESCOLHA DE PROVEDOR POR CLIENTE (`ClientAiProvider`). O cliente fixado
//      no Gemini era atendido pelo Claude assim mesmo — a tela dizia uma coisa e
//      o servidor fazia outra.
//   3. A RESERVA. Claude fora do ar = rota fora do ar, com as outras chaves
//      conectadas paradas do lado.
// POST /api/agents/social/generate
// Calls Claude to generate a full social media package (strategy + posts + stories + calendar).
// Uses a dedicated fetch with higher token limit than the shared adapter (4096 vs 1500).
// Returns SocialOutput shape expected by the social-media-agent page.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { generate } from "@/lib/ai/generate";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";

const MAX_TOKENS = 4096;

export async function POST(req: NextRequest) {
  // SEGURANÇA: exige sessão — antes, anônimo queimava a chave Claude da agência.
  const guard = await requireSession();
  if (guard.error) return guard.error;

  // FAIXA 1 do CSRF: gasta a chave de IA da agência a cada chamada.
  if (deveBloquearMutacaoCrossSite(req)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  const body = await req.json() as {
    // Opcionais e usados SÓ para dar dono ao gasto. A tela ainda pode não
    // mandar: nesse caso o custo entra sem cliente, e isso está anotado em
    // docs/pendencias.md em vez de ser preenchido por adivinhação.
    clientId?: string;
    projectId?: string;
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

  const r = await generate({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: MAX_TOKENS,
    workspaceId: guard.session.workspaceId,
    // `preferredProvider` é PREFERÊNCIA, não decreto: a fixação do cliente
    // vence, e as outras chaves entram de reserva se esta falhar.
    preferredProvider: "claude",
    // Sem estes, o gasto entra no relatório sem dono.
    clientId: typeof body.clientId === "string" ? body.clientId : null,
    projectId: typeof body.projectId === "string" ? body.projectId : null,
    departmentId: "social-media",
    agentId: "social",
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });

  const output = r.data;
  return NextResponse.json({ ok: true, output, model: r.model });
}

