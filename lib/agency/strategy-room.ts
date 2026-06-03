import type { Project, Client, Briefing, StrategyRoom, StrategyRoomSpecialist, StrategyRoomSynthesis } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function hasChannel(client: Client, keyword: string): boolean {
  const bb = client.brandBrain;
  if (!bb) return false;
  const channels = bb.preferredChannels.toLowerCase();
  return channels.includes(keyword.toLowerCase());
}

function toneIsStrategic(client: Client): boolean {
  const bb = client.brandBrain;
  if (!bb) return false;
  return /estratégico|direto|premium|sênior/i.test(bb.toneOfVoice);
}

// ─── Six Specialist Generators ────────────────────────────────────────────────

function buildStrategySpecialist(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const bb = client.brandBrain;
  const audience = bb?.targetAudience ?? briefing?.audience ?? "público-alvo não definido";
  const positioning = bb?.positioning ?? "posicionamento não mapeado";

  return {
    specialistId: "strat",
    specialistName: "Agente de Estratégia",
    role: "Strategy Specialist",
    mainInsight: `O posicionamento central de ${client.name} aponta para diferenciação por ${toneIsStrategic(client) ? "autoridade e execução consistente" : "autenticidade e proximidade"}. O projeto precisa traduzir isso em touchpoints concretos com o público: ${audience.slice(0, 80)}.`,
    recommendedDirection: `Lançar com uma narrativa de posicionamento sólida antes de entrar em volume de produção. Definir claramente a proposta de valor para o projeto "${project.name}" e mapear os momentos de contato prioritários. ${positioning.slice(0, 100)}.`,
    suggestedDeliverables: ["Documento de posicionamento", "Mapa de mensagens-chave", "Calendário estratégico 90 dias"],
    risks: [
      "Execução sem narrativa clara gera conteúdo sem coesão",
      "Público-alvo amplo demais diluirá o impacto inicial",
    ],
    priority: "high",
    confidence: 8,
  };
}

function buildSocialMediaSpecialist(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const bb = client.brandBrain;
  const channels = bb?.preferredChannels ?? "Instagram";
  const hasInstagram = hasChannel(client, "instagram");
  const hasLinkedIn = hasChannel(client, "linkedin");
  const hasTikTok = hasChannel(client, "tiktok");

  const primaryChannel = hasTikTok ? "TikTok" : hasInstagram ? "Instagram" : hasLinkedIn ? "LinkedIn" : "Instagram";
  const formats = hasInstagram
    ? ["Reels (alcance orgânico)", "Carrosseis (autoridade e salvamentos)", "Stories (relacionamento diário)"]
    : ["Posts de texto (autoridade)", "Artigos curtos (reach orgânico)", "Vídeos nativos"];

  return {
    specialistId: "social",
    specialistName: "Agente de Social Media",
    role: "Social Media Specialist",
    mainInsight: `Canal principal identificado: ${primaryChannel}. Canais mapeados no Brand Brain: ${channels.slice(0, 100)}. O projeto tem potencial de gerar reach orgânico forte se o conteúdo respeitar o tom e os formatos nativos da plataforma.`,
    recommendedDirection: `Priorizar ${primaryChannel} para o lançamento de "${project.name}". Começar com 3–4 posts semanais nos formatos de maior alcance. Criar um ritmo editorial antes de entrar em paid social.`,
    suggestedDeliverables: ["Calendário de conteúdo (4 semanas)", ...formats.slice(0, 2), "Guia de hashtags e legendas"],
    risks: [
      "Frequência inconsistente nos primeiros 30 dias reduz algoritmo",
      `Tom errado para ${primaryChannel} afasta o público-alvo`,
    ],
    priority: "high",
    confidence: 9,
  };
}

