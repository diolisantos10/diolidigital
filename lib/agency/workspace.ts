// ─── Client Workspace Architecture ───────────────────────────────────────────
//
// Each client has ONE shared workspace exposed through two routes:
//
//   Internal view  →  /agency/clients/[id]
//   Client view    →  /portal/client/[id]
//
// Both views read from the same Zustand store (agency-os-v1).
// Visibility is enforced by:
//   1. This file — canonical section registry with visibility per view
//   2. Data selectors below — strip internal-only fields before passing to portal
//
// ─────────────────────────────────────────────────────────────────────────────

import type { BrandBrain, Client, Deliverable, Project, ProjectProposal } from "./mock-data";

// ─── View types ───────────────────────────────────────────────────────────────

export type WorkspaceView = "internal" | "client";

// ─── Section registry ─────────────────────────────────────────────────────────

export interface WorkspaceSection {
  id: string;
  label: string;
  visibility: WorkspaceView | "both";
  description: string;
}

export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  // ── Internal-only ─────────────────────────────────────────────────────────

  {
    id: "client_profile",
    label: "Client Profile",
    visibility: "internal",
    description: "Full intake profile: business context, tone of voice, target audience, brand rules.",
  },
  {
    id: "internal_tasks",
    label: "Tasks",
    visibility: "internal",
    description: "Agent and team task management — statuses, assignments, blockers.",
  },
  {
    id: "agent_resources",
    label: "Agents & Resources",
    visibility: "internal",
    description: "Assigned AI agents and human team members across active projects.",
  },
  {
    id: "brand_assets",
    label: "Brand Assets",
    visibility: "internal",
    description: "Internal brand system: logo, colors, typography, tone of voice guidelines.",
  },
  {
    id: "activity_log",
    label: "Activity Log",
    visibility: "internal",
    description: "Internal event timeline: project moves, task completions, agent actions.",
  },
  {
    id: "operational_risks",
    label: "Operational Risks",
    visibility: "internal",
    description: "Blocked tasks, missed deadlines, over-capacity agents, stale projects.",
  },
  {
    id: "qa_status",
    label: "QA Status",
    visibility: "internal",
    description: "Internal quality check results — never shown to clients.",
  },
  {
    id: "costs_margins",
    label: "Costs & Margins",
    visibility: "internal",
    description: "Pricing breakdowns, cost of delivery, margin per project.",
  },
  {
    id: "orchestrator",
    label: "Orchestrator / Brief",
    visibility: "internal",
    description: "AI orchestration brief, execution plan, prompt context.",
  },
  {
    id: "brand_brain",
    label: "Brand Brain",
    visibility: "internal",
    description: "Structured brand intelligence: positioning, tone, visual style, rules, and strategic notes for agent context.",
  },

  // ── Client-visible ─────────────────────────────────────────────────────────

  {
    id: "project_status",
    label: "Project Status",
    visibility: "client",
    description: "Simplified project progress — current stage, deadline, next step.",
  },
  {
    id: "proposal",
    label: "Proposal",
    visibility: "client",
    description: "Scope, deliverables list, timeline, and investment. Approval actions.",
  },
  {
    id: "deliverables_review",
    label: "Deliverables",
    visibility: "client",
    description: "Outputs in review or approved — client can approve or request changes.",
  },
  {
    id: "feedback_history",
    label: "Feedback",
    visibility: "client",
    description: "Client feedback previously submitted on deliverables.",
  },
  {
    id: "final_files",
    label: "Final Files",
    visibility: "client",
    description: "Delivered and fully approved assets the client can download.",
  },
  {
    id: "material_requests",
    label: "Requested Materials",
    visibility: "client",
    description: "Assets, content, or information the agency has requested from the client.",
  },

  // ── Shared (both views) ────────────────────────────────────────────────────

  {
    id: "project_pipeline",
    label: "Project Pipeline",
    visibility: "both",
    description: "Active and completed projects. Internal: full detail. Client: simplified stage view.",
  },
];

