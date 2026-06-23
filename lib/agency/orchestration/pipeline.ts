// ─── Agency Execution Pipeline ────────────────────────────────────────────────
//
// Canonical ordered pipeline for any agency project.
// Each stage knows its owner, what blocks it, and what comes next.
// Pure data — no store access, no side effects.
// ─────────────────────────────────────────────────────────────────────────────

import type { Project, Deliverable, StrategyRoom, Client } from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";

// ─── Stage types ─────────────────────────────────────────────────────────────

export type PipelineStageId =
  | "brand_hub"
  | "strategy"
  | "proposal"
  | "approval"
  | "social_execution"
  | "design_execution"
  | "ads_execution"
  | "client_review"
  | "completion";

export type PipelineOwner = "PM" | "Social" | "Design" | "Ads" | "Cliente" | "Sistema";
export type PipelineStageStatus = "complete" | "active" | "ready" | "blocked" | "not_applicable";

export interface PipelineStageDef {
  id: PipelineStageId;
  name: string;
  description: string;
  owner: PipelineOwner;
  blockedBy: PipelineStageId[];
  route?: string;
  agentId?: string;
}

// ─── Stage registry ───────────────────────────────────────────────────────────

export const PIPELINE_STAGE_DEFS: PipelineStageDef[] = [
  {
    id: "brand_hub",
    name: "Brand Hub",
    description: "Brand Brain com contexto completo da marca",
    owner: "PM",
    blockedBy: [],
    route: "/agency/clients",
  },
  {
    id: "strategy",
    name: "Strategy Room",
    description: "Sala de estratégia gerada com 6 especialistas",
    owner: "PM",
    blockedBy: ["brand_hub"],
    route: "/agency/orchestrator",
  },
  {
    id: "proposal",
    name: "Proposta",
    description: "Proposta criada com escopo e valor",
    owner: "PM",
    blockedBy: [],
    route: undefined, // dynamic: /agency/projects/[id]?tab=proposal
  },
  {
    id: "approval",
    name: "Aprovação",
    description: "Proposta aprovada pelo cliente no portal",
    owner: "Cliente",
    blockedBy: ["proposal"],
  },
  {
    id: "social_execution",
    name: "Social Media",
    description: "Estratégia, calendário e posts gerados",
    owner: "Social",
    blockedBy: ["approval"],
    route: "/agency/social-media-agent",
    agentId: "a3",
  },
  {
    id: "design_execution",
    name: "Design",
    description: "Briefs visuais e criativos gerados",
    owner: "Design",
    blockedBy: ["approval", "social_execution"],
    route: "/agency/design-agent",
    agentId: "a2",
  },
  {
    id: "ads_execution",
    name: "Tráfego Pago",
    description: "Estratégia de campanhas e públicos gerados",
    owner: "Ads",
    blockedBy: ["approval"],
    route: "/agency/ads-agent",
    agentId: "a4",
  },
  {
    id: "client_review",
    name: "Revisão do Cliente",
    description: "Entregas enviadas para aprovação no portal",
    owner: "Cliente",
    blockedBy: ["social_execution"],
  },
  {
    id: "completion",
    name: "Conclusão",
    description: "Todas as entregas aprovadas e entregues",
    owner: "PM",
    blockedBy: ["client_review"],
  },
];

// ─── Stage evaluation ─────────────────────────────────────────────────────────

export interface EvaluatedPipelineStage {
  def: PipelineStageDef;
  status: PipelineStageStatus;
  blockedBy?: string;      // human-readable reason
  detail?: string;         // extra info (e.g. "3/6 deliverables approved")
}

const SOCIAL_TYPES = ["Content Strategy", "Content Calendar", "Posts", "Stories", "Design Requests"];
const DESIGN_TYPES = ["Design", "Visual Identity", "Brand Assets"];
const ADS_TYPES = ["Ads Strategy", "Campaign Structure", "Audience Plan", "Ad Copy", "Creative Requirements", "Optimization Notes"];

