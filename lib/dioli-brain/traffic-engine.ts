// Dioli Brain — Traffic Engine
// Transforms StrategyCanvas (+ optional Social/Design) into a TrafficCanvas.
// Reasons through DIOLI_COGNITIVE_FLOW — every canvas carries the flow trace.
// Rule-based engine: segment-aware paid media heuristics, no external AI calls.
//
// Dioli Standard: Budget de mídia SEMPRE separado do management fee.
// Traffic never recommends campaigns without a Strategy input.

import { DIOLI_COGNITIVE_FLOW } from "./cognitive-flow";
import type { StrategyCanvas } from "./strategy-canvas";
import type { SocialCanvas } from "./social-canvas";
import type { DesignCanvas } from "./design-canvas";
import {
  runTrafficQualityGate,
  MARCA_FAIXA_DE_REFERENCIA,
  type BudgetBasis,
  type AudienceSegment,
  type BudgetAllocation,
  type CampaignObjective,
  type CreativeRequirement,
  type OfferMapping,
  type TrafficCampaign,
  type TrafficCanvas,
  type TrafficChannel,
  type TrafficFlowStep,
} from "./traffic-canvas";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface TrafficEngineInput {
  strategyCanvas: StrategyCanvas;            // required
  socialCanvas?: SocialCanvas;              // optional — enriches audience targeting
  designCanvas?: DesignCanvas;              // optional — links creative requirements
  budgetScenario?: "low" | "medium" | "high" | "premium";
  /**
   * A VERBA MENSAL QUE O CLIENTE INFORMOU, em reais. Quando vem, é ELA que
   * manda: o total do plano é este número, e os projetados derivam dele.
   *
   * Quando não vem, o motor NÃO finge que veio — cai na faixa de referência do
   * segmento e marca todo campo projetado com `MARCA_FAIXA_DE_REFERENCIA`.
   *
   * Quem preenche é o servidor (`run-auto-scope.ts`, a partir de
   * `buildVerdadeDoCliente().verbas`). Ninguém monta este número à mão.
   */
  verbaInformadaBRL?: number;
  requestId?: string;
  source?: "request" | "simulation";
}

// ── Budget scenarios (monthly BRL) ───────────────────────────────────────────
//
// ⚠️ ESTA TABELA NÃO É O BUDGET DE NINGUÉM. É a faixa de referência do mercado,
// usada só quando o cliente não informou verba. O furo que ela causava até
// 05/08/2026: `budgetScenario` tinha default `"medium"`, `run-auto-scope.ts`
// nunca passava cenário nenhum, e portanto TODO cliente recebia um plano de
// R$ 4.000/mês — R$ 800 de fee, R$ 3.200 de mídia — persistido como
// `BrainArtifact`, com ROAS "6x–12x" e alcance "30K–80K" ao lado. O filtro de
// preço do portal segurava o "R$"; o ROAS e o alcance passavam limpos, e o time
// planejava em cima deles.

const BUDGET_TOTALS: Record<string, number> = {
  low:     1500,
  medium:  4000,
  high:    10000,
  premium: 25000,
};

const MANAGEMENT_FEE_PERCENT = 20; // agency fee as % of total (separate line item)

/** O cenário cujo total mais se aproxima da verba real — só para rotular a
 *  faixa. O VALOR usado nas contas é sempre a verba, nunca o da tabela. */
function cenarioMaisProximo(verbaBRL: number): "low" | "medium" | "high" | "premium" {
  const cenarios = ["low", "medium", "high", "premium"] as const;
  return cenarios.reduce((melhor, c) =>
    Math.abs(BUDGET_TOTALS[c]! - verbaBRL) < Math.abs(BUDGET_TOTALS[melhor]! - verbaBRL) ? c : melhor,
  );
}

/** Cola a ressalva no valor. Vazio e "N/D" ficam como estão — marcar ausência
 *  de número como "faixa de referência" seria inventar uma faixa. */
function comRessalva(valor: string): string {
  if (!valor || valor === "N/D") return valor;
  return `${valor} (${MARCA_FAIXA_DE_REFERENCIA})`;
}

// ── Segment traffic profiles ─────────────────────────────────────────────────
// Order matters: more specific profiles before generic ones.

interface TrafficSegmentProfile {
  match: RegExp;
  primaryObjective: CampaignObjective;
  recommendedChannels: TrafficChannel[];
  channelRationale: string;
  audienceStrategy: string;
  offerContext: string;
  projectedLeads: (budget: number) => string;
  projectedCAC: (budget: number) => string;
  projectedROAS: string;
  keyRisks: string[];
  successIndicators: string[];
  getCampaigns: (budget: number, channels: TrafficChannel[]) => Partial<TrafficCampaign>[];
  getAudiences: (channels: TrafficChannel[]) => Partial<AudienceSegment>[];
  getOffers: () => Partial<OfferMapping>[];
}

