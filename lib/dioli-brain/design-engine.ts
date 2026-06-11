// Dioli Brain — Design Engine
// Transforms an approved SocialCanvas into a DesignCanvas with creative briefs,
// image prompt specs and visual asset requirements. Reasons through
// DIOLI_COGNITIVE_FLOW — every canvas carries the flow trace.
// Rule-based engine: segment-aware visual heuristics, no external AI calls.
//
// Dioli Standard: Brain → Strategy → Social → Design → Quality → Evidence.
// Design never produces output without a Social Canvas input.

import { DIOLI_COGNITIVE_FLOW } from "./cognitive-flow";
import type { SocialCanvas, ContentTheme } from "./social-canvas";
import {
  runDesignQualityGate,
  type CreativeBrief,
  type DesignCanvas,
  type DesignFlowStep,
  type ImagePromptSpec,
  type VisualAssetRequirement,
} from "./design-canvas";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface DesignEngineInput {
  socialCanvas: SocialCanvas;               // required — Design never runs without Social
  requestId?: string;
  source?: "request" | "simulation";
}

// ── Segment visual profiles ───────────────────────────────────────────────────
// Order matters: more specific profiles must come before generic ones.

interface DesignSegmentProfile {
  match: RegExp;
  visualConcept: string;
  visualTone: string;
  colorDirection: string;
  typographyDirection: string;
  imageryDirection: string;
  brandConsistencyRules: string[];
  productionNotes: string[];
  styleModifiers: string[];
  colorPalette: string[];
  mood: string;
  getBriefVisualConcept: (theme: ContentTheme) => string;
  getAssetDimensions: (format: string) => string;
}

