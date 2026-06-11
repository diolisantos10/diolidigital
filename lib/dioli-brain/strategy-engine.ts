// Dioli Brain — Strategy Engine
// Transforms a qualified client (SDR output) into a StrategyCanvas.
// Reasons through DIOLI_COGNITIVE_FLOW — every canvas carries the flow trace.
// Rule-based engine: segment-aware heuristics, no external AI calls.

import { DIOLI_COGNITIVE_FLOW } from "./cognitive-flow";
import type { BrainReasoningOutput } from "@/lib/agency/sdr-agent";
import {
  runStrategyQualityGate,
  type StrategyCanvas,
  type StrategyFlowStep,
  type StrategyRoadmapPhase,
} from "./strategy-canvas";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface StrategyEngineInput {
  businessName: string;
  segment: string;
  objectives: string[];
  services: string[];           // e.g. ["Social Media", "Tráfego Pago"]
  rawContext?: string;          // briefing raw text / extra knowledge
  brainReasoning?: BrainReasoningOutput;   // SDR handoff artifact
  requestId?: string;
  source?: "request" | "simulation";
}

// ── Segment profiles (knowledge base heuristics) ──────────────────────────────

interface SegmentProfile {
  match: RegExp;
  audience: string;
  painPoints: string[];
  differentiatorHints: string[];
  territories: string[];
  channels: string[];
  communicationDirection: string;
  opportunities: string[];
  risks: string[];
}