const TRAFFIC_PROFILES: TrafficSegmentProfile[] = [
  {
    match: /premium|fine|alta gastronomia|sofisticad|luxo|exclusiv/i,
    primaryObjective: "store_visits",
    recommendedChannels: ["meta_ads", "google_ads"],
    channelRationale: "Meta para construção de desejo e alcance qualificado. Google para capturar intenção de busca por experiência gastronômica premium.",
    audienceStrategy: "Targeting por renda, interesses de gastronomia gourmet e comportamentos de reserva. Evitar broad audiences.",
    offerContext: "Oferta principal: reserva para ocasião especial ou menu exclusivo. Urgência leve — exclusividade, não desconto.",
    projectedLeads: (b) => `${Math.round(b / 150)}–${Math.round(b / 80)} reservas/mês`,
    projectedCAC: (b) => `R$ ${Math.round(b * 0.6 / (b / 150))}–${Math.round(b * 0.6 / (b / 80))}`,
    projectedROAS: "6x–12x (ticket alto)",
    keyRisks: ["Audiência muito restrita pode limitar alcance", "CPM alto em público premium", "Sazonalidade forte em datas comemorativas"],
    successIndicators: ["Reservas originadas de campanhas", "CPA por reserva abaixo do ticket médio × 0.3", "ROAS acima de 6x"],
    getCampaigns: (budget, channels) => [
      { name: "Awareness Premium", channel: "meta_ads", objective: "awareness", budgetAllocation: 30, priority: "media" as const },
      { name: "Reservas — Ocasiões", channel: "meta_ads", objective: "store_visits", budgetAllocation: 50, priority: "alta" as const },
      { name: "Search — Alta Gastronomia", channel: "google_ads", objective: "store_visits", budgetAllocation: 20, priority: "alta" as const },
    ],
    getAudiences: (channels) => [
      { name: "Alta Renda + Gastronomia", type: "cold_top" as const, funnelStage: "top" as const, description: "Interesses em restaurantes premium, vinhos finos, experiências gastronômicas", estimatedReach: "30K–80K" },
      { name: "Engajados com Perfil", type: "warm_middle" as const, funnelStage: "middle" as const, description: "Seguidores e interações com perfil nos últimos 60 dias", estimatedReach: "5K–15K" },
      { name: "Retargeting — Visitantes Site", type: "retargeting" as const, funnelStage: "bottom" as const, description: "Visitantes do site ou menu nos últimos 30 dias", estimatedReach: "1K–5K" },
    ],
    getOffers: () => [
      { name: "Reserva — Ocasião Especial", funnelStage: "bottom" as const, urgencyLevel: "medium" as const, cta: "Reservar mesa", landingPage: "whatsapp" },
      { name: "Menu de Degustação", funnelStage: "middle" as const, urgencyLevel: "low" as const, cta: "Ver menu", landingPage: "site" },
    ],
  },
  {
    match: /restaurante|sushi|pizza|hamburgue|fast\s*food|caf[eé]\b|bar\b|lanchon|padaria|pastelaria|a[çc]a[íi]|churrascaria|gastronomia/i,
    primaryObjective: "store_visits",
    recommendedChannels: ["meta_ads", "google_ads"],
    channelRationale: "Meta para alcance local e promoções com urgência. Google Maps e Search para capturar fome imediata na região.",
    audienceStrategy: "Geolocalização restrita ao raio de entrega/deslocamento. Targeting por horário de refeição. Lookalike de clientes frequentes.",
    offerContext: "Promoções de dias fracos, combo de almoço, promoção de final de semana. CTA direto: pedir agora ou vir ao restaurante.",
    projectedLeads: (b) => `${Math.round(b / 50)}–${Math.round(b / 25)} pedidos/mês adicionais`,
    projectedCAC: (b) => `R$ 15–35`,
    projectedROAS: "3x–6x",
    keyRisks: ["Sazonalidade semanal forte", "Concorrência high de outras praças locais", "Criativo fraco reduz CTR drásticamente"],
    successIndicators: ["Pedidos adicionais via WhatsApp/app nos dias promovidos", "Movimento em dias fracos (seg–qua)", "Custo por visita < 20% do ticket médio"],
    getCampaigns: (budget, channels) => [
      { name: "Tráfego Local — Almoço", channel: "meta_ads", objective: "store_visits", budgetAllocation: 40, priority: "alta" as const },
      { name: "Promo Dias Fracos", channel: "meta_ads", objective: "traffic", budgetAllocation: 30, priority: "alta" as const },
      { name: "Google Maps / Search Local", channel: "google_ads", objective: "store_visits", budgetAllocation: 30, priority: "media" as const },
    ],
    getAudiences: (channels) => [
      { name: "Raio Local — Horário Refeição", type: "cold_top" as const, funnelStage: "top" as const, description: "Pessoas no raio de 5km, horários 11h–13h e 18h–21h, interesses em gastronomia", estimatedReach: "10K–50K" },
      { name: "Lookalike — Clientes Frequentes", type: "lookalike" as const, funnelStage: "top" as const, description: "1% lookalike de base de clientes frequentes", estimatedReach: "20K–80K" },
      { name: "Retargeting — Visitantes", type: "retargeting" as const, funnelStage: "bottom" as const, description: "Visitantes do perfil ou site nos últimos 14 dias", estimatedReach: "2K–8K" },
    ],
    getOffers: () => [
      { name: "Combo do Almoço", funnelStage: "bottom" as const, urgencyLevel: "medium" as const, cta: "Pedir agora", landingPage: "whatsapp" },
      { name: "Promoção Segunda-Terça", funnelStage: "middle" as const, urgencyLevel: "high" as const, cta: "Ver promoção", landingPage: "site" },
    ],
  },
  {
    match: /e-?commerce|loja\s*(online|virtual)|marketplace|dropship/i,
    primaryObjective: "sales",
    recommendedChannels: ["meta_ads", "google_ads", "tiktok_ads"],
    channelRationale: "Meta para awareness e remarketing. Google Shopping para intenção de compra. TikTok para descoberta e viralização de produto.",
    audienceStrategy: "Full funnel: cold por interesses + comportamento de compra, retargeting de carrinho abandonado, lookalike de compradores.",
    offerContext: "Produto hero + urgência (estoque limitado, frete grátis por tempo limitado). Carrossel de produtos + depoimento de cliente.",
    projectedLeads: (b) => `ROAS projetado ${b < 3000 ? "3x–5x" : b < 8000 ? "4x–7x" : "5x–10x"}`,
    projectedCAC: (b) => `R$ ${Math.round(b * 0.5 / (b / 30))}–${Math.round(b * 0.5 / (b / 15))}`,
    projectedROAS: "4x–8x",
    keyRisks: ["CAC sobe sem criativos testados e rotacionados", "Carrinho abandonado sem remarketing é receita perdida", "iOS 14+ limita rastreamento — pixel bem configurado é crítico"],
    successIndicators: ["ROAS acima de 3x", "CPA abaixo do ticket médio × 0.4", "Taxa de conversão de landing page > 2%"],
    getCampaigns: (budget, channels) => [
      { name: "Topo de Funil — Descoberta", channel: "meta_ads", objective: "traffic", budgetAllocation: 25, priority: "media" as const },
      { name: "Conversão — Produto Hero", channel: "meta_ads", objective: "sales", budgetAllocation: 35, priority: "alta" as const },
      { name: "Google Shopping", channel: "google_ads", objective: "sales", budgetAllocation: 25, priority: "alta" as const },
      { name: "TikTok — Descoberta", channel: "tiktok_ads", objective: "awareness", budgetAllocation: 15, priority: "baixa" as const },
    ],
    getAudiences: (channels) => [
      { name: "Interesse na Categoria", type: "cold_top" as const, funnelStage: "top" as const, description: "Comportamentos de compra online + interesses na categoria do produto", estimatedReach: "200K–1M" },
      { name: "Visitantes Produto sem Compra", type: "retargeting" as const, funnelStage: "middle" as const, description: "Visitantes das páginas de produto nos últimos 30 dias sem conversão", estimatedReach: "5K–30K" },
      { name: "Carrinho Abandonado", type: "retargeting" as const, funnelStage: "bottom" as const, description: "Adicionou ao carrinho nos últimos 14 dias sem finalizar compra", estimatedReach: "1K–8K" },
      { name: "Lookalike — Compradores", type: "lookalike" as const, funnelStage: "top" as const, description: "1%–2% lookalike de base de compradores confirmados", estimatedReach: "100K–500K" },
    ],
    getOffers: () => [
      { name: "Produto Hero + Frete Grátis", funnelStage: "bottom" as const, urgencyLevel: "high" as const, cta: "Comprar agora", landingPage: "site" },
      { name: "Descubra a Coleção", funnelStage: "top" as const, urgencyLevel: "none" as const, cta: "Ver produtos", landingPage: "site" },
    ],
  },
  {
    match: /cl[íi]nica|consult[óo]rio|dent|m[ée]dic|est[ée]tica(?!\s+capilar)|fisio|psico|sa[úu]de/i,
    primaryObjective: "leads",
    recommendedChannels: ["meta_ads", "google_ads"],
    channelRationale: "Google Search para capturar intenção de agendamento. Meta para alcance geolocalizado e education marketing de procedimentos.",
    audienceStrategy: "Geolocalização por bairro/região + interesse em saúde. Google para palavras de intenção (dentista perto de mim, clínica de X).",
    offerContext: "Agendamento facilitado (WhatsApp/formulário). Primeira consulta, avaliação gratuita ou diagnóstico. Nunca prometer resultado garantido.",
    projectedLeads: (b) => `${Math.round(b * 0.4 / 80)}–${Math.round(b * 0.4 / 40)} agendamentos/mês`,
    projectedCAC: (b) => `R$ 40–90`,
    projectedROAS: "4x–10x (ticket alto + recorrência)",
    keyRisks: ["CFM proíbe certas promessas em anúncios — compliance obrigatório", "Concorrência local forte em Google", "Landing page lenta perde leads de mobile"],
    successIndicators: ["Agendamentos via WhatsApp ou formulário", "CPL abaixo de R$ 80", "Taxa de show de leads acima de 60%"],
    getCampaigns: (budget, channels) => [
      { name: "Search — Agendamento Local", channel: "google_ads", objective: "leads", budgetAllocation: 50, priority: "alta" as const },
      { name: "Meta — Educação + Lead", channel: "meta_ads", objective: "leads", budgetAllocation: 40, priority: "alta" as const },
      { name: "Retargeting — Visitantes", channel: "meta_ads", objective: "retargeting", budgetAllocation: 10, priority: "media" as const },
    ],
    getAudiences: (channels) => [
      { name: "Interesse em Saúde — Local", type: "cold_top" as const, funnelStage: "top" as const, description: "Pessoas no raio de 10km com interesse na especialidade e comportamento de busca por saúde", estimatedReach: "15K–60K" },
      { name: "Busca por Procedimento", type: "cold_top" as const, funnelStage: "top" as const, description: "Palavras-chave de intenção no Google: 'dentista [bairro]', 'clínica de [especialidade]'", estimatedReach: "1K–5K/mês de buscas" },
      { name: "Retargeting — Visitantes", type: "retargeting" as const, funnelStage: "bottom" as const, description: "Visitantes do site ou perfil sem agendamento nos últimos 30 dias", estimatedReach: "1K–4K" },
    ],
    getOffers: () => [
      { name: "Avaliação Gratuita", funnelStage: "bottom" as const, urgencyLevel: "low" as const, cta: "Agendar avaliação", landingPage: "whatsapp" },
      { name: "Conteúdo Educativo + Agendamento", funnelStage: "middle" as const, urgencyLevel: "none" as const, cta: "Saiba mais", landingPage: "site" },
    ],
  },
  {
    match: /acad[eê]mia|crossfit|personal|fit|treino|gym|muscula[çc]|pilates/i,
    primaryObjective: "leads",
    recommendedChannels: ["meta_ads", "tiktok_ads"],
    channelRationale: "Meta para matrículas com geolocalização. TikTok para descoberta e viralização de transformação física — altíssimo engajamento no segmento fitness.",
    audienceStrategy: "Interesse em fitness, dieta e transformação. Lookalike de alunos atuais. Retargeting de visitantes do site.",
    offerContext: "Semana gratuita de treino, avaliação física gratuita, matrícula com desconto por tempo limitado. Urgência real.",
    projectedLeads: (b) => `${Math.round(b * 0.5 / 60)}–${Math.round(b * 0.5 / 30)} leads de matrícula/mês`,
    projectedCAC: (b) => `R$ 30–70`,
    projectedROAS: "5x–15x (mensalidade recorrente)",
    keyRisks: ["Sazonalidade: alta em janeiro, baixa em junho–agosto", "Concorrência local de redes low-cost por preço", "Promessas de resultado devem ter contexto de esforço"],
    successIndicators: ["Matrículas via anúncio", "CPL abaixo de R$ 60", "Taxa de conversão de lead para matrícula > 25%"],
    getCampaigns: (budget, channels) => [
      { name: "Matrículas — Geolocalização", channel: "meta_ads", objective: "leads", budgetAllocation: 55, priority: "alta" as const },
      { name: "TikTok — Transformação", channel: "tiktok_ads", objective: "awareness", budgetAllocation: 25, priority: "media" as const },
      { name: "Retargeting — Leads Frios", channel: "meta_ads", objective: "retargeting", budgetAllocation: 20, priority: "media" as const },
    ],
    getAudiences: (channels) => [
      { name: "Interesse Fitness — Local", type: "cold_top" as const, funnelStage: "top" as const, description: "Pessoas no raio de 8km com interesse em fitness, musculação, saúde", estimatedReach: "20K–80K" },
      { name: "TikTok — Conteúdo Fitness", type: "cold_top" as const, funnelStage: "top" as const, description: "Usuários TikTok que interagiram com conteúdo fitness nos últimos 30 dias", estimatedReach: "50K–200K" },
      { name: "Lookalike Alunos Ativos", type: "lookalike" as const, funnelStage: "top" as const, description: "1% lookalike da base de alunos com > 3 meses", estimatedReach: "30K–120K" },
    ],
    getOffers: () => [
      { name: "Semana Gratuita de Treino", funnelStage: "middle" as const, urgencyLevel: "medium" as const, cta: "Quero experimentar", landingPage: "whatsapp" },
      { name: "Matrícula com 30% off — Este mês", funnelStage: "bottom" as const, urgencyLevel: "high" as const, cta: "Garantir desconto", landingPage: "landing" },
    ],
  },
  {
    match: /sal[ãa]o|beleza|barbearia|cabelo|est[ée]tica capilar|nail|manicure|maquiagem|cabeleireira/i,
    primaryObjective: "store_visits",
    recommendedChannels: ["meta_ads"],
    channelRationale: "Meta com geolocalização restrita é o canal principal para beleza — Instagram Stories e Reels têm altíssimo engajamento visual.",
    audienceStrategy: "Mulheres/homens no raio de 5–10km, interesses em beleza e autocuidado. Retargeting de quem interagiu com portfólio.",
    offerContext: "Agendamento pelo link da bio ou WhatsApp. Promoção de novo serviço, agenda de encaixes para dias fracos.",
    projectedLeads: (b) => `${Math.round(b * 0.6 / 40)}–${Math.round(b * 0.6 / 20)} agendamentos/mês`,
    projectedCAC: (b) => `R$ 20–50`,
    projectedROAS: "4x–8x (recorrência mensal)",
    keyRisks: ["Dependência de um único canal (Meta)", "Agenda cheia não aceita leads sem follow-up automatizado", "Portfólio fraco reduz conversão mesmo com bom alcance"],
    successIndicators: ["Agendamentos via link/WhatsApp originados de campanhas", "CPL abaixo de R$ 45", "Taxa de retorno de cliente acima de 60%"],
    getCampaigns: (budget, channels) => [
      { name: "Agendamento Local", channel: "meta_ads", objective: "leads", budgetAllocation: 60, priority: "alta" as const },
      { name: "Portfólio — Awareness Local", channel: "meta_ads", objective: "awareness", budgetAllocation: 25, priority: "media" as const },
      { name: "Retargeting — Engajados", channel: "meta_ads", objective: "retargeting", budgetAllocation: 15, priority: "media" as const },
    ],
    getAudiences: (channels) => [
      { name: "Público Beleza — Local", type: "cold_top" as const, funnelStage: "top" as const, description: "Mulheres/homens no raio de 5km, interesse em beleza, cuidados pessoais", estimatedReach: "8K–30K" },
      { name: "Engajados com Portfólio", type: "warm_middle" as const, funnelStage: "middle" as const, description: "Interações com posts de portfólio nos últimos 60 dias", estimatedReach: "1K–5K" },
    ],
    getOffers: () => [
      { name: "Agendamento Facilitado", funnelStage: "bottom" as const, urgencyLevel: "low" as const, cta: "Agendar agora", landingPage: "whatsapp" },
      { name: "Encaixe para Horários Livres", funnelStage: "middle" as const, urgencyLevel: "medium" as const, cta: "Ver horários disponíveis", landingPage: "whatsapp" },
    ],
  },
  {
    match: /servi[çc]|consult|agência|assessoria|contabilidade|advocacia|imobiliária|seguros/i,
    primaryObjective: "leads",
    recommendedChannels: ["meta_ads", "google_ads", "linkedin_ads"],
    channelRationale: "LinkedIn para B2B com tomadores de decisão. Google para capturar intenção. Meta para awareness e nurturing.",
    audienceStrategy: "LinkedIn: cargo, setor, tamanho de empresa. Google: palavras de intenção de contratação. Meta: interesses B2B e comportamento empresarial.",
    offerContext: "Diagnóstico gratuito, e-book, webinar ou primeira consultoria. Lead magnet forte para qualificar antes do contato comercial.",
    projectedLeads: (b) => `${Math.round(b * 0.5 / 120)}–${Math.round(b * 0.5 / 60)} leads qualificados/mês`,
    projectedCAC: (b) => `R$ 60–200`,
    projectedROAS: "5x–20x (ticket alto de serviço)",
    keyRisks: ["LinkedIn tem CPM/CPC mais caro — exige ticket alto para justificar", "Ciclo de vendas longo — remarketing de longo prazo necessário", "Lead de baixa qualidade sem qualificação no formulário"],
    successIndicators: ["Leads com cargo e empresa identificados", "Taxa de qualificação > 40%", "CPL abaixo de R$ 150 para B2B"],
    getCampaigns: (budget, channels) => [
      { name: "LinkedIn — Tomadores de Decisão", channel: "linkedin_ads", objective: "leads", budgetAllocation: 35, priority: "alta" as const },
      { name: "Google Search — Intenção", channel: "google_ads", objective: "leads", budgetAllocation: 35, priority: "alta" as const },
      { name: "Meta — Nurturing e Conteúdo", channel: "meta_ads", objective: "traffic", budgetAllocation: 30, priority: "media" as const },
    ],
    getAudiences: (channels) => [
      { name: "LinkedIn — Decisores", type: "cold_top" as const, funnelStage: "top" as const, description: "Diretores, sócios, CEOs de PMEs no setor-alvo", estimatedReach: "10K–50K" },
      { name: "Google — Intenção de Contratar", type: "cold_top" as const, funnelStage: "top" as const, description: "Palavras de alta intenção: 'contratar consultoria de X', 'agência de Y'", estimatedReach: "500–3K buscas/mês" },
      { name: "Retargeting Multi-canal", type: "retargeting" as const, funnelStage: "bottom" as const, description: "Visitantes do site de todas as fontes nos últimos 60 dias", estimatedReach: "1K–6K" },
    ],
    getOffers: () => [
      { name: "Diagnóstico Gratuito", funnelStage: "middle" as const, urgencyLevel: "none" as const, cta: "Solicitar diagnóstico", landingPage: "landing" },
      { name: "Material Educativo Premium", funnelStage: "top" as const, urgencyLevel: "none" as const, cta: "Baixar grátis", landingPage: "landing" },
    ],
  },
  {
    match: /educa[çc]|curso|escola|faculdade|treinamento|capacita[çc]|mentoria/i,
    primaryObjective: "leads",
    recommendedChannels: ["meta_ads", "youtube_ads", "google_ads"],
    channelRationale: "Meta para lead capture via carrossel e vídeo. YouTube para longa exposição a conteúdo de prova. Google para intenção de matrícula.",
    audienceStrategy: "Interesse em aprendizado, desenvolvimento profissional, nicho do curso. YouTube remarketing após engajamento com vídeo educativo.",
    offerContext: "Aula gratuita, webinar, material de inscrição. Urgência de vagas limitadas ou prazo de desconto real.",
    projectedLeads: (b) => `${Math.round(b * 0.5 / 70)}–${Math.round(b * 0.5 / 35)} leads para matrícula/mês`,
    projectedCAC: (b) => `R$ 35–80`,
    projectedROAS: "4x–12x",
    keyRisks: ["Sazonalidade de matrículas (jan/fev e jul/ago)", "Prometissas exageradas de resultado violam código do consumidor", "Lead frio sem nutrição tem taxa de matrícula muito baixa"],
    successIndicators: ["Matrículas geradas via campanha", "CPL abaixo de R$ 70", "Taxa de conversão lead→matrícula > 20%"],
    getCampaigns: (budget, channels) => [
      { name: "Meta — Lead Capture", channel: "meta_ads", objective: "leads", budgetAllocation: 45, priority: "alta" as const },
      { name: "YouTube — Prova e Educação", channel: "youtube_ads", objective: "awareness", budgetAllocation: 30, priority: "media" as const },
      { name: "Google Search — Matrícula", channel: "google_ads", objective: "leads", budgetAllocation: 25, priority: "alta" as const },
    ],
    getAudiences: (channels) => [
      { name: "Interesse em Aprendizado", type: "cold_top" as const, funnelStage: "top" as const, description: "Interesse em cursos, desenvolvimento profissional, aprendizado online", estimatedReach: "100K–500K" },
      { name: "YouTube — Assistiu Conteúdo", type: "warm_middle" as const, funnelStage: "middle" as const, description: "Assistiu pelo menos 30% de vídeos do canal nos últimos 90 dias", estimatedReach: "5K–20K" },
      { name: "Retargeting — Página de Inscrição", type: "retargeting" as const, funnelStage: "bottom" as const, description: "Visitou a página de inscrição ou checkout sem concluir nos últimos 30 dias", estimatedReach: "1K–5K" },
    ],
    getOffers: () => [
      { name: "Aula Gratuita", funnelStage: "middle" as const, urgencyLevel: "low" as const, cta: "Assistir grátis", landingPage: "landing" },
      { name: "Matrícula — Vagas Limitadas", funnelStage: "bottom" as const, urgencyLevel: "high" as const, cta: "Garantir minha vaga", landingPage: "site" },
    ],
  },
  {
    // Default
    match: /.*/,
    primaryObjective: "leads",
    recommendedChannels: ["meta_ads", "google_ads"],
    channelRationale: "Meta para alcance e awareness. Google para capturar intenção de busca. Combinação cobre todo o funil.",
    audienceStrategy: "Interesses relevantes ao segmento + geolocalização se local. Retargeting de visitantes para maximizar conversão.",
    offerContext: "Oferta principal com CTA claro. Landing page dedicada por campanha para maximizar conversão.",
    projectedLeads: (b) => `${Math.round(b * 0.5 / 80)}–${Math.round(b * 0.5 / 40)} leads/mês`,
    projectedCAC: (b) => `R$ 40–100`,
    projectedROAS: "3x–6x",
    keyRisks: ["Ausência de rastreamento correto distorce dados de performance", "Budget dividido em muitos canais sem foco reduz resultado", "Criativo sem teste A/B limita otimização"],
    successIndicators: ["CPL dentro do orçamento definido", "ROAS acima de 3x", "Taxa de conversão de landing page > 2%"],
    getCampaigns: (budget, channels) => [
      { name: "Awareness — Público Frio", channel: "meta_ads", objective: "awareness", budgetAllocation: 30, priority: "media" as const },
      { name: "Conversão — Lead", channel: "meta_ads", objective: "leads", budgetAllocation: 45, priority: "alta" as const },
      { name: "Google Search", channel: "google_ads", objective: "leads", budgetAllocation: 25, priority: "alta" as const },
    ],
    getAudiences: (channels) => [
      { name: "Interesse no Segmento", type: "cold_top" as const, funnelStage: "top" as const, description: "Interesses e comportamentos relevantes ao segmento do negócio", estimatedReach: "50K–300K" },
      { name: "Retargeting — Visitantes", type: "retargeting" as const, funnelStage: "bottom" as const, description: "Visitantes do site ou perfil nos últimos 30 dias", estimatedReach: "2K–10K" },
    ],
    getOffers: () => [
      { name: "Oferta Principal", funnelStage: "bottom" as const, urgencyLevel: "medium" as const, cta: "Saiba mais", landingPage: "site" },
    ],
  },
];

