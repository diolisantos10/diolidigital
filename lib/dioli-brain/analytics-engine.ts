// Dioli Brain — Analytics Engine
// Transforms upstream canvases (Strategy + Social + Design + Traffic) into an AnalyticsCanvas.
// Reasons through DIOLI_COGNITIVE_FLOW. Rule-based engine — no external AI calls.
//
// Dioli Standard: Analytics requires at minimum a Strategy Canvas.
// Analytics never invents metrics — it structures measurement for what was planned.

import { DIOLI_COGNITIVE_FLOW } from "./cognitive-flow";
import type { StrategyCanvas } from "./strategy-canvas";
import type { SocialCanvas } from "./social-canvas";
import type { DesignCanvas } from "./design-canvas";
import type { TrafficCanvas } from "./traffic-canvas";
import {
  runAnalyticsQualityGate,
  type AnalyticsCanvas,
  type AnalyticsFlowStep,
  type AnalyticsRecommendation,
  type AttributionLayer,
  type AttributionTouchpoint,
  type DeptPerformanceSummary,
  type KPIItem,
  type PerformanceGap,
} from "./analytics-canvas";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface AnalyticsEngineInput {
  strategyCanvas: StrategyCanvas;     // required
  socialCanvas?: SocialCanvas;        // optional — enriches content KPIs
  designCanvas?: DesignCanvas;        // optional — adds creative KPIs
  trafficCanvas?: TrafficCanvas;      // optional — adds paid media KPIs
  requestId?: string;
  source?: "request" | "simulation";
}

// ── Segment analytics profiles ────────────────────────────────────────────────
// Order: specific → generic (same collision-prevention rule as other engines).

interface AnalyticsSegmentProfile {
  match: RegExp;
  primaryKPI: string;
  reportingCadence: string;
  dashboardPlatform: string;
  getKPIs: (hasSocial: boolean, hasTraffic: boolean) => Partial<KPIItem>[];
  getAttributionSetup: () => string[];
  getAttributionRationale: (hasSocial: boolean, hasTraffic: boolean) => string;
  getGaps: () => Partial<PerformanceGap>[];
  getInsights: (segment: string) => string[];
  getAlertThresholds: () => string[];
}

