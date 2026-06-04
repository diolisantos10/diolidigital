// ─── Dependency Engine ─────────────────────────────────────────────────────────
//
// Evaluates whether each department can start, is active, blocked, or complete.
// Exposes the exact blocker reason so the UI can surface actionable messages.
// Pure function — no store access, no side effects.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, StrategyRoom, Client } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { needsRevision } from "@/lib/agency/deliverables";

export type DeptStatus = "not_started" | "ready" | "active" | "blocked" | "complete";

export interface DeptState {
  dept: string;
  label: string;
  agentId: string;
  status: DeptStatus;
  blockedReason?: string;
  detail?: string;
  deliverableCount: number;
  approvedCount: number;
  pendingReviewCount: number;
  revisionCount: number;
  canExecute: boolean;       // true when status is ready or active
  route?: string;
}

export interface DependencyViolation {
  dept: string;
  severity: "critical" | "high" | "medium";
  message: string;
  route?: string;
}

export interface ProjectDependencyState {
  projectId: string;
  projectName: string;
  departments: DeptState[];
  violations: DependencyViolation[];
  overallBlocked: boolean;    // any critical blocker
  blockersCount: number;
  readyDeptCount: number;     // departments ready to execute but not yet started
}

// ─── Type registry ─────────────────────────────────────────────────────────────

const SOCIAL_TYPES = new Set(["Content Strategy", "Content Calendar", "Posts", "Stories", "Design Requests"]);
const DESIGN_TYPES = new Set(["Design", "Visual Identity", "Brand Assets"]);
const ADS_TYPES = new Set(["Ads Strategy", "Campaign Structure", "Audience Plan", "Ad Copy", "Creative Requirements", "Optimization Notes"]);

// ─── Core evaluation ─────────────────────────────────────────────────────────

export function evalProjectDependencies(input: {
  project: Project;
  client?: Client;
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): ProjectDependencyState {
  const { project, client, deliverables, materialRequests, strategyRooms } = input;
  const pd = deliverables.filter((d) => d.projectId === project.id);
  const pendingMaterials = materialRequests.filter((r) => r.projectId === project.id && r.status === "pending");
  const hasStrategyRoom = strategyRooms.some((r) => r.projectId === project.id);
  const proposalApproved = project.proposal?.status === "approved";
  const hasBrandBrain = !!client?.brandBrain?.businessSummary;
  const hasSocial = project.agents.includes("a3");
  const hasDesign = project.agents.includes("a2");
  const hasAds = project.agents.includes("a4");

  const socialDelivs = pd.filter((d) => SOCIAL_TYPES.has(d.type));
  const designDelivs = pd.filter((d) => DESIGN_TYPES.has(d.type));
  const adsDelivs = pd.filter((d) => ADS_TYPES.has(d.type));

  const hasSocialContent = socialDelivs.some(
    (d) => d.type === "Content Strategy" && (d.status === "in_review" || d.status === "approved" || d.status === "delivered")
  );

  const violations: DependencyViolation[] = [];

  function deptOf(delivs: Deliverable[], label: string, agentId: string, route: string): DeptState | null {
    if (agentId === "a3" && !hasSocial) return null;
    if (agentId === "a2" && !hasDesign) return null;
    if (agentId === "a4" && !hasAds) return null;

    const approved = delivs.filter((d) => d.status === "approved" || d.status === "delivered").length;
    const inReview = delivs.filter((d) => d.status === "in_review").length;
    const revisions = delivs.filter((d) => needsRevision(d)).length;

    let status: DeptStatus;
    let blockedReason: string | undefined;
    let detail: string | undefined;

    if (approved > 0 && delivs.filter((d) => d.status === "draft").length === 0 && revisions === 0) {
      status = "complete";
      detail = `${approved} entrega(s) aprovadas`;
    } else if (delivs.length > 0) {
      status = "active";
      detail = inReview > 0 ? `${inReview} em revisão do cliente` : `${delivs.length} em produção`;
    } else if (!proposalApproved) {
      status = "blocked";
      blockedReason = "Proposta não aprovada";
      violations.push({ dept: label, severity: "critical", message: `${label}: proposta pendente`, route: `/agency/projects/${project.id}?tab=proposal` });
    } else if (agentId === "a2" && hasSocial && !hasSocialContent) {
      status = "blocked";
      blockedReason = "Social ainda não gerou a Content Strategy";
      violations.push({ dept: label, severity: "high", message: `Design bloqueado: Social precisa gerar a estratégia de conteúdo primeiro`, route: route });
    } else if (agentId === "a4" && !hasStrategyRoom) {
      status = "blocked";
      blockedReason = "Strategy Room não gerado";
      violations.push({ dept: label, severity: "high", message: `Tráfego Pago bloqueado: gerar Strategy Room primeiro`, route: "/agency/orchestrator" });
    } else {
      status = "ready";
    }

    return {
      dept: agentId === "a3" ? "social" : agentId === "a2" ? "design" : "ads",
      label,
      agentId,
      status,
      blockedReason,
      detail,
      deliverableCount: delivs.length,
      approvedCount: approved,
      pendingReviewCount: inReview,
      revisionCount: revisions,
      canExecute: status === "ready" || status === "active",
      route,
    };
  }

  const socialState = deptOf(socialDelivs, "Redes Sociais", "a3", "/agency/social-media-agent");
  const designState = deptOf(designDelivs, "Design", "a2", "/agency/design-agent");
  const adsState = deptOf(adsDelivs, "Tráfego Pago", "a4", "/agency/ads-agent");

  // Material blocker
  if (pendingMaterials.length > 0 && proposalApproved) {
    violations.push({
      dept: "PM",
      severity: pendingMaterials.length > 2 ? "high" : "medium",
      message: `${pendingMaterials.length} material(is) pendente(s) do cliente — pode bloquear produção`,
      route: `/agency/projects/${project.id}`,
    });
  }

  // Brand Brain blocker
  if (!hasBrandBrain) {
    violations.push({ dept: "PM", severity: "high", message: "Brand Brain vazio — agentes produzirão conteúdo genérico", route: `/agency/clients/${project.clientId}` });
  }

  const departments = [socialState, designState, adsState].filter(Boolean) as DeptState[];
  const overallBlocked = violations.some((v) => v.severity === "critical");
  const readyDeptCount = departments.filter((d) => d.status === "ready").length;

  return {
    projectId: project.id,
    projectName: project.name,
    departments,
    violations,
    overallBlocked,
    blockersCount: violations.length,
    readyDeptCount,
  };
}

// ─── Workspace-level dependency summary ──────────────────────────────────────

export function evalWorkspaceDependencies(input: {
  projects: Project[];
  clients: Client[];
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): {
  perProject: ProjectDependencyState[];
  totalViolations: number;
  criticalViolations: number;
  blockedProjectCount: number;
  readyToExecuteCount: number;
} {
  const { projects, clients, deliverables, materialRequests, strategyRooms } = input;
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));
  const activeProjects = projects.filter((p) => p.stage !== "completed");

  const perProject = activeProjects.map((project) =>
    evalProjectDependencies({
      project,
      client: clientMap[project.clientId],
      deliverables,
      materialRequests,
      strategyRooms,
    })
  );

  return {
    perProject,
    totalViolations: perProject.reduce((s, p) => s + p.violations.length, 0),
    criticalViolations: perProject.reduce(
      (s, p) => s + p.violations.filter((v) => v.severity === "critical").length,
      0
    ),
    blockedProjectCount: perProject.filter((p) => p.overallBlocked).length,
    readyToExecuteCount: perProject.reduce((s, p) => s + p.readyDeptCount, 0),
  };
}
