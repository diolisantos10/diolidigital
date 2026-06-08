// ─── Client Requests ──────────────────────────────────────────────────────────
// Represents a solicitation submitted by a client through the portal Briefing Room.
// Rule-based extraction (lib/agency/briefing-extractor.ts) populates the summary.
// Internal PM review surface: /agency/requests.
// ─────────────────────────────────────────────────────────────────────────────

export type ClientRequestStatus =
  | "new"
  | "under_review"
  | "proposal_pending"
  | "in_progress"
  | "waiting_client"
  | "approved"
  | "completed"
  | "rejected";

export type AttachmentStorageStatus = "local_only" | "uploaded" | "failed";

export interface RequestAttachment {
  id: string;
  requestId?: string;
  clientId: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  sizeBytes: number;
  source: "briefing_room";
  createdAt: string;
  previewUrl?: string;
  storageStatus: AttachmentStorageStatus;
}

export interface ExtractedRequestSummary {
  clientName?: string;
  segment?: string;
  services: string[];
  channels: string[];
  objectives: string[];
  quantities: string[];
  urgency?: string;
  suggestedDepartments: string[];
  missingInfo: string[];
}

export interface ProposalLineItem {
  service: string;
  description: string;
  unit: string;
  minPrice: number;
  maxPrice: number;
}

export interface BriefingAnalysis {
  processedAt: string;
  executiveSummary: string;
  clientGoal: string;
  diagnosedNeeds: string[];
  recommendedServices: string[];
  suggestedDeliverables: string[];
  departments: string[];
  missingInfo: string[];
  estimatedTimeline: string;
  priceRange: { min: number; max: number };
  lineItems: ProposalLineItem[];
  proposalDraft: string;
  nextQuestions: string[];
}

export interface ClientRequest {
  id: string;
  clientId: string;
  title: string;
  rawText: string;
  extractedSummary: ExtractedRequestSummary;
  suggestedDepartments: string[];
  missingInfo: string[];
  status: ClientRequestStatus;
  createdAt: string;
  updatedAt: string;
  source: "client_portal" | "public_briefing";
  // Prospect-only (source === "public_briefing")
  prospectName?: string;
  prospectEmail?: string;
  prospectPhone?: string;
  attachments: RequestAttachment[];
  linkedProjectId?: string;
  analysis?: BriefingAnalysis;
  // V2 conversational briefing fields
  conversationTranscript?: import("./briefing-conversation").ConvMessage[];
  v2Scope?: import("./briefing-conversation").BriefingScope;
  v2Estimate?: import("./briefing-conversation").LiveEstimate;
}

export const REQUEST_STATUS_LABEL: Record<ClientRequestStatus, string> = {
  new:              "Nova",
  under_review:     "Em Análise",
  proposal_pending: "Aguardando Proposta",
  in_progress:      "Em Andamento",
  waiting_client:   "Aguardando Cliente",
  approved:         "Aprovado",
  completed:        "Concluída",
  rejected:         "Recusada",
};

export const REQUEST_STATUS_STYLE: Record<ClientRequestStatus, { bg: string; text: string }> = {
  new:              { bg: "bg-[#EEF0FF]",  text: "text-[#5B5BD6]"  },
  under_review:     { bg: "bg-[#FEF3C7]",  text: "text-[#D97706]"  },
  proposal_pending: { bg: "bg-[#F0F0ED]",  text: "text-[#6B6B65]"  },
  in_progress:      { bg: "bg-[#DCFCE7]",  text: "text-[#16A34A]"  },
  waiting_client:   { bg: "bg-[#FEF3C7]",  text: "text-[#D97706]"  },
  approved:         { bg: "bg-[#DCFCE7]",  text: "text-[#15803D]"  },
  completed:        { bg: "bg-[#DCFCE7]",  text: "text-[#15803D]"  },
  rejected:         { bg: "bg-[#FEE2E2]",  text: "text-[#DC2626]"  },
};