const DESIGN_PROFILES: DesignSegmentProfile[] = [
  {
    match: /premium|fine|alta gastronomia|sofisticad|luxo|exclusiv/i,
    visualConcept: "Fotografia editorial premium — cenografia controlada, iluminação dramática e apresentação impecável em cada frame.",
    visualTone: "Elegante, sóbrio, minimalista — o silêncio visual também comunica classe.",
    colorDirection: "Paleta escura e neutra: pretos, greges e dourados. Nunca cores saturadas ou vibrantes.",
    typographyDirection: "Serifas clássicas para títulos; sans-serif limpa para corpo. Nunca fontes decorativas ou Bold excessivo.",
    imageryDirection: "Fotografia profissional obrigatória. Composição centralizada ou rule-of-thirds. Bokeh controlado. Nenhuma foto de smartphone.",
    brandConsistencyRules: [
      "Nenhuma marca d'água visível que rebaixe a percepção",
      "Paleta restrita — sem introdução de cores não aprovadas",
      "Serifas apenas em títulos — nunca em corpo de texto",
      "Versão horizontal e vertical de cada peça premium",
    ],
    productionNotes: [
      "Briefing fotográfico separado para cada shoot",
      "Aprovação da equipe antes de qualquer publicação",
      "Nenhum filtro de rede social aplicado diretamente",
    ],
    styleModifiers: ["editorial photography", "fine dining", "minimalist composition", "dramatic lighting", "luxury aesthetic"],
    colorPalette: ["deep charcoal", "warm greige", "matte gold", "ivory white"],
    mood: "luxuoso, contemplativo, desejável",
    getBriefVisualConcept: (t) => `Composição premium — ${t.title.toLowerCase()} com estética editorial controlada.`,
    getAssetDimensions: (f) => f === "story" ? "1080×1920" : f === "reel_thumbnail" ? "1080×1920" : "1080×1080",
  },
  {
    match: /restaurante|sushi|pizza|hamburgue|fast\s*food|caf[eé]\b|bar\b|lanchon|padaria|pastelaria|a[çc]a[íi]|churrascaria|gastronomia/i,
    visualConcept: "Apetite em primeiro plano — cada peça deve gerar desejo imediato e drive-to-action local.",
    visualTone: "Quente, acolhedor, apetitoso — cores que estimulam fome e convidam à ação.",
    colorDirection: "Tons quentes: âmbre, terracota, caramelo. Fundos neutros que destacam o alimento.",
    typographyDirection: "Sans-serif arredondada e amigável. Bold para preços e promoções. Hierarquia clara em 2 tamanhos.",
    imageryDirection: "Close-up de produto com profundidade de campo rasa. Vapor, movimento e texturas. Reels de preparo têm maior alcance.",
    brandConsistencyRules: [
      "Nome e logo sempre visíveis mas não dominantes",
      "Paleta cálida mantida em todas as peças",
      "Tipografia consistente — máximo 2 fontes por peça",
      "CTA sempre presente em posts de promoção",
    ],
    productionNotes: [
      "Shoot de produto a cada lançamento de menu",
      "Stories de prato do dia podem ser produzidos internamente com iPhone + ring light",
      "Reels de preparo devem ter corte rápido e trilha energética",
    ],
    styleModifiers: ["food photography", "warm lighting", "close-up macro", "appetite appeal", "rustic texture"],
    colorPalette: ["warm amber", "terracotta", "caramel brown", "cream white"],
    mood: "apetitoso, acolhedor, convidativo",
    getBriefVisualConcept: (t) => `Composição gastronômica — ${t.title.toLowerCase()} com apelo visual imediato.`,
    getAssetDimensions: (f) => f === "story" || f === "reel_thumbnail" ? "1080×1920" : f === "carrossel_slide" ? "1080×1080" : "1080×1080",
  },
  {
    match: /e-?commerce|loja\s*(online|virtual)|marketplace|dropship/i,
    visualConcept: "Produto em contexto real — cada peça move o cliente pelo funil, do desejo à conversão.",
    visualTone: "Clean, confiável, focado — fundo claro e produto como protagonista absoluto.",
    colorDirection: "Fundo branco ou cinza claro para produto. Cor de marca restrita a CTAs e elementos de apoio.",
    typographyDirection: "Sans-serif moderna e legível. Bold para preço e benefício-chave. Hierarquia: produto → benefício → CTA.",
    imageryDirection: "Flatlay ou lifestyle do produto em uso. Prova social com usuário real. Comparativo antes/depois quando aplicável.",
    brandConsistencyRules: [
      "Fundo sempre limpo — sem texturas que disputem atenção com o produto",
      "Preço visível e legível em peças de conversão",
      "Badge de avaliação/review quando aplicável",
      "CTA com urgência leve — estoque limitado, oferta até X",
    ],
    productionNotes: [
      "Pack de fotos do produto em 3 ângulos + lifestyle",
      "UGC (conteúdo de usuário) integrado ao calendário de prova social",
      "Carrosséis de comparação produzem maior retenção",
    ],
    styleModifiers: ["product photography", "clean background", "lifestyle context", "e-commerce standard", "sharp detail"],
    colorPalette: ["pure white", "light gray", "brand accent", "conversion red"],
    mood: "confiável, desejável, orientado à conversão",
    getBriefVisualConcept: (t) => `Visual de produto — ${t.title.toLowerCase()} com foco em conversão.`,
    getAssetDimensions: (f) => f === "story" ? "1080×1920" : f === "carrossel_slide" ? "1080×1080" : "1080×1080",
  },
  {
    match: /cl[íi]nica|consult[óo]rio|dent|m[ée]dic|est[ée]tica(?!\s+capilar)|fisio|psico|sa[úu]de/i,
    visualConcept: "Autoridade clínica com humanização — cada peça transmite confiança técnica e cuidado genuíno.",
    visualTone: "Limpo, seguro, profissional — transmite confiança sem frieza hospitalar.",
    colorDirection: "Azuis suaves, verdes-água, branco clínico. Nunca vermelho intenso ou amarelo vibrante.",
    typographyDirection: "Sans-serif séria e legível. Hierarquia clara: título da evidência → explicação → CTA de agendamento.",
    imageryDirection: "Profissional em ambiente clínico organizado. Resultado de procedimento com consentimento. Foto de antes/depois apenas com aprovação do paciente.",
    brandConsistencyRules: [
      "CFM/CRO/CRP sempre visível quando exigido pela resolução",
      "Nenhuma promessa de resultado garantido em texto visível",
      "Foto de paciente apenas com autorização escrita",
      "Tom de voz médico — nunca informal demais",
    ],
    productionNotes: [
      "Conteúdo educativo pode ser produzido internamente com motion simples",
      "Depoimentos requerem autorização explícita",
      "Cards de dicas profissionais têm alta performance orgânica",
    ],
    styleModifiers: ["clinical photography", "soft light", "professional environment", "trust-building", "clean minimalist"],
    colorPalette: ["clinical white", "soft blue", "sage green", "light gray"],
    mood: "confiável, técnico, humanizado",
    getBriefVisualConcept: (t) => `Visual clínico — ${t.title.toLowerCase()} com autoridade e confiança.`,
    getAssetDimensions: (f) => f === "story" || f === "reel_thumbnail" ? "1080×1920" : "1080×1080",
  },
  {
    match: /acad[eê]mia|crossfit|personal|fit|treino|gym|muscula[çc]|pilates/i,
    visualConcept: "Performance e transformação — cada peça energiza, motiva e mostra resultado real.",
    visualTone: "Dinâmico, energético, motivador — contraste alto e movimento no frame.",
    colorDirection: "Cores saturadas: vermelho, laranja, preto. Contraste alto para impacto em feed.",
    typographyDirection: "Sans-serif bold e impactante. Títulos grandes com peso máximo. Números de resultado em destaque.",
    imageryDirection: "Ação em movimento, esforço real, resultado de transformação. Iluminação dramática e contrastada.",
    brandConsistencyRules: [
      "Logo sempre presente mas sem competir com o atleta/exercício",
      "Paleta de energia mantida — nunca pasteis",
      "Números de resultado sempre visíveis (kg perdidos, semanas, etc.)",
      "Antes/depois com consentimento e contexto claro",
    ],
    productionNotes: [
      "Reels de treino têm maior engajamento — planejar 2 por semana",
      "Shorts de 15s de motivação matinal performam bem às 5h–7h",
      "Foto profissional de atleta a cada 30 dias para feed",
    ],
    styleModifiers: ["fitness photography", "dramatic lighting", "action shot", "high contrast", "motivational"],
    colorPalette: ["power red", "deep black", "electric orange", "bright white"],
    mood: "energético, motivador, transformador",
    getBriefVisualConcept: (t) => `Visual fitness — ${t.title.toLowerCase()} com energia e motivação.`,
    getAssetDimensions: (f) => f === "story" || f === "reel_thumbnail" ? "1080×1920" : "1080×1080",
  },
  {
    match: /sal[ãa]o|beleza|barbearia|cabelo|est[ée]tica capilar|nail|manicure|maquiagem|cabeleireira/i,
    visualConcept: "Transformação e beleza — cada peça captura o antes/depois e o cuidado do resultado.",
    visualTone: "Quente, feminino/masculino conforme o nicho, aspiracional e inspirador.",
    colorDirection: "Tons rosados, dourados ou neutros dependendo do posicionamento. Nunca cores frias industriais.",
    typographyDirection: "Tipografia delicada ou geométrica moderna. Lettering quando adequado ao perfil. Nome do procedimento em destaque.",
    imageryDirection: "Resultado de procedimento em primeiro plano. Portfólio de trabalhos com qualidade consistente. Making-of com cliente sempre com autorização.",
    brandConsistencyRules: [
      "Portfólio com iluminação consistente — nunca foto escura ou desfocada",
      "Tabela de preços opcional — evitar exposição excessiva que rebaixe percepção",
      "Tom de voz acolhedor — não vendedor",
      "Nenhuma foto de cliente sem consentimento explícito",
    ],
    productionNotes: [
      "Foto de resultado do dia é o conteúdo principal — planejar iluminação de atendimento",
      "Reels de transformação têm alto compartilhamento",
      "Destaques separados por procedimento para facilitar navegação no perfil",
    ],
    styleModifiers: ["beauty photography", "warm soft light", "close-up detail", "transformation focus", "aspirational"],
    colorPalette: ["soft rose", "warm gold", "nude beige", "ivory white"],
    mood: "aspiracional, cuidadoso, transformador",
    getBriefVisualConcept: (t) => `Visual de beleza — ${t.title.toLowerCase()} com foco em transformação.`,
    getAssetDimensions: (f) => f === "story" || f === "reel_thumbnail" ? "1080×1920" : "1080×1080",
  },
  {
    match: /servi[çc]|consult|agência|assessoria|contabilidade|advocacia|imobiliária|seguros/i,
    visualConcept: "Autoridade posicionada — cada peça demonstra expertise e constrói confiança institucional.",
    visualTone: "Profissional, confiável, sóbrio — institucional sem ser frio.",
    colorDirection: "Azul corporativo, cinzas elegantes, branco limpo. Cor de destaque controlada para CTAs.",
    typographyDirection: "Sans-serif institucional, legível em qualquer tamanho. Hierarquia clara: valor entregue → prova → CTA.",
    imageryDirection: "Ambiente de trabalho organizado, equipe profissional, infográficos de resultado. Nunca foto de banco de imagens genérico.",
    brandConsistencyRules: [
      "Números e resultados devem ser verificáveis — nunca inventados",
      "Logo e identidade visual consistentes em todas as peças",
      "Depoimento de cliente com cargo/empresa identificados",
      "Tom de voz especialista — nunca casual demais",
    ],
    productionNotes: [
      "Carrosséis educativos têm alta performance para serviços",
      "Conteúdo de autoridade pode ser produzido com motion simples e citações",
      "Cases com resultado concreto têm maior conversão",
    ],
    styleModifiers: ["corporate photography", "clean office environment", "professional team", "infographic style", "authoritative"],
    colorPalette: ["corporate blue", "warm gray", "clean white", "accent teal"],
    mood: "profissional, confiável, especialista",
    getBriefVisualConcept: (t) => `Visual corporativo — ${t.title.toLowerCase()} com autoridade e credibilidade.`,
    getAssetDimensions: (f) => f === "story" ? "1080×1920" : "1080×1080",
  },
  {
    match: /educa[çc]|curso|escola|faculdade|treinamento|capacita[çc]|mentoria/i,
    visualConcept: "Aprendizado transformador — cada peça inspira crescimento e demonstra o valor do conhecimento.",
    visualTone: "Inspirador, acessível, dinâmico — energia de descoberta e progresso.",
    colorDirection: "Cores vibrantes mas não agressivas: azul elétrico, verde crescimento, laranja energético.",
    typographyDirection: "Bold e legível — títulos de impacto com dado/resultado. Corpo em sans-serif simples e clara.",
    imageryDirection: "Aluno em contexto de aprendizado, resultado alcançado, infográfico de jornada. Diversidade visual.",
    brandConsistencyRules: [
      "Depoimento de aluno sempre com nome e resultado específico",
      "Nunca prometer resultado garantido sem contexto de esforço",
      "Visual de antes/depois da jornada quando aplicável",
      "CTA de inscrição sempre presente em conteúdo de fundo de funil",
    ],
    productionNotes: [
      "Carrosséis de conteúdo educativo têm alta taxa de salvamento",
      "Reels de transformação de aluno têm alto compartilhamento",
      "Lives de aula gratuita alimentam topo de funil",
    ],
    styleModifiers: ["educational design", "vibrant colors", "infographic style", "inspirational portrait", "growth mindset"],
    colorPalette: ["vibrant blue", "growth green", "energetic orange", "clean white"],
    mood: "inspirador, transformador, acessível",
    getBriefVisualConcept: (t) => `Visual educacional — ${t.title.toLowerCase()} com foco em transformação e aprendizado.`,
    getAssetDimensions: (f) => f === "story" ? "1080×1920" : f === "carrossel_slide" ? "1080×1080" : "1080×1080",
  },
  {
    // Default profile — generic service/brand
    match: /.*/,
    visualConcept: "Identidade visual consistente — cada peça reforça o posicionamento e comunica valor claramente.",
    visualTone: "Profissional, coerente com a marca, claro na mensagem.",
    colorDirection: "Paleta de marca como base. Cor de destaque para CTAs e elementos de destaque.",
    typographyDirection: "Tipografia da marca. Hierarquia visual clara em todas as peças.",
    imageryDirection: "Produto ou serviço em primeiro plano. Ambiente real da marca. Pessoas reais quando possível.",
    brandConsistencyRules: [
      "Paleta de cores da marca respeitada integralmente",
      "Logo com zona de exclusão correta em todas as peças",
      "Tom de voz visual alinhado com brand voice definido",
      "Consistência de filtro/edição em todo o feed",
    ],
    productionNotes: [
      "Definir manual de edição básico antes do início da produção",
      "Template base para posts recorrentes economiza tempo de produção",
    ],
    styleModifiers: ["professional photography", "brand consistent", "clear composition", "natural light"],
    colorPalette: ["brand primary", "brand secondary", "neutral background", "contrast accent"],
    mood: "profissional, coerente, confiável",
    getBriefVisualConcept: (t) => `Visual de marca — ${t.title.toLowerCase()} com identidade consistente.`,
    getAssetDimensions: (f) => f === "story" || f === "reel_thumbnail" ? "1080×1920" : "1080×1080",
  },
];

