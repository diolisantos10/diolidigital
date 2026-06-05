// Department Operating Blueprint V1
// ─────────────────────────────────────────────────────────────────────────────
// The reusable, universal operating model for ANY department inside Dioli
// Agency OS. A department is a real business unit: it receives demand, runs a
// work queue, executes a process, produces deliverables, hands off to the next
// department, and is observable via a dashboard.
//
// This file is pure data + types — no store access, no side effects, no
// provider/integration logic. AI, humans, and tools are described as *layers*
// the department will later contain, not as live wiring.
//
// Design is the first gold-standard implementation. Every other department uses
// the same shell; unfinished sections are explicitly marked "A configurar" so
// the model can be perfected once and replicated.
// ─────────────────────────────────────────────────────────────────────────────

import type { DepartmentId } from "@/lib/agency/departments";

// ── Shared status vocabulary ────────────────────────────────────────────────
// Every work item inside any department moves through this lifecycle.
export type WorkItemStatus =
  | "waiting_for_input"
  | "ready_to_start"
  | "in_progress"
  | "waiting_review"
  | "waiting_client_approval"
  | "revision_requested"
  | "completed"
  | "blocked";

export const WORK_ITEM_STATUS_META: Record<
  WorkItemStatus,
  { label: string; tone: "neutral" | "info" | "progress" | "review" | "warning" | "success" | "blocked" }
> = {
  waiting_for_input: { label: "Aguardando input", tone: "warning" },
  ready_to_start: { label: "Pronto para iniciar", tone: "info" },
  in_progress: { label: "Em andamento", tone: "progress" },
  waiting_review: { label: "Aguardando revisão", tone: "review" },
  waiting_client_approval: { label: "Aguardando aprovação", tone: "review" },
  revision_requested: { label: "Revisão solicitada", tone: "warning" },
  completed: { label: "Concluído", tone: "success" },
  blocked: { label: "Bloqueado", tone: "blocked" },
};

export type ReadinessStatus = "ready" | "partial" | "not_configured";

// ── 1. Identity ──────────────────────────────────────────────────────────────
export interface BlueprintIdentity {
  name: string;
  mission: string;
  roleInAgency: string;       // where it sits in the agency machine
  businessPurpose: string;    // why the agency runs this unit
  successDefinition: string;  // what "good" looks like
}

// ── 2. Demand Intake ─────────────────────────────────────────────────────────
// How the department receives demand. Future intake channels (WhatsApp, audio,
// chat, guided interview, questionnaire, uploads, internal PM) are declared here
// as *accepted demand sources* so the section can classify them later.
export type DemandSourceKind =
  | "internal_pm"
  | "handoff"
  | "client_questionnaire"
  | "guided_interview"
  | "chat_briefing"
  | "audio_briefing"
  | "whatsapp"
  | "uploaded_document";

export interface DemandSource {
  kind: DemandSourceKind;
  label: string;
  status: "active" | "planned";  // planned = future channel, not built yet
  description: string;
}

export interface IntakeField {
  label: string;
  description: string;
}

export interface BlueprintIntake {
  howDemandArrives: string;
  acceptedSources: DemandSource[];
  acceptedInputTypes: string[];
  requiredInformation: IntakeField[];
  optionalInformation: IntakeField[];
  inputQualityScoreModel: string;        // how intake quality is scored
  missingInformationBehavior: string;    // what happens when info is missing
}

// ── 3 + 4. Work Queue & Operating Status ──────────────────────────────────────
export interface BlueprintWorkQueue {
  priorityLevels: string[];
  ownerRole: string;
  // The lanes a department board surfaces; each maps to one or more statuses.
  lanes: { key: string; label: string; statuses: WorkItemStatus[] }[];
  description: string;
}

// ── 5. Execution Process ──────────────────────────────────────────────────────
export interface ExecutionStep {
  order: number;
  title: string;
  description: string;
  internalCheck?: string;       // what must be true to leave this step
  collaborationPoint?: string;  // who is looped in here
}

