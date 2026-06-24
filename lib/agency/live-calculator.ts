// ─── Live Pricing Calculator V2 ───────────────────────────────────────────────
// Social Media is the flagship department: 5 isolated plans with a detailed
// feature matrix (posts, stories, reels, copy/design/calendar, reports,
// community). Paid traffic and visual identity are SEPARATE departments,
// priced as add-ons that stack on top of the social plan.
//
// Architecture note: each department is treated like its own business with its
// own catalogue — see lib/agency/service-catalog.ts. This file owns the social
// plans + the estimate math the briefing room renders in real time.
// ─────────────────────────────────────────────────────────────────────────────

import type { BriefingScope, LiveEstimate, EstimateItem, EstimateConfidence } from "./briefing-conversation";

// ── Social Media Plans ────────────────────────────────────────────────────────

export type SocialPackage = "essencial" | "starter" | "growth" | "pro" | "premium";

export type ReportLevel = "none" | "basic" | "advanced";
export type CommunityLevel = "none" | "basic" | "full";

export interface PackageDef {
  id: SocialPackage;
  label: string;
  postsPerMonth: number;
  storiesPerMonth: number;
  reelsPerMonth: number;   // reels included in the plan
  copy: boolean;           // copywriting (textos) included
  design: boolean;         // custom design / artes
  calendar: boolean;       // editorial calendar / strategy
  reports: ReportLevel;    // monthly metrics report
  community: CommunityLevel; // comment / DM management
  minPrice: number;
  maxPrice: number;
  description: string;
}

// Startup-friendly pricing — lowest viable rung of the market.
export const SOCIAL_PACKAGES: PackageDef[] = [
  {
    id: "essencial",
    label: "Plano Essencial",
    postsPerMonth: 4,
    storiesPerMonth: 4,
    reelsPerMonth: 0,
    copy: true,
    design: true,
    calendar: false,
    reports: "none",
    community: "none",
    minPrice: 400,
    maxPrice: 600,
    description: "4 posts + 4 stories/mês — presença mínima para começar",
  },
  {
    id: "starter",
    label: "Plano Starter",
    postsPerMonth: 8,
    storiesPerMonth: 8,
    reelsPerMonth: 1,
    copy: true,
    design: true,
    calendar: true,
    reports: "basic",
    community: "none",
    minPrice: 700,
    maxPrice: 1100,
    description: "8 posts + 8 stories + 1 reel/mês — primeiro passo consistente",
  },
  {
    id: "growth",
    label: "Plano Growth",
    postsPerMonth: 12,
    storiesPerMonth: 16,
    reelsPerMonth: 2,
    copy: true,
    design: true,
    calendar: true,
    reports: "basic",
    community: "basic",
    minPrice: 1200,
    maxPrice: 1800,
    description: "12 posts + 16 stories + 2 reels/mês — ritmo constante",
  },
  {
    id: "pro",
    label: "Plano Pro",
    postsPerMonth: 20,
    storiesPerMonth: 30,
    reelsPerMonth: 4,
    copy: true,
    design: true,
    calendar: true,
    reports: "advanced",
    community: "full",
    minPrice: 2000,
    maxPrice: 3200,
    description: "20 posts + 30 stories + 4 reels/mês — presença forte",
  },
  {
    id: "premium",
    label: "Plano Premium",
    postsPerMonth: 30,
    storiesPerMonth: 45,
    reelsPerMonth: 8,
    copy: true,
    design: true,
    calendar: true,
    reports: "advanced",
    community: "full",
    minPrice: 3500,
    maxPrice: 5000,
    description: "30 posts + 45 stories + 8 reels/mês — operação de marca completa",
  },
];

export function detectPackage(postsPerMonth: number): SocialPackage {
  if (postsPerMonth <= 4)  return "essencial";
  if (postsPerMonth <= 8)  return "starter";
  if (postsPerMonth <= 14) return "growth";
  if (postsPerMonth <= 22) return "pro";
  return "premium";
}

export function getPackageDef(id: SocialPackage): PackageDef {
  return SOCIAL_PACKAGES.find((p) => p.id === id)!;
}

// Human-readable labels for the matrix levels.
export const REPORT_LABEL: Record<ReportLevel, string> = {
  none: "—",
  basic: "Mensal",
  advanced: "Avançado",
};
export const COMMUNITY_LABEL: Record<CommunityLevel, string> = {
  none: "—",
  basic: "Básica",
  full: "Completa",
};

// ── Add-on prices (separate departments) ──────────────────────────────────────

const P = {
  reel:         { min:  150, max:  400 }, // extra reel beyond the plan
  trafficMgmt:  { min:  500, max: 1200 }, // paid-traffic management fee
  branding:     { min: 1200, max: 2500 }, // visual identity
  brandingFull: { min: 2000, max: 4000 }, // full brand book / rebrand
};