function getDesignProfile(segment: string): DesignSegmentProfile {
  return DESIGN_PROFILES.find((p) => p.match.test(segment)) ?? DESIGN_PROFILES[DESIGN_PROFILES.length - 1];
}

// ── Creative Brief builder ────────────────────────────────────────────────────

function buildCreativeBriefs(
  themes: ContentTheme[],
  profile: DesignSegmentProfile,
): CreativeBrief[] {
  return themes.slice(0, 6).map((theme, i) => {
    const brief: CreativeBrief = {
      id: `brief_${i + 1}`,
      themeId: theme.id,
      themeTitle: theme.title,
      pillar: theme.pillar,
      format: theme.format,
      channel: theme.channel,
      objective: theme.objective,
      visualConcept: profile.getBriefVisualConcept(theme),
      keyMessage: `${theme.title} — comunica ${theme.objective.toLowerCase()}`,
      toneOfVoice: profile.visualTone,
      doList: [
        `Manter ${profile.colorDirection.split(".")[0].toLowerCase()}`,
        `Seguir direção: ${profile.imageryDirection.split(".")[0].toLowerCase()}`,
        `Formato ${theme.format}: ${profile.getAssetDimensions(theme.format)}`,
      ],
      dontList: profile.brandConsistencyRules.slice(0, 2).map((r) => `Não: ${r.toLowerCase()}`),
      referenceStyle: profile.styleModifiers.slice(0, 3).join(", "),
    };
    return brief;
  });
}