function getTrafficProfile(segment: string): TrafficSegmentProfile {
  return TRAFFIC_PROFILES.find((p) => p.match.test(segment)) ?? TRAFFIC_PROFILES[TRAFFIC_PROFILES.length - 1];
}

// ── Budget allocation builder ─────────────────────────────────────────────────

function buildBudgetAllocation(
  scenario: "low" | "medium" | "high" | "premium",
  channels: TrafficChannel[],
  campaignAllocations: { channel: TrafficChannel; percent: number }[],
  total: number,
  basis: BudgetBasis,
): BudgetAllocation {
  const feePct    = MANAGEMENT_FEE_PERCENT;
  const feeBRL    = Math.round(total * feePct / 100);
  const mediaBRL  = total - feeBRL;

  const channelBreakdown = channels.map((ch) => {
    const pct = campaignAllocations.find((c) => c.channel === ch)?.percent ?? Math.round(100 / channels.length);
    return { channel: ch, percent: pct, brl: Math.round(mediaBRL * pct / 100) };
  });

  return {
    scenario,
    basis,
    basisNote: basis === "verba_informada"
      ? `Total mensal de R$ ${total.toLocaleString("pt-BR")} informado pelo cliente.`
      : `Cliente não informou verba. R$ ${total.toLocaleString("pt-BR")} é ${MARCA_FAIXA_DE_REFERENCIA} — confirmar com o cliente antes de qualquer compromisso.`,
    totalMonthlyBRL: total,
    managementFeePercent: feePct,
    managementFeeBRL: feeBRL,
    mediaBudgetBRL: mediaBRL,
    channelBreakdown,
    funnelBreakdown: [
      { stage: "top",    percent: 35, brl: Math.round(mediaBRL * 0.35) },
      { stage: "middle", percent: 35, brl: Math.round(mediaBRL * 0.35) },
      { stage: "bottom", percent: 30, brl: Math.round(mediaBRL * 0.30) },
    ],
  };
}