// ── Main export ───────────────────────────────────────────────────────────────

export function computeEstimate(scope: BriefingScope): LiveEstimate {
  const items: EstimateItem[] = [];
  const included: string[]    = [];
  const notIncluded: string[] = [];
  const missing: string[]     = [];
  let totalMin = 0;
  let totalMax = 0;

  // ── Social Media (flagship department) ──────────────────────────────────────
  if (scope.wantsSocialMedia) {
    const s = scope.social;

    if (s?.postsPerWeek === undefined) {
      missing.push("Frequência de posts por semana");
    } else {
      const postsPerMonth = s.postsPerWeek * 4;
      const pkgId = detectPackage(postsPerMonth);
      const pkg   = getPackageDef(pkgId);

      items.push({
        label:    pkg.label,
        detail:   `${pkg.postsPerMonth} posts + ${pkg.storiesPerMonth} stories${pkg.reelsPerMonth > 0 ? ` + ${pkg.reelsPerMonth} reels` : ""}/mês`,
        minPrice: pkg.minPrice,
        maxPrice: pkg.maxPrice,
        unit:     "mês",
      });
      totalMin += pkg.minPrice;
      totalMax += pkg.maxPrice;

      included.push(`${pkg.postsPerMonth} posts/mês`);
      included.push(`${pkg.storiesPerMonth} stories/mês`);
      if (pkg.reelsPerMonth > 0) included.push(`${pkg.reelsPerMonth} reels/mês (edição)`);
      if (pkg.copy)     included.push("Copywriting (textos)");
      if (pkg.design)   included.push("Design personalizado das artes");
      if (pkg.calendar) included.push("Calendário editorial e estratégia");
      if (pkg.reports !== "none")
        included.push(pkg.reports === "advanced" ? "Relatório mensal avançado" : "Relatório mensal de métricas");
      if (pkg.community !== "none")
        included.push(pkg.community === "full" ? "Gestão de comunidade completa" : "Gestão de comunidade (básica)");

      // Client-side overrides
      if (s.needsCopy === false) notIncluded.push("Copy — fornecida pelo cliente");
      if (s.hasPhotos === false) notIncluded.push("Produção fotográfica (orçar separado)");

      // Extra reels beyond what the plan includes → add-on
      if (s.reelsPerMonth !== undefined && s.reelsPerMonth > pkg.reelsPerMonth) {
        const extra = s.reelsPerMonth - pkg.reelsPerMonth;
        const rMin  = extra * P.reel.min;
        const rMax  = extra * P.reel.max;
        items.push({
          label:    `Reels extras (${extra}/mês)`,
          detail:   "Além do incluso no plano",
          minPrice: rMin,
          maxPrice: rMax,
          unit:     "mês",
        });
        totalMin += rMin;
        totalMax += rMax;
        included.push(`${s.reelsPerMonth} reels/mês no total`);
      }
    }
  }

  // ── Paid Traffic (separate department) ──────────────────────────────────────
  if (scope.wantsPaidTraffic) {
    if (!scope.traffic?.monthlyAdBudget) {
      missing.push("Verba mensal de anúncios");
    } else {
      items.push({
        label:    "Tráfego Pago — gestão",
        detail:   "Setup + gerenciamento mensal",
        minPrice: P.trafficMgmt.min,
        maxPrice: P.trafficMgmt.max,
        unit:     "mês",
      });
      totalMin += P.trafficMgmt.min;
      totalMax += P.trafficMgmt.max;
      included.push("Criação e gestão de campanhas pagas");
      included.push("Otimização e relatórios mensais");
      notIncluded.push(`Verba de mídia: ${scope.traffic.monthlyAdBudget} (pago direto ao Google/Meta)`);
    }
  }

  // ── Visual Identity (separate department) — only if requested ───────────────
  if (scope.branding.requested) {
    const bp = scope.branding.wantsRebrand ? P.brandingFull : P.branding;
    items.push({
      label:    "Identidade Visual",
      detail:   scope.branding.wantsRebrand ? "Rebranding completo" : "Criação de identidade visual",
      minPrice: bp.min,
      maxPrice: bp.max,
      unit:     "projeto",
    });
    totalMin += bp.min;
    totalMax += bp.max;
    included.push("Identidade visual completa");
  }

  // ── Confidence ────────────────────────────────────────────────────────────
  let confidence: EstimateConfidence = "none";
  if (totalMin > 0) {
    if (missing.length === 0)     confidence = "high";
    else if (missing.length <= 2) confidence = "medium";
    else                           confidence = "low";
  }

  return { items, totalMin, totalMax, confidence, missingForEstimate: missing, included, notIncluded };
}
