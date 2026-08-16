import type { Project, Client, Briefing, StrategyRoom, StrategyRoomSpecialist, StrategyRoomSynthesis, DebateTurn, ConsensusLayer, ExecutiveSummary } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── V2 Specialist Builders ───────────────────────────────────────────────────

function buildBrandStrategist(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const bb = client.brandBrain;
  const audience = bb?.targetAudience ?? briefing?.audience ?? "público-alvo não definido";
  const positioning = bb?.positioning ?? "posicionamento não mapeado";
  const tone = toneIsStrategic(client);

  return {
    specialistId: "strat",
    specialistName: "Brand Strategist",
    role: "Estrategista de Marca",
    mission: "Garantir que cada entrega reforce o posicionamento da marca e crie diferenciação sustentável no mercado.",
    perspective: "Olha para o cliente como um ativo de longo prazo — cada decisão criativa ou de canal deve ser consistente com a promessa central da marca.",
    priorities: [
      "Clareza de posicionamento antes de escalar",
      "Coesão entre tom, visual e mensagem",
      "Diferenciação genuína no mercado do cliente",
    ],
    concerns: [
      "Execução antes de estratégia gera marca fragmentada",
      `Audiência ampla demais: "${audience.slice(0, 60)}" precisa de segmentação clara`,
    ],
    mainInsight: `O posicionamento de ${client.name} aponta para diferenciação por ${tone ? "autoridade e execução consistente" : "autenticidade e proximidade"}. Para "${project.name}", a narrativa deve ser construída antes do volume de produção. Público-alvo: ${audience.slice(0, 80)}.`,
    recommendedDirection: `Iniciar com documento de posicionamento e mapa de mensagens antes de qualquer entrega. Definir 2–3 pilares de conteúdo que traduzam o diferencial: ${positioning.slice(0, 100)}.`,
    suggestedDeliverables: ["Documento de posicionamento", "Mapa de mensagens-chave", "Pilares de conteúdo", "Calendário estratégico 90 dias"],
    risks: [
      "Execução sem narrativa clara gera conteúdo sem coesão",
      "Público-alvo amplo demais diluirá o impacto inicial",
    ],
    priority: "high",
    confidence: 8,
  };
}

function buildSocialMediaDirector(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
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
    specialistName: "Social Media Director",
    role: "Diretora de Redes Sociais",
    mission: "Construir presença orgânica consistente que gere audiência fiel e prepare o terreno para o tráfego pago.",
    perspective: "As redes sociais são o ativo de distribuição mais valioso da agência — consistência e formato nativo vencem volume.",
    priorities: [
      `Dominar ${primaryChannel} antes de diversificar`,
      "Ritmo editorial sustentável (3–4 posts/semana no início)",
      "Formatos nativos da plataforma — nunca adaptar de outro canal",
    ],
    concerns: [
      `Frequência inconsistente nos primeiros 30 dias colapsa o algoritmo de ${primaryChannel}`,
      "Tom errado para a plataforma afasta a audiência antes de ela conhecer a marca",
    ],
    mainInsight: `Canal principal: ${primaryChannel}. Canais mapeados: ${channels.slice(0, 100)}. Potencial orgânico alto se respeitar os formatos nativos. Prioridade: consistência antes de viralidade.`,
    recommendedDirection: `Lançar "${project.name}" com foco em ${primaryChannel}. Começar com 3–4 posts semanais nos formatos de maior alcance. Criar ritmo editorial antes de entrar em paid social.`,
    suggestedDeliverables: ["Calendário de conteúdo (4 semanas)", ...formats.slice(0, 2), "Guia de hashtags e legendas", "Biblioteca de temas recorrentes"],
    risks: [
      "Frequência inconsistente nos primeiros 30 dias reduz o algoritmo",
      `Tom errado para ${primaryChannel} afasta o público-alvo`,
    ],
    priority: "high",
    confidence: 9,
  };
}