function buildCreativeSpecialist(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const bb = client.brandBrain;
  const visualStyle = bb?.visualStyle ?? "estilo visual não definido";
  const thingsToAvoid = bb?.thingsToAvoid ?? "nenhuma restrição mapeada";

  return {
    specialistId: "creative",
    specialistName: "Agente de Design / Criação",
    role: "Creative & Design Specialist",
    mainInsight: `Identidade visual: ${visualStyle.slice(0, 100)}. Há diretrizes claras de o que evitar: ${thingsToAvoid.slice(0, 80)}.`,
    recommendedDirection: `Desenvolver um sistema visual para o projeto "${project.name}" que seja fiel ao Brand Brain e adaptável a todos os canais. Criar templates reutilizáveis para reduzir tempo de produção nas próximas semanas.`,
    suggestedDeliverables: ["Kit de templates (Feed + Stories)", "Guia visual do projeto", "Pacote de 10 posts iniciais"],
    risks: [
      "Design inconsistente entre canais fragmenta a percepção da marca",
      "Sem templates, a produção fica cara e lenta com o tempo",
    ],
    priority: "medium",
    confidence: 7,
  };
}

function buildPaidTrafficSpecialist(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const bb = client.brandBrain;
  const hasMetaHint = hasChannel(client, "instagram") || hasChannel(client, "facebook") || hasChannel(client, "meta");
  const hasGoogleHint = hasChannel(client, "google") || hasChannel(client, "seo");

  const platforms = [
    ...(hasMetaHint ? ["Meta Ads (Instagram + Facebook)"] : []),
    ...(hasGoogleHint ? ["Google Ads (Search + Performance Max)"] : []),
    ...(!hasMetaHint && !hasGoogleHint ? ["Meta Ads"] : []),
  ];

  return {
    specialistId: "paid",
    specialistName: "Agente de Tráfego Pago",
    role: "Paid Traffic Specialist",
    mainInsight: `Canais de paid recomendados para este perfil: ${platforms.join(", ")}. O projeto "${project.name}" tem características de lançamento — o pago deve amplificar o orgânico, não substituí-lo.`,
    recommendedDirection: `Estruturar uma campanha de awareness para a fase de lançamento com budget enxuto. Foco em topo de funil (alcance + engajamento) nos primeiros 30 dias antes de entrar em conversão direta.`,
    suggestedDeliverables: ["Plano de tráfego (30 dias)", "Criativos para anúncio (3 variações)", "Estrutura de audiências"],
    risks: [
      "Escalar paid antes do orgânico estar validado aumenta CPA desnecessariamente",
      "Sem pixel instalado, não há remarketing — verificar setup técnico",
    ],
    priority: "medium",
    confidence: 7,
  };
}

function buildBusinessScopeSpecialist(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const goal = project.goal ?? briefing?.goal ?? "objetivo não definido";
  const projectType = project.type ?? "escopo não definido";
  const strategicNotes = client.brandBrain?.strategicNotes ?? "";

  return {
    specialistId: "biz",
    specialistName: "Agente de Negócio / Escopo",
    role: "Business & Scope Specialist",
    mainInsight: `Objetivo do projeto: "${goal.slice(0, 120)}". Tipo declarado: ${projectType}. ${strategicNotes ? `Contexto estratégico: ${strategicNotes.slice(0, 100)}.` : ""}`,
    recommendedDirection: `Definir entregas com critérios de aceitação claros antes de entrar em produção. O escopo de "${project.name}" deve ser faseado — fase 1 (lançamento e posicionamento), fase 2 (volume e escala). Evitar escopo aberto que gera revisões infinitas.`,
    suggestedDeliverables: ["Documento de escopo com milestones", "SLA de revisões acordado", "Critérios de sucesso mensuráveis"],
    risks: [
      "Escopo aberto gera expectativa desalinhada do cliente",
      "Sem milestone claro, é difícil medir e cobrar o resultado",
    ],
    priority: "high",
    confidence: 8,
  };
}