// ─── Quick lookups ────────────────────────────────────────────────────────────

export const INTERNAL_SECTIONS = WORKSPACE_SECTIONS.filter(
  (s) => s.visibility === "internal" || s.visibility === "both"
);

export const CLIENT_SECTIONS = WORKSPACE_SECTIONS.filter(
  (s) => s.visibility === "client" || s.visibility === "both"
);

// ─── MaterialRequest type ─────────────────────────────────────────────────────
// The agency asks the client to provide specific assets or information.
// Shown to the client in the portal under "Requested Materials".

export type MaterialRequestStatus = "pending" | "received" | "cancelled";

export interface MaterialRequest {
  id: string;
  clientId: string;
  projectId?: string;
  title: string;
  description: string;
  status: MaterialRequestStatus;
  requestedAt: string;
}

// ─── Client requirement generator ────────────────────────────────────────────
// Maps selected services to the materials the agency needs from the client.
// Returns ready-to-persist MaterialRequest stubs (no id/requestedAt yet).

export function generateClientRequirements(
  services: string[],
  clientId: string,
  projectId: string
): Omit<MaterialRequest, "id" | "requestedAt">[] {
  const reqs: Omit<MaterialRequest, "id" | "requestedAt">[] = [];

  const universal: Omit<MaterialRequest, "id" | "requestedAt"> = {
    clientId,
    projectId,
    title: "Brand assets & guidelines",
    description: "Logo files (SVG/PNG), color palette, typography, and any existing brand guidelines or visual references.",
    status: "pending",
  };
  reqs.push(universal);

  if (services.includes("social_media") || services.includes("content")) {
    reqs.push({
      clientId, projectId,
      title: "Content references & existing posts",
      description: "Links to current social media profiles, top-performing posts, and any content you want us to avoid or replicate.",
      status: "pending",
    });
  }

  if (services.includes("ads")) {
    reqs.push({
      clientId, projectId,
      title: "Ad account access & budget approval",
      description: "Access to Meta Ads Manager and/or Google Ads account. Confirmed monthly budget for paid campaigns.",
      status: "pending",
    });
  }

  if (services.includes("seo")) {
    reqs.push({
      clientId, projectId,
      title: "Website access & analytics",
      description: "Admin access to CMS or website, Google Search Console, and Google Analytics (or equivalent) for SEO audit.",
      status: "pending",
    });
  }

  if (services.includes("branding")) {
    reqs.push({
      clientId, projectId,
      title: "Brand inspiration & direction",
      description: "Moodboards, competitor brands you admire or want to differentiate from, and any existing brand materials to preserve or replace.",
      status: "pending",
    });
  }

  return reqs;
}

// ─── Pilot seed data ──────────────────────────────────────────────────────────
// Initial material requests for the Dioli Digital internal pilot project (p7).

export const MOCK_MATERIAL_REQUESTS: MaterialRequest[] = [
  {
    id: "mr1",
    clientId: "c4",
    projectId: "p7",
    title: "Logotipo e arquivos de marca",
    description: "Arquivos do logo em SVG e PNG (fundo transparente), versão horizontal e símbolo isolado. Se disponível, incluir manual de identidade visual ou referências de cores e tipografia.",
    status: "pending",
    requestedAt: "2026-05-30T00:00:00.000Z",
  },
  {
    id: "mr2",
    clientId: "c4",
    projectId: "p7",
    title: "Referências visuais e de comunicação",
    description: "Marcas, agências ou perfis que você admira e gostaria de usar como referência de tom, estética e posicionamento. Pode compartilhar via Pinterest, links ou prints.",
    status: "pending",
    requestedAt: "2026-05-30T00:00:00.000Z",
  },
  {
    id: "mr3",
    clientId: "c4",
    projectId: "p7",
    title: "Descrição dos serviços e diferenciais",
    description: "Lista dos principais serviços da Dioli Agência com uma breve descrição de cada um. O que diferencia a Dioli das agências tradicionais? Quais resultados você entrega para seus clientes?",
    status: "pending",
    requestedAt: "2026-05-30T00:00:00.000Z",
  },
  {
    id: "mr4",
    clientId: "c4",
    projectId: "p7",
    title: "Notas do fundador",
    description: "Texto livre sobre a visão da empresa: o que motivou criar a Dioli, para onde quer levar o negócio e qual mensagem central quer transmitir no lançamento. Sem formato definido — escreva como preferir.",
    status: "pending",
    requestedAt: "2026-05-30T00:00:00.000Z",
  },
];

