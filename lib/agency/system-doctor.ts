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

import type { Client, Project, Deliverable, StrategyRoom } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { isValidProposalPricing } from "@/lib/agency/reporting";
import { needsRevision } from "@/lib/agency/deliverables";

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

export interface DoctorInput {
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
  persisted: boolean;   // true when localStorage key "agency-os-v1" exists
}

export function runSystemDoctor(input: DoctorInput): DiagnosticReport {
  const { clients, projects, deliverables, materialRequests, strategyRooms, persisted } = input;

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
        ? "Proposta enviada, aguardando aprovação do cliente."
        : "Proposta em rascunho — ainda não enviada ao cliente.",
    action:
      proposalStatus === "approved"
        ? "Nenhuma ação necessária."
        : proposalStatus === "sent"
        ? "Aguardar aprovação ou acompanhar pelo portal do cliente."
        : "Complete os campos da proposta e clique em Enviar ao Cliente.",
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
      ? `Valor definido: ${proposalPricing}`
      : `Precificação inválida ou em placeholder: "${proposalPricing ?? "(vazio)"}". Bloqueará o envio da proposta.`,
    action: pricingValid
      ? "Nenhuma ação necessária."
      : 'Defina um valor real no campo Investimento da proposta (ex.: "R$ 4.500 / mês").',
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
      ? "Strategy Room disponível com análise especializada do projeto."
      : "Strategy Room ainda não gerado para o projeto piloto.",
    action: strategyRoom
      ? "Nenhuma ação necessária."
      : "Abra o projeto p7 → Centro de Comando → gerar Strategy Room.",
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
        ? "Nenhuma requisição de material pendente."
        : `${pendingMaterials} requisição(ões) de material aguardando o cliente.`,
    action:
      pendingMaterials === 0
        ? "Nenhuma ação necessária."
        : "Acompanhe pelo Centro de Comando do projeto ou pelo portal do cliente.",
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
        ? "Nenhuma entrega requer revisão no momento."
        : `${openRevisions} entrega(s) com revisão pendente.`,
    action:
      openRevisions === 0
        ? "Nenhuma ação necessária."
        : "Abra as entregas com revisão aberta e resolva o feedback do cliente.",
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
        : "Revise o Centro de Comando para identificar e resolver bloqueios.",
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
          ? `Acesse o agente ${agent.label} e produza as primeiras entregas para o projeto.`
          : `Adicione o Agente ${agent.label} ao projeto piloto em Configurações do Projeto.`,
      route:
        agent.id === "a3"
          ? "/agency/social-media-agent"
          : agent.id === "a2"
          ? "/agency/design-agent"
          : "/agency/ads-agent",
    });
  }

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
  "Infraestrutura",
  "Prontidão dos Agentes",
];
