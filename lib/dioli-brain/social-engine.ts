// Dioli Brain — Social Engine
// Transforms an approved StrategyCanvas into a SocialCanvas with ContentPlan
// and EditorialCalendar. Reasons through DIOLI_COGNITIVE_FLOW — every canvas
// carries the flow trace. Rule-based engine: segment-aware heuristics, no
// external AI calls.
//
// Dioli Standard: Brain → Strategy → Social → Quality → Evidence → Training.
// Social never produces output without a Strategy input.

import { DIOLI_COGNITIVE_FLOW } from "./cognitive-flow";
import type { BrainReasoningOutput } from "@/lib/agency/sdr-agent";
import type { StrategyCanvas } from "./strategy-canvas";
import {
  runSocialQualityGate,
  type ContentPlan,
  type ContentPlanWeek,
  type ContentTerritory,
  type ContentTheme,
  type EditorialCalendar,
  type EditorialCalendarEntry,
  type EditorialPillar,
  type SocialCanvas,
  type SocialContentFormat,
  type SocialFlowStep,
} from "./social-canvas";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface SocialEngineInput {
  strategyCanvas: StrategyCanvas;              // required — Social never runs without Strategy
  brainReasoning?: BrainReasoningOutput;       // SDR handoff artifact (inherited via Strategy)
  requestId?: string;
  source?: "request" | "simulation";
}

// ── Segment social profiles (knowledge base heuristics) ───────────────────────
// Order matters: more specific profiles (premium) must come before generic ones.

interface SocialSegmentProfile {
  match: RegExp;
  contentRole: string;
  frequency: string;
  formats: SocialContentFormat[];
  pillars: Array<{ name: string; objective: string; frequency: string; priority: number }>;
  publishingRecommendations: string[];
  successIndicators: string[];
  campaignSupport: string[];
  contentRisks: string[];
}