function buildCreativeDirector(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const bb = client.brandBrain;
  const visualStyle = bb?.visualStyle ?? "estilo visual não definido";
  const thingsToAvoid = bb?.thingsToAvoid ?? "nenhuma restrição mapeada";

  return {
    specialistId: "creative",
    specialistName: "Creative Director",
    role: "Diretora de Criação",
    mission: "Criar um sistema visual que seja fiel à marca, adaptável a todos os canais e produtível em escala sem perder qualidade.",
    perspective: "Design não é decoração — é argumento visual. Cada pixel deve reforçar o posicionamento e criar reconhecimento imediato.",
    priorities: [
      "Sistema visual coeso antes de começar produção",
      "Templates reutilizáveis que reduzem tempo de produção",
      "Consistência entre Feed, Stories, e materiais offline",
    ],
    concerns: [
      `Evitar: ${thingsToAvoid.slice(0, 80)} — restrições do Brand Brain são non-negotiable`,
      "Design inconsistente entre canais fragmenta a percepção da marca",
    ],
    mainInsight: `Identidade visual: ${visualStyle.slice(0, 100)}. Restrições mapeadas: ${thingsToAvoid.slice(0, 80)}. Sistema visual precisa ser estabelecido antes da produção em escala.`,
    recommendedDirection: `Criar kit visual base para "${project.name}": templates de Feed, Stories e Kit de Mídia. Priorizar reconhecimento visual sobre originalidade no início.`,
    suggestedDeliverables: ["Kit de templates (Feed + Stories)", "Guia visual do projeto", "Pacote de 10 posts iniciais", "Identidade de canais (avatares, capas)"],
    risks: [
      "Design inconsistente entre canais fragmenta percepção da marca",
      "Sem templates, produção fica cara e lenta semana a semana",
    ],
    priority: "medium",
    confidence: 7,
  };
}

function buildPaidMediaDirector(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const hasMetaHint = hasChannel(client, "instagram") || hasChannel(client, "facebook") || hasChannel(client, "meta");
  const hasGoogleHint = hasChannel(client, "google") || hasChannel(client, "seo");

  const platforms = [
    ...(hasMetaHint ? ["Meta Ads (Instagram + Facebook)"] : []),
    ...(hasGoogleHint ? ["Google Ads (Search + Performance Max)"] : []),
    ...(!hasMetaHint && !hasGoogleHint ? ["Meta Ads"] : []),
  ];

  return {
    specialistId: "paid",
    specialistName: "Paid Media Director",
    role: "Diretora de Tráfego Pago",
    mission: "Usar tráfego pago para amplificar o que já funciona organicamente — jamais substituir o orgânico, mas acelerar resultados validados.",
    perspective: "Tráfego pago é um acelerador, não um motor. Precisa de criativo sólido, audiência definida e pixel configurado antes de investir.",
    priorities: [
      "Pixel e rastreamento antes de qualquer gasto em mídia",
      "Topo de funil (awareness) nos primeiros 30 dias",
      "Criativos testados organicamente antes de ir para pago",
    ],
    concerns: [
      "Escalar paid antes de validar orgânico aumenta CPA desnecessariamente",
      "Sem rastreamento correto, otimização automática das plataformas é ineficaz",
    ],
    mainInsight: `Plataformas recomendadas: ${platforms.join(", ")}. Para o lançamento de "${project.name}", o pago deve amplificar o orgânico, não substituí-lo. Fase 1: awareness e engajamento.`,
    recommendedDirection: `Estruturar campanha de awareness de lançamento com budget enxuto. Foco em topo de funil nos primeiros 30 dias antes de entrar em conversão direta. Validar criativos organicamente primeiro.`,
    suggestedDeliverables: ["Plano de tráfego (30 dias)", "Criativos para anúncio (3 variações)", "Estrutura de audiências", "Relatório de performance semana 4"],
    risks: [
      "Escalar paid antes de validar orgânico aumenta CPA desnecessariamente",
      "Sem pixel instalado, remarketing é impossível — verificar setup técnico",
    ],
    priority: "medium",
    confidence: 7,
  };
}

