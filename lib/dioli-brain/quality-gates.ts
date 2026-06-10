// Dioli Brain — Quality Gates
// Global gate applies to every department output.
// Department gates layer on top with scope-specific checks.

import type { QualityGateCheck } from "./types";

export const GLOBAL_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "no_hallucination",
    label: "Sem alucinação",
    description: "Toda afirmação deve ser fundamentada em dados reais do cliente ou contexto conhecido.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "respects_brand",
    label: "Respeita a marca",
    description: "Output está alinhado com o tom, valores e identidade visual do Brand Brain.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "matches_briefing",
    label: "Corresponde ao briefing",
    description: "O entregável atende ao objetivo declarado no briefing do projeto.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "clear_client_value",
    label: "Valor claro para o cliente",
    description: "O cliente consegue entender o que recebeu e por que é relevante para ele.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "risk_checked",
    label: "Riscos verificados",
    description: "Riscos legais, financeiros e reputacionais foram identificados e endereçados.",
    scope: "global",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "approval_need_checked",
    label: "Necessidade de aprovação verificada",
    description: "Confirmado se esta entrega precisa de aprovação humana antes de avançar.",
    scope: "global",
    blocking: true,
    autoCheckable: true,
  },
  {
    id: "evidence_path_defined",
    label: "Caminho de evidência definido",
    description: "Existe uma métrica ou critério de sucesso que vai confirmar se este trabalho gerou valor.",
    scope: "global",
    blocking: false,
    autoCheckable: false,
  },
];

export const SDR_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "sdr_budget_respected",
    label: "Budget respeitado",
    description: "A estimativa de escopo está dentro do budget declarado pelo cliente.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "sdr_objections_handled",
    label: "Objeções endereçadas",
    description: "Todas as objeções levantadas pelo cliente foram respondidas ou registradas.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "sdr_scope_clear",
    label: "Escopo claro",
    description: "O escopo do projeto está definido sem ambiguidades.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "sdr_no_false_promises",
    label: "Sem promessas falsas",
    description: "Nenhuma promessa de resultado que não pode ser garantida foi feita.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "sdr_budget_separated",
    label: "Management fee separado do budget de mídia",
    description: "O valor da agência está claramente separado do investimento em mídia.",
    scope: "client-service-sdr",
    blocking: true,
    autoCheckable: false,
  },
];

export const STRATEGY_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "strategy_positioning_coherent",
    label: "Posicionamento coerente",
    description: "O posicionamento proposto é consistente com o Brand Brain e o mercado.",
    scope: "strategy",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "strategy_objective_aligned",
    label: "Objetivo alinhado",
    description: "A estratégia serve diretamente ao objetivo de negócio declarado pelo cliente.",
    scope: "strategy",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "strategy_assumptions_explicit",
    label: "Premissas explícitas",
    description: "Todas as premissas estratégicas estão declaradas — nada fica implícito.",
    scope: "strategy",
    blocking: false,
    autoCheckable: false,
  },
];

export const SOCIAL_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "social_brand_voice",
    label: "Voz da marca respeitada",
    description: "O conteúdo usa o tom e vocabulário definidos no Brand Brain.",
    scope: "social-media",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "social_channel_fit",
    label: "Conteúdo adequado ao canal",
    description: "O formato e tamanho são corretos para o canal de destino.",
    scope: "social-media",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "social_cta_clear",
    label: "CTA claro",
    description: "Há um chamado à ação claro e adequado ao objetivo da publicação.",
    scope: "social-media",
    blocking: false,
    autoCheckable: false,
  },
];

export const DESIGN_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "design_visual_consistency",
    label: "Consistência visual",
    description: "Paleta de cores, tipografia e elementos gráficos seguem o brandbook.",
    scope: "design",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "design_brandbook_respected",
    label: "Brandbook respeitado",
    description: "Nenhuma regra do brandbook foi violada.",
    scope: "design",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "design_no_invented_assets",
    label: "Sem assets inventados",
    description: "Todos os assets usados estão aprovados no Brand Hub do cliente.",
    scope: "design",
    blocking: true,
    autoCheckable: false,
  },
];

export const PAID_TRAFFIC_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "ads_budget_separated",
    label: "Budget separado do fee",
    description: "O investimento em mídia e o fee da agência estão claramente separados.",
    scope: "paid-traffic",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "ads_offer_clear",
    label: "Oferta clara",
    description: "A oferta do anúncio é compreensível e honesta.",
    scope: "paid-traffic",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "ads_audience_coherent",
    label: "Lógica de público coerente",
    description: "O público-alvo está alinhado com o Brand Brain e o objetivo da campanha.",
    scope: "paid-traffic",
    blocking: true,
    autoCheckable: false,
  },
];

export const PM_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "pm_task_owner",
    label: "Task com dono definido",
    description: "Toda task tem um responsável claramente designado.",
    scope: "project-management",
    blocking: true,
    autoCheckable: true,
  },
  {
    id: "pm_deadline",
    label: "Prazo definido",
    description: "Toda task tem um prazo — mesmo que provisório.",
    scope: "project-management",
    blocking: true,
    autoCheckable: true,
  },
  {
    id: "pm_dependencies",
    label: "Dependências mapeadas",
    description: "As dependências entre tasks e departamentos estão identificadas.",
    scope: "project-management",
    blocking: false,
    autoCheckable: false,
  },
];

export const ANALYTICS_QUALITY_GATE: QualityGateCheck[] = [
  {
    id: "analytics_metric_source",
    label: "Fonte da métrica declarada",
    description: "Cada métrica cita sua fonte de dados (Google Analytics, Meta, CRM, etc.).",
    scope: "analytics",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "analytics_insight_actionable",
    label: "Insight acionável",
    description: "O insight gera uma recomendação clara de ação.",
    scope: "analytics",
    blocking: false,
    autoCheckable: false,
  },
];

export const QUALITY_DEPT_GATE: QualityGateCheck[] = [
  {
    id: "quality_audit_impartial",
    label: "Auditoria imparcial",
    description: "A auditoria usa um modelo/revisor diferente do que gerou o output.",
    scope: "quality",
    blocking: true,
    autoCheckable: false,
  },
  {
    id: "quality_escalation",
    label: "Escalação quando necessário",
    description: "Problemas críticos são escalados — não omitidos.",
    scope: "quality",
    blocking: true,
    autoCheckable: false,
  },
];

export const ALL_QUALITY_GATES: Record<string, QualityGateCheck[]> = {
  global: GLOBAL_QUALITY_GATE,
  "client-service-sdr": SDR_QUALITY_GATE,
  strategy: STRATEGY_QUALITY_GATE,
  "social-media": SOCIAL_QUALITY_GATE,
  design: DESIGN_QUALITY_GATE,
  "paid-traffic": PAID_TRAFFIC_QUALITY_GATE,
  "project-management": PM_QUALITY_GATE,
  analytics: ANALYTICS_QUALITY_GATE,
  quality: QUALITY_DEPT_GATE,
};

export function getQualityGateForDepartment(departmentId: string): QualityGateCheck[] {
  return [...GLOBAL_QUALITY_GATE, ...(ALL_QUALITY_GATES[departmentId] ?? [])];
}

export function getBlockingChecks(departmentId: string): QualityGateCheck[] {
  return getQualityGateForDepartment(departmentId).filter((c) => c.blocking);
}
