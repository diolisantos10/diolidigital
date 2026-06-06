// ─── System Doctor V1 — Autonomous Operational Diagnostics ───────────────────
//
// Pure diagnostic engine. No store access, no side-effects.
// Pass current store slices in; receive a structured DiagnosticReport back.
// Runs on every page load — no manual steps needed.
//
// Groups:
//   1. Dados do Piloto      — client, project, proposal, pricing, deliverables
//   2. Operações do Projeto — strategy room, materials, revisions, health
//   3. Infraestrutura       — persistence, portal risk, localStorage risk
//   4. Prontidão dos Agentes— Social (a3), Design (a2), Ads (a4)
// ─────────────────────────────────────────────────────────────────────────────

import type { Client, Project, Deliverable, StrategyRoom, Task } from "@/lib/agency/mock-data";
import type { ClientRequest } from "@/lib/agency/client-requests";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { isValidProposalPricing } from "@/lib/agency/reporting";
import { needsRevision } from "@/lib/agency/deliverables";
import {
  MOCK_INTEGRATIONS,
  PROVIDER_INTEGRATION_MAP,
  type IntegrationConfig,
  type AgentProviderConfig,
} from "@/lib/agency/integrations";
import type { AIRunLog } from "@/store/agency-store";
import {
  DEPARTMENT_BLUEPRINTS,
  getBlueprintGaps,
} from "@/lib/agency/department-blueprint";
import { DEPARTMENT_DEFS } from "@/lib/agency/departments";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckStatus = "pass" | "warning" | "fail" | "info";
export type CheckSeverity = "critical" | "high" | "medium" | "low";

export interface DiagnosticCheck {
  id: string;
  group: string;
  label: string;
  status: CheckStatus;
  severity: CheckSeverity;
  explanation: string;   // what the system found
  action: string;        // recommended operator action
  route?: string;        // deeplink to the relevant page
}

export interface DiagnosticReport {
  checks: DiagnosticCheck[];
  score: number;          // 0–100, weighted pass rate across scored checks
  pass: number;
  warning: number;
  fail: number;
  info: number;
  topAction: string;      // text of the most urgent recommended action
  overallStatus: "healthy" | "degraded" | "critical";
}

// Canonical pilot IDs
export const PILOT_CLIENT_ID = "c4";
export const PILOT_PROJECT_ID = "p7";

// Agent IDs that must be ready for the pilot
const PILOT_AGENTS: { id: string; label: string }[] = [
  { id: "a3", label: "Social Media" },
  { id: "a2", label: "Design" },
  { id: "a4", label: "Tráfego Pago (Ads)" },
];

// ─── Weight table ─────────────────────────────────────────────────────────────
// info checks are unscored (weight 0). All others count toward the score.
// pass = full weight, warning = ½ weight, fail = 0.

const SEVERITY_WEIGHT: Record<CheckSeverity, number> = {
  critical: 10,
  high: 7,
  medium: 4,
  low: 2,
};

// ─── Core runner ─────────────────────────────────────────────────────────────

export interface DbSyncStatus {
  clients?: "db" | "local";
  projects?: "db" | "local";
  tasks?: "db" | "local";
  deliverables?: "db" | "local";
  materialRequests?: "db" | "local";
  brandHub?: "db" | "local";
  activityEvents?: "db" | "local";
  strategyRooms?: "db" | "local";
  briefings?: "db" | "local";
  brandUpdates?: "db" | "local";
  agentOutputs?: "db" | "local";
}

export interface DoctorInput {
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
  tasks?: Task[];
  persisted: boolean;
  integrationConfigs?: IntegrationConfig[];
  agentProviderConfigs?: AgentProviderConfig[];
  // SaaS foundation status — populated asynchronously in settings page
  dbAvailable?: boolean;
  authMode?: "real" | "mock" | "none";
  portalMode?: "token" | "id_legacy";
  sessionActive?: boolean;
  sessionUser?: string;
  dbSyncStatus?: DbSyncStatus;
  // AI intelligence run logs — from agency store or DB
  aiRunLogs?: AIRunLog[];
  // Source reported by useDbAIRunLogs hook; undefined = not yet resolved
  aiRunLogSource?: "db" | "local";
  // OpenAI provider status (GET /api/ai/run); undefined = not yet resolved
  openaiConfigured?: boolean;
  // Per-department provider selections (from departmentConfigs)
  departmentConfigs?: { departmentId: string; aiProvider: string }[];
  // Client requests from portal Briefing Room
  clientRequests?: ClientRequest[];
}

