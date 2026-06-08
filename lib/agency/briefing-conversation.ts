// ─── Briefing Conversation V2 types ──────────────────────────────────────────
// Used by the conversational SDR Briefing Room, question engine, and live
// calculator. Pure data — no UI or side effects.
// ─────────────────────────────────────────────────────────────────────────────

// ── Message ───────────────────────────────────────────────────────────────────
export interface ConvMessage {
  id: string;
  role: "assistant" | "client" | "system";
  text: string;
  createdAt: string;
}

// ── Scope sub-types ───────────────────────────────────────────────────────────
export interface SocialScope {
  platforms: string[];
  postsPerWeek?: number;
  storiesPerWeek?: number;
  reelsPerMonth?: number;
  needsCopy?: boolean;
  hasPhotos?: boolean;
}

export interface TrafficScope {
  platforms: string[];
  monthlyAdBudget?: string;
}

export interface BrandingScope {
  requested: boolean;    // user explicitly asked for branding / logo / identity
  hasBrandBook: boolean; // user HAS a brand book — does NOT imply wanting branding
  wantsRebrand: boolean;
}

// ── Main scope ────────────────────────────────────────────────────────────────
export interface BriefingScope {
  businessName?: string;
  segment?: string;
  objectives: string[];
  serviceMode?: "monthly" | "one_off" | "unsure";
  wantsSocialMedia: boolean;
  social?: SocialScope;
  wantsPaidTraffic?: boolean;
  traffic?: TrafficScope;
  branding: BrandingScope;
  budgetRange?: string;
  deadline?: string;
  // Prospect-only fields (public /briefing flow)
  prospectName?: string;
  prospectEmail?: string;
  prospectPhone?: string;
}

// ── Live estimate ─────────────────────────────────────────────────────────────
export interface EstimateItem {
  label: string;
  detail: string;
  minPrice: number;
  maxPrice: number;
  unit: string;
}

export type EstimateConfidence = "none" | "low" | "medium" | "high";

export interface LiveEstimate {
  items: EstimateItem[];
  totalMin: number;
  totalMax: number;
  confidence: EstimateConfidence;
  missingForEstimate: string[];
  included: string[];
  notIncluded: string[];
}

// ── Conversation state ────────────────────────────────────────────────────────
export interface ConvState {
  messages: ConvMessage[];
  scope: BriefingScope;
  answeredQIds: string[];
  isFirstMessage: boolean;
  estimate: LiveEstimate;
  canSubmit: boolean;
}

// ── Constructors ──────────────────────────────────────────────────────────────
export function emptyBrandingScope(): BrandingScope {
  return { requested: false, hasBrandBook: false, wantsRebrand: false };
}

export function emptyScope(): BriefingScope {
  return { objectives: [], wantsSocialMedia: false, branding: emptyBrandingScope() };
}

export function emptyEstimate(): LiveEstimate {
  return { items: [], totalMin: 0, totalMax: 0, confidence: "none", missingForEstimate: [], included: [], notIncluded: [] };
}