function buildGrowthStrategist(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const goal = project.goal ?? briefing?.goal ?? "objetivo não definido";
  const strategicNotes = client.brandBrain?.strategicNotes ?? "";

  return {
    specialistId: "growth",
    specialistName: "Growth Strategist",
    role: "Estrategista de Crescimento",
    mission: "Mapear a jornada de crescimento do cliente — do lançamento ao retainer — e garantir que cada entrega gere resultado mensurável.",
    perspective: "Crescimento é sistemático. Cada sprint deve testar uma hipótese, medir o resultado e informar a próxima decisão.",
    priorities: [
      "Métricas de sucesso definidas antes de iniciar execução",
      "Escopo faseado para evitar escopo aberto",
      "Milestone de 30 dias para validar ou pivotar",
    ],
    concerns: [
      "Escopo aberto gera expectativa desalinhada e revisões sem fim",
      "Sem KPIs claros, é impossível provar o valor da agência para o cliente",
    ],
    mainInsight: `Objetivo do projeto: "${goal.slice(0, 120)}". ${strategicNotes ? `Contexto estratégico: ${strategicNotes.slice(0, 100)}.` : ""} Escopo deve ser faseado: fase 1 (lançamento), fase 2 (escala).`,
    recommendedDirection: `Definir KPIs mensuráveis antes de iniciar. Escopo de "${project.name}": fase 1 (30 dias — lançar e testar), fase 2 (60–90 dias — escalar o que funciona). SLA de revisões acordado no kickoff.`,
    suggestedDeliverables: ["Documento de escopo com milestones", "KPIs e critérios de sucesso", "SLA de revisões", "Relatório de 30 dias"],
    risks: [
      "Escopo aberto gera expectativa desalinhada do cliente",
      "Sem milestone claro, é difícil medir e cobrar o resultado",
    ],
    priority: "high",
    confidence: 8,
  };
}

function buildAgencyCEO(project: Project, client: Client, briefing?: Briefing): StrategyRoomSpecialist {
  const hasFullBrandBrain = !!(client.brandBrain?.businessSummary && client.brandBrain?.toneOfVoice);
  const hasBriefing = !!briefing;
  const hasProposal = !!(project as { proposal?: unknown }).proposal;

  const gaps: string[] = [];
  if (!hasFullBrandBrain) gaps.push("Brand Brain incompleto — estratégia baseada em dados parciais");
  if (!hasBriefing) gaps.push("Briefing ausente — recomendações genéricas sem contexto específico");
  if (!hasProposal) gaps.push("Proposta não criada — risco de execução sem validação comercial");

  return {
    specialistId: "ceo",
    specialistName: "Agency CEO",
    role: "CEO da Agência",
    mission: "Garantir que o projeto seja rentável, que o cliente seja bem servido e que a equipe tenha clareza para executar sem fricção.",
    perspective: "Cada projeto é uma prova de conceito da agência. Qualidade de execução e clareza de processo criam reputação e renovações.",
    priorities: [
      "Proposta aprovada antes de qualquer execução",
      "Alinhamento de expectativas no kickoff (evita revisões excessivas)",
      "Equipe com clareza de responsabilidades e prazos",
    ],
    concerns: gaps.length > 0 ? gaps : ["Garantir qualidade de entrega para renovação do contrato"],
    mainInsight: gaps.length === 0
      ? `Contexto excelente para "${project.name}". Brand Brain completo, briefing presente, proposta iniciada. Time pode avançar com confiança.`
      : `Lacunas identificadas que precisam ser resolvidas antes da execução: ${gaps.join("; ")}.`,
    recommendedDirection: gaps.length === 0
      ? `Avançar com a estratégia. Todos os inputs estão disponíveis. Agendar kickoff com o cliente após alinhamento interno dos agentes.`
      : `Resolver as lacunas antes de iniciar execução: ${gaps.slice(0, 2).join(", ")}. Kickoff só após esses pontos resolvidos.`,
    suggestedDeliverables: [
      "Checklist de alinhamento pré-execução",
      ...(gaps.length > 0 ? ["Reunião de alinhamento com cliente"] : ["Kickoff interno com agentes"]),
    ],
    risks: gaps.length > 0 ? gaps : ["Sem gaps críticos identificados neste momento"],
    priority: gaps.length >= 2 ? "high" : gaps.length === 1 ? "medium" : "low",
    confidence: hasFullBrandBrain && hasBriefing ? 9 : 6,
  };
}