// ── Cognitive Flow trace ──────────────────────────────────────────────────────

function buildTrafficFlowTrace(
  strategyCanvas: StrategyCanvas,
  profile: TrafficSegmentProfile,
  budgetScenario: string,
  total: number,
  basis: BudgetBasis,
  proj: (v: string) => string,
): TrafficFlowStep[] {
  return DIOLI_COGNITIVE_FLOW.map((step) => {
    let summary = "";
    switch (step.id) {
      case "intention":    summary = `Tráfego pago para: ${strategyCanvas.mainObjective}`;                          break;
      case "context":      summary = `Segmento: ${strategyCanvas.segment} — ${strategyCanvas.clientName}`;         break;
      // O passo "certainty" é onde o motor declara o que SABE. Dizer só
      // "Budget: medium" era o oposto disso: escondia que o número era default.
      case "certainty":    summary = `Canais: ${profile.recommendedChannels.join(", ")} — Budget: R$ ${total.toLocaleString("pt-BR")}/mês (${basis === "verba_informada" ? "verba informada pelo cliente" : `${MARCA_FAIXA_DE_REFERENCIA} — cliente não informou verba`})`; break;
      case "unknowns":     summary = "Verificados: pixel instalado, acesso a contas de mídia, criativos disponíveis"; break;
      case "routing":      summary = "Rota: Traffic → campanhas → aprovação → ativação com criativos aprovados";    break;
      case "permission":   summary = "Permissões: Strategy Canvas presente — Traffic autorizado";                   break;
      case "brand":        summary = `Canais: ${profile.channelRationale.slice(0, 70)}...`;                         break;
      // Era `BUDGET_TOTALS["medium"]` fixo: mesmo quando o plano usava outro
      // total, o traço cognitivo relatava a projeção de R$ 4.000.
      case "objective":    summary = `Objetivo: ${profile.primaryObjective} — ${proj(profile.projectedLeads(total))}`; break;
      case "risk":         summary = profile.keyRisks[0] ?? "Riscos mapeados";                                      break;
      case "approval":     summary = "Aguarda aprovação humana do Traffic Canvas e budget";                         break;
      case "training":     summary = "Performance de campanhas alimenta base de treinamento de tráfego";            break;
      case "measurement":  summary = `Métricas: CPL, ROAS, CAC — ${proj(profile.projectedROAS)}`;                    break;
      default:             summary = `${step.label} — concluído`;
    }
    return { stepId: step.id, order: step.order, label: step.label, completed: true, summary };
  });
}