export interface BlueprintExecution {
  steps: ExecutionStep[];
  internalChecks: string[];
  collaborationPoints: string[];
  escalationRules: string[];
  handoffRules: string[];
}

// ── 6. Deliverables ────────────────────────────────────────────────────────────
export interface BlueprintDeliverableType {
  label: string;
  outputFormat: string;
  acceptanceCriteria: string[];
}

export interface BlueprintDeliverables {
  types: BlueprintDeliverableType[];
  reviewRules: string[];
  approvalFlow: string[];   // ordered approval steps
}

// ── 7. Handoffs ────────────────────────────────────────────────────────────────
export interface HandoffEdge {
  otherDeptId: DepartmentId | "client" | "external";
  artifacts: string[];
  trigger: string;
  qualityChecklist: string[];
}

export interface BlueprintHandoffs {
  receives: HandoffEdge[];   // inbound
  sends: HandoffEdge[];      // outbound
}

// ── 8. Intelligence Layer (provider-agnostic) ──────────────────────────────────
export interface BlueprintIntelligence {
  canAnalyze: string[];
  supportsDecisions: string[];
  canRecommend: string[];
  mustNeverDecideAlone: string[];
}

// ── 9. Tools & Integrations (categories only, no live wiring) ──────────────────
export interface ToolCategory {
  category: string;
  examples: string[];
  required: boolean;
  readiness: ReadinessStatus;
}

export interface BlueprintTools {
  categories: ToolCategory[];
}

// ── 10. Human Staff Layer ──────────────────────────────────────────────────────
export interface HumanRole {
  title: string;
  responsibilities: string[];
  permissions: string[];
}

export interface BlueprintPeople {
  roles: HumanRole[];
  takeoverRules: string[];          // when a human overrides AI
  aiHumanCollaboration: string[];   // how AI and humans share work
}

// ── 11. Department Dashboard ────────────────────────────────────────────────────
// Declarative descriptor — the page derives live numbers from the store and
// renders these cards. Pure config here, no data.
export interface DashboardCard {
  key:
    | "active_work"
    | "blocked_work"
    | "pending_reviews"
    | "pending_approvals"
    | "output_count"
    | "quality_issues"
    | "next_action"
    | "health_score";
  label: string;
}

export interface BlueprintDashboard {
  cards: DashboardCard[];
}

// ── 12. Quality Control ─────────────────────────────────────────────────────────
export interface BlueprintQuality {
  beforeStart: string[];
  beforeDelivery: string[];
  beforeHandoff: string[];
  commonFailurePoints: string[];
  qualityScoreModel: string;
}

// ── 13. History & Audit ─────────────────────────────────────────────────────────
export interface BlueprintHistory {
  tracks: string[];   // what the audit trail records
  description: string;
}

// ── The universal blueprint ─────────────────────────────────────────────────────
export interface DepartmentOperatingBlueprint {
  departmentId: DepartmentId;
  // Gold-standard depts are fully configured; others use the shell and mark gaps.
  maturity: "gold_standard" | "shell";
  identity: BlueprintIdentity;
  intake: BlueprintIntake | null;
  workQueue: BlueprintWorkQueue | null;
  execution: BlueprintExecution | null;
  deliverables: BlueprintDeliverables | null;
  handoffs: BlueprintHandoffs | null;
  intelligence: BlueprintIntelligence | null;
  tools: BlueprintTools | null;
  people: BlueprintPeople | null;
  dashboard: BlueprintDashboard;
  quality: BlueprintQuality | null;
  history: BlueprintHistory;
}