const SOCIAL_PROFILES: SocialSegmentProfile[] = [
  {
    match: /premium|fine|alta gastronomia|sofisticad|luxo|exclusiv/i,
    contentRole: "O conteúdo constrói prestígio e desejo — cada peça reforça a percepção premium e justifica o ticket.",
    frequency: "3x por semana (qualidade acima de volume)",
    formats: ["post", "reel", "story"],
    pillars: [
      { name: "Experiência",  objective: "Mostrar a experiência completa — ambiente, serviço, ocasião.", frequency: "1x por semana", priority: 1 },
      { name: "Autoria",      objective: "Construir o prestígio do chef e da curadoria da casa.",        frequency: "1x por semana", priority: 2 },
      { name: "Celebrações",  objective: "Capturar reservas de datas e ocasiões especiais.",             frequency: "1x por semana", priority: 3 },
    ],
    publishingRecommendations: [
      "Publicar em horários de planejamento de jantar (17h–19h)",
      "Produção fotográfica profissional obrigatória — nunca foto amadora",
      "Stories de bastidores apenas com estética controlada",
    ],
    successIndicators: ["Reservas originadas do Instagram", "Crescimento de seguidores qualificados", "Salvamentos e compartilhamentos por post"],
    campaignSupport: ["Conteúdo de datas comemorativas antecipa campanhas de reserva", "Peças de autoria alimentam parcerias e imprensa"],
    contentRisks: ["Promoções agressivas destroem percepção premium", "Frequência alta com produção fraca rebaixa a marca"],
  },
  {
    match: /restaurante|sushi|pizza|hamburgue|fast\s*food|caf[eé]\b|bar\b|lanchon|padaria|pastelaria|a[çc]a[íi]|churrascaria|gastronomia/i,
    contentRole: "O conteúdo é a vitrine diária — desperta apetite, lembra o cliente da casa e converte em pedido direto.",
    frequency: "5x por semana + stories diários",
    formats: ["post", "reel", "story", "carrossel"],
    pillars: [
      { name: "Apetite",      objective: "Comida em primeiro plano — gerar desejo imediato.",           frequency: "3x por semana", priority: 1 },
      { name: "Proximidade",  objective: "Equipe, história e bastidores — criar vínculo local.",        frequency: "1x por semana", priority: 2 },
      { name: "Oferta",       objective: "Promoções da semana com urgência leve.",                      frequency: "1x por semana", priority: 3 },
    ],
    publishingRecommendations: [
      "Publicar antes dos horários de refeição (11h e 18h)",
      "Stories diários do prato do dia direcionando para pedido via WhatsApp",
      "Reels de preparo têm o maior alcance orgânico do segmento",
    ],
    successIndicators: ["Pedidos diretos via WhatsApp/Instagram", "Alcance local dos reels", "Movimento em dias fracos após promoção"],
    campaignSupport: ["Conteúdo orgânico validado vira criativo de mídia paga local", "Promoções de dias fracos sustentam campanhas de tráfego"],
    contentRisks: ["Fotos amadoras rebaixam percepção de qualidade", "Inconsistência de postagem derruba alcance rapidamente"],
  },
  {
    match: /e-?commerce|loja\s*(online|virtual)|marketplace|dropship/i,
    contentRole: "O conteúdo alimenta o funil — topo orgânico, prova social no meio e CTA de conversão no fundo.",
    frequency: "5x por semana",
    formats: ["post", "carrossel", "reel", "story"],
    pillars: [
      { name: "Produto",       objective: "Produto em uso real — contexto e benefício.",                  frequency: "2x por semana", priority: 1 },
      { name: "Prova Social",  objective: "Reviews e clientes reais — reduzir fricção de compra.",        frequency: "1x por semana", priority: 2 },
      { name: "Educação",      objective: "Conteúdo educativo da categoria — atrair topo de funil.",      frequency: "1x por semana", priority: 3 },
      { name: "Oferta",        objective: "Lançamentos e ofertas com CTA direto.",                        frequency: "1x por semana", priority: 4 },
    ],
    publishingRecommendations: [
      "Toda peça com CTA claro e link de compra acessível",
      "Carrosséis de prova social antes de datas de oferta",
      "Reels de produto em uso alimentam remarketing",
    ],
    successIndicators: ["Cliques no link / vendas atribuídas", "Taxa de salvamento de carrosséis", "Crescimento de base própria (e-mail/seguidores)"],
    campaignSupport: ["Conteúdo orgânico de melhor performance vira criativo de Meta Ads", "Calendário sincronizado com datas de oferta do e-commerce"],
    contentRisks: ["Excesso de oferta sem conteúdo de valor cansa a audiência", "Margem comprimida limita produção — priorizar formatos reaproveitáveis"],
  },
  {
    match: /cl[íi]nica|consult[óo]rio|dent|m[ée]dic|est[ée]tica(?!\s+capilar)|fisio|psico|sa[úu]de/i,
    contentRole: "O conteúdo constrói autoridade e confiança — educa o paciente antes da decisão de agendar.",
    frequency: "4x por semana",
    formats: ["post", "carrossel", "reel"],
    pillars: [
      { name: "Educação",    objective: "Conteúdo educativo em saúde — posicionar como referência.",      frequency: "2x por semana", priority: 1 },
      { name: "Autoridade",  objective: "Equipe e especialistas — humanizar e dar rosto à confiança.",    frequency: "1x por semana", priority: 2 },
      { name: "Estrutura",   objective: "Clínica, tecnologia e processo — reduzir ansiedade do paciente.", frequency: "1x por semana", priority: 3 },
    ],
    publishingRecommendations: [
      "Respeitar restrições éticas de publicidade da categoria em toda peça",
      "Carrosséis educativos de dúvidas frequentes têm maior salvamento",
      "Nunca prometer resultado — comunicar processo e cuidado",
    ],
    successIndicators: ["Agendamentos originados do Instagram/WhatsApp", "Salvamentos de conteúdo educativo", "Crescimento de seguidores locais"],
    campaignSupport: ["Conteúdo educativo aprovado alimenta campanhas locais de agendamento", "Reviews no Google reforçados por conteúdo de equipe"],
    contentRisks: ["Publicidade fora das normas éticas gera risco legal", "Antes/depois sem consentimento e fora da ética é vetado"],
  },
  {
    match: /academia|gym|crossfit|fitness|personal|pilates|trein/i,
    contentRole: "O conteúdo prova resultado e cria pertencimento — transformações reais são o motor de matrícula.",
    frequency: "5x por semana + stories diários",
    formats: ["reel", "story", "post", "carrossel"],
    pillars: [
      { name: "Transformação", objective: "Resultados reais de alunos — prova social de conversão.",     frequency: "1x por semana", priority: 1 },
      { name: "Treino",        objective: "Treino do dia e dicas técnicas — valor constante.",           frequency: "2x por semana", priority: 2 },
      { name: "Comunidade",    objective: "Eventos, desafios e cultura — criar pertencimento.",          frequency: "2x por semana", priority: 3 },
    ],
    publishingRecommendations: [
      "Vídeo curto como formato principal — reels têm o maior alcance do segmento",
      "Transformações sempre com autorização do aluno",
      "Stories diários de treino mantêm a marca presente",
    ],
    successIndicators: ["Matrículas originadas do digital", "Alcance de reels de transformação", "Retenção/churn mensal de alunos"],
    campaignSupport: ["Transformações viram criativos de campanhas de matrícula", "Desafios sazonais sustentam campanhas fora de pico"],
    contentRisks: ["Comparação por preço se o conteúdo não construir valor", "Conteúdo genérico de treino não diferencia da concorrência"],
  },
  {
    match: /sal[ãa]o|beleza|barbearia|cabelo|est[ée]tica capilar|manicure|sobrancelha|make/i,
    contentRole: "O conteúdo é o portfólio vivo — antes/depois converte direto em agendamento.",
    frequency: "5x por semana + stories diários",
    formats: ["post", "reel", "story", "carrossel"],
    pillars: [
      { name: "Portfólio",    objective: "Antes/depois como formato âncora de conversão.",               frequency: "2x por semana", priority: 1 },
      { name: "Tendências",   objective: "Técnicas e tendências — posicionar especialização.",           frequency: "1x por semana", priority: 2 },
      { name: "Rotina",       objective: "Rotina do salão e autocuidado — proximidade e frequência.",    frequency: "2x por semana", priority: 3 },
    ],
    publishingRecommendations: [
      "Padrão visual consistente em todos os antes/depois (luz, ângulo, fundo)",
      "Facilitar agendamento em toda peça (link/WhatsApp)",
      "Horários ociosos viram ofertas relâmpago nos stories",
    ],
    successIndicators: ["Agendamentos via Instagram/WhatsApp", "Alcance de antes/depois", "Ocupação de horários fracos"],
    campaignSupport: ["Antes/depois de melhor performance viram criativos de campanha local", "Ofertas de horário ocioso sustentam promoções pagas"],
    contentRisks: ["Fotos sem padrão visual rebaixam percepção do trabalho", "Não responder WhatsApp rápido perde o agendamento gerado"],
  },
  {
    match: /consultoria|advocacia|contabil|engenharia|arquitet|imobili[áa]ri|seguro|agência|freelanc|servi[çc]o/i,
    contentRole: "O conteúdo demonstra competência antes da contratação — autoridade educativa encurta o ciclo de decisão.",
    frequency: "3x por semana",
    formats: ["carrossel", "post", "reel"],
    pillars: [
      { name: "Autoridade",   objective: "Conteúdo educativo de nicho — educar antes de vender.",        frequency: "2x por semana", priority: 1 },
      { name: "Casos",        objective: "Resultados e casos documentados — prova de competência.",      frequency: "1x por semana", priority: 2 },
      { name: "Metodologia",  objective: "Processo e bastidores — diferenciar pelo método.",             frequency: "quinzenal",     priority: 3 },
    ],
    publishingRecommendations: [
      "Carrosséis educativos são o formato de maior salvamento do segmento",
      "LinkedIn recebe versão adaptada do conteúdo de autoridade",
      "Consistência por meses antes do retorno — ciclo de decisão é longo",
    ],
    successIndicators: ["Leads inbound qualificados", "Salvamentos e compartilhamentos de conteúdo educativo", "Reuniões originadas do digital"],
    campaignSupport: ["Conteúdo de autoridade aquece públicos para campanhas de lead", "Casos documentados alimentam remarketing"],
    contentRisks: ["Conteúdo genérico não diferencia de concorrentes", "Excesso de autopromoção sem valor educativo afasta decisores"],
  },
  {
    match: /educa[çc][ãa]o|escola|curso|faculdade|universidade|ensino|idioma|capacita/i,
    contentRole: "O conteúdo demonstra o método e o resultado do aluno — confiança dos pais/alunos decide a matrícula.",
    frequency: "4x por semana",
    formats: ["post", "carrossel", "reel", "story"],
    pillars: [
      { name: "Método",       objective: "Mostrar a metodologia e o diferencial pedagógico.",            frequency: "1x por semana", priority: 1 },
      { name: "Resultados",   objective: "Conquistas de alunos — prova social de matrícula.",            frequency: "1x por semana", priority: 2 },
      { name: "Vida Escolar", objective: "Rotina, eventos e comunidade — pertencimento.",                frequency: "2x por semana", priority: 3 },
    ],
    publishingRecommendations: [
      "Calendário sincronizado com períodos de matrícula e rematrícula",
      "Conteúdo de alunos sempre com autorização de imagem",
      "Carrosséis educativos para pais têm maior compartilhamento",
    ],
    successIndicators: ["Matrículas/leads originados do digital", "Engajamento de pais e alunos", "Crescimento de seguidores na região"],
    campaignSupport: ["Conteúdo de método e resultado alimenta campanhas de matrícula", "Eventos escolares geram picos de alcance orgânico"],
    contentRisks: ["Imagem de menores sem autorização gera risco legal", "Comunicação institucional fria não engaja pais"],
  },
];