const ANALYTICS_PROFILES: AnalyticsSegmentProfile[] = [
  {
    match: /premium|fine|alta gastronomia|sofisticad|luxo|exclusiv/i,
    primaryKPI: "Reservas via campanhas (mês)",
    reportingCadence: "Quinzenal + relatório mensal",
    dashboardPlatform: "Google Looker Studio + Meta Business Suite",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Reservas por campanha", unit: "reservas/mês", baselineValue: "N/D", targetValue: "30+", measurementPeriod: "mensal", dataSource: "WhatsApp + reservas manuais", status: "not_started" },
      { category: "traffic", name: "Custo por reserva (CPR)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 80", measurementPeriod: "mensal", dataSource: "Meta Ads Manager", status: "not_started" },
      { category: "business", name: "ROAS de campanhas", unit: "x", baselineValue: "N/D", targetValue: "> 6x", measurementPeriod: "mensal", dataSource: "Meta Ads Manager", status: "not_started" },
      ...(hasSocial ? [{ category: "content" as const, name: "Taxa de engajamento no Instagram", unit: "%", baselineValue: "N/D", targetValue: "> 4%", measurementPeriod: "semanal", dataSource: "Instagram Insights", status: "not_started" as const }] : []),
      { category: "brand", name: "Perfil — crescimento de seguidores", unit: "novos/mês", baselineValue: "N/D", targetValue: "+200/mês", measurementPeriod: "mensal", dataSource: "Instagram Insights", status: "not_started" },
    ],
    getAttributionSetup: () => ["Meta Pixel instalado no site", "Rastreamento de WhatsApp via UTM", "Google Analytics 4 configurado", "Relatório mensal de atribuição"],
    getAttributionRationale: () => "Modelo time_decay favorece touchpoints recentes — adequado para decisão de reserva que ocorre próximo à data. Valoriza o último anúncio visto antes da ação.",
    getGaps: () => [
      { area: "Rastreamento de reservas", currentState: "Reservas registradas manualmente", targetState: "Origem de cada reserva rastreada", gapDescription: "Sem UTM ou sistema de reservas integrado", priority: "alta", estimatedImpact: "Visibilidade completa do ROI de cada campanha" },
      { area: "Recuperação de ticket abandono", currentState: "Sem retargeting estruturado", targetState: "Sequência de retargeting para visitantes", gapDescription: "Visitantes do site não convertidos não são reativados", priority: "media", estimatedImpact: "Aumento de 15–25% na taxa de conversão" },
    ],
    getInsights: (segment) => [
      `Segmento premium tem ticket médio alto — ROAS de 6x+ é alcançável mesmo com CPM elevado.`,
      `Datas comemorativas (Dia dos Namorados, Natal, aniversários) são responsáveis por 40–60% das reservas via campanha.`,
      `Instagram Stories e Reels têm melhor desempenho em engajamento que posts estáticos para o segmento premium.`,
    ],
    getAlertThresholds: () => [
      "Se CPR > R$ 150, revisar segmentação e criativos",
      "Se ROAS < 4x por 2 semanas seguidas, pausar campanha e revisar oferta",
      "Se engajamento < 2%, revisar calendário de conteúdo",
    ],
  },
  {
    match: /restaurante|sushi|pizza|hamburgue|fast\s*food|caf[eé]\b|bar\b|lanchon|padaria|pastelaria|a[çc]a[íi]|churrascaria|gastronomia/i,
    primaryKPI: "Pedidos adicionais via campanha (mês)",
    reportingCadence: "Semanal + relatório mensal",
    dashboardPlatform: "Meta Business Suite + Google Analytics 4",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Pedidos adicionais via campanha", unit: "pedidos/mês", baselineValue: "N/D", targetValue: "100+", measurementPeriod: "mensal", dataSource: "WhatsApp + ifood (se aplicável)", status: "not_started" },
      { category: "traffic", name: "Custo por pedido (CPO)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 25", measurementPeriod: "semanal", dataSource: "Meta Ads Manager", status: "not_started" },
      ...(hasSocial ? [{ category: "content" as const, name: "Alcance semanal de posts", unit: "pessoas", baselineValue: "N/D", targetValue: "5K+/semana", measurementPeriod: "semanal", dataSource: "Instagram Insights", status: "not_started" as const }] : []),
      { category: "business", name: "Movimento em dias fracos (seg–qua)", unit: "% vs semana", baselineValue: "N/D", targetValue: "+20%", measurementPeriod: "semanal", dataSource: "Controle de caixa", status: "not_started" },
    ],
    getAttributionSetup: () => ["Meta Pixel configurado no site/cardápio digital", "Link UTM para WhatsApp", "Pixel de conversão para cliques em 'Como chegar'", "Rastreamento de clique em número de telefone"],
    getAttributionRationale: () => "Modelo last_click adequado para restaurantes: decisão de consumo é impulsiva e o último anúncio visto (ex: promoção de almoço às 11h) é geralmente o trigger de conversão.",
    getGaps: () => [
      { area: "Rastreamento de movimento em dias fracos", currentState: "Sem correlação entre campanhas e movimento real", targetState: "Dashboard com campanha ativa × movimento diário", gapDescription: "Impossível saber se o anúncio de terça está trazendo mais clientes na terça", priority: "alta", estimatedImpact: "Otimização de budget: desligar o que não funciona, dobrar o que funciona" },
      { area: "Retenção e recorrência", currentState: "Sem programa de recorrência", targetState: "Retargeting de clientes antigos + programa de fidelidade", gapDescription: "Nenhuma campanha para trazer clientes que já visitaram de volta", priority: "media", estimatedImpact: "+15–30% no faturamento recorrente" },
    ],
    getInsights: (segment) => [
      `Anúncios de restaurante têm melhor CTR quando veiculados nos horários de 10h30–12h e 17h30–19h.`,
      `Campanhas de promoção de dias fracos com desconto real (não "desconto de vitrine") têm taxa de conversão 3× maior.`,
      `Google Maps ads têm melhor ROI que Meta para captação de clientes novos na região.`,
    ],
    getAlertThresholds: () => [
      "Se CPO > R$ 40, pausar e revisar criativo/oferta",
      "Se CTR de Stories < 1.2%, trocar formato/criativo",
      "Se movimento seg–qua não crescer em 30 dias, revisar segmentação geográfica",
    ],
  },
  {
    match: /e-?commerce|loja\s*(online|virtual)|marketplace|dropship/i,
    primaryKPI: "ROAS (retorno sobre investimento em anúncios)",
    reportingCadence: "Diário (alertas) + semanal + mensal",
    dashboardPlatform: "Google Analytics 4 + Meta Ads Manager + Google Looker Studio",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "ROAS geral", unit: "x", baselineValue: "N/D", targetValue: "> 4x", measurementPeriod: "semanal", dataSource: "Meta Ads Manager + Google Ads", status: "not_started" },
      { category: "traffic", name: "CAC (custo de aquisição de cliente)", unit: "R$", baselineValue: "N/D", targetValue: "< 35% do ticket médio", measurementPeriod: "mensal", dataSource: "Google Analytics 4", status: "not_started" },
      { category: "business", name: "Taxa de conversão da loja", unit: "%", baselineValue: "N/D", targetValue: "> 2%", measurementPeriod: "semanal", dataSource: "Google Analytics 4", status: "not_started" },
      { category: "business", name: "Taxa de recuperação de carrinho", unit: "%", baselineValue: "N/D", targetValue: "> 15%", measurementPeriod: "mensal", dataSource: "E-mail + Meta retargeting", status: "not_started" },
      ...(hasSocial ? [{ category: "content" as const, name: "Salvamentos + compartilhamentos", unit: "interações/mês", baselineValue: "N/D", targetValue: "> 500/mês", measurementPeriod: "mensal", dataSource: "Instagram Insights", status: "not_started" as const }] : []),
    ],
    getAttributionSetup: () => ["Meta Pixel com eventos de produto e compra", "Google Tag Manager + GA4 com conversões", "UTMs em todos os links de campanha", "Integração de CRM/e-mail com GA4", "Dashboard de ROAS diário no Looker Studio"],
    getAttributionRationale: () => "Modelo linear para e-commerce com funil longo — distribui crédito igualmente entre awareness, consideração e conversão. Para SKUs impulsivos, usar last_click.",
    getGaps: () => [
      { area: "Recuperação de carrinho abandonado", currentState: "Sem campanha de recuperação ativa", targetState: "Sequência de retargeting 1h, 24h, 72h pós-abandono", gapDescription: "~70% dos carrinhos são abandonados sem nenhuma ação de recuperação", priority: "alta", estimatedImpact: "Aumento de 15–25% no faturamento sem novo tráfego" },
      { area: "Rastreamento de conversão iOS", currentState: "Pixel com restrições pós-iOS 14", targetState: "Conversions API + modelagem de atribuição", gapDescription: "30–40% das conversões podem estar não rastreadas por restrições de privacidade", priority: "alta", estimatedImpact: "Melhoria de 20–35% na otimização automática das campanhas" },
    ],
    getInsights: (segment) => [
      `Para e-commerce, o ROAS deve ser analisado por nível de funil: topo (1.5–2x aceitável) vs fundo (> 5x esperado).`,
      `Teste A/B de criativos com pelo menos 2 variações por campanha é crítico — vencedor tem CTR 40–120% maior.`,
      `Clientes que compram 2× têm LTV 5× maior — programa de recompra deve ser prioridade.`,
    ],
    getAlertThresholds: () => [
      "Se ROAS < 2x por 3 dias seguidos, alertar e revisar budget",
      "Se taxa de conversão cair > 20% em uma semana, investigar site/landing page",
      "Se CAC superar 50% do ticket médio, pausar campanhas de aquisição",
    ],
  },
  {
    match: /cl[íi]nica|consult[óo]rio|dent|m[ée]dic|est[ée]tica(?!\s+capilar)|fisio|psico|sa[úu]de/i,
    primaryKPI: "Agendamentos via campanha (mês)",
    reportingCadence: "Semanal + relatório mensal",
    dashboardPlatform: "Google Analytics 4 + Meta Business Suite",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Agendamentos via campanha", unit: "agendamentos/mês", baselineValue: "N/D", targetValue: "40+", measurementPeriod: "mensal", dataSource: "WhatsApp + sistema de agendamento", status: "not_started" },
      { category: "traffic", name: "CPL (custo por lead de agendamento)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 70", measurementPeriod: "mensal", dataSource: "Meta Ads + Google Ads", status: "not_started" },
      { category: "business", name: "Taxa de show (comparecimento)", unit: "%", baselineValue: "N/D", targetValue: "> 65%", measurementPeriod: "mensal", dataSource: "Controle interno", status: "not_started" },
      ...(hasSocial ? [{ category: "content" as const, name: "Alcance de conteúdo educativo", unit: "pessoas", baselineValue: "N/D", targetValue: "3K+/semana", measurementPeriod: "semanal", dataSource: "Instagram Insights", status: "not_started" as const }] : []),
    ],
    getAttributionSetup: () => ["Meta Pixel no site da clínica", "Rastreamento de clique em WhatsApp", "Google Ads com conversão de ligação", "CRM de agendamentos com campo de origem", "Google Analytics 4"],
    getAttributionRationale: () => "Modelo time_decay para clínicas: ciclo de decisão de 3–7 dias — os últimos touchpoints (anúncio do dia da decisão, busca do nome) devem receber mais crédito.",
    getGaps: () => [
      { area: "Taxa de show de leads", currentState: "Leads chegam mas muitos não comparecem", targetState: "Sequência de confirmação por WhatsApp/SMS", gapDescription: "Sem confirmação automatizada reduz show rate para 40–50%", priority: "alta", estimatedImpact: "Melhoria de 15–25pp na taxa de show — receita significativa" },
      { area: "Retargeting de leads que não agendaram", currentState: "Lead que não respondeu é perdido", targetState: "Follow-up automatizado em 24h, 72h e 7 dias", gapDescription: "60% dos leads qualificados não convertem no primeiro contato", priority: "media", estimatedImpact: "+20–30 agendamentos/mês sem custo adicional" },
    ],
    getInsights: (segment) => [
      `Para clínicas, o Google Search tem melhor qualidade de lead que Meta — CPL 20–40% maior mas taxa de comparecimento 25% superior.`,
      `Conteúdo educativo sobre procedimentos gera leads mais qualificados que anúncios diretos de desconto.`,
      `Leads de segunda-feira às 9h–11h têm a melhor taxa de conversão para agendamento.`,
    ],
    getAlertThresholds: () => [
      "Se CPL > R$ 120, revisar segmentação e landing page",
      "Se taxa de show cair abaixo de 50%, implementar confirmação automática",
      "Se taxa de conversão lead→agendamento < 30%, revisar processo de atendimento",
    ],
  },
  {
    match: /acad[eê]mia|crossfit|personal|fit|treino|gym|muscula[çc]|pilates/i,
    primaryKPI: "Novas matrículas via campanha (mês)",
    reportingCadence: "Semanal + relatório mensal",
    dashboardPlatform: "Meta Business Suite + Google Analytics 4",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Novas matrículas via campanha", unit: "matrículas/mês", baselineValue: "N/D", targetValue: "15+", measurementPeriod: "mensal", dataSource: "CRM da academia", status: "not_started" },
      { category: "traffic", name: "Custo por matrícula (CPA)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 60", measurementPeriod: "mensal", dataSource: "Meta Ads Manager", status: "not_started" },
      { category: "business", name: "Taxa de conversão lead → matrícula", unit: "%", baselineValue: "N/D", targetValue: "> 25%", measurementPeriod: "mensal", dataSource: "CRM", status: "not_started" },
      { category: "business", name: "Churn mensal (cancelamentos)", unit: "%", baselineValue: "N/D", targetValue: "< 8%", measurementPeriod: "mensal", dataSource: "Sistema de controle", status: "not_started" },
    ],
    getAttributionSetup: () => ["Meta Pixel com evento de lead", "WhatsApp com UTM de origem", "Planilha/CRM de rastreamento de matrícula por origem", "Google Analytics 4 no site"],
    getAttributionRationale: () => "Modelo last_click para academia: a promoção do mês (desconto de matrícula) é o trigger final. O último anúncio visto que comunicou a oferta recebe o crédito.",
    getGaps: () => [
      { area: "Sazonalidade: inverno", currentState: "Queda de matrículas em junho–agosto sem estratégia", targetState: "Campanha de retenção e oferta de inverno pré-programada", gapDescription: "Churn aumenta 30–50% no inverno sem ação proativa", priority: "alta", estimatedImpact: "Redução de churn de 5–10pp = R$ 2.000–8.000/mês retidos" },
      { area: "Nutrição de leads frios", currentState: "Lead que não matriculou é perdido", targetState: "Sequência de e-mail/WhatsApp com conteúdo de transformação", gapDescription: "50% dos leads fitness precisam de 2–4 semanas para decidir", priority: "media", estimatedImpact: "+5–8 matrículas/mês sem custo adicional de mídia" },
    ],
    getInsights: (segment) => [
      `Janeiro e março são os meses com maior taxa de conversão — budget deve ser aumentado nesses meses.`,
      `Transformações reais com depoimento (antes e depois) têm CTR 2–3× maior que criativos genéricos de equipamento.`,
      `WhatsApp direto com oferta de semana gratuita tem taxa de conversão 35% maior que landing page.`,
    ],
    getAlertThresholds: () => [
      "Se churn > 10% em um mês, revisar retenção urgentemente",
      "Se CPA > R$ 100, revisar oferta e segmentação",
      "Se matrículas caírem > 30% vs mês anterior, acionar campanha de sazonalidade",
    ],
  },
  {
    match: /sal[ãa]o|beleza|barbearia|cabelo|est[ée]tica capilar|nail|manicure|maquiagem|cabeleireira/i,
    primaryKPI: "Agendamentos via campanha (mês)",
    reportingCadence: "Semanal + relatório mensal",
    dashboardPlatform: "Meta Business Suite + Instagram Insights",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Agendamentos via campanha", unit: "agendamentos/mês", baselineValue: "N/D", targetValue: "60+", measurementPeriod: "mensal", dataSource: "WhatsApp + sistema de agendamento", status: "not_started" },
      { category: "traffic", name: "Custo por agendamento (CPA)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 30", measurementPeriod: "mensal", dataSource: "Meta Ads Manager", status: "not_started" },
      { category: "business", name: "Taxa de retorno de clientes", unit: "%", baselineValue: "N/D", targetValue: "> 60%", measurementPeriod: "mensal", dataSource: "Controle interno", status: "not_started" },
      ...(hasSocial ? [{ category: "content" as const, name: "Alcance de portfólio no Instagram", unit: "pessoas", baselineValue: "N/D", targetValue: "5K+/semana", measurementPeriod: "semanal", dataSource: "Instagram Insights", status: "not_started" as const }] : []),
    ],
    getAttributionSetup: () => ["Meta Pixel no link da bio (linktree/site)", "Rastreamento UTM no WhatsApp", "Instagram Insights para conteúdo orgânico", "Planilha de origem de novos clientes"],
    getAttributionRationale: () => "Modelo last_click para beleza: o agendamento é tipicamente espontâneo após ver uma foto de portfólio ou oferta de horário vago — o último touchpoint tem crédito alto.",
    getGaps: () => [
      { area: "Preenchimento de horários vagos", currentState: "Horários vagos sem campanha de encaixe", targetState: "Campanha de urgência para horários disponíveis em 48h", gapDescription: "Hora não agendada é receita perdida — não pode ser recuperada depois", priority: "alta", estimatedImpact: "Preenchimento de 60–80% dos horários ociosos" },
      { area: "Portfólio de resultados", currentState: "Poucos registros de antes e depois", targetState: "Portfólio consistente em Reels e Carrossel", gapDescription: "Portfólio é o principal driver de conversão no segmento de beleza", priority: "media", estimatedImpact: "+30–50% na taxa de conversão de perfil para agendamento" },
    ],
    getInsights: (segment) => [
      `Reels com transformações de cabelo têm alcance orgânico 5–8× maior que posts estáticos.`,
      `Stories de horários disponíveis (agenda aberta) têm conversão imediata — melhor para preenchimento de agenda.`,
      `Clientes de coloração têm recorrência mensal — programa de fidelidade tem ROI muito alto.`,
    ],
    getAlertThresholds: () => [
      "Se CPA > R$ 50, revisar oferta e segmentação local",
      "Se taxa de retorno cair < 50%, criar campanha de reativação",
      "Se posts de portfólio tiverem alcance < 500, revisar formato e hashtags",
    ],
  },
  {
    match: /servi[çc]|consult|agência|assessoria|contabilidade|advocacia|imobiliária|seguros/i,
    primaryKPI: "Leads qualificados por mês",
    reportingCadence: "Quinzenal + relatório mensal",
    dashboardPlatform: "Google Analytics 4 + LinkedIn Campaign Manager + Looker Studio",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Leads qualificados via campanha", unit: "leads/mês", baselineValue: "N/D", targetValue: "15+", measurementPeriod: "mensal", dataSource: "CRM + LinkedIn Insights", status: "not_started" },
      { category: "traffic", name: "CPL qualificado (B2B)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 180", measurementPeriod: "mensal", dataSource: "LinkedIn + Google Ads", status: "not_started" },
      { category: "business", name: "Taxa de qualificação de leads", unit: "%", baselineValue: "N/D", targetValue: "> 40%", measurementPeriod: "mensal", dataSource: "CRM", status: "not_started" },
      { category: "business", name: "Proposta gerada por lead", unit: "%", baselineValue: "N/D", targetValue: "> 30%", measurementPeriod: "mensal", dataSource: "CRM / pipeline", status: "not_started" },
    ],
    getAttributionSetup: () => ["LinkedIn Insight Tag no site", "Google Tag Manager + GA4", "CRM com campo de origem de lead obrigatório", "UTMs padronizados para todos os canais", "Looker Studio com funil de vendas"],
    getAttributionRationale: () => "Modelo position_based (40% primeiro toque, 40% último, 20% distribuído) para B2B: tanto o awareness inicial (LinkedIn) quanto a busca de intenção (Google) são críticos para a decisão de contato.",
    getGaps: () => [
      { area: "Qualificação de leads antes do contato comercial", currentState: "Leads chegam sem qualificação de porte/budget", targetState: "Formulário de qualificação com perguntas de segmentação", gapDescription: "Time comercial gasta tempo com leads não qualificados", priority: "alta", estimatedImpact: "Redução de 50% no tempo comercial por lead qualificado" },
      { area: "Nutrição de leads frios no ciclo longo", currentState: "Lead B2B sem nutrição até próxima prospecção", targetState: "Sequência de conteúdo por e-mail/LinkedIn nos primeiros 60 dias", gapDescription: "Ciclo B2B é de 30–90 dias — sem nutrição, lead esfria e vai para concorrente", priority: "media", estimatedImpact: "+30–40% na taxa de fechamento de propostas" },
    ],
    getInsights: (segment) => [
      `LinkedIn tem CPM 5–8× maior que Meta mas qualidade de lead B2B é 3–4× superior — calcular ROI por CPL qualificado, não CPL bruto.`,
      `Conteúdo de caso de sucesso tem conversão 60% maior que conteúdo institucional no LinkedIn.`,
      `Decisores B2B fazem 5–7 pesquisas antes de solicitar proposta — remarketing de longo prazo (90 dias) é essencial.`,
    ],
    getAlertThresholds: () => [
      "Se CPL qualificado > R$ 300, revisar segmentação LinkedIn e Google",
      "Se taxa de qualificação cair < 25%, revisar formulário e critérios de lead",
      "Se pipeline de propostas cair > 30%, acionar campanha de ativação urgente",
    ],
  },
  {
    match: /educa[çc]|curso|escola|faculdade|treinamento|capacita[çc]|mentoria/i,
    primaryKPI: "Matrículas via campanha (período letivo)",
    reportingCadence: "Semanal durante captação + mensal fora de captação",
    dashboardPlatform: "Google Analytics 4 + Meta Ads Manager + Google Looker Studio",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Matrículas via campanha", unit: "matrículas/mês", baselineValue: "N/D", targetValue: "30+", measurementPeriod: "mensal", dataSource: "Sistema de matrículas", status: "not_started" },
      { category: "traffic", name: "Custo por matrícula (CPA)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 80", measurementPeriod: "mensal", dataSource: "Meta + Google Ads", status: "not_started" },
      { category: "business", name: "Taxa de conversão lead → matrícula", unit: "%", baselineValue: "N/D", targetValue: "> 20%", measurementPeriod: "mensal", dataSource: "CRM", status: "not_started" },
      ...(hasSocial ? [{ category: "content" as const, name: "Visualizações de vídeo educativo", unit: "views/mês", baselineValue: "N/D", targetValue: "10K+/mês", measurementPeriod: "mensal", dataSource: "YouTube + Instagram", status: "not_started" as const }] : []),
    ],
    getAttributionSetup: () => ["GA4 com conversão de matrícula", "Meta Pixel com evento de lead", "YouTube Ads com conversão de acesso à página de matrícula", "CRM com campo de origem obrigatório", "UTMs em todos os materiais digitais"],
    getAttributionRationale: () => "Modelo linear para educação: todos os touchpoints importam — o vídeo educativo no YouTube, o anúncio de urgência no Meta e a busca final no Google contribuem igualmente para a matrícula.",
    getGaps: () => [
      { area: "Sazonalidade de captação", currentState: "Campanhas ativas o ano todo sem intensidade variável", targetState: "Budget concentrado em períodos de captação (jan, jul) com manutenção nos demais", gapDescription: "Budget distribuído uniformemente desperdiça 40–50% em períodos de baixa conversão", priority: "alta", estimatedImpact: "Aumento de 20–35% no número de matrículas sem aumentar budget total" },
      { area: "Nutrição de lead após inscrição gratuita", currentState: "Lead que fez aula gratuita não é nutrido", targetState: "Sequência de e-mail com conteúdo de prova e urgência por 14 dias", gapDescription: "Taxa de matrícula de leads de aula gratuita cai de 30% para < 10% após 7 dias sem contato", priority: "alta", estimatedImpact: "+10–15 matrículas/mês sem custo adicional" },
    ],
    getInsights: (segment) => [
      `Prova social (depoimento de aluno com resultados concretos) aumenta conversão de landing page em 40–80%.`,
      `Urgência real (número de vagas decrescente, não fictício) tem conversão 2–3× maior que urgência fabricada.`,
      `Leads educacionais têm janela de decisão de 7–21 dias — nutrição por e-mail neste período é crítica.`,
    ],
    getAlertThresholds: () => [
      "Se CPA > R$ 150, revisar landing page e oferta",
      "Se taxa de matrícula de leads de aula gratuita < 10%, revisar sequência de nutrição",
      "Se matrículas caírem > 40% vs ano anterior no mesmo período, escalar budget",
    ],
  },
  {
    match: /.*/,
    primaryKPI: "Leads qualificados por mês",
    reportingCadence: "Semanal + relatório mensal",
    dashboardPlatform: "Google Analytics 4 + Meta Business Suite",
    getKPIs: (hasSocial, hasTraffic) => [
      { category: "business", name: "Leads via campanha", unit: "leads/mês", baselineValue: "N/D", targetValue: "30+", measurementPeriod: "mensal", dataSource: "CRM / WhatsApp", status: "not_started" },
      { category: "traffic", name: "CPL (custo por lead)", unit: "R$", baselineValue: "N/D", targetValue: "< R$ 80", measurementPeriod: "mensal", dataSource: "Meta Ads Manager", status: "not_started" },
      ...(hasSocial ? [{ category: "content" as const, name: "Alcance orgânico mensal", unit: "pessoas", baselineValue: "N/D", targetValue: "5K+/mês", measurementPeriod: "mensal", dataSource: "Instagram Insights", status: "not_started" as const }] : []),
      { category: "business", name: "Taxa de conversão lead → cliente", unit: "%", baselineValue: "N/D", targetValue: "> 20%", measurementPeriod: "mensal", dataSource: "CRM", status: "not_started" },
    ],
    getAttributionSetup: () => ["Meta Pixel instalado", "Google Analytics 4 configurado", "UTMs em todos os links de campanha", "CRM com campo de origem de lead"],
    getAttributionRationale: () => "Modelo last_click como ponto de partida — adequado para a maioria dos segmentos B2C. Revisar conforme dados de conversão ficarem disponíveis.",
    getGaps: () => [
      { area: "Rastreamento de conversão", currentState: "Sem métricas claras de origem de leads", targetState: "Dashboard de atribuição com origem por canal", gapDescription: "Impossível otimizar o que não é medido", priority: "alta", estimatedImpact: "Base para todas as otimizações futuras" },
      { area: "Retargeting estruturado", currentState: "Sem campanha de remarketing ativa", targetState: "Retargeting de visitantes do site e engajados no Instagram", gapDescription: "Leads que visitaram o site e não converteram são potencial imediato", priority: "media", estimatedImpact: "+20–40% na taxa de conversão sem novos leads" },
    ],
    getInsights: (segment) => [
      `Rastreamento correto é a fundação — sem pixel e GA4 configurados, otimização é impossível.`,
      `Primeiros 90 dias devem ser usados para coletar dados e identificar o canal com melhor CAC.`,
      `A/B teste de criativos e ofertas é mais impactante que aumento de budget quando ROAS é baixo.`,
    ],
    getAlertThresholds: () => [
      "Se CPL > R$ 150, revisar segmentação e criativo",
      "Se ROAS < 2x, pausar e revisar estratégia antes de aumentar budget",
      "Se taxa de conversão < 1%, priorizar melhoria de landing page",
    ],
  },
];