function buildCriticalReviewer(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const hasFullBrandBrain = !!(client.brandBrain?.businessSummary && client.brandBrain?.toneOfVoice);
  const hasBriefing = !!briefing;
  const hasProposal = !!(project as { proposal?: unknown }).proposal;

  const gaps: string[] = [];
  if (!hasFullBrandBrain) gaps.push("Brand Brain incompleto — estratégia baseada em dados parciais");
  if (!hasBriefing) gaps.push("Briefing não encontrado — recomendações genéricas sem contexto específico do cliente");
  if (!hasProposal) gaps.push("Proposta não criada — risco de execução sem validação comercial");

  return {
    specialistId: "critic",
    specialistName: "Revisor Crítico",
    role: "Critical Reviewer",
    mainInsight: gaps.length === 0
      ? `Contexto bem estruturado para o projeto "${project.name}". Brand Brain completo, briefing presente e proposta iniciada. Estratégia pode avançar com confiança.`
      : `Lacunas identificadas: ${gaps.join("; ")}.`,
    recommendedDirection: gaps.length === 0
      ? `Avançar com a estratégia. Todos os inputs necessários estão disponíveis. Garantir alinhamento entre os especialistas antes de iniciar produção.`
      : `Preencher as lacunas identificadas antes de iniciar execução: ${gaps.slice(0, 2).join(", ")}.`,
    suggestedDeliverables: [
      "Checklist de alinhamento pré-execução",
      ...(gaps.length > 0 ? ["Reunião de alinhamento com cliente"] : ["Kickoff interno com agentes"]),
    ],
    risks: gaps.length > 0 ? gaps : ["Sem gaps críticos identificados neste momento"],
    priority: gaps.length >= 2 ? "high" : gaps.length === 1 ? "medium" : "low",
    confidence: hasFullBrandBrain && hasBriefing ? 9 : 6,
  };
}

// ─── Synthesis Builder ────────────────────────────────────────────────────────

function buildSynthesis(
  project: Project,
  client: Client,
  specialists: StrategyRoomSpecialist[]
): StrategyRoomSynthesis {
  const bb = client.brandBrain;
  const highPriority = specialists.filter((s) => s.priority === "high");
  const allRisks = [...new Set(specialists.flatMap((s) => s.risks))].slice(0, 4);
  const allDeliverables = [...new Set(specialists.flatMap((s) => s.suggestedDeliverables))].slice(0, 6);
  const avgConfidence = specialists.reduce((acc, s) => acc + s.confidence, 0) / specialists.length;
  const strategicScore = Math.round(Math.min(10, avgConfidence * 0.8 + (highPriority.length >= 3 ? 2 : 1)));

  const recommendedServices = [
    "Gestão de Redes Sociais",
    "Produção de Conteúdo",
    ...(bb?.preferredChannels?.includes("Google") ? ["Tráfego Pago — Google Ads"] : []),
    ...(bb?.preferredChannels?.includes("Instagram") ? ["Tráfego Pago — Meta Ads"] : []),
    "Design e Identidade Visual",
    "Estratégia e Planejamento",
  ].slice(0, 5);

  return {
    recommendedStrategy: `Para o projeto "${project.name}" com ${client.name}: iniciar com posicionamento e calendário editorial sólidos antes de escalar. Prioridade nos primeiros 30 dias é consistência e tom. ${bb?.positioning ? `Diferencial a reforçar: ${bb.positioning.slice(0, 100)}.` : ""}`,
    recommendedServices,
    proposalImplications: `Proposta deve incluir: ${allDeliverables.slice(0, 3).join(", ")}. Escopo faseado recomendado (lançamento → volume). Prazo sugerido: 3–6 meses de retainer para consolidação.`,
    keyRisks: allRisks,
    nextActionForPM: highPriority.length > 0
      ? `Priorizar entregas de: ${highPriority.map((s) => s.specialistName).join(", ")}. Agendar kickoff com cliente após alinhamento interno.`
      : "Realizar kickoff interno com os agentes para alinhar direções antes de apresentar ao cliente.",
    strategicScore,
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function generateStrategyRoomForProject(
  project: Project,
  client: Client,
  briefing?: Briefing,
  _materialRequests?: MaterialRequest[]
): StrategyRoom {
  const specialists: StrategyRoomSpecialist[] = [
    buildStrategySpecialist(project, client, briefing),
    buildSocialMediaSpecialist(project, client, briefing),
    buildCreativeSpecialist(project, client, briefing),
    buildPaidTrafficSpecialist(project, client, briefing),
    buildBusinessScopeSpecialist(project, client, briefing),
    buildCriticalReviewer(project, client, briefing),
  ];

  const finalSynthesis = buildSynthesis(project, client, specialists);

  return {
    projectId: project.id,
    clientId: client.id,
    generatedAt: new Date().toISOString(),
    specialists,
    finalSynthesis,
    status: "ready",
  };
}