// Standard dashboard every department shows.
const STANDARD_DASHBOARD: BlueprintDashboard = {
  cards: [
    { key: "active_work", label: "Trabalho ativo" },
    { key: "blocked_work", label: "Bloqueado" },
    { key: "pending_reviews", label: "Em revisão" },
    { key: "pending_approvals", label: "Aguardando aprovação" },
    { key: "output_count", label: "Entregas produzidas" },
    { key: "quality_issues", label: "Problemas de qualidade" },
    { key: "health_score", label: "Saúde do dept." },
    { key: "next_action", label: "Próxima ação" },
  ],
};

// Standard work-queue lanes shared by every department board.
const STANDARD_LANES: BlueprintWorkQueue["lanes"] = [
  { key: "incoming", label: "Entrando", statuses: ["waiting_for_input", "ready_to_start"] },
  { key: "active", label: "Em execução", statuses: ["in_progress"] },
  { key: "review", label: "Em revisão", statuses: ["waiting_review", "waiting_client_approval", "revision_requested"] },
  { key: "blocked", label: "Bloqueado", statuses: ["blocked"] },
  { key: "done", label: "Concluído", statuses: ["completed"] },
];

// Standard history descriptor (same audit surface for every department).
const STANDARD_HISTORY: BlueprintHistory = {
  tracks: [
    "Log de atividade do departamento",
    "Log de decisões (quem decidiu o quê e por quê)",
    "Histórico de versões das entregas",
    "Registros de aprovação",
    "Registros de revisão",
    "Registros de handoff entre departamentos",
  ],
  description:
    "Cada item de trabalho mantém uma trilha auditável: atividades, decisões, versões, aprovações, revisões e handoffs.",
};

// Future intake channels available to every department (declared, not built).
const FUTURE_INTAKE_SOURCES: DemandSource[] = [
  { kind: "internal_pm", label: "Intake interno do PM", status: "active", description: "Demanda criada pelo PM a partir de um projeto aprovado." },
  { kind: "handoff", label: "Handoff de outro departamento", status: "active", description: "Entrada recebida no fluxo entre departamentos." },
  { kind: "client_questionnaire", label: "Questionário do cliente", status: "planned", description: "Formulário estruturado preenchido pelo cliente." },
  { kind: "guided_interview", label: "Entrevista guiada", status: "planned", description: "Roteiro de perguntas conduzido passo a passo." },
  { kind: "chat_briefing", label: "Briefing por chat", status: "planned", description: "Demanda capturada em conversa de texto." },
  { kind: "audio_briefing", label: "Briefing por áudio", status: "planned", description: "Áudio transcrito e classificado em demanda." },
  { kind: "whatsapp", label: "WhatsApp", status: "planned", description: "Mensagens de WhatsApp convertidas em pedidos de trabalho." },
  { kind: "uploaded_document", label: "Documento enviado", status: "planned", description: "Arquivos (brand book, PDF, deck) processados em briefing." },
];

