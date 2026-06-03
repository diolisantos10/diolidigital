import type { Project, Client, StrategyRoom } from "@/lib/agency/mock-data";
import type { AgentClientContext } from "@/lib/agency/workspace";

// ─── Ads Agent V1 ──────────────────────────────────────────────────────────────
//
// Planning + campaign architecture layer for the Paid Traffic department.
// Rule-based / mock generation — NO Meta Ads API, NO Google Ads API,
// NO real campaigns, NO metrics, NO auto-publishing.
//
// Consumes: Brand Brain, Strategy Room synthesis (when available),
// project objective, proposal scope, and selected services.
// ─────────────────────────────────────────────────────────────────────────────

export type AdsPlatform = "Meta Ads" | "Google Ads" | "Meta Ads + Google Ads";

export interface AdsFunnelStage {
  stage: string;          // "Topo (Awareness)" etc.
  goal: string;
  platforms: string;
  formats: string[];
}

export interface AdsAudienceSegment {
  name: string;
  type: "fria" | "morna" | "quente";
  description: string;
  targeting: string;
}

export interface AdsCopyIdea {
  angle: string;
  headline: string;
  primaryText: string;
  cta: string;
}

export interface AdsCreativeRequirement {
  asset: string;
  format: string;
  spec: string;
  direction: string;
}

export interface AdsPlan {
  projectId: string;
  clientId: string;
  generatedAt: string;
  usedStrategyRoom: boolean;
  brandBrainReadiness: number;

  // Strategy
  campaignObjective: string;
  platform: AdsPlatform;
  platformRationale: string;
  offerAngle: string;
  budgetSuggestion: string;
  budgetRationale: string;

  // Structure
  funnel: AdsFunnelStage[];

  // Audience
  audienceStrategy: string;
  audienceSegments: AdsAudienceSegment[];

  // Copy
  adCopyIdeas: AdsCopyIdea[];

  // Creative
  creativeRequirements: AdsCreativeRequirement[];