const DEFAULT_SOCIAL_PROFILE: SocialSegmentProfile = {
  match: /.*/,
  contentRole: "O conteúdo constrói presença consistente e prova social — base para qualquer canal de aquisição.",
  frequency: "3x por semana",
  formats: ["post", "story", "reel"],
  pillars: [
    { name: "Produto/Serviço", objective: "Mostrar o que a marca entrega, com prova real.",         frequency: "2x por semana", priority: 1 },
    { name: "Bastidores",      objective: "Humanizar a marca e criar proximidade.",                 frequency: "1x por semana", priority: 2 },
  ],
  publishingRecommendations: [
    "Consistência e padrão visual antes de volume",
    "Toda peça com CTA simples (mensagem, link ou visita)",
  ],
  successIndicators: ["Contatos originados do digital", "Crescimento de alcance e seguidores"],
  campaignSupport: ["Conteúdo validado organicamente alimenta futuras campanhas pagas"],
  contentRisks: ["Comunicação genérica não constrói posicionamento"],
};

function resolveSocialProfile(segment: string, extra?: string): SocialSegmentProfile {
  const text = `${segment} ${extra ?? ""}`;
  return SOCIAL_PROFILES.find((p) => p.match.test(text)) ?? DEFAULT_SOCIAL_PROFILE;
}