// ── Image Prompt Spec builder ─────────────────────────────────────────────────

function buildImagePromptSpecs(
  briefs: CreativeBrief[],
  profile: DesignSegmentProfile,
  clientName: string,
): ImagePromptSpec[] {
  const formatAspect: Record<string, "1:1" | "9:16" | "4:5" | "16:9"> = {
    post:           "1:1",
    carrossel:      "1:1",
    carrossel_slide: "1:1",
    story:          "9:16",
    reel:           "9:16",
    reel_thumbnail: "9:16",
    destaque:       "1:1",
    cover:          "16:9",
  };

  return briefs.slice(0, 4).map((brief, i) => ({
    id: `prompt_${i + 1}`,
    briefId: brief.id,
    promptPrimary: `${brief.visualConcept}, ${profile.styleModifiers.join(", ")}, ${profile.colorPalette.join(" and ")} tones, high quality, professional result`,
    promptNegative: "blurry, low quality, pixelated, amateur, bad lighting, overexposed, text overlay, watermark, logo",
    aspectRatio: formatAspect[brief.format] ?? "1:1",
    styleModifiers: profile.styleModifiers,
    colorPalette: profile.colorPalette,
    subject: `${brief.themeTitle} — ${clientName}`,
    mood: profile.mood,
  }));
}