// ─── V2 Debate Builder ────────────────────────────────────────────────────────

function buildDebate(project: Project, client: Client, specialists: StrategyRoomSpecialist[]): DebateTurn[] {
  const bb = client.brandBrain;
  const hasInstagram = hasChannel(client, "instagram");
  const hasTikTok = hasChannel(client, "tiktok");
  const primaryChannel = hasTikTok ? "TikTok" : hasInstagram ? "Instagram" : "Instagram";
  const hasFullBrandBrain = !!(bb?.businessSummary && bb?.toneOfVoice);
  const tone = toneIsStrategic(client);

  const turns: DebateTurn[] = [
    // 1. Brand Strategist opens
    {
      specialistId: "strat",
      specialistName: "Brand Strategist",
      type: "opening",
      content: `Para "${project.name}", a prioridade absoluta é posicionamento antes de volume. ${client.name} tem um diferencial claro — ${tone ? "autoridade e consistência" : "autenticidade e proximidade com o público"} — e precisamos garantir que cada entrega reforce esse eixo. Proposta: começar com documento de posicionamento e mapa de mensagens na semana 1, antes de qualquer produção de conteúdo.`,
    },
    // 2. Social Media Director responds
    {
      specialistId: "social",
      specialistName: "Social Media Director",
      type: "critique",
      replyTo: "strat",
      content: `Concordo com a necessidade de posicionamento claro, mas não podemos esperar semanas para publicar. O ${primaryChannel} penaliza contas que ficam sem postagens. Contraproposta: criar os pilares de conteúdo em paralelo com o posicionamento e publicar conteúdo de "warming" já na semana 1 — mesmo que seja mais simples — para não perder o algoritmo.`,
    },
    // 3. Creative Director adds nuance
    {
      specialistId: "creative",
      specialistName: "Creative Director",
      type: "addition",
      replyTo: "social",
      content: `Apoio a publicação na semana 1, mas com uma condição: precisamos do kit visual mínimo antes. Um post com visual inconsistente faz mais mal do que ficar parado 5 dias. Consigo entregar templates básicos em 48h se recebermos os arquivos de marca. Isso resolve o timing sem comprometer a identidade.`,
    },
    // 4. Growth Strategist on scope
    {
      specialistId: "growth",
      specialistName: "Growth Strategist",
      type: "addition",
      content: `Ponto importante que ninguém mencionou ainda: precisamos definir os KPIs antes de iniciar. Sem métricas acordadas, o cliente vai avaliar o resultado por percepção — e percepção é volátil. Proponho: na reunião de kickoff, acordo os 3 KPIs primários (alcance, engajamento, leads/mês) e usamos eles como critério de renovação.`,
    },
    // 5. Paid Media Director identifies risk
    {
      specialistId: "paid",
      specialistName: "Paid Media Director",
      type: "risk",
      content: `Risco que precisa estar na mesa agora: se o cliente quiser resultados rápidos via tráfego pago, vamos precisar do pixel instalado antes do dia 1. Já vi projetos perderem 2 semanas esperando acesso ao Meta Business Manager. Preciso de confirmação do CEO: vamos incluir setup técnico (pixel, tag manager, analytics) como entrega da semana 1?`,
    },
    // 6. Agency CEO on scope/commercials
    {
      specialistId: "ceo",
      specialistName: "Agency CEO",
      type: "addition",
      replyTo: "paid",
      // ⛔ 16/08/2026 (5ª passada): dizia "podemos oferecer o pacote Growth
      // (R$ 4.500/mês)". "Growth" é um dos cinco rótulos-fantasma e R$ 4.500 é
      // um valor que `lib/agency/planos.ts` não conhece — o último resto da
      // terceira tabela de preço nesta tela. É tela INTERNA da agência, não do
      // prospect, mas número inventado numa tela interna é o texto de onde sai a
      // proposta que o prospect lê. Trocado por linguagem de ESCOPO, sem preço:
      // quem diz preço nesta casa é `planos.ts`, e ele não é chamado aqui.
      content: `Correto. Setup técnico entra na semana 1 como pré-requisito. Além disso, quero endereçar o escopo comercial: ${hasFullBrandBrain ? `Brand Brain completo é vantagem — podemos propor o escopo cheio (social + design + tráfego pago) com confiança. O valor sai da tabela da casa, não daqui.` : `Brand Brain incompleto significa que vamos precisar de uma sessão de diagnóstico paga antes do retainer. Isso protege a agência de executar às cegas.`} Proponho timeline de 3 meses iniciais com cláusula de renovação após milestone de 30 dias.`,
    },
    // 7. Brand Strategist synthesizes
    {
      specialistId: "strat",
      specialistName: "Brand Strategist",
      type: "consensus",
      content: `Alinhamento do time: posicionamento em paralelo com conteúdo básico na semana 1 (Social + Creative), setup técnico como pré-requisito (Paid), KPIs acordados no kickoff (Growth), e proposta comercial de 3 meses com milestone de 30 dias (CEO). Estratégia coesa e executável. Podemos avançar.`,
    },
  ];

  return turns;
}