// ── ID helper ─────────────────────────────────────────────────────────────────

const uid = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ── Content architecture builders ─────────────────────────────────────────────

function buildTerritories(strategy: StrategyCanvas): ContentTerritory[] {
  return strategy.contentTerritories.slice(0, 6).map((name, i) => ({
    id: uid("ct"),
    name,
    description: `Território herdado da estratégia aprovada de ${strategy.clientName}.`,
    importance: i < 2 ? "alta" : i < 4 ? "media" : "baixa",
    examples: [
      `Conteúdo recorrente sobre "${name.toLowerCase()}"`,
      `Série temática mensal dentro de "${name.toLowerCase()}"`,
    ],
  }));
}

function buildPillars(profile: SocialSegmentProfile): EditorialPillar[] {
  return profile.pillars.map((p) => ({
    id: uid("ep"),
    name: p.name,
    objective: p.objective,
    frequency: p.frequency,
    priority: p.priority,
  }));
}

const THEME_FORMAT_ROTATION: SocialContentFormat[] = ["post", "reel", "carrossel", "story"];

function buildThemes(
  territories: ContentTerritory[],
  pillars: EditorialPillar[],
  channels: string[],
  profile: SocialSegmentProfile,
): ContentTheme[] {
  const mainChannel = channels[0] ?? "Instagram";
  const themes: ContentTheme[] = [];
  // 2 themes per territory (capped at 8), rotating pillars and formats
  territories.slice(0, 4).forEach((territory, ti) => {
    for (let v = 0; v < 2; v++) {
      const pillar = pillars[(ti + v) % pillars.length];
      const format = profile.formats[(ti * 2 + v) % profile.formats.length]
        ?? THEME_FORMAT_ROTATION[(ti * 2 + v) % THEME_FORMAT_ROTATION.length];
      themes.push({
        id: uid("th"),
        title: v === 0
          ? `${territory.name} — apresentação`
          : `${territory.name} — série semanal`,
        pillar: pillar.name,
        objective: pillar.objective,
        format,
        channel: mainChannel,
      });
    }
  });
  return themes;
}