  // Optimization
  campaignRisks: string[];
  optimizationSuggestions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function channelsText(client: Client, ctx: AgentClientContext | null): string {
  return (client.brandBrain?.preferredChannels ?? ctx?.currentChannels ?? "").toLowerCase();
}

function pickPlatform(client: Client, ctx: AgentClientContext | null): { platform: AdsPlatform; rationale: string } {
  const ch = channelsText(client, ctx);
  const hasMeta = /instagram|facebook|meta|whatsapp|reels/.test(ch);
  const hasGoogle = /google|search|seo|youtube|site|pesquisa/.test(ch);

  if (hasMeta && hasGoogle) {
    return {
      platform: "Meta Ads + Google Ads",
      rationale: "Marca com presença social forte e intenção de busca. Meta cobre descoberta e desejo; Google captura demanda já existente. Combinação cobre o funil completo.",
    };
  }
  if (hasGoogle && !hasMeta) {
    return {
      platform: "Google Ads",
      rationale: "Público com comportamento de busca ativa. Google Search + Performance Max captura intenção de alta conversão antes de investir em geração de demanda.",
    };
  }
  return {
    platform: "Meta Ads",
    rationale: "Público concentrado em Instagram/Facebook. Meta Ads é o canal ideal para gerar demanda, alcance e engajamento com criativos nativos.",
  };
}

function firstClause(text: string | undefined, max = 110): string {
  if (!text) return "";
  const clause = text.split(/[.;\n]/)[0].trim();
  return clause.length > max ? clause.slice(0, max) + "…" : clause;
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildFunnel(platform: AdsPlatform): AdsFunnelStage[] {
  const meta = platform.includes("Meta");
  const google = platform.includes("Google");
  const metaLabel = "Meta Ads";
  const googleLabel = "Google Ads";

  return [
    {
      stage: "Topo · Awareness",
      goal: "Gerar alcance qualificado e apresentar a marca ao público frio.",
      platforms: meta ? metaLabel : googleLabel,
      formats: meta ? ["Reels (vídeo curto)", "Carrossel", "Stories"] : ["YouTube (in-stream)", "Display responsivo"],
    },
    {
      stage: "Meio · Consideração",
      goal: "Engajar quem demonstrou interesse e construir desejo pela oferta.",
      platforms: platform,
      formats: ["Vídeo de prova social", "Carrossel de benefícios", ...(google ? ["Search — termos de marca"] : [])],
    },
    {
      stage: "Fundo · Conversão",
      goal: "Converter público morno/quente em lead ou venda direta.",
      platforms: google ? googleLabel + (meta ? " + " + metaLabel : "") : metaLabel,
      formats: ["Retargeting (visitantes + engajamento)", ...(google ? ["Search — alta intenção", "Performance Max"] : ["Anúncio de conversão direta"])],
    },
  ];
}

function buildAudience(client: Client, ctx: AgentClientContext | null): { strategy: string; segments: AdsAudienceSegment[] } {
  const audience = client.brandBrain?.targetAudience ?? ctx?.targetAudience ?? "público-alvo do projeto";
  const audienceShort = firstClause(audience, 90);

  return {
    strategy: `Estratégia de audiência em camadas para ${client.name}: começar com público frio amplo baseado em interesses (${audienceShort}), capturar engajamento e construir públicos personalizados, depois escalar com lookalikes a partir dos melhores conversores. Retargeting contínuo no fundo de funil.`,
    segments: [
      {
        name: "Frio · Interesses",
        type: "fria",
        description: `Público novo que combina com o perfil: ${audienceShort}.`,
        targeting: "Segmentação por interesses, comportamentos e demografia. Audiência ampla para o algoritmo otimizar.",
      },
      {
        name: "Frio · Lookalike",
        type: "fria",
        description: "Semelhantes aos melhores clientes/engajadores existentes.",
        targeting: "Lookalike 1–3% a partir de lista de clientes ou pixel de conversão (quando disponível).",
      },
      {
        name: "Morno · Engajamento",
        type: "morna",
        description: "Quem interagiu com o conteúdo orgânico ou anúncios nos últimos 30 dias.",
        targeting: "Engajamento no perfil, visualizações de vídeo (50%+), cliques no anúncio.",
      },
      {
        name: "Quente · Retargeting",
        type: "quente",
        description: "Visitantes do site e leads que não converteram.",
        targeting: "Visitantes 7/14/30 dias, abandono de checkout/formulário, leads sem fechamento.",
      },
    ],
  };
}

function buildCopyIdeas(client: Client, offerAngle: string): AdsCopyIdea[] {
  const brand = client.name;
  const tone = firstClause(client.brandBrain?.toneOfVoice, 60);
  return [
    {
      angle: "Autoridade",
      headline: `${brand}: resultado sério, sem complicação`,
      primaryText: `Sua marca merece execução de alto nível. ${tone ? `Tom: ${tone}.` : ""} Mostramos como ${brand} entrega consistência onde outros prometem.`,
      cta: "Saiba mais",
    },
    {
      angle: "Dor → Solução",
      headline: "Cansado de marketing que não converte?",
      primaryText: `Pare de gastar com ações soltas. ${offerAngle} Estrutura, estratégia e execução em um só lugar.`,
      cta: "Quero saber",
    },
    {
      angle: "Prova Social",
      headline: "Marcas que já confiam no processo",
      primaryText: `Veja como negócios reais cresceram com ${brand}. Sem promessa vazia — só método e entrega.`,
      cta: "Ver cases",
    },
    {
      angle: "Oferta Direta",
      headline: "Vagas limitadas para novos clientes",
      primaryText: `${offerAngle} Comece agora com diagnóstico gratuito e plano sob medida.`,
      cta: "Falar no WhatsApp",
    },
  ];
}

function buildCreativeRequirements(client: Client): AdsCreativeRequirement[] {
  const visual = firstClause(client.brandBrain?.visualStyle, 80) || "identidade visual da marca";
  return [
    {
      asset: "Vídeo Reels / Topo",
      format: "9:16 · 15–30s",
      spec: "Vídeo vertical, hook nos primeiros 3s, legendas embutidas.",
      direction: `Estilo ${visual}. Ritmo dinâmico, foco em uma única mensagem por vídeo.`,
    },
    {
      asset: "Carrossel de Benefícios",
      format: "4:5 · 4–6 cards",
      spec: "Sequência lógica, 1 ideia por card, CTA no último.",
      direction: `Fiel ao Brand Brain (${visual}). Tipografia forte, espaço em branco generoso.`,
    },
    {
      asset: "Criativo de Conversão",
      format: "1:1 e 4:5",
      spec: "Imagem estática com oferta clara e CTA em destaque.",
      direction: "Alto contraste, CTA é o herói visual. Deve funcionar em tamanho thumbnail.",
    },
    {
      asset: "Stories Retargeting",
      format: "9:16 · estático/animado",
      spec: "Mensagem de urgência ou prova social, swipe-up/link sticker.",
      direction: "Direto e pessoal, tom de continuidade com quem já conhece a marca.",
    },
  ];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function generateAdsPlan(
  project: Project,
  client: Client,
  strategyRoom?: StrategyRoom | null,
  ctx?: AgentClientContext | null
): AdsPlan {
  const { platform, rationale } = pickPlatform(client, ctx ?? null);
  const synthesis = strategyRoom?.finalSynthesis;
  const usedStrategyRoom = !!synthesis;

  const objectiveBase = project.goal || project.proposal?.objective || "crescimento e geração de demanda";
  const campaignObjective = usedStrategyRoom
    ? `Suportar a estratégia definida no Strategy Room: ${firstClause(synthesis!.recommendedStrategy, 130)}. Traduzir o posicionamento em demanda mensurável via tráfego pago.`
    : `Gerar demanda qualificada e leads para "${project.name}", apoiando o objetivo do projeto: ${firstClause(objectiveBase, 130)}.`;

  const offerAngle = client.brandBrain?.positioning
    ? `Posicionamento como ângulo central: ${firstClause(client.brandBrain.positioning, 120)}.`
    : `Oferta principal alinhada ao escopo: ${firstClause(project.proposal?.scope ?? objectiveBase, 110)}.`;

  const isLaunch = /lançamento|launch|lançar/i.test(project.name + " " + objectiveBase);
  const budgetSuggestion = isLaunch ? "R$ 3.000 – R$ 6.000 / mês (fase inicial)" : "R$ 5.000 – R$ 10.000 / mês";
  const budgetRationale = isLaunch
    ? "Budget enxuto na fase de lançamento: 60% topo (awareness), 25% meio, 15% retargeting. Escalar após validar criativos."
    : "Distribuição 50% topo / 30% meio / 20% fundo. Reservar 15% para testes de criativo contínuos.";

  const funnel = buildFunnel(platform);
  const { strategy: audienceStrategy, segments: audienceSegments } = buildAudience(client, ctx ?? null);
  const adCopyIdeas = buildCopyIdeas(client, offerAngle);
  const creativeRequirements = buildCreativeRequirements(client);

  const campaignRisks = [
    "Escalar budget antes de validar criativos vencedores aumenta o CPA.",
    platform.includes("Meta") ? "Sem pixel/Conversions API instalado, o retargeting e a otimização ficam limitados." : "Sem conversão configurada no Google Ads, o lance inteligente não tem sinal.",
    "Públicos muito restritos no início travam o aprendizado do algoritmo.",
    ...(usedStrategyRoom ? [] : ["Strategy Room não gerado — ângulos de campanha baseados apenas no Brand Brain."]),
  ];

  const optimizationSuggestions = [
    "Rodar 3–4 criativos por conjunto e cortar os de pior CTR após 3–5 dias.",
    "Mover budget para os conjuntos com melhor custo por resultado a cada 48–72h.",
    "Renovar criativos a cada 2–3 semanas para combater fadiga de anúncio.",
    "Instalar e validar pixel/eventos antes de ativar campanhas de conversão.",
    ...(platform.includes("Google") ? ["Refinar termos de busca negativos semanalmente para proteger o orçamento."] : []),
  ];

  return {
    projectId: project.id,
    clientId: client.id,
    generatedAt: new Date().toISOString(),
    usedStrategyRoom,
    brandBrainReadiness: ctx?.brandBrainReadiness ?? 0,
    campaignObjective,
    platform,
    platformRationale: rationale,
    offerAngle,
    budgetSuggestion,
    budgetRationale,
    funnel,
    audienceStrategy,
    audienceSegments,
    adCopyIdeas,
    creativeRequirements,
    campaignRisks,
    optimizationSuggestions,
  };
}

// ─── Grouped deliverables ─────────────────────────────────────────────────────
//
// Maps the plan to the six grouped deliverables required by the spec.
// All saved with status "in_review" so the client can approve them in the portal.

export const ADS_DELIVERABLE_TYPES = [
  "Ads Strategy",
  "Campaign Structure",
  "Audience Plan",
  "Ad Copy",
  "Creative Requirements",
  "Optimization Notes",
] as const;

export type AdsDeliverableType = (typeof ADS_DELIVERABLE_TYPES)[number];

export interface AdsDeliverableDraft {
  type: AdsDeliverableType;
  name: string;
  summary: string;
}

export function buildAdsDeliverables(plan: AdsPlan, projectName: string): AdsDeliverableDraft[] {
  return [
    {
      type: "Ads Strategy",
      name: `Estratégia de Ads — ${projectName}`,
      summary: `Objetivo: ${plan.campaignObjective} · Plataforma: ${plan.platform}.`,
    },
    {
      type: "Campaign Structure",
      name: `Estrutura de Campanha — ${projectName}`,
      summary: `Funil em ${plan.funnel.length} etapas (${plan.funnel.map((f) => f.stage.split(" ")[0]).join(" → ")}). Budget: ${plan.budgetSuggestion}.`,
    },
    {
      type: "Audience Plan",
      name: `Plano de Audiência — ${projectName}`,
      summary: `${plan.audienceSegments.length} segmentos (frio → quente). ${firstClause(plan.audienceStrategy, 90)}.`,
    },
    {
      type: "Ad Copy",
      name: `Ideias de Copy — ${projectName}`,
      summary: `${plan.adCopyIdeas.length} ângulos: ${plan.adCopyIdeas.map((c) => c.angle).join(", ")}.`,
    },
    {
      type: "Creative Requirements",
      name: `Requisitos de Criativo — ${projectName}`,
      summary: `${plan.creativeRequirements.length} formatos: ${plan.creativeRequirements.map((c) => c.asset.split(" ")[0]).join(", ")}.`,
    },
    {
      type: "Optimization Notes",
      name: `Notas de Otimização — ${projectName}`,
      summary: `${plan.optimizationSuggestions.length} recomendações + ${plan.campaignRisks.length} riscos mapeados.`,
    },
  ];
}