export function evaluateProjectPipeline(input: {
  project: Project;
  client?: Client;
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
}): EvaluatedPipelineStage[] {
  const { project, client, deliverables, materialRequests, strategyRooms } = input;
  const pd = deliverables.filter((d) => d.projectId === project.id);
  const hasStrategyRoom = strategyRooms.some((r) => r.projectId === project.id);
  const proposalSent = project.proposal?.status && project.proposal.status !== "draft";
  const proposalApproved = project.proposal?.status === "approved";
  const hasBrandBrain = !!client?.brandBrain?.businessSummary;
  const hasSocialAgent = project.agents.includes("a3");
  const hasDesignAgent = project.agents.includes("a2");
  const hasAdsAgent = project.agents.includes("a4");

  const socialDelivs = pd.filter((d) => SOCIAL_TYPES.includes(d.type));
  const designDelivs = pd.filter((d) => DESIGN_TYPES.includes(d.type));
  const adsDelivs = pd.filter((d) => ADS_TYPES.includes(d.type));

  const socialDone = socialDelivs.some((d) => d.status === "approved" || d.status === "delivered");
  const designDone = designDelivs.some((d) => d.status === "approved" || d.status === "delivered");
  const adsDone = adsDelivs.some((d) => d.status === "approved" || d.status === "delivered");
  const socialActive = socialDelivs.length > 0;
  const designActive = designDelivs.length > 0;
  const adsActive = adsDelivs.length > 0;

  const inReview = pd.filter((d) => d.status === "in_review").length;
  const approved = pd.filter((d) => d.status === "approved" || d.status === "delivered").length;

  function evalStage(def: PipelineStageDef): EvaluatedPipelineStage {
    const id = def.id;

    if (id === "brand_hub") {
      if (hasBrandBrain) return { def, status: "complete" };
      return { def, status: "ready", detail: "Preencher Brand Brain no perfil do cliente" };
    }

    if (id === "strategy") {
      if (hasStrategyRoom) return { def, status: "complete" };
      if (!hasBrandBrain) return { def, status: "blocked", blockedBy: "Brand Brain incompleto" };
      return { def, status: "ready" };
    }

    if (id === "proposal") {
      if (proposalApproved) return { def, status: "complete" };
      if (proposalSent) return { def, status: "active", detail: "Aguardando aprovação do cliente" };
      return { def, status: "ready" };
    }

    if (id === "approval") {
      if (proposalApproved) return { def, status: "complete" };
      if (!proposalSent) return { def, status: "blocked", blockedBy: "Proposta não enviada" };
      return { def, status: "active", detail: "Cliente precisa aprovar no portal" };
    }

    if (id === "social_execution") {
      if (!hasSocialAgent) return { def, status: "not_applicable" };
      if (socialDone) return { def, status: "complete", detail: `${socialDelivs.length} entrega(s)` };
      if (socialActive) return { def, status: "active", detail: `${socialDelivs.length} entrega(s) em progresso` };
      if (!proposalApproved) return { def, status: "blocked", blockedBy: "Proposta não aprovada" };
      return { def, status: "ready" };
    }

    if (id === "design_execution") {
      if (!hasDesignAgent) return { def, status: "not_applicable" };
      if (designDone) return { def, status: "complete", detail: `${designDelivs.length} entrega(s)` };
      if (designActive) return { def, status: "active", detail: `${designDelivs.length} entrega(s) em progresso` };
      if (!proposalApproved) return { def, status: "blocked", blockedBy: "Proposta não aprovada" };
      if (hasSocialAgent && !socialActive) return { def, status: "blocked", blockedBy: "Social ainda não gerou briefs" };
      return { def, status: "ready" };
    }

    if (id === "ads_execution") {
      if (!hasAdsAgent) return { def, status: "not_applicable" };
      if (adsDone) return { def, status: "complete", detail: `${adsDelivs.length} entrega(s)` };
      if (adsActive) return { def, status: "active", detail: `${adsDelivs.length} entrega(s) em progresso` };
      if (!proposalApproved) return { def, status: "blocked", blockedBy: "Proposta não aprovada" };
      if (!hasStrategyRoom) return { def, status: "blocked", blockedBy: "Strategy Room não gerado" };
      return { def, status: "ready" };
    }

    if (id === "client_review") {
      if (approved >= pd.length && pd.length > 0) return { def, status: "complete", detail: `${approved} aprovadas` };
      if (inReview > 0) return { def, status: "active", detail: `${inReview} aguardando cliente` };
      if (!socialActive && !designActive && !adsActive) return { def, status: "blocked", blockedBy: "Nenhuma entrega gerada ainda" };
      return { def, status: "ready" };
    }

    if (id === "completion") {
      if (project.stage === "completed") return { def, status: "complete" };
      if (approved > 0 && inReview === 0 && pd.filter((d) => d.status === "draft").length === 0) {
        return { def, status: "ready", detail: `${approved} entrega(s) aprovadas` };
      }
      if (inReview > 0) return { def, status: "blocked", blockedBy: `${inReview} entrega(s) aguardando aprovação` };
      return { def, status: "blocked", blockedBy: "Entregas ainda não enviadas para revisão" };
    }

    return { def, status: "not_applicable" };
  }

  return PIPELINE_STAGE_DEFS
    .filter((def) => {
      // Filter out stages not relevant to this project
      if (def.agentId && !project.agents.includes(def.agentId)) return false;
      return true;
    })
    .map(evalStage);
}

// ─── Stage style helpers ──────────────────────────────────────────────────────

export const STAGE_STATUS_STYLE: Record<PipelineStageStatus, { dot: string; bg: string; text: string; label: string }> = {
  complete:       { dot: "#16A34A", bg: "bg-[#DCFCE7]", text: "text-[#16A34A]", label: "Concluído" },
  active:         { dot: "#D97706", bg: "bg-[#FEF3C7]", text: "text-[#D97706]", label: "Em andamento" },
  ready:          { dot: "#070A1F", bg: "bg-[#E6FBFA]", text: "text-[#070A1F]", label: "Pronto" },
  blocked:        { dot: "#DC2626", bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", label: "Bloqueado" },
  not_applicable: { dot: "#D0D0CC", bg: "bg-[#F0F0ED]", text: "text-[#9B9B95]", label: "N/A" },
};