function getAnalyticsProfile(segment: string): AnalyticsSegmentProfile {
  return ANALYTICS_PROFILES.find((p) => p.match.test(segment)) ?? ANALYTICS_PROFILES[ANALYTICS_PROFILES.length - 1];
}

// ── Attribution builder ───────────────────────────────────────────────────────

function buildAttributionLayer(
  profile: AnalyticsSegmentProfile,
  hasSocial: boolean,
  hasTraffic: boolean,
  trafficCanvas?: TrafficCanvas,
): AttributionLayer {
  const touchpoints: AttributionTouchpoint[] = [];

  if (hasTraffic && trafficCanvas) {
    trafficCanvas.recommendedChannels.forEach((ch, i) => {
      touchpoints.push({
        id: `tp_${i + 1}`,
        channel: ch,
        touchpointType: i === 0 ? "conversion" : i === 1 ? "engagement" : "awareness",
        estimatedContribution: i === 0 ? 45 : i === 1 ? 30 : 25,
        role: i === 0 ? `Campanha principal de ${ch}` : i === 1 ? `Campanha de suporte em ${ch}` : `Awareness via ${ch}`,
      });
    });
  } else {
    touchpoints.push(
      { id: "tp_1", channel: "meta_ads", touchpointType: "awareness", estimatedContribution: 40, role: "Primeiro contato via anúncio de alcance" },
      { id: "tp_2", channel: "instagram_organic", touchpointType: "engagement", estimatedContribution: 30, role: "Engajamento com conteúdo do perfil" },
      { id: "tp_3", channel: "google_search", touchpointType: "conversion", estimatedContribution: 30, role: "Busca direta pelo nome após ver anúncio" },
    );
  }

  if (hasSocial && !hasTraffic) {
    touchpoints.push({ id: "tp_organic", channel: "instagram_organic", touchpointType: "awareness", estimatedContribution: 25, role: "Conteúdo orgânico do plano social" });
  }

  const model = hasSocial && hasTraffic ? "time_decay" : hasTraffic ? "last_click" : "linear";

  return {
    recommendedModel: model,
    modelRationale: profile.getAttributionRationale(hasSocial, hasTraffic),
    touchpoints,
    conversionWindow: "7 dias post-clique + 1 dia view-through",
    analyticsSetupRequired: profile.getAttributionSetup(),
  };
}

