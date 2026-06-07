// ─── Live pricing calculator ───────────────────────────────────────────────────
// Pure function — no side effects. Computes a LiveEstimate from a BriefingScope.
// Only prices services when required quantities are known. If quantities are
// missing, returns missingForEstimate so the UI can prompt the user.
// ─────────────────────────────────────────────────────────────────────────────

import type { BriefingScope, LiveEstimate, EstimateItem, EstimateConfidence } from "./briefing-conversation";

// ── Pricing table ─────────────────────────────────────────────────────────────

const P = {
  socialBase:    { min: 1500, max: 2500 }, // management base fee
  postPerMonth:  { min:   80, max:  180 }, // per feed post
  storiesUp16:   { min:  400, max:  800 }, // up to 16 stories/month
  stories17to40: { min:  800, max: 1500 }, // 17–40 stories/month
  reelPerMonth:  { min:  250, max:  600 }, // per reel (script + edit, no filming)
  trafficMgmt:   { min:  700, max: 2000 }, // paid traffic management/month
  trafficSetup:  { min:  800, max: 1500 }, // one-time setup (amortised)
  branding:      { min: 3000, max: 8000 }, // full branding / rebrand
};

// ── Main export ───────────────────────────────────────────────────────────────

export function computeEstimate(scope: BriefingScope): LiveEstimate {
  const items: EstimateItem[]  = [];
  const included: string[]     = [];
  const notIncluded: string[]  = [];
  const missing: string[]      = [];
  let totalMin = 0;
  let totalMax = 0;

  // ── Social Media ────────────────────────────────────────────────────────────
  if (scope.wantsSocialMedia) {
    const s = scope.social;

    if (s?.postsPerWeek === undefined) {
      missing.push("Frequência de posts (quantos por semana)");
    }

    if (s?.postsPerWeek !== undefined) {
      // Base management
      items.push({ label: "Gestão Social Media", detail: "Estratégia, planejamento e publicação", minPrice: P.socialBase.min, maxPrice: P.socialBase.max, unit: "mês" });
      totalMin += P.socialBase.min; totalMax += P.socialBase.max;
      included.push("Estratégia e planejamento editorial");
      included.push("Publicação e agendamento");

      // Feed posts
      const postsPerMonth = s.postsPerWeek * 4;
      const pMin = postsPerMonth * P.postPerMonth.min;
      const pMax = postsPerMonth * P.postPerMonth.max;
      items.push({ label: "Criação de posts", detail: `${postsPerMonth} posts/mês`, minPrice: pMin, maxPrice: pMax, unit: "mês" });
      totalMin += pMin; totalMax += pMax;
      included.push(`${postsPerMonth} posts para feed`);

      // Stories
      if (s.storiesPerWeek === undefined) {
        missing.push("Frequência de stories");
      } else if (s.storiesPerWeek > 0) {
        const storiesPerMonth = s.storiesPerWeek * 4;
        const sPrice = storiesPerMonth <= 16 ? P.storiesUp16 : P.stories17to40;
        items.push({ label: "Stories", detail: `${storiesPerMonth} stories/mês`, minPrice: sPrice.min, maxPrice: sPrice.max, unit: "mês" });
        totalMin += sPrice.min; totalMax += sPrice.max;
        included.push(`${storiesPerMonth} stories/mês`);
      }

      // Reels
      if (s.reelsPerMonth === undefined) {
        missing.push("Quantidade de reels/mês");
      } else if (s.reelsPerMonth > 0) {
        const rMin = s.reelsPerMonth * P.reelPerMonth.min;
        const rMax = s.reelsPerMonth * P.reelPerMonth.max;
        items.push({ label: "Reels", detail: `${s.reelsPerMonth} reels/mês (roteiro + edição)`, minPrice: rMin, maxPrice: rMax, unit: "mês" });
        totalMin += rMin; totalMax += rMax;
        included.push(`${s.reelsPerMonth} reels/mês (sem filmagem)`);
        notIncluded.push("Captação / filmagem (orçar separado)");
      }

      // Photos
      if (s.hasPhotos === undefined) {
        missing.push("Disponibilidade de fotos / vídeos");
      } else if (!s.hasPhotos) {
        notIncluded.push("Produção fotográfica (orçar separado)");
      }

      // Copy
      if (s.needsCopy !== undefined) {
        if (s.needsCopy) included.push("Criação de textos (copy)");
        else notIncluded.push("Copy (fornecido pelo cliente)");
      }
    }

    // Platforms note
    if (s?.platforms?.length) included.push(`Canais: ${s.platforms.join(", ")}`);
  }

  // ── Paid Traffic ────────────────────────────────────────────────────────────
  if (scope.wantsPaidTraffic) {
    if (!scope.traffic?.monthlyAdBudget) {
      missing.push("Verba mensal de anúncios");
    } else {
      items.push({ label: "Tráfego Pago — gestão", detail: "Setup + gerenciamento mensal", minPrice: P.trafficMgmt.min, maxPrice: P.trafficMgmt.max, unit: "mês" });
      totalMin += P.trafficMgmt.min; totalMax += P.trafficMgmt.max;
      included.push("Gestão de campanhas pagas");
      notIncluded.push(`Verba de mídia: ${scope.traffic.monthlyAdBudget} (pago direto ao Google/Meta)`);
    }
  }

  // ── Branding — only if explicitly requested ─────────────────────────────────
  if (scope.branding.requested) {
    items.push({ label: "Identidade Visual", detail: "Criação de marca / rebranding", minPrice: P.branding.min, maxPrice: P.branding.max, unit: "projeto" });
    totalMin += P.branding.min; totalMax += P.branding.max;
    included.push("Identidade visual completa");
  }

  // ── Confidence ───────────────────────────────────────────────────────────────
  let confidence: EstimateConfidence = "none";
  if (totalMin > 0) {
    if (missing.length === 0) confidence = "high";
    else if (missing.length <= 2) confidence = "medium";
    else confidence = "low";
  }

  return { items, totalMin, totalMax, confidence, missingForEstimate: missing, included, notIncluded };
}