// Order matters: more specific profiles (premium) must come before generic ones.
const SEGMENT_PROFILES: SegmentProfile[] = [
  {
    match: /premium|fine|alta gastronomia|sofisticad|luxo|exclusiv/i,
    audience: "Público A/B, 30–55 anos, que busca experiências e celebrações — escolhe pelo prestígio e pela estética antes do preço.",
    painPoints: [
      "Posicionamento premium ainda não comunicado com consistência",
      "Concorrência com casas estabelecidas de maior prestígio",
      "Ticket alto exige justificativa de valor constante",
    ],
    differentiatorHints: ["Experiência exclusiva", "Curadoria e autoria", "Ambiente e serviço impecáveis"],
    territories: ["Experiência e ambiente", "Autoria do chef", "Ingredientes e origem", "Celebrações e ocasiões", "Bastidores premium"],
    channels: ["Instagram", "Site próprio", "Parcerias e imprensa"],
    communicationDirection: "Tom sofisticado e contido. Estética impecável — menos posts, mais produção. Nunca usar linguagem de desconto.",
    opportunities: [
      "Conteúdo de autoria do chef constrói prestígio difícil de copiar",
      "Datas comemorativas geram picos de reserva com antecedência",
    ],
    risks: ["Promoções agressivas destroem percepção premium", "Estética inconsistente quebra a promessa de exclusividade"],
  },
  {
    match: /restaurante|sushi|pizza|hamburgue|fast\s*food|caf[eé]\b|bar\b|lanchon|padaria|pastelaria|a[çc]a[íi]|churrascaria|gastronomia/i,
    audience: "Moradores e trabalhadores da região num raio de 5–10km, 25–45 anos, que decidem onde comer pelo Instagram e por delivery apps.",
    painPoints: [
      "Movimento irregular entre dias de semana e fim de semana",
      "Dependência de apps de delivery com comissões altas",
      "Cardápio pouco visível para novos clientes",
    ],
    differentiatorHints: ["Experiência gastronômica própria", "Pratos assinatura fotografáveis", "Atendimento de proximidade"],
    territories: ["Bastidores da cozinha", "Pratos assinatura", "Promoções da semana", "Equipe e história da casa", "Cliente em destaque"],
    channels: ["Instagram", "Google Meu Negócio", "WhatsApp"],
    communicationDirection: "Tom apetitoso e próximo. Comida em primeiro plano, sempre com foto/vídeo real. Urgência leve em promoções (hoje, só esta semana).",
    opportunities: [
      "Stories diários de pratos aumentam pedidos diretos sem comissão de apps",
      "Google Meu Negócio otimizado captura busca local de alta intenção",
    ],
    risks: ["Fotos amadoras podem rebaixar percepção de qualidade", "Inconsistência de postagem derruba alcance rapidamente"],
  },
  {
    match: /e-?commerce|loja\s*(online|virtual)|marketplace|dropship/i,
    audience: "Compradores digitais 20–45 anos, comparadores de preço, que descobrem produtos por anúncios e fecham após prova social.",
    painPoints: [
      "Custo de aquisição (CAC) subindo a cada trimestre",
      "Carrinho abandonado sem fluxo de recuperação",
      "Dependência de tráfego pago sem base própria",
    ],
    differentiatorHints: ["Curadoria de produto", "Logística e prazo", "Política de troca sem atrito"],
    territories: ["Produto em uso", "Prova social e reviews", "Ofertas e lançamentos", "Bastidores da operação", "Conteúdo educativo da categoria"],
    channels: ["Instagram", "Meta Ads", "Google Shopping", "E-mail"],
    communicationDirection: "Tom direto e orientado a benefício. Toda peça com CTA claro. Prova social presente em todos os formatos.",
    opportunities: [
      "Funil completo (topo orgânico + remarketing) reduz CAC",
      "Base de e-mail própria diminui dependência de mídia paga",
    ],
    risks: ["Margem comprimida limita verba de mídia", "Concorrência direta em leilão de anúncios da categoria"],
  },
  {
    match: /cl[íi]nica|consult[óo]rio|dent|m[ée]dic|est[ée]tica(?!\s+capilar)|fisio|psico|sa[úu]de/i,
    audience: "Pacientes locais 25–60 anos que pesquisam reputação e confiança antes de agendar — decisão por autoridade percebida.",
    painPoints: [
      "Agenda ociosa em horários específicos",
      "Concorrência local com presença digital mais forte",
      "Dificuldade em comunicar autoridade sem ferir ética da categoria",
    ],
    differentiatorHints: ["Autoridade técnica do corpo clínico", "Estrutura e tecnologia", "Atendimento humanizado"],
    territories: ["Educação em saúde", "Antes/depois e resultados (dentro da ética)", "Equipe e especialistas", "Estrutura da clínica", "Dúvidas frequentes"],
    channels: ["Instagram", "Google Meu Negócio", "WhatsApp"],
    communicationDirection: "Tom de autoridade acessível. Conteúdo educativo em primeiro lugar. Respeitar restrições éticas de publicidade da categoria.",
    opportunities: [
      "Conteúdo educativo posiciona a clínica como referência local",
      "Google Meu Negócio com reviews captura busca de alta intenção",
    ],
    risks: ["Publicidade fora das normas éticas da categoria gera risco legal", "Promessas de resultado são vetadas"],
  },
  {
    match: /academia|gym|crossfit|fitness|personal|pilates|trein/i,
    audience: "Pessoas 18–45 anos da região buscando resultado físico e pertencimento — decidem por ambiente, comunidade e prova de resultado.",
    painPoints: [
      "Alta rotatividade de alunos (churn mensal)",
      "Sazonalidade forte (janeiro/verão vs. inverno)",
      "Guerra de preço com redes low-cost",
    ],
    differentiatorHints: ["Comunidade e pertencimento", "Acompanhamento próximo", "Resultados documentados"],
    territories: ["Transformações de alunos", "Treino do dia", "Comunidade e eventos", "Dicas técnicas", "Bastidores e equipe"],
    channels: ["Instagram", "TikTok", "WhatsApp"],
    communicationDirection: "Tom energético e motivador. Vídeo curto como formato principal. Prova social de alunos reais toda semana.",
    opportunities: [
      "Transformações reais geram conteúdo de altíssima conversão",
      "Desafios e eventos criam picos de matrícula fora da sazonalidade",
    ],
    risks: ["Comparação por preço se a comunicação não construir valor", "Churn alto anula esforço de aquisição"],
  },
  {
    match: /sal[ãa]o|beleza|barbearia|cabelo|est[ée]tica capilar|manicure|sobrancelha|make/i,
    audience: "Público local 18–50 anos, majoritariamente feminino, que escolhe por portfólio visual e indicação — Instagram é a vitrine.",
    painPoints: [
      "Agenda irregular entre dias da semana",
      "Profissionais concorrentes atendendo em domicílio",
      "Portfólio desatualizado não reflete a qualidade atual",
    ],
    differentiatorHints: ["Especialização técnica", "Experiência no atendimento", "Portfólio consistente"],
    territories: ["Antes/depois", "Tendências e técnicas", "Rotina do salão", "Autocuidado e dicas", "Agenda e disponibilidade"],
    channels: ["Instagram", "WhatsApp", "Google Meu Negócio"],
    communicationDirection: "Tom acolhedor e visual. Antes/depois como formato âncora. Facilitar agendamento em todas as peças.",
    opportunities: [
      "Antes/depois bem produzidos convertem direto em agendamento",
      "Horários ociosos podem virar ofertas relâmpago nos stories",
    ],
    risks: ["Fotos sem padrão visual rebaixam percepção do trabalho", "Não responder WhatsApp rápido perde agendamentos"],
  },
  {
    match: /servi[çc]o|consultoria|advocacia|contabil|engenharia|arquitet|imobili[áa]ri|seguro|agência|freelanc/i,
    audience: "Decisores 28–55 anos que contratam por confiança e autoridade demonstrada — ciclo de decisão mais longo, ticket maior.",
    painPoints: [
      "Geração de leads qualificados inconsistente",
      "Dificuldade em demonstrar valor antes da contratação",
      "Dependência de indicação sem canal previsível",
    ],
    differentiatorHints: ["Especialização em nicho", "Metodologia própria", "Casos de sucesso documentados"],
    territories: ["Autoridade e conteúdo educativo", "Casos e resultados", "Metodologia e processo", "Mercado e tendências", "Bastidores da operação"],
    channels: ["Instagram", "LinkedIn", "Google"],
    communicationDirection: "Tom consultivo e confiante. Educar antes de vender. Casos reais como prova central de competência.",
    opportunities: [
      "Conteúdo de autoridade gera leads inbound previsíveis",
      "Casos documentados encurtam o ciclo de decisão",
    ],
    risks: ["Conteúdo genérico não diferencia de concorrentes", "Ciclo longo exige consistência por meses antes do retorno"],
  },
];