// ── Content Plan generator (Part 5) ───────────────────────────────────────────

export function generateContentPlan(
  themes: ContentTheme[],
  profile: SocialSegmentProfile,
  monthlyDirection: string,
  weeklyDirection: string[],
): ContentPlan {
  const weeks: ContentPlanWeek[] = ([1, 2, 3, 4] as const).map((week) => ({
    week,
    focus: weeklyDirection[week - 1] ?? "Manter consistência nos pilares definidos.",
    themeIds: themes.filter((_, i) => i % 4 === week - 1).map((t) => t.id),
  }));

  // Posts per week derived from declared frequency ("5x por semana" → 5)
  const perWeek = parseInt(profile.frequency.match(/(\d+)x/)?.[1] ?? "3", 10);
  const totalPosts = perWeek * 4;

  const byFormat = themes.reduce<Partial<Record<SocialContentFormat, number>>>((acc, t) => {
    acc[t.format] = (acc[t.format] ?? 0) + 1;
    return acc;
  }, {});

  return {
    monthLabel: "Mês 1",
    monthlyFocus: monthlyDirection,
    weeks,
    themes,
    formatRecommendations: Object.entries(byFormat).map(
      ([format, count]) => `${format}: ${count} tema(s) planejado(s)`
    ),
    publishingSuggestions: profile.publishingRecommendations,
    totalPosts,
  };
}

// ── Editorial Calendar generator (Part 8) ─────────────────────────────────────

const PUBLISH_DAYS = ["Segunda", "Quarta", "Sexta"];

