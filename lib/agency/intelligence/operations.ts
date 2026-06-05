// Rule-based Operations / System Doctor Intelligence for the Operations department.
// Computes an operational health snapshot from available store data — no external
// calls, no circular dependency on the full System Doctor engine.
// Used as the fallback (and V1 primary) when no external AI provider is configured.

import type { Project, Client, Deliverable, StrategyRoom, Task } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import type { IntegrationConfig } from "@/lib/agency/integrations";
import type { AIRunLog } from "@/store/agency-store";
import { needsRevision } from "@/lib/agency/deliverables";

export interface OperationsInput {
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
  tasks?: Task[];
  integrationConfigs?: IntegrationConfig[];
  aiRunLogs?: AIRunLog[];
}

export interface OperationsIntelligenceOutput {
  operationalDiagnosis: string;
  criticalIssues: string[];
  recommendedActions: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  nextChecks: string[];
  score: number;         // 0–100 operational health score
  executiveSummary: string;
}

export function runOperationsRuleBased(input: OperationsInput): OperationsIntelligenceOutput {
  const {
    clients,
    projects,
    deliverables,
    materialRequests,
    strategyRooms,
    tasks = [],
    integrationConfigs = [],
    aiRunLogs = [],
  } = input;

  const activeProjects = projects.filter((p) => p.stage !== "completed");
  const approvedProjects = activeProjects.filter((p) => p.proposal?.status === "approved");

  const criticalIssues: string[] = [];
  const recommendedActions: string[] = [];
  const nextChecks: string[] = [];

  // ── Blocked projects (no proposal sent) ──────────────────────────────────
  const blockedProjects = activeProjects.filter(
    (p) => !p.proposal || p.proposal.status === "draft",
  );
  if (blockedProjects.length > 0) {
    criticalIssues.push(
      `${blockedProjects.length} projeto(s) sem proposta enviada: ${blockedProjects
        .map((p) => p.name)
        .slice(0, 2)
        .join(", ")}`,
    );
    recommendedActions.push("Finalizar e enviar propostas pendentes para desbloquear execução");
  }

  // ── Missing Strategy Rooms ────────────────────────────────────────────────
  const missingStrategy = approvedProjects.filter(
    (p) => !strategyRooms.some((r) => r.projectId === p.id),
  );
  if (missingStrategy.length > 0) {
    criticalIssues.push(
      `${missingStrategy.length} projeto(s) aprovado(s) sem Strategy Room`,
    );
    recommendedActions.push("Gerar Strategy Room para projetos aprovados sem ela");
  }

  // ── Pending material requests (> 5 days old) ─────────────────────────────
  const stalePending = materialRequests.filter((m) => {
    if (m.status !== "pending") return false;
    const days = Math.floor(
      (Date.now() - new Date(m.requestedAt ?? m.id).getTime()) / 86400000,
    );
    return days >= 5;
  });
  if (stalePending.length > 0) {
    criticalIssues.push(
      `${stalePending.length} solicitação(ões) de material sem resposta há 5+ dias`,
    );
    recommendedActions.push("Fazer follow-up com clientes sobre materiais pendentes");
  }

  // ── Heavy revision queues ─────────────────────────────────────────────────
  const revisionDelivs = deliverables.filter(
    (d) => needsRevision(d) && activeProjects.some((p) => p.id === d.projectId),
  );
  if (revisionDelivs.length >= 3) {
    criticalIssues.push(`${revisionDelivs.length} entregas com revisão aberta — risco de paralisia`);
    recommendedActions.push("Priorizar resolução das revisões abertas antes de novas entregas");
  }

  // ── Overdue tasks ─────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate < today,
  );
  if (overdueTasks.length > 0) {
    criticalIssues.push(`${overdueTasks.length} tarefa(s) com prazo vencido`);
    recommendedActions.push("Revisar tarefas atrasadas → resolver ou reagendar");
  }

  // ── Integration health ────────────────────────────────────────────────────
  const failedIntegrations = integrationConfigs.filter(
    (i) => i.lastTestStatus === "fail",
  );
  if (failedIntegrations.length > 0) {
    criticalIssues.push(
      `${failedIntegrations.length} integração(ões) com falha: ${failedIntegrations
        .map((i) => i.integrationId)
        .slice(0, 2)
        .join(", ")}`,
    );
    recommendedActions.push("Testar e reconectar integrações com falha em Ferramentas & Integrações");
  }

  // ── Intelligence coverage ─────────────────────────────────────────────────
  const INTEL_DEPTS = ["strategy", "social-media", "project-management", "design", "paid-traffic"];
  if (approvedProjects.length > 0) {
    const missingIntel = INTEL_DEPTS.filter(
      (d) => !aiRunLogs.some((l) => l.departmentId === d),
    );
    if (missingIntel.length > 0) {
      nextChecks.push(
        `Executar intelligence em ${missingIntel.length} departamento(s) sem análise: ${missingIntel.join(", ")}`,
      );
    }
  }

  // ── Next checks ───────────────────────────────────────────────────────────
  if (approvedProjects.length === 0) {
    nextChecks.push("Verificar pipeline de vendas — nenhum projeto aprovado ativo");
  }
  if (clients.length === 0) {
    nextChecks.push("Nenhum cliente cadastrado — verificar dados do workspace");
  }
  if (nextChecks.length === 0) {
    nextChecks.push("Verificar sincronização de dados com o banco de dados");
    nextChecks.push("Validar integrações ativas e suas últimas execuções");
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let deductions = 0;
  deductions += blockedProjects.length * 8;
  deductions += missingStrategy.length * 6;
  deductions += stalePending.length * 4;
  deductions += Math.min(revisionDelivs.length * 3, 15);
  deductions += overdueTasks.length * 2;
  deductions += failedIntegrations.length * 5;
  const score = Math.max(0, Math.min(100, 100 - deductions));

  const riskLevel: OperationsIntelligenceOutput["riskLevel"] =
    score < 50
      ? "critical"
      : score < 65
      ? "high"
      : score < 80
      ? "medium"
      : "low";

  const statusLabel =
    riskLevel === "low"
      ? "Operacional"
      : riskLevel === "medium"
      ? "Atenção necessária"
      : riskLevel === "high"
      ? "Degradado"
      : "Crítico";

  const operationalDiagnosis = [
    `Sistema com score operacional ${score}/100 — ${statusLabel}.`,
    `${activeProjects.length} projeto(s) ativo(s), ${approvedProjects.length} aprovado(s).`,
    `${clients.length} cliente(s), ${tasks.length} tarefa(s), ${deliverables.length} entrega(s) no workspace.`,
    criticalIssues.length > 0
      ? `${criticalIssues.length} problema(s) crítico(s) identificado(s).`
      : "Sem bloqueios críticos ativos.",
  ].join(" ");

  const executiveSummary = `Operations Intelligence: score ${score}/100 (${statusLabel}). Risco: ${riskLevel}. ${criticalIssues.length} problema(s) crítico(s), ${recommendedActions.length} ação(ões) recomendada(s). ${approvedProjects.length} projeto(s) em execução.`;

  return {
    operationalDiagnosis,
    criticalIssues,
    recommendedActions,
    riskLevel,
    nextChecks,
    score,
    executiveSummary,
  };
}