// ── Cross-dept summaries ──────────────────────────────────────────────────────

function buildDeptSummaries(
  socialCanvas?: SocialCanvas,
  designCanvas?: DesignCanvas,
  trafficCanvas?: TrafficCanvas,
): DeptPerformanceSummary[] {
  const summaries: DeptPerformanceSummary[] = [];
  if (socialCanvas) {
    summaries.push({
      department: "Social Media",
      canvasesApproved: 1,
      keyMetric: "Temas de conteúdo planejados",
      keyMetricValue: `${socialCanvas.contentPlan.themes.length} temas / ${socialCanvas.contentPlan.weeks.length * 3} posts/mês`,
      trendIndicator: "stable",
    });
  }
  if (designCanvas) {
    summaries.push({
      department: "Design",
      canvasesApproved: 1,
      keyMetric: "Assets requisitados",
      keyMetricValue: `${designCanvas.assetRequirements?.length ?? 0} assets`,
      trendIndicator: "stable",
    });
  }
  if (trafficCanvas) {
    summaries.push({
      department: "Tráfego Pago",
      canvasesApproved: 1,
      keyMetric: "Budget mensal de mídia",
      keyMetricValue: `R$ ${trafficCanvas.budgetAllocation.mediaBudgetBRL.toLocaleString("pt-BR")}`,
      trendIndicator: "stable",
    });
  }
  return summaries;
}