export function generateEditorialCalendar(
  themes: ContentTheme[],
  plan: ContentPlan,
): EditorialCalendar {
  const entries: EditorialCalendarEntry[] = [];
  ([1, 2, 3, 4] as const).forEach((week) => {
    const weekThemes = themes.filter((t) => plan.weeks[week - 1]?.themeIds.includes(t.id));
    const pool = weekThemes.length > 0 ? weekThemes : themes;
    PUBLISH_DAYS.forEach((day, di) => {
      const theme = pool[di % pool.length];
      if (!theme) return;
      entries.push({
        id: uid("ec"),
        week,
        day,
        date: `Semana ${week} — ${day}`,
        theme: theme.title,
        pillar: theme.pillar,
        format: theme.format,
        channel: theme.channel,
        status: "planned",
      });
    });
  });
  return { monthLabel: plan.monthLabel, entries };
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

function buildFlowTrace(
  input: SocialEngineInput,
  profile: SocialSegmentProfile,
  themesCount: number,
): SocialFlowStep[] {
  const strategy = input.strategyCanvas;
  const summaries: Record<string, { completed: boolean; summary: string }> = {
    intention: {
      completed: true,
      summary: `Transformar a estratégia aprovada de ${strategy.clientName} em operação de conteúdo: ${strategy.mainObjective}`,
    },
    context: {
      completed: true,
      summary: `StrategyCanvas ${strategy.id} recebido (QG: ${strategy.qualityGateResult.overall}). Segmento: ${strategy.segment}. Perfil social aplicado da base de conhecimento.`,
    },
    certainty: {
      completed: true,
      summary: `Herdado da estratégia: público, posicionamento, ${strategy.contentTerritories.length} territórios e ${strategy.priorityChannels.length} canais validados.`,
    },
    unknowns: {
      completed: true,
      summary: input.brainReasoning?.unknownFacts.length
        ? `${input.brainReasoning.unknownFacts.length} incógnitas herdadas do pipeline: ${input.brainReasoning.unknownFacts.slice(0, 2).join("; ")}.`
        : "Performance real por formato ainda desconhecida — baseline será medida no Mês 1.",
    },
    routing: {
      completed: true,
      summary: "Execução dentro do escopo Social Media. Criativos finais de Design e campanhas de Tráfego são roteados aos respectivos departamentos.",
    },
    permission: {
      completed: true,
      summary: "Dentro do escopo: planejamento editorial e direção de conteúdo. Proibido: alterar posicionamento, estratégia, regras de marca ou o Brain.",
    },
    brand: {
      completed: true,
      summary: `Tom de voz herdado da direção de comunicação da estratégia: ${strategy.communicationDirection.split(".")[0]}.`,
    },
    objective: {
      completed: true,
      summary: `Objetivo de conteúdo derivado do objetivo estratégico: ${strategy.mainObjective}`,
    },
    risk: {
      completed: true,
      summary: `${profile.contentRisks.length} riscos de conteúdo mapeados para o segmento.`,
    },
    approval: {
      completed: true,
      summary: "Plano e calendário requerem aprovação humana antes de produção — FAIL no Quality Gate bloqueia aprovação.",
    },
    training: {
      completed: true,
      summary: "Aprovação/rejeição deste plano e resultados de performance alimentam o treinamento via BrainChangeRequest.",
    },
    measurement: {
      completed: true,
      summary: `Sucesso medido por: ${profile.successIndicators.slice(0, 2).join("; ")}. ${themesCount} temas planejados para o Mês 1.`,
    },
  };

  return DIOLI_COGNITIVE_FLOW.map((step) => ({
    stepId: step.id,
    order: step.order,
    label: step.label,
    completed: summaries[step.id]?.completed ?? false,
    summary: summaries[step.id]?.summary ?? "—",
  }));
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function generateSocialCanvas(input: SocialEngineInput): SocialCanvas {
  const strategy = input.strategyCanvas;
  const profile = resolveSocialProfile(strategy.segment, strategy.businessSummary);

  const territories = buildTerritories(strategy);
  const pillars     = buildPillars(profile);
  const channels    = strategy.priorityChannels.length > 0
    ? strategy.priorityChannels
    : ["Instagram"];
  const themes      = buildThemes(territories, pillars, channels, profile);

  const contentObjective =
    `Executar em conteúdo o objetivo estratégico de ${strategy.clientName}: ${strategy.mainObjective}`;

  const monthlyDirection =
    `Mês 1 — Fundação editorial: ativar os pilares ${pillars.map((p) => p.name).join(", ")} ` +
    `nos canais ${channels.slice(0, 2).join(" e ")}, com frequência de ${profile.frequency}. ` +
    `Medir baseline de alcance e engajamento por formato.`;

  const weeklyDirection = [
    `Semana 1 — Apresentação dos territórios prioritários: ${territories.slice(0, 2).map((t) => t.name).join(" e ")}.`,
    `Semana 2 — Consolidar o pilar ${pillars[0]?.name ?? "principal"} com a série semanal.`,
    `Semana 3 — Ativar prova social e ${pillars[1]?.name?.toLowerCase() ?? "proximidade"} para engajamento.`,
    `Semana 4 — Revisar performance da primeira quinzena e dobrar no formato de melhor resultado.`,
  ];

  const contentPlan       = generateContentPlan(themes, profile, monthlyDirection, weeklyDirection);
  const editorialCalendar = generateEditorialCalendar(themes, contentPlan);

  const base = {
    requestId: input.requestId ?? strategy.requestId,
    strategyCanvasId: strategy.id,
    clientName: strategy.clientName,
    segment: strategy.segment,
    contentObjective,
    contentRole: profile.contentRole,
    targetAudience: strategy.audience,
    communicationDirection: strategy.communicationDirection,
    contentTerritories: territories,
    editorialPillars: pillars,
    recommendedFrequency: profile.frequency,
    recommendedFormats: profile.formats,
    priorityChannels: channels,
    campaignSupport: profile.campaignSupport,
    contentOpportunities: strategy.opportunities.slice(0, 4),
    contentRisks: [...profile.contentRisks, ...strategy.risks.slice(0, 2)].slice(0, 5),
    monthlyDirection,
    weeklyDirection,
    contentThemes: themes,
    publishingRecommendations: profile.publishingRecommendations,
    successIndicators: profile.successIndicators,
    contentPlan,
    editorialCalendar,
    reviewedAt: undefined,
    reviewNote: undefined,
  };

  const qualityGateResult  = runSocialQualityGate(base);
  const cognitiveFlowTrace = buildFlowTrace(input, profile, themes.length);

  return {
    id: uid("soc"),
    source: input.source ?? "request",
    status: "draft",
    createdAt: new Date().toISOString(),
    ...base,
    qualityGateResult,
    cognitiveFlowTrace,
  };
}
