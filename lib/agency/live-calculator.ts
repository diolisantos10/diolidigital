// ─── Live Pricing Calculator V2 ───────────────────────────────────────────────
// Package-based social media pricing (Starter / Growth / Pro).
// Reels, paid traffic, and branding are add-ons.
// No pricing without minimum confirmed quantities.
// ─────────────────────────────────────────────────────────────────────────────

import type { BriefingScope, LiveEstimate, EstimateItem, EstimateConfidence } from "./briefing-conversation";

// ── Social Media Packages ─────────────────────────────────────────────────────

export type SocialPackage = "starter" | "growth" | "pro";

export interface PackageDef {
  id: SocialPackage;
  label: string;
  postsPerMonth: number;
  storiesPerMonth: number;
  minPrice: number;
  maxPrice: number;
  description: string;
}

export const SOCIAL_PACKAGES: PackageDef[] = [
  {
    id: "starter",
    label: "Plano Starter",
    postsPerMonth: 8,
    storiesPerMonth: 8,
    minPrice: 700,
    maxPrice: 1100,
    description: "8 posts + 8 stories/mês — ideal para começar",
  },
  {
    id: "growth",
    label: "Plano Growth",
    postsPerMonth: 12,
    storiesPerMonth: 16,
    minPrice: 1200,
    maxPrice: 1800,
    description: "12 posts + 16 stories/mês — ritmo constante",
  },
  {
    id: "pro",
    label: "Plano Pro",
    postsPerMonth: 20,
    storiesPerMonth: 30,
    minPrice: 2000,
    maxPrice: 3200,
    description: "20 posts + 30 stories/mês — presença forte",
  },
];

export function detectPackage(postsPerMonth: number): SocialPackage {
  if (postsPerMonth <= 8)  return "starter";
  if (postsPerMonth <= 15) return "growth";
  return "pro";
}

export function getPackageDef(id: SocialPackage): PackageDef {
  return SOCIAL_PACKAGES.find((p) => p.id === id)!;
}

// ── Add-on prices ─────────────────────────────────────────────────────────────

const P = {
  reel:         { min:  150, max:  400 }, // editing from client footage
  trafficMgmt:  { min:  500, max: 1200 }, // monthly management fee
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

  // ── Social Media ──────────────────────────────────────────────────────────
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
        detail:   `${postsPerMonth} posts + ${pkg.storiesPerMonth} stories/mês`,
        minPrice: pkg.minPrice,
        maxPrice: pkg.maxPrice,
        unit:     "mês",
      });
      totalMin += pkg.minPrice;
      totalMax += pkg.maxPrice;

      included.push(`${postsPerMonth} posts/mês`);
      included.push(`${pkg.storiesPerMonth} stories/mês`);
      included.push("Estratégia e calendário editorial");
      included.push("Publicação e agendamento");

      if (s.platforms?.length) included.push(`Canais: ${s.platforms.join(", ")}`);

      if (s.needsCopy !== undefined) {
        if (s.needsCopy) included.push("Criação de textos (copy)");
        else notIncluded.push("Copy (fornecido pelo cliente)");
      }

      if (s.hasPhotos !== undefined && !s.hasPhotos) {
        notIncluded.push("Produção fotográfica (orçar separado)");
      }

      // Reels add-on
      if (s.reelsPerMonth === undefined) {
        missing.push("Quantidade de reels/mês");
      } else if (s.reelsPerMonth > 0) {
        const rMin = s.reelsPerMonth * P.reel.min;
        const rMax = s.reelsPerMonth * P.reel.max;
        items.push({
          label:    `Reels (${s.reelsPerMonth}/mês)`,
          detail:   "Edição a partir de material do cliente",
          minPrice: rMin,
          maxPrice: rMax,
          unit:     "mês",
        });
        totalMin += rMin;
        totalMax += rMax;
        included.push(`${s.reelsPerMonth} reels/mês — edição incluída`);
        notIncluded.push("Captação / filmagem (orçar separado)");
      } else {
        notIncluded.push("Reels (não incluído neste plano)");
      }
    }
  }

  // ── Paid Traffic ──────────────────────────────────────────────────────────
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

  // ── Branding — only if explicitly requested ───────────────────────────────
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