export function runSystemDoctor(input: DoctorInput): DiagnosticReport {
  const { clients, projects, deliverables, materialRequests, strategyRooms, tasks = [], persisted, integrationConfigs, agentProviderConfigs, dbAvailable, authMode, portalMode, sessionActive, sessionUser, dbSyncStatus, aiRunLogs = [], aiRunLogSource, openaiConfigured, departmentConfigs = [], clientRequests = [] } = input;

  const checks: DiagnosticCheck[] = [];

  // ── Group 1: Dados do Piloto ──────────────────────────────────────────────

  const pilotClient = clients.find((c) => c.id === PILOT_CLIENT_ID);
  checks.push({
    id: "pilot-client",
    group: "Dados do Piloto",
    label: "Cliente Dioli Digital cadastrado",
    status: pilotClient ? "pass" : "fail",
    severity: "critical",
    explanation: pilotClient
      ? "Dioli Digital (c4) disponível no workspace."
      : "Cliente Dioli Digital ausente. Os dados do piloto precisam ser carregados.",
    action: pilotClient
      ? "Nenhuma ação necessária."
      : "Acesse Configurações → Carregar dados do piloto Dioli Digital.",
    route: pilotClient ? "/agency/clients" : "/agency/settings",
  });

  const pilotProject = projects.find((p) => p.id === PILOT_PROJECT_ID);
  checks.push({
    id: "pilot-project",
    group: "Dados do Piloto",
    label: "Projeto piloto p7 carregado",
    status: pilotProject ? "pass" : "fail",
    severity: "critical",
    explanation: pilotProject
      ? `Projeto "${pilotProject.name}" ativo na fase ${pilotProject.stage}.`
      : "Projeto piloto p7 não encontrado no workspace.",
    action: pilotProject
      ? "Nenhuma ação necessária."
      : "Acesse Configurações → Carregar dados do piloto Dioli Digital.",
    route: pilotProject ? `/agency/projects/${PILOT_PROJECT_ID}` : "/agency/settings",
  });

  const proposalStatus = pilotProject?.proposal?.status;
  const proposalPricing = pilotProject?.proposal?.pricing;
  const pricingValid = isValidProposalPricing(proposalPricing);

  checks.push({
    id: "pilot-proposal-status",
    group: "Dados do Piloto",
    label: "Status da proposta do piloto",
    status: proposalStatus === "approved" ? "pass" : proposalStatus === "sent" ? "warning" : "fail",
    severity: "high",
    explanation:
      proposalStatus === "approved"
        ? "Proposta aprovada — execução desbloqueada."
        : proposalStatus === "sent"
        ? "Proposta enviada ao cliente, aguardando aprovação. Sem ação pendente do time."
        : "Proposta em rascunho — ainda não enviada ao cliente Dioli Digital.",
    action:
      proposalStatus === "approved"
        ? "Nenhuma ação necessária."
        : proposalStatus === "sent"
        ? "Acompanhe a aprovação pelo portal ou entre em contato com Dioli Digital diretamente."
        : "Abrir Projeto 'Lançamento Dioli Agência' → aba Proposta → preencher escopo e clicar em 'Enviar ao Cliente'.",
    route: `/agency/projects/${PILOT_PROJECT_ID}?tab=proposal`,
  });

  checks.push({
    id: "pilot-proposal-pricing",
    group: "Dados do Piloto",
    label: "Precificação da proposta válida",
    status: !pilotProject ? "fail" : pricingValid ? "pass" : "fail",
    severity: "critical",
    explanation: !pilotProject
      ? "Projeto piloto ausente — precificação não verificável."
      : pricingValid
      ? `Valor definido: ${proposalPricing}. Proposta desbloqueada para envio.`
      : `Precificação em placeholder ou vazia: "${proposalPricing ?? "(vazio)"}". Impede o envio da proposta ao cliente.`,
    action: pricingValid
      ? "Nenhuma ação necessária."
      : "Abrir Projeto 'Lançamento Dioli Agência' → aba Proposta → campo Investimento → substituir placeholder por valor real (ex.: \"R$ 4.500 / mês\").",
    route: `/agency/projects/${PILOT_PROJECT_ID}?tab=proposal`,
  });

  const p7Deliverables = deliverables.filter((d) => d.projectId === PILOT_PROJECT_ID);
  const delCount = p7Deliverables.length;
  checks.push({
    id: "pilot-deliverables",
    group: "Dados do Piloto",
    label: "Entregas do piloto carregadas",
    status: delCount >= 10 ? "pass" : delCount > 0 ? "warning" : "fail",
    severity: "high",
    explanation:
      delCount >= 10
        ? `${delCount} entregas disponíveis para o projeto piloto.`
        : delCount > 0
        ? `Apenas ${delCount} entrega(s) encontradas. O piloto completo tem 16.`
        : "Nenhuma entrega encontrada para o projeto piloto.",
    action:
      delCount >= 10
        ? "Nenhuma ação necessária."
        : "Acesse Configurações → Carregar dados do piloto para restaurar todas as entregas.",
    route: `/agency/projects/${PILOT_PROJECT_ID}?tab=deliverables`,
  });

  // ── Group 2: Operações do Projeto ─────────────────────────────────────────

  const strategyRoom = strategyRooms.find((sr) => sr.projectId === PILOT_PROJECT_ID);
  checks.push({
    id: "strategy-room",
    group: "Operações do Projeto",
    label: "Strategy Room gerado",
    status: strategyRoom ? "pass" : "warning",
    severity: "medium",
    explanation: strategyRoom
      ? `Strategy Room disponível com análise especializada (status: ${strategyRoom.status}).`
      : "Strategy Room ainda não gerado para 'Lançamento Dioli Agência'. Agentes sem briefing estratégico.",
    action: strategyRoom
      ? "Nenhuma ação necessária."
      : "Abrir Projeto 'Lançamento Dioli Agência' → aba Centro de Comando → clicar em 'Gerar Strategy Room'.",
    route: `/agency/projects/${PILOT_PROJECT_ID}`,
  });

  const pendingMaterials = materialRequests.filter(
    (m) => m.projectId === PILOT_PROJECT_ID && m.status === "pending"
  ).length;
  checks.push({
    id: "material-requests",
    group: "Operações do Projeto",
    label: "Requisições de material do cliente",
    status: pendingMaterials === 0 ? "pass" : pendingMaterials <= 2 ? "warning" : "fail",
    severity: "medium",
    explanation:
      pendingMaterials === 0
        ? "Nenhuma requisição de material pendente para 'Lançamento Dioli Agência'."
        : `${pendingMaterials} requisição(ões) de material aguardando resposta da Dioli Digital. Pode bloquear entregas.`,
    action:
      pendingMaterials === 0
        ? "Nenhuma ação necessária."
        : "Abrir Projeto 'Lançamento Dioli Agência' → aba Materiais → identificar quais itens estão pendentes e acompanhar junto ao cliente.",
    route: `/agency/projects/${PILOT_PROJECT_ID}`,
  });

  const openRevisions = p7Deliverables.filter((d) => needsRevision(d)).length;
  checks.push({
    id: "open-revisions",
    group: "Operações do Projeto",
    label: "Revisões abertas",
    status: openRevisions === 0 ? "pass" : openRevisions <= 2 ? "warning" : "fail",
    severity: "high",
    explanation:
      openRevisions === 0
        ? "Nenhuma entrega de 'Lançamento Dioli Agência' requer revisão no momento."
        : `${openRevisions} entrega(s) com revisão solicitada pelo cliente ainda não resolvida.`,
    action:
      openRevisions === 0
        ? "Nenhuma ação necessária."
        : "Abrir Projeto 'Lançamento Dioli Agência' → aba Entregas → filtrar por 'Com Revisão' → abrir cada entrega e resolver o feedback.",
    route: `/agency/projects/${PILOT_PROJECT_ID}?tab=deliverables`,
  });

  const inReviewCount = p7Deliverables.filter((d) => d.status === "in_review").length;
  checks.push({
    id: "deliverables-review",
    group: "Operações do Projeto",
    label: "Entregas aguardando aprovação",
    status: inReviewCount === 0 ? "pass" : inReviewCount <= 4 ? "info" : "warning",
    severity: "low",
    explanation:
      inReviewCount === 0
        ? "Nenhuma entrega aguardando aprovação."
        : `${inReviewCount} entrega(s) em revisão pelo cliente — fluxo normal de pipeline.`,
    action:
      inReviewCount <= 4
        ? "Acompanhe as aprovações pelo portal do cliente."
        : "Muitas entregas em espera. Consolide ou comunique prazo ao cliente.",
    route: `/agency/projects/${PILOT_PROJECT_ID}?tab=deliverables`,
  });

  // Project health (derived from proposal + revisions + tasks)
  const proposalApproved = proposalStatus === "approved";
  let projectHealthStatus: CheckStatus;
  let projectHealthExplanation: string;
  if (!pilotProject) {
    projectHealthStatus = "fail";
    projectHealthExplanation = "Projeto piloto ausente.";
  } else if (!proposalApproved || openRevisions >= 3) {
    projectHealthStatus = "fail";
    projectHealthExplanation = !proposalApproved
      ? "Proposta não aprovada — execução bloqueada."
      : `${openRevisions} revisões abertas simultaneamente — pipeline congestionado.`;
  } else if (openRevisions > 0 || pendingMaterials > 0 || !strategyRoom) {
    projectHealthStatus = "warning";
    projectHealthExplanation = `Projeto em execução com atenção: ${
      [
        openRevisions > 0 ? `${openRevisions} revisão(ões) aberta(s)` : null,
        pendingMaterials > 0 ? `${pendingMaterials} material(is) pendente(s)` : null,
        !strategyRoom ? "Strategy Room ausente" : null,
      ]
        .filter(Boolean)
        .join(", ")
    }.`;
  } else {
    projectHealthStatus = "pass";
    projectHealthExplanation = "Projeto em execução saudável — proposta aprovada, sem revisões nem bloqueios.";
  }
  checks.push({
    id: "project-health",
    group: "Operações do Projeto",
    label: "Saúde geral do projeto piloto",
    status: projectHealthStatus,
    severity: "high",
    explanation: projectHealthExplanation,
    action:
      projectHealthStatus === "pass"
        ? "Nenhuma ação necessária."
        : "Abrir Projeto 'Lançamento Dioli Agência' → Centro de Comando → revisar alertas ativos e resolver bloqueios antes de continuar a execução.",
    route: `/agency/projects/${PILOT_PROJECT_ID}`,
  });

  // ── Group 3: Infraestrutura ──────────────────────────────────────────────

  checks.push({
    id: "persistence",
    group: "Infraestrutura",
    label: "Persistência do store ativa",
    status: persisted ? "pass" : "warning",
    severity: "medium",
    explanation: persisted
      ? "Dados gravados em localStorage (chave: agency-os-v1). Sessões futuras manterão o estado."
      : "Nenhum dado gravado ainda. Interaja com o sistema para disparar a persistência.",
    action: persisted
      ? "Nenhuma ação necessária."
      : "Use Configurações → Redefinir Dados Demo para forçar a gravação inicial.",
    route: "/agency/settings",
  });

  // These two are always-warning infrastructure risks — informational, not penalized in score.
  checks.push({
    id: "localstorage-risk",
    group: "Infraestrutura",
    label: "Risco: dados apenas locais",
    status: "info",
    severity: "medium",
    explanation:
      "Todos os dados vivem somente neste navegador. Limpar cookies/cache, trocar de dispositivo ou usar aba anônima apaga tudo permanentemente.",
    action: "Use Configurações → Redefinir Dados Demo regularmente para garantir dados de fábrica. Faça backup manual antes de limpeza de navegador.",
    route: "/agency/settings",
  });

  checks.push({
    id: "portal-no-auth",
    group: "Infraestrutura",
    label: "Risco: portal do cliente sem autenticação",
    status: "warning",
    severity: "high",
    explanation:
      "O portal do cliente é aberto por ID na URL (/portal/client/[id]) sem nenhum sistema de login. Qualquer pessoa com o link acessa todas as entregas daquele cliente.",
    action: "Compartilhe links do portal apenas diretamente com o cliente. Não divulgue IDs de cliente em redes sociais ou comunicações abertas.",
    route: "/portal/client/c4",
  });

  // ── Group 4: Prontidão dos Agentes ───────────────────────────────────────

  const assignedAgentIds = pilotProject?.agents ?? [];
  for (const agent of PILOT_AGENTS) {
    const assigned = assignedAgentIds.includes(agent.id);
    const agentDeliverables = p7Deliverables.filter(
      (d) => (d.ownerAgentId ?? "") === agent.id
    );
    const hasOutputs = agentDeliverables.length > 0;
    const agentStatus: CheckStatus = !assigned ? "fail" : !hasOutputs ? "warning" : "pass";
    checks.push({
      id: `agent-${agent.id}`,
      group: "Prontidão dos Agentes",
      label: `Agente ${agent.label}`,
      status: agentStatus,
      severity: "medium",
      explanation:
        agentStatus === "pass"
          ? `${agent.label} atribuído ao projeto com ${agentDeliverables.length} entrega(s) produzida(s).`
          : agentStatus === "warning"
          ? `${agent.label} atribuído ao projeto, mas sem entregas registradas ainda.`
          : `${agent.label} não está atribuído ao projeto piloto.`,
      action:
        agentStatus === "pass"
          ? "Nenhuma ação necessária."
          : agentStatus === "warning"
          ? `Abrir Agente ${agent.label} → verificar se há tarefas pendentes para 'Lançamento Dioli Agência' → produzir primeiras entregas.`
          : `Abrir Projeto 'Lançamento Dioli Agência' → aba Configurações → campo Agentes → adicionar Agente ${agent.label}.`,
      route:
        agent.id === "a3"
          ? "/agency/departments/social-media"
          : agent.id === "a2"
          ? "/agency/departments/design"
          : "/agency/departments/paid-traffic",
    });
  }

  // ── Group 5: Ferramentas & Integrações ───────────────────────────────────

  const configs = integrationConfigs ?? [];
  const isConfigured = (id: string) =>
    configs.find((c) => c.integrationId === id)?.configured ?? false;

  // AI provider check — use live config if available, else fall back to MOCK_INTEGRATIONS status
  const aiProviders = MOCK_INTEGRATIONS.filter((i) => i.category === "ai_provider");
  const configuredAI = aiProviders.filter((i) =>
    configs.length > 0 ? isConfigured(i.id) : (i.status === "active" || i.status === "configured")
  );
  const hasAIProvider = configuredAI.length > 0;
  checks.push({
    id: "integration-ai-provider",
    group: "Ferramentas & Integrações",
    label: "Provedor de IA configurado",
    status: hasAIProvider ? "pass" : "warning",
    severity: "medium",
    explanation: hasAIProvider
      ? `${configuredAI.map((i) => i.name).join(", ")} disponível(is) para agentes.`
      : "Nenhum provedor de IA configurado. Agentes operam em modo regras locais.",
    action: hasAIProvider
      ? "Nenhuma ação necessária."
      : "Acesse Ferramentas & Integrações → configure OpenAI ou Claude.",
    route: "/agency/integrations",
  });

  const imageGenConfigured = isConfigured("int-openai-images");
  checks.push({
    id: "integration-image-gen",
    group: "Ferramentas & Integrações",
    label: "Geração de imagens disponível",
    status: imageGenConfigured ? "pass" : "info",
    severity: "low",
    explanation: imageGenConfigured
      ? "DALL-E 3 configurado para Agente de Design via /api/generate-image."
      : "Nenhum provedor de geração de imagens configurado. Agente de Design usa placeholders.",
    action: imageGenConfigured
      ? "Nenhuma ação necessária."
      : "Configure OpenAI Images em Ferramentas & Integrações para habilitar geração visual.",
    route: "/agency/integrations",
  });

  const adsPlatforms = MOCK_INTEGRATIONS.filter((i) => i.category === "ads_platform");
  const connectedAds = adsPlatforms.filter((i) =>
    configs.length > 0 ? isConfigured(i.id) : (i.status === "active" || i.status === "configured")
  );
  checks.push({
    id: "integration-ads-platforms",
    group: "Ferramentas & Integrações",
    label: "Plataformas de mídia paga",
    status: connectedAds.length > 0 ? "pass" : "info",
    severity: "low",
    explanation:
      connectedAds.length > 0
        ? `${connectedAds.map((i) => i.name).join(", ")} conectada(s).`
        : "Meta Ads e Google Ads não configurados — Agente de Ads opera localmente.",
    action:
      connectedAds.length > 0
        ? "Nenhuma ação necessária."
        : "Configure Meta Ads ou Google Ads em Ferramentas & Integrações.",
    route: "/agency/integrations",
  });

  // Check if any agent selected an external provider that is not yet configured
  const agentConfigs = agentProviderConfigs ?? [];
  const misconfiguredAgents = agentConfigs.filter((ac) => {
    if (ac.selectedProvider === "rule_based") return false;
    const intId = PROVIDER_INTEGRATION_MAP[ac.selectedProvider];
    if (!intId) return false;
    return !isConfigured(intId);
  });
  checks.push({
    id: "integration-agent-modes",
    group: "Ferramentas & Integrações",
    label: "Modo dos agentes",
    status: misconfiguredAgents.length > 0 ? "warning" : "info",
    severity: "low",
    explanation:
      misconfiguredAgents.length > 0
        ? `${misconfiguredAgents.length} agente(s) com provedor selecionado mas não configurado.`
        : "Agentes em modo regras locais. Nenhum provedor externo configurado.",
    action:
      misconfiguredAgents.length > 0
        ? "Configure os provedores selecionados em Ferramentas & Integrações."
        : "Configure provedores de IA por agente em Ferramentas & Integrações.",
    route: "/agency/integrations",
  });

  // ── Group 6: Infraestrutura SaaS ─────────────────────────────────────────

  // Session check — only emit when explicitly probed
  if (sessionActive !== undefined) {
    checks.push({
      id: "saas-session",
      group: "Infraestrutura SaaS",
      label: "Sessão autenticada",
      status: sessionActive ? "pass" : "warning",
      severity: "high",
      explanation: sessionActive
        ? `Sessão JWT ativa${sessionUser ? ` — ${sessionUser}` : ""}.`
        : "Nenhuma sessão JWT ativa. Usuário não autenticado.",
      action: sessionActive
        ? "Nenhuma ação necessária."
        : "Acesse /auth/signin para iniciar uma sessão.",
      route: sessionActive ? undefined : "/auth/signin",
    });
  }

  // DB availability (only shown when explicitly checked — undefined = not yet tested)
  if (dbAvailable !== undefined) {
    checks.push({
      id: "saas-db",
      group: "Infraestrutura SaaS",
      label: "Banco de dados",
      status: dbAvailable ? "pass" : "warning",
      severity: "medium",
      explanation: dbAvailable
        ? "Modo banco de dados — Prisma + SQLite conectado."
        : "Banco de dados indisponível. Sistema operando em modo localStorage (local).",
      action: dbAvailable
        ? "Nenhuma ação necessária."
        : "Execute 'npx prisma migrate dev && npm run db:seed' para inicializar o banco.",
      route: "/agency/settings",
    });
  }

  // Auth mode
  const effectiveAuthMode = authMode ?? "none";
  checks.push({
    id: "saas-auth",
    group: "Infraestrutura SaaS",
    label: "Modo de autenticação",
    status: effectiveAuthMode === "real" ? "pass" : effectiveAuthMode === "mock" ? "warning" : "info",
    severity: "medium",
    explanation:
      effectiveAuthMode === "real"
        ? "Autenticação real ativa — JWT + bcrypt + roles."
        : effectiveAuthMode === "mock"
        ? "Autenticação simulada — roles via localStorage. Seguro apenas para demo."
        : "Autenticação não detectada. Sistema em modo de demonstração.",
    action:
      effectiveAuthMode === "real"
        ? "Nenhuma ação necessária."
        : "Ative a autenticação real: acesse /auth/signin e configure usuários via seed.",
    route: "/auth/signin",
  });

  // Portal protection
  const effectivePortalMode = portalMode ?? "id_legacy";
  checks.push({
    id: "saas-portal",
    group: "Infraestrutura SaaS",
    label: "Proteção do portal do cliente",
    status: effectivePortalMode === "token" ? "pass" : "warning",
    severity: "high",
    explanation:
      effectivePortalMode === "token"
        ? "Portal acessado por token seguro — cada cliente tem URL única e não-adivinhável."
        : "Portal acessado por ID direto (modo legacy). Qualquer pessoa com o ID pode acessar o portal.",
    action:
      effectivePortalMode === "token"
        ? "Nenhuma ação necessária."
        : "Use /portal/access?token=<portalToken> para compartilhar o portal com segurança.",
    route: "/agency/settings",
  });

  checks.push({
    id: "saas-localStorage",
    group: "Infraestrutura SaaS",
    label: "Persistência localStorage",
    status: "info",
    severity: "medium",
    explanation: persisted
      ? "Dados locais gravados (localStorage). Funcionam como fallback do banco de dados."
      : "Sem dados locais gravados. Configure e salve algo para ativar fallback.",
    action: "Migre progressivamente para o banco de dados usando as APIs /api/clients, /api/projects, etc.",
    route: "/agency/settings",
  });

  // ── Group 7: Orquestração ─────────────────────────────────────────────────

  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const activeIds = new Set(activeProjects.map((p) => p.id));

  // Pipeline integrity: projects with approved proposals but no strategy room
  const missingStrategyProjects = activeProjects.filter(
    (p) => p.proposal?.status === "approved" && !strategyRooms.some((r) => r.projectId === p.id)
  );
  checks.push({
    id: "orch-pipeline-integrity",
    group: "Orquestração",
    label: "Integridade do pipeline",
    status: missingStrategyProjects.length === 0 ? "pass" : missingStrategyProjects.length <= 2 ? "warning" : "fail",
    severity: "medium",
    explanation: missingStrategyProjects.length === 0
      ? "Todos os projetos aprovados têm Strategy Room gerado."
      : `${missingStrategyProjects.length} projeto(s) aprovado(s) sem Strategy Room: ${missingStrategyProjects.map((p) => p.name).slice(0, 2).join(", ")}.`,
    action: missingStrategyProjects.length === 0
      ? "Nenhuma ação necessária."
      : "Abrir Orquestrador e gerar Strategy Room para os projetos aprovados.",
    route: "/agency/orchestrator",
  });

  // Stalled approvals: in_review deliverables older than 5 days
  const stalledDeliverables = deliverables.filter((d) => {
    if (d.status !== "in_review" || !activeIds.has(d.projectId)) return false;
    const daysSent = Math.floor((Date.now() - new Date(d.updatedAt ?? d.createdAt).getTime()) / 86400000);
    return daysSent >= 5;
  });
  checks.push({
    id: "orch-stalled-approvals",
    group: "Orquestração",
    label: "Aprovações paradas",
    status: stalledDeliverables.length === 0 ? "pass" : stalledDeliverables.length <= 2 ? "warning" : "fail",
    severity: "medium",
    explanation: stalledDeliverables.length === 0
      ? "Nenhuma entrega parada em aprovação há mais de 5 dias."
      : `${stalledDeliverables.length} entrega(s) aguardando aprovação do cliente há 5+ dias: ${stalledDeliverables.map((d) => d.name).slice(0, 2).join(", ")}.`,
    action: stalledDeliverables.length === 0
      ? "Nenhuma ação necessária."
      : "Contatar cliente para agilizar aprovação ou escalonar com PM.",
    route: "/agency/approvals",
  });

  // Blocked projects: critical dependency violations
  const blockedProjects = activeProjects.filter((p) => {
    const proposal = p.proposal?.status;
    return !proposal || proposal === "draft";
  });
  checks.push({
    id: "orch-blocked-projects",
    group: "Orquestração",
    label: "Projetos bloqueados",
    status: blockedProjects.length === 0 ? "pass" : blockedProjects.length <= 1 ? "warning" : "fail",
    severity: "high",
    explanation: blockedProjects.length === 0
      ? "Todos os projetos ativos têm proposta enviada ou aprovada."
      : `${blockedProjects.length} projeto(s) sem proposta enviada: ${blockedProjects.map((p) => p.name).slice(0, 2).join(", ")}.`,
    action: blockedProjects.length === 0
      ? "Nenhuma ação necessária."
      : "Abrir os projetos pendentes → aba Proposta → finalizar e enviar ao cliente.",
    route: "/agency/projects",
  });

  // Orphan deliverables: deliverables in active projects with no agent owner
  const noOwnerDelivs = deliverables.filter(
    (d) => activeIds.has(d.projectId) && !d.ownerAgentId && d.status !== "delivered"
  );
  checks.push({
    id: "orch-orphan-deliverables",
    group: "Orquestração",
    label: "Entregas sem responsável",
    status: noOwnerDelivs.length === 0 ? "pass" : noOwnerDelivs.length <= 3 ? "info" : "warning",
    severity: "low",
    explanation: noOwnerDelivs.length === 0
      ? "Todas as entregas têm agente responsável definido."
      : `${noOwnerDelivs.length} entrega(s) sem agente responsável — pode dificultar rastreamento.`,
    action: noOwnerDelivs.length === 0
      ? "Nenhuma ação necessária."
      : "Revisar entregas sem dono e atribuir ao agente correto.",
    route: "/agency/deliverables",
  });

  // Department idleness: agents assigned to approved projects but no deliverables
  const agentDefs = [{ id: "a3", label: "Social Media" }, { id: "a2", label: "Design" }, { id: "a4", label: "Tráfego Pago" }];
  const idleAgents = agentDefs.filter((ag) => {
    const assignedApproved = activeProjects.filter((p) => p.agents.includes(ag.id) && p.proposal?.status === "approved");
    const hasOutput = deliverables.some((d) => activeIds.has(d.projectId) && (d.ownerAgentId === ag.id || ["Content Strategy", "Design", "Ads Strategy"].includes(d.type)));
    return assignedApproved.length > 0 && !hasOutput;
  });
  checks.push({
    id: "orch-dept-idleness",
    group: "Orquestração",
    label: "Departamentos sem execução",
    status: idleAgents.length === 0 ? "pass" : idleAgents.length <= 1 ? "warning" : "fail",
    severity: "medium",
    explanation: idleAgents.length === 0
      ? "Todos os departamentos com projetos aprovados têm entregas geradas."
      : `${idleAgents.map((a) => a.label).join(", ")} — atribuído(s) a projetos aprovados mas sem entregas geradas.`,
    action: idleAgents.length === 0
      ? "Nenhuma ação necessária."
      : `Iniciar execução: ${idleAgents.map((a) => a.label).join(", ")}.`,
    route: "/agency/departments",
  });

  // Tasks overdue
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today);
  checks.push({
    id: "orch-tasks-overdue",
    group: "Orquestração",
    label: "Tarefas atrasadas",
    status: overdueTasks.length === 0 ? "pass" : overdueTasks.length <= 2 ? "warning" : "fail",
    severity: "medium",
    explanation: overdueTasks.length === 0
      ? "Nenhuma tarefa com prazo vencido."
      : `${overdueTasks.length} tarefa(s) com prazo vencido ainda não concluída(s).`,
    action: overdueTasks.length === 0
      ? "Nenhuma ação necessária."
      : "Abrir Central de Tarefas → filtrar Atrasadas → resolver ou reagendar.",
    route: "/agency/tasks",
  });

  // Blocked tasks
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  checks.push({
    id: "orch-blocked-tasks",
    group: "Orquestração",
    label: "Tarefas bloqueadas",
    status: blockedTasks.length === 0 ? "pass" : blockedTasks.length <= 2 ? "warning" : "fail",
    severity: "high",
    explanation: blockedTasks.length === 0
      ? "Nenhuma tarefa bloqueada no workspace."
      : `${blockedTasks.length} tarefa(s) bloqueada(s) — execução paralisada nestes pontos.`,
    action: blockedTasks.length === 0
      ? "Nenhuma ação necessária."
      : "Abrir Central de Tarefas → aba Bloqueadas → identificar e resolver dependências.",
    route: "/agency/tasks",
  });

  // Pipeline mismatch: pilot project recommended stage differs from current
  const pipelineMismatch = (() => {
    if (!pilotProject) return false;
    const proposalApproved = pilotProject.proposal?.status === "approved";
    const hasStrat = strategyRooms.some((r) => r.projectId === PILOT_PROJECT_ID);
    const stage = pilotProject.stage;
    // Should be "production" or later if proposal approved + strategy room, but is still "briefing" or "diagnosis"
    if (proposalApproved && hasStrat && (stage === "briefing" || stage === "diagnosis" || stage === "planning")) return true;
    // Should be at least "planning" if proposal approved but still in briefing
    if (proposalApproved && !hasStrat && stage === "briefing") return true;
    return false;
  })();
  checks.push({
    id: "orch-pipeline-mismatch",
    group: "Orquestração",
    label: "Alinhamento de fase do pipeline",
    status: pipelineMismatch ? "warning" : "pass",
    severity: "medium",
    explanation: pipelineMismatch
      ? `Projeto "${pilotProject?.name}" está em fase "${pilotProject?.stage}" mas o pipeline indica uma fase mais avançada.`
      : "Fase do projeto piloto alinhada com o estado do pipeline.",
    action: pipelineMismatch
      ? `Abrir Projeto → aba Linha do Tempo → clicar em "Aplicar" na recomendação de fase.`
      : "Nenhuma ação necessária.",
    route: `/agency/projects/${PILOT_PROJECT_ID}?tab=timeline`,
  });

  // Stage outdated: project in early stage but has approved deliverables
  const stageOutdated = (() => {
    if (!pilotProject) return false;
    const hasApproved = deliverables.some(
      (d) => d.projectId === PILOT_PROJECT_ID && (d.status === "approved" || d.status === "delivered")
    );
    return hasApproved && (pilotProject.stage === "briefing" || pilotProject.stage === "diagnosis");
  })();
  checks.push({
    id: "orch-stage-outdated",
    group: "Orquestração",
    label: "Fase desatualizada",
    status: stageOutdated ? "warning" : "pass",
    severity: "low",
    explanation: stageOutdated
      ? `Projeto "${pilotProject?.name}" tem entregas aprovadas mas ainda está em fase inicial ("${pilotProject?.stage}").`
      : "Nenhum projeto com fase desatualizada detectado.",
    action: stageOutdated
      ? "Avançar manualmente a fase do projeto para refletir o progresso real."
      : "Nenhuma ação necessária.",
    route: `/agency/projects/${PILOT_PROJECT_ID}?tab=pipeline`,
  });

  // Task center empty while blockers exist
  const hasBlockers = checks.some((c) => (c.id.startsWith("orch-") || c.id === "open-revisions") && c.status === "fail");
  const taskCenterEmpty = tasks.length === 0 && hasBlockers;
  checks.push({
    id: "orch-task-center-empty",
    group: "Orquestração",
    label: "Tarefas operacionais definidas",
    status: taskCenterEmpty ? "warning" : "pass",
    severity: "low",
    explanation: taskCenterEmpty
      ? "Existem bloqueios ativos no workspace mas nenhuma tarefa operacional foi criada para resolvê-los."
      : "Tarefas operacionais presentes no workspace.",
    action: taskCenterEmpty
      ? "Acesse o Orchestrator para gerar tarefas automáticas ou crie tarefas manualmente na Central de Tarefas."
      : "Nenhuma ação necessária.",
    route: "/agency/tasks",
  });

  // ── Group 8: Sincronização de Dados ──────────────────────────────────────

  if (dbSyncStatus !== undefined) {
    const entityChecks: { key: keyof DbSyncStatus; label: string; route: string }[] = [
      { key: "clients",          label: "Clientes",            route: "/agency/clients"      },
      { key: "projects",         label: "Projetos",            route: "/agency/projects"     },
      { key: "tasks",            label: "Tarefas",             route: "/agency/tasks"        },
      { key: "deliverables",     label: "Entregas",            route: "/agency/deliverables" },
      { key: "materialRequests", label: "Materiais Solicitados", route: "/agency/approvals"  },
      { key: "brandHub",         label: "Brand Hub",           route: "/agency/clients"      },
      { key: "activityEvents",   label: "Eventos de Atividade", route: "/agency/settings"    },
      { key: "strategyRooms",    label: "Strategy Rooms",      route: "/agency/projects"     },
      { key: "briefings",        label: "Briefings",           route: "/agency/briefings"    },
      { key: "brandUpdates",     label: "Atualizações de Marca", route: "/agency/approvals"   },
      { key: "agentOutputs",     label: "Saídas dos Agentes",  route: "/agency/deliverables" },
    ];

    for (const { key, label, route } of entityChecks) {
      const status = dbSyncStatus[key];
      if (status !== undefined) {
        checks.push({
          id: `db-sync-${key}`,
          group: "Sincronização de Dados",
          label: `${label} — fonte de dados`,
          status: status === "db" ? "pass" : "info",
          severity: "low",
          explanation: status === "db"
            ? `${label} carregados do banco de dados.`
            : `${label} em modo local (localStorage). Banco indisponível ou usuário não autenticado.`,
          action: status === "db"
            ? "Nenhuma ação necessária."
            : `Autentique-se e verifique a conexão com o banco para sincronizar ${label.toLowerCase()}.`,
          route,
        });
      }
    }

    const allDb  = Object.values(dbSyncStatus).every((s) => s === "db");
    const anyDb  = Object.values(dbSyncStatus).some((s) => s === "db");
    const anyLocal = Object.values(dbSyncStatus).some((s) => s === "local");

    checks.push({
      id: "db-sync-summary",
      group: "Sincronização de Dados",
      label: "Modo geral de dados",
      status: allDb ? "pass" : anyDb ? "warning" : "info",
      severity: "medium",
      explanation: allDb
        ? "Todas as entidades sincronizadas com o banco de dados."
        : anyDb && anyLocal
        ? "Modo misto — parte dos dados vem do banco, parte do localStorage. Pode causar inconsistências."
        : "Sistema em modo localStorage. Dados persistem apenas localmente neste navegador.",
      action: allDb
        ? "Nenhuma ação necessária."
        : anyDb
        ? "Verificar quais entidades ainda usam localStorage e forçar reconexão com o banco."
        : "Faça login e certifique-se que DATABASE_URL está configurada no ambiente.",
      route: "/agency/settings",
    });
  }

  // ── Group 9: Departamentos ────────────────────────────────────────────────

  const executionAgents = [
    { id: "a3", label: "Social Media", deptRoute: "/agency/departments/social-media" },
    { id: "a2", label: "Design", deptRoute: "/agency/departments/design" },
    { id: "a4", label: "Tráfego Pago", deptRoute: "/agency/departments/paid-traffic" },
  ];
  const approvedProjects = activeProjects.filter((p) => p.proposal?.status === "approved");

  for (const ag of executionAgents) {
    const assigned = approvedProjects.filter((p) => p.agents.includes(ag.id));
    const produced = deliverables.filter((d) => d.ownerAgentId === ag.id && activeIds.has(d.projectId));
    const revisions = produced.filter((d) => needsRevision(d));
    const pendingApprovals = produced.filter((d) => d.status === "in_review");

    const hasBlockedOutput = assigned.length > 0 && produced.length === 0;
    const manyRevisions = revisions.length >= 3;

    checks.push({
      id: `dept-output-${ag.id}`,
      group: "Departamentos",
      label: `${ag.label} — produção ativa`,
      status: hasBlockedOutput ? "warning" : produced.length > 0 ? "pass" : "info",
      severity: "medium",
      explanation: hasBlockedOutput
        ? `${ag.label} tem ${assigned.length} projeto(s) aprovado(s) mas não produziu nenhuma entrega.`
        : produced.length > 0
        ? `${ag.label} produziu ${produced.length} entrega(s) em projetos ativos.`
        : `${ag.label} sem projetos aprovados ativos. Departamento em espera.`,
      action: hasBlockedOutput
        ? `Abrir departamento ${ag.label} → Fila de Trabalho → iniciar produção.`
        : "Nenhuma ação necessária.",
      route: ag.deptRoute,
    });

    if (manyRevisions) {
      checks.push({
        id: `dept-revisions-${ag.id}`,
        group: "Departamentos",
        label: `${ag.label} — revisões acumuladas`,
        status: "warning",
        severity: "medium",
        explanation: `${ag.label} tem ${revisions.length} revisões abertas simultaneamente. Pode indicar desalinhamento com o cliente.`,
        action: `Abrir departamento ${ag.label} → Entregas → resolver revisões prioritárias.`,
        route: ag.deptRoute,
      });
    }

    if (pendingApprovals.length >= 4) {
      checks.push({
        id: `dept-approvals-${ag.id}`,
        group: "Departamentos",
        label: `${ag.label} — aprovações paradas`,
        status: "info",
        severity: "low",
        explanation: `${pendingApprovals.length} entregas de ${ag.label} aguardando aprovação do cliente.`,
        action: `Acompanhar aprovações pelo portal do cliente.`,
        route: ag.deptRoute,
      });
    }
  }

  // PM dept: check if any active project missing strategy room
  const pmBlockers = approvedProjects.filter(
    (p) => !strategyRooms.some((r) => r.projectId === p.id)
  );
  checks.push({
    id: "dept-pm-strategy",
    group: "Departamentos",
    label: "Gestão de Projetos — Strategy Rooms",
    status: pmBlockers.length === 0 ? "pass" : pmBlockers.length <= 1 ? "warning" : "fail",
    severity: "medium",
    explanation:
      pmBlockers.length === 0
        ? "Todos os projetos aprovados têm Strategy Room gerado."
        : `${pmBlockers.length} projeto(s) aprovado(s) sem Strategy Room. PM não pode avançar sem ele.`,
    action:
      pmBlockers.length === 0
        ? "Nenhuma ação necessária."
        : "Abrir Departamento Gestão de Projetos → Fila de Trabalho → gerar Strategy Rooms pendentes.",
    route: "/agency/departments/project-management",
  });

  // ── Input gap diagnostics (V1 Operating Model) ────────────────────────────

  // 1. Strategy: approved projects where Brand Hub is missing positioning or audience
  const strategyBrandHubGap = approvedProjects.filter((p) => {
    const client = clients.find((c) => c.id === p.clientId);
    const bb = client?.brandBrain;
    return !bb?.positioning?.trim() || !bb?.targetAudience?.trim();
  });
  checks.push({
    id: "input-gap-strategy",
    group: "Departamentos",
    label: "Estratégia — Brand Hub incompleto",
    status: strategyBrandHubGap.length === 0 ? "pass" : "warning",
    severity: "medium",
    explanation:
      strategyBrandHubGap.length === 0
        ? "Todos os clientes com projetos aprovados têm Brand Hub com posicionamento e público-alvo."
        : `${strategyBrandHubGap.length} projeto(s) aprovado(s) cujo cliente não tem posicionamento ou público-alvo no Brand Hub — Strategy Agent sem input adequado.`,
    action:
      strategyBrandHubGap.length === 0
        ? "Nenhuma ação necessária."
        : "Acesse os clientes afetados → Brand Hub → preencher Posicionamento e Público-alvo antes de iniciar Strategy Room.",
    route: "/agency/clients",
  });

  // 2. Social: projects with Social assigned but no strategy room
  const socialAssignedProjects = approvedProjects.filter((p) => p.agents.includes("a3"));
  const socialWithoutStrategy = socialAssignedProjects.filter(
    (p) => !strategyRooms.some((r) => r.projectId === p.id)
  );
  if (socialAssignedProjects.length > 0) {
    checks.push({
      id: "input-gap-social",
      group: "Departamentos",
      label: "Social Media — sem output de Estratégia",
      status: socialWithoutStrategy.length === 0 ? "pass" : "warning",
      severity: "medium",
      explanation:
        socialWithoutStrategy.length === 0
          ? "Todos os projetos com Social Media têm Strategy Room disponível."
          : `${socialWithoutStrategy.length} projeto(s) com Social Media atribuído mas sem Strategy Room. Social Media não tem briefing estratégico.`,
      action:
        socialWithoutStrategy.length === 0
          ? "Nenhuma ação necessária."
          : "Gerar Strategy Room para os projetos pendentes antes de iniciar calendário editorial.",
      route: "/agency/departments/strategy",
    });
  }

  // 3. Design: projects with Design assigned but client brand hub has no visual style
  const designAssignedProjects = approvedProjects.filter((p) => p.agents.includes("a2"));
  const designWithoutBrandDir = designAssignedProjects.filter((p) => {
    const client = clients.find((c) => c.id === p.clientId);
    return !client?.brandBrain?.visualStyle?.trim();
  });
  if (designAssignedProjects.length > 0) {
    checks.push({
      id: "input-gap-design",
      group: "Departamentos",
      label: "Design — sem direção visual no Brand Hub",
      status: designWithoutBrandDir.length === 0 ? "pass" : "warning",
      severity: "medium",
      explanation:
        designWithoutBrandDir.length === 0
          ? "Todos os clientes com Design têm estilo visual definido no Brand Hub."
          : `${designWithoutBrandDir.length} projeto(s) com Design atribuído mas sem estilo visual no Brand Hub — Design sem referência criativa.`,
      action:
        designWithoutBrandDir.length === 0
          ? "Nenhuma ação necessária."
          : "Acesse Brand Hub dos clientes afetados → preencher campo Estilo Visual antes de iniciar produção de design.",
      route: "/agency/departments/brand-hub",
    });
  }

  // 4. Paid Traffic: projects with Ads assigned but missing strategy room or approved design deliverables
  const trafficAssignedProjects = approvedProjects.filter((p) => p.agents.includes("a4"));
  const trafficWithoutInputs = trafficAssignedProjects.filter((p) => {
    const hasStrategy = strategyRooms.some((r) => r.projectId === p.id);
    const hasDesignAsset = deliverables.some(
      (d) => d.projectId === p.id && d.ownerAgentId === "a2" && (d.status === "approved" || d.status === "delivered")
    );
    return !hasStrategy || !hasDesignAsset;
  });
  if (trafficAssignedProjects.length > 0) {
    checks.push({
      id: "input-gap-traffic",
      group: "Departamentos",
      label: "Tráfego Pago — entradas incompletas",
      status: trafficWithoutInputs.length === 0 ? "pass" : "warning",
      severity: "medium",
      explanation:
        trafficWithoutInputs.length === 0
          ? "Todos os projetos com Tráfego Pago têm Strategy Room e criativos de Design disponíveis."
          : `${trafficWithoutInputs.length} projeto(s) com Tráfego Pago atribuído sem Strategy Room ou criativos aprovados de Design.`,
      action:
        trafficWithoutInputs.length === 0
          ? "Nenhuma ação necessária."
          : "Garantir Strategy Room e criativos aprovados de Design antes de iniciar campanhas pagas.",
      route: "/agency/departments/paid-traffic",
    });
  }

  // Intelligence coverage: strategy, social-media, and PM should have run intelligence
  // if there are active approved projects.
  const intelligenceDepts: { id: string; label: string; route: string }[] = [
    { id: "strategy", label: "Estratégia", route: "/agency/departments/strategy" },
    { id: "social-media", label: "Social Media", route: "/agency/departments/social-media" },
    { id: "project-management", label: "Gestão de Projetos", route: "/agency/departments/project-management" },
    { id: "design", label: "Design", route: "/agency/departments/design" },
    { id: "paid-traffic", label: "Tráfego Pago", route: "/agency/departments/paid-traffic" },
    { id: "brand-hub", label: "Brand Hub", route: "/agency/departments/brand-hub" },
  ];

  if (approvedProjects.length > 0) {
    for (const d of intelligenceDepts) {
      const hasRun = aiRunLogs.some((l) => l.departmentId === d.id);
      checks.push({
        id: `intel-coverage-${d.id}`,
        group: "Departamentos",
        label: `${d.label} — intelligence executada`,
        status: hasRun ? "pass" : "warning",
        severity: "low",
        explanation: hasRun
          ? `Intelligence de ${d.label} executada. Análise e entregas geradas.`
          : `${d.label} tem projetos aprovados mas nenhuma intelligence foi executada ainda.`,
        action: hasRun
          ? "Nenhuma ação necessária."
          : `Abrir Departamento ${d.label} → Visão Geral → clicar em "Rodar Inteligência".`,
        route: d.route,
      });
    }
  }

  // Repeated fallback: intelligence configured with external provider but always falling back
  const fallbackCounts = intelligenceDepts.map((d) => {
    const logs = aiRunLogs.filter((l) => l.departmentId === d.id);
    const totalRuns = logs.length;
    const fallbackRuns = logs.filter((l) => l.fallbackUsed).length;
    return { ...d, totalRuns, fallbackRuns };
  });

  for (const fc of fallbackCounts) {
    if (fc.totalRuns >= 3 && fc.fallbackRuns === fc.totalRuns) {
      checks.push({
        id: `intel-fallback-${fc.id}`,
        group: "Departamentos",
        label: `${fc.label} — fallback repetido`,
        status: "info",
        severity: "low",
        explanation: `${fc.label} executou intelligence ${fc.totalRuns}x, sempre usando regras locais (fallback). Configure um provedor externo em Integrações para ativar IA real.`,
        action: "Acesse Ferramentas & Integrações → configure um provedor de IA (OpenAI, Claude, Gemini) para o departamento.",
        route: "/agency/integrations",
      });
    }
  }

  // AI Run Log persistence check
  if (aiRunLogs.length > 0) {
    checks.push({
      id: "intel-log-persistence",
      group: "Departamentos",
      label: "AI Run Logs — persistência",
      status: aiRunLogSource === "db" ? "pass" : aiRunLogSource === "local" ? "info" : "info",
      severity: "low",
      explanation:
        aiRunLogSource === "db"
          ? `${aiRunLogs.length} AI run log(s) sincronizados com o banco de dados.`
          : `${aiRunLogs.length} AI run log(s) em localStorage. Sem sincronização com banco.`,
      action:
        aiRunLogSource === "db"
          ? "Nenhuma ação necessária."
          : "Faça login e verifique a conexão com o banco para persistir os logs de intelligence.",
      route: "/agency/settings",
    });
  }

  // ── OpenAI provider checks (Departamentos group) ─────────────────────────
  const OPENAI_DEPT_LABELS: Record<string, string> = {
    strategy: "Estratégia",
    "social-media": "Social Media",
    "project-management": "Gestão de Projetos",
  };
  const openaiDeptsSelected = departmentConfigs.filter(
    (c) => c.aiProvider === "openai" && OPENAI_DEPT_LABELS[c.departmentId],
  );

  // 1. Global OpenAI key status — only surfaced once status is resolved.
  if (openaiConfigured !== undefined) {
    checks.push({
      id: "openai-key-status",
      group: "Departamentos",
      label: "OpenAI — chave de API",
      status: openaiConfigured ? "pass" : openaiDeptsSelected.length > 0 ? "warning" : "info",
      severity: openaiDeptsSelected.length > 0 ? "medium" : "low",
      explanation: openaiConfigured
        ? "OPENAI_API_KEY configurada no servidor. Provedor OpenAI disponível."
        : openaiDeptsSelected.length > 0
        ? "OPENAI_API_KEY ausente, mas departamentos selecionaram OpenAI. Runs caem para regras locais."
        : "OPENAI_API_KEY não configurada. Nenhum departamento usa OpenAI no momento.",
      action: openaiConfigured
        ? "Nenhuma ação necessária."
        : "Defina OPENAI_API_KEY nas variáveis de ambiente do servidor (Railway) para ativar a IA real.",
      route: "/agency/settings",
    });
  }

  // 2. Per-department: OpenAI selected but key missing.
  if (openaiConfigured === false) {
    for (const c of openaiDeptsSelected) {
      checks.push({
        id: `openai-missing-key-${c.departmentId}`,
        group: "Departamentos",
        label: `${OPENAI_DEPT_LABELS[c.departmentId]} — OpenAI sem chave`,
        status: "warning",
        severity: "medium",
        explanation: `${OPENAI_DEPT_LABELS[c.departmentId]} está configurado para OpenAI, mas a chave não existe no servidor. As execuções usam regras locais.`,
        action: "Configure OPENAI_API_KEY no servidor ou volte o provedor para regras locais.",
        route: `/agency/departments/${c.departmentId}`,
      });
    }
  }

  // 3. Recent OpenAI failure / fallback after OpenAI selection.
  for (const c of openaiDeptsSelected) {
    const deptLogs = aiRunLogs
      .filter((l) => l.departmentId === c.departmentId)
      .slice(0, 5);
    const recentFallbacks = deptLogs.filter((l) => l.fallbackUsed);
    const lastWasFallback = deptLogs[0]?.fallbackUsed === true;
    if (deptLogs.length > 0 && recentFallbacks.length >= 2 && lastWasFallback) {
      checks.push({
        id: `openai-fallback-${c.departmentId}`,
        group: "Departamentos",
        label: `${OPENAI_DEPT_LABELS[c.departmentId]} — fallback após OpenAI`,
        status: "warning",
        severity: "medium",
        explanation: `${OPENAI_DEPT_LABELS[c.departmentId]} selecionou OpenAI mas as últimas execuções caíram para regras locais (${recentFallbacks.length} de ${deptLogs.length}). Motivo: ${deptLogs[0]?.fallbackReason ?? "desconhecido"}.`,
        action: "Verifique OPENAI_API_KEY, cota da conta e conectividade do servidor.",
        route: `/agency/departments/${c.departmentId}`,
      });
    }
  }

  // ── Group 10: Modelo Operacional (Blueprint completeness) ─────────────────
  // Diagnoses whether each department's operating blueprint is complete.
  // Intake is NOT checked here — intake is centralized under PM, not per-dept.

  for (const bp of DEPARTMENT_BLUEPRINTS) {
    const def = DEPARTMENT_DEFS.find((d) => d.id === bp.departmentId);
    const label = def?.name ?? bp.departmentId;
    const gaps = getBlueprintGaps(bp);
    const isGold = bp.maturity === "gold_standard";

    // Per-department blueprint summary.
    checks.push({
      id: `blueprint-${bp.departmentId}`,
      group: "Modelo Operacional",
      label: `${label} — blueprint operacional`,
      // Gold standard with gaps = warning (regression). Shell with gaps = info
      // (expected, pending promotion). No gaps = pass.
      status: gaps.length === 0 ? "pass" : isGold ? "warning" : "info",
      severity: isGold ? "medium" : "low",
      explanation:
        gaps.length === 0
          ? `Blueprint de ${label} completo: identidade, execução, entregas, handoffs e qualidade definidos.`
          : isGold
          ? `${label} é padrão-ouro mas tem ${gaps.length} seção(ões) incompleta(s): ${gaps.map((g) => g.section).join(", ")}.`
          : `${label} usa o shell do blueprint. Seções a configurar: ${gaps.map((g) => g.section).join(", ")}.`,
      action:
        gaps.length === 0
          ? "Nenhuma ação necessária."
          : isGold
          ? `Revisar o blueprint de ${label} — seções obrigatórias ausentes: ${gaps.map((g) => g.section).join(", ")}.`
          : `Promover ${label} ao blueprint completo (referência: Design) preenchendo: ${gaps.map((g) => g.section).join(", ")}.`,
      route: `/agency/departments/${bp.departmentId}`,
    });

    // Per-department: warn if handoff rules are missing (replaces old "missing intake" warning).
    const missingHandoffs =
      !bp.handoffs || (bp.handoffs.sends.length === 0 && bp.handoffs.receives.length === 0);
    if (missingHandoffs && bp.maturity === "gold_standard") {
      checks.push({
        id: `blueprint-handoff-missing-${bp.departmentId}`,
        group: "Modelo Operacional",
        label: `${label} — regras de handoff ausentes`,
        status: "warning",
        severity: "high",
        explanation: `${label} é padrão-ouro mas não tem regras de handoff definidas. Sem handoffs, o departamento não passa trabalho adiante de forma rastreável.`,
        action: `Abrir blueprint de ${label} → seção Handoffs → mapear o que envia e recebe de cada departamento.`,
        route: `/agency/departments/${bp.departmentId}`,
      });
    }
  }

  // At least one gold-standard department must exist (the replication reference).
  const goldCount = DEPARTMENT_BLUEPRINTS.filter((b) => b.maturity === "gold_standard").length;
  checks.push({
    id: "blueprint-gold-standard",
    group: "Modelo Operacional",
    label: "Departamento padrão-ouro definido",
    status: goldCount > 0 ? "pass" : "fail",
    severity: "high",
    explanation:
      goldCount > 0
        ? `${goldCount} departamento(s) com blueprint completo servem de referência para replicação.`
        : "Nenhum departamento padrão-ouro definido. Sem referência para replicar o modelo operacional.",
    action:
      goldCount > 0
        ? "Nenhuma ação necessária."
        : "Promover ao menos um departamento (Design recomendado) ao blueprint completo.",
    route: "/agency/departments/design",
  });

  // Central intake check — PM is the single intake point. If PM blueprint lacks handoffs,
  // demand distribution is untracked.
  const pmBlueprint = DEPARTMENT_BLUEPRINTS.find((b) => b.departmentId === "project-management");
  const pmHandoffsMissing =
    !pmBlueprint?.handoffs ||
    (pmBlueprint.handoffs.sends.length === 0 && pmBlueprint.handoffs.receives.length === 0);
  checks.push({
    id: "blueprint-central-intake",
    group: "Modelo Operacional",
    label: "Gestão de Projetos — intake central configurado",
    status: pmHandoffsMissing ? "warning" : "pass",
    severity: "medium",
    explanation: pmHandoffsMissing
      ? "Gestão de Projetos é o intake central da agência, mas suas regras de distribuição para os departamentos ainda não estão mapeadas no blueprint."
      : "Gestão de Projetos tem regras de distribuição de demanda mapeadas — intake central operacional.",
    action: pmHandoffsMissing
      ? "Abrir Departamento Gestão de Projetos → Configuração → mapear handoffs de saída para Strategy, Design, Social, Tráfego Pago."
      : "Nenhuma ação necessária.",
    route: "/agency/departments/project-management",
  });

  // Blocked work without a stated reason (process hygiene).
  const blockedNoReason = tasks.filter(
    (t) => t.status === "blocked" && !t.description?.trim(),
  );
  if (blockedTasks.length > 0) {
    checks.push({
      id: "blueprint-blocked-no-reason",
      group: "Modelo Operacional",
      label: "Trabalho bloqueado com motivo",
      status: blockedNoReason.length === 0 ? "pass" : "warning",
      severity: "medium",
      explanation:
        blockedNoReason.length === 0
          ? "Todas as tarefas bloqueadas têm um motivo registrado."
          : `${blockedNoReason.length} tarefa(s) bloqueada(s) sem motivo descrito. Bloqueio sem causa dificulta a resolução.`,
      action:
        blockedNoReason.length === 0
          ? "Nenhuma ação necessária."
          : "Abrir Central de Tarefas → adicionar o motivo do bloqueio em cada item bloqueado.",
      route: "/agency/tasks",
    });
  }

  // ── Group 11: Solicitações de Clientes ───────────────────────────────────

  const pendingRequests = clientRequests.filter((r) => r.status === "new");
  checks.push({
    id: "requests-pending-review",
    group: "Solicitações de Clientes",
    label: "Solicitações aguardando análise",
    status: pendingRequests.length === 0 ? "pass" : pendingRequests.length <= 2 ? "warning" : "fail",
    severity: "high",
    explanation:
      pendingRequests.length === 0
        ? "Nenhuma solicitação de cliente aguardando análise."
        : `${pendingRequests.length} solicitação(ões) novas recebidas pelo portal ainda não analisadas.`,
    action:
      pendingRequests.length === 0
        ? "Nenhuma ação necessária."
        : "Acesse Solicitações → analisar e encaminhar cada briefing para o departamento adequado.",
    route: "/agency/requests",
  });

  const incompleteRequests = clientRequests.filter((r) => r.missingInfo.length >= 3 && r.status !== "rejected" && r.status !== "completed");
  checks.push({
    id: "requests-missing-fields",
    group: "Solicitações de Clientes",
    label: "Solicitações com informações incompletas",
    status: incompleteRequests.length === 0 ? "pass" : "warning",
    severity: "medium",
    explanation:
      incompleteRequests.length === 0
        ? "Todas as solicitações ativas têm informações suficientes para análise inicial."
        : `${incompleteRequests.length} solicitação(ões) com 3 ou mais campos críticos ausentes (prazo, orçamento, público, etc.).`,
    action:
      incompleteRequests.length === 0
        ? "Nenhuma ação necessária."
        : "Entrar em contato com o cliente para coletar as informações faltantes antes de iniciar o projeto.",
    route: "/agency/requests",
  });

  checks.push({
    id: "requests-intake-available",
    group: "Solicitações de Clientes",
    label: "Intake de solicitações disponível no portal",
    status: "pass",
    severity: "low",
    explanation: "O portal do cliente inclui o fluxo de nova solicitação (Briefing Room). Clientes podem enviar briefings diretamente.",
    action: "Compartilhe o link do portal com os clientes para que possam enviar solicitações.",
    route: "/portal/client/c4",
  });

  // ── Score ─────────────────────────────────────────────────────────────────

  let totalWeight = 0;
  let earnedPoints = 0;
  for (const c of checks) {
    if (c.status === "info") continue; // unscored
    const w = SEVERITY_WEIGHT[c.severity];
    totalWeight += w;
    if (c.status === "pass") earnedPoints += w;
    else if (c.status === "warning") earnedPoints += Math.floor(w / 2);
    // fail = 0
  }
  const score = totalWeight === 0 ? 100 : Math.round((earnedPoints / totalWeight) * 100);

  const pass = checks.filter((c) => c.status === "pass").length;
  const warning = checks.filter((c) => c.status === "warning").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const info = checks.filter((c) => c.status === "info").length;

  // Overall status: any critical fail → critical; score < 65 → degraded; else healthy.
  const hasCriticalFail = checks.some((c) => c.severity === "critical" && c.status === "fail");
  const overallStatus: DiagnosticReport["overallStatus"] =
    hasCriticalFail || score < 50
      ? "critical"
      : score < 75
      ? "degraded"
      : "healthy";

  // Top action = most severe failing/warning check that has an action
  const priorityOrder: CheckStatus[] = ["fail", "warning"];
  const severityOrder: CheckSeverity[] = ["critical", "high", "medium", "low"];
  let topAction = "Sistema operacional — sem ações urgentes.";
  outer: for (const status of priorityOrder) {
    for (const severity of severityOrder) {
      const found = checks.find((c) => c.status === status && c.severity === severity);
      if (found) {
        topAction = found.action;
        break outer;
      }
    }
  }

  return { checks, score, pass, warning, fail, info, topAction, overallStatus };
}

// ─── Group ordering for UI rendering ─────────────────────────────────────────

export const CHECK_GROUP_ORDER = [
  "Dados do Piloto",
  "Operações do Projeto",
  "Orquestração",
  "Departamentos",
  "Modelo Operacional",
  "Solicitações de Clientes",
  "Infraestrutura",
  "Prontidão dos Agentes",
  "Ferramentas & Integrações",
  "Infraestrutura SaaS",
  "Sincronização de Dados",
];