// ─── Data selectors ───────────────────────────────────────────────────────────
// Use these to filter store data before passing to portal view components.
// This enforces visibility at the data layer, not just the UI layer.

// Deliverable statuses that are safe to show clients.
// Drafts are internal — clients only see what's been formally sent for review.
export const CLIENT_VISIBLE_DELIVERABLE_STATUSES: Deliverable["status"][] = [
  "in_review",
  "approved",
  "delivered",
];

export function getClientVisibleDeliverables(
  deliverables: Deliverable[],
  clientProjectIds: Set<string>
): Deliverable[] {
  return deliverables.filter(
    (d) =>
      clientProjectIds.has(d.projectId) &&
      CLIENT_VISIBLE_DELIVERABLE_STATUSES.includes(d.status)
  );
}

// Project shape safe for the client portal.
// Strips: priority, agents list, orchestratorBriefing, internal type label.
export interface ClientProjectView {
  id: string;
  name: string;
  stage: Project["stage"];
  deadline: string;
  proposal?: ProjectProposal;
}

export function toClientProjectView(project: Project): ClientProjectView {
  return {
    id: project.id,
    name: project.name,
    stage: project.stage,
    deadline: project.deadline,
    ...(project.proposal ? { proposal: project.proposal } : {}),
  };
}

// ─── Operational risk detector ────────────────────────────────────────────────
// Used by the internal view's Risks section.

export interface OperationalRisk {
  severity: "high" | "medium" | "low";
  label: string;
  detail: string;
  projectId?: string;
}

// ─── Agent client context ─────────────────────────────────────────────────────
// Compact context object injected into agent prompts.
// Merges Brand Brain fields with intake profile fields.

export interface AgentClientContext {
  clientId: string;
  clientName: string;
  industry: string;
  // From intake profile
  description?: string;
  targetAudience?: string;
  brandTone?: string;
  currentChannels?: string;
  whatWorks?: string;
  whatFails?: string;
  restrictions?: string;
  // From Brand Brain (all optional — may not be filled yet)
  brandBrain?: Partial<BrandBrain>;
  // Readiness score: how many of the 10 Brand Brain fields are filled
  brandBrainReadiness: number;
}

export function getClientAgentContext(client: Client): AgentClientContext {
  const brain = client.brandBrain;
  const brainFields: (keyof BrandBrain)[] = [
    "businessSummary", "positioning", "targetAudience", "toneOfVoice",
    "visualStyle", "brandRules", "productsToHighlight", "thingsToAvoid",
    "preferredChannels", "strategicNotes",
    "colors", "fonts", "references",
  ];
  const filledCount = brain
    ? brainFields.filter((k) => brain[k] && (brain[k] as string).trim().length > 0).length
    : 0;

  return {
    clientId: client.id,
    clientName: client.name,
    industry: client.industry,
    ...(client.description ? { description: client.description } : {}),
    ...(client.targetAudience ? { targetAudience: client.targetAudience } : {}),
    ...(client.brandTone ? { brandTone: client.brandTone } : {}),
    ...(client.currentChannels ? { currentChannels: client.currentChannels } : {}),
    ...(client.whatWorks ? { whatWorks: client.whatWorks } : {}),
    ...(client.whatFails ? { whatFails: client.whatFails } : {}),
    ...(client.restrictions ? { restrictions: client.restrictions } : {}),
    ...(brain ? { brandBrain: brain } : {}),
    brandBrainReadiness: filledCount,
  };
}