// ── Recommendations builder ───────────────────────────────────────────────────

function buildRecommendations(
  hasSocial: boolean,
  hasDesign: boolean,
  hasTraffic: boolean,
  segment: string,
): AnalyticsRecommendation[] {
  const recs: AnalyticsRecommendation[] = [];
  recs.push({
    id: "rec_1",
    type: "setup",
    department: "analytics",
    title: "Instalar e configurar rastreamento completo",
    rationale: "Sem Meta Pixel, GA4 e UTMs configurados, todas as métricas são estimativas.",
    expectedImpact: "Base para todas as decisões de otimização.",
    effort: "medio",
    urgency: "imediata",
  });
  if (hasTraffic) {
    recs.push({
      id: "rec_2",
      type: "optimization",
      department: "traffic",
      title: "Testar 2 variações de criativo por campanha",
      rationale: "A/B teste de criativos reduz CPL em 30–50% após 2–3 semanas de dados.",
      expectedImpact: "Redução de CPL em 30–50%.",
      effort: "medio",
      urgency: "proximos_30_dias",
    });
    recs.push({
      id: "rec_3",
      type: "alert",
      department: "traffic",
      title: "Ativar alertas de performance no Meta Ads",
      rationale: "Alertas automáticos de CAC e ROAS permitem ação rápida antes de desperdício.",
      expectedImpact: "Prevenção de desperdício de budget.",
      effort: "baixo",
      urgency: "imediata",
    });
  }
  if (hasSocial) {
    recs.push({
      id: "rec_4",
      type: "test",
      department: "social",
      title: "Testar Reels vs Carrossel para conteúdo de resultado",
      rationale: "Reels têm alcance orgânico 3–5× maior mas carrossel tem mais salvamentos — identificar o melhor para o segmento.",
      expectedImpact: "Otimização do alcance e engajamento orgânico.",
      effort: "baixo",
      urgency: "proximos_30_dias",
    });
  }
  if (hasDesign) {
    recs.push({
      id: "rec_5",
      type: "optimization",
      department: "design",
      title: "Aplicar criativos aprovados no Design Canvas como variação de teste",
      rationale: "Design Canvas define conceito visual — campanha paga deve usar o conceito como variação A para o teste.",
      expectedImpact: "Consistência de marca + dados de performance por estilo visual.",
      effort: "baixo",
      urgency: "proximos_30_dias",
    });
  }
  recs.push({
    id: "rec_6",
    type: "opportunity",
    department: "analytics",
    title: "Dashboard mensal de performance cross-canal",
    rationale: "Relatório único com todos os KPIs por canal facilita decisão de budget e evidencia valor para o cliente.",
    expectedImpact: "Melhoria na retenção de clientes e aumento de ticket por expansão de serviços.",
    effort: "medio",
    urgency: "proximo_trimestre",
  });
  return recs;
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

function buildAnalyticsFlowTrace(
  strategyCanvas: StrategyCanvas,
  profile: AnalyticsSegmentProfile,
  hasTraffic: boolean,
): AnalyticsFlowStep[] {
  return DIOLI_COGNITIVE_FLOW.map((step) => {
    let summary = "";
    switch (step.id) {
      case "intention":   summary = `Analytics para: ${strategyCanvas.mainObjective}`;                                break;
      case "context":     summary = `Segmento: ${strategyCanvas.segment} — ${strategyCanvas.clientName}`;           break;
      case "certainty":   summary = `KPI primário: ${profile.primaryKPI} | Cadência: ${profile.reportingCadence}`; break;
      case "unknowns":    summary = "Verificados: dados baseline disponíveis, acesso às plataformas de analytics"; break;
      case "routing":     summary = "Rota: Analytics → KPI framework → attribution → recomendações → dashboard";   break;
      case "permission":  summary = "Permissões: Strategy Canvas presente — Analytics autorizado";                  break;
      case "brand":       summary = `Dashboard: ${profile.dashboardPlatform}`;                                      break;
      case "objective":   summary = `Medir: ${profile.primaryKPI} + attribution + gaps`;                           break;
      case "risk":        summary = "Risco: dados sem rastreamento não geram conclusões confiáveis";               break;
      case "approval":    summary = "Aguarda aprovação humana do Analytics Canvas";                                 break;
      case "training":    summary = "Dados de performance alimentam o Training Center para melhoria do Brain";     break;
      case "measurement": summary = hasTraffic ? "Mede ROAS, CAC, CPL por canal com atribuição configurada" : "Mede engajamento, alcance, leads e conversão orgânica"; break;
      default:            summary = `${step.label} — concluído`;
    }
    return { stepId: step.id, order: step.order, label: step.label, completed: true, summary };
  });
}

// ── Main Engine ───────────────────────────────────────────────────────────────

export function generateAnalyticsCanvas(input: AnalyticsEngineInput): AnalyticsCanvas {
  const { strategyCanvas, socialCanvas, designCanvas, trafficCanvas, requestId, source = "simulation" } = input;

  const profile    = getAnalyticsProfile(strategyCanvas.segment);
  const hasSocial  = !!socialCanvas;
  const hasDesign  = !!designCanvas;
  const hasTraffic = !!trafficCanvas;

  const rawKPIs    = profile.getKPIs(hasSocial, hasTraffic);
  const kpis: KPIItem[] = rawKPIs.map((k, i) => ({
    id: `kpi_${i + 1}`,
    category: k.category ?? "business",
    name: k.name ?? `KPI ${i + 1}`,
    description: k.name ?? "",
    unit: k.unit ?? "unidade",
    baselineValue: k.baselineValue ?? "N/D",
    targetValue: k.targetValue ?? "A definir",
    measurementPeriod: k.measurementPeriod ?? "mensal",
    dataSource: k.dataSource ?? "A definir",
    status: k.status ?? "not_started",
  }));

  if (hasTraffic && trafficCanvas) {
    kpis.push({
      id: `kpi_traffic_leads`,
      category: "traffic",
      name: "Leads projetados via tráfego pago",
      description: "Projeção do Traffic Canvas",
      unit: trafficCanvas.projectedMonthlyLeads.includes("ROAS") ? "ROAS" : "leads/mês",
      baselineValue: "N/D",
      targetValue: trafficCanvas.projectedMonthlyLeads,
      measurementPeriod: "mensal",
      dataSource: "Meta Ads Manager + Google Ads",
      status: "not_started",
    });
  }

  const attributionLayer = buildAttributionLayer(profile, hasSocial, hasTraffic, trafficCanvas);

  const rawGaps = profile.getGaps();
  const performanceGaps: PerformanceGap[] = rawGaps.map((g, i) => ({
    id: `gap_${i + 1}`,
    area: g.area ?? `Área ${i + 1}`,
    currentState: g.currentState ?? "",
    targetState: g.targetState ?? "",
    gapDescription: g.gapDescription ?? "",
    priority: g.priority ?? "media",
    estimatedImpact: g.estimatedImpact ?? "",
  }));

  const recommendations = buildRecommendations(hasSocial, hasDesign, hasTraffic, strategyCanvas.segment);
  const deptSummaries   = buildDeptSummaries(socialCanvas, designCanvas, trafficCanvas);

  const cognitiveFlowTrace = buildAnalyticsFlowTrace(strategyCanvas, profile, hasTraffic);

  const partial: Omit<AnalyticsCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source"> = {
    strategyCanvasId: strategyCanvas.id,
    socialCanvasId:   socialCanvas?.id,
    designCanvasId:   designCanvas?.id,
    trafficCanvasId:  trafficCanvas?.id,
    requestId:        requestId ?? strategyCanvas.requestId,
    clientName:       strategyCanvas.clientName,
    segment:          strategyCanvas.segment,

    mainObjective:    strategyCanvas.mainObjective,
    reportingCadence: profile.reportingCadence,
    dashboardPlatform: profile.dashboardPlatform,

    kpis,
    primaryKPI: profile.primaryKPI,

    attributionLayer,
    performanceGaps,
    recommendations,
    deptSummaries,

    keyInsights:      profile.getInsights(strategyCanvas.segment),
    alertThresholds:  profile.getAlertThresholds(),
  };

  const qualityGateResult = runAnalyticsQualityGate(partial);

  return {
    ...partial,
    id:     `ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    status: "draft",
    createdAt: new Date().toISOString(),
    qualityGateResult,
    cognitiveFlowTrace,
  };
}