const DEFAULT_PROFILE: SegmentProfile = {
  match: /.*/,
  audience: "Público local/digital 25–45 anos que descobre marcas pelo Instagram e decide por confiança e prova social.",
  painPoints: [
    "Presença digital inconsistente",
    "Concorrência com comunicação mais profissional",
    "Falta de canal previsível de aquisição",
  ],
  differentiatorHints: ["Proximidade com o cliente", "Qualidade do produto/serviço"],
  territories: ["Produto/serviço em destaque", "Bastidores", "Prova social", "Conteúdo educativo", "Ofertas"],
  channels: ["Instagram", "WhatsApp"],
  communicationDirection: "Tom próximo e profissional. Consistência visual e frequência regular antes de volume.",
  opportunities: ["Consistência de presença digital diferencia da concorrência local"],
  risks: ["Comunicação genérica não constrói posicionamento"],
};

function resolveSegmentProfile(segment: string, rawContext?: string): SegmentProfile {
  const text = `${segment} ${rawContext ?? ""}`;
  return SEGMENT_PROFILES.find((p) => p.match.test(text)) ?? DEFAULT_PROFILE;
}

// ── Roadmap builder ───────────────────────────────────────────────────────────

function buildRoadmap(services: string[], profile: SegmentProfile): StrategyRoadmapPhase[] {
  const phases: StrategyRoadmapPhase[] = [
    {
      phase: "Fase 1 — Fundação",
      focus: `Definir identidade de comunicação, padronizar presença nos canais prioritários (${profile.channels.slice(0, 2).join(", ")}) e organizar materiais de marca.`,
      durationWeeks: 2,
    },
    {
      phase: "Fase 2 — Consistência",
      focus: `Ativar calendário editorial nos territórios definidos com frequência sustentável. Medir alcance e engajamento como baseline.`,
      durationWeeks: 4,
    },
  ];
  if (services.some((s) => /tr[áa]fego|ads|pago/i.test(s))) {
    phases.push({
      phase: "Fase 3 — Aceleração",
      focus: "Iniciar mídia paga sobre o conteúdo orgânico validado. Testar públicos e criativos com budget controlado.",
      durationWeeks: 4,
    });
  } else {
    phases.push({
      phase: "Fase 3 — Otimização",
      focus: "Dobrar nos formatos e territórios de melhor performance. Avaliar inclusão de mídia paga para escala.",
      durationWeeks: 4,
    });
  }
  phases.push({
    phase: "Fase 4 — Escala",
    focus: "Revisar estratégia com dados do trimestre. Expandir canais e formatos com ROI comprovado.",
    durationWeeks: 6,
  });
  return phases;
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

function buildFlowTrace(input: StrategyEngineInput, profile: SegmentProfile): StrategyFlowStep[] {
  const summaries: Record<string, { completed: boolean; summary: string }> = {
    intention: {
      completed: true,
      summary: input.brainReasoning?.intentionDetected
        ?? `${input.businessName} busca ${input.objectives.join(", ") || "crescimento digital"} via ${input.services.join(", ") || "serviços a definir"}.`,
    },
    context: {
      completed: !!input.segment,
      summary: input.segment
        ? `Segmento: ${input.segment}. Perfil de mercado aplicado da base de conhecimento.`
        : "Segmento não identificado — usando perfil genérico.",
    },
    certainty: {
      completed: (input.brainReasoning?.knownFacts.length ?? 0) > 0 || input.objectives.length > 0,
      summary: input.brainReasoning?.knownFacts.length
        ? `${input.brainReasoning.knownFacts.length} fatos conhecidos do handoff SDR.`
        : `Fatos derivados do briefing: ${[input.businessName, input.segment, ...input.objectives].filter(Boolean).length} pontos.`,
    },
    unknowns: {
      completed: true,
      summary: input.brainReasoning?.unknownFacts.length
        ? `${input.brainReasoning.unknownFacts.length} incógnitas herdadas do SDR: ${input.brainReasoning.unknownFacts.slice(0, 2).join("; ")}.`
        : "Sem incógnitas críticas registradas no handoff.",
    },
    routing: {
      completed: true,
      summary: `Estratégia define direção; execução roteada para: ${input.services.join(", ") || "a definir após aprovação"}.`,
    },
    permission: {
      completed: true,
      summary: "Dentro do escopo do departamento: diagnóstico, posicionamento e direção. Sem criação de criativos finais.",
    },
    brand: {
      completed: true,
      summary: `Direção de comunicação alinhada ao segmento: ${profile.communicationDirection.split(".")[0]}.`,
    },
    objective: {
      completed: input.objectives.length > 0,
      summary: input.objectives.length > 0
        ? `Objetivo central: ${input.objectives[0]}.`
        : "Objetivo não declarado — assumindo crescimento de presença digital.",
    },
    risk: {
      completed: true,
      summary: `${profile.risks.length} riscos mapeados para o segmento.`,
    },
    approval: {
      completed: true,
      summary: "Canvas requer aprovação humana antes de virar direção oficial — saída client-facing.",
    },
    training: {
      completed: true,
      summary: "Aprovação/rejeição deste canvas alimenta o treinamento do departamento via governança.",
    },
    measurement: {
      completed: true,
      summary: "Sucesso medido por: aprovação do canvas, execução do roadmap e métricas de canal na Fase 2+.",
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

const uid = () => `sc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function generateStrategyCanvas(input: StrategyEngineInput): StrategyCanvas {
  const profile = resolveSegmentProfile(input.segment, input.rawContext);
  const biz = input.businessName || "Cliente";

  const mainObjective = input.objectives[0]
    ? `${input.objectives[0].charAt(0).toUpperCase()}${input.objectives[0].slice(1)} para ${biz} nos próximos 90 dias.`
    : `Construir presença digital consistente e canal previsível de aquisição para ${biz} nos próximos 90 dias.`;

  const secondaryObjectives = [
    ...input.objectives.slice(1).map((o) => `${o.charAt(0).toUpperCase()}${o.slice(1)}`),
    "Estabelecer baseline de métricas de alcance e engajamento",
    "Padronizar identidade de comunicação nos canais prioritários",
  ].slice(0, 4);

  const differentiators = [
    ...profile.differentiatorHints,
    ...(input.brainReasoning?.opportunities.slice(0, 1) ?? []),
  ].slice(0, 4);

  const risks = [
    ...profile.risks,
    ...(input.brainReasoning?.risks ?? []),
  ].slice(0, 5);

  const opportunities = [
    ...profile.opportunities,
    ...(input.brainReasoning?.opportunities ?? []),
  ].slice(0, 5);

  const recommendedServices = input.services.length > 0
    ? input.services
    : ["Social Media"];

  const positioningStatement =
    `${biz} se posiciona como ${differentiators[0]?.toLowerCase() ?? "referência de qualidade"} no segmento de ${input.segment || "atuação"}, ` +
    `falando com ${profile.audience.split(",")[0].toLowerCase()} através de ${profile.channels.slice(0, 2).join(" e ")}, ` +
    `com comunicação que privilegia ${profile.communicationDirection.split(".")[0].toLowerCase()}.`;

  const base = {
    requestId: input.requestId,
    clientName: biz,
    segment: input.segment || "Não identificado",
    businessSummary: `${biz}${input.segment ? ` — ${input.segment}` : ""}. ${
      input.brainReasoning?.intentionDetected
        ?? `Demanda: ${recommendedServices.join(", ")}.`
    }`,
    mainObjective,
    secondaryObjectives,
    audience: profile.audience,
    painPoints: profile.painPoints,
    differentiators,
    competitiveAdvantages: differentiators.slice(0, 2).map((d) =>
      `${d} — difícil de replicar pela concorrência direta no curto prazo.`
    ),
    risks,
    opportunities,
    positioningStatement,
    communicationDirection: profile.communicationDirection,
    contentTerritories: profile.territories,
    priorityChannels: profile.channels,
    recommendedServices,
    recommendedRoadmap: buildRoadmap(recommendedServices, profile),
    reviewedAt: undefined,
    reviewNote: undefined,
  };

  const qualityGateResult = runStrategyQualityGate(base);
  const cognitiveFlowTrace = buildFlowTrace(input, profile);

  return {
    id: uid(),
    source: input.source ?? "request",
    status: "draft",
    createdAt: new Date().toISOString(),
    ...base,
    qualityGateResult,
    cognitiveFlowTrace,
  };
}
