// Rule-based PM Intelligence for the Project Management department.
// Produces project status, blockers, next actions, and suggested tasks.
// Used as the fallback (and V1 primary) when no external AI provider is configured.

import type { Project, Client, Deliverable, StrategyRoom } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import { needsRevision } from "@/lib/agency/deliverables";

export interface PMSuggestedTask {
  title: string;
  owner: string;
  urgency: "critical" | "high" | "medium" | "low";
}

export interface PMIntelligenceOutput {
  projectStatus: string;
  blockers: string[];
  nextActions: string[];
  suggestedTasks: PMSuggestedTask[];
  executiveSummary: string;
}

const STAGE_LABELS: Record<string, string> = {
  briefing: "Briefing",
  proposal_sent: "Proposta enviada",
  approved: "Proposta aprovada",
  diagnosis: "Diagnóstico",
  planning: "Planejamento",
  production: "Produção",
  review: "Revisão",
  delivery: "Entrega",
  ongoing: "Em andamento",
  completed: "Concluído",
};

export function runPMRuleBased(
  project: Project,
  client: Client,
  deliverables: Deliverable[],
  materialRequests: MaterialRequest[],
  strategyRooms: StrategyRoom[],
): PMIntelligenceOutput {
  const projectDelivs = deliverables.filter((d) => d.projectId === project.id);
  const pendingMaterials = materialRequests.filter(
    (m) => m.projectId === project.id && m.status === "pending",
  );
  const revisionDelivs = projectDelivs.filter((d) => needsRevision(d));
  const reviewDelivs = projectDelivs.filter((d) => d.status === "in_review");
  const hasStrategyRoom = strategyRooms.some((sr) => sr.projectId === project.id);

  const blockers: string[] = [];
  if (!project.proposal || project.proposal.status === "draft") {
    blockers.push("Proposta não enviada — projeto não pode avançar");
  }
  if (!hasStrategyRoom && project.stage !== "briefing" && project.stage !== "proposal_sent") {
    blockers.push("Strategy Room ausente — iniciar inteligência estratégica antes da produção");
  }
  if (pendingMaterials.length > 0) {
    blockers.push(
      `${pendingMaterials.length} material(is) pendente(s) do cliente sem resposta`,
    );
  }
  if (revisionDelivs.length >= 3) {
    blockers.push(
      `${revisionDelivs.length} revisões abertas simultâneas — risco de paralisia operacional`,
    );
  }

  const nextActions: string[] = [];
  if (!hasStrategyRoom && project.stage !== "briefing" && project.stage !== "proposal_sent") {
    nextActions.push("Gerar Strategy Room para alinhar toda a equipe");
  }
  if (reviewDelivs.length > 0) {
    nextActions.push(`Aprovar ${reviewDelivs.length} entrega(s) em revisão com o cliente`);
  }
  if (pendingMaterials.length > 0) {
    nextActions.push(
      `Follow-up com ${client.name} sobre ${pendingMaterials.length} material(is) solicitado(s)`,
    );
  }
  if (nextActions.length === 0) {
    nextActions.push("Acompanhar produção em andamento e validar próximas entregas com o time");
  }

  const suggestedTasks: PMSuggestedTask[] = [
    { title: `Revisar pipeline de "${project.name}"`, owner: "PM", urgency: "high" },
    ...(pendingMaterials.length > 0
      ? [
          {
            title: "Solicitar materiais pendentes ao cliente (follow-up)",
            owner: "PM",
            urgency: "critical" as const,
          },
        ]
      : []),
    ...(!hasStrategyRoom && project.stage !== "briefing"
      ? [{ title: "Iniciar Strategy Room do projeto", owner: "PM", urgency: "high" as const }]
      : []),
    ...(revisionDelivs.length > 0
      ? [
          {
            title: `Resolver ${revisionDelivs.length} revisão(ões) abertas`,
            owner: "PM",
            urgency: "medium" as const,
          },
        ]
      : []),
  ];

  const stage = STAGE_LABELS[project.stage] ?? project.stage;
  const projectStatus = [
    `"${project.name}" está em ${stage}.`,
    `${projectDelivs.length} entrega(s) produzida(s), ${reviewDelivs.length} em revisão${
      revisionDelivs.length > 0 ? `, ${revisionDelivs.length} com revisão solicitada` : ""
    }.`,
    blockers.length > 0
      ? `${blockers.length} bloqueio(s) identificado(s).`
      : "Sem bloqueios críticos ativos.",
  ].join(" ");

  const executiveSummary = [
    `PM Intelligence para "${project.name}" (${client.name}): ${stage}.`,
    `${blockers.length} bloqueio(s), ${nextActions.length} ação(ões) recomendada(s).`,
    pendingMaterials.length > 0
      ? "Material pendente do cliente é a prioridade imediata."
      : "Fluxo operacional sem bloqueios de cliente.",
  ].join(" ");

  return {
    projectStatus,
    blockers,
    nextActions,
    suggestedTasks,
    executiveSummary,
  };
}
