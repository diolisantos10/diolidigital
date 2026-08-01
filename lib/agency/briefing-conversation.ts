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
  // Deep-probe production fields (drive accuracy of the quote)
  hasVideomaker?: boolean;     // client has someone to shoot/edit video
  needsVideoProduction?: boolean; // Dioli must produce/edit video
  creativesReady?: boolean;    // brand has existing creatives/templates ready
  postingGoal?: string;        // what each post should drive (sales, authority…)
  hasReferences?: boolean;     // client provided visual/brand references
}

export interface TrafficScope {
  platforms: string[];
  monthlyAdBudget?: string;
}

export interface BrandingScope {
  requested: boolean;    // user explicitly asked for branding / logo / identity
  hasBrandBook: boolean; // user HAS a brand book — does NOT imply wanting branding
  wantsRebrand: boolean;
  deliverables?: string; // what they need: logo, paleta, tipografia, manual…
}

// Engagement type — how the client enters the agency.
//   monthly   = fixed monthly retainer for a defined scope
//   one_off   = single project with a start and end
//   umbrella  = ongoing partnership, indeterminate time, scope evolves
//              (the "guarda-chuva" — client lives under the agency umbrella)
//   unsure    = not yet decided
export type EngagementType = "monthly" | "one_off" | "umbrella" | "unsure";

// ── Negotiation (client-visible: only the final discounted price) ──────────────
export interface NegotiationState {
  discountPct?: number;       // discount the SDR granted
  discountReason?: string;    // client-facing justification (e.g. "compromisso anual")
  appliedLevers?: string[];   // internal lever ids used
}

// ── Main scope ────────────────────────────────────────────────────────────────
export interface BriefingScope {
  businessName?: string;
  segment?: string;
  targetAudience?: string;    // who the client sells to (ideal customer)
  objectives: string[];
  serviceMode?: EngagementType;
  wantsSocialMedia: boolean;
  social?: SocialScope;
  wantsPaidTraffic?: boolean;
  traffic?: TrafficScope;
  /** OPCIONAL, e a correção não é cosmética: o briefing que não fala de
   *  identidade visual simplesmente não traz este bloco. O tipo declarava
   *  obrigatório, o dado real vinha sem, e o `as` no meio do caminho escondia a
   *  diferença — até a proposta quebrar em produção com "Cannot read properties
   *  of undefined". Tipo que mente sobre o dado é pior que tipo ausente: dá a
   *  falsa segurança de que o compilador conferiu. */
  branding?: BrandingScope;
  budgetRange?: string;
  deadline?: string;
  // Qualification depth
  decisionMaker?: boolean;    // is the person the decision-maker?
  competitors?: string[];     // competitors / references the client admires
  negotiation?: NegotiationState;
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
  // Negotiated discount (client-visible). When set, the panel shows the
  // discounted total alongside the original. Margin/floor stay internal.
  discountPct?: number;
  discountReason?: string;
  discountedMin?: number;
  discountedMax?: number;
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
/** O bloco de identidade visual completo, com os padrões da casa.
 *
 *  Ganhou importância quando `branding` virou opcional no escopo: o bloco pode
 *  não existir, mas os três booleanos dele NÃO são opcionais — quem preenche,
 *  preenche inteiro. Use isto como base ao montar um `branding` parcial, em vez
 *  de espalhar `?? false` por aí: cada lugar que inventa o próprio default é um
 *  lugar que um dia vai inventar diferente. */
export function emptyBrandingScope(): BrandingScope {
  return { requested: false, hasBrandBook: false, wantsRebrand: false };
}

export function emptyScope(): BriefingScope {
  return { objectives: [], wantsSocialMedia: false, branding: emptyBrandingScope() };
}

export function emptyEstimate(): LiveEstimate {
  return { items: [], totalMin: 0, totalMax: 0, confidence: "none", missingForEstimate: [], included: [], notIncluded: [] };
}
