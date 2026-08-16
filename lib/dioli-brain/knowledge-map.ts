// Dioli Brain — Knowledge Base Map
// Maps every knowledge source the Brain can access, who owns it,
// which departments can read it, and how it gets updated.

import type { KnowledgeSource } from "./types";

export const KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    sourceId: "client_brand_brain",
    label: "Brand Brain do Cliente",
    description: "Identidade de marca: cores, tipografia, tom de voz, valores, posicionamento, público-alvo.",
    owner: "brand-hub",
    allowedDepartments: ["client-service-sdr", "strategy", "social-media", "design", "paid-traffic", "quality"],
    sensitivity: "confidential",
    updateTrigger: ["human_edit", "client_upload", "approved_deliverable"],
    currentSystemMapping: "prisma: BrandBrain (per Client)",
  },
  {
    sourceId: "client_profile",
    label: "Perfil do Cliente",
    description: "Dados cadastrais, histórico de projetos, segmento, maturidade, portal token.",
    owner: "project-management",
    allowedDepartments: ["client-service-sdr", "project-management", "quality"],
    sensitivity: "confidential",
    updateTrigger: ["human_edit"],
    currentSystemMapping: "prisma: Client",
  },
  {
    sourceId: "briefings",
    label: "Briefings",
    description: "Objetivos do projeto, público-alvo, mensagem-chave, entregáveis esperados, prazo e critério de sucesso.",
    owner: "project-management",
    allowedDepartments: ["client-service-sdr", "strategy", "social-media", "design", "paid-traffic", "project-management"],
    sensitivity: "confidential",
    updateTrigger: ["briefing_submitted", "human_edit"],
    currentSystemMapping: "prisma: Briefing + /briefing route + PublicBriefingRoom component",
  },
  {
    sourceId: "client_requests",
    label: "Solicitações do Cliente",
    description: "Pedidos diretos do cliente capturados via Briefing Room ou portal.",
    owner: "client-service-sdr",
    allowedDepartments: ["client-service-sdr", "project-management"],
    sensitivity: "confidential",
    updateTrigger: ["briefing_submitted", "human_edit"],
    currentSystemMapping: "store: clientRequests + lib/agency/client-requests.ts",
  },
  {
    sourceId: "strategy_rooms",
    label: "Strategy Rooms",
    description: "Análise estratégica com múltiplos especialistas. Posicionamento, canais, briefings downstream.",
    owner: "strategy",
    allowedDepartments: ["strategy", "social-media", "design", "paid-traffic", "project-management"],
    sensitivity: "internal",
    updateTrigger: ["human_edit", "system_event"],
    currentSystemMapping: "prisma: StrategyRoom (analysisJson)",
  },
  {
    sourceId: "projects",
    label: "Projetos e Pipeline",
    description: "Estado atual de cada projeto: stage, proposta, prazo, agentes ativos, dependências.",
    owner: "project-management",
    allowedDepartments: ["project-management", "strategy", "social-media", "design", "paid-traffic", "quality"],
    sensitivity: "internal",
    updateTrigger: ["human_edit", "system_event"],
    currentSystemMapping: "prisma: Project + store: projects",
  },
  {
    sourceId: "deliverables",
    label: "Entregas",
    description: "Entregáveis produzidos: tipo, status, revisões, agente responsável, aprovação do cliente.",
    owner: "project-management",
    allowedDepartments: ["project-management", "social-media", "design", "paid-traffic", "quality"],
    sensitivity: "internal",
    updateTrigger: ["human_edit", "approved_deliverable"],
    currentSystemMapping: "prisma: Deliverable + store: deliverables",
  },
  {
    sourceId: "brand_assets",
    label: "Brand Assets",
    description: "Logos, cores, tipografia, templates, referências visuais e material de marca do cliente.",
    owner: "brand-hub",
    allowedDepartments: ["brand-hub", "design", "social-media"],
    sensitivity: "confidential",
    updateTrigger: ["client_upload", "human_edit"],
    currentSystemMapping: "/agency/brand-assets + lib/agency/brand-parser.ts",
  },
  {
    sourceId: "training_logs",
    label: "Logs de Treinamento SDR",
    description: "Resultados de simulações, scores, veredictos, issues e recomendações.",
    owner: "training-center",
    allowedDepartments: ["client-service-sdr", "quality"],
    sensitivity: "internal",
    updateTrigger: ["training_batch", "cron_sync"],
    currentSystemMapping: "prisma: DbSimulationRun + TrainingBatch",
  },
  {
    sourceId: "improvement_suggestions",
    label: "Sugestões de Melhoria (SDR)",
    description: "Sugestões geradas automaticamente a partir de padrões de falha nos treinamentos.",
    owner: "training-center",
    allowedDepartments: ["client-service-sdr", "quality"],
    sensitivity: "internal",
    updateTrigger: ["training_batch"],
    currentSystemMapping: "prisma: DbAgentSuggestion",
  },
  {
    sourceId: "brain_change_requests",
    label: "BrainChangeRequests",
    description: "Propostas de mudança na lógica do Brain. Aguardam aprovação do Brain Director.",
    owner: "brain-director",
    allowedDepartments: ["quality"],
    sensitivity: "internal",
    updateTrigger: ["training_batch", "human_edit"],
    currentSystemMapping: "prisma: BrainChangeRequest",
  },
  {
    sourceId: "quality_reviews",
    label: "Revisões de Qualidade",
    description: "Registros de aprovações, revisões e rejeições de entregas. Fonte de evidence.",
    owner: "quality",
    allowedDepartments: ["quality", "project-management"],
    sensitivity: "internal",
    updateTrigger: ["approved_deliverable", "human_edit"],
    currentSystemMapping: "prisma: Deliverable.revisionHistory",
  },
  {
    sourceId: "evidence",
    label: "Evidências de Resultado",
    description: "Prova de valor gerado: métricas, elogios do cliente, melhorias de performance.",
    owner: "quality",
    allowedDepartments: ["quality", "project-management"],
    sensitivity: "internal",
    updateTrigger: ["approved_deliverable", "human_edit"],
    currentSystemMapping: null,
  },
];

export function getKnowledgeSource(sourceId: string): KnowledgeSource | undefined {
  return KNOWLEDGE_SOURCES.find((s) => s.sourceId === sourceId);
}

export function getSourcesByDepartment(departmentId: string): KnowledgeSource[] {
  return KNOWLEDGE_SOURCES.filter((s) => s.allowedDepartments.includes(departmentId));
}

export function getSourcesByOwner(owner: string): KnowledgeSource[] {
  return KNOWLEDGE_SOURCES.filter((s) => s.owner === owner);
}
