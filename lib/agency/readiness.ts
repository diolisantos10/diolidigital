import type { Client, Project, Deliverable } from "@/lib/agency/mock-data";

// ─── Production / Deployment Readiness (internal pilot tooling) ─────────────────
//
// Pure helpers that derive deployment-readiness signals from the current store
// data. UI lives in the Settings page; this stays data-only so it can be unit
// checked and reused. NOT shown to clients.

export const PILOT_CLIENT_ID = "c4";
export const PILOT_PROJECT_ID = "p7";

export type ReadinessLevel = "ok" | "warning" | "info";

export interface ReadinessSignal {
  id: string;
  label: string;
  value: string;
  level: ReadinessLevel;
}

export interface PilotDataStatus {
  clientPresent: boolean;
  projectPresent: boolean;
  deliverableCount: number;
  proposalApproved: boolean;
  available: boolean;
}

export function getPilotDataStatus(
  clients: Client[],
  projects: Project[],
  deliverables: Deliverable[]
): PilotDataStatus {
  const clientPresent = clients.some((c) => c.id === PILOT_CLIENT_ID);
  const pilotProject = projects.find((p) => p.id === PILOT_PROJECT_ID);
  const projectPresent = !!pilotProject;
  const deliverableCount = deliverables.filter((d) => d.projectId === PILOT_PROJECT_ID).length;
  const proposalApproved = pilotProject?.proposal?.status === "approved";
  return {
    clientPresent,
    projectPresent,
    deliverableCount,
    proposalApproved,
    available: clientPresent && projectPresent && deliverableCount > 0,
  };
}

export function getReadinessSignals(args: {
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  persisted: boolean;
}): ReadinessSignal[] {
  const { clients, projects, deliverables, persisted } = args;
  const pilot = getPilotDataStatus(clients, projects, deliverables);

  return [
    {
      id: "build",
      label: "Status do build",
      value: "Local QA verde · build de produção pendente de deploy",
      level: "info",
    },
    {
      id: "persistence",
      label: "Persistência do store",
      value: persisted
        ? "Ativa — gravando em localStorage (agency-os-v1)"
        : "Sem dados gravados ainda — interaja para persistir",
      level: persisted ? "ok" : "warning",
    },
    {
      id: "pilot-data",
      label: "Dados do piloto",
      value: pilot.available
        ? `Carregados — ${projects.length} projeto(s), ${deliverables.length} entrega(s)`
        : "Ausentes — carregue os dados do piloto Dioli Digital",
      level: pilot.available ? "ok" : "warning",
    },
    {
      id: "dioli-pilot",
      label: "Piloto Dioli Digital",
      value: pilot.available
        ? `Disponível — ${pilot.deliverableCount} entregas${pilot.proposalApproved ? " · proposta aprovada" : ""}`
        : "Indisponível neste navegador",
      level: pilot.available ? "ok" : "warning",
    },
  ];
}

export interface ReadinessWarning {
  id: string;
  title: string;
  detail: string;
}

// Internal-only warnings — operator must understand these before a pilot deploy.
export const READINESS_WARNINGS: ReadinessWarning[] = [
  {
    id: "localstorage-only",
    title: "Persistência apenas local (localStorage)",
    detail:
      "Os dados vivem somente neste navegador. Não há backend nem sincronização. Limpar o navegador, trocar de dispositivo ou usar aba anônima zera tudo. Não use para dados de produção que não possam ser perdidos.",
  },
];

export interface SmokeStep {
  id: string;
  label: string;
  hint: string;
}

// Production smoke checklist — manual operator verification before pilot go-live.
export const SMOKE_STEPS: SmokeStep[] = [
  { id: "deploy", label: "Deploy concluído?", hint: "Build de produção publicado no host." },
  { id: "url", label: "URL pública gerada?", hint: "Endereço acessível fora da máquina local." },
  { id: "reset", label: "Reset do store concluído?", hint: "Estado limpo a partir dos dados de fábrica." },
  { id: "dioli", label: "Dioli Digital visível?", hint: "Projeto p7 aparece no Centro de Comando." },
  { id: "proposal", label: "Proposta aprovada?", hint: "Proposta do piloto com status Aprovada." },
  { id: "agents", label: "Agentes testados?", hint: "Social, Design e Tráfego Pago carregam sem erro." },
];