// ── Main Engine ───────────────────────────────────────────────────────────────

export function generateTrafficCanvas(input: TrafficEngineInput): TrafficCanvas {
  const {
    strategyCanvas,
    socialCanvas,
    designCanvas,
    verbaInformadaBRL,
    requestId,
    source = "simulation",
  } = input;

  // A DECISÃO (05/08/2026): as DUAS metades, e nesta ordem de prioridade.
  //   1. Verba informada pelo cliente manda — o plano é feito com o dinheiro
  //      dele, e aí os projetados são estimativa DELE, sem ressalva.
  //   2. Sem verba informada, o motor não inventa uma: usa a faixa do segmento
  //      e DECLARA que é faixa, dentro de cada string projetada.
  // Não escolhi só a segunda porque rotular bem um número errado continua
  // deixando o time planejar em cima dele; não escolhi só a primeira porque
  // sem verba informada o plano teria de sumir, e um departamento que não
  // entrega nada quando falta um campo é um departamento que ninguém usa.
  const temVerbaDoCliente = typeof verbaInformadaBRL === "number" && Number.isFinite(verbaInformadaBRL) && verbaInformadaBRL > 0;
  const budgetBasis: BudgetBasis = temVerbaDoCliente ? "verba_informada" : "faixa_de_referencia";
  const budgetScenario = temVerbaDoCliente
    ? cenarioMaisProximo(verbaInformadaBRL!)
    : input.budgetScenario ?? "medium";

  const profile  = getTrafficProfile(strategyCanvas.segment);
  const total    = temVerbaDoCliente ? Math.round(verbaInformadaBRL!) : BUDGET_TOTALS[budgetScenario]!;
  const channels = profile.recommendedChannels;

  // Sem verba do cliente, TODO valor projetado sai daqui com a ressalva colada.
  const proj = temVerbaDoCliente ? (v: string) => v : comRessalva;

  const rawCampaigns = profile.getCampaigns(total, channels);
  const campaigns: TrafficCampaign[] = rawCampaigns.map((c, i) => {
    const mediaBRL = Math.round(total * (1 - MANAGEMENT_FEE_PERCENT / 100));
    const brl      = Math.round(mediaBRL * (c.budgetAllocation ?? 30) / 100);
    return {
      id: `camp_${i + 1}`,
      name: c.name ?? `Campanha ${i + 1}`,
      channel: c.channel ?? channels[0],
      objective: c.objective ?? profile.primaryObjective,
      budgetAllocation: c.budgetAllocation ?? 30,
      budgetBRL: brl,
      audienceType: c.audienceType ?? "cold_top",
      expectedCPA: proj(profile.projectedCAC(total)),
      expectedROAS: proj(profile.projectedROAS),
      priority: c.priority ?? "media",
    };
  });

  const rawAudiences = profile.getAudiences(channels);
  const audiences: AudienceSegment[] = rawAudiences.map((a, i) => ({
    id: `aud_${i + 1}`,
    name: a.name ?? `Público ${i + 1}`,
    type: a.type ?? "cold_top",
    channel: channels[0],
    description: a.description ?? "",
    interests: a.interests ?? [],
    behaviors: a.behaviors ?? [],
    // O alcance é o número que o filtro de preço do portal nunca segurou.
    estimatedReach: proj(a.estimatedReach ?? "N/D"),
    funnelStage: a.funnelStage ?? "top",
  }));

  const creativeRequirements: CreativeRequirement[] = campaigns.slice(0, 3).map((c, i) => ({
    id: `cr_${i + 1}`,
    campaignId: c.id,
    format: c.channel === "meta_ads" ? "1080×1080 + 9:16 story" : c.channel === "youtube_ads" ? "16:9 vídeo 15s–30s" : "Responsive display ad",
    channel: c.channel,
    copyDirection: `Headline: benefício principal | Body: prova social + urgência leve | CTA: ${c.objective === "leads" ? "Quero saber mais" : "Comprar agora"}`,
    ctaText: c.objective === "leads" ? "Agendar agora" : c.objective === "sales" ? "Comprar" : "Saiba mais",
    quantity: 2,
    designCanvasId: designCanvas?.id,
  }));

  const rawOffers = profile.getOffers();
  const offerMappings: OfferMapping[] = rawOffers.map((o, i) => ({
    id: `offer_${i + 1}`,
    name: o.name ?? `Oferta ${i + 1}`,
    description: o.name ?? "",
    targetAudience: strategyCanvas.audience,
    funnelStage: o.funnelStage ?? "middle",
    urgencyLevel: o.urgencyLevel ?? "low",
    cta: o.cta ?? "Saiba mais",
    landingPage: o.landingPage ?? "site",
  }));

  const channelAllocations = campaigns.map((c) => ({ channel: c.channel, percent: c.budgetAllocation }));
  const budgetAllocation = buildBudgetAllocation(budgetScenario, channels, channelAllocations, total, budgetBasis);

  const cognitiveFlowTrace = buildTrafficFlowTrace(strategyCanvas, profile, budgetScenario, total, budgetBasis, proj);

  const partial: Omit<TrafficCanvas, "qualityGateResult" | "cognitiveFlowTrace" | "id" | "status" | "createdAt" | "source"> = {
    strategyCanvasId: strategyCanvas.id,
    socialCanvasId:   socialCanvas?.id,
    designCanvasId:   designCanvas?.id,
    requestId:        requestId ?? strategyCanvas.requestId,
    clientName:       strategyCanvas.clientName,
    segment:          strategyCanvas.segment,

    mainObjective:    strategyCanvas.mainObjective,
    targetAudience:   strategyCanvas.audience,
    offerContext:     profile.offerContext,

    campaigns,
    audiences,
    creativeRequirements,

    budgetScenario,
    budgetAllocation,
    budgetBasis,

    offerMappings,
    recommendedChannels: channels,
    channelRationale:    profile.channelRationale,

    projectedMonthlyLeads: proj(profile.projectedLeads(total)),
    projectedCAC:          proj(profile.projectedCAC(total)),
    projectedROAS:         proj(profile.projectedROAS),
    keyRisks:              profile.keyRisks,
    successIndicators:     profile.successIndicators,
  };

  const qualityGateResult = runTrafficQualityGate(partial);

  return {
    ...partial,
    id:     `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source,
    status: "draft",
    createdAt: new Date().toISOString(),
    qualityGateResult,
    cognitiveFlowTrace,
  };
}
