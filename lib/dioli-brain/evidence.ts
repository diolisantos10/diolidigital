// Dioli Brain — Evidence Layer
// Architecture and type definitions. Full UI is future scope.
// Rule: public proof requires human approval.

import type { EvidenceItem, EvidenceType } from "./types";

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  campaign_reach:          "Alcance de Campanha Melhorado",
  engagement_increase:     "Engajamento Aumentado",
  conversion_improvement:  "Conversão Melhorada",
  first_round_approval:    "Aprovação na Primeira Rodada",
  delivery_time_reduction: "Prazo de Entrega Reduzido",
  client_praise:           "Elogio do Cliente",
  brand_before_after:      "Melhoria de Marca (Antes/Depois)",
  revenue_leads_increase:  "Receita / Leads Aumentados",
  briefing_completed:      "Briefing Concluído",
  qualified_lead:          "Lead Qualificado",
  proposal_generated:      "Proposta Gerada",
  objection_resolved:      "Objeção Resolvida",
  budget_aligned:          "Budget Alinhado",
  request_converted:       "Solicitação Convertida",
  strategy_approved:          "Estratégia Aprovada",
  positioning_created:        "Posicionamento Criado",
  content_territory_defined:  "Território de Conteúdo Definido",
  roadmap_created:            "Roadmap Criado",
  opportunity_identified:     "Oportunidade Identificada",
  content_plan_created:       "Plano de Conteúdo Criado",
  calendar_generated:         "Calendário Editorial Gerado",
  territory_executed:         "Território de Conteúdo Executado",
  engagement_improved:        "Engajamento Melhorado",
  content_approved:           "Conteúdo Aprovado",
  content_published:          "Conteúdo Publicado",
  social_strategy_executed:   "Estratégia Social Executada",
  other:                   "Outro",
};

export const EVIDENCE_TYPE_DESCRIPTIONS: Record<EvidenceType, string> = {
  campaign_reach:          "Campanha atingiu mais pessoas do que o benchmark ou período anterior.",
  engagement_increase:     "Taxa de engajamento aumentou em relação ao baseline.",
  conversion_improvement:  "Taxa de conversão ou CPA melhorou após a intervenção.",
  first_round_approval:    "Entrega aprovada pelo cliente sem revisões.",
  delivery_time_reduction: "Entrega concluída mais rápido que o prazo acordado ou benchmark.",
  client_praise:           "Cliente elogiou formalmente a qualidade ou rapidez da entrega.",
  brand_before_after:      "Identidade de marca visivelmente melhorada em relação ao estado anterior.",
  revenue_leads_increase:  "Receita ou número de leads aumentou após a campanha.",
  briefing_completed:      "Conversa de briefing concluída com escopo e estimativa definidos.",
  qualified_lead:          "Lead qualificado com identidade, serviço, objetivos e budget capturados.",
  proposal_generated:      "Proposta inicial gerada e enviada para análise interna.",
  objection_resolved:      "Objeção de preço, escopo ou prazo resolvida durante a conversa.",
  budget_aligned:          "Budget do prospect alinhado com estimativa de escopo aprovada.",
  request_converted:       "Solicitação de briefing convertida em projeto ativo.",
  strategy_approved:          "Strategy Canvas aprovado e adotado como direção oficial.",
  positioning_created:        "Posicionamento estratégico definido e validado para o cliente.",
  content_territory_defined:  "Territórios de conteúdo definidos como base do calendário editorial.",
  roadmap_created:            "Roadmap estratégico em fases criado e aprovado.",
  opportunity_identified:     "Oportunidade de crescimento identificada na análise estratégica.",
  content_plan_created:       "Plano de conteúdo mensal criado a partir da estratégia aprovada.",
  calendar_generated:         "Calendário editorial gerado com temas, formatos e canais definidos.",
  territory_executed:         "Território de conteúdo da estratégia executado em pauta real.",
  engagement_improved:        "Engajamento melhorado após execução do plano de conteúdo.",
  content_approved:           "Conteúdo aprovado pelo cliente dentro do fluxo de aprovação.",
  content_published:          "Conteúdo publicado conforme o calendário editorial aprovado.",
  social_strategy_executed:   "Direção estratégica transformada em operação de conteúdo ativa.",
  other:                   "Outro tipo de evidência de valor.",
};

export const EVIDENCE_GOVERNANCE_RULES = [
  "Evidência pública (uso comercial) requer aprovação humana antes de divulgação.",
  "Toda evidência deve ter fonte declarada (plataforma, data, métrica).",
  "Evidências aprovadas se tornam material de prova de valor da agência.",
  "Evidências rejeitadas são arquivadas — não deletadas — para aprendizado futuro.",
  "canUseCommercially só pode ser true após aprovação explícita do cliente.",
] as const;

export function createEvidenceItem(
  partial: Omit<EvidenceItem, "id" | "approvalStatus" | "canUseCommercially" | "createdAt">
): EvidenceItem {
  return {
    ...partial,
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    approvalStatus: "draft",
    canUseCommercially: false,
    createdAt: new Date().toISOString(),
  };
}

export function getEvidenceTypesByDepartment(departmentId: string): EvidenceType[] {
  const map: Record<string, EvidenceType[]> = {
    "client-service-sdr":  [
      "briefing_completed", "qualified_lead", "proposal_generated",
      "objection_resolved", "budget_aligned", "request_converted",
    ],
    strategy:              [
      "strategy_approved", "positioning_created", "content_territory_defined",
      "roadmap_created", "opportunity_identified",
    ],
    "social-media":        [
      "content_plan_created", "calendar_generated", "territory_executed",
      "engagement_improved", "content_approved", "content_published",
      "social_strategy_executed",
    ],
    design:                ["first_round_approval", "brand_before_after", "client_praise"],
    "paid-traffic":        ["conversion_improvement", "campaign_reach", "revenue_leads_increase"],
    "project-management":  ["delivery_time_reduction", "first_round_approval"],
    analytics:             ["conversion_improvement", "revenue_leads_increase"],
    quality:               ["first_round_approval", "client_praise"],
  };
  return map[departmentId] ?? ["other"];
}
