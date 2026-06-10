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
    "client-service-sdr":  ["first_round_approval", "client_praise", "delivery_time_reduction"],
    strategy:              ["campaign_reach", "engagement_increase", "conversion_improvement"],
    "social-media":        ["engagement_increase", "campaign_reach", "client_praise"],
    design:                ["first_round_approval", "brand_before_after", "client_praise"],
    "paid-traffic":        ["conversion_improvement", "campaign_reach", "revenue_leads_increase"],
    "project-management":  ["delivery_time_reduction", "first_round_approval"],
    analytics:             ["conversion_improvement", "revenue_leads_increase"],
    quality:               ["first_round_approval", "client_praise"],
  };
  return map[departmentId] ?? ["other"];
}