// ─── V2 Consensus Builder ─────────────────────────────────────────────────────

function buildConsensus(project: Project, client: Client, specialists: StrategyRoomSpecialist[]): ConsensusLayer {
  const bb = client.brandBrain;
  const hasInstagram = hasChannel(client, "instagram");
  const hasTikTok = hasChannel(client, "tiktok");
  const hasLinkedIn = hasChannel(client, "linkedin");
  const primaryChannel = hasTikTok ? "TikTok" : hasInstagram ? "Instagram" : hasLinkedIn ? "LinkedIn" : "Instagram";
  const hasGoogle = hasChannel(client, "google");
  const hasMeta = hasInstagram || hasChannel(client, "facebook");
  const tone = toneIsStrategic(client);
  const hasFullBrandBrain = !!(bb?.businessSummary && bb?.toneOfVoice);

  const channels = [
    primaryChannel,
    ...(hasMeta && primaryChannel !== "Instagram" ? ["Instagram"] : []),
    ...(hasGoogle ? ["Google Ads"] : []),
    ...(hasMeta ? ["Meta Ads"] : []),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);

  const allDeliverables = [...new Set(specialists.flatMap((s) => s.suggestedDeliverables))].slice(0, 8);
  const allRisks = [...new Set(specialists.flatMap((s) => s.risks))].slice(0, 5);

  return {
    positioning: `${client.name} posicionada como ${tone ? "referência de autoridade e execução consistente" : "marca autêntica com proximidade genuína com o público"}. O projeto "${project.name}" é o ponto de partida para construir presença digital sólida e escalável.`,
    strategy: `Lançamento em 3 fases: (1) Fundação — semana 1–2: setup técnico, posicionamento, kit visual, primeiros posts; (2) Ritmo — semana 3–8: calendário editorial consistente, testes de formato, início de tráfego pago; (3) Escala — mês 3+: otimização baseada em dados, aumento de budget em canais validados.`,
    risks: allRisks,
    opportunities: [
      `${primaryChannel} com potencial orgânico alto — ${hasTikTok ? "TikTok favorece contas novas com bom conteúdo" : "Instagram Reels ainda tem alcance orgânico relevante em 2025"}`,
      `Brand Brain ${hasFullBrandBrain ? "completo" : "parcialmente preenchido"} — ${hasFullBrandBrain ? "vantagem competitiva real para personalização de conteúdo" : "oportunidade de enriquecer durante a fase de diagnóstico"}`,
      "Primeiro cliente da agência — chance de construir case de referência com atenção máxima da equipe",
      "Escopo faseado reduz risco de ambos os lados e facilita renovação",
    ],
    // 16/08/2026: dizia "Growth"/"Starter" — nomes de plano que o catálogo desta
    // casa não tem (`lib/agency/planos.ts`). Trocado por linguagem de ESCOPO.
    recommendedPackage: hasFullBrandBrain ? "Social + Design + Tráfego Pago — 3 meses" : "Social + Design — 3 meses, expandir após diagnóstico",
    recommendedChannels: channels,
    recommendedDeliverables: allDeliverables,
  };
}