// ═══════════════════════════════════════════════════════════════════════════════
// GOLD STANDARD — Design Department
// ═══════════════════════════════════════════════════════════════════════════════
const DESIGN_BLUEPRINT: DepartmentOperatingBlueprint = {
  departmentId: "design",
  maturity: "gold_standard",
  identity: {
    name: "Design",
    mission:
      "Traduzir estratégia e identidade de marca em peças visuais consistentes, de alto padrão e prontas para uso em todos os canais.",
    roleInAgency:
      "Unidade criativa de execução visual. Recebe direção de Estratégia/Social/Brand e produz os ativos que o cliente vê.",
    businessPurpose:
      "Garantir que toda comunicação visual da agência reforce o posicionamento do cliente e seja entregue com qualidade e velocidade previsíveis.",
    successDefinition:
      "Peças aprovadas em até 2 rodadas de revisão, 100% em conformidade com o Brand Brain, entregues no prazo e reaproveitáveis em campanhas futuras.",
  },
  intake: {
    howDemandArrives:
      "A demanda chega como handoff de Social Media ou Estratégia, ou como pedido direto do PM a partir de um projeto aprovado.",
    acceptedSources: FUTURE_INTAKE_SOURCES,
    acceptedInputTypes: [
      "Briefing criativo",
      "Calendário editorial (Social)",
      "Direção estratégica (Strategy Room)",
      "Brand Hub do cliente",
      "Assets do cliente (logos, fotos, brand book)",
    ],
    requiredInformation: [
      { label: "Brand Hub com estilo visual", description: "Paleta de cores, tipografia e estilo aprovados." },
      { label: "Objetivo da peça", description: "Para que serve cada asset (post, anúncio, banner, apresentação)." },
      { label: "Formato e dimensões", description: "Especificação técnica por canal/plataforma." },
      { label: "Texto/copy a aplicar", description: "Conteúdo textual final aprovado para a peça." },
    ],
    optionalInformation: [
      { label: "Referências visuais", description: "Mood boards ou exemplos que o cliente gosta." },
      { label: "Assets originais", description: "Arquivos de marca em alta resolução." },
      { label: "Restrições", description: "O que evitar visualmente (cores, estilos, concorrentes)." },
    ],
    inputQualityScoreModel:
      "Score 0–100 = % dos campos obrigatórios preenchidos e válidos. < 60 bloqueia início; 60–85 inicia com alerta; > 85 pronto.",
    missingInformationBehavior:
      "Item entra em 'waiting_for_input'. O departamento gera um pedido de material e notifica o PM; produção não inicia até o input mínimo chegar.",
  },
  workQueue: {
    priorityLevels: ["critical", "high", "medium", "low"],
    ownerRole: "Design Lead (futuro) / Design Agent",
    lanes: STANDARD_LANES,
    description:
      "O board do Design organiza pedidos por lane de status. Itens sem input ficam visíveis para destravar antes de ocupar capacidade de execução.",
  },
  execution: {
    steps: [
      { order: 1, title: "Validar briefing", description: "Conferir se inputs obrigatórios estão completos.", internalCheck: "Brand Hub + objetivo + formato + copy presentes." },
      { order: 2, title: "Definir direção criativa", description: "Mood board, paleta e referências aprovadas.", collaborationPoint: "Alinhamento com Estratégia/Brand quando necessário." },
      { order: 3, title: "Produzir peças", description: "Executar os assets conforme briefing e Brand Brain." },
      { order: 4, title: "Checagem interna", description: "Revisão de qualidade antes de expor ao cliente.", internalCheck: "Conformidade com paleta, tipografia e dimensões." },
      { order: 5, title: "Aprovação do PM", description: "PM valida antes do envio ao cliente.", collaborationPoint: "PM" },
      { order: 6, title: "Revisão do cliente", description: "Cliente aprova ou solicita revisão." },
      { order: 7, title: "Handoff/entrega final", description: "Arquivos finais entregues e/ou repassados ao Tráfego Pago." },
    ],
    internalChecks: [
      "Paleta e tipografia em conformidade com o Brand Brain",
      "Dimensões corretas por canal",
      "Textos sem erros e legíveis sobre a arte",
      "Imagens licenciadas ou originais",
    ],
    collaborationPoints: [
      "Estratégia — direção criativa em campanhas complexas",
      "Social Media — briefing por peça e calendário",
      "Brand Hub — dúvidas de identidade",
      "PM — aprovação antes do cliente",
    ],
    escalationRules: [
      "3+ rodadas de revisão → reunião criativa com cliente",
      "Briefing incompleto reincidente → escalonar ao PM",
    ],
    handoffRules: [
      "Só entrega ao cliente após aprovação do PM",
      "Criativos só vão ao Tráfego Pago quando aprovados e em formato de anúncio",
    ],
  },
  deliverables: {
    types: [
      { label: "Direção criativa", outputFormat: "Documento / mood board", acceptanceCriteria: ["Paleta e tipografia definidas", "Referências aprovadas"] },
      { label: "Peças de redes sociais", outputFormat: "PNG / JPG por formato", acceptanceCriteria: ["Dimensões corretas", "Copy aplicada", "Conformidade de marca"] },
      { label: "Criativos para anúncios", outputFormat: "Pacote por plataforma", acceptanceCriteria: ["Variações por formato", "Especificações Meta/Google"] },
      { label: "Templates reutilizáveis", outputFormat: "Arquivo editável", acceptanceCriteria: ["Camadas organizadas", "Fácil reuso"] },
    ],
    reviewRules: [
      "Checagem interna obrigatória antes do PM",
      "Máximo 2 rodadas de revisão sem escalonamento",
    ],
    approvalFlow: ["Checagem interna do Design", "Aprovação do PM", "Aprovação do cliente", "Entrega final"],
  },
  handoffs: {
    receives: [
      { otherDeptId: "social-media", artifacts: ["Conceitos de posts", "Briefing visual por peça", "Calendário com datas"], trigger: "Calendário editorial aprovado", qualityChecklist: ["Cada peça tem objetivo", "Copy final incluída", "Dimensões especificadas"] },
      { otherDeptId: "strategy", artifacts: ["Direção criativa", "Posicionamento visual", "Referências aprovadas"], trigger: "Strategy Room aprovado", qualityChecklist: ["Direção alinhada ao posicionamento", "Brand Hub revisado"] },
      { otherDeptId: "brand-hub", artifacts: ["Paleta", "Tipografia", "Regras de identidade"], trigger: "Brand Hub completo", qualityChecklist: ["Estilo visual preenchido", "Regras de marca claras"] },
    ],
    sends: [
      { otherDeptId: "paid-traffic", artifacts: ["Criativos aprovados", "Especificações por plataforma", "Variações de copy visual"], trigger: "Criativos aprovados pelo PM", qualityChecklist: ["Formatos por plataforma prontos", "Conformidade de marca", "Aprovação do PM registrada"] },
      { otherDeptId: "client", artifacts: ["Arquivos finais", "Templates"], trigger: "Aprovação do cliente", qualityChecklist: ["Alta resolução disponível", "Formatos solicitados entregues"] },
    ],
  },
  intelligence: {
    canAnalyze: [
      "Completude e qualidade do briefing criativo",
      "Conformidade da peça com o Brand Brain",
      "Lacunas de assets necessários",
    ],
    supportsDecisions: [
      "Priorização da fila de peças",
      "Sugestão de direção visual e prompts de imagem",
      "Identificação de risco criativo antes da execução",
    ],
    canRecommend: [
      "Direção visual e referências",
      "Requisitos de assets a solicitar do cliente",
      "Recomendações de brief criativo",
    ],
    mustNeverDecideAlone: [
      "Aprovar peça para o cliente sem revisão humana/PM",
      "Alterar a identidade de marca",
      "Descartar feedback do cliente",
    ],
  },
  tools: {
    categories: [
      { category: "Editor de design", examples: ["Canva", "Figma"], required: true, readiness: "partial" },
      { category: "Geração de imagem por IA", examples: ["OpenAI Images", "Midjourney"], required: false, readiness: "partial" },
      { category: "Banco de assets / DAM", examples: ["Google Drive", "Dropbox"], required: false, readiness: "not_configured" },
      { category: "Aprovação / feedback visual", examples: ["Portal do cliente"], required: true, readiness: "ready" },
    ],
  },
  people: {
    roles: [
      { title: "Design Lead", responsibilities: ["Direção criativa", "Garantia de qualidade", "Aprovação interna"], permissions: ["Aprovar peças internamente", "Reatribuir trabalho"] },
      { title: "Designer", responsibilities: ["Produção de peças", "Aplicação do Brand Brain"], permissions: ["Editar entregas", "Solicitar materiais"] },
    ],
    takeoverRules: [
      "Humano pode assumir qualquer peça gerada por IA antes da aprovação",
      "Decisões de identidade de marca exigem humano",
    ],
    aiHumanCollaboration: [
      "IA propõe direção e rascunhos; humano refina e aprova",
      "IA verifica conformidade; humano decide exceções",
    ],
  },
  dashboard: STANDARD_DASHBOARD,
  quality: {
    beforeStart: [
      "Brand Hub com estilo visual preenchido",
      "Briefing criativo completo e aprovado",
      "Objetivo e formato de cada peça definidos",
    ],
    beforeDelivery: [
      "Paleta e tipografia conferidas",
      "Textos revisados e legíveis",
      "Dimensões corretas por canal",
      "Aprovação interna realizada",
    ],
    beforeHandoff: [
      "Aprovação do PM registrada",
      "Formatos por plataforma prontos (para Tráfego Pago)",
      "Arquivos em alta resolução disponíveis",
    ],
    commonFailurePoints: [
      "Início sem briefing completo",
      "Peça fora da paleta/tipografia da marca",
      "Entrega ao cliente sem aprovação do PM",
      "Falta de variações por formato",
    ],
    qualityScoreModel:
      "Score = média ponderada das checklists (início, entrega, handoff). Falhas críticas (marca/aprovação) zeram o item.",
  },
  history: STANDARD_HISTORY,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHELLS — other departments use the same model; gaps are "A configurar".
// Identity + dashboard + history are filled (cheap, universal). The heavier
// operational sections are intentionally null until each dept is promoted to
// gold standard.
// ═══════════════════════════════════════════════════════════════════════════════
function shell(
  departmentId: DepartmentId,
  identity: BlueprintIdentity,
  overrides: Partial<Omit<DepartmentOperatingBlueprint, "departmentId" | "maturity" | "identity" | "dashboard" | "history">> = {},
): DepartmentOperatingBlueprint {
  return {
    departmentId,
    maturity: "shell",
    identity,
    intake: overrides.intake ?? null,
    workQueue: overrides.workQueue ?? { priorityLevels: ["critical", "high", "medium", "low"], ownerRole: "A configurar", lanes: STANDARD_LANES, description: "Fila padrão. Regras específicas a configurar." },
    execution: overrides.execution ?? null,
    deliverables: overrides.deliverables ?? null,
    handoffs: overrides.handoffs ?? null,
    intelligence: overrides.intelligence ?? null,
    tools: overrides.tools ?? null,
    people: overrides.people ?? null,
    dashboard: STANDARD_DASHBOARD,
    quality: overrides.quality ?? null,
    history: STANDARD_HISTORY,
  };
}

const SHELL_BLUEPRINTS: DepartmentOperatingBlueprint[] = [
  shell("strategy", {
    name: "Estratégia",
    mission: "Transformar Brand Brain e objetivos do cliente em estratégia clara e acionável.",
    roleInAgency: "Unidade de inteligência e direção. Origem do briefing que guia toda a execução.",
    businessPurpose: "Garantir que toda execução parta de uma estratégia validada e mensurável.",
    successDefinition: "Strategy Room aprovado, posicionamento validado e departamentos acionados corretamente.",
  }),
  shell("social-media", {
    name: "Social Media",
    mission: "Criar e gerir conteúdo estratégico que engaja o público e fortalece a marca.",
    roleInAgency: "Unidade de conteúdo. Converte estratégia em calendário e peças sociais.",
    businessPurpose: "Manter presença consistente e relevante nos canais do cliente.",
    successDefinition: "Calendário aprovado, conteúdo no tom da marca e handoff de design no prazo.",
  }),
  shell("paid-traffic", {
    name: "Tráfego Pago",
    mission: "Planejar e otimizar campanhas de mídia paga com eficiência de budget.",
    roleInAgency: "Unidade de performance. Transforma estratégia e criativos em campanhas mensuráveis.",
    businessPurpose: "Gerar resultados de negócio mensuráveis com ROI controlado.",
    successDefinition: "Campanhas estruturadas, públicos validados e plano de otimização com KPIs.",
  }),
  shell("project-management", {
    name: "Gestão de Projetos",
    mission: "Garantir que projetos avancem no pipeline sem bloqueios e com clientes alinhados.",
    roleInAgency: "Unidade de coordenação. Orquestra demanda, prazos e dependências entre departamentos.",
    businessPurpose: "Manter o fluxo da agência previsível e sem gargalos.",
    successDefinition: "Projetos no prazo, sem bloqueios pendentes e com comunicação clara ao cliente.",
  }),
  shell("brand-hub", {
    name: "Brand Hub",
    mission: "Manter o Brand Brain atualizado e garantir consistência de marca nas entregas.",
    roleInAgency: "Unidade de guarda da marca. Fonte de verdade de identidade para os outros departamentos.",
    businessPurpose: "Proteger e evoluir a identidade de cada cliente.",
    successDefinition: "Brand Brain completo, consistente e respeitado em todas as entregas.",
  }),
  shell("operations", {
    name: "Operações & Sistema",
    mission: "Garantir a saúde operacional da agência e resolver bloqueios sistêmicos.",
    roleInAgency: "Unidade de infraestrutura. Monitora o sistema e a prontidão dos demais departamentos.",
    businessPurpose: "Manter o sistema operacional saudável e sem bloqueios.",
    successDefinition: "Score de sistema saudável, integrações verificadas e bloqueios resolvidos em 24h.",
  }),
];

export const DEPARTMENT_BLUEPRINTS: DepartmentOperatingBlueprint[] = [
  DESIGN_BLUEPRINT,
  ...SHELL_BLUEPRINTS,
];

export function getBlueprint(departmentId: string): DepartmentOperatingBlueprint | undefined {
  return DEPARTMENT_BLUEPRINTS.find((b) => b.departmentId === departmentId);
}

// ── Completeness scoring (used by System Doctor + UI) ──────────────────────────
export interface BlueprintGap {
  section: string;
  detail: string;
}

export function getBlueprintGaps(b: DepartmentOperatingBlueprint): BlueprintGap[] {
  const gaps: BlueprintGap[] = [];
  if (!b.identity.mission?.trim()) gaps.push({ section: "Identidade", detail: "Missão ausente." });
  if (!b.intake) gaps.push({ section: "Intake", detail: "Regras de intake não configuradas." });
  else if (b.intake.requiredInformation.length === 0) gaps.push({ section: "Intake", detail: "Sem informações obrigatórias definidas." });
  if (!b.deliverables || b.deliverables.types.length === 0) gaps.push({ section: "Entregas", detail: "Tipos de entrega não definidos." });
  if (!b.handoffs || (b.handoffs.sends.length === 0 && b.handoffs.receives.length === 0)) gaps.push({ section: "Handoffs", detail: "Regras de handoff não configuradas." });
  if (!b.quality || (b.quality.beforeStart.length === 0 && b.quality.beforeHandoff.length === 0)) gaps.push({ section: "Qualidade", detail: "Checklist de qualidade ausente." });
  if (!b.execution || b.execution.steps.length === 0) gaps.push({ section: "Execução", detail: "Processo de execução não definido." });
  return gaps;
}

export function getBlueprintCompleteness(b: DepartmentOperatingBlueprint): number {
  // 7 weighted sections; identity always counts.
  const sections = [
    !!b.identity.mission?.trim(),
    !!b.intake && b.intake.requiredInformation.length > 0,
    !!b.execution && b.execution.steps.length > 0,
    !!b.deliverables && b.deliverables.types.length > 0,
    !!b.handoffs && (b.handoffs.sends.length > 0 || b.handoffs.receives.length > 0),
    !!b.quality && (b.quality.beforeStart.length > 0 || b.quality.beforeHandoff.length > 0),
    !!b.intelligence && b.intelligence.canAnalyze.length > 0,
  ];
  const done = sections.filter(Boolean).length;
  return Math.round((done / sections.length) * 100);
}