// ── Visual Asset Requirements builder ────────────────────────────────────────

function buildAssetRequirements(
  briefs: CreativeBrief[],
  profile: DesignSegmentProfile,
): VisualAssetRequirement[] {
  const assetTypeMap: Record<string, DesignAssetRequirement["assetType"]> = {
    post:      "post_feed",
    carrossel: "carrossel_slide",
    story:     "story",
    reel:      "reel_thumbnail",
    destaque:  "highlight_cover",
  };

  type DesignAssetRequirement = VisualAssetRequirement;

  const requirements: VisualAssetRequirement[] = briefs.map((brief, i) => ({
    id: `asset_${i + 1}`,
    assetType: assetTypeMap[brief.format] ?? "post_feed",
    format: brief.format,
    channel: brief.channel,
    dimensions: profile.getAssetDimensions(brief.format),
    themeId: brief.themeId,
    status: "pending" as const,
    priority: i < 2 ? "alta" : i < 4 ? "media" : "baixa",
  }));

  // Always include story versions of priority posts
  const storyVariants: VisualAssetRequirement[] = briefs.slice(0, 2).map((brief, i) => ({
    id: `asset_story_${i + 1}`,
    assetType: "story" as const,
    format: "story",
    channel: brief.channel,
    dimensions: "1080×1920",
    themeId: brief.themeId,
    status: "pending" as const,
    priority: "media" as const,
  }));

  return [...requirements, ...storyVariants];
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

function buildDesignFlowTrace(
  socialCanvas: SocialCanvas,
  profile: DesignSegmentProfile,
): DesignFlowStep[] {
  return DIOLI_COGNITIVE_FLOW.map((step) => {
    let summary = "";
    switch (step.id) {
      case "intention":    summary = `Design para: ${socialCanvas.contentObjective}`;                           break;
      case "context":      summary = `Segmento: ${socialCanvas.segment} — ${socialCanvas.clientName}`;         break;
      case "certainty":    summary = `Social Canvas aprovado: ${socialCanvas.contentTerritories.length} territórios`;  break;
      case "unknowns":     summary = "Verificados: brand assets, budget de produção, ferramentas disponíveis";  break;
      case "routing":      summary = "Rota: Design → produção visual → aprovação → entrega";                   break;
      case "permission":   summary = "Permissões: SocialCanvas aprovado presente — Design autorizado";          break;
      case "brand":        summary = `Direção visual: ${profile.visualConcept.slice(0, 60)}...`;                break;
      case "objective":    summary = `Meta visual: ${socialCanvas.successIndicators[0] ?? "Consistência e impacto"}`;  break;
      case "risk":         summary = profile.brandConsistencyRules[0] ?? "Riscos mapeados";                     break;
      case "approval":     summary = "Aguarda aprovação humana do Design Canvas";                               break;
      case "training":     summary = "Aprovações e rejeições alimentam base de treinamento de design";          break;
      case "measurement":  summary = "Métricas: aprovação de 1ª rodada, tempo de produção, consistência visual"; break;
      default:             summary = `${step.label} — concluído`;
    }
    return {
      stepId:    step.id,
      order:     step.order,
      label:     step.label,
      completed: true,
      summary,
    };
  });
}

// ── Main Engine ───────────────────────────────────────────────────────────────

export function generateDesignCanvas(input: DesignEngineInput): DesignCanvas {
  const { socialCanvas, requestId, source = "simulation" } = input;
  const profile = getDesignProfile(socialCanvas.segment);

  const themes: ContentTheme[] = socialCanvas.contentPlan.themes;
  const creativeBriefs = buildCreativeBriefs(themes, profile);
  const imagePromptSpecs = buildImagePromptSpecs(creativeBriefs, profile, socialCanvas.clientName);
  const assetRequirements = buildAssetRequirements(creativeBriefs, profile);
  const cognitiveFlowTrace = buildDesignFlowTrace(socialCanvas, profile);

  const priorityAssetIds = assetRequirements
    .filter((a) => a.priority === "alta")
    .map((a) => a.id);

  const partial: Omit<DesignCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source"> = {
    socialCanvasId:   socialCanvas.id,
    strategyCanvasId: socialCanvas.strategyCanvasId,
    requestId:        requestId ?? socialCanvas.requestId,
    clientName:       socialCanvas.clientName,
    segment:          socialCanvas.segment,
    reviewedAt:       undefined,
    reviewNote:       undefined,

    visualConcept:       profile.visualConcept,
    visualTone:          profile.visualTone,
    colorDirection:      profile.colorDirection,
    typographyDirection: profile.typographyDirection,
    imageryDirection:    profile.imageryDirection,
    brandConsistencyRules: profile.brandConsistencyRules,

    creativeBriefs,
    imagePromptSpecs,
    assetRequirements,

    totalAssetsRequired: assetRequirements.length,
    priorityAssetIds,
    productionNotes: profile.productionNotes,
  };

  const qualityGateResult = runDesignQualityGate(partial);

  return {
    ...partial,
    id:     `dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    status: "draft",
    createdAt: new Date().toISOString(),
    qualityGateResult,
    cognitiveFlowTrace,
  };
}

// Re-export for convenience
export type { ContentTheme };