// ─── V2 Executive Summary Builder ────────────────────────────────────────────

function buildExecutiveSummary(project: Project, client: Client, specialists: StrategyRoomSpecialist[], consensus: ConsensusLayer): ExecutiveSummary {
  const hasFullBrandBrain = !!(client.brandBrain?.businessSummary && client.brandBrain?.toneOfVoice);
  const highConf = specialists.filter((s) => s.confidence >= 8);
  const avgConf = specialists.reduce((a, s) => a + s.confidence, 0) / specialists.length;
  const confidenceScore = Math.round(Math.min(10, avgConf * 0.85 + (hasFullBrandBrain ? 1.5 : 0)));

  const hasInstagram = hasChannel(client, "instagram");
  const hasTikTok = hasChannel(client, "tiktok");
  const primaryChannel = hasTikTok ? "TikTok" : hasInstagram ? "Instagram" : "Instagram";

  return {
    biggestOpportunity: `${client.name} tem Brand Brain ${hasFullBrandBrain ? "completo" : "em construção"} e está no início da jornada digital — janela de 90 dias para capturar autoridade orgânica em ${primaryChannel} antes que concorrentes percebam e invistam no mesmo espaço.`,
    biggestRisk: `Execução sem posicionamento claro. Se a equipe começar a produzir conteúdo antes de alinhar tom, visual e mensagem-chave, o custo de retrabalho nos primeiros 30 dias pode dobrar. O Brand Strategist e o Creative Director precisam estar alinhados antes do dia 1 de produção.`,
    recommendedAction: `Agendar kickoff com ${client.name} nos próximos 5 dias úteis. Pautas obrigatórias: (1) aprovar posicionamento e pilares de conteúdo, (2) compartilhar arquivos de marca para o kit visual, (3) alinhar KPIs e critérios de sucesso do mês 1. Proposta de ${consensus.recommendedPackage} pode ser apresentada neste mesmo encontro.`,
    confidenceScore,
  };
}

// ─── Legacy Synthesis Builder (kept for backward compat) ─────────────────────

function buildSynthesis(
  project: Project,
  client: Client,
  specialists: StrategyRoomSpecialist[]
): ReturnType<typeof buildSynthesisInternal> {
  return buildSynthesisInternal(project, client, specialists);
}

function buildSynthesisInternal(project: Project, client: Client, specialists: StrategyRoomSpecialist[]) {
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
    recommendedStrategy: `Para "${project.name}" com ${client.name}: iniciar com posicionamento e calendário editorial sólidos antes de escalar. Prioridade nos primeiros 30 dias é consistência e tom. ${bb?.positioning ? `Diferencial a reforçar: ${bb.positioning.slice(0, 100)}.` : ""}`,
    recommendedServices,
    proposalImplications: `Proposta deve incluir: ${allDeliverables.slice(0, 3).join(", ")}. Escopo faseado recomendado (lançamento → volume). Prazo sugerido: 3–6 meses de retainer.`,
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
    buildBrandStrategist(project, client, briefing),
    buildSocialMediaDirector(project, client, briefing),
    buildCreativeDirector(project, client, briefing),
    buildPaidMediaDirector(project, client, briefing),
    buildGrowthStrategist(project, client, briefing),
    buildAgencyCEO(project, client, briefing),
  ];

  const finalSynthesis = buildSynthesis(project, client, specialists);
  const debateTurns = buildDebate(project, client, specialists);
  const consensus = buildConsensus(project, client, specialists);
  const executiveSummary = buildExecutiveSummary(project, client, specialists, consensus);

  return {
    projectId: project.id,
    clientId: client.id,
    generatedAt: new Date().toISOString(),
    specialists,
    finalSynthesis,
    debateTurns,
    consensus,
    executiveSummary,
    status: "ready",
  };
}
