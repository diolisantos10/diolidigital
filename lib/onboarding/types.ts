// ─── Onboarding System Types ──────────────────────────────────────────────────
//
// Shared contracts for the three onboarding layers:
//   1. GuidedTour       — step-by-step spotlight tour over real UI elements
//   2. InfoTooltip      — click-to-open ⓘ explanations on cards/labels
//   3. ExplainScreen    — drawer that explains the current screen state
//
// Every new module (Lab, CRM, Atendimento, Campanhas, Analytics, Agentes,
// Departamentos, Build OS, …) must ship with all three. See lib/onboarding/README.md.
// ─────────────────────────────────────────────────────────────────────────────

export interface TourStep {
  /** CSS selector of the element to highlight, e.g. '[data-tour="training-stats"]' */
  target: string;
  title: string;
  body: string;
}

export interface TourDefinition {
  /** Unique page id — persisted as localStorage key `tour_completed_[id]` */
  id: string;
  steps: TourStep[];
}

export interface ExplanationSection {
  title: string;
  items: string[];
}

/** Structured output of an "Explique esta tela" builder. */
export interface ScreenExplanation {
  /** Lead paragraph summarizing the current state of the screen. */
  summary: string;
  /** "O que existe nesta tela" / "O que é mais importante" etc. */
  sections: ExplanationSection[];
  /** Items that need the user's attention right now. */
  attention: string[];
  /** Ordered list of what to do first. */
  firstSteps: string[];
}
